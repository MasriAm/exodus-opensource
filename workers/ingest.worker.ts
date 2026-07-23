import * as duckdb from "@duckdb/duckdb-wasm/dist/duckdb-browser";
import * as Comlink from "comlink";

import { normalizedRowSchema, type NormalizedRow } from "../lib/schema";
import { ZipEntryMap } from "../lib/zip";
import {
  createExportBlob,
  createJsonExportBlob,
  getExportSql,
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

const MAX_BATCH_SIZE = 2_000;

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
let activeArchive: ActiveArchive | null = null;
let exportFileSequence = 0;
let operationTail: Promise<void> = Promise.resolve();

function runExclusive<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const result = operationTail.then(operation, operation);
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

async function ingestArchive(
  file: File,
  onProgress: IngestProgressCallback,
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

  const replacedExistingArchive = activeArchive !== null;
  let transactionOpen = false;
  try {
    await database.connection.query(BEGIN_ARCHIVE_REPLACEMENT_SQL);
    transactionOpen = true;
    for (const sql of CLEAR_ARCHIVE_SQL) {
      await database.connection.query(sql);
    }

    await parser.parse(
      candidate,
      async (batch) => {
        await validateAndLoadBatch(database, batch, counts);
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

  const previousArchive = activeArchive;
  activeArchive = {
    entries: candidate,
    parserId: parser.id,
    archiveName: file.name,
  };
  if (previousArchive) {
    try {
      await previousArchive.entries.close();
    } catch (error: unknown) {
      console.error("The previous ZIP archive could not be closed.", error);
    }
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

async function validateAndLoadBatch(
  database: DatabaseState,
  batch: NormalizedRow[],
  counts: RowCounts,
): Promise<void> {
  if (batch.length > MAX_BATCH_SIZE) {
    throw new Error(
      `Parser batch contained ${batch.length} rows; maximum is ${MAX_BATCH_SIZE}.`,
    );
  }
  if (batch.length === 0) {
    return;
  }

  const validated: NormalizedRow[] = [];
  for (const candidate of batch) {
    const result = normalizedRowSchema.safeParse(candidate);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => {
          const path =
            issue.path.length === 0 ? "<row>" : issue.path.map(String).join(".");
          return `${path}: ${issue.message}`;
        })
        .join("; ");
      throw new Error(`Normalized row validation failed: ${details}`);
    }
    validated.push(result.data);
  }

  const messages = validated.filter(
    (row): row is Extract<NormalizedRow, { table: "messages" }> =>
      row.table === "messages",
  );
  const media = validated.filter(
    (row): row is Extract<NormalizedRow, { table: "media" }> =>
      row.table === "media",
  );
  const events = validated.filter(
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
  if (!activeArchive) {
    throw new PublicWorkerError("Import an archive before opening media.");
  }
  try {
    return await activeArchive.entries.readBlob(zipPath);
  } catch (error: unknown) {
    console.error(
      `Media could not be read from ${activeArchive.archiveName}.`,
      error,
    );
    throw new PublicWorkerError(
      "That media file could not be read from the current archive.",
    );
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
  exportFileSequence += 1;
  const fileName = `export-${exportFileSequence}-${table}.${format}`;
  if (format === "json") {
    try {
      const result = await database.connection.query(
        getExportSql(table, format, fileName),
      );
      return createJsonExportBlob(asSqlRows(result.toArray()));
    } catch (error: unknown) {
      console.error(`Exporting ${table} as ${format} failed.`, error);
      throw new PublicWorkerError(
        "The private database could not create that export.",
      );
    }
  }

  await database.database.registerEmptyFileBuffer(fileName);
  let exportFailed = false;
  try {
    await database.connection.query(getExportSql(table, format, fileName));
    await database.database.flushFiles();
    const bytes = await database.database.copyFileToBuffer(fileName);
    return createExportBlob(bytes, format);
  } catch (error: unknown) {
    exportFailed = true;
    console.error(`Exporting ${table} as ${format} failed.`, error);
    throw new PublicWorkerError(
      "The private database could not create that export.",
    );
  } finally {
    try {
      await database.database.dropFile(fileName);
    } catch (dropError: unknown) {
      if (!exportFailed) {
        throw dropError;
      }
      console.error("A failed export virtual file could not be removed.", dropError);
    }
  }
}

const api: IngestApi = {
  ingest: (file, onProgress) =>
    runExclusive(() => ingestArchive(file, onProgress)),
  query: <Name extends QueryName>(name: Name, ...args: QueryArgs<Name>) =>
    runExclusive(() =>
      runQuery(name, args[0] as QueryParamsByName[Name]),
    ),
  readMediaBlob: (zipPath) =>
    runExclusive(() => readMediaBlob(zipPath)),
  exportTable: (table, format) =>
    runExclusive(() => exportTable(table, format)),
};

Comlink.expose(api);
