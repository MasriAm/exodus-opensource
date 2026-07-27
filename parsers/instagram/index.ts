import { z } from "zod";

import {
  conversationStorageKey,
  isInstagramSystemMessage,
  stripInstagramFolderId,
} from "../../lib/instagram-labels";
import { fixMojibake } from "../../lib/text";
import { ValidatedBatchEmitter } from "../batch";
import { parseJson, stringifyJson, validateJson } from "../json";
import {
  containsPathSequence,
  entryBasename,
  entryPathSegments,
  hasInstagramMarker,
  resolveReferencedPath,
} from "../paths";
import type { DataParser } from "../types";
import type { ZipEntryMap } from "../../lib/zip";

/** Single JSON files larger than this are refused (browser memory guard). */
const MAX_JSON_ENTRY_BYTES = 48 * 1024 * 1024;

async function readJsonEntry(entries: ZipEntryMap, path: string): Promise<unknown> {
  const size = entries.entrySize(path);
  if (size !== null && size > MAX_JSON_ENTRY_BYTES) {
    throw new Error(
      `Instagram JSON entry is too large to import in the browser (${size} bytes): ${path}`,
    );
  }
  return parseJson(
    await entries.readText(path, { maxBytes: MAX_JSON_ENTRY_BYTES }),
    path,
  );
}

const attachmentSchema = z.object({
  uri: z.string().min(1),
  creation_timestamp: z.number().optional(),
});

const instagramMessageSchema = z.object({
  sender_name: z.string(),
  timestamp_ms: z.number().int(),
  content: z.string().nullable().optional(),
  photos: z.array(attachmentSchema).optional(),
  videos: z.array(attachmentSchema).optional(),
  audio_files: z.array(attachmentSchema).optional(),
  files: z.array(attachmentSchema).optional(),
  gifs: z.array(attachmentSchema).optional(),
  media: z.array(attachmentSchema).optional(),
  sticker: attachmentSchema.optional(),
});

const messageThreadSchema = z.object({
  participants: z.array(z.object({ name: z.string() })).optional(),
  messages: z.array(instagramMessageSchema),
  title: z.string().optional(),
  thread_path: z.string().optional(),
});

const connectionDatumSchema = z.object({
  href: z.string().optional(),
  value: z.string().optional(),
  timestamp: z.number().int(),
});

const connectionEntrySchema = z.object({
  title: z.string().optional(),
  string_list_data: z.array(connectionDatumSchema),
});

const connectionEntriesSchema = z.array(connectionEntrySchema);

type Attachment = z.infer<typeof attachmentSchema>;
type InstagramMessage = z.infer<typeof instagramMessageSchema>;
type ConnectionEntry = z.infer<typeof connectionEntrySchema>;
type MediaKind = "image" | "video" | "audio" | "other";

interface MessageEntryInfo {
  conversation: string;
  page: number;
  path: string;
}

interface ConnectionEntryInfo {
  kind: "follower" | "following";
  path: string;
}

interface PendingAttachment {
  attachment: Attachment;
  fallbackKind: MediaKind;
}

interface TimedPersonalRecord {
  occurredAtMs: number;
  path: string;
  value: Readonly<Record<string, unknown>>;
}

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "jpeg",
  "jpg",
  "png",
  "webp",
]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "webm"]);
const AUDIO_EXTENSIONS = new Set([
  "aac",
  "m4a",
  "mp3",
  "ogg",
  "opus",
  "wav",
]);
const PERSONAL_TIMESTAMP_KEYS = [
  "timestamp_ms",
  "timestamp",
  "creation_timestamp",
  "created_timestamp",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repairInstagramStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return fixMojibake(value);
  }
  if (Array.isArray(value)) {
    return value.map(repairInstagramStrings);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        repairInstagramStrings(child),
      ]),
    );
  }
  return value;
}

function epochToMilliseconds(value: number, source: string): number {
  const milliseconds =
    Math.abs(value) < 100_000_000_000 ? value * 1_000 : value;
  const rounded = Math.round(milliseconds);

  if (!Number.isSafeInteger(rounded)) {
    throw new Error(`Timestamp in ${source} is outside the supported range`);
  }
  return rounded;
}

