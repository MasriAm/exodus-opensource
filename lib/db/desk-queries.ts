import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { computeStreakSilence } from "@/lib/streak-facts";

import {
  messagesWhere,
  mediaWhere,
  eventsWhere,
  normalizeArchiveFilter,
  type ArchiveFilter,
  type SqlParameter,
} from "./archive-filter";
import { boundedInteger } from "./helpers";
import {
  asSqlRows,
  readNullableNumber,
  readNullableString,
  readNumber,
  readString,
  type SqlRow,
} from "./row-values";
import type {
  DeskHomeResult,
  DayMessagesParams,
  DayMessagesResult,
  FootprintCall,
  FootprintFollowEvent,
  FootprintPersonalInfo,
  FootprintPersonalInfoField,
  FootprintResult,
  FootprintSystemNote,
  MediaItem,
  MediaKind,
  MessageHeatmapParams,
  MessageHeatmapResult,
  MessageItem,
  OnThisDayParams,
  OnThisDayResult,
  PeopleListParams,
  PeopleListResult,
  PersonDetailParams,
  PersonDetailResult,
  SurpriseMemoryResult,
} from "./types";

function optionalRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  const record = optionalRecord(value, label);
  if (Object.keys(record).length === 0 && value === undefined) {
    throw new Error(`${label} are required.`);
  }
  return record;
}

function optionalNumber(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return value;
}

function requiredNonEmptyString(
  params: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = params[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new Error(`${key} is too long.`);
  }
  return value;
}

function optionalFilter(params: Record<string, unknown>): ArchiveFilter {
  const filter = params.filter;
  if (filter === undefined || filter === null) {
    return {};
  }
  if (typeof filter !== "object" || Array.isArray(filter)) {
    throw new Error("filter must be an object.");
  }
  return normalizeArchiveFilter(filter as ArchiveFilter);
}

async function preparedRows(
  connection: AsyncDuckDBConnection,
  sql: string,
  params: readonly SqlParameter[],
): Promise<SqlRow[]> {
  const statement = await connection.prepare(sql);
  try {
    const result = await statement.query(...params);
    const values: readonly unknown[] = result.toArray();
    return asSqlRows(values);
  } finally {
    await statement.close();
  }
}

async function queryRows(
  connection: AsyncDuckDBConnection,
  sql: string,
): Promise<SqlRow[]> {
  const result = await connection.query(sql);
  const values: readonly unknown[] = result.toArray();
  return asSqlRows(values);
}

