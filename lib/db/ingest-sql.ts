import type { ExportTable } from "./types";
import type { NormalizedRow } from "../schema";

export type BatchSqlParameter = string | number | boolean | null;

export function getBatchInsertSql(
  table: ExportTable,
  rowCount: number,
): string {
  if (!Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > 2_000) {
    throw new Error("Batch row count must be between 1 and 2,000.");
  }

  switch (table) {
    case "messages":
      return `INSERT INTO messages (
        platform, conversation, sender, sent_at, text, media_ref
      )
      VALUES ${repeatTuple(
        "(?, ?, ?, epoch_ms(CAST(? AS BIGINT)), ?, ?)",
        rowCount,
      )}`;
    case "media":
      return `INSERT INTO media (
        platform, zip_path, kind, taken_at, conversation
      )
      VALUES ${repeatTuple(
        "(?, ?, ?, epoch_ms(CAST(? AS BIGINT)), ?)",
        rowCount,
      )}`;
    case "events":
      return `INSERT INTO events (
        platform, kind, occurred_at, payload
      )
      VALUES ${repeatTuple(
        "(?, ?, epoch_ms(CAST(? AS BIGINT)), ?)",
        rowCount,
      )}`;
  }
}

export function getBatchInsertParameters(
  table: ExportTable,
  rows: readonly NormalizedRow[],
): BatchSqlParameter[] {
  const parameters: BatchSqlParameter[] = [];

  for (const row of rows) {
    if (row.table !== table) {
      throw new Error(`Cannot insert a ${row.table} row into ${table}.`);
    }
    switch (row.table) {
      case "messages":
        parameters.push(
          row.platform,
          row.conversation,
          row.sender,
          row.sent_at_ms,
          row.text,
          row.media_ref,
        );
        break;
      case "media":
        parameters.push(
          row.platform,
          row.zip_path,
          row.kind,
          row.taken_at_ms,
          row.conversation,
        );
        break;
      case "events":
        parameters.push(
          row.platform,
          row.kind,
          row.occurred_at_ms,
          row.payload,
        );
        break;
    }
  }

  return parameters;
}

function repeatTuple(tuple: string, rowCount: number): string {
  return Array.from({ length: rowCount }, () => tuple).join(",\n");
}
