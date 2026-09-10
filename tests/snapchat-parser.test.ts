import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import type { NormalizedRow } from "../lib/schema";
import { normalizedRowSchema } from "../lib/schema";
import { ZipEntryMap } from "../lib/zip";
import { detectParser, parsers } from "../parsers/registry";
import {
  parseDurationSeconds,
  parseSnapchatTimestamp,
  snapchatMediaKind,
  snapchatParser,
} from "../parsers/snapchat";

interface TextEntry {
  path: string;
  body: unknown;
}

async function makeArchive(entries: readonly TextEntry[]): Promise<ZipEntryMap> {
  const blobWriter = new BlobWriter("application/zip");
  const zipWriter = new ZipWriter(blobWriter, { useWebWorkers: false });
  for (const entry of entries) {
    await zipWriter.add(entry.path, new TextReader(JSON.stringify(entry.body)), {
      level: 0,
      useWebWorkers: false,
    });
  }
  return ZipEntryMap.fromBlob(await zipWriter.close());
}

async function collect(archive: ZipEntryMap): Promise<NormalizedRow[]> {
  const rows: NormalizedRow[] = [];
  await snapchatParser.parse(
    archive,
    async (batch) => {
      for (const row of batch) {
        // Every emitted row must satisfy the shared normalized contract.
        rows.push(normalizedRowSchema.parse(row));
      }
    },
    () => undefined,
  );
  return rows;
}

const ACCOUNT = {
  "Basic Information": { Username: "yousef.demo", Name: "Yousef" },
};

describe("Snapchat timestamp and duration parsing", () => {
  it("reads the UTC string format Snapchat writes", () => {
    expect(parseSnapchatTimestamp({ Created: "2023-01-05 18:22:39 UTC" })).toBe(
      Date.UTC(2023, 0, 5, 18, 22, 39),
    );
  });

  it("prefers the microsecond field when the export carries one", () => {
    expect(
      parseSnapchatTimestamp({
        Created: "2023-01-05 18:22:39 UTC",
        "Created(microseconds)": 1_600_000_000_000_000,
      }),
    ).toBe(1_600_000_000_000);
  });

  it("returns null rather than an invented date", () => {
    expect(parseSnapchatTimestamp({ Created: "not a date" })).toBeNull();
    expect(parseSnapchatTimestamp({})).toBeNull();
  });

  it("accepts clock-style and numeric call durations", () => {
    expect(parseDurationSeconds("00:12:34")).toBe(754);
    expect(parseDurationSeconds("12:34")).toBe(754);
    expect(parseDurationSeconds(90)).toBe(90);
    expect(parseDurationSeconds("nope")).toBeNull();
  });

  it("maps Snapchat media types onto the shared media kinds", () => {
    expect(snapchatMediaKind("TEXT")).toBeNull();
    expect(snapchatMediaKind("IMAGE")).toBe("image");
    expect(snapchatMediaKind("VIDEO_NO_AUDIO")).toBe("video");
    expect(snapchatMediaKind("NOTE")).toBe("audio");
    expect(snapchatMediaKind("SHARE")).toBe("other");
  });
});

describe("Snapchat parser detection", () => {
  it("claims a Snapchat export and nothing else claims it", async () => {
    const archive = await makeArchive([
      { path: "mydata/json/chat_history.json", body: {} },
      { path: "mydata/json/account.json", body: ACCOUNT },
    ]);

    try {
      expect(
        parsers
          .filter((parser) => parser.detect(archive.paths()))
          .map((parser) => parser.id),
      ).toEqual(["snapchat"]);
      expect(detectParser(archive.paths())?.id).toBe("snapchat");
    } finally {
      await archive.close();
    }
  });

  it("stands down when the archive is really an Instagram export", () => {
    expect(
      snapchatParser.detect([
        "your_instagram_activity/messages/inbox/x/message_1.json",
        "json/chat_history.json",
      ]),
    ).toBe(false);
  });
});