function onlyRow(rows: SqlRow[], label: string): SqlRow {
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one ${label} row.`);
  }
  return rows[0];
}

function messageItem(row: SqlRow): MessageItem {
  return {
    rowId: readNumber(row, "row_id"),
    platform: readString(row, "platform"),
    conversation: readString(row, "conversation"),
    sender: readString(row, "sender"),
    sentAtMs: readNumber(row, "sent_at_ms"),
    text: readNullableString(row, "text"),
    mediaRef: readNullableString(row, "media_ref"),
  };
}

function mediaItem(row: SqlRow): MediaItem {
  const kind = readString(row, "kind") as MediaKind;
  return {
    rowId: readNumber(row, "row_id"),
    platform: readString(row, "platform"),
    zipPath: readString(row, "zip_path"),
    kind,
    takenAtMs: readNullableNumber(row, "taken_at_ms"),
    conversation: readNullableString(row, "conversation"),
  };
}

export async function deskHome(
  connection: AsyncDuckDBConnection,
  rawParams?: { filter?: ArchiveFilter },
): Promise<DeskHomeResult> {
  const params = optionalRecord(rawParams, "deskHome parameters");
  const filter = optionalFilter(params);
  const msg = messagesWhere(filter);
  const med = mediaWhere(filter);

  const overviewSql = `
    SELECT
      CAST((SELECT COUNT(*) FROM messages WHERE ${msg.clause}) AS DOUBLE) AS messages,
      CAST((SELECT COUNT(*) FROM media WHERE ${med.clause}) AS DOUBLE) AS media,
      CAST((
        SELECT COUNT(*) FROM (
          SELECT platform, conversation FROM messages WHERE ${msg.clause}
          GROUP BY platform, conversation
        )
      ) AS DOUBLE) AS conversations,
      CASE
        WHEN (SELECT MIN(sent_at) FROM messages WHERE ${msg.clause}) IS NULL THEN NULL
        ELSE epoch((SELECT MIN(sent_at) FROM messages WHERE ${msg.clause})) * 1000.0
      END AS active_from_ms,
      CASE
        WHEN (SELECT MAX(sent_at) FROM messages WHERE ${msg.clause}) IS NULL THEN NULL
        ELSE epoch((SELECT MAX(sent_at) FROM messages WHERE ${msg.clause})) * 1000.0
      END AS active_to_ms
  `;

  const overview = onlyRow(
    await preparedRows(connection, overviewSql, [
      ...msg.params,
      ...med.params,
      ...msg.params,
      ...msg.params,
      ...msg.params,
    ]),
    "desk overview",
  );

  const platforms = (
    await preparedRows(
      connection,
      `
        SELECT platform, CAST(COUNT(*) AS DOUBLE) AS message_count
        FROM messages
        WHERE ${msg.clause}
        GROUP BY platform
        ORDER BY COUNT(*) DESC, platform ASC
      `,
      msg.params,
    )
  ).map((row) => ({
    platform: readString(row, "platform"),
    messageCount: readNumber(row, "message_count"),
  }));

  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const onThisDayCountSql = `
    SELECT CAST(COUNT(*) AS DOUBLE) AS message_count
    FROM messages
    WHERE ${msg.clause}
      AND EXTRACT(month FROM sent_at) = ?
      AND EXTRACT(day FROM sent_at) = ?
  `;
  const onThisDayRow = onlyRow(
    await preparedRows(connection, onThisDayCountSql, [
      ...msg.params,
      month,
      day,
    ]),
    "on this day count",
  );

  const sampleMedia = (
    await preparedRows(
      connection,
      `
        SELECT
          CAST(rowid AS DOUBLE) AS row_id,
          platform,
          zip_path,
          kind,
          CASE WHEN taken_at IS NULL THEN NULL ELSE epoch(taken_at) * 1000.0 END AS taken_at_ms,
          conversation
        FROM media
        WHERE ${med.clause}
          AND kind = 'image'
          AND zip_path NOT LIKE 'omitted://%'
        ORDER BY taken_at DESC NULLS LAST, rowid DESC
        LIMIT 6
      `,
      med.params,
    )
  ).map(mediaItem);

  const onThisDayMessages = (
    await preparedRows(
      connection,
      `
        SELECT
          CAST(rowid AS DOUBLE) AS row_id,
          platform,
          conversation,
          sender,
          epoch(sent_at) * 1000.0 AS sent_at_ms,
          text,
          media_ref
        FROM messages
        WHERE ${msg.clause}
          AND EXTRACT(month FROM sent_at) = ?
          AND EXTRACT(day FROM sent_at) = ?
          AND text IS NOT NULL
        ORDER BY sent_at DESC, rowid DESC
        LIMIT 3
      `,
      [...msg.params, month, day],
    )
  ).map(messageItem);

  const recentMessages = (
    await preparedRows(
      connection,
      `
        SELECT
          CAST(rowid AS DOUBLE) AS row_id,
          platform,
          conversation,
          sender,
          epoch(sent_at) * 1000.0 AS sent_at_ms,
          text,
          media_ref
        FROM messages
        WHERE ${msg.clause}
          AND text IS NOT NULL
          AND length(trim(text)) > 0
        ORDER BY sent_at DESC, rowid DESC
        LIMIT 5
      `,
      msg.params,
    )
  ).map(messageItem);

  const topPeople = (
    await preparedRows(
      connection,
      `
        SELECT
          platform,
          conversation,
          CAST(COUNT(*) AS DOUBLE) AS message_count
        FROM messages
        WHERE ${msg.clause}
        GROUP BY platform, conversation
        ORDER BY COUNT(*) DESC, conversation ASC
        LIMIT 5
      `,
      msg.params,
    )
  ).map((row) => ({
    platform: readString(row, "platform"),
    conversation: readString(row, "conversation"),
    messageCount: readNumber(row, "message_count"),
  }));

  return {
    messages: readNumber(overview, "messages"),
    media: readNumber(overview, "media"),
    conversations: readNumber(overview, "conversations"),
    activeFromMs: readNullableNumber(overview, "active_from_ms"),
    activeToMs: readNullableNumber(overview, "active_to_ms"),
    platforms,
    onThisDayMessageCount: readNumber(onThisDayRow, "message_count"),
    onThisDayMonth: month,
    onThisDayDay: day,
    sampleMedia,
    recentMessages,
    onThisDayMessages,
    topPeople,
  };
}

export async function onThisDay(
  connection: AsyncDuckDBConnection,
  rawParams?: OnThisDayParams,
): Promise<OnThisDayResult> {
  const params = optionalRecord(rawParams, "onThisDay parameters");
  const filter = optionalFilter(params);
  const msg = messagesWhere(filter);
  const med = mediaWhere(filter);
  const now = new Date();
  const month =
    optionalNumber(params, "month") ?? now.getUTCMonth() + 1;
  const day = optionalNumber(params, "day") ?? now.getUTCDate();
  const limit = boundedInteger(optionalNumber(params, "limit"), 40, 1, 200);

  const messages = (
    await preparedRows(
      connection,
      `
        SELECT
          CAST(rowid AS DOUBLE) AS row_id,
          platform,
          conversation,
          sender,
          epoch(sent_at) * 1000.0 AS sent_at_ms,
          text,
          media_ref
        FROM messages
        WHERE ${msg.clause}
          AND EXTRACT(month FROM sent_at) = ?
          AND EXTRACT(day FROM sent_at) = ?
        ORDER BY sent_at DESC, rowid DESC
        LIMIT ?
      `,
      [...msg.params, month, day, limit],
    )
  ).map(messageItem);

  const media = (
    await preparedRows(
      connection,
      `
        SELECT
          CAST(rowid AS DOUBLE) AS row_id,
          platform,
          zip_path,
          kind,
          CASE WHEN taken_at IS NULL THEN NULL ELSE epoch(taken_at) * 1000.0 END AS taken_at_ms,
          conversation
        FROM media
        WHERE ${med.clause}
          AND taken_at IS NOT NULL
          AND EXTRACT(month FROM taken_at) = ?
          AND EXTRACT(day FROM taken_at) = ?
          AND zip_path NOT LIKE 'omitted://%'
        ORDER BY taken_at DESC, rowid DESC
        LIMIT ?
      `,
      [...med.params, month, day, limit],
    )
  ).map(mediaItem);

  return { month, day, messages, media };
}

export async function peopleList(
  connection: AsyncDuckDBConnection,
  rawParams?: PeopleListParams,
): Promise<PeopleListResult> {
  const params = optionalRecord(rawParams, "peopleList parameters");
  const filter = optionalFilter(params);
  const msg = messagesWhere(filter);
  const limit = boundedInteger(optionalNumber(params, "limit"), 200, 1, 10_000);
  const offset = boundedInteger(optionalNumber(params, "offset"), 0, 0, 1_000_000);

  const rows = await preparedRows(
    connection,
    `
      WITH conversation_counts AS (
        SELECT
          platform,
          conversation,
          CAST(COUNT(*) AS DOUBLE) AS message_count,
          CAST(COUNT(DISTINCT sender) AS DOUBLE) AS participant_count,
          epoch(MIN(sent_at)) * 1000.0 AS first_message_at_ms,
          epoch(MAX(sent_at)) * 1000.0 AS last_message_at_ms
        FROM messages
        WHERE ${msg.clause}
        GROUP BY platform, conversation
      ),
      media_counts AS (
        SELECT platform, conversation, CAST(COUNT(*) AS DOUBLE) AS media_count
        FROM media
        WHERE conversation IS NOT NULL
        GROUP BY platform, conversation
      )
      SELECT
        c.platform,
        c.conversation,
        c.message_count,
        c.participant_count,
        COALESCE(m.media_count, 0.0) AS media_count,
        c.first_message_at_ms,
        c.last_message_at_ms
      FROM conversation_counts AS c
      LEFT JOIN media_counts AS m
        ON m.platform = c.platform AND m.conversation = c.conversation
      ORDER BY c.message_count DESC, c.conversation ASC
      LIMIT ? OFFSET ?
    `,
    [...msg.params, limit, offset],
  );

  return {
    items: rows.map((row) => ({
      platform: readString(row, "platform"),
      conversation: readString(row, "conversation"),
      messageCount: readNumber(row, "message_count"),
      participantCount: readNumber(row, "participant_count"),
      mediaCount: readNumber(row, "media_count"),
      firstMessageAtMs: readNumber(row, "first_message_at_ms"),
      lastMessageAtMs: readNumber(row, "last_message_at_ms"),
    })),
    limit,
    offset,
  };
}

export async function personDetail(
  connection: AsyncDuckDBConnection,
  rawParams: PersonDetailParams,
): Promise<PersonDetailResult> {
  const params = requiredRecord(rawParams, "personDetail parameters");
  const conversation = requiredNonEmptyString(params, "conversation", 2_000);
  const filter = {
    ...optionalFilter(params),
    conversation,
  };
  const msg = messagesWhere(filter, { includeConversation: true });
  const med = mediaWhere(filter);

  const summary = onlyRow(
    await preparedRows(
      connection,
      `
        SELECT
          CAST(COUNT(*) AS DOUBLE) AS message_count,
          CAST(COUNT(DISTINCT sender) AS DOUBLE) AS participant_count,
          epoch(MIN(sent_at)) * 1000.0 AS first_message_at_ms,
          epoch(MAX(sent_at)) * 1000.0 AS last_message_at_ms
        FROM messages
        WHERE ${msg.clause}
      `,
      msg.params,
    ),
    "person summary",
  );

  if (readNumber(summary, "message_count") === 0) {
    return {
      conversation,
      platform: null,
      messageCount: 0,
      participantCount: 0,
      firstMessageAtMs: null,
      lastMessageAtMs: null,
      firstMessage: null,
      lastMessage: null,
      senderBalance: [],
      monthlyVolume: [],
      longestStreakDays: 0,
      longestSilenceDays: 0,
      media: [],
    };
  }

  const platformRow = onlyRow(
    await preparedRows(
      connection,
      `SELECT platform FROM messages WHERE ${msg.clause} LIMIT 1`,
      msg.params,
    ),
    "person platform",
  );

  const firstRow = onlyRow(
    await preparedRows(
      connection,
      `
        SELECT sender, text, epoch(sent_at) * 1000.0 AS sent_at_ms
        FROM messages
        WHERE ${msg.clause}
        ORDER BY sent_at ASC, rowid ASC
        LIMIT 1
      `,
      msg.params,
    ),
    "person first message",
  );

  const lastRow = onlyRow(
    await preparedRows(
      connection,
      `
        SELECT sender, text, epoch(sent_at) * 1000.0 AS sent_at_ms
        FROM messages
        WHERE ${msg.clause}
        ORDER BY sent_at DESC, rowid DESC
        LIMIT 1
      `,
      msg.params,
    ),
    "person last message",
  );

  const senderBalance = (
    await preparedRows(
      connection,
      `
        SELECT sender, CAST(COUNT(*) AS DOUBLE) AS message_count
        FROM messages
        WHERE ${msg.clause}
        GROUP BY sender
        ORDER BY COUNT(*) DESC, sender ASC
      `,
      msg.params,
    )
  ).map((row) => ({
    sender: readString(row, "sender"),
    messageCount: readNumber(row, "message_count"),
  }));

  const monthlyVolume = (
    await preparedRows(
      connection,
      `
        SELECT
          epoch(date_trunc('month', sent_at)) * 1000.0 AS month_start_ms,
          CAST(COUNT(*) AS DOUBLE) AS message_count
        FROM messages
        WHERE ${msg.clause}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      msg.params,
    )
  ).map((row) => ({
    monthStartMs: readNumber(row, "month_start_ms"),
    messageCount: readNumber(row, "message_count"),
  }));

  const dayRows = await preparedRows(
    connection,
    `
      SELECT CAST(epoch(date_trunc('day', sent_at)) * 1000.0 AS DOUBLE) AS day_ms
      FROM messages
      WHERE ${msg.clause}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    msg.params,
  );
  const days = dayRows.map((row) => readNumber(row, "day_ms"));
  const { longestStreakDays, longestSilenceDays } = computeStreakSilence(days);

  const media = (
    await preparedRows(
      connection,
      `
        SELECT
          CAST(rowid AS DOUBLE) AS row_id,
          platform,
          zip_path,
          kind,
          CASE WHEN taken_at IS NULL THEN NULL ELSE epoch(taken_at) * 1000.0 END AS taken_at_ms,
          conversation
        FROM media
        WHERE ${med.clause}
          AND zip_path NOT LIKE 'omitted://%'
        ORDER BY taken_at DESC NULLS LAST, rowid DESC
        LIMIT 24
      `,
      med.params,
    )
  ).map(mediaItem);

  return {
    conversation,
    platform: readString(platformRow, "platform"),
    messageCount: readNumber(summary, "message_count"),
    participantCount: readNumber(summary, "participant_count"),
    firstMessageAtMs: readNullableNumber(summary, "first_message_at_ms"),
    lastMessageAtMs: readNullableNumber(summary, "last_message_at_ms"),
    firstMessage: {
      sender: readString(firstRow, "sender"),
      text: readNullableString(firstRow, "text"),
      sentAtMs: readNumber(firstRow, "sent_at_ms"),
    },
    lastMessage: {
      sender: readString(lastRow, "sender"),
      text: readNullableString(lastRow, "text"),
      sentAtMs: readNumber(lastRow, "sent_at_ms"),
    },
    senderBalance,
    monthlyVolume,
    longestStreakDays,
    longestSilenceDays,
    media,
  };
}

export async function messageHeatmap(
  connection: AsyncDuckDBConnection,
  rawParams: MessageHeatmapParams,
): Promise<MessageHeatmapResult> {
  const params = requiredRecord(rawParams, "messageHeatmap parameters");
  const year = boundedInteger(optionalNumber(params, "year"), new Date().getUTCFullYear(), 1970, 2100);
  const filter = optionalFilter(params);
  const msg = messagesWhere({
    ...filter,
    fromMs: filter.fromMs ?? Date.UTC(year, 0, 1),
    toMs: filter.toMs ?? Date.UTC(year + 1, 0, 1),
  });

  const rows = await preparedRows(
    connection,
    `
      SELECT
        CAST(epoch(date_trunc('day', sent_at)) * 1000.0 AS DOUBLE) AS day_ms,
        CAST(COUNT(*) AS DOUBLE) AS message_count
      FROM messages
      WHERE ${msg.clause}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    msg.params,
  );

  const days = rows.map((row) => ({
    dayMs: readNumber(row, "day_ms"),
    messageCount: readNumber(row, "message_count"),
  }));
  const maxCount = days.reduce((max, day) => Math.max(max, day.messageCount), 0);

  return { year, days, maxCount };
}

