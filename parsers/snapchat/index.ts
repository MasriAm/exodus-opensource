/**
 * Snapchat "My Data" parser.
 *
 * Snapchat has shipped at least two shapes of `chat_history.json` and both are
 * still in the wild, so every field here is read permissively:
 *
 *   Category shape   { "Received Saved Chat History": [ … ], "Sent Saved …": [ … ] }
 *   Per-friend shape { "maya.kh": [ … ], "the.groupchat": [ … ] }
 *
 * Media itself is never inside the export — snaps and chat attachments are
 * download links that expire — so attachments become `omitted://` refs, the
 * same convention the WhatsApp parser uses for `<Media omitted>`.
 */

import { ValidatedBatchEmitter } from "../batch";
import { parseJson, stringifyJson } from "../json";
import {
  entryBasename,
  entryPathSegments,
  hasFacebookMarker,
  hasInstagramMarker,
} from "../paths";
import type { DataParser } from "../types";
import type { ZipEntryMap } from "../../lib/zip";

const MAX_JSON_ENTRY_BYTES = 48 * 1024 * 1024;

const PLATFORM = "snapchat";

/**
 * Every JSON file Snapchat ships across the ten export categories. Any one of
 * them identifies the archive, which matters because a category-selected
 * export may contain only one of them.
 */
const SNAPCHAT_JSON_BASENAMES: ReadonlySet<string> = new Set([
  "chat_history.json",
  "snap_history.json",
  "talk_history.json",
  "memories_history.json",
  "account.json",
  "account_history.json",
  "friends.json",
  "user_profile.json",
  "subscriptions.json",
  "location_history.json",
  "shared_story.json",
  "story_history.json",
  "spotlight.json",
  "purchase_history.json",
  "support_history.json",
  "search_history.json",
  "connected_apps.json",
  "bitmoji.json",
  "ranking.json",
  "snap_ai.json",
  "in_app_surveys.json",
  "terms_history.json",
  "countdowns.json",
  "community_history.json",
]);

/** Folders that hold the actual bytes rather than the metadata. */
const SNAPCHAT_MEDIA_DIRECTORIES: ReadonlySet<string> = new Set([
  "memories",
  "chat_media",
  "shared_stories",
  "my_sounds",
  "my_custom_stickers",
  "my_lenses",
  "selfie",
  "cameos",
]);

/** `mydata~1788886440253.zip`, and its `-2` … `-9` continuation parts. */
const SNAPCHAT_ARCHIVE_NAME = /^mydata~\d+(?:-\d+)?$/i;

function isSnapchatArchiveName(fileName: string | undefined): boolean {
  if (typeof fileName !== "string") {
    return false;
  }
  const stem = entryBasename(fileName).replace(/\.zip$/i, "").trim();
  return SNAPCHAT_ARCHIVE_NAME.test(stem);
}

const MEDIA_EXTENSIONS: ReadonlyMap<string, MediaKind> = new Map([
  ["jpg", "image"],
  ["jpeg", "image"],
  ["png", "image"],
  ["gif", "image"],
  ["webp", "image"],
  ["heic", "image"],
  ["mp4", "video"],
  ["mov", "video"],
  ["webm", "video"],
  ["m4a", "audio"],
  ["mp3", "audio"],
  ["aac", "audio"],
  ["opus", "audio"],
]);

/** Snapchat names memories `2023-01-05_<hash>.jpg`. */
const MEDIA_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/** Top-level keys in the category shape, which are labels rather than people. */
const CATEGORY_KEY_PATTERN =
  /(saved chat history|chat history|snap history|talk history|story history|history)$/i;
const SENT_CATEGORY_PATTERN = /^sent\b/i;

type MediaKind = "image" | "video" | "audio" | "other";

interface ChatRecord {
  from: string | null;
  to: string | null;
  conversationTitle: string | null;
  mediaType: string;
  content: string | null;
  sentAtMs: number;
  isSender: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read the first present key from a set of casing/spacing variants. */
function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  // Fall back to a normalized lookup so "Media Type" also matches "media_type".
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    normalized.set(key.toLowerCase().replace(/[\s_]+/g, ""), value);
  }
  for (const key of keys) {
    const value = normalized.get(key.toLowerCase().replace(/[\s_]+/g, ""));
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return null;
}