describe("Snapchat chat history", () => {
  it("parses the per-friend shape and attributes your own messages to you", async () => {
    const archive = await makeArchive([
      { path: "json/account.json", body: ACCOUNT },
      {
        path: "json/chat_history.json",
        body: {
          "maya.kh": [
            {
              From: "maya.kh",
              "Media Type": "TEXT",
              Created: "2023-04-12 03:21:55 UTC",
              Content: "are you awake",
              "Conversation Title": null,
              IsSender: false,
            },
            {
              From: "yousef.demo",
              "Media Type": "TEXT",
              Created: "2023-04-12 03:24:10 UTC",
              Content: "unfortunately",
              "Conversation Title": null,
              IsSender: true,
            },
          ],
        },
      },
    ]);

    try {
      const rows = await collect(archive);
      const messages = rows.filter((row) => row.table === "messages");

      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        platform: "snapchat",
        conversation: "maya.kh",
        sender: "maya.kh",
        text: "are you awake",
        sent_at_ms: Date.UTC(2023, 3, 12, 3, 21, 55),
      });
      // The owner's username, not the thread name, on messages you sent.
      expect(messages[1]).toMatchObject({
        conversation: "maya.kh",
        sender: "yousef.demo",
        text: "unfortunately",
      });
    } finally {
      await archive.close();
    }
  });

  it("parses the older category shape, keeping the counterparty as the thread", async () => {
    const archive = await makeArchive([
      { path: "json/account.json", body: ACCOUNT },
      {
        path: "json/chat_history.json",
        body: {
          "Received Saved Chat History": [
            {
              From: "sami",
              "Media Type": "TEXT",
              Created: "2022-02-02 12:00:00 UTC",
              Content: "you coming saturday",
              IsSender: false,
            },
          ],
          "Sent Saved Chat History": [
            {
              From: "sami",
              "Media Type": "TEXT",
              Created: "2022-02-02 12:05:00 UTC",
              Content: "wouldnt miss it",
              IsSender: true,
            },
          ],
        },
      },
    ]);

    try {
      const messages = (await collect(archive)).filter(
        (row) => row.table === "messages",
      );

      expect(messages).toHaveLength(2);
      expect(messages.every((row) => row.conversation === "sami")).toBe(true);
      expect(messages.map((row) => row.sender)).toEqual(["sami", "yousef.demo"]);
    } finally {
      await archive.close();
    }
  });

  it("groups a titled conversation under its title", async () => {
    const archive = await makeArchive([
      { path: "json/account.json", body: ACCOUNT },
      {
        path: "json/chat_history.json",
        body: {
          "Received Saved Chat History": [
            {
              From: "maya.kh",
              "Media Type": "TEXT",
              Created: "2022-03-03 12:00:00 UTC",
              Content: "emergency meeting",
              "Conversation Title": "the coven",
              IsSender: false,
            },
          ],
        },
      },
    ]);

    try {
      const messages = (await collect(archive)).filter(
        (row) => row.table === "messages",
      );
      expect(messages[0]).toMatchObject({
        conversation: "the coven",
        sender: "maya.kh",
      });
    } finally {
      await archive.close();
    }
  });

  it("records attachments as omitted refs, because the bytes are never in the zip", async () => {
    const archive = await makeArchive([
      { path: "json/account.json", body: ACCOUNT },
      {
        path: "json/chat_history.json",
        body: {
          "maya.kh": [
            {
              From: "maya.kh",
              "Media Type": "IMAGE",
              Created: "2021-06-06 09:00:00 UTC",
              Content: null,
              IsSender: false,
            },
          ],
        },
      },
    ]);

    try {
      const rows = await collect(archive);
      const message = rows.find((row) => row.table === "messages");
      const media = rows.find((row) => row.table === "media");

      expect(message).toMatchObject({ text: null });
      expect(message?.table === "messages" && message.media_ref).toMatch(
        /^omitted:\/\/snapchat\//,
      );
      expect(media).toMatchObject({ kind: "image", conversation: "maya.kh" });
    } finally {
      await archive.close();
    }
  });

  it("skips records with no readable timestamp instead of failing the import", async () => {
    const archive = await makeArchive([
      { path: "json/account.json", body: ACCOUNT },
      {
        path: "json/chat_history.json",
        body: {
          "maya.kh": [
            { From: "maya.kh", "Media Type": "TEXT", Content: "no date here" },
            {
              From: "maya.kh",
              "Media Type": "TEXT",
              Created: "2021-06-06 09:00:00 UTC",
              Content: "this one is fine",
            },
          ],
        },
      },
    ]);

    try {
      const messages = (await collect(archive)).filter(
        (row) => row.table === "messages",
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ text: "this one is fine" });
    } finally {
      await archive.close();
    }
  });
});