export async function dayMessages(
  connection: AsyncDuckDBConnection,
  rawParams: DayMessagesParams,
): Promise<DayMessagesResult> {
  const params = requiredRecord(rawParams, "dayMessages parameters");
  const dayMs = optionalNumber(params, "dayMs");
  if (dayMs === undefined) {
    throw new Error("dayMs is required.");
  }
  const filter = optionalFilter(params);
  const fromMs = dayMs;
  const toMs = dayMs + 86_400_000;
  const msg = messagesWhere({ ...filter, fromMs, toMs });
  const limit = boundedInteger(optionalNumber(params, "limit"), 200, 1, 1_000);

  const items = (
    await preparedRows(
      connection,
      `
        SELECT
          CAST(rowid AS DOUBLE) AS row_id,
          platform,
          conversation,
          sender,
          epoch(sent_at) * 1000.0 AS sent_at_ms,
          text,
          media_ref
        FROM messages
        WHERE ${msg.clause}
        ORDER BY sent_at ASC, rowid ASC
        LIMIT ?
      `,
      [...msg.params, limit],
    )
  ).map(messageItem);

  return { dayMs, items };
}

export async function footprint(
  connection: AsyncDuckDBConnection,
  rawParams?: { filter?: ArchiveFilter },
): Promise<FootprintResult> {
  const params = optionalRecord(rawParams, "footprint parameters");
  const filter = optionalFilter(params);
  const evt = eventsWhere(filter);

  const comments = (
    await preparedRows(
      connection,
      `
        SELECT
          epoch(occurred_at) * 1000.0 AS occurred_at_ms,
          json_extract_string(payload, '$.text') AS text,
          json_extract_string(payload, '$.title') AS title,
          CAST(EXTRACT(year FROM occurred_at) AS DOUBLE) AS year
        FROM events
        WHERE ${evt.clause}
          AND kind = 'comment'
          AND json_extract_string(payload, '$.text') IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT 500
      `,
      evt.params,
    )
  ).map((row) => ({
    occurredAtMs: readNumber(row, "occurred_at_ms"),
    text: readString(row, "text"),
    title: readNullableString(row, "title"),
    year: readNumber(row, "year"),
  }));

  const interestRows = await preparedRows(
    connection,
    `
      SELECT
        CAST(EXTRACT(year FROM occurred_at) AS DOUBLE) AS year,
        json_extract_string(payload, '$.topic') AS topic
      FROM events
      WHERE ${evt.clause}
        AND kind = 'interest'
        AND json_extract_string(payload, '$.topic') IS NOT NULL
      ORDER BY occurred_at DESC
    `,
    evt.params,
  );
  const interestsByYear = new Map<number, string[]>();
  for (const row of interestRows) {
    const year = readNumber(row, "year");
    const topic = readString(row, "topic");
    const list = interestsByYear.get(year) ?? [];
    if (!list.includes(topic)) {
      list.push(topic);
    }
    interestsByYear.set(year, list);
  }

  const profileHistory = (
    await preparedRows(
      connection,
      `
        SELECT
          epoch(occurred_at) * 1000.0 AS occurred_at_ms,
          json_extract_string(payload, '$.field') AS field,
          json_extract_string(payload, '$.value') AS value
        FROM events
        WHERE ${evt.clause}
          AND kind = 'profile_change'
          AND json_extract_string(payload, '$.field') IN ('username', 'bio')
        ORDER BY occurred_at DESC
      `,
      evt.params,
    )
  ).map((row) => ({
    occurredAtMs: readNumber(row, "occurred_at_ms"),
    field: readString(row, "field") as "username" | "bio",
    value: readString(row, "value"),
  }));

  const followEvents: FootprintFollowEvent[] = (
    await preparedRows(
      connection,
      `
        SELECT
          kind,
          COALESCE(
            nullif(trim(json_extract_string(payload, '$.value')), ''),
            nullif(trim(json_extract_string(payload, '$.name')), '')
          ) AS username,
          epoch(occurred_at) * 1000.0 AS occurred_at_ms
        FROM events
        WHERE ${evt.clause}
          AND kind IN ('follower', 'following')
          AND COALESCE(
            nullif(trim(json_extract_string(payload, '$.value')), ''),
            nullif(trim(json_extract_string(payload, '$.name')), '')
          ) IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT 100
      `,
      evt.params,
    )
  ).map((row) => ({
    kind: readString(row, "kind") as "follower" | "following",
    username: readString(row, "username"),
    occurredAtMs: readNumber(row, "occurred_at_ms"),
  }));

  const personalInfo: FootprintPersonalInfo[] = (
    await preparedRows(
      connection,
      `
        SELECT
          epoch(occurred_at) * 1000.0 AS occurred_at_ms,
          COALESCE(json_extract_string(payload, '$.path'), '') AS path,
          payload
        FROM events
        WHERE ${evt.clause}
          AND kind = 'personal_info'
        ORDER BY occurred_at DESC
        LIMIT 50
      `,
      evt.params,
    )
  ).map((row) => ({
    occurredAtMs: readNumber(row, "occurred_at_ms"),
    path: readString(row, "path"),
    fields: personalInfoFields(readString(row, "payload")),
  }));

  const calls: FootprintCall[] = (
    await preparedRows(
      connection,
      `
        SELECT
          COALESCE(json_extract_string(payload, '$.media'), 'voice') AS media,
          CAST(json_extract(payload, '$.durationSec') AS DOUBLE) AS duration_sec,
          COALESCE(json_extract_string(payload, '$.conversation'), '') AS conversation,
          json_extract_string(payload, '$.text') AS text,
          epoch(occurred_at) * 1000.0 AS occurred_at_ms
        FROM events
        WHERE ${evt.clause}
          AND kind = 'call'
        ORDER BY occurred_at DESC
        LIMIT 100
      `,
      evt.params,
    )
  ).map((row) => ({
    media: readString(row, "media"),
    durationSec: readNullableNumber(row, "duration_sec"),
    conversation: readString(row, "conversation"),
    text: readNullableString(row, "text"),
    occurredAtMs: readNumber(row, "occurred_at_ms"),
  }));

  const systemNotes: FootprintSystemNote[] = (
    await preparedRows(
      connection,
      `
        SELECT
          COALESCE(json_extract_string(payload, '$.conversation'), '') AS conversation,
          COALESCE(json_extract_string(payload, '$.text'), '') AS text,
          epoch(occurred_at) * 1000.0 AS occurred_at_ms
        FROM events
        WHERE ${evt.clause}
          AND kind = 'system'
          AND json_extract_string(payload, '$.text') IS NOT NULL
          AND trim(json_extract_string(payload, '$.text')) <> ''
        ORDER BY occurred_at DESC
        LIMIT 100
      `,
      evt.params,
    )
  ).map((row) => ({
    conversation: readString(row, "conversation"),
    text: readString(row, "text"),
    occurredAtMs: readNumber(row, "occurred_at_ms"),
  }));

  return {
    comments,
    interestsByYear: [...interestsByYear.entries()]
      .map(([year, topics]) => ({ year, topics }))
      .sort((a, b) => b.year - a.year),
    profileHistory,
    followEvents,
    personalInfo,
    calls,
    systemNotes,
  };
}

