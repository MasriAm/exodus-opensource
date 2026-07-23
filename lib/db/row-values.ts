export type SqlRow = Record<string, unknown>;

export function asSqlRows(values: readonly unknown[]): SqlRow[] {
  return values.map((value) => {
    if (value === null || typeof value !== "object") {
      throw new Error("DuckDB returned an invalid row.");
    }
    return value as SqlRow;
  });
}

export function readNumber(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    const converted = Number(value);
    if (Number.isSafeInteger(converted)) {
      return converted;
    }
  }
  throw new Error(`DuckDB returned an invalid ${column} value.`);
}

export function readNullableNumber(
  row: SqlRow,
  column: string,
): number | null {
  if (row[column] === null || row[column] === undefined) {
    return null;
  }
  return readNumber(row, column);
}

export function readString(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`DuckDB returned an invalid ${column} value.`);
  }
  return value;
}

export function readNullableString(
  row: SqlRow,
  column: string,
): string | null {
  if (row[column] === null || row[column] === undefined) {
    return null;
  }
  return readString(row, column);
}