function messageEntryInfo(path: string): MessageEntryInfo | null {
  const segments = entryPathSegments(path);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const markerIndex = lowerSegments.indexOf("your_instagram_activity");
  const messagesIndex = containsPathSequence(path, ["messages", "inbox"]);

  if (
    markerIndex < 0 ||
    messagesIndex !== markerIndex + 1 ||
    segments.length !== messagesIndex + 4
  ) {
    return null;
  }

  const filename = segments[messagesIndex + 3];
  const match = /^message_(\d+)\.json$/i.exec(filename);
  if (match === null) {
    return null;
  }

  return {
    path,
    conversation: conversationStorageKey(
      fixMojibake(segments[messagesIndex + 2]),
    ),
    page: Number.parseInt(match[1], 10),
  };
}

function connectionEntryInfo(path: string): ConnectionEntryInfo | null {
  const sequenceIndex = containsPathSequence(path, [
    "connections",
    "followers_and_following",
  ]);
  const segments = entryPathSegments(path);
  if (sequenceIndex < 0 || segments.length !== sequenceIndex + 3) {
    return null;
  }

  const filename = entryBasename(path);
  if (/^followers(?:_\d+)?\.json$/i.test(filename)) {
    return { kind: "follower", path };
  }
  if (/^following(?:_\d+)?\.json$/i.test(filename)) {
    return { kind: "following", path };
  }
  return null;
}

function isPersonalInformationPath(path: string): boolean {
  const sequenceIndex = containsPathSequence(path, [
    "personal_information",
    "personal_information.json",
  ]);
  const segments = entryPathSegments(path);
  return sequenceIndex >= 0 && segments.length === sequenceIndex + 2;
}

function isCommentsPath(path: string): boolean {
  const segments = entryPathSegments(path);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const commentsIndex = lowerSegments.lastIndexOf("comments");
  if (commentsIndex < 0 || commentsIndex !== segments.length - 2) {
    return false;
  }
  return /^post_comments(?:_\d+)?\.json$/i.test(segments[commentsIndex + 1]);
}

function isAdsInterestsPath(path: string): boolean {
  const filename = entryBasename(path).toLowerCase();
  if (filename !== "ads_interests.json") {
    return false;
  }
  const segments = entryPathSegments(path);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  return (
    lowerSegments.includes("ads_and_topics") ||
    lowerSegments.includes("information_about_you")
  );
}

function isProfileChangesPath(path: string): boolean {
  const sequenceIndex = containsPathSequence(path, [
    "personal_information",
    "profile_changes.json",
  ]);
  const segments = entryPathSegments(path);
  return sequenceIndex >= 0 && segments.length === sequenceIndex + 2;
}

function normalizeProfileField(value: string): "username" | "bio" | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "username" ||
    normalized === "user name" ||
    normalized.startsWith("username")
  ) {
    return "username";
  }
  if (
    normalized === "bio" ||
    normalized === "biography" ||
    normalized.startsWith("bio ")
  ) {
    return "bio";
  }
  return null;
}