/**
 * Snapchat writes `"2023-01-05 18:22:39 UTC"`. Some exports also carry
 * `Created(microseconds)`, which is preferred when present because it needs no
 * string parsing at all.
 */
export function parseSnapchatTimestamp(record: Record<string, unknown>): number | null {
  const micros = pick(record, "Created(microseconds)", "Created_microseconds");
  if (typeof micros === "number" && Number.isFinite(micros) && micros > 0) {
    return Math.trunc(micros / 1000);
  }

  const raw = readString(
    pick(record, "Created", "Date", "Start Time", "Timestamp", "Creation Timestamp"),
  );
  if (raw === null) {
    return null;
  }

  const isoish = raw
    .replace(/\s+UTC$/i, "Z")
    .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/, "$1T$2");
  const parsed = Date.parse(isoish.endsWith("Z") ? isoish : `${isoish}Z`);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const loose = Date.parse(raw);
  return Number.isFinite(loose) ? loose : null;
}

/** `"00:12:34"`, `"12:34"` or a plain seconds number. */
export function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  const text = readString(value);
  if (text === null) {
    return null;
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric);
  }
  const parts = text.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

export function snapchatMediaKind(mediaType: string): MediaKind | null {
  const key = mediaType.trim().toUpperCase().replace(/[\s_-]+/g, "");
  switch (key) {
    case "TEXT":
    case "":
      return null;
    case "IMAGE":
    case "PHOTO":
    case "STICKER":
    case "MEDIA":
    case "SNAP":
      return "image";
    case "VIDEO":
    case "VIDEONOAUDIO":
      return "video";
    case "NOTE":
    case "VOICENOTE":
    case "AUDIO":
      return "audio";
    default:
      return "other";
  }
}

function isCategoryKey(key: string): boolean {
  return CATEGORY_KEY_PATTERN.test(key.trim());
}

function toChatRecord(value: unknown): ChatRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const sentAtMs = parseSnapchatTimestamp(value);
  if (sentAtMs === null) {
    return null;
  }

  return {
    from: readString(pick(value, "From", "Sender", "Username")),
    to: readString(pick(value, "To", "Recipient")),
    conversationTitle: readString(pick(value, "Conversation Title", "Group Name")),
    mediaType: readString(pick(value, "Media Type", "Type")) ?? "TEXT",
    content: readString(pick(value, "Content", "Text", "Body")),
    sentAtMs,
    isSender: readBoolean(pick(value, "IsSender", "Is Sender")),
  };
}

/**
 * Which thread a record belongs to. `Conversation Title` wins for groups; a
 * per-friend top-level key wins next; otherwise the counterparty on the record.
 */
function resolveConversation(
  record: ChatRecord,
  groupKey: string,
  keyIsCategory: boolean,
  ownerName: string,
): string {
  if (record.conversationTitle !== null) {
    return record.conversationTitle;
  }
  // The per-friend shape keys each array by the thread itself, which is the
  // most reliable answer available.
  if (!keyIsCategory) {
    return groupKey;
  }

  // In the category shape the thread is whichever side is not the archive
  // owner. Snapchat has shipped both conventions for `From` on sent messages —
  // some exports name the recipient, others name you — and trusting it blindly
  // files your own outgoing messages under your own name, inventing a
  // conversation with yourself that then outranks every real person.
  const owner = ownerName.trim().toLocaleLowerCase();
  const parties = [record.from, record.to].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  const counterparty = parties.find(
    (value) => value.trim().toLocaleLowerCase() !== owner,
  );

  return counterparty ?? parties[0] ?? "Unknown";
}

function resolveSender(
  record: ChatRecord,
  conversation: string,
  ownerName: string,
  keyIsSentCategory: boolean,
): string {
  const isSender = record.isSender ?? (keyIsSentCategory ? true : null);
  if (isSender === true) {
    return ownerName;
  }
  if (isSender === false) {
    return record.from ?? conversation;
  }
  return record.from ?? conversation;
}

