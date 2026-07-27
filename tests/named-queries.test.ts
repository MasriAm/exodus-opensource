import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  NODE_RUNTIME,
  VoidLogger,
  createDuckDB,
  type DuckDBBundles,
  type DuckDBConnection,
} from "@duckdb/duckdb-wasm/blocking";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getBatchInsertParameters,
  getBatchInsertSql,
} from "../lib/db/ingest-sql";
import { NAMED_QUERY_SQL, executeNamedQuery } from "../lib/db/queries";
import {
  BEGIN_ARCHIVE_REPLACEMENT_SQL,
  CLEAR_ARCHIVE_SQL,
  COMMIT_ARCHIVE_REPLACEMENT_SQL,
  INITIALIZATION_SQL,
} from "../lib/db/schema-sql";
import { QUERY_NAMES, type ExportTable, type QueryName } from "../lib/db/types";
import type { NormalizedRow } from "../lib/schema";

/**
 * Every named query is executed against a real DuckDB instance.
 * The blocking node connection is API-compatible with the async worker
 * connection for `query` / `prepare`, so the production query functions run
 * unmodified — this is what catches wasm-level SQL faults.
 */

let database: Awaited<ReturnType<typeof createDuckDB>>;
let connection: DuckDBConnection;
let db: AsyncDuckDBConnection;
let duckdbVersion = "";

/** Local wall-clock timestamps so local-day grouping is exercised honestly. */
function localMs(
  year: number,
  monthIndex: number,
  day: number,
  hour = 12,
  minute = 0,
): number {
  return new Date(year, monthIndex, day, hour, minute).getTime();
}

const SELF = "yousef";
const FRIEND = "sara";
const GROUP = "trip crew";

const messages: NormalizedRow[] = [
  {
    table: "messages",
    platform: "instagram",
    conversation: FRIEND,
    sender: FRIEND,
    sent_at_ms: localMs(2024, 0, 1, 23, 40),
    text: "late night مرحبا",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: FRIEND,
    sender: SELF,
    sent_at_ms: localMs(2024, 0, 2, 0, 20),
    text: "hello world after midnight",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: FRIEND,
    sender: SELF,
    sent_at_ms: localMs(2024, 0, 2, 9, 0),
    text: "coffee?",
    media_ref: "media/photo.jpg",
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: GROUP,
    sender: SELF,
    sent_at_ms: localMs(2024, 2, 14, 18, 0),
    text: "who is driving",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: GROUP,
    sender: "mona",
    sent_at_ms: localMs(2024, 2, 14, 18, 5),
    text: "me!",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "whatsapp",
    conversation: "Instagram User_1234567890123",
    sender: "Instagram User",
    sent_at_ms: localMs(2023, 5, 9, 10, 0),
    text: "deleted account thread",
    media_ref: null,
  },
];

const media: NormalizedRow[] = [
  {
    table: "media",
    platform: "instagram",
    zip_path: "media/photo.jpg",
    kind: "image",
    taken_at_ms: localMs(2020, 6, 4, 8, 0),
    conversation: FRIEND,
  },
  {
    table: "media",
    platform: "instagram",
    zip_path: "media/voice.m4a",
    kind: "audio",
    taken_at_ms: localMs(2024, 0, 2, 9, 5),
    conversation: FRIEND,
  },
  {
    table: "media",
    platform: "instagram",
    zip_path: "omitted://blocked.jpg",
    kind: "image",
    taken_at_ms: null,
    conversation: GROUP,
  },
];