function inferMediaKind(path: string, fallback: MediaKind): MediaKind {
  const pathWithoutQuery = path.split(/[?#]/, 1)[0].toLowerCase();
  const extension = pathWithoutQuery.includes(".")
    ? pathWithoutQuery.slice(pathWithoutQuery.lastIndexOf(".") + 1)
    : "";

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }
  return fallback;
}

function collectAttachments(message: InstagramMessage): PendingAttachment[] {
  const attachments: PendingAttachment[] = [];
  const append = (
    items: readonly Attachment[] | undefined,
    fallbackKind: MediaKind,
  ) => {
    for (const attachment of items ?? []) {
      attachments.push({ attachment, fallbackKind });
    }
  };

  append(message.photos, "image");
  append(message.videos, "video");
  append(message.audio_files, "audio");
  append(message.files, "other");
  append(message.gifs, "image");
  append(message.media, "other");
  if (message.sticker !== undefined) {
    attachments.push({
      attachment: message.sticker,
      fallbackKind: "image",
    });
  }

  const seenUris = new Set<string>();
  return attachments.filter(({ attachment }) => {
    if (seenUris.has(attachment.uri)) {
      return false;
    }
    seenUris.add(attachment.uri);
    return true;
  });
}

function extractConnectionEntries(
  value: unknown,
  source: string,
): ConnectionEntry[] {
  const direct = connectionEntriesSchema.safeParse(value);
  if (direct.success) {
    return direct.data;
  }

  if (!isRecord(value)) {
    return validateJson(connectionEntriesSchema, value, source);
  }

  const entries: ConnectionEntry[] = [];
  const collections = Object.entries(value);
  if (collections.length === 0) {
    return entries;
  }

  for (const [collectionName, collection] of collections) {
    entries.push(
      ...validateJson(
        connectionEntriesSchema,
        collection,
        `${source}#${collectionName}`,
      ),
    );
  }
  return entries;
}

function findTimedPersonalRecords(
  value: unknown,
  path: string,
  output: TimedPersonalRecord[],
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      findTimedPersonalRecords(child, `${path}[${index}]`, output);
    });
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  for (const timestampKey of PERSONAL_TIMESTAMP_KEYS) {
    const timestamp = value[timestampKey];
    if (
      typeof timestamp === "number" &&
      Number.isFinite(timestamp) &&
      timestamp > 0
    ) {
      output.push({
        occurredAtMs: epochToMilliseconds(timestamp, path),
        path,
        value,
      });
      return;
    }
  }

  for (const [key, child] of Object.entries(value)) {
    findTimedPersonalRecords(child, `${path}.${key}`, output);
  }
}

async function parseMessages(
  entries: Parameters<DataParser["parse"]>[0],
  paths: readonly string[],
  messageEntries: readonly MessageEntryInfo[],
  batch: ValidatedBatchEmitter,
): Promise<void> {
  for (const entry of messageEntries) {
    const raw = await readJsonEntry(entries, entry.path);
    const repaired = repairInstagramStrings(raw);
    const thread = validateJson(messageThreadSchema, repaired, entry.path);
    // Folder slug is `username_numericId` — keep the handle, drop the id
    // (except "Instagram User" deleted threads which keep the id).
    const conversation = conversationStorageKey(entry.conversation);

    for (const message of thread.messages) {
      const attachments = collectAttachments(message).map(
        ({ attachment, fallbackKind }) => ({
          attachment,
          fallbackKind,
          zipPath: resolveReferencedPath(paths, attachment.uri),
        }),
      );
      const systemText = isInstagramSystemMessage(message.content ?? null);
      // Skip pure Instagram log lines with no media (likes, reacts, "sent an attachment" without files).
      if (systemText && attachments.length === 0) {
        continue;
      }

      await batch.add(
        {
          table: "messages",
          platform: "instagram",
          conversation,
          sender: stripInstagramFolderId(message.sender_name),
          sent_at_ms: message.timestamp_ms,
          // Keep media rows; drop system placeholder copy so it doesn't pollute word stats.
          text: systemText ? null : (message.content ?? null),
          media_ref: attachments[0]?.zipPath ?? null,
        },
        entry.path,
        "Parsing Instagram messages…",
      );

      for (const { attachment, fallbackKind, zipPath } of attachments) {
        await batch.add(
          {
            table: "media",
            platform: "instagram",
            zip_path: zipPath,
            kind: inferMediaKind(zipPath, fallbackKind),
            taken_at_ms:
              attachment.creation_timestamp === undefined
                ? null
                : epochToMilliseconds(
                    attachment.creation_timestamp,
                    entry.path,
                  ),
            conversation,
          },
          entry.path,
          "Parsing Instagram media…",
        );
      }
    }

    await batch.flush("Parsing Instagram messages…");
  }
}