async function readJsonEntry(
  entries: ZipEntryMap,
  path: string,
): Promise<unknown> {
  const size = entries.entrySize(path);
  if (size !== null && size > MAX_JSON_ENTRY_BYTES) {
    throw new Error(
      `Snapchat JSON entry is too large to import in the browser (${size} bytes): ${path}`,
    );
  }
  return parseJson(
    await entries.readText(path, { maxBytes: MAX_JSON_ENTRY_BYTES }),
    path,
  );
}

function findEntry(entries: ZipEntryMap, basename: string): string | null {
  const target = basename.toLowerCase();
  return (
    entries.paths().find((path) => entryBasename(path).toLowerCase() === target) ??
    null
  );
}

/** The archive owner's own username, used as the sender on outgoing messages. */
async function readOwnerName(entries: ZipEntryMap): Promise<string | null> {
  const path = findEntry(entries, "account.json");
  if (path === null) {
    return null;
  }

  const parsed = await readJsonEntry(entries, path);
  if (!isRecord(parsed)) {
    return null;
  }

  const basic = pick(parsed, "Basic Information", "Basic information");
  const source = isRecord(basic) ? basic : parsed;
  return (
    readString(pick(source, "Username")) ??
    readString(pick(source, "Name", "Display Name"))
  );
}

