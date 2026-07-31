import { z } from "zod";

import {
  isInstagramSystemMessage,
  stripInstagramFolderId,
} from "../../lib/instagram-labels";
import { fixMojibake } from "../../lib/text";
import { ValidatedBatchEmitter } from "../batch";
import { parseJson, stringifyJson, validateJson } from "../json";
import {
  containsPathSequence,
  entryPathSegments,
  hasFacebookMarker,
  resolveReferencedPath,
} from "../paths";
import type { DataParser } from "../types";
import type { ZipEntryMap } from "../../lib/zip";

const MAX_JSON_ENTRY_BYTES = 48 * 1024 * 1024;

async function readJsonEntry(entries: ZipEntryMap, path: string): Promise<unknown> {
  const size = entries.entrySize(path);
  if (size !== null && size > MAX_JSON_ENTRY_BYTES) {
    throw new Error(
      `Facebook JSON entry is too large to import in the browser (${size} bytes): ${path}`,
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

const facebookMessageSchema = z.object({
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
  messages: z.array(facebookMessageSchema),
  title: z.string().optional(),
  thread_path: z.string().optional(),
});

type Attachment = z.infer<typeof attachmentSchema>;
type FacebookMessage = z.infer<typeof facebookMessageSchema>;
type MediaKind = "image" | "video" | "audio" | "other";

interface MessageEntryInfo {
  conversation: string;
  page: number;
  path: string;
}

interface PendingAttachment {
  attachment: Attachment;
  fallbackKind: MediaKind;
}

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "heic", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "webm"]);
const AUDIO_EXTENSIONS = new Set(["aac", "m4a", "mp3", "ogg", "opus", "wav"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repairFacebookStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return fixMojibake(value);
  }
  if (Array.isArray(value)) {
    return value.map(repairFacebookStrings);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, repairFacebookStrings(child)]),
    );
  }
  return value;
}

function epochToMilliseconds(value: number, source: string): number {
  const milliseconds = Math.abs(value) < 100_000_000_000 ? value * 1_000 : value;
  const rounded = Math.round(milliseconds);

  if (!Number.isSafeInteger(rounded)) {
    throw new Error(`Timestamp in ${source} is outside the supported range`);
  }
  return rounded;
}

function messageEntryInfo(path: string): MessageEntryInfo | null {
  const segments = entryPathSegments(path);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const markerIndex = lowerSegments.indexOf("your_facebook_activity");
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
    conversation: stripInstagramFolderId(fixMojibake(segments[messagesIndex + 2])),
    page: Number.parseInt(match[1], 10),
  };
}

function isProfileInformationPath(path: string): boolean {
  const segments = entryPathSegments(path).map((s) => s.toLowerCase());
  if (segments.length < 2) return false;
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];
  return last === "profile_information.json" && (prev === "profile_information");
}

