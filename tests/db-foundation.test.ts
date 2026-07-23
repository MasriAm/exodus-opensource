import { join } from "node:path";

import {
  NODE_RUNTIME,
  VoidLogger,
  createDuckDB,
  type DuckDBBundles,
  type DuckDBConnection,
} from "@duckdb/duckdb-wasm/blocking";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createExportBlob,
  createJsonExportBlob,
  getExportSql,
} from "../lib/db/export";
import {
  createSearchSnippet,
  escapeLikePattern,
  isExportFormat,
  isExportTable,
  isQueryName,
} from "../lib/db/helpers";
import {
  getBatchInsertParameters,
  getBatchInsertSql,
} from "../lib/db/ingest-sql";
import {
  NAMED_QUERY_SQL,
  WRAPPED_WORD_QUERY_PARAMETERS,
} from "../lib/db/queries";
import {
  asSqlRows,
  readNumber,
  readString,
  type SqlRow,
} from "../lib/db/row-values";
import {
  BEGIN_ARCHIVE_REPLACEMENT_SQL,
  CLEAR_ARCHIVE_SQL,
  COMMIT_ARCHIVE_REPLACEMENT_SQL,
  INITIALIZATION_SQL,
} from "../lib/db/schema-sql";
import type { ExportTable } from "../lib/db/types";
import type { NormalizedRow } from "../lib/schema";

type TestParameter = string | number | boolean | null;

let database: Awaited<ReturnType<typeof createDuckDB>>;
let connection: DuckDBConnection;

const messages: NormalizedRow[] = [
  {
    table: "messages",
    platform: "instagram",
    conversation: "alpha",
    sender: "Amina",
    sent_at_ms: Date.UTC(2024, 0, 1, 3, 5),
    text: "Hello project مرحبا",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: "alpha",
    sender: "Yousef",
    sent_at_ms: Date.UTC(2024, 0, 1, 4, 0),
    text: "still talking",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: "alpha",
    sender: "Amina",
    sent_at_ms: Date.UTC(2024, 0, 1, 5, 0),
    text: "and again",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: "alpha",
    sender: "Yousef",
    sent_at_ms: Date.UTC(2024, 0, 1, 6, 0),
    text: "four on busiest",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: "alpha",
    sender: "Amina",
    sent_at_ms: Date.UTC(2024, 0, 1, 7, 0),
    text: "five on busiest",
    media_ref: null,
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: "alpha",
    sender: "Yousef",
    sent_at_ms: Date.UTC(2024, 0, 2, 3, 30),
    text: "hello world",
    media_ref: "media/photo.jpg",
  },
  {
    table: "messages",
    platform: "instagram",
    conversation: "beta",
    sender: "Mona",
    sent_at_ms: Date.UTC(2024, 0, 4, 10),
    text: "Another message",
    media_ref: null,
  },
];

const media: NormalizedRow[] = [
  {
    table: "media",
    platform: "instagram",
    zip_path: "media/photo.jpg",
    kind: "image",
    taken_at_ms: Date.UTC(2024, 0, 2, 3, 30),
    conversation: "alpha",
  },
];