async function parseConnections(
  entries: Parameters<DataParser["parse"]>[0],
  connectionEntries: readonly ConnectionEntryInfo[],
  batch: ValidatedBatchEmitter,
): Promise<void> {
  for (const entry of connectionEntries) {
    const raw = await readJsonEntry(entries, entry.path);
    const repaired = repairInstagramStrings(raw);
    const connections = extractConnectionEntries(repaired, entry.path);

    for (const connection of connections) {
      for (const datum of connection.string_list_data) {
        await batch.add(
          {
            table: "events",
            platform: "instagram",
            kind: entry.kind,
            occurred_at_ms: epochToMilliseconds(
              datum.timestamp,
              entry.path,
            ),
            payload: stringifyJson(
              {
                href: datum.href ?? null,
                name: connection.title ?? datum.value ?? null,
                value: datum.value ?? null,
              },
              entry.path,
            ),
          },
          entry.path,
          "Parsing Instagram connections…",
        );
      }
    }

    await batch.flush("Parsing Instagram connections…");
  }
}

async function parsePersonalInformation(
  entries: Parameters<DataParser["parse"]>[0],
  personalInformationPaths: readonly string[],
  batch: ValidatedBatchEmitter,
): Promise<void> {
  for (const path of personalInformationPaths) {
    const raw = await readJsonEntry(entries, path);
    const repaired = repairInstagramStrings(raw);
    const timedRecords: TimedPersonalRecord[] = [];
    findTimedPersonalRecords(repaired, "$", timedRecords);

    // Untimed profile fields cannot satisfy the normalized event model without
    // inventing a date, so only records carrying their own timestamp are kept.
    for (const record of timedRecords) {
      await batch.add(
        {
          table: "events",
          platform: "instagram",
          kind: "personal_info",
          occurred_at_ms: record.occurredAtMs,
          payload: stringifyJson(
            { data: record.value, path: record.path },
            path,
          ),
        },
        path,
        "Parsing Instagram personal information…",
      );
    }

    await batch.flush("Parsing Instagram personal information…");
  }
}

async function parseComments(
  entries: Parameters<DataParser["parse"]>[0],
  commentPaths: readonly string[],
  batch: ValidatedBatchEmitter,
  progress: Parameters<DataParser["parse"]>[2],
): Promise<void> {
  for (const path of commentPaths) {
    try {
      const raw = await readJsonEntry(entries, path);
      const repaired = repairInstagramStrings(raw);
      const comments = extractConnectionEntries(repaired, path);

      for (const comment of comments) {
        for (const datum of comment.string_list_data) {
          const text = datum.value?.trim() ?? "";
          if (text.length === 0) {
            continue;
          }
          await batch.add(
            {
              table: "events",
              platform: "instagram",
              kind: "comment",
              occurred_at_ms: epochToMilliseconds(datum.timestamp, path),
              payload: stringifyJson(
                {
                  text,
                  href: datum.href ?? null,
                  title: comment.title ?? null,
                },
                path,
              ),
            },
            path,
            "Parsing Instagram comments…",
          );
        }
      }

      await batch.flush("Parsing Instagram comments…");
    } catch (error: unknown) {
      console.warn("Skipping Instagram comments file:", path, error);
      progress({
        done: batch.emitted,
        label: "Skipping malformed Instagram comments…",
      });
    }
  }
}

async function parseAdsInterests(
  entries: Parameters<DataParser["parse"]>[0],
  interestPaths: readonly string[],
  batch: ValidatedBatchEmitter,
  progress: Parameters<DataParser["parse"]>[2],
): Promise<void> {
  for (const path of interestPaths) {
    try {
      const raw = await readJsonEntry(entries, path);
      const repaired = repairInstagramStrings(raw);
      const interests = extractConnectionEntries(repaired, path);

      for (const interest of interests) {
        for (const datum of interest.string_list_data) {
          const topic =
            datum.value?.trim() || interest.title?.trim() || "";
          if (topic.length === 0) {
            continue;
          }
          await batch.add(
            {
              table: "events",
              platform: "instagram",
              kind: "interest",
              occurred_at_ms: epochToMilliseconds(datum.timestamp, path),
              payload: stringifyJson({ topic }, path),
            },
            path,
            "Parsing Instagram ads interests…",
          );
        }
      }

      await batch.flush("Parsing Instagram ads interests…");
    } catch (error: unknown) {
      console.warn("Skipping Instagram ads interests file:", path, error);
      progress({
        done: batch.emitted,
        label: "Skipping malformed Instagram ads interests…",
      });
    }
  }
}

