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
import { instagramParser } from "../parsers/instagram";
import { detectParser, parsers } from "../parsers/registry";

interface TextEntry {
  path: string;
  text: string;
}

async function makeArchive(entries: readonly TextEntry[]): Promise<ZipEntryMap> {
  const blobWriter = new BlobWriter("application/zip");
  const zipWriter = new ZipWriter(blobWriter, {
    useWebWorkers: false,
  });

  for (const entry of entries) {
    await zipWriter.add(entry.path, new TextReader(entry.text), {
      level: 0,
      useWebWorkers: false,
    });
  }

  return ZipEntryMap.fromBlob(await zipWriter.close());
}

describe("ZipEntryMap", () => {
  it("reads entries randomly and tolerates a single wrapper root", async () => {
    const archive = await makeArchive([
      { path: "outer/folder/note.txt", text: "مرحبا" },
      { path: "outer/folder/pixel.jpg", text: "jpg" },
    ]);

    expect(archive.paths()).toEqual([
      "outer/folder/note.txt",
      "outer/folder/pixel.jpg",
    ]);
    expect(await archive.readText("folder/note.txt")).toBe("مرحبا");

    const image = await archive.readBlob("folder/pixel.jpg");
    expect(image.type).toBe("image/jpeg");
    expect(await image.text()).toBe("jpg");
    await expect(archive.readText("missing.txt")).rejects.toThrow(
      "ZIP entry not found",
    );

    await archive.close();
    await expect(archive.readText("folder/note.txt")).rejects.toThrow(
      "closed ZIP archive",
    );
  });
});

