import { ValidatedBatchEmitter } from "../batch";
import { stringifyJson } from "../json";
import {
  entryBasename,
  entryPathSegments,
  hasInstagramMarker,
} from "../paths";
import type { DataParser } from "../types";

const IOS_LINE_PATTERN =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\]\s*(.*)$/i;
const ANDROID_LINE_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s+[-–]\s+(.*)$/i;
const SENDER_PATTERN = /^([^:]+?):\s?(.*)$/;
const OMITTED_MEDIA_PATTERN =
  /^<?\s*(media|image|photo|video|audio|voice message|sticker|gif|document|file)\s+omitted\s*>?$/i;
const CALL_DURATION_PATTERN =
  /^(Voice|Video)\s+call\.\s*Duration:\s*(\d+):(\d{2})$/i;
const DIRECTIONAL_MARKS_PATTERN =
  /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

type MediaKind = "image" | "video" | "audio" | "other";

interface ParsedRecordStart {
  payload: string;
  sentAtMs: number;
}

interface PendingRecord extends ParsedRecordStart {
  lineNumber: number;
  ordinal: number;
  sender: string | null;
  text: string;
}

function stripDirectionalMarks(value: string): string {
  return value.replace(DIRECTIONAL_MARKS_PATTERN, "");
}

function expandedYear(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (value.length === 2) {
    return parsed <= 69 ? 2_000 + parsed : 1_900 + parsed;
  }
  return parsed;
}

function explicitTimestamp(
  yearText: string,
  month: number,
  day: number,
  hourInput: number,
  minute: number,
  second: number,
  meridiem: string | undefined,
  sourceLine: string,
): number {
  const year = expandedYear(yearText);
  let hour = hourInput;

  if (meridiem !== undefined) {
    if (hour < 1 || hour > 12) {
      throw new Error(`Invalid 12-hour clock value in: ${sourceLine}`);
    }
    const upperMeridiem = meridiem.toUpperCase();
    hour = hour % 12 + (upperMeridiem === "PM" ? 12 : 0);
  }

  if (
    year < 1 ||
    year > 9_999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new Error(`Invalid WhatsApp date or time in: ${sourceLine}`);
  }

  // Exports contain local wall-clock values but no timezone. Treating those
  // components as UTC preserves their stated date/hour deterministically.
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new Error(`Invalid WhatsApp calendar date in: ${sourceLine}`);
  }

  return timestamp;
}

function parsedStartFromMatch(
  match: RegExpExecArray,
  format: "ios" | "android",
  sourceLine: string,
): ParsedRecordStart {
  // iOS fixtures use month/day/year; Android fixtures use day/month/year.
  // Ambiguous dates intentionally follow the convention of their line format.
  const firstDatePart = Number.parseInt(match[1], 10);
  const secondDatePart = Number.parseInt(match[2], 10);
  const month = format === "ios" ? firstDatePart : secondDatePart;
  const day = format === "ios" ? secondDatePart : firstDatePart;

  return {
    sentAtMs: explicitTimestamp(
      match[3],
      month,
      day,
      Number.parseInt(match[4], 10),
      Number.parseInt(match[5], 10),
      Number.parseInt(match[6] ?? "0", 10),
      match[7],
      sourceLine,
    ),
    payload: match[8],
  };
}

function parseRecordStart(line: string): ParsedRecordStart | null {
  const normalized = stripDirectionalMarks(line)
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ");

  const iosMatch = IOS_LINE_PATTERN.exec(normalized);
  if (iosMatch !== null) {
    return parsedStartFromMatch(iosMatch, "ios", normalized);
  }

  const androidMatch = ANDROID_LINE_PATTERN.exec(normalized);
  if (androidMatch !== null) {
    return parsedStartFromMatch(androidMatch, "android", normalized);
  }

  return null;
}

function splitSender(payload: string): {
  sender: string | null;
  text: string;
} {
  const senderMatch = SENDER_PATTERN.exec(payload);
  if (senderMatch === null || senderMatch[1].trim().length === 0) {
    return { sender: null, text: payload };
  }
  return {
    sender: senderMatch[1].trim(),
    text: senderMatch[2],
  };
}

function parseCallPayload(payload: string): {
  media: "voice" | "video";
  durationSec: number;
  text: string;
} | null {
  const match = CALL_DURATION_PATTERN.exec(
    payload.trim().replace(/\s+/g, " "),
  );
  if (match === null) {
    return null;
  }

  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return {
    media: match[1].toLowerCase() === "video" ? "video" : "voice",
    durationSec: minutes * 60 + seconds,
    text: payload.trim(),
  };
}

function omittedMediaKind(value: string): MediaKind | null {
  const match = OMITTED_MEDIA_PATTERN.exec(value.trim().replace(/\s+/g, " "));
  if (match === null) {
    return null;
  }

  switch (match[1].toLowerCase()) {
    case "image":
    case "photo":
    case "gif":
    case "sticker":
      return "image";
    case "video":
      return "video";
    case "audio":
    case "voice message":
      return "audio";
    case "document":
    case "file":
    case "media":
      return "other";
    default:
      return null;
  }
}