function personalInfoFields(payloadJson: string): FootprintPersonalInfoField[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [];
  }
  const record = parsed as Record<string, unknown>;
  const data =
    typeof record.data === "object" &&
    record.data !== null &&
    !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : record;

  const fields: FootprintPersonalInfoField[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (
      key === "timestamp" ||
      key === "timestamp_ms" ||
      key === "creation_timestamp" ||
      key === "created_timestamp" ||
      key === "path"
    ) {
      continue;
    }
    const display = personalInfoValue(value);
    if (display !== null) {
      fields.push({ key, value: display });
    }
  }
  return fields;
}

function personalInfoValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => personalInfoValue(item))
      .filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    if (typeof nested.value === "string" && nested.value.trim().length > 0) {
      return nested.value.trim();
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
}

export async function surpriseMemory(
  connection: AsyncDuckDBConnection,
  rawParams?: { filter?: ArchiveFilter },
): Promise<SurpriseMemoryResult> {
  const params = optionalRecord(rawParams, "surpriseMemory parameters");
  const filter = optionalFilter(params);
  const msg = messagesWhere(filter);

  const rows = await preparedRows(
    connection,
    `
      SELECT
        CAST(rowid AS DOUBLE) AS row_id,
        platform,
        conversation,
        sender,
        epoch(sent_at) * 1000.0 AS sent_at_ms,
        text,
        media_ref
      FROM messages
      WHERE ${msg.clause}
        AND (
          (text IS NOT NULL AND length(trim(text)) > 12)
          OR (
            media_ref IS NOT NULL
            AND media_ref <> ''
            AND media_ref NOT LIKE 'omitted://%'
          )
        )
      ORDER BY random()
      LIMIT 1
    `,
    msg.params,
  );

  if (rows.length === 0) {
    return { message: null };
  }
  return { message: messageItem(rows[0]) };
}

