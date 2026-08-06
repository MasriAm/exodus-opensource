import * as duckdb from "@duckdb/duckdb-wasm/dist/duckdb-browser";
import * as Comlink from "comlink";

import type { NormalizedRow } from "../lib/schema";
import { MAX_PARSER_BATCH_SIZE } from "../parsers/batch";
import { ZipEntryMap } from "../lib/zip";
import {
  createCsvExportBlob,
  createJsonExportBlob,
  createSpreadsheetExportBlob,
  getExportCsvCopySql,
  getExportSelectSql,
  SPREADSHEET_ROW_LIMIT,
} from "../lib/db/export";
import {
  emptyRowCounts,
  isExportFormat,
  isExportTable,
  isQueryName,
} from "../lib/db/helpers";
import {
  getBatchInsertParameters,
  getBatchInsertSql,
} from "../lib/db/ingest-sql";
import { executeNamedQuery } from "../lib/db/queries";
import { asSqlRows } from "../lib/db/row-values";
import {
  BEGIN_ARCHIVE_REPLACEMENT_SQL,
  CLEAR_ARCHIVE_SQL,
  COMMIT_ARCHIVE_REPLACEMENT_SQL,
  INITIALIZATION_SQL,
  POST_INGEST_INDEX_SQL,
  ROLLBACK_ARCHIVE_REPLACEMENT_SQL,
} from "../lib/db/schema-sql";
import type {
  ExportFormat,
  ExportTable,
  IngestApi,
  IngestProgress,
  IngestProgressCallback,
  IngestSummary,
  QueryArgs,
  QueryName,
  QueryParamsByName,
  QueryResultByName,
  RowCounts,
} from "../lib/db/types";
import { detectParser } from "../parsers/registry";
import type { ParserProgress } from "../parsers/types";

interface DatabaseState {
  database: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
}

interface ActiveArchive {
  entries: ZipEntryMap;
  parserId: string;
  archiveName: string;
}

class PublicWorkerError extends Error {}

let databasePromise: Promise<DatabaseState> | null = null;
let activeArchives: ActiveArchive[] = [];
let operationTail: Promise<void> = Promise.resolve();

const WORKER_OP_TIMEOUT_MS = 45_000;
const WORKER_HEAVY_TIMEOUT_MS = 90_000;
const WORKER_EXPORT_TIMEOUT_MS = 5 * 60_000;
const WORKER_INGEST_TIMEOUT_MS = 10 * 60_000;
let exportFileSequence = 0;

function withWorkerTimeout<Result>(
  operation: () => Promise<Result>,
  label: string,
  timeoutMs: number,
): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PublicWorkerError(`${label} timed out inside the worker.`));
    }, timeoutMs);
    operation().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function runExclusive<Result>(
  operation: () => Promise<Result>,
  options?: { label?: string; timeoutMs?: number },
): Promise<Result> {
  const label = options?.label ?? "worker operation";
  const timeoutMs = options?.timeoutMs ?? WORKER_OP_TIMEOUT_MS;
  const result = operationTail.then(
    () => withWorkerTimeout(operation, label, timeoutMs),
    () => withWorkerTimeout(operation, label, timeoutMs),
  );
  operationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function getDatabase(): Promise<DatabaseState> {
  if (!databasePromise) {
    const pending = initializeDatabase();
    databasePromise = pending;
    void pending.catch(() => {
      if (databasePromise === pending) {
        databasePromise = null;
      }
    });
  }
  return databasePromise;
}

/**
 * DuckDB keeps JSON functions in an extension it would otherwise fetch from
 * extensions.duckdb.org — impossible here (CSP `connect-src 'self'`, offline
 * first). The signed binary is mirrored under `public/duckdb/extensions`.
 */
async function loadJsonExtension(
  connection: duckdb.AsyncDuckDBConnection,
): Promise<void> {
  const repository = new URL(
    "/duckdb/extensions",
    globalThis.location.origin,
  ).toString();
  try {
    await connection.query(
      `SET custom_extension_repository='${repository}'`,
    );
    await connection.query("INSTALL json");
    await connection.query("LOAD json");
  } catch (error: unknown) {
    console.error(
      "The self-hosted DuckDB json extension could not be loaded.",
      error,
    );
  }
}

async function initializeDatabase(): Promise<DatabaseState> {
  const asset = (fileName: string): string =>
    new URL(`/duckdb/${fileName}`, globalThis.location.origin).toString();
  const bundles: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: asset("duckdb-mvp.wasm"),
      mainWorker: asset("duckdb-browser-mvp.worker.js"),
    },
    eh: {
      mainModule: asset("duckdb-eh.wasm"),
      mainWorker: asset("duckdb-browser-eh.worker.js"),
    },
  };
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) {
    throw new Error("DuckDB did not select a worker bundle.");
  }

  const databaseWorker = new Worker(bundle.mainWorker);
  const database = new duckdb.AsyncDuckDB(
    new duckdb.VoidLogger(),
    databaseWorker,
  );
  let connection: duckdb.AsyncDuckDBConnection | null = null;

  try {
    await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await database.open({
      query: {
        castBigIntToDouble: true,
        castTimestampToDate: false,
      },
    });
    connection = await database.connect();
    await loadJsonExtension(connection);
    for (const sql of INITIALIZATION_SQL) {
      await connection.query(sql);
    }
    return { database, connection };
  } catch (error: unknown) {
    if (connection) {
      try {
        await connection.close();
      } catch (closeError: unknown) {
        console.error("Failed to close DuckDB after initialization.", closeError);
      }
    }
    try {
      await database.terminate();
    } catch (terminateError: unknown) {
      console.error(
        "Failed to terminate DuckDB after initialization.",
        terminateError,
      );
    }
    throw error;
  }
}

