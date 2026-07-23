import {
  QUERY_NAMES,
  type ExportFormat,
  type ExportTable,
  type MediaKind,
  type QueryName,
} from "./types";

const EXPORT_TABLES: readonly ExportTable[] = [
  "messages",
  "media",
  "events",
];
const EXPORT_FORMATS: readonly ExportFormat[] = ["csv", "json"];
const MEDIA_KINDS: readonly MediaKind[] = [
  "image",
  "video",
  "audio",
  "other",
];

export function isQueryName(value: unknown): value is QueryName {
  return (
    typeof value === "string" &&
    (QUERY_NAMES as readonly string[]).includes(value)
  );
}

export function isExportTable(value: unknown): value is ExportTable {
  return (
    typeof value === "string" &&
    (EXPORT_TABLES as readonly string[]).includes(value)
  );
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return (
    typeof value === "string" &&
    (EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

export function isMediaKind(value: unknown): value is MediaKind {
  return (
    typeof value === "string" &&
    (MEDIA_KINDS as readonly string[]).includes(value)
  );
}

export function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    throw new Error("Expected a finite number.");
  }
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export function requireFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

export function escapeLikePattern(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll(
    "_",
    "\\_",
  );
}

export function createSearchSnippet(
  text: string,
  term: string,
  maximumLength = 180,
): string {
  if (text.length <= maximumLength) {
    return text;
  }

  const normalizedText = text.toLocaleLowerCase();
  const normalizedTerm = term.toLocaleLowerCase();
  const matchIndex = normalizedText.indexOf(normalizedTerm);
  const center = matchIndex >= 0 ? matchIndex : 0;
  const start = Math.max(
    0,
    Math.min(text.length - maximumLength, center - Math.floor(maximumLength / 3)),
  );
  const end = Math.min(text.length, start + maximumLength);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

export function mediaMimeType(zipPath: string): string {
  const extension = zipPath.split(".").pop()?.toLocaleLowerCase() ?? "";
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

export function emptyRowCounts(): {
  messages: number;
  media: number;
  events: number;
} {
  return { messages: 0, media: 0, events: 0 };
}
