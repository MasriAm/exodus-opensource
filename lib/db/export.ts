import type {
  ExportFormat,
  ExportFormatMetadata,
  ExportTable,
  ExportTableMetadata,
} from "./types";

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const VIRTUAL_EXPORT_FILE =
  /^export-\d+-(messages|media|events)\.(csv|json)$/;

const TABLE_COLUMNS: Record<ExportTable, readonly string[]> = {
  messages: [
    "platform",
    "conversation",
    "sender",
    "sent_at",
    "text",
    "media_ref",
  ],
  media: [
    "platform",
    "zip_path",
    "kind",
    "taken_at",
    "conversation",
  ],
  events: ["platform", "kind", "occurred_at", "payload"],
};

export const EXPORT_FORMATS: readonly ExportFormatMetadata[] = [
  {
    format: "csv",
    mimeType: "text/csv;charset=utf-8",
    extension: "csv",
  },
  {
    format: "json",
    mimeType: "application/json;charset=utf-8",
    extension: "json",
  },
];

export function exportTableMetadata(
  table: ExportTable,
  rowCount: number,
): ExportTableMetadata {
  return {
    table,
    rowCount,
    columns: TABLE_COLUMNS[table],
    suggestedFiles: {
      csv: `exodus-${table}.csv`,
      json: `exodus-${table}.json`,
    },
  };
}

export function getExportSql(
  table: ExportTable,
  format: ExportFormat,
  virtualFileName: string,
): string {
  if (!VIRTUAL_EXPORT_FILE.test(virtualFileName)) {
    throw new Error("Invalid export file name.");
  }

  const selectSql = getExportSelectSql(table);
  switch (format) {
    case "csv":
      return `COPY (${selectSql}) TO '${virtualFileName}'
        (FORMAT CSV, HEADER TRUE, DELIMITER ',', QUOTE '"', ESCAPE '"')`;
    case "json":
      return selectSql;
  }
}

export function getExportSelectSql(table: ExportTable): string {
  switch (table) {
    case "messages":
      return `SELECT
        platform,
        conversation,
        sender,
        CAST(sent_at AS VARCHAR) AS sent_at,
        text,
        media_ref
      FROM messages
      ORDER BY sent_at ASC, rowid ASC`;
    case "media":
      return `SELECT
        platform,
        zip_path,
        kind,
        CAST(taken_at AS VARCHAR) AS taken_at,
        conversation
      FROM media
      ORDER BY taken_at ASC NULLS LAST, rowid ASC`;
    case "events":
      return `SELECT
        platform,
        kind,
        CAST(occurred_at AS VARCHAR) AS occurred_at,
        payload
      FROM events
      ORDER BY occurred_at ASC, rowid ASC`;
  }
}

export function createExportBlob(
  bytes: Uint8Array,
  format: ExportFormat,
): Blob {
  const content = Uint8Array.from(bytes);
  switch (format) {
    case "csv":
      return new Blob([UTF8_BOM, content], {
        type: "text/csv;charset=utf-8",
      });
    case "json":
      return new Blob([content], {
        type: "application/json;charset=utf-8",
      });
  }
}

type JsonScalar = string | number | boolean | null;

function jsonScalar(value: unknown): JsonScalar {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  throw new Error("DuckDB returned a value that cannot be exported as JSON.");
}

export function createJsonExportBlob(
  rows: readonly Record<string, unknown>[],
): Blob {
  const normalized = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([column, value]) => [
        column,
        jsonScalar(value),
      ]),
    ),
  );
  return new Blob([JSON.stringify(normalized, null, 2)], {
    type: "application/json;charset=utf-8",
  });
}