describe("Instagram parser plugin", () => {
  it("handles pagination, repaired strings, media, connections, and batching", async () => {
    const firstPageMessages = Array.from({ length: 2_000 }, (_, index) => ({
      sender_name: index === 0 ? "Ø¹Ù„ÙŠ" : "Alice",
      timestamp_ms: 1_700_000_000_000 + index,
      content: index === 0 ? "Ù…Ø±Ø­Ø¨Ø§" : `message ${index}`,
      ...(index === 0
        ? {
            photos: [
              {
                uri: "your_instagram_activity/media/photo.jpg",
                creation_timestamp: 1_700_000_000,
              },
            ],
          }
        : {}),
    }));
    const archive = await makeArchive([
      {
        path: "download/your_instagram_activity/messages/inbox/friends/message_1.json",
        text: JSON.stringify({
          participants: [{ name: "Ø¹Ù„ÙŠ" }, { name: "Alice" }],
          messages: firstPageMessages,
          title: "Ø§Ù„Ø£ØµØ¯Ù‚Ø§Ø¡",
          thread_path: "inbox/friends",
        }),
      },
      {
        path: "download/your_instagram_activity/messages/inbox/friends/message_2.json",
        text: JSON.stringify({
          participants: [{ name: "Alice" }],
          messages: [
            {
              sender_name: "Alice",
              timestamp_ms: 1_700_000_100_000,
              content: "last page",
              videos: [
                {
                  uri: "your_instagram_activity/media/clip.mp4",
                  creation_timestamp: 1_700_000_100,
                },
              ],
            },
          ],
          title: "Friends",
          thread_path: "inbox/friends",
        }),
      },
      {
        path: "download/connections/followers_and_following/followers_1.json",
        text: JSON.stringify([
          {
            title: "Ø³Ø§Ø±Ø©",
            string_list_data: [
              {
                href: "https://www.instagram.com/example",
                value: "Ø³Ø§Ø±Ø©",
                timestamp: 1_700_000_200,
              },
            ],
          },
        ]),
      },
      {
        path: "download/connections/followers_and_following/following.json",
        text: JSON.stringify({
          relationships_following: [
            {
              title: "Ù„ÙŠÙ„Ù‰",
              string_list_data: [
                {
                  value: "Ù„ÙŠÙ„Ù‰",
                  timestamp: 1_700_000_250,
                },
              ],
            },
          ],
        }),
      },
      {
        path: "download/personal_information/personal_information.json",
        text: JSON.stringify({
          profile_user: [
            {
              title: "Profile User",
              string_map_data: {
                Name: {
                  href: "",
                  value: "Ù…Ø±ÙŠÙ…",
                  timestamp: 1_700_000_300,
                },
              },
            },
          ],
        }),
      },
      {
        path: "download/your_instagram_activity/media/photo.jpg",
        text: "photo",
      },
      {
        path: "download/your_instagram_activity/media/clip.mp4",
        text: "video",
      },
    ]);

    try {
      const matchedParsers = parsers
        .filter((parser) => parser.detect(archive.paths()))
        .map((parser) => parser.id);
      expect(matchedParsers).toEqual(["instagram"]);
      expect(detectParser(archive.paths())?.id).toBe("instagram");

      const batches: NormalizedRow[][] = [];
      const progressCounts: number[] = [];
      await instagramParser.parse(
        archive,
        async (batch) => {
          batches.push([...batch]);
        },
        ({ done }) => {
          progressCounts.push(done);
        },
      );

      expect(batches.every((batch) => batch.length <= 2_000)).toBe(true);
      const rows = batches.flat();
      expect(rows).toHaveLength(2_007);
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

      expect(messages).toHaveLength(2_001);
      expect(messages[0]).toMatchObject({
        conversation: "friends",
        sender: "علي",
        text: "مرحبا",
        media_ref:
          "download/your_instagram_activity/media/photo.jpg",
      });
      expect(messages.at(-1)?.text).toBe("last page");

      expect(media).toHaveLength(2);
      expect(media.map((row) => row.kind).sort()).toEqual([
        "image",
        "video",
      ]);
      expect(media[0].taken_at_ms).toBe(1_700_000_000_000);

      expect(events.map((row) => row.kind).sort()).toEqual([
        "archive_owner",
        "follower",
        "following",
        "personal_info",
      ]);
      const follower = events.find((row) => row.kind === "follower");
      expect(follower).toBeDefined();
      expect(JSON.parse(follower?.payload ?? "{}")).toMatchObject({
        // Handle comes from the profile URL; Arabic title stays as display name.
        name: "سارة",
        value: "example",
        href: "https://www.instagram.com/example",
      });
      const personal = events.find((row) => row.kind === "personal_info");
      expect(personal?.payload).toContain("مريم");
      expect(progressCounts.at(-1)).toBe(rows.length);
    } finally {
      await archive.close();
    }
  });

  it("skips absent optional story files and repairs comment mojibake", async () => {
    const archive = await makeArchive([
      {
        path: "wrap/your_instagram_activity/messages/inbox/solo/message_1.json",
        text: JSON.stringify({
          participants: [{ name: "Yousef" }],
          messages: [
            {
              sender_name: "Yousef",
              timestamp_ms: 1_700_000_000_000,
              content: "hello",
            },
          ],
        }),
      },
      {
        path: "wrap/your_instagram_activity/comments/post_comments_1.json",
        text: JSON.stringify([
          {
            title: "Post",
            string_list_data: [
              {
                value: "Ù…Ø±Ø­Ø¨Ø§",
                timestamp: 1_600_000_000,
              },
            ],
          },
        ]),
      },
      {
        path: "wrap/personal_information/profile_changes.json",
        text: JSON.stringify({
          profile_profile_change: [
            {
              title: "Bio",
              string_map_data: {
                Changed: {
                  value: "Bio",
                  timestamp: 1_610_000_000,
                },
                "New Value": {
                  value: "Ø·Ø§Ù„Ø¨",
                  timestamp: 1_610_000_000,
                },
              },
            },
          ],
        }),
      },
    ]);

    try {
      const rows: NormalizedRow[] = [];
      await instagramParser.parse(
        archive,
        async (batch) => {
          rows.push(...batch);
        },
        () => undefined,
      );

      const events = rows.filter(
        (row): row is EventRow => row.table === "events",
      );
      expect(events.map((row) => row.kind).sort()).toEqual([
        "comment",
        "profile_change",
      ]);
      expect(JSON.parse(events.find((row) => row.kind === "comment")?.payload ?? "{}")).toMatchObject({
        text: "مرحبا",
      });
      expect(
        JSON.parse(
          events.find((row) => row.kind === "profile_change")?.payload ?? "{}",
        ),
      ).toMatchObject({
        field: "bio",
        value: "طالب",
      });
    } finally {
      await archive.close();
    }
  });

  it("reads modern followers shapes (wrapped + flat) for follow-back math", async () => {
    const archive = await makeArchive([
      {
        path: "export/connections/followers_and_following/followers_1.json",
        text: JSON.stringify({
          relationships_followers: [
            {
              href: "https://www.instagram.com/flat_follower/",
              value: "Flat Follower Display",
              timestamp: 1_700_000_100,
            },
            {
              title: "Nested",
              string_list_data: [
                {
                  href: "https://www.instagram.com/nested_follower",
                  value: "nested_follower",
                  timestamp: 1_700_000_110,
                },
              ],
            },
          ],
        }),
      },
      {
        path: "export/connections/followers_and_following/following_1.json",
        text: JSON.stringify({
          relationships_following: [
            {
              string_list_data: [
                {
                  href: "https://www.instagram.com/flat_follower",
                  value: "flat_follower",
                  timestamp: 1_700_000_200,
                },
              ],
            },
            {
              string_list_data: [
                {
                  href: "https://www.instagram.com/only_out",
                  value: "only_out",
                  timestamp: 1_700_000_210,
                },
              ],
            },
          ],
        }),
      },
      {
        path: "export/your_instagram_activity/messages/inbox/solo/message_1.json",
        text: JSON.stringify({
          participants: [{ name: "You" }],
          messages: [
            {
              sender_name: "You",
              timestamp_ms: 1_700_000_000_000,
              content: "hi",
            },
          ],
        }),
      },
    ]);

    try {
      const rows: NormalizedRow[] = [];
      await instagramParser.parse(
        archive,
        async (batch) => {
          rows.push(...batch);
        },
        () => undefined,
      );
      const events = rows.filter(
        (row): row is EventRow => row.table === "events",
      );
      const followers = events.filter((row) => row.kind === "follower");
      const following = events.filter((row) => row.kind === "following");
      expect(followers).toHaveLength(2);
      expect(following).toHaveLength(2);
      expect(
        followers.map((row) => JSON.parse(row.payload).value).sort(),
      ).toEqual(["flat_follower", "nested_follower"]);

      const { followingWithoutFollowBack } = await import("@/lib/follow-facts");
      const graph = [
        ...followers.map((row) => ({
          kind: "follower" as const,
          username: JSON.parse(row.payload).value as string,
          occurredAtMs: row.occurred_at_ms,
        })),
        ...following.map((row) => ({
          kind: "following" as const,
          username: JSON.parse(row.payload).value as string,
          occurredAtMs: row.occurred_at_ms,
        })),
      ];
      expect(
        followingWithoutFollowBack(graph).map((row) => row.username),
      ).toEqual(["only_out"]);
    } finally {
      await archive.close();
    }
  });
});