async function parseProfileChanges(
  entries: Parameters<DataParser["parse"]>[0],
  profileChangePaths: readonly string[],
  batch: ValidatedBatchEmitter,
  progress: Parameters<DataParser["parse"]>[2],
): Promise<void> {
  for (const path of profileChangePaths) {
    try {
      const raw = await readJsonEntry(entries, path);
      const repaired = repairInstagramStrings(raw);
      const collections = isRecord(repaired)
        ? Object.values(repaired)
        : Array.isArray(repaired)
          ? [repaired]
          : [];

      for (const collection of collections) {
        if (!Array.isArray(collection)) {
          continue;
        }
        for (const entry of collection) {
          if (!isRecord(entry)) {
            continue;
          }
          const mapData = entry.string_map_data;
          if (!isRecord(mapData)) {
            continue;
          }
          const changed = isRecord(mapData.Changed) ? mapData.Changed : null;
          const newValue = isRecord(mapData["New Value"])
            ? mapData["New Value"]
            : null;
          const fieldSource =
            (typeof entry.title === "string" ? entry.title : null) ??
            (typeof changed?.value === "string" ? changed.value : null) ??
            "";
          const field = normalizeProfileField(fieldSource);
          const value =
            typeof newValue?.value === "string" ? newValue.value.trim() : "";
          const timestamp =
            (typeof newValue?.timestamp === "number"
              ? newValue.timestamp
              : null) ??
            (typeof changed?.timestamp === "number"
              ? changed.timestamp
              : null);
          if (field === null || value.length === 0 || timestamp === null) {
            continue;
          }
          await batch.add(
            {
              table: "events",
              platform: "instagram",
              kind: "profile_change",
              occurred_at_ms: epochToMilliseconds(timestamp, path),
              payload: stringifyJson({ field, value }, path),
            },
            path,
            "Parsing Instagram profile changes…",
          );
        }
      }

      await batch.flush("Parsing Instagram profile changes…");
    } catch (error: unknown) {
      console.warn("Skipping Instagram profile changes file:", path, error);
      progress({
        done: batch.emitted,
        label: "Skipping malformed Instagram profile changes…",
      });
    }
  }
}

export const instagramParser: DataParser = {
  id: "instagram",
  displayName: "Instagram",

  detect(entryPaths) {
    return hasInstagramMarker(entryPaths);
  },

  async parse(entries, emit, progress) {
    const paths = entries.paths();
    const messageEntries = paths
      .map(messageEntryInfo)
      .filter((entry): entry is MessageEntryInfo => entry !== null)
      .sort(
        (left, right) =>
          left.conversation.localeCompare(right.conversation, "en") ||
          left.page - right.page ||
          left.path.localeCompare(right.path, "en"),
      );
    const connectionEntries = paths
      .map(connectionEntryInfo)
      .filter((entry): entry is ConnectionEntryInfo => entry !== null)
      .sort((left, right) => left.path.localeCompare(right.path, "en"));
    const personalInformationPaths = paths
      .filter(isPersonalInformationPath)
      .sort((left, right) => left.localeCompare(right, "en"));
    const commentPaths = paths
      .filter(isCommentsPath)
      .sort((left, right) => left.localeCompare(right, "en"));
    const adsInterestPaths = paths
      .filter(isAdsInterestsPath)
      .sort((left, right) => left.localeCompare(right, "en"));
    const profileChangePaths = paths
      .filter(isProfileChangesPath)
      .sort((left, right) => left.localeCompare(right, "en"));
    const batch = new ValidatedBatchEmitter(emit, progress);

    progress({ done: 0, label: "Parsing Instagram archive…" });
    await parseMessages(entries, paths, messageEntries, batch);
    await parseConnections(entries, connectionEntries, batch);
    await parsePersonalInformation(
      entries,
      personalInformationPaths,
      batch,
    );
    await parseComments(entries, commentPaths, batch, progress);
    await parseAdsInterests(entries, adsInterestPaths, batch, progress);
    await parseProfileChanges(entries, profileChangePaths, batch, progress);
    await batch.finish("Instagram archive parsed");
  },
};

export default instagramParser;
