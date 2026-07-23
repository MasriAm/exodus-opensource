import {
  BlobWriter,
  TextReader,
  ZipWriter,
} from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import {
  normalizedRowSchema,
  type EventRow,
  type MediaRow,
  type MessageRow,
  type NormalizedRow,
} from "../lib/schema";
import { ZipEntryMap } from "../lib/zip";
import { detectParser, parsers } from "../parsers/registry";
import { whatsappParser } from "../parsers/whatsapp";

async function makeWhatsAppArchive(
  path: string,
  transcript: string,
): Promise<ZipEntryMap> {
  const blobWriter = new BlobWriter("application/zip");
  const zipWriter = new ZipWriter(blobWriter, {
    useWebWorkers: false,
  });
  await zipWriter.add(path, new TextReader(transcript), {
    level: 0,
    useWebWorkers: false,
  });
  return ZipEntryMap.fromBlob(await zipWriter.close());
}

describe("WhatsApp parser plugin", () => {
  it("parses iOS/Android lines, continuations, system events, and omitted media", async () => {
    const transcript = [
      "\u200E[1/15/24, 10:32:07 PM] \u200FAlice: Hello",
      "continuation \u200Fمرحبا",
      "15/01/2024, 22:33 - Bob: <Media omitted>",
      "15/01/2024, 22:34 - Alice changed the group description",
      "[1/16/24, 1:02:03 AM] \u200Fعلي: image omitted",
    ].join("\r\n");
    const archive = await makeWhatsAppArchive(
      "export/_chat.txt",
      transcript,
    );

    try {
      expect(
        parsers
          .filter((parser) => parser.detect(archive.paths()))
          .map((parser) => parser.id),
      ).toEqual(["whatsapp"]);
      expect(detectParser(archive.paths())?.id).toBe("whatsapp");
      expect(
        whatsappParser.detect([
          "your_instagram_activity/messages/index.html",
          "_chat.txt",
        ]),
      ).toBe(false);

      const batches: NormalizedRow[][] = [];
      await whatsappParser.parse(
        archive,
        async (batch) => {
          batches.push([...batch]);
        },
        () => undefined,
      );

      expect(batches.every((batch) => batch.length <= 2_000)).toBe(true);
      const rows = batches.flat();
      expect(rows).toHaveLength(6);
      for (const row of rows) {
        expect(normalizedRowSchema.safeParse(row).success).toBe(true);
      }

      const messages = rows.filter(
        (row): row is MessageRow => row.table === "messages",
      );
      const media = rows.filter(
        (row): row is MediaRow => row.table === "media",
      );
      const events = rows.filter(
        (row): row is EventRow => row.table === "events",
      );

      expect(messages).toHaveLength(3);
      expect(messages[0]).toMatchObject({
        conversation: "_chat.txt",
        sender: "Alice",
        sent_at_ms: Date.UTC(2024, 0, 15, 22, 32, 7),
        text: "Hello\ncontinuation مرحبا",
        media_ref: null,
      });
      expect(messages[1]).toMatchObject({
        sender: "Bob",
        sent_at_ms: Date.UTC(2024, 0, 15, 22, 33),
        text: null,
      });
      expect(messages[2]).toMatchObject({
        sender: "علي",
        sent_at_ms: Date.UTC(2024, 0, 16, 1, 2, 3),
        text: null,
      });

      expect(media.map((row) => row.kind).sort()).toEqual([
        "image",
        "other",
      ]);
      expect(media.every((row) => row.zip_path.startsWith("omitted://"))).toBe(
        true,
      );
      expect(messages.slice(1).map((row) => row.media_ref).sort()).toEqual(
        media.map((row) => row.zip_path).sort(),
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "system",
        occurred_at_ms: Date.UTC(2024, 0, 15, 22, 34),
      });
      expect(JSON.parse(events[0].payload)).toEqual({
        conversation: "_chat.txt",
        text: "Alice changed the group description",
      });

      expect(JSON.stringify(rows)).not.toMatch(/[\u200E\u200F]/);
    } finally {
      await archive.close();
    }
  });

  it("accepts a nonstandard txt name when its first line is a transcript", async () => {
    const archive = await makeWhatsAppArchive(
      "chat-export.txt",
      "[2/1/24, 9:05:00 AM] Sam: hello",
    );

    try {
      const rows: NormalizedRow[] = [];
      await whatsappParser.parse(
        archive,
        async (batch) => {
          rows.push(...batch);
        },
        () => undefined,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        table: "messages",
        sender: "Sam",
        sent_at_ms: Date.UTC(2024, 1, 1, 9, 5),
      });
    } finally {
      await archive.close();
    }
  });

  it("parses voice/video call durations as call events", async () => {
    const transcript = [
      "[1/19/24, 11:00:00 AM] Voice call. Duration: 12:34",
      "20/01/2024, 15:30 - Video call. Duration: 1:05",
      "[1/18/24, 9:00:00 AM] Messages and calls are end-to-end encrypted.",
    ].join("\n");
    const archive = await makeWhatsAppArchive("_chat.txt", transcript);

    try {
      const rows: NormalizedRow[] = [];
      await whatsappParser.parse(
        archive,
        async (batch) => {
          rows.push(...batch);
        },
        () => undefined,
      );

      const events = rows.filter(
        (row): row is EventRow => row.table === "events",
      );
      expect(rows.every((row) => row.table === "events")).toBe(true);
      expect(events).toHaveLength(3);

      const calls = events.filter((row) => row.kind === "call");
      expect(calls).toHaveLength(2);
      expect(JSON.parse(calls[0].payload)).toMatchObject({
        media: "voice",
        durationSec: 12 * 60 + 34,
        conversation: "_chat.txt",
      });
      expect(JSON.parse(calls[1].payload)).toMatchObject({
        media: "video",
        durationSec: 65,
      });
      expect(events.some((row) => row.kind === "system")).toBe(true);
    } finally {
      await archive.close();
    }
  });
});
