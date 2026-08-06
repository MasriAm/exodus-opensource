import writeExcelFile from "write-excel-file/universal";

import type {
  ExportFormatMetadata,
  ExportTable,
  ExportTableMetadata,
} from "./types";

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const VIRTUAL_EXPORT_FILE =
  /^export-\d+-(messages|media|events)\.(csv)$/;

/** Above this, spreadsheet export falls back to CSV (memory-safe). */
export const SPREADSHEET_ROW_LIMIT = 25_000;

const TABLE_COLUMNS: Record<ExportTable, readonly string[]> = {
  messages: [
    "platform",
    "conversation",
    "sender",
    "sent_at",
    "text",
    "media_ref",
  ],
  media: ["platform", "zip_path", "kind", "taken_at", "conversation"],
  events: ["platform", "kind", "occurred_at", "payload"],
};

const COLUMN_WIDTH: Record<
  ExportTable,
  Record<string, { min: number; max: number; prefer?: number }>
> = {
  messages: {
    platform: { min: 10, max: 14, prefer: 12 },
    conversation: { min: 14, max: 32, prefer: 22 },
    sender: { min: 12, max: 28, prefer: 18 },
    sent_at: { min: 18, max: 24, prefer: 22 },
    text: { min: 28, max: 60, prefer: 48 },
    media_ref: { min: 16, max: 40, prefer: 28 },
  },
  media: {
    platform: { min: 10, max: 14, prefer: 12 },
    zip_path: { min: 24, max: 56, prefer: 44 },
    kind: { min: 8, max: 12, prefer: 10 },
    taken_at: { min: 18, max: 24, prefer: 22 },
    conversation: { min: 14, max: 32, prefer: 22 },
  },
  events: {
    platform: { min: 10, max: 14, prefer: 12 },
    kind: { min: 12, max: 24, prefer: 18 },
    occurred_at: { min: 18, max: 24, prefer: 22 },
    payload: { min: 28, max: 64, prefer: 52 },
  },
};

const WRAP_COLUMNS = new Set(["text", "payload", "zip_path", "media_ref"]);

const HEADER_FILL = "#EADBC3";
const HEADER_INK = "#241A15";
const BODY_FONT = "Calibri";

export const EXPORT_FORMATS: readonly ExportFormatMetadata[] = [
  {
    format: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  },
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
      xlsx: `exodus-${table}.xlsx`,
      csv: `exodus-${table}.csv`,
      json: `exodus-${table}.json`,
    },
  };
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

export function getExportCsvCopySql(
  table: ExportTable,
  virtualFileName: string,
): string {
  if (!VIRTUAL_EXPORT_FILE.test(virtualFileName)) {
    throw new Error("Invalid export file name.");
  }
  return `COPY (${getExportSelectSql(table)}) TO '${virtualFileName}'
    (FORMAT CSV, HEADER TRUE, DELIMITER ',', QUOTE '"', ESCAPE '"')`;
}

export function createCsvExportBlob(bytes: Uint8Array): Blob {
  return new Blob([UTF8_BOM, Uint8Array.from(bytes)], {
    type: "text/csv;charset=utf-8",
  });
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
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  throw new Error("DuckDB returned a value that cannot be exported as JSON.");
}

function cellText(value: unknown): string {
  const scalar = jsonScalar(value);
  if (scalar === null) {
    return "";
  }
  return String(scalar);
}

function displayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += /[\u0600-\u06FF\u0750-\u077F\u1100-\u11FF\u2E80-\u9FFF]/.test(char)
      ? 1.6
      : 1;
  }
  return Math.ceil(width);
}

function columnWidth(
  table: ExportTable,
  column: string,
  rows: readonly Record<string, unknown>[],
): number {
  const bounds = COLUMN_WIDTH[table][column] ?? { min: 12, max: 40, prefer: 18 };
  let widest = displayWidth(column);
  for (const row of rows.slice(0, 250)) {
    widest = Math.max(widest, displayWidth(cellText(row[column])));
  }
  const fitted = widest + 2;
  const preferred = bounds.prefer ?? bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.max(preferred, fitted)));
}

function headerCell(label: string) {
  return {
    value: label,
    fontWeight: "bold" as const,
    fontFamily: BODY_FONT,
    fontSize: 11,
    align: "left" as const,
    alignVertical: "center" as const,
    backgroundColor: HEADER_FILL,
    textColor: HEADER_INK,
    borderColor: HEADER_INK,
    borderStyle: "thin" as const,
  };
}

function bodyCell(column: string, value: unknown) {
  return {
    value: cellText(value),
    fontFamily: BODY_FONT,
    fontSize: 11,
    alignVertical: "top" as const,
    wrap: WRAP_COLUMNS.has(column),
  };
}

export async function createSpreadsheetExportBlob(
  table: ExportTable,
  rows: readonly Record<string, unknown>[],
): Promise<Blob> {
  const columns = TABLE_COLUMNS[table];
  const sheetData = [
    columns.map((column) => headerCell(column)),
    ...rows.map((row) => columns.map((column) => bodyCell(column, row[column]))),
  ];

  return writeExcelFile(
    sheetData,
    {
      sheet: table,
      stickyRowsCount: 1,
      columns: columns.map((column) => ({
        width: columnWidth(table, column, rows),
      })),
    },
    {
      fontFamily: BODY_FONT,
      fontSize: 11,
    },
  ).toBlob();
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