function progressReporter(
  callback: IngestProgressCallback,
): { report: (progress: IngestProgress) => void } {
  let delivery = Promise.resolve();
  const report = (progress: IngestProgress): void => {
    const snapshot: IngestProgress = {
      ...progress,
      rows: { ...progress.rows },
    };
    delivery = delivery
      .then(() => callback(snapshot))
      .catch((error: unknown) => {
        console.error("The ingest progress callback failed.", error);
      });
  };
  return { report };
}

function reportParserProgress(
  report: (progress: IngestProgress) => void,
  counts: RowCounts,
  progress: ParserProgress,
): void {
  report({
    stage: "parsing",
    done: progress.done,
    total: null,
    rows: counts,
    label: progress.label,
  });
}

async function detectArchive(file: File): Promise<string | null> {
  if (!(file instanceof Blob) || typeof file.name !== "string") {
    return null;
  }
  let candidate: ZipEntryMap | null = null;
  try {
    candidate = await ZipEntryMap.open(file);
    const parser = detectParser(candidate.paths());
    return parser ? parser.displayName : null;
  } catch {
    return null;
  } finally {
    if (candidate) {
      await closeCandidate(candidate);
    }
  }
}

async function ingestArchive(
  file: File,
  onProgress: IngestProgressCallback,
  options?: { append?: boolean }
): Promise<IngestSummary> {
  if (!(file instanceof Blob) || typeof file.name !== "string") {
    throw new PublicWorkerError("Choose a ZIP file to import.");
  }
  if (typeof onProgress !== "function") {
    throw new PublicWorkerError("An ingest progress callback is required.");
  }

  const startedAt = performance.now();
  const counts = emptyRowCounts();
  const progress = progressReporter(onProgress);
  progress.report({
    stage: "initializing",
    done: 0,
    total: null,
    rows: counts,
    label: "Starting the private database…",
  });

  let database: DatabaseState;
  try {
    database = await getDatabase();
  } catch (error: unknown) {
    console.error("DuckDB initialization failed.", error);
    throw new PublicWorkerError(
      "The private database could not start. Reload and try again.",
    );
  }

  progress.report({
    stage: "opening",
    done: 0,
    total: null,
    rows: counts,
    label: "Opening the ZIP archive…",
  });

  let candidate: ZipEntryMap;
  try {
    candidate = await ZipEntryMap.open(file);
  } catch (error: unknown) {
    console.error("ZIP opening failed.", error);
    throw new PublicWorkerError(
      "This ZIP could not be opened. It may be damaged or password-protected.",
    );
  }

  progress.report({
    stage: "detecting",
    done: 0,
    total: candidate.paths().length,
    rows: counts,
    label: "Detecting the export format…",
  });

  const parser = detectParser(candidate.paths());
  if (!parser) {
    await closeCandidate(candidate);
    throw new PublicWorkerError(
      "This archive is not a recognized Instagram or WhatsApp export.",
    );
  }

  const append = options?.append === true;
  const replacedExistingArchive = !append && activeArchives.length > 0;
  let transactionOpen = false;
  try {
    await database.connection.query(BEGIN_ARCHIVE_REPLACEMENT_SQL);
    transactionOpen = true;
    
    if (!append) {
      for (const sql of CLEAR_ARCHIVE_SQL) {
        await database.connection.query(sql);
      }
    }

    await parser.parse(
      candidate,
      async (batch) => {
        await loadNormalizedBatch(database, batch, counts);
        progress.report({
          stage: "loading",
          done: counts.messages + counts.media + counts.events,
          total: null,
          rows: counts,
          label: "Loading private data…",
        });
      },
      (parserProgress) => {
        reportParserProgress(progress.report, counts, parserProgress);
      },
    );

    progress.report({
      stage: "finalizing",
      done: counts.messages + counts.media + counts.events,
      total: counts.messages + counts.media + counts.events,
      rows: counts,
      label: "Finishing the import…",
    });
    await database.connection.query(COMMIT_ARCHIVE_REPLACEMENT_SQL);
    transactionOpen = false;
    for (const sql of POST_INGEST_INDEX_SQL) {
      await database.connection.query(sql);
    }
  } catch (error: unknown) {
    console.error(`Import with parser ${parser.id} failed.`, error);
    if (transactionOpen) {
      try {
        await database.connection.query(ROLLBACK_ARCHIVE_REPLACEMENT_SQL);
      } catch (rollbackError: unknown) {
        console.error("DuckDB rollback failed.", rollbackError);
      }
    }
    await closeCandidate(candidate);
    if (error instanceof PublicWorkerError) {
      throw error;
    }
    throw new PublicWorkerError(
      "This archive contains data that could not be safely imported.",
    );
  }

  if (!append) {
      const previousArchives = activeArchives;
      activeArchives = [{
        entries: candidate,
        parserId: parser.id,
        archiveName: file.name,
      }];
      
      for (const previous of previousArchives) {
        try {
          await previous.entries.close();
        } catch (error: unknown) {
          console.error("A previous ZIP archive could not be closed.", error);
        }
      }
  } else {
      activeArchives.push({
        entries: candidate,
        parserId: parser.id,
        archiveName: file.name,
      });
  }

  return {
    archiveName: file.name,
    platform: parser.id,
    parserId: parser.id,
    counts: { ...counts },
    elapsedMs: Math.max(0, performance.now() - startedAt),
    replacedExistingArchive,
  };
}