const events: NormalizedRow[] = [
  {
    table: "events",
    platform: "instagram",
    kind: "follower",
    occurred_at_ms: Date.UTC(2021, 0, 1),
    payload: JSON.stringify({ value: "mutual_one", name: "Mutual One" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "following",
    occurred_at_ms: Date.UTC(2020, 6, 1),
    payload: JSON.stringify({ value: "mutual_one", name: "Mutual One" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "follower",
    occurred_at_ms: Date.UTC(2024, 0, 1, 8),
    payload: JSON.stringify({ name: "Amina", value: "amina" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "following",
    occurred_at_ms: Date.UTC(2024, 1, 1, 8),
    payload: JSON.stringify({ name: "Mona", value: "mona" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "comment",
    occurred_at_ms: Date.UTC(2020, 6, 5),
    payload: JSON.stringify({ text: "cringe comment from then" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "comment",
    occurred_at_ms: Date.UTC(2024, 2, 5),
    payload: JSON.stringify({ text: "recent comment" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "interest",
    occurred_at_ms: Date.UTC(2023, 3, 12),
    payload: JSON.stringify({ topic: "specialty coffee" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "interest",
    occurred_at_ms: Date.UTC(2024, 3, 12),
    payload: JSON.stringify({ topic: "privacy tools" }),
  },
  {
    table: "events",
    platform: "instagram",
    kind: "profile_change",
    occurred_at_ms: Date.UTC(2022, 0, 15),
    payload: JSON.stringify({ field: "username", value: "old_name" }),
  },
  {
    table: "events",
    platform: "whatsapp",
    kind: "call",
    occurred_at_ms: Date.UTC(2024, 0, 19, 11),
    payload: JSON.stringify({
      media: "voice",
      durationSec: 754,
      conversation: "_chat.txt",
      text: "Voice call. Duration: 12:34",
    }),
  },
  {
    table: "events",
    platform: "whatsapp",
    kind: "call",
    occurred_at_ms: Date.UTC(2024, 0, 20, 15, 30),
    payload: JSON.stringify({
      media: "video",
      durationSec: 65,
      conversation: "_chat.txt",
      text: "Video call. Duration: 1:05",
    }),
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
    query: {
      castBigIntToDouble: true,
      castTimestampToDate: false,
    },
  });
  connection = database.connect();
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
}, 30_000);

afterAll(() => {
  connection.close();
  database.reset();
});

describe("DuckDB named-query SQL", () => {
  it("loads validated parameter batches and returns typed counts", () => {
    const row = oneRow(queryRows(NAMED_QUERY_SQL.counts));
    expect(readNumber(row, "messages")).toBe(7);
    expect(readNumber(row, "media")).toBe(1);
    expect(readNumber(row, "events")).toBe(events.length);
    expect(readNumber(row, "conversations")).toBe(2);
  });

  it("executes pagination, search, media, activity, and metadata SQL", () => {
    expect(
      preparedRows(NAMED_QUERY_SQL.conversationList, [100, 0]),
    ).toHaveLength(2);

    const messageRows = preparedRows(NAMED_QUERY_SQL.messagesPage, [
      "alpha",
      null,
      null,
      null,
      null,
      101,
    ]);
    expect(messageRows).toHaveLength(6);
    expect(readNumber(messageRows[0], "sent_at_ms")).toBe(
      Date.UTC(2024, 0, 2, 3, 30),
    );

    const searchPattern = `%${escapeLikePattern("hello")}%`;
    const searchCount = oneRow(
      preparedRows(NAMED_QUERY_SQL.searchCount, [searchPattern]),
    );
    expect(readNumber(searchCount, "total_hits")).toBe(2);
    expect(
      preparedRows(NAMED_QUERY_SQL.search, [searchPattern, 100, 0]),
    ).toHaveLength(2);

    expect(
      preparedRows(NAMED_QUERY_SQL.activityTimeline.day, [
        null,
        null,
        null,
        null,
      ]).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      preparedRows(NAMED_QUERY_SQL.mediaList, [
        null,
        null,
        null,
        null,
        100,
        0,
      ]),
    ).toHaveLength(1);
    expect(queryRows(NAMED_QUERY_SQL.exportMetadata)).toHaveLength(3);
  });

  it("computes every Wrapped statistic including Arabic word counts", () => {
    const wrapped = NAMED_QUERY_SQL.wrappedStats;
    expect(readNumber(oneRow(queryRows(wrapped.overview)), "total_messages")).toBe(
      7,
    );
    expect(queryRows(wrapped.topContacts)).toHaveLength(2);

    const hours = queryRows(wrapped.hours);
    expect(hours).toHaveLength(24);
    const threeAm = hours.find((row) => readNumber(row, "hour") === 3);
    expect(threeAm).toBeDefined();
    expect(readNumber(threeAm as SqlRow, "message_count")).toBe(2);

    const busiest = oneRow(queryRows(wrapped.busiestDay));
    expect(readString(busiest, "active_date")).toBe("2024-01-01");
    expect(readNumber(busiest, "message_count")).toBe(5);

    // Quietest active day must use ASC — never swap labels with busiest.
    const quietest = oneRow(
      queryRows(`
        SELECT
          strftime(CAST(sent_at AS DATE), '%Y-%m-%d') AS active_date,
          CAST(COUNT(*) AS DOUBLE) AS message_count
        FROM messages
        GROUP BY CAST(sent_at AS DATE)
        ORDER BY COUNT(*) ASC, CAST(sent_at AS DATE) ASC
        LIMIT 1
      `),
    );
    expect(readNumber(quietest, "message_count")).toBe(1);
    expect(readNumber(busiest, "message_count")).toBeGreaterThanOrEqual(
      readNumber(quietest, "message_count"),
    );

    const first = oneRow(queryRows(wrapped.firstMessage));
    expect(readString(first, "conversation")).toBe("alpha");
    expect(readNumber(first, "sent_at_ms")).toBe(Date.UTC(2024, 0, 1, 3, 5));

    const topContacts = queryRows(`
      SELECT
        conversation,
        CAST(COUNT(*) AS DOUBLE) AS message_count
      FROM messages
      GROUP BY conversation
      ORDER BY COUNT(*) DESC, conversation ASC
    `);
    expect(readString(topContacts[0], "conversation")).toBe("alpha");
    expect(readNumber(topContacts[0], "message_count")).toBe(6);
    expect(readString(topContacts[1], "conversation")).toBe("beta");
    expect(readNumber(topContacts[1], "message_count")).toBe(1);

    const words = preparedRows(wrapped.topWords, [
      ...WRAPPED_WORD_QUERY_PARAMETERS,
    ]);
    const hello = words.find((row) => readString(row, "word") === "hello");
    const arabic = words.find((row) => readString(row, "word") === "مرحبا");
    expect(readNumber(hello as SqlRow, "word_count")).toBe(2);
    expect(readNumber(arabic as SqlRow, "word_count")).toBe(1);

    expect(queryRows(wrapped.firstMessage)).toHaveLength(1);
    const streak = oneRow(queryRows(wrapped.longestStreak));
    expect(readNumber(streak, "streak_days")).toBe(2);

    const mutuals = queryRows(wrapped.mutualFollows);
    expect(mutuals).toHaveLength(1);
    expect(readString(mutuals[0], "username")).toBe("mutual_one");

    const longestCall = oneRow(queryRows(wrapped.longestCall));
    expect(readString(longestCall, "media")).toBe("voice");
    expect(readNumber(longestCall, "duration_sec")).toBe(754);

    const cringe = queryRows(wrapped.cringeComments);
    expect(cringe).toHaveLength(1);
    expect(readString(cringe[0], "text")).toBe("cringe comment from then");

    const interests = queryRows(wrapped.interests);
    expect(interests.map((row) => readString(row, "topic")).sort()).toEqual([
      "privacy tools",
      "specialty coffee",
    ]);

    const profile = queryRows(wrapped.profileHistory);
    expect(profile).toHaveLength(1);
    expect(readString(profile[0], "field")).toBe("username");

    expect(queryRows(wrapped.firstImage).length).toBeGreaterThanOrEqual(1);
    const firstImage = queryRows(wrapped.firstImage)[0];
    expect(readString(firstImage, "zip_path")).toBe("media/photo.jpg");
    expect(readString(firstImage, "conversation")).toBe("alpha");
  });

  it("exports CSV with a BOM and JSON without an extension download", async () => {
    const csvName = "export-904-messages.csv";
    connection.query(getExportSql("messages", "csv", csvName));
    database.flushFiles();
    const csvBlob = createExportBlob(
      database.copyFileToBuffer(csvName),
      "csv",
    );
    database.dropFile(csvName);

    const csvBytes = new Uint8Array(await csvBlob.arrayBuffer());
    expect([...csvBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(csvBytes)).toContain("مرحبا");

    const jsonName = "export-905-messages.json";
    const jsonBlob = createJsonExportBlob(
      queryRows(getExportSql("messages", "json", jsonName)),
    );
    const jsonText = await jsonBlob.text();
    expect(JSON.parse(jsonText)).toHaveLength(7);
  });
});

describe("database boundary helpers", () => {
  it("keeps query and export names on fixed allowlists", () => {
    expect(isQueryName("search")).toBe(true);
    expect(isQueryName("rawSql")).toBe(false);
    expect(isExportTable("messages")).toBe(true);
    expect(isExportTable("users")).toBe(false);
    expect(isExportFormat("csv")).toBe(true);
    expect(isExportFormat("xlsx")).toBe(false);
  });

  it("escapes LIKE wildcards and creates bounded snippets", () => {
    expect(escapeLikePattern("50%_off\\today")).toBe(
      "50\\%\\_off\\\\today",
    );
    const text = `${"prefix ".repeat(30)}needle${" suffix".repeat(30)}`;
    const snippet = createSearchSnippet(text, "needle", 80);
    expect(snippet).toContain("needle");
    expect(snippet.length).toBeLessThanOrEqual(82);
  });
});

function loadBatch(
  table: ExportTable,
  rows: NormalizedRow[],
): void {
  const statement = connection.prepare(getBatchInsertSql(table, rows.length));
  try {
    statement.query(...getBatchInsertParameters(table, rows));
  } finally {
    statement.close();
  }
}

function queryRows(sql: string): SqlRow[] {
  const values: readonly unknown[] = connection.query(sql).toArray();
  return asSqlRows(values);
}

function preparedRows(
  sql: string,
  params: TestParameter[],
): SqlRow[] {
  const statement = connection.prepare(sql);
  try {
    const values: readonly unknown[] = statement.query(...params).toArray();
    return asSqlRows(values);
  } finally {
    statement.close();
  }
}

function oneRow(rows: SqlRow[]): SqlRow {
  expect(rows).toHaveLength(1);
  return rows[0];
}