function inferMediaKind(path: string, fallback: MediaKind): MediaKind {
  if (fallback !== "other") {
    return fallback;
  }
  const pathWithoutQuery = path.split(/[?#]/, 1)[0].toLowerCase();
  const extension = pathWithoutQuery.includes(".")
    ? pathWithoutQuery.slice(pathWithoutQuery.lastIndexOf(".") + 1)
    : "";

  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  return fallback;
}

function collectAttachments(message: FacebookMessage): PendingAttachment[] {
  const attachments: PendingAttachment[] = [];
  const append = (items: readonly Attachment[] | undefined, fallbackKind: MediaKind) => {
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
    attachments.push({ attachment: message.sticker, fallbackKind: "image" });
  }

  const seenUris = new Set<string>();
  return attachments.filter(({ attachment }) => {
    if (seenUris.has(attachment.uri)) return false;
    seenUris.add(attachment.uri);
    return true;
  });
}

async function parseMessages(
  entries: Parameters<DataParser["parse"]>[0],
  paths: readonly string[],
  messageEntries: readonly MessageEntryInfo[],
  batch: ValidatedBatchEmitter,
): Promise<void> {
  for (const entry of messageEntries) {
    const raw = await readJsonEntry(entries, entry.path);
    const repaired = repairFacebookStrings(raw);
    const thread = validateJson(messageThreadSchema, repaired, entry.path);
    const conversation = stripInstagramFolderId(entry.conversation);

    for (const message of thread.messages) {
      const attachments = collectAttachments(message).map(({ attachment, fallbackKind }) => ({
        attachment,
        fallbackKind,
        zipPath: resolveReferencedPath(paths, attachment.uri),
      }));
      const systemText = isInstagramSystemMessage(message.content ?? null);
      if (systemText && attachments.length === 0) continue;

      await batch.add(
        {
          table: "messages",
          platform: "facebook",
          conversation,
          sender: stripInstagramFolderId(message.sender_name),
          sent_at_ms: message.timestamp_ms,
          text: systemText ? null : (message.content ?? null),
          media_ref: attachments[0]?.zipPath ?? null,
        },
        entry.path,
        "Parsing Facebook messages…",
      );

      for (const { attachment, fallbackKind, zipPath } of attachments) {
        await batch.add(
          {
            table: "media",
            platform: "facebook",
            zip_path: zipPath,
            kind: inferMediaKind(zipPath, fallbackKind),
            taken_at_ms: attachment.creation_timestamp === undefined ? null : epochToMilliseconds(attachment.creation_timestamp, entry.path),
            conversation,
          },
          entry.path,
          "Parsing Facebook media…",
        );
      }
    }
    await batch.flush("Parsing Facebook messages…");
  }
}

async function parseProfileInformation(
  entries: Parameters<DataParser["parse"]>[0],
  profileInformationPaths: readonly string[],
  batch: ValidatedBatchEmitter,
): Promise<void> {
  for (const path of profileInformationPaths) {
    const raw = await readJsonEntry(entries, path);
    const repaired = repairFacebookStrings(raw);
    
    let ownerName = null;
    
    // Check various known Facebook shapes
    if (isRecord(repaired)) {
      if (Array.isArray(repaired.profile_v2) && isRecord(repaired.profile_v2[0])) {
        const profile = repaired.profile_v2[0];
        if (isRecord(profile.name) && typeof profile.name.full_name === "string") {
           ownerName = profile.name.full_name;
        }
      } else if (isRecord(repaired.profile_v2)) {
        const profile = repaired.profile_v2;
        if (isRecord(profile.name) && typeof profile.name.full_name === "string") {
           ownerName = profile.name.full_name;
        }
      } else if (isRecord(repaired.profile)) {
        const profile = repaired.profile;
        if (isRecord(profile.name) && typeof profile.name.full_name === "string") {
           ownerName = profile.name.full_name;
        } else if (typeof profile.name === "string") {
           ownerName = profile.name;
        }
      }
    }
    
    if (ownerName) {
        await batch.add(
          {
            table: "events",
            platform: "facebook",
            kind: "archive_owner",
            occurred_at_ms: 0,
            payload: stringifyJson({ name: ownerName }, path),
          },
          path,
          "Extracting archive owner name…",
        );
      }
    await batch.flush("Parsing Facebook profile information…");
  }
}


export const facebookParser: DataParser = {
  id: "facebook",
  displayName: "Facebook",

  detect(entryPaths) {
    return hasFacebookMarker(entryPaths);
  },

  async parse(entries, emit, progress) {
    const paths = entries.paths();
    const messageEntries = paths
      .map(messageEntryInfo)
      .filter((entry): entry is MessageEntryInfo => entry !== null)
      .sort((left, right) => left.conversation.localeCompare(right.conversation, "en") || left.page - right.page || left.path.localeCompare(right.path, "en"));
    
    const profileInformationPaths = paths
      .filter(isProfileInformationPath)
      .sort((left, right) => left.localeCompare(right, "en"));
      
    const batch = new ValidatedBatchEmitter(emit, progress);

    progress({ done: 0, label: "Parsing Facebook archive…" });
    await parseMessages(entries, paths, messageEntries, batch);
    await parseProfileInformation(entries, profileInformationPaths, batch);
    await batch.finish("Facebook archive parsed");
  },
};

export default facebookParser;