/**
 * Parsers validate each row through ValidatedBatchEmitter before emit.
 * The worker only enforces batch size and loads into DuckDB.
 */
async function loadNormalizedBatch(
  database: DatabaseState,
  batch: NormalizedRow[],
  counts: RowCounts,
): Promise<void> {
  if (batch.length > MAX_PARSER_BATCH_SIZE) {
    throw new Error(
      `Parser batch contained ${batch.length} rows; maximum is ${MAX_PARSER_BATCH_SIZE}.`,
    );
  }
  if (batch.length === 0) {
    return;
  }

  const messages = batch.filter(
    (row): row is Extract<NormalizedRow, { table: "messages" }> =>
      row.table === "messages",
  );
  const media = batch.filter(
    (row): row is Extract<NormalizedRow, { table: "media" }> =>
      row.table === "media",
  );
  const events = batch.filter(
    (row): row is Extract<NormalizedRow, { table: "events" }> =>
      row.table === "events",
  );

  await loadTableBatch(database, "messages", messages);
  counts.messages += messages.length;
  await loadTableBatch(database, "media", media);
  counts.media += media.length;
  await loadTableBatch(database, "events", events);
  counts.events += events.length;
}

async function loadTableBatch(
  database: DatabaseState,
  table: ExportTable,
  rows: NormalizedRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const statement = await database.connection.prepare(
    getBatchInsertSql(table, rows.length),
  );
  try {
    await statement.query(...getBatchInsertParameters(table, rows));
  } finally {
    await statement.close();
  }
}

async function closeCandidate(candidate: ZipEntryMap): Promise<void> {
  try {
    await candidate.close();
  } catch (error: unknown) {
    console.error("A rejected ZIP archive could not be closed.", error);
  }
}

async function runQuery<Name extends QueryName>(
  name: Name,
  params: QueryParamsByName[Name],
): Promise<QueryResultByName[Name]> {
  if (!isQueryName(name)) {
    throw new PublicWorkerError("Unknown private database query.");
  }
  const database = await getDatabase();
  try {
    return await executeNamedQuery(database.connection, name, params);
  } catch (error: unknown) {
    console.error(`Named query ${name} failed.`, error);
    throw new PublicWorkerError(
      "The private database could not complete that request.",
    );
  }
}