function recognizedTranscriptPath(path: string): boolean {
  const segments = entryPathSegments(path);
  if (segments.length < 1 || segments.length > 2) {
    return false;
  }
  return /^(?:_chat|whatsapp chat with .+)\.txt$/i.test(
    entryBasename(path),
  );
}

function isTextPath(path: string): boolean {
  return /\.txt$/i.test(entryBasename(path));
}

function firstMeaningfulLine(text: string): string | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  return lines.find((line) => stripDirectionalMarks(line).trim() !== "") ?? null;
}

function looksLikeTranscript(text: string): boolean {
  const firstLine = firstMeaningfulLine(text);
  return firstLine !== null && parseRecordStart(firstLine) !== null;
}

async function emitPendingRecord(
  record: PendingRecord,
  conversation: string,
  transcriptPath: string,
  batch: ValidatedBatchEmitter,
): Promise<void> {
  const source = `${transcriptPath}:${record.lineNumber}`;
  const call =
    parseCallPayload(record.text) ??
    (record.sender === null
      ? null
      : parseCallPayload(`${record.sender}: ${record.text}`));

  if (call !== null) {
    await batch.add(
      {
        table: "events",
        platform: "whatsapp",
        kind: "call",
        occurred_at_ms: record.sentAtMs,
        payload: stringifyJson(
          {
            media: call.media,
            durationSec: call.durationSec,
            conversation,
            text: call.text,
          },
          source,
        ),
      },
      source,
      "Parsing WhatsApp call events…",
    );
    return;
  }

  if (record.sender === null) {
    await batch.add(
      {
        table: "events",
        platform: "whatsapp",
        kind: "system",
        occurred_at_ms: record.sentAtMs,
        payload: stringifyJson(
          { conversation, text: record.text },
          source,
        ),
      },
      source,
      "Parsing WhatsApp system events…",
    );
    return;
  }

  const mediaKind = omittedMediaKind(record.text);
  const mediaReference =
    mediaKind === null
      ? null
      : `omitted://whatsapp/${encodeURIComponent(transcriptPath)}#${
          record.ordinal
        }`;

  await batch.add(
    {
      table: "messages",
      platform: "whatsapp",
      conversation,
      sender: record.sender,
      sent_at_ms: record.sentAtMs,
      text:
        mediaKind !== null
          ? null
          : record.text.length === 0
            ? null
            : record.text,
      media_ref: mediaReference,
    },
    source,
    "Parsing WhatsApp messages…",
  );

  if (mediaKind !== null && mediaReference !== null) {
    await batch.add(
      {
        table: "media",
        platform: "whatsapp",
        zip_path: mediaReference,
        kind: mediaKind,
        taken_at_ms: record.sentAtMs,
        conversation,
      },
      source,
      "Parsing WhatsApp media…",
    );
  }
}

async function parseTranscript(
  text: string,
  transcriptPath: string,
  batch: ValidatedBatchEmitter,
): Promise<void> {
  const conversation = entryBasename(transcriptPath);
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  let pending: PendingRecord | null = null;
  let ordinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripDirectionalMarks(lines[index]);
    const start = parseRecordStart(line);

    if (start !== null) {
      if (pending !== null) {
        await emitPendingRecord(
          pending,
          conversation,
          transcriptPath,
          batch,
        );
      }

      ordinal += 1;
      const call = parseCallPayload(start.payload);
      if (call !== null) {
        pending = {
          ...start,
          lineNumber: index + 1,
          ordinal,
          sender: null,
          text: call.text,
        };
      } else {
        const { sender, text: messageText } = splitSender(start.payload);
        pending = {
          ...start,
          lineNumber: index + 1,
          ordinal,
          sender,
          text: messageText,
        };
      }
      continue;
    }

    if (pending === null) {
      if (line.trim() === "") {
        continue;
      }
      throw new Error(
        `WhatsApp transcript ${transcriptPath} starts with an unrecognized line at ${
          index + 1
        }`,
      );
    }

    pending.text += `\n${line}`;
  }

  if (pending !== null) {
    await emitPendingRecord(
      pending,
      conversation,
      transcriptPath,
      batch,
    );
  }
}

export const whatsappParser: DataParser = {
  id: "whatsapp",
  displayName: "WhatsApp",

  detect(entryPaths) {
    if (hasInstagramMarker(entryPaths)) {
      return false;
    }

    // The plugin contract supplies paths only, so arbitrary *.txt content is
    // validated during parse; detection safely claims only standard names.
    return entryPaths.some(recognizedTranscriptPath);
  },

  async parse(entries, emit, progress) {
    const batch = new ValidatedBatchEmitter(emit, progress);
    const transcriptPaths: string[] = [];

    progress({ done: 0, label: "Finding WhatsApp transcripts…" });
    for (const path of entries
      .paths()
      .filter(isTextPath)
      .sort((left, right) => left.localeCompare(right, "en"))) {
      const text = await entries.readText(path);
      if (recognizedTranscriptPath(path) || looksLikeTranscript(text)) {
        transcriptPaths.push(path);
        await parseTranscript(text, path, batch);
        await batch.flush("Parsing WhatsApp messages…");
      }
    }

    if (transcriptPaths.length === 0) {
      throw new Error("No supported WhatsApp transcript was found");
    }

    await batch.finish("WhatsApp archive parsed");
  },
};

export default whatsappParser;