async function parseChatHistory(
  entries: ZipEntryMap,
  ownerName: string,
  batch: ValidatedBatchEmitter,
  progress: (label: string) => void,
): Promise<number> {
  const path = findEntry(entries, "chat_history.json");
  if (path === null) {
    return 0;
  }

  progress("Reading Snapchat chats…");
  const parsed = await readJsonEntry(entries, path);
  if (!isRecord(parsed)) {
    return 0;
  }

  let emitted = 0;
  let ordinal = 0;

  for (const [groupKey, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const keyIsCategory = isCategoryKey(groupKey);
    const keyIsSentCategory = keyIsCategory && SENT_CATEGORY_PATTERN.test(groupKey.trim());

    for (const entry of value) {
      const record = toChatRecord(entry);
      if (record === null) {
        continue;
      }

      const conversation = resolveConversation(
        record,
        groupKey,
        keyIsCategory,
        ownerName,
      );
      const sender = resolveSender(
        record,
        conversation,
        ownerName,
        keyIsSentCategory,
      );
      const mediaKind = snapchatMediaKind(record.mediaType);
      ordinal += 1;

      // Attachments are expired download links, never bytes in the zip.
      const mediaReference =
        mediaKind === null
          ? null
          : `omitted://snapchat/${encodeURIComponent(conversation)}#${ordinal}`;

      if (record.content === null && mediaReference === null) {
        continue;
      }

      await batch.add(
        {
          table: "messages",
          platform: PLATFORM,
          conversation,
          sender,
          sent_at_ms: record.sentAtMs,
          text: record.content,
          media_ref: mediaReference,
        },
        path,
        "Parsing Snapchat chats…",
      );
      emitted += 1;

      if (mediaKind !== null && mediaReference !== null) {
        await batch.add(
          {
            table: "media",
            platform: PLATFORM,
            zip_path: mediaReference,
            kind: mediaKind,
            taken_at_ms: record.sentAtMs,
            conversation,
          },
          path,
          "Parsing Snapchat chat media…",
        );
      }
    }
  }

  await batch.flush("Parsing Snapchat chats…");
  return emitted;
}

async function parseSnapHistory(
  entries: ZipEntryMap,
  ownerName: string,
  batch: ValidatedBatchEmitter,
  progress: (label: string) => void,
): Promise<number> {
  const path = findEntry(entries, "snap_history.json");
  if (path === null) {
    return 0;
  }

  progress("Counting snaps…");
  const parsed = await readJsonEntry(entries, path);
  if (!isRecord(parsed)) {
    return 0;
  }

  let emitted = 0;
  for (const [groupKey, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const direction = SENT_CATEGORY_PATTERN.test(groupKey.trim())
      ? "sent"
      : "received";

    for (const entry of value) {
      const record = toChatRecord(entry);
      if (record === null) {
        continue;
      }
      const conversation = resolveConversation(
        record,
        groupKey,
        isCategoryKey(groupKey),
        ownerName,
      );

      await batch.add(
        {
          table: "events",
          platform: PLATFORM,
          kind: "snap",
          occurred_at_ms: record.sentAtMs,
          payload: stringifyJson(
            {
              conversation,
              direction,
              mediaType: record.mediaType,
            },
            path,
          ),
        },
        path,
        "Counting snaps…",
      );
      emitted += 1;
    }
  }

  await batch.flush("Counting snaps…");
  return emitted;
}

async function parseFriends(
  entries: ZipEntryMap,
  batch: ValidatedBatchEmitter,
  progress: (label: string) => void,
): Promise<number> {
  const path = findEntry(entries, "friends.json");
  if (path === null) {
    return 0;
  }

  progress("Reading your friends list…");
  const parsed = await readJsonEntry(entries, path);
  if (!isRecord(parsed)) {
    return 0;
  }

  const current = parsed["Friends"];
  if (!Array.isArray(current)) {
    return 0;
  }

  let emitted = 0;
  for (const entry of current) {
    if (!isRecord(entry)) {
      continue;
    }
    const username = readString(pick(entry, "Username", "User Name"));
    if (username === null) {
      continue;
    }
    const occurredAtMs = parseSnapchatTimestamp(entry) ?? 0;
    const payload = stringifyJson(
      {
        href: null,
        name: readString(pick(entry, "Display Name", "Name")) ?? username,
        value: username,
      },
      path,
    );

    // Snapchat friendship is mutual by construction, so a friend is both a
    // follower and a following — which is exactly what the mutuals query wants.
    for (const kind of ["follower", "following"] as const) {
      await batch.add(
        {
          table: "events",
          platform: PLATFORM,
          kind,
          occurred_at_ms: occurredAtMs,
          payload,
        },
        path,
        "Reading your friends list…",
      );
      emitted += 1;
    }
  }

  await batch.flush("Reading your friends list…");
  return emitted;
}

async function parseCalls(
  entries: ZipEntryMap,
  ownerName: string,
  batch: ValidatedBatchEmitter,
  progress: (label: string) => void,
): Promise<number> {
  const path = findEntry(entries, "talk_history.json");
  if (path === null) {
    return 0;
  }

  progress("Timing your calls…");
  const parsed = await readJsonEntry(entries, path);
  if (!isRecord(parsed)) {
    return 0;
  }

  let emitted = 0;
  for (const [groupKey, value] of Object.entries(parsed)) {
    if (!Array.isArray(value)) {
      continue;
    }

    for (const entry of value) {
      if (!isRecord(entry)) {
        continue;
      }
      const occurredAtMs = parseSnapchatTimestamp(entry);
      const durationSec = parseDurationSeconds(
        pick(entry, "Duration", "Length", "Call Duration"),
      );
      if (occurredAtMs === null || durationSec === null || durationSec <= 0) {
        continue;
      }

      const record = toChatRecord(entry);
      const conversation =
        record === null
          ? groupKey
          : resolveConversation(
              record,
              groupKey,
              isCategoryKey(groupKey),
              ownerName,
            );
      const type = (readString(pick(entry, "Type", "Media Type")) ?? "").toUpperCase();

      await batch.add(
        {
          table: "events",
          platform: PLATFORM,
          kind: "call",
          occurred_at_ms: occurredAtMs,
          payload: stringifyJson(
            {
              media: type.includes("VIDEO") ? "video" : "voice",
              durationSec,
              conversation,
              text: null,
            },
            path,
          ),
        },
        path,
        "Timing your calls…",
      );
      emitted += 1;
    }
  }

  await batch.flush("Timing your calls…");
  return emitted;
}

/**
 * Register the media a part actually carries.
 *
 * A 9-part export puts the JSON in one zip and gigabytes of memories in the
 * rest. Those parts used to be rejected outright; walking their entries costs
 * nothing (the central directory is already open, no bytes are read) and turns
 * each one into real rows instead of an error.
 */
async function parseMediaEntries(
  entries: ZipEntryMap,
  batch: ValidatedBatchEmitter,
  progress: (label: string) => void,
): Promise<number> {
  const mediaPaths = entries.paths().filter((path) => {
    const segments = entryPathSegments(path).map((segment) =>
      segment.toLowerCase(),
    );
    if (!segments.some((segment) => SNAPCHAT_MEDIA_DIRECTORIES.has(segment))) {
      return false;
    }
    const extension = entryBasename(path).split(".").pop()?.toLowerCase() ?? "";
    return MEDIA_EXTENSIONS.has(extension);
  });

  if (mediaPaths.length === 0) {
    return 0;
  }

  progress(`Cataloguing ${mediaPaths.length.toLocaleString()} media files…`);

  for (const path of mediaPaths) {
    const basename = entryBasename(path);
    const extension = basename.split(".").pop()?.toLowerCase() ?? "";
    const kind = MEDIA_EXTENSIONS.get(extension) ?? "other";

    const dateMatch = MEDIA_DATE_PREFIX.exec(basename);
    const takenAtMs =
      dateMatch === null
        ? null
        : Date.UTC(
            Number.parseInt(dateMatch[1], 10),
            Number.parseInt(dateMatch[2], 10) - 1,
            Number.parseInt(dateMatch[3], 10),
          );

    const folder = entryPathSegments(path)
      .map((segment) => segment.toLowerCase())
      .find((segment) => SNAPCHAT_MEDIA_DIRECTORIES.has(segment));

    await batch.add(
      {
        table: "media",
        platform: PLATFORM,
        zip_path: path,
        kind,
        taken_at_ms:
          takenAtMs !== null && Number.isFinite(takenAtMs) ? takenAtMs : null,
        conversation: folder === "chat_media" ? null : "Memories",
      },
      path,
      "Cataloguing Snapchat media…",
    );
  }

  await batch.flush("Cataloguing Snapchat media…");
  return mediaPaths.length;
}

export const snapchatParser: DataParser = {
  id: "snapchat",
  displayName: "Snapchat",

  detect(entryPaths, context) {
    if (hasInstagramMarker(entryPaths) || hasFacebookMarker(entryPaths)) {
      return false;
    }

    // A split export names itself: only one part carries the JSON, so the
    // other eight are recognizable by the archive name and nothing else.
    if (isSnapchatArchiveName(context?.fileName)) {
      return true;
    }

    return entryPaths.some((path) => {
      if (SNAPCHAT_JSON_BASENAMES.has(entryBasename(path).toLowerCase())) {
        return true;
      }
      const segments = entryPathSegments(path).map((segment) =>
        segment.toLowerCase(),
      );
      // The wrapper folder carries the same `mydata~<id>` name as the zip.
      if (segments.some((segment) => SNAPCHAT_ARCHIVE_NAME.test(segment))) {
        return true;
      }
      // A media folder only counts alongside the export's own scaffolding,
      // since "memories/" on its own is far too generic to claim.
      return (
        segments.some((segment) => SNAPCHAT_MEDIA_DIRECTORIES.has(segment)) &&
        segments.some((segment) => segment === "json" || segment === "html")
      );
    });
  },

  async parse(entries, emit, progress) {
    const batch = new ValidatedBatchEmitter(emit, progress);
    const report = (label: string) => progress({ done: batch.emitted, label });

    report("Opening your Snapchat export…");
    const ownerName = (await readOwnerName(entries)) ?? "You";

    if (ownerName !== "You") {
      await batch.add(
        {
          table: "events",
          platform: PLATFORM,
          kind: "archive_owner",
          occurred_at_ms: 0,
          payload: stringifyJson({ name: ownerName }, "account.json"),
        },
        "account.json",
        "Reading your account…",
      );
    }

    await parseChatHistory(entries, ownerName, batch, report);
    await parseSnapHistory(entries, ownerName, batch, report);
    await parseFriends(entries, batch, report);
    await parseCalls(entries, ownerName, batch, report);
    await parseMediaEntries(entries, batch, report);

    // A split export is mostly media parts with no history in them at all, so
    // an empty part is normal rather than a failure. Only a part carrying
    // nothing we can read in any category is worth refusing.
    if (batch.emitted === 0) {
      throw new Error(
        "This Snapchat part contains no chats, snaps, friends or media we can read",
      );
    }

    await batch.finish("Snapchat archive parsed");
  },
};

export default snapchatParser;
