import { z } from "zod";

function formatIssues(
  issues: ReadonlyArray<{
    message: string;
    path: ReadonlyArray<PropertyKey>;
  }>,
): string {
  return issues
    .map((issue) => {
      const path =
        issue.path.length === 0 ? "<root>" : issue.path.map(String).join(".");
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseJson(text: string, source: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error: unknown) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`Could not parse JSON entry ${source}.${detail}`);
  }
}

export function validateJson<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  source: string,
): z.output<Schema> {
  const validation = schema.safeParse(value);
  if (!validation.success) {
    throw new Error(
      `JSON entry ${source} has an unsupported shape: ${formatIssues(
        validation.error.issues,
      )}`,
    );
  }
  return validation.data;
}

export function stringifyJson(value: unknown, source: string): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(`Could not serialize parser payload from ${source}`);
  }
  return serialized;
}
