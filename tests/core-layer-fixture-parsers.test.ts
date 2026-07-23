import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../fixtures/manifest.json";
import {
  normalizedRowSchema,
  type EventRow,
  type MediaRow,
  type MessageRow,
  type NormalizedRow,
} from "../lib/schema";
import { ZipEntryMap } from "../lib/zip";
import { instagramParser } from "../parsers/instagram";
import { parsers } from "../parsers/registry";
import type { DataParser } from "../parsers/types";
import { whatsappParser } from "../parsers/whatsapp";

async function openFixture(filename: string): Promise<ZipEntryMap> {
  const file = await readFile(join(process.cwd(), "fixtures", filename));
  return ZipEntryMap.fromBlob(new Blob([Uint8Array.from(file)]));
}

async function parseFixture(
  archive: ZipEntryMap,
  parser: DataParser,
): Promise<{ batches: NormalizedRow[][]; rows: NormalizedRow[] }> {
  const batches: NormalizedRow[][] = [];
  await parser.parse(
    archive,
    async (batch) => {
      batches.push([...batch]);
    },
    () => undefined,
  );
  return { batches, rows: batches.flat() };
}

function countBy<T>(
  values: readonly T[],
  keyForValue: (value: T) => string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const key = keyForValue(value);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function expectValidatedBatches(batches: readonly NormalizedRow[][]): void {
  expect(batches.every((batch) => batch.length <= 2_000)).toBe(true);
  for (const row of batches.flat()) {
    expect(normalizedRowSchema.safeParse(row).success).toBe(true);
  }
}

describe("committed parser fixtures", () => {
  it("matches every Instagram manifest count", async () => {
    const archive = await openFixture(manifest.instagram.file);

    try {
      expect(
        parsers
          .filter((parser) => parser.detect(archive.paths()))
          .map((parser) => parser.id),
      ).toEqual(["instagram"]);

      const { batches, rows } = await parseFixture(
        archive,
        instagramParser,
      );
      expectValidatedBatches(batches);

      const messages = rows.filter(
        (row): row is MessageRow => row.table === "messages",
      );
      const media = rows.filter(
        (row): row is MediaRow => row.table === "media",
      );
      const events = rows.filter(
        (row): row is EventRow => row.table === "events",
      );

      expect(messages).toHaveLength(manifest.instagram.messageCount);
      expect(media).toHaveLength(manifest.instagram.mediaCount);
      expect(events).toHaveLength(manifest.instagram.eventCount);
      expect(countBy(messages, (row) => row.conversation)).toEqual(
        manifest.instagram.messagesPerThread,
      );
      expect(countBy(messages, (row) => row.sender)).toEqual(
        manifest.instagram.messagesPerSender,
      );
      expect(countBy(media, (row) => row.conversation ?? "")).toEqual(
        manifest.instagram.mediaPerThread,
      );
      expect(countBy(events, (row) => row.kind)).toEqual(
        manifest.instagram.eventsPerKind,
      );
      expect(messages.filter((row) => row.text === null)).toHaveLength(
        manifest.instagram.messagesWithoutText,
      );

      const firstMessage = [...messages].sort(
        (left, right) => left.sent_at_ms - right.sent_at_ms,
      )[0];
      expect(firstMessage).toMatchObject({
        conversation: manifest.instagram.analytics.firstMessage.conversation,
        sender: manifest.instagram.analytics.firstMessage.sender,
        sent_at_ms: manifest.instagram.analytics.firstMessage.sentAtMs,
        text: manifest.instagram.analytics.firstMessage.text,
      });
      expect(events.some((row) => row.kind === "personal_info")).toBe(false);

      const archivePaths = new Set(archive.paths());
      expect(media.every((row) => archivePaths.has(row.zip_path))).toBe(true);
    } finally {
      await archive.close();
    }
  });

  it("matches every WhatsApp manifest count", async () => {
    const archive = await openFixture(manifest.whatsapp.file);

    try {
      expect(
        parsers
          .filter((parser) => parser.detect(archive.paths()))
          .map((parser) => parser.id),
      ).toEqual(["whatsapp"]);

      const { batches, rows } = await parseFixture(
        archive,
        whatsappParser,
      );
      expectValidatedBatches(batches);

      const messages = rows.filter(
        (row): row is MessageRow => row.table === "messages",
      );
      const media = rows.filter(
        (row): row is MediaRow => row.table === "media",
      );
      const events = rows.filter(
        (row): row is EventRow => row.table === "events",
      );

      expect(messages).toHaveLength(manifest.whatsapp.messageCount);
      expect(media).toHaveLength(manifest.whatsapp.mediaCount);
      expect(events).toHaveLength(manifest.whatsapp.eventCount);
      expect(countBy(events, (row) => row.kind)).toEqual({
        system:
          manifest.whatsapp.systemEventsPerFormat.ios +
          manifest.whatsapp.systemEventsPerFormat.android,
        call: manifest.whatsapp.callCount,
      });
      expect(manifest.whatsapp.callCount).toBe(
        manifest.whatsapp.callEventsPerFormat.ios +
          manifest.whatsapp.callEventsPerFormat.android,
      );
      const calls = events.filter((row) => row.kind === "call");
      const longestCallSec = Math.max(
        ...calls.map(
          (row) =>
            (JSON.parse(row.payload) as { durationSec: number }).durationSec,
        ),
      );
      expect(longestCallSec).toBe(manifest.whatsapp.longestCallDurationSec);
      expect(countBy(messages, (row) => row.sender)).toEqual(
        manifest.whatsapp.messagesPerSender,
      );
      expect(messages[0]?.text).toBe(
        [
          "Hello from the archive.",
          "This iOS message continues on a second line.",
          "وهذا سطر عربي متابع.",
        ].join("\n"),
      );
      expect(JSON.stringify(rows)).not.toMatch(/[\u200E\u200F]/);
      expect(media.every((row) => row.zip_path.startsWith("omitted://"))).toBe(
        true,
      );
    } finally {
      await archive.close();
    }
  });
});