async function readMediaBlob(zipPath: string): Promise<Blob> {
  if (typeof zipPath !== "string" || zipPath.trim().length === 0) {
    throw new PublicWorkerError("Choose a valid media item.");
  }
  if (activeArchives.length === 0) {
    throw new PublicWorkerError("Import an archive before opening media.");
  }
  
  let targetArchive: ActiveArchive | undefined;
  for (const archive of activeArchives) {
    if (archive.entries.has(zipPath)) {
      targetArchive = archive;
      break;
    }
  }
  
  if (!targetArchive) {
    throw new PublicWorkerError("That media file could not be read from the current archives.");
  }
  
  try {
    return await targetArchive.entries.readBlob(zipPath);
  } catch (error: unknown) {
    console.error(
      `Media could not be read from ${targetArchive.archiveName}.`,
      error,
    );
    throw new PublicWorkerError(
      "That media file could not be read from the current archive.",
    );
  }
}

async function countTableRows(
  database: DatabaseState,
  table: ExportTable,
): Promise<number> {
  const result = await database.connection.query(
    `SELECT CAST(COUNT(*) AS DOUBLE) AS n FROM ${table}`,
  );
  const rows = asSqlRows(result.toArray());
  const value = rows[0]?.n;
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function exportCsvViaCopy(
  database: DatabaseState,
  table: ExportTable,
): Promise<Blob> {
  exportFileSequence += 1;
  const fileName = `export-${exportFileSequence}-${table}.csv`;
  await database.database.registerEmptyFileBuffer(fileName);
  try {
    await database.connection.query(getExportCsvCopySql(table, fileName));
    await database.database.flushFiles();
    const bytes = await database.database.copyFileToBuffer(fileName);
    return createCsvExportBlob(bytes);
  } finally {
    try {
      await database.database.dropFile(fileName);
    } catch (dropError: unknown) {
      console.error("A CSV export virtual file could not be removed.", dropError);
    }
  }
}

async function exportTable(
  table: ExportTable,
  format: ExportFormat,
): Promise<Blob> {
  if (!isExportTable(table) || !isExportFormat(format)) {
    throw new PublicWorkerError("Choose a supported table and export format.");
  }
  const database = await getDatabase();
  try {
    if (format === "csv") {
      return await exportCsvViaCopy(database, table);
    }
    const rowCount = await countTableRows(database, table);
    if (format === "xlsx" && rowCount > SPREADSHEET_ROW_LIMIT) {
      // Memory-safe fallback — still a usable download.
      return await exportCsvViaCopy(database, table);
    }
    const result = await database.connection.query(getExportSelectSql(table));
    const rows = asSqlRows(result.toArray());
    if (format === "json") {
      return createJsonExportBlob(rows);
    }
    return await createSpreadsheetExportBlob(table, rows);
  } catch (error: unknown) {
    console.error(`Exporting ${table} as ${format} failed.`, error);
    throw new PublicWorkerError(
      "The private database could not create that export.",
    );
  }
}

async function ping(): Promise<true> {
  const database = await getDatabase();
  await database.connection.query("SELECT 1");
  return true;
}

function heavyQueryTimeout(name: QueryName): number {
  if (name === "wrappedStats" || name === "personDetail" || name === "footprint") {
    return WORKER_HEAVY_TIMEOUT_MS;
  }
  return WORKER_OP_TIMEOUT_MS;
}

const api: IngestApi = {
  ingest: (file, onProgress, options) =>
    runExclusive(() => ingestArchive(file, onProgress, options), {
      label: "ingest",
      timeoutMs: WORKER_INGEST_TIMEOUT_MS,
    }),
  detectArchive: (file) =>
    runExclusive(() => detectArchive(file), {
      label: "detectArchive",
      timeoutMs: WORKER_OP_TIMEOUT_MS,
    }),
  query: <Name extends QueryName>(name: Name, ...args: QueryArgs<Name>) =>
    runExclusive(() => runQuery(name, args[0] as QueryParamsByName[Name]), {
      label: `query:${String(name)}`,
      timeoutMs: heavyQueryTimeout(name),
    }),
  readMediaBlob: (zipPath) =>
    runExclusive(() => readMediaBlob(zipPath), {
      label: `readMediaBlob:${zipPath}`,
    }),
  exportTable: (table, format) =>
    runExclusive(() => exportTable(table, format), {
      label: `exportTable:${table}`,
      timeoutMs: WORKER_EXPORT_TIMEOUT_MS,
    }),
  ping: () =>
    runExclusive(() => ping(), {
      label: "ping",
      timeoutMs: 8_000,
    }),
};

Comlink.expose(api);