describe("Snapchat friends, snaps and calls", () => {
  it("emits a friend as both follower and following, since the tie is mutual", async () => {
    const archive = await makeArchive([
      { path: "json/account.json", body: ACCOUNT },
      { path: "json/chat_history.json", body: {} },
      {
        path: "json/friends.json",
        body: {
          Friends: [
            {
              Username: "maya.kh",
              "Display Name": "Maya",
              "Creation Timestamp": "2019-02-14 10:00:00 UTC",
            },
          ],
          "Deleted Friends": [],
        },
      },
    ]);

    try {
      const events = (await collect(archive)).filter(
        (row) => row.table === "events",
      );
      const kinds = events.map((row) => row.table === "events" && row.kind);

      expect(kinds).toContain("follower");
      expect(kinds).toContain("following");

      const follower = events.find(
        (row) => row.table === "events" && row.kind === "follower",
      );
      expect(
        follower?.table === "events" && JSON.parse(follower.payload),
      ).toMatchObject({ value: "maya.kh", name: "Maya" });
    } finally {
      await archive.close();
    }
  });

  it("counts snaps as events rather than inflating the message total", async () => {
    const archive = await makeArchive([
      { path: "json/account.json", body: ACCOUNT },
      { path: "json/chat_history.json", body: {} },
      {
        path: "json/snap_history.json",
        body: {
          "Received Snap History": [
            {
              From: "maya.kh",
              "Media Type": "IMAGE",
              Created: "2023-01-01 10:00:00 UTC",
            },
          ],
          "Sent Snap History": [
            {
              From: "maya.kh",
              "Media Type": "VIDEO",
              Created: "2023-01-01 10:05:00 UTC",
            },
          ],
        },
      },
    ]);

    try {
      const rows = await collect(archive);
      expect(rows.filter((row) => row.table === "messages")).toHaveLength(0);

      const snaps = rows.filter(
        (row) => row.table === "events" && row.kind === "snap",
      );
      expect(snaps).toHaveLength(2);
      expect(
        snaps.map((row) =>
          row.table === "events" ? JSON.parse(row.payload).direction : null,
        ),
      ).toEqual(["received", "sent"]);
    } finally {
      await archive.close();
    }
  });

  it("shapes calls like the rest of the app expects", async () => {
    const archive = await makeArchive([
      { path: "json/account.json", body: ACCOUNT },
      { path: "json/chat_history.json", body: {} },
      {
        path: "json/talk_history.json",
        body: {
          "Talk History": [
            {
              From: "maya.kh",
              Type: "VIDEO",
              "Start Time": "2023-05-05 21:00:00 UTC",
              Duration: "00:12:34",
            },
          ],
        },
      },
    ]);

    try {
      const call = (await collect(archive)).find(
        (row) => row.table === "events" && row.kind === "call",
      );

      expect(call?.table === "events" && JSON.parse(call.payload)).toMatchObject({
        media: "video",
        durationSec: 754,
        conversation: "maya.kh",
      });
    } finally {
      await archive.close();
    }
  });

  it("refuses an export that carries no history at all", async () => {
    const archive = await makeArchive([
      { path: "json/chat_history.json", body: {} },
      { path: "json/snap_history.json", body: {} },
    ]);

    try {
      await expect(collect(archive)).rejects.toThrow(
        /no chats, snaps, friends or media/,
      );
    } finally {
      await archive.close();
    }
  });
});

describe("split Snapchat exports", () => {
  /**
   * Snapchat hands out `mydata~<id>.zip` plus `-2` … `-9` continuation parts.
   * Only the first carries the JSON; the rest are gigabytes of memories. Every
   * one of them has to be recognized or the import stops at "unrecognized".
   */
  it("recognizes a media-only continuation part by its wrapper folder", async () => {
    const archive = await makeArchive([
      { path: "mydata~1788886440253/memories/2023-01-05_abc.jpg", body: {} },
    ]);
    try {
      expect(detectParser(archive.paths())?.id).toBe("snapchat");
    } finally {
      await archive.close();
    }
  });

  it("recognizes a part by its archive name when nothing inside names Snapchat", () => {
    const flatPaths = ["memories/2023-01-05_abc.jpg", "memories/2023-01-06_def.mp4"];

    expect(detectParser(flatPaths)).toBeNull();
    expect(
      detectParser(flatPaths, { fileName: "mydata~1788886440253-7.zip" })?.id,
    ).toBe("snapchat");
  });

  it("accepts every continuation suffix Snapchat issues", () => {
    for (const name of [
      "mydata~1788886440253.zip",
      "mydata~1788886440253-2.zip",
      "mydata~1788886440253-9.zip",
    ]) {
      expect(detectParser([], { fileName: name })?.id).toBe("snapchat");
    }
  });

  it("does not claim an unrelated archive on the strength of a name", () => {
    expect(detectParser([], { fileName: "holiday-photos.zip" })).toBeNull();
    expect(detectParser([], { fileName: "mydata-notsnapchat.zip" })).toBeNull();
  });

  it("recognizes a single category export that has no chat history in it", async () => {
    const archive = await makeArchive([
      { path: "json/friends.json", body: { Friends: [] } },
    ]);
    try {
      expect(detectParser(archive.paths())?.id).toBe("snapchat");
    } finally {
      await archive.close();
    }
  });

  it("turns a memories part into media rows instead of refusing it", async () => {
    const archive = await makeArchive([
      { path: "mydata~123/memories/2023-04-12_one.jpg", body: {} },
      { path: "mydata~123/memories/2021-11-02_two.mp4", body: {} },
      { path: "mydata~123/chat_media/2022-06-01_three.png", body: {} },
    ]);

    try {
      const rows = await collect(archive);
      const media = rows.filter((row) => row.table === "media");

      expect(media).toHaveLength(3);
      expect(media.map((row) => row.table === "media" && row.kind).sort()).toEqual([
        "image",
        "image",
        "video",
      ]);
      // The date in the filename is the only timestamp these files carry.
      const first = media.find(
        (row) => row.table === "media" && row.zip_path.endsWith("2023-04-12_one.jpg"),
      );
      expect(first?.table === "media" && first.taken_at_ms).toBe(
        Date.UTC(2023, 3, 12),
      );
      expect(first?.table === "media" && first.conversation).toBe("Memories");
    } finally {
      await archive.close();
    }
  });

  it("still refuses a part with nothing readable in any category", async () => {
    const archive = await makeArchive([
      { path: "mydata~123/readme.txt", body: {} },
    ]);
    try {
      await expect(collect(archive)).rejects.toThrow(/no chats, snaps, friends or media/);
    } finally {
      await archive.close();
    }
  });
});
