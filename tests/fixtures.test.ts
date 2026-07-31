import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  TextWriter,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  type Entry,
  type FileEntry,
} from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import manifest from "../fixtures/manifest.json";
import { FIXTURE_SEED, generateFixtures } from "../scripts/generate-fixture";

const FIXTURES_DIRECTORY = resolve(process.cwd(), "fixtures");
const INSTAGRAM_MESSAGE_PATH =
  /^your_instagram_activity\/messages\/inbox\/([^/]+)\/message_(\d+)\.json$/;

interface OpenArchive {
  reader: ZipReader<Uint8Array>;
  entries: Entry[];
}

interface ObservedMessage {
  conversation: string;
  sender: string;
  timestampMs: number;
  text: string | null;
}

async function openArchive(filename: string): Promise<OpenArchive> {
  const archiveBytes = Uint8Array.from(
    await readFile(resolve(FIXTURES_DIRECTORY, filename)),
  );
  const reader = new ZipReader(new Uint8ArrayReader(archiveBytes), {
    useCompressionStream: false,
    useWebWorkers: false,
  });
  return {
    reader,
    entries: await reader.getEntries(),
  };
}

function requireFileEntry(
  entries: readonly Entry[],
  filename: string,
): FileEntry {
  const entry = entries.find((candidate) => candidate.filename === filename);
  if (entry === undefined || entry.directory) {
    throw new Error(`Expected file entry ${filename}.`);
  }
  return entry;
}

async function readEntryText(entry: FileEntry): Promise<string> {
  return entry.getData(new TextWriter(), {
    useCompressionStream: false,
    useWebWorkers: false,
  });
}

async function readEntryBytes(entry: FileEntry): Promise<Uint8Array> {
  return entry.getData(new Uint8ArrayWriter(), {
    useCompressionStream: false,
    useWebWorkers: false,
  });
}

function requireRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${description} to be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(
  record: Record<string, unknown>,
  key: string,
  description: string,
): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${description}.${key} to be an array.`);
  }
  return value;
}

function parseJson(text: string, description: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`${description} is not valid JSON.`, { cause: error });
  }
}

function repairFixtureMojibake(value: string): string {
  if ([...value].some((character) => character.charCodeAt(0) > 255)) {
    return value;
  }
  return new TextDecoder().decode(
    Uint8Array.from(value, (character) => character.charCodeAt(0)),
  );
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

describe("generated fixtures", () => {
  it("matches Instagram archive structure and exact manifest counts", async () => {
    const { reader, entries } = await openArchive(manifest.instagram.file);

    try {
      expect(entries).toHaveLength(manifest.instagram.entryCount);
      expect(entries.every((entry) => !entry.directory)).toBe(true);

      const messageEntries = entries.filter(
        (entry): entry is FileEntry =>
          !entry.directory && INSTAGRAM_MESSAGE_PATH.test(entry.filename),
      );
      const photoEntries = entries.filter(
        (entry): entry is FileEntry =>
          !entry.directory && entry.filename.endsWith(".jpg"),
      );

      expect(messageEntries).toHaveLength(
        manifest.instagram.messageJsonEntryCount,
      );
      expect(photoEntries).toHaveLength(manifest.instagram.mediaCount);

      const messagesPerThread: Record<string, number> = {};
      const messagesPerSender: Record<string, number> = {};
      const mediaPerThread: Record<string, number> = {};
      const messagesPerPage: Record<string, number[]> = {};
      const photoReferences = new Set<string>();
      const observedMessages: ObservedMessage[] = [];
      const messagesByHourUtc = Array.from({ length: 24 }, () => 0);
      let messagesWithText = 0;
      let rawMojibakeEscapesFound = false;

      for (const entry of messageEntries) {
        const pathMatch = INSTAGRAM_MESSAGE_PATH.exec(entry.filename);
        if (pathMatch === null) {
          throw new Error(`Unexpected message path ${entry.filename}.`);
        }
        const [, conversation, pageNumberText] = pathMatch;
        const pageNumber = Number(pageNumberText);
        const rawText = await readEntryText(entry);
        rawMojibakeEscapesFound ||= /\\u00d[89]/i.test(rawText);

        const page = requireRecord(
          parseJson(rawText, entry.filename),
          entry.filename,
        );
        const participants = requireArray(
          page,
          "participants",
          entry.filename,
        );
        const messages = requireArray(page, "messages", entry.filename);
        expect(participants.length).toBeGreaterThanOrEqual(2);
        expect(typeof page.title).toBe("string");
        expect(page.thread_path).toBe(`inbox/${conversation}`);

        messagesPerPage[conversation] ??= [];
        messagesPerPage[conversation][pageNumber - 1] = messages.length;
        messagesPerThread[conversation] =
          (messagesPerThread[conversation] ?? 0) + messages.length;

        for (const value of messages) {
          const message = requireRecord(value, "Instagram message");
          if (
            typeof message.sender_name !== "string" ||
            typeof message.timestamp_ms !== "number"
          ) {
            throw new Error("Instagram message has invalid core fields.");
          }

          const sender = repairFixtureMojibake(message.sender_name);
          const text =
            typeof message.content === "string"
              ? repairFixtureMojibake(message.content)
              : null;
          increment(messagesPerSender, sender);
          messagesByHourUtc[
            new Date(message.timestamp_ms).getUTCHours()
          ] += 1;
          if (text !== null) {
            messagesWithText += 1;
          }
          observedMessages.push({
            conversation,
            sender,
            timestampMs: message.timestamp_ms,
            text,
          });

          if (message.photos !== undefined) {
            if (!Array.isArray(message.photos)) {
              throw new Error("Instagram message photos must be an array.");
            }
            for (const photoValue of message.photos) {
              const photo = requireRecord(photoValue, "Instagram photo");
              if (
                typeof photo.uri !== "string" ||
                typeof photo.creation_timestamp !== "number"
              ) {
                throw new Error("Instagram photo has invalid fields.");
              }
              photoReferences.add(photo.uri);
              increment(mediaPerThread, conversation);
              expect(photo.creation_timestamp).toBe(
                Math.floor(message.timestamp_ms / 1_000),
              );
            }
          }
        }
      }

      expect(rawMojibakeEscapesFound).toBe(true);
      expect(observedMessages).toHaveLength(manifest.instagram.messageCount);
      expect(messagesWithText).toBe(manifest.instagram.messagesWithText);
      expect(observedMessages.length - messagesWithText).toBe(
        manifest.instagram.messagesWithoutText,
      );
      expect(messagesPerThread).toEqual(
        manifest.instagram.messagesPerThread,
      );
      expect(messagesPerSender).toEqual(
        manifest.instagram.messagesPerSender,
      );
      expect(mediaPerThread).toEqual(manifest.instagram.mediaPerThread);
      expect(messagesByHourUtc).toEqual(
        manifest.instagram.analytics.messagesByHourUtc,
      );

      for (const [conversation, expected] of Object.entries(
        manifest.instagram.pagination,
      )) {
        expect(messagesPerPage[conversation]).toEqual(
          expected.messagesPerPage,
        );
      }

      expect([...photoReferences].sort()).toEqual(
        photoEntries.map((entry) => entry.filename).sort(),
      );
      for (const photoEntry of photoEntries) {
        const bytes = await readEntryBytes(photoEntry);
        expect([...bytes.slice(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
        expect(new TextDecoder("ascii").decode(bytes.slice(6, 10))).toBe(
          "JFIF",
        );
        expect([...bytes.slice(-2)]).toEqual([0xff, 0xd9]);
      }

      const firstMessage = observedMessages.sort(
        (left, right) => left.timestampMs - right.timestampMs,
      )[0];
      expect(firstMessage).toEqual({
        conversation: manifest.instagram.analytics.firstMessage.conversation,
        sender: manifest.instagram.analytics.firstMessage.sender,
        timestampMs: manifest.instagram.analytics.firstMessage.sentAtMs,
        text: manifest.instagram.analytics.firstMessage.text,
      });

      const followers = parseJson(
        await readEntryText(
          requireFileEntry(
            entries,
            "connections/followers_and_following/followers_1.json",
          ),
        ),
        "followers_1.json",
      );
      if (!Array.isArray(followers)) {
        throw new Error("followers_1.json must contain an array.");
      }
      expect(followers).toHaveLength(manifest.instagram.followersCount);

      const following = requireRecord(
        parseJson(
          await readEntryText(
            requireFileEntry(
              entries,
              "connections/followers_and_following/following.json",
            ),
          ),
          "following.json",
        ),
        "following.json",
      );
      expect(
        requireArray(
          following,
          "relationships_following",
          "following.json",
        ),
      ).toHaveLength(manifest.instagram.followingCount);
      expect(
        manifest.instagram.followersCount +
          manifest.instagram.followingCount +
          manifest.instagram.commentCount +
          manifest.instagram.interestCount +
          manifest.instagram.profileChangeCount +
          (manifest.instagram.eventsPerKind.archive_owner ?? 0),
      ).toBe(manifest.instagram.eventCount);
      expect(manifest.instagram.mutualFollowCount).toBeGreaterThan(0);
      expect(manifest.instagram.cringeCommentCount).toBeGreaterThan(0);

      requireFileEntry(
        entries,
        "personal_information/personal_information.json",
      );
      requireFileEntry(
        entries,
        "personal_information/profile_changes.json",
      );
      requireFileEntry(
        entries,
        "your_instagram_activity/comments/post_comments_1.json",
      );
      requireFileEntry(entries, "ads_and_topics/ads_interests.json");

      expect(manifest.instagram.analytics.firstImageSent.zipPath.length).toBeGreaterThan(
        0,
      );
      expect(
        manifest.instagram.analytics.longestMutualFollows,
      ).toHaveLength(manifest.instagram.mutualFollowCount);
      expect(manifest.instagram.analytics.cringeComments).toHaveLength(
        manifest.instagram.cringeCommentCount,
      );
      expect(manifest.instagram.analytics.interestsByYear.map((row) => row.year)).toEqual(
        [2023, 2024],
      );
      expect(manifest.instagram.analytics.profileHistory).toHaveLength(
        manifest.instagram.profileChangeCount,
      );
      expect(manifest.instagram.analytics.twoToFourAmMessages).toBe(
        manifest.instagram.analytics.messagesByHourUtc[2] +
          manifest.instagram.analytics.messagesByHourUtc[3],
      );
      expect(manifest.instagram.analytics.threeAmMessages).toBe(
        manifest.instagram.analytics.messagesByHourUtc[3],
      );
    } finally {
      await reader.close();
    }
  });

  it("contains both WhatsApp formats and all edge cases", async () => {
    const { reader, entries } = await openArchive(manifest.whatsapp.file);

    try {
      expect(entries).toHaveLength(manifest.whatsapp.entryCount);
      const chat = await readEntryText(
        requireFileEntry(entries, manifest.whatsapp.chatFile),
      );
      const lines = chat.trimEnd().split("\n");
      const textWithoutMarks = chat.replace(/[\u200e\u200f]/g, "");
      const normalizedLines = textWithoutMarks.trimEnd().split("\n");
      const iosTimestamp =
        /^\[\d{1,2}\/\d{1,2}\/\d{2}, \d{1,2}:\d{2}:\d{2} [AP]M\] /;
      const androidTimestamp =
        /^\d{1,2}\/\d{1,2}\/\d{4}, \d{2}:\d{2} - /;
      const iosLines = normalizedLines.filter((line) =>
        iosTimestamp.test(line),
      );
      const androidLines = normalizedLines.filter((line) =>
        androidTimestamp.test(line),
      );
      const continuationLines = normalizedLines.filter(
        (line) => !iosTimestamp.test(line) && !androidTimestamp.test(line),
      );

      expect(iosLines).toHaveLength(
        manifest.whatsapp.messagesPerFormat.ios +
          manifest.whatsapp.systemEventsPerFormat.ios +
          manifest.whatsapp.callEventsPerFormat.ios,
      );
      expect(androidLines).toHaveLength(
        manifest.whatsapp.messagesPerFormat.android +
          manifest.whatsapp.systemEventsPerFormat.android +
          manifest.whatsapp.callEventsPerFormat.android,
      );
      expect(continuationLines).toHaveLength(
        manifest.whatsapp.continuationLineCount,
      );
      expect(chat).toContain("Voice call. Duration: 12:34");
      expect(chat).toContain("Video call. Duration: 1:05");
      expect(manifest.whatsapp.callCount).toBe(2);
      expect(manifest.whatsapp.longestCallDurationSec).toBe(12 * 60 + 34);
      expect(lines.some((line) => line.includes("سطر عربي متابع"))).toBe(
        true,
      );

      for (const variant of manifest.whatsapp.omittedMediaVariants) {
        expect(chat).toContain(variant);
      }
      expect(countOccurrences(chat, "\u200e")).toBe(
        manifest.whatsapp.rtlMarkCounts["U+200E"],
      );
      expect(countOccurrences(chat, "\u200f")).toBe(
        manifest.whatsapp.rtlMarkCounts["U+200F"],
      );
    } finally {
      await reader.close();
    }
  });

  it(
    "regenerates byte-for-byte with the same seed",
    async () => {
      expect(manifest.generator.seed).toBe(FIXTURE_SEED);
      const outputDirectory = await mkdtemp(
        join(tmpdir(), "exodus-fixtures-"),
      );
      const filenames = [
        "manifest.json",
        manifest.instagram.file,
        manifest.whatsapp.file,
      ] as const;

      try {
        await generateFixtures(outputDirectory);
        const firstGeneration = await Promise.all(
          filenames.map((filename) =>
            readFile(resolve(outputDirectory, filename)),
          ),
        );
        await generateFixtures(outputDirectory);
        const secondGeneration = await Promise.all(
          filenames.map((filename) =>
            readFile(resolve(outputDirectory, filename)),
          ),
        );

        for (let index = 0; index < filenames.length; index += 1) {
          expect(Uint8Array.from(secondGeneration[index])).toEqual(
            Uint8Array.from(firstGeneration[index]),
          );
        }
      } finally {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    },
    20_000,
  );
});