const events: NormalizedRow[] = [
  {
    table: "events",
    platform: "instagram",
    kind: "follower",
    occurred_at_ms: localMs(2023, 1, 1),
    payload: JSON.stringify({ value: "mutual_one" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "follower",
    occurred_at_ms: localMs(2023, 1, 2),
    payload: JSON.stringify({ value: "Mutual_One" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "following",
    occurred_at_ms: localMs(2023, 1, 3),
    payload: JSON.stringify({ value: "mutual_one" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "following",
    occurred_at_ms: localMs(2023, 1, 4),
    payload: JSON.stringify({ value: "never_back" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "comment",
    occurred_at_ms: localMs(2022, 3, 3),
    payload: JSON.stringify({ text: "old comment", title: "a post" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "interest",
    occurred_at_ms: localMs(2024, 3, 12),
    payload: JSON.stringify({ topic: "privacy tools" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "profile_change",
    occurred_at_ms: localMs(2022, 0, 15),
    payload: JSON.stringify({ field: "username", value: "old_name" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "personal_info",
    occurred_at_ms: localMs(2021, 4, 6),
    payload: JSON.stringify({
      path: "$.profile_user[0].string_map_data.Email",
      data: { value: "someone@example.com", timestamp: 1620000000 },
    }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "personal_info",
    occurred_at_ms: localMs(2021, 4, 7),
    payload: JSON.stringify({
      path: "$.profile_user[0].media_map_data.Profile photo",
      data: {
        uri: "media/posts/2.jpg",
        creation_timestamp: 1620000001,
        media_metadata: { camera_metadata: { has_camera_metadata: false } },
        cross_post_source: { source_app: "FB" },
      },
    }),
  },
  {
    table: "events",
    platform: "whatsapp",
    kind: "call",
    occurred_at_ms: localMs(2024, 0, 19, 11),
    payload: JSON.stringify({
      media: "voice",
      durationSec: 754,
      conversation: "_chat.txt",
      text: "Voice call. Duration: 12:34",
    }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "system",
    occurred_at_ms: localMs(2024, 0, 20),
    payload: JSON.stringify({ conversation: FRIEND, text: "You missed a call" }),
  },
];

beforeAll(async () => {
  const distribution = join(
    process.cwd(),
    "node_modules",
    "@duckdb",
    "duckdb-wasm",
    "dist",
  );
  const bundles: DuckDBBundles = {
    mvp: {
      mainModule: join(distribution, "duckdb-mvp.wasm"),
      mainWorker: join(distribution, "duckdb-browser-mvp.worker.js"),
    },
    eh: {
      mainModule: join(distribution, "duckdb-eh.wasm"),
      mainWorker: join(distribution, "duckdb-browser-eh.worker.js"),
    },
  };

  database = await createDuckDB(bundles, new VoidLogger(), NODE_RUNTIME);
  await database.instantiate();
  database.open({
    query: { castBigIntToDouble: true, castTimestampToDate: false },
  });
  connection = database.connect();
  // The browser runs with `connect-src 'self'`, so DuckDB may never reach
  // extensions.duckdb.org. Load `json` from the same mirror the worker uses so
  // a missing mirror fails here instead of in production.
  duckdbVersion = String(
    connection.query("SELECT version() AS version").toArray()[0]?.version ?? "",
  );
  for (const sql of INITIALIZATION_SQL) {
    connection.query(sql);
  }
  connection.query(BEGIN_ARCHIVE_REPLACEMENT_SQL);
  for (const sql of CLEAR_ARCHIVE_SQL) {
    connection.query(sql);
  }
  loadBatch("messages", messages);
  loadBatch("media", media);
  loadBatch("events", events);
  connection.query(COMMIT_ARCHIVE_REPLACEMENT_SQL);

  db = connection as unknown as AsyncDuckDBConnection;
}, 60_000);

afterAll(() => {
  connection.close();
  database.reset();
});

describe("offline JSON support", () => {
  /**
   * DuckDB keeps `json_extract_string` in an extension it would fetch from
   * extensions.duckdb.org. The browser cannot (CSP `connect-src 'self'`), so
   * the worker loads it from `public/duckdb/extensions`. If this mirror is
   * missing or version-skewed, Footprint and Wrapped die in production.
   */
  it("mirrors the json extension for the running DuckDB version", async () => {
    expect(duckdbVersion).toMatch(/^v\d+\.\d+\.\d+/);
    for (const platform of ["wasm_eh", "wasm_mvp"]) {
      const mirrored = join(
        process.cwd(),
        "public",
        "duckdb",
        "extensions",
        duckdbVersion,
        platform,
        "json.duckdb_extension.wasm",
      );
      const bytes = await readFile(mirrored);
      // "\0asm" — a raw wasm module, not a gzip or HTML error page.
      expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
    }
  });

  it("still needs json for footprint SQL", () => {
    expect(
      NAMED_QUERY_SQL.wrappedStats.mutualFollows.includes(
        "json_extract_string",
      ) ||
        NAMED_QUERY_SQL.wrappedStats.interests.includes("json_extract_string"),
    ).toBe(true);
  });
});

const DEFAULT_PARAMS: Record<QueryName, unknown> = {
  conversationList: { limit: 50, offset: 0 },
  messagesPage: { conversation: FRIEND, limit: 50, offset: 0 },
  counts: undefined,
  search: { term: "hello", limit: 20, offset: 0 },
  activityTimeline: { granularity: "day" },
  mediaList: { kind: "image", limit: 20, offset: 0 },
  wrappedStats: undefined,
  exportMetadata: undefined,
  deskHome: undefined,
  onThisDay: undefined,
  peopleList: { limit: 50, offset: 0 },
  personDetail: { conversation: FRIEND },
  messageHeatmap: { year: 2024 },
  dayMessages: {
    dayMs: Date.UTC(2024, 0, 2),
  },
  footprint: undefined,
  surpriseMemory: undefined,
  filterOptions: undefined,
};

/** Binds a parameter for every filter clause — catches ordering mistakes. */
const FULL_FILTER = {
  fromMs: Date.UTC(2019, 0, 1),
  toMs: Date.UTC(2030, 0, 1),
  platform: "instagram",
  conversation: FRIEND,
};

describe("every named query runs against DuckDB", () => {
  for (const name of QUERY_NAMES) {
    it(`${name} resolves without a database fault`, async () => {
      const result = await executeNamedQuery(
        db,
        name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        DEFAULT_PARAMS[name] as any,
      );
      expect(result).toBeDefined();
    }, 30_000);

    it(`${name} resolves with every filter applied`, async () => {
      const base = DEFAULT_PARAMS[name];
      const params = {
        ...(typeof base === "object" && base !== null ? base : {}),
        filter: FULL_FILTER,
      };
      const result = await executeNamedQuery(
        db,
        name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params as any,
      );
      expect(result).toBeDefined();
    }, 30_000);
  }
});

describe("named query results", () => {
  it("returns the whole thread roster with each message page", async () => {
    const page = await executeNamedQuery(db, "messagesPage", {
      conversation: FRIEND,
      limit: 1,
      offset: 0,
    });
    expect(page.items).toHaveLength(1);
    expect(page.totalCount).toBe(3);
    // Roster covers the thread, not just this page — keeps bubbles aligned.
    expect(page.threadSenders.map((row) => row.sender).sort()).toEqual([
      FRIEND,
      SELF,
    ]);
    expect(page.archiveSelfHint).toBe(SELF);
  });

  it("buckets the heatmap on local calendar days", async () => {
    const heatmap = await executeNamedQuery(db, "messageHeatmap", {
      year: 2024,
    });
    const jan1 = Date.UTC(2024, 0, 1);
    const jan2 = Date.UTC(2024, 0, 2);
    const byDay = new Map(
      heatmap.days.map((day) => [day.dayMs, day.messageCount]),
    );
    expect(byDay.get(jan1)).toBe(1);
    // 00:20 local belongs to Jan 2 even though it is Jan 1 in some timezones.
    expect(byDay.get(jan2)).toBe(2);
    expect(heatmap.days.every((day) => day.dayMs % 86_400_000 === 0)).toBe(true);
  });

  it("opens the same day the heatmap cell points at", async () => {
    const day = await executeNamedQuery(db, "dayMessages", {
      dayMs: Date.UTC(2024, 0, 2),
    });
    expect(day.items).toHaveLength(2);
    expect(day.items.every((item) => item.sender === SELF)).toBe(true);
  });

  it("keeps every follow event so counts are not truncated", async () => {
    const result = await executeNamedQuery(db, "footprint", undefined);
    const followers = result.followEvents.filter(
      (row) => row.kind === "follower",
    );
    const following = result.followEvents.filter(
      (row) => row.kind === "following",
    );
    expect(followers).toHaveLength(2);
    expect(following).toHaveLength(2);
  });

  it("shows readable personal information instead of raw JSON", async () => {
    const result = await executeNamedQuery(db, "footprint", undefined);
    const fields = result.personalInfo.flatMap((row) => row.fields);
    // Labels come from the JSON path, values stay human-readable.
    expect(fields).toContainEqual({
      key: "Email",
      value: "someone@example.com",
    });
    for (const field of fields) {
      expect(field.value.startsWith("$")).toBe(false);
      expect(field.value.startsWith("{")).toBe(false);
      expect(field.value).not.toContain("media/posts/");
    }
    // The media_map_data row carries nothing readable, so it renders nothing.
    const mediaRow = result.personalInfo.find((row) =>
      row.path.includes("media_map_data"),
    );
    expect(mediaRow?.fields).toEqual([]);
  });

  it("filters media by kind and hides omitted entries from images", async () => {
    const images = await executeNamedQuery(db, "mediaList", {
      kind: "image",
      limit: 20,
      offset: 0,
    });
    expect(images.items.map((item) => item.zipPath)).toContain("media/photo.jpg");

    const audio = await executeNamedQuery(db, "mediaList", {
      kind: "audio",
      limit: 20,
      offset: 0,
    });
    expect(audio.items.map((item) => item.zipPath)).toEqual([
      "media/voice.m4a",
    ]);

    const other = await executeNamedQuery(db, "mediaList", {
      kind: "other",
      limit: 20,
      offset: 0,
    });
    expect(other.totalCount).toBe(0);
  });

  it("keeps deleted-account threads separate in the conversation index", async () => {
    const list = await executeNamedQuery(db, "conversationList", {
      limit: 50,
      offset: 0,
    });
    const names = list.items.map((item) => item.conversation);
    expect(names).toContain("Instagram User_1234567890123");
    expect(names).toContain(FRIEND);
  });

  it("scopes search with the supplied filter only", async () => {
    const all = await executeNamedQuery(db, "search", {
      term: "hello",
      limit: 20,
      offset: 0,
    });
    expect(all.groups.flatMap((group) => group.hits)).toHaveLength(1);

    const scoped = await executeNamedQuery(db, "search", {
      term: "hello",
      limit: 20,
      offset: 0,
      filter: { conversation: GROUP },
    });
    expect(scoped.groups).toHaveLength(0);
  });

  it("survives a person filter on every dashboard query", async () => {
    const filter = { conversation: FRIEND };
    for (const name of [
      "deskHome",
      "footprint",
      "surpriseMemory",
      "onThisDay",
    ] as const) {
      const result = await executeNamedQuery(db, name, { filter });
      expect(result).toBeDefined();
    }
  }, 30_000);
});

function loadBatch(table: ExportTable, rows: NormalizedRow[]): void {
  const statement = connection.prepare(getBatchInsertSql(table, rows.length));
  try {
    statement.query(...getBatchInsertParameters(table, rows));
  } finally {
    statement.close();
  }
}