export async function filterOptions(
  connection: AsyncDuckDBConnection,
): Promise<{
  platforms: string[];
  conversations: Array<{ platform: string; conversation: string; messageCount: number }>;
  activeFromMs: number | null;
  activeToMs: number | null;
}> {
  const platforms = (
    await queryRows(
      connection,
      `
        SELECT DISTINCT platform
        FROM messages
        ORDER BY platform ASC
      `,
    )
  ).map((row) => readString(row, "platform"));

  const conversations = (
    await queryRows(
      connection,
      `
        SELECT
          platform,
          conversation,
          CAST(COUNT(*) AS DOUBLE) AS message_count
        FROM messages
        GROUP BY platform, conversation
        ORDER BY COUNT(*) DESC, conversation ASC
        LIMIT 500
      `,
    )
  ).map((row) => ({
    platform: readString(row, "platform"),
    conversation: readString(row, "conversation"),
    messageCount: readNumber(row, "message_count"),
  }));

  const range = onlyRow(
    await queryRows(
      connection,
      `
        SELECT
          CASE WHEN MIN(sent_at) IS NULL THEN NULL ELSE epoch(MIN(sent_at)) * 1000.0 END AS active_from_ms,
          CASE WHEN MAX(sent_at) IS NULL THEN NULL ELSE epoch(MAX(sent_at)) * 1000.0 END AS active_to_ms
        FROM messages
      `,
    ),
    "filter range",
  );

  return {
    platforms,
    conversations,
    activeFromMs: readNullableNumber(range, "active_from_ms"),
    activeToMs: readNullableNumber(range, "active_to_ms"),
  };
}
