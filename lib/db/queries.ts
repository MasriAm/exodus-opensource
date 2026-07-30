import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

import { ARABIC_STOPWORDS, ENGLISH_STOPWORDS } from "../text";
import { messagesWhere, mediaWhere, mergeFilters } from "./archive-filter";
import {
  dayMessages,
  deskHome,
  filterOptions,
  footprint,
  messageHeatmap,
  onThisDay,
  peopleList,
  personDetail,
  surpriseMemory,
} from "./desk-queries";
import { EXPORT_FORMATS, exportTableMetadata } from "./export";
import {
  boundedInteger,
  createSearchSnippet,
  escapeLikePattern,
  isMediaKind,
  requireFiniteNumber,
} from "./helpers";
import {
  asSqlRows,
  readNullableNumber,
  readNullableString,
  readNumber,
  readString,
  type SqlRow,
} from "./row-values";
import { parseSearchQuery } from "./search-tokens";
import type {
  ActivityBucket,
  ActivityGranularity,
  ActivityTimelineParams,
  ActivityTimelineResult,
  ConversationListItem,
  ConversationListParams,
  ConversationListResult,
  CountsResult,
  DayMessagesParams,
  ExportMetadataResult,
  ExportTable,
  MediaKind,
  MediaItem,
  MediaListParams,
  MediaListResult,
  MessageCursor,
  MessageHeatmapParams,
  MessageRankParams,
  MessageRankResult,
  MessageItem,
  MessagesPageParams,
  MessagesPageResult,
  OnThisDayParams,
  PeopleListParams,
  PersonDetailParams,
  QueryName,
  QueryParamsByName,
  QueryResultByName,
  SearchGroup,
  SearchHit,
  SearchParams,
  SearchResult,
  WrappedBusiestDay,
  WrappedContact,
  WrappedCringeComment,
  WrappedFirstImage,
  WrappedFirstMessage,
  WrappedHour,
  WrappedInterestsByYear,
  WrappedLongestCall,
  WrappedMutualFollow,
  WrappedProfileChange,
  WrappedStatsResult,
  WrappedStreak,
  WrappedWord,
} from "./types";

type SqlParameter = string | number | boolean | null;

const CONVERSATION_LIST_SQL = `
  WITH conversation_counts AS (
    SELECT
      platform,
      conversation,
      CAST(COUNT(*) AS DOUBLE) AS message_count,
      CAST(COUNT(DISTINCT sender) AS DOUBLE) AS participant_count
    FROM messages
    GROUP BY platform, conversation
  ),
  media_counts AS (
    SELECT
      platform,
      conversation,
      CAST(COUNT(*) AS DOUBLE) AS media_count
    FROM media
    WHERE conversation IS NOT NULL
    GROUP BY platform, conversation
  ),
  latest_messages AS (
    SELECT
      platform,
      conversation,
      sender,
      sent_at,
      text,
      ROW_NUMBER() OVER (
        PARTITION BY platform, conversation
        ORDER BY sent_at DESC, rowid DESC
      ) AS message_rank
    FROM messages
  )
  SELECT
    counts.platform,
    counts.conversation,
    counts.message_count,
    counts.participant_count,
    COALESCE(media_counts.media_count, 0.0) AS media_count,
    epoch(latest_messages.sent_at) * 1000.0 AS last_message_at_ms,
    latest_messages.sender AS last_sender,
    latest_messages.text AS preview
  FROM conversation_counts AS counts
  INNER JOIN latest_messages
    ON latest_messages.platform = counts.platform
    AND latest_messages.conversation = counts.conversation
    AND latest_messages.message_rank = 1
  LEFT JOIN media_counts
    ON media_counts.platform = counts.platform
    AND media_counts.conversation = counts.conversation
  ORDER BY latest_messages.sent_at DESC, counts.conversation ASC
  LIMIT ? OFFSET ?
`;

const MESSAGES_PAGE_SQL = `
  SELECT
    CAST(rowid AS DOUBLE) AS row_id,
    platform,
    conversation,
    sender,
    epoch(sent_at) * 1000.0 AS sent_at_ms,
    text,
    media_ref
  FROM messages
  WHERE conversation = ?
    AND (
      CAST(? AS DOUBLE) IS NULL
      OR sent_at < epoch_ms(CAST(? AS BIGINT))
      OR (
        sent_at = epoch_ms(CAST(? AS BIGINT))
        AND rowid < CAST(? AS BIGINT)
      )
    )
  ORDER BY sent_at DESC, rowid DESC
  LIMIT ?
`;

const COUNTS_SQL = `
  SELECT
    CAST((SELECT COUNT(*) FROM messages) AS DOUBLE) AS messages,
    CAST((SELECT COUNT(*) FROM media) AS DOUBLE) AS media,
    CAST((SELECT COUNT(*) FROM events) AS DOUBLE) AS events,
    CAST((
      SELECT COUNT(*)
      FROM (
        SELECT platform, conversation
        FROM messages
        GROUP BY platform, conversation
      )
    ) AS DOUBLE) AS conversations,
    CAST((
      SELECT COUNT(*)
      FROM (
        SELECT platform FROM messages
        UNION
        SELECT platform FROM media
        UNION
        SELECT platform FROM events
      )
    ) AS DOUBLE) AS platforms
`;

const SEARCH_COUNT_SQL = `
  SELECT CAST(COUNT(*) AS DOUBLE) AS total_hits
  FROM messages
  WHERE text IS NOT NULL
    AND text ILIKE ? ESCAPE '\\'
`;

const SEARCH_SQL = `
  WITH hits AS (
    SELECT
      rowid,
      platform,
      conversation,
      sender,
      sent_at,
      text
    FROM messages
    WHERE text IS NOT NULL
      AND text ILIKE ? ESCAPE '\\'
  )
  SELECT
    CAST(rowid AS DOUBLE) AS row_id,
    platform,
    conversation,
    sender,
    epoch(sent_at) * 1000.0 AS sent_at_ms,
    text,
    CAST(
      COUNT(*) OVER (PARTITION BY platform, conversation)
      AS DOUBLE
    ) AS conversation_hit_count
  FROM hits
  ORDER BY sent_at DESC, rowid DESC
  LIMIT ? OFFSET ?
`;

const ACTIVITY_DAY_SQL = activityTimelineSql("day");
const ACTIVITY_MONTH_SQL = activityTimelineSql("month");

const MEDIA_LIST_SQL = `
  SELECT
    CAST(rowid AS DOUBLE) AS row_id,
    platform,
    zip_path,
    kind,
    CASE
      WHEN taken_at IS NULL THEN NULL
      ELSE epoch(taken_at) * 1000.0
    END AS taken_at_ms,
    conversation
  FROM media
  WHERE (CAST(? AS VARCHAR) IS NULL OR kind = CAST(? AS VARCHAR))
    AND (
      CAST(? AS VARCHAR) IS NULL
      OR conversation = CAST(? AS VARCHAR)
    )
  ORDER BY taken_at DESC NULLS LAST, rowid DESC
  LIMIT ? OFFSET ?
`;

const WRAPPED_OVERVIEW_SQL = `
  SELECT
    CAST((SELECT COUNT(*) FROM messages) AS DOUBLE) AS total_messages,
    CAST((SELECT COUNT(*) FROM media) AS DOUBLE) AS total_media,
    CASE
      WHEN MIN(sent_at) IS NULL THEN NULL
      ELSE epoch(MIN(sent_at)) * 1000.0
    END AS active_from_ms,
    CASE
      WHEN MAX(sent_at) IS NULL THEN NULL
      ELSE epoch(MAX(sent_at)) * 1000.0
    END AS active_to_ms
  FROM messages
`;

const WRAPPED_TOP_CONTACTS_SQL = `
  SELECT
    conversation,
    CAST(COUNT(*) AS DOUBLE) AS message_count
  FROM messages
  GROUP BY conversation
  ORDER BY COUNT(*) DESC, conversation ASC
  LIMIT 5
`;

const WRAPPED_HOURS_SQL = `
  WITH hours AS (
    SELECT hour
    FROM range(0, 24) AS generated_hours(hour)
  ),
  message_counts AS (
    SELECT
      CAST(EXTRACT(hour FROM sent_at) AS INTEGER) AS hour,
      COUNT(*) AS message_count
    FROM messages
    GROUP BY EXTRACT(hour FROM sent_at)
  )
  SELECT
    CAST(hours.hour AS DOUBLE) AS hour,
    CAST(COALESCE(message_counts.message_count, 0) AS DOUBLE)
      AS message_count
  FROM hours
  LEFT JOIN message_counts ON message_counts.hour = hours.hour
  ORDER BY hours.hour ASC
`;

const WRAPPED_BUSIEST_DAY_SQL = `
  SELECT
    strftime(CAST(sent_at AS DATE), '%Y-%m-%d') AS active_date,
    CAST(COUNT(*) AS DOUBLE) AS message_count
  FROM messages
  GROUP BY CAST(sent_at AS DATE)
  ORDER BY COUNT(*) DESC, CAST(sent_at AS DATE) ASC
  LIMIT 1
`;

const WRAPPED_STOP_WORDS: readonly string[] = [
  ...ENGLISH_STOPWORDS,
  ...ARABIC_STOPWORDS,
];

/** Sample up to 80k message rows so word stats stay bounded on huge archives. */
const WRAPPED_TOP_WORDS_SQL = `
  WITH sampled AS (
    SELECT text
    FROM messages
    WHERE text IS NOT NULL AND length(trim(text)) > 0
    USING SAMPLE 80000 ROWS
  ),
  words AS (
    SELECT extracted.word
    FROM sampled,
    UNNEST(
      regexp_extract_all(
        lower(COALESCE(text, '')),
        '[\\p{L}\\p{M}\\p{N}]+'
      )
    ) AS extracted(word)
  )
  SELECT
    word,
    CAST(COUNT(*) AS DOUBLE) AS word_count
  FROM words
  WHERE length(word) >= 2
    AND word NOT IN (${WRAPPED_STOP_WORDS.map(() => "?").join(", ")})
  GROUP BY word
  ORDER BY COUNT(*) DESC, word ASC
  LIMIT 20
`;

const WRAPPED_FIRST_MESSAGE_SQL = `
  SELECT
    text,
    epoch(sent_at) * 1000.0 AS sent_at_ms,
    conversation,
    sender
  FROM messages
  ORDER BY sent_at ASC, rowid ASC
  LIMIT 1
`;

const WRAPPED_LONGEST_STREAK_SQL = `
  WITH active_days AS (
    SELECT DISTINCT CAST(sent_at AS DATE) AS active_day
    FROM messages
  ),
  numbered_days AS (
    SELECT
      active_day,
      active_day - CAST(
        ROW_NUMBER() OVER (ORDER BY active_day)
        AS INTEGER
      ) AS streak_group
    FROM active_days
  ),
  streaks AS (
    SELECT
      MIN(active_day) AS start_day,
      MAX(active_day) AS end_day,
      COUNT(*) AS streak_days
    FROM numbered_days
    GROUP BY streak_group
  )
  SELECT
    CAST(streak_days AS DOUBLE) AS streak_days,
    strftime(start_day, '%Y-%m-%d') AS start_date,
    strftime(end_day, '%Y-%m-%d') AS end_date
  FROM streaks
  ORDER BY streak_days DESC, start_day ASC
  LIMIT 1
`;

const WRAPPED_MUTUAL_FOLLOWS_SQL = `
  SELECT
    lower(trim(json_extract_string(follower.payload, '$.value'))) AS username,
    epoch(greatest(follower.occurred_at, following.occurred_at)) * 1000.0
      AS started_at_ms
  FROM events AS follower
  INNER JOIN events AS following
    ON lower(trim(json_extract_string(follower.payload, '$.value')))
     = lower(trim(json_extract_string(following.payload, '$.value')))
  WHERE follower.kind = 'follower'
    AND following.kind = 'following'
    AND json_extract_string(follower.payload, '$.value') IS NOT NULL
    AND trim(json_extract_string(follower.payload, '$.value')) <> ''
  ORDER BY
    greatest(follower.occurred_at, following.occurred_at) ASC,
    username ASC
  LIMIT 8
`;

const WRAPPED_LONGEST_CALL_SQL = `
  SELECT
    json_extract_string(payload, '$.media') AS media,
    CAST(json_extract(payload, '$.durationSec') AS DOUBLE) AS duration_sec,
    json_extract_string(payload, '$.conversation') AS conversation,
    epoch(occurred_at) * 1000.0 AS occurred_at_ms
  FROM events
  WHERE kind = 'call'
    AND json_extract(payload, '$.durationSec') IS NOT NULL
  ORDER BY
    CAST(json_extract(payload, '$.durationSec') AS DOUBLE) DESC,
    occurred_at ASC
  LIMIT 1
`;

/** Prefer older comments for "cringe", but never hide the slide when comments exist. */
const WRAPPED_CRINGE_COMMENTS_SQL = `
  SELECT
    json_extract_string(payload, '$.text') AS text,
    epoch(occurred_at) * 1000.0 AS occurred_at_ms
  FROM events
  WHERE kind = 'comment'
    AND json_extract_string(payload, '$.text') IS NOT NULL
    AND trim(json_extract_string(payload, '$.text')) <> ''
  ORDER BY 
    CASE WHEN occurred_at <= current_date - INTERVAL 3 YEAR THEN 0 ELSE 1 END ASC,
    random()
  LIMIT 12
`;

const WRAPPED_INTERESTS_SQL = `
  SELECT
    CAST(EXTRACT(year FROM occurred_at) AS DOUBLE) AS year,
    json_extract_string(payload, '$.topic') AS topic,
    epoch(occurred_at) * 1000.0 AS occurred_at_ms
  FROM events
  WHERE kind = 'interest'
    AND json_extract_string(payload, '$.topic') IS NOT NULL
    AND trim(json_extract_string(payload, '$.topic')) <> ''
  ORDER BY year ASC, occurred_at ASC
`;

const WRAPPED_PROFILE_HISTORY_SQL = `
  SELECT
    json_extract_string(payload, '$.field') AS field,
    json_extract_string(payload, '$.value') AS value,
    epoch(occurred_at) * 1000.0 AS occurred_at_ms
  FROM events
  WHERE kind = 'profile_change'
    AND json_extract_string(payload, '$.field') IS NOT NULL
    AND json_extract_string(payload, '$.value') IS NOT NULL
  ORDER BY occurred_at ASC, rowid ASC
`;

const WRAPPED_FIRST_IMAGE_SQL = `
  SELECT
    zip_path,
    conversation,
    CASE
      WHEN taken_at IS NULL THEN NULL
      ELSE epoch(taken_at) * 1000.0
    END AS taken_at_ms
  FROM media
  WHERE kind = 'image'
    AND conversation IS NOT NULL
    AND zip_path IS NOT NULL
    AND zip_path NOT LIKE 'omitted://%'
    AND taken_at <= current_date - INTERVAL 3 YEAR
  ORDER BY random()
  LIMIT 8
`;

const EXPORT_METADATA_SQL = `
  SELECT 'messages' AS table_name, CAST(COUNT(*) AS DOUBLE) AS row_count
  FROM messages
  UNION ALL
  SELECT 'media' AS table_name, CAST(COUNT(*) AS DOUBLE) AS row_count
  FROM media
  UNION ALL
  SELECT 'events' AS table_name, CAST(COUNT(*) AS DOUBLE) AS row_count
  FROM events
  ORDER BY table_name ASC
`;

export const NAMED_QUERY_SQL = {
  conversationList: CONVERSATION_LIST_SQL,
  messagesPage: MESSAGES_PAGE_SQL,
  counts: COUNTS_SQL,
  searchCount: SEARCH_COUNT_SQL,
  search: SEARCH_SQL,
  activityTimeline: {
    day: ACTIVITY_DAY_SQL,
    month: ACTIVITY_MONTH_SQL,
  },
  mediaList: MEDIA_LIST_SQL,
  wrappedStats: {
    overview: WRAPPED_OVERVIEW_SQL,
    topContacts: WRAPPED_TOP_CONTACTS_SQL,
    hours: WRAPPED_HOURS_SQL,
    busiestDay: WRAPPED_BUSIEST_DAY_SQL,
    topWords: WRAPPED_TOP_WORDS_SQL,
    firstMessage: WRAPPED_FIRST_MESSAGE_SQL,
    longestStreak: WRAPPED_LONGEST_STREAK_SQL,
    mutualFollows: WRAPPED_MUTUAL_FOLLOWS_SQL,
    longestCall: WRAPPED_LONGEST_CALL_SQL,
    cringeComments: WRAPPED_CRINGE_COMMENTS_SQL,
    interests: WRAPPED_INTERESTS_SQL,
    profileHistory: WRAPPED_PROFILE_HISTORY_SQL,
    firstImage: WRAPPED_FIRST_IMAGE_SQL,
  },
  exportMetadata: EXPORT_METADATA_SQL,
} as const;

export const WRAPPED_WORD_QUERY_PARAMETERS: readonly string[] =
  WRAPPED_STOP_WORDS;

export async function executeNamedQuery<Name extends QueryName>(
  connection: AsyncDuckDBConnection,
  name: Name,
  params: QueryParamsByName[Name],
): Promise<QueryResultByName[Name]> {
  switch (name) {
    case "conversationList":
      return (await conversationList(
        connection,
        params as ConversationListParams | undefined,
      )) as QueryResultByName[Name];
    case "messageRank":
      return (await messageRank(
        connection,
        params as MessageRankParams,
      )) as QueryResultByName[Name];
    case "messagesPage":
      return (await messagesPage(
        connection,
        params as MessagesPageParams,
      )) as QueryResultByName[Name];
    case "counts":
      return (await counts(connection)) as QueryResultByName[Name];
    case "search":
      return (await search(
        connection,
        params as SearchParams,
      )) as QueryResultByName[Name];
    case "activityTimeline":
      return (await activityTimeline(
        connection,
        params as ActivityTimelineParams | undefined,
      )) as QueryResultByName[Name];
    case "mediaList":
      return (await mediaList(
        connection,
        params as MediaListParams | undefined,
      )) as QueryResultByName[Name];
    case "wrappedStats":
      return (await wrappedStats(connection)) as QueryResultByName[Name];
    case "exportMetadata":
      return (await exportMetadata(connection)) as QueryResultByName[Name];
    case "deskHome":
      return (await deskHome(
        connection,
        params as { filter?: ConversationListParams["filter"] } | undefined,
      )) as QueryResultByName[Name];
    case "onThisDay":
      return (await onThisDay(
        connection,
        params as OnThisDayParams | undefined,
      )) as QueryResultByName[Name];
    case "peopleList":
      return (await peopleList(
        connection,
        params as PeopleListParams | undefined,
      )) as QueryResultByName[Name];
    case "personDetail":
      return (await personDetail(
        connection,
        params as PersonDetailParams,
      )) as QueryResultByName[Name];
    case "messageHeatmap":
      return (await messageHeatmap(
        connection,
        params as MessageHeatmapParams,
      )) as QueryResultByName[Name];
    case "dayMessages":
      return (await dayMessages(
        connection,
        params as DayMessagesParams,
      )) as QueryResultByName[Name];
    case "footprint":
      return (await footprint(
        connection,
        params as { filter?: ConversationListParams["filter"] } | undefined,
      )) as QueryResultByName[Name];
    case "surpriseMemory":
      return (await surpriseMemory(
        connection,
        params as { filter?: ConversationListParams["filter"] } | undefined,
      )) as QueryResultByName[Name];
    case "filterOptions":
      return (await filterOptions(connection)) as QueryResultByName[Name];
  }
}

export async function conversationList(
  connection: AsyncDuckDBConnection,
  rawParams?: ConversationListParams,
): Promise<ConversationListResult> {
  const params = optionalRecord(rawParams, "conversationList parameters");
  const limit = boundedInteger(optionalNumber(params, "limit"), 100, 1, 10_000);
  const offset = boundedInteger(optionalNumber(params, "offset"), 0, 0, 1_000_000);
  const filter = messagesWhere(
    (params.filter as ConversationListParams["filter"]) ?? {},
  );
  const sql = `
    WITH conversation_counts AS (
      SELECT
        platform,
        conversation,
        CAST(COUNT(*) AS DOUBLE) AS message_count,
        CAST(COUNT(DISTINCT sender) AS DOUBLE) AS participant_count
      FROM messages
      WHERE ${filter.clause}
      GROUP BY platform, conversation
    ),
    media_counts AS (
      SELECT
        platform,
        conversation,
        CAST(COUNT(*) AS DOUBLE) AS media_count
      FROM media
      WHERE conversation IS NOT NULL
      GROUP BY platform, conversation
    ),
    latest_messages AS (
      SELECT
        platform,
        conversation,
        sender,
        sent_at,
        text,
        ROW_NUMBER() OVER (
          PARTITION BY platform, conversation
          ORDER BY sent_at DESC, rowid DESC
        ) AS message_rank
      FROM messages
      WHERE ${filter.clause}
    )
    SELECT
      counts.platform,
      counts.conversation,
      counts.message_count,
      counts.participant_count,
      COALESCE(media_counts.media_count, 0.0) AS media_count,
      epoch(latest_messages.sent_at) * 1000.0 AS last_message_at_ms,
      latest_messages.sender AS last_sender,
      latest_messages.text AS preview
    FROM conversation_counts AS counts
    INNER JOIN latest_messages
      ON latest_messages.platform = counts.platform
      AND latest_messages.conversation = counts.conversation
      AND latest_messages.message_rank = 1
    LEFT JOIN media_counts
      ON media_counts.platform = counts.platform
      AND media_counts.conversation = counts.conversation
    ORDER BY latest_messages.sent_at DESC, counts.conversation ASC
    LIMIT ? OFFSET ?
  `;
  const rows = await preparedRows(connection, sql, [
    ...filter.params,
    ...filter.params,
    limit,
    offset,
  ]);
  return {
    items: rows.map(conversationListItem),
    limit,
    offset,
  };
}

export async function messageRank(
  connection: AsyncDuckDBConnection,
  rawParams: MessageRankParams,
): Promise<MessageRankResult> {
  const params = requiredRecord(rawParams, "messageRank parameters");
  const rowId = optionalNumber(params, "rowId");
  if (rowId === undefined) throw new Error("rowId is required.");
  const sentAtMs = optionalNumber(params, "sentAtMs");
  if (sentAtMs === undefined) throw new Error("sentAtMs is required.");
  const filter = messagesWhere(
    (params.filter as MessageRankParams["filter"]) ?? {},
  );

  const row = onlyRow(
    await preparedRows(
      connection,
      `
      SELECT CAST(COUNT(*) AS DOUBLE) AS rank
      FROM messages
      WHERE ${filter.clause}
        AND (
          epoch(sent_at) * 1000.0 < CAST(? AS DOUBLE)
          OR (epoch(sent_at) * 1000.0 = CAST(? AS DOUBLE) AND rowid <= CAST(? AS BIGINT))
        )
      `,
      [...filter.params, sentAtMs, sentAtMs, rowId],
    ),
    "message rank",
  );

  return {
    rank: readNumber(row, "rank"),
  };
}

export async function messagesPage(
  connection: AsyncDuckDBConnection,
  rawParams: MessagesPageParams,
): Promise<MessagesPageResult> {
  const params = requiredRecord(rawParams, "messagesPage parameters");
  const conversation = requiredNonEmptyString(
    params,
    "conversation",
    2_000,
  );
  const limit = boundedInteger(optionalNumber(params, "limit"), 100, 1, 500);
  const offset = boundedInteger(optionalNumber(params, "offset"), 0, 0, 1_000_000);
  const before = optionalMessageCursor(params.before);
  const filter = messagesWhere(
    mergeFilters((params.filter as MessagesPageParams["filter"]) ?? {}, {
      conversation,
    }),
  );

  const countRow = onlyRow(
    await preparedRows(
      connection,
      `SELECT CAST(COUNT(*) AS DOUBLE) AS total FROM messages WHERE ${filter.clause}`,
      filter.params,
    ),
    "messages page count",
  );
  const totalCount = readNumber(countRow, "total");

  // Offset mode: chronological pages for the Archive Terminal pager.
  if (params.offset !== undefined && params.offset !== null) {
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
        WHERE ${filter.clause}
        ORDER BY sent_at ASC, rowid ASC
        LIMIT ? OFFSET ?
      `,
      [...filter.params, limit, offset],
    );
    return {
      items: rows.map(messageItem),
      hasMore: offset + rows.length < totalCount,
      nextBefore: null,
      totalCount,
      offset,
      limit,
    };
  }

  const sql = `
    SELECT
      CAST(rowid AS DOUBLE) AS row_id,
      platform,
      conversation,
      sender,
      epoch(sent_at) * 1000.0 AS sent_at_ms,
      text,
      media_ref
    FROM messages
    WHERE ${filter.clause}
      AND (
        CAST(? AS DOUBLE) IS NULL
        OR sent_at < epoch_ms(CAST(? AS BIGINT))
        OR (
          sent_at = epoch_ms(CAST(? AS BIGINT))
          AND rowid < CAST(? AS BIGINT)
        )
      )
    ORDER BY sent_at DESC, rowid DESC
    LIMIT ?
  `;
  const rows = await preparedRows(connection, sql, [
    ...filter.params,
    before?.sentAtMs ?? null,
    before?.sentAtMs ?? null,
    before?.sentAtMs ?? null,
    before?.rowId ?? null,
    limit + 1,
  ]);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(messageItem);
  const lastItem = items.at(-1);
  return {
    items,
    hasMore,
    nextBefore:
      hasMore && lastItem
        ? { sentAtMs: lastItem.sentAtMs, rowId: lastItem.rowId }
        : null,
    totalCount,
    offset: 0,
    limit,
  };
}

export async function counts(
  connection: AsyncDuckDBConnection,
): Promise<CountsResult> {
  const row = onlyRow(await queryRows(connection, COUNTS_SQL), "counts");
  return {
    messages: readNumber(row, "messages"),
    media: readNumber(row, "media"),
    events: readNumber(row, "events"),
    conversations: readNumber(row, "conversations"),
    platforms: readNumber(row, "platforms"),
  };
}

export async function search(
  connection: AsyncDuckDBConnection,
  rawParams: SearchParams,
): Promise<SearchResult> {
  const params = requiredRecord(rawParams, "search parameters");
  const term = requiredNonEmptyString(params, "term", 256);
  const limit = boundedInteger(optionalNumber(params, "limit"), 100, 1, 500);
  const offset = boundedInteger(optionalNumber(params, "offset"), 0, 0, 1_000_000);
  const parsed = parseSearchQuery(term);
  const baseFilter = (params.filter as SearchParams["filter"]) ?? {};
  const merged = mergeFilters(baseFilter, {
    conversation: parsed.conversation,
    fromMs: parsed.afterMs,
    toMs: parsed.beforeMs,
  });
  const filter = messagesWhere(merged);
  const freeText = parsed.freeText;
  const pattern = freeText ? `%${escapeLikePattern(freeText)}%` : "%";
  const matchTerms = freeText
    ? freeText.split(/\s+/).filter(Boolean)
    : [];

  const whereParts = [filter.clause];
  const queryParams: SqlParameter[] = [...filter.params];

  if (freeText) {
    whereParts.push(`text IS NOT NULL AND text ILIKE ? ESCAPE '\\'`);
    queryParams.push(pattern);
  } else if (
    !parsed.from &&
    !parsed.conversation &&
    !parsed.beforeMs &&
    !parsed.afterMs &&
    !parsed.hasMedia
  ) {
    whereParts.push(`text IS NOT NULL AND text ILIKE ? ESCAPE '\\'`);
    queryParams.push(pattern);
  } else {
    whereParts.push(`text IS NOT NULL`);
  }

  if (parsed.from) {
    whereParts.push(`sender ILIKE ? ESCAPE '\\'`);
    queryParams.push(`%${escapeLikePattern(parsed.from)}%`);
  }
  if (parsed.hasMedia) {
    whereParts.push(`media_ref IS NOT NULL`);
  }

  const whereSql = whereParts.join(" AND ");
  const countSql = `SELECT CAST(COUNT(*) AS DOUBLE) AS total_hits FROM messages WHERE ${whereSql}`;
  const searchSql = `
    WITH hits AS (
      SELECT rowid, platform, conversation, sender, sent_at, text
      FROM messages
      WHERE ${whereSql}
    )
    SELECT
      CAST(rowid AS DOUBLE) AS row_id,
      platform,
      conversation,
      sender,
      epoch(sent_at) * 1000.0 AS sent_at_ms,
      text,
      CAST(COUNT(*) OVER (PARTITION BY platform, conversation) AS DOUBLE) AS conversation_hit_count
    FROM hits
    ORDER BY sent_at DESC, rowid DESC
    LIMIT ? OFFSET ?
  `;

  const totalRow = onlyRow(
    await preparedRows(connection, countSql, queryParams),
    "search count",
  );
  const rows = await preparedRows(connection, searchSql, [
    ...queryParams,
    limit,
    offset,
  ]);
  const groups = new Map<string, SearchGroup>();
  const highlightTerm = freeText || term;

  for (const row of rows) {
    const hit = searchHit(row, highlightTerm, matchTerms);
    let group = groups.get(hit.conversation);
    if (!group) {
      group = {
        conversation: hit.conversation,
        hitCount: readNumber(row, "conversation_hit_count"),
        hits: [],
      };
      groups.set(hit.conversation, group);
    }
    group.hits.push(hit);
  }

  return {
    term,
    totalHits: readNumber(totalRow, "total_hits"),
    groups: [...groups.values()],
    limit,
    offset,
  };
}

export async function activityTimeline(
  connection: AsyncDuckDBConnection,
  rawParams?: ActivityTimelineParams,
): Promise<ActivityTimelineResult> {
  const params = optionalRecord(rawParams, "activityTimeline parameters");
  const granularity = activityGranularity(params.granularity);
  const fromMs = optionalFiniteNumber(params, "fromMs");
  const toMs = optionalFiniteNumber(params, "toMs");
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    throw new Error("fromMs must be before toMs.");
  }
  const sql =
    granularity === "day" ? ACTIVITY_DAY_SQL : ACTIVITY_MONTH_SQL;
  const rows = await preparedRows(connection, sql, [
    fromMs,
    fromMs,
    toMs,
    toMs,
  ]);
  const buckets = new Map<number, ActivityBucket>();

  for (const row of rows) {
    const bucketStartMs = readNumber(row, "bucket_start_ms");
    let bucket = buckets.get(bucketStartMs);
    if (!bucket) {
      bucket = { bucketStartMs, total: 0, kinds: [] };
      buckets.set(bucketStartMs, bucket);
    }
    const count = readNumber(row, "event_count");
    bucket.total += count;
    bucket.kinds.push({ kind: readString(row, "kind"), count });
  }

  return { granularity, buckets: [...buckets.values()] };
}

export async function mediaList(
  connection: AsyncDuckDBConnection,
  rawParams?: MediaListParams,
): Promise<MediaListResult> {
  const params = optionalRecord(rawParams, "mediaList parameters");
  const kind = optionalMediaKind(params.kind);
  const conversation = optionalNullableString(
    params,
    "conversation",
    2_000,
  );
  const limit = boundedInteger(optionalNumber(params, "limit"), 100, 1, 10_000);
  const offset = boundedInteger(optionalNumber(params, "offset"), 0, 0, 1_000_000);
  const filter = mediaWhere(
    mergeFilters((params.filter as MediaListParams["filter"]) ?? {}, {
      conversation,
    }),
  );
  const whereSql = `${filter.clause}
      AND (CAST(? AS VARCHAR) IS NULL OR kind = CAST(? AS VARCHAR))`;
  const countParams = [...filter.params, kind, kind];
  const totalRow = onlyRow(
    await preparedRows(
      connection,
      `SELECT CAST(COUNT(*) AS DOUBLE) AS total_count FROM media WHERE ${whereSql}`,
      countParams,
    ),
    "media list count",
  );
  const sql = `
    SELECT
      CAST(rowid AS DOUBLE) AS row_id,
      platform,
      zip_path,
      kind,
      CASE
        WHEN taken_at IS NULL THEN NULL
        ELSE epoch(taken_at) * 1000.0
      END AS taken_at_ms,
      conversation
    FROM media
    WHERE ${whereSql}
    ORDER BY taken_at DESC NULLS LAST, rowid DESC
    LIMIT ? OFFSET ?
  `;
  const rows = await preparedRows(connection, sql, [
    ...countParams,
    limit,
    offset,
  ]);
  return {
    items: rows.map(mediaItem),
    totalCount: readNumber(totalRow, "total_count"),
    limit,
    offset,
  };
}

export async function wrappedStats(
  connection: AsyncDuckDBConnection,
): Promise<WrappedStatsResult> {
  const overview = onlyRow(
    await queryRows(connection, WRAPPED_OVERVIEW_SQL),
    "Wrapped overview",
  );
  const contactRows = await queryRows(connection, WRAPPED_TOP_CONTACTS_SQL);
  const hourRows = await queryRows(connection, WRAPPED_HOURS_SQL);
  const busiestRows = await queryRows(connection, WRAPPED_BUSIEST_DAY_SQL);
  const wordRows = await preparedRows(
    connection,
    WRAPPED_TOP_WORDS_SQL,
    [...WRAPPED_STOP_WORDS],
  );
  const firstRows = await queryRows(connection, WRAPPED_FIRST_MESSAGE_SQL);
  const streakRows = await queryRows(connection, WRAPPED_LONGEST_STREAK_SQL);
  const mutualRows = await queryRows(connection, WRAPPED_MUTUAL_FOLLOWS_SQL);
  const callRows = await queryRows(connection, WRAPPED_LONGEST_CALL_SQL);
  const cringeRows = await queryRows(connection, WRAPPED_CRINGE_COMMENTS_SQL);
  const interestRows = await queryRows(connection, WRAPPED_INTERESTS_SQL);
  const profileRows = await queryRows(connection, WRAPPED_PROFILE_HISTORY_SQL);
  const firstImageRows = await queryRows(connection, WRAPPED_FIRST_IMAGE_SQL);
  
  let fallbackUsername: string | null = null;
  const ownerRows = await queryRows(connection, "SELECT payload FROM events WHERE kind = 'archive_owner' LIMIT 1");
  if (ownerRows.length > 0) {
    const payloadStr = typeof ownerRows[0][0] === 'string' ? ownerRows[0][0] : String(ownerRows[0][0] ?? "");
    try {
      fallbackUsername = JSON.parse(payloadStr).name;
    } catch {}
  }

  if (!fallbackUsername) {
    const personalInfoRows = await queryRows(connection, "SELECT payload FROM events WHERE kind = 'personal_info'");
    for (const row of personalInfoRows) {
      const payloadStr = typeof row[0] === 'string' ? row[0] : String(row[0] ?? "");
      const match = /"(?:username|user name|Username)"\s*:\s*(?:\{[^}]*"value"\s*:\s*)?"([^"]+)"/i.exec(payloadStr);
      if (match) {
        fallbackUsername = match[1];
        break;
      }
    }
  }

  const messagesByHour = hourRows.map(wrappedHour);
  const peak = messagesByHour.reduce<WrappedHour | null>((current, candidate) => {
    if (!current || candidate.messageCount > current.messageCount) {
      return candidate;
    }
    return current;
  }, null);
  const topContacts = contactRows.map(wrappedContact);
  const topWords = wordRows.map(wrappedWord);
  const nowMs = Date.now();

  return {
    fallbackUsername,
    totalMessages: readNumber(overview, "total_messages"),
    totalMedia: readNumber(overview, "total_media"),
    activeFromMs: readNullableNumber(overview, "active_from_ms"),
    activeToMs: readNullableNumber(overview, "active_to_ms"),
    topContacts,
    messagesByHour,
    peakHour: peak && peak.messageCount > 0 ? peak.hour : null,
    threeAmEraMessages: messagesByHour
      .filter(({ hour }) => hour >= 2 && hour < 4)
      .reduce((sum, { messageCount }) => sum + messageCount, 0),
    busiestDay:
      busiestRows.length === 0 ? null : wrappedBusiestDay(busiestRows[0]),
    topWords,
    firstMessage:
      firstRows.length === 0 ? null : wrappedFirstMessage(firstRows[0]),
    longestStreak:
      streakRows.length === 0 ? null : wrappedStreak(streakRows[0]),
    longestMutualFollows: mutualRows
      .map((row) => wrappedMutualFollow(row, nowMs))
      .sort(
        (left, right) =>
          right.durationSec - left.durationSec ||
          left.username.localeCompare(right.username),
      ),
    longestConversation: topContacts[0] ?? null,
    mostTypedWord: topWords[0] ?? null,
    longestCall: callRows.length === 0 ? null : wrappedLongestCall(callRows[0]),
    cringeComments: cringeRows.map(wrappedCringeComment),
    interestsByYear: groupInterestsByYear(interestRows),
    profileHistory: profileRows
      .map(wrappedProfileChange)
      .filter((row): row is WrappedProfileChange => row !== null),
    firstImageSent:
      firstImageRows.length === 0
        ? null
        : wrappedFirstImage(firstImageRows[0]),
    oldestImages: firstImageRows.map(wrappedFirstImage),
  };
}

export async function exportMetadata(
  connection: AsyncDuckDBConnection,
): Promise<ExportMetadataResult> {
  const rows = await queryRows(connection, EXPORT_METADATA_SQL);
  const tables = rows.map((row) => {
    const tableName = readString(row, "table_name");
    if (!isExportTableName(tableName)) {
      throw new Error("DuckDB returned an invalid export table.");
    }
    return exportTableMetadata(tableName, readNumber(row, "row_count"));
  });
  return { tables, formats: [...EXPORT_FORMATS] };
}

function activityTimelineSql(granularity: ActivityGranularity): string {
  return `
    SELECT
      epoch(date_trunc('${granularity}', occurred_at)) * 1000.0
        AS bucket_start_ms,
      kind,
      CAST(COUNT(*) AS DOUBLE) AS event_count
    FROM events
    WHERE (
      CAST(? AS DOUBLE) IS NULL
      OR occurred_at >= epoch_ms(CAST(? AS BIGINT))
    )
      AND (
        CAST(? AS DOUBLE) IS NULL
      OR occurred_at <= epoch_ms(CAST(? AS BIGINT))
      )
    GROUP BY date_trunc('${granularity}', occurred_at), kind
    ORDER BY date_trunc('${granularity}', occurred_at) ASC, kind ASC
  `;
}

async function queryRows(
  connection: AsyncDuckDBConnection,
  sql: string,
): Promise<SqlRow[]> {
  const result = await connection.query(sql);
  const values: readonly unknown[] = result.toArray();
  return asSqlRows(values);
}

async function preparedRows(
  connection: AsyncDuckDBConnection,
  sql: string,
  params: SqlParameter[],
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

function conversationListItem(row: SqlRow): ConversationListItem {
  return {
    platform: readString(row, "platform"),
    conversation: readString(row, "conversation"),
    messageCount: readNumber(row, "message_count"),
    participantCount: readNumber(row, "participant_count"),
    mediaCount: readNumber(row, "media_count"),
    lastMessageAtMs: readNumber(row, "last_message_at_ms"),
    lastSender: readString(row, "last_sender"),
    preview: readNullableString(row, "preview"),
  };
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

function searchHit(
  row: SqlRow,
  term: string,
  matchTerms: string[] = [],
): SearchHit {
  const text = readString(row, "text");
  return {
    rowId: readNumber(row, "row_id"),
    platform: readString(row, "platform"),
    conversation: readString(row, "conversation"),
    sender: readString(row, "sender"),
    sentAtMs: readNumber(row, "sent_at_ms"),
    text,
    snippet: createSearchSnippet(text, term),
    matchTerms,
  };
}

function mediaItem(row: SqlRow): MediaItem {
  const kind = readString(row, "kind");
  if (!isMediaKind(kind)) {
    throw new Error("DuckDB returned an invalid media kind.");
  }
  return {
    rowId: readNumber(row, "row_id"),
    platform: readString(row, "platform"),
    zipPath: readString(row, "zip_path"),
    kind,
    takenAtMs: readNullableNumber(row, "taken_at_ms"),
    conversation: readNullableString(row, "conversation"),
  };
}

function wrappedContact(row: SqlRow): WrappedContact {
  return {
    conversation: readString(row, "conversation"),
    messageCount: readNumber(row, "message_count"),
  };
}

function wrappedHour(row: SqlRow): WrappedHour {
  return {
    hour: readNumber(row, "hour"),
    messageCount: readNumber(row, "message_count"),
  };
}

function wrappedBusiestDay(row: SqlRow): WrappedBusiestDay {
  return {
    date: readString(row, "active_date"),
    messageCount: readNumber(row, "message_count"),
  };
}

function wrappedWord(row: SqlRow): WrappedWord {
  return {
    word: readString(row, "word"),
    count: readNumber(row, "word_count"),
  };
}

function wrappedFirstMessage(row: SqlRow): WrappedFirstMessage {
  return {
    text: readNullableString(row, "text"),
    sentAtMs: readNumber(row, "sent_at_ms"),
    conversation: readString(row, "conversation"),
    sender: readString(row, "sender"),
  };
}

function wrappedStreak(row: SqlRow): WrappedStreak {
  return {
    days: readNumber(row, "streak_days"),
    startDate: readString(row, "start_date"),
    endDate: readString(row, "end_date"),
  };
}

function wrappedMutualFollow(row: SqlRow, nowMs: number): WrappedMutualFollow {
  const startedAtMs = readNumber(row, "started_at_ms");
  return {
    username: readString(row, "username"),
    startedAtMs,
    durationSec: Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000)),
  };
}

function wrappedLongestCall(row: SqlRow): WrappedLongestCall {
  const media = readString(row, "media");
  if (media !== "voice" && media !== "video") {
    throw new Error("DuckDB returned an invalid call media kind.");
  }
  return {
    media,
    durationSec: readNumber(row, "duration_sec"),
    conversation: readString(row, "conversation"),
    occurredAtMs: readNumber(row, "occurred_at_ms"),
  };
}

function wrappedCringeComment(row: SqlRow): WrappedCringeComment {
  return {
    text: readString(row, "text"),
    occurredAtMs: readNumber(row, "occurred_at_ms"),
  };
}

function groupInterestsByYear(rows: readonly SqlRow[]): WrappedInterestsByYear[] {
  const byYear = new Map<number, string[]>();
  for (const row of rows) {
    const year = readNumber(row, "year");
    const topic = readString(row, "topic");
    const topics = byYear.get(year) ?? [];
    topics.push(topic);
    byYear.set(year, topics);
  }
  return [...byYear.entries()]
    .map(([year, topics]) => ({ year, topics }))
    .sort((left, right) => left.year - right.year);
}

function wrappedProfileChange(row: SqlRow): WrappedProfileChange | null {
  const field = readString(row, "field");
  if (field !== "username" && field !== "bio") {
    return null;
  }
  return {
    field,
    value: readString(row, "value"),
    occurredAtMs: readNumber(row, "occurred_at_ms"),
  };
}

function wrappedFirstImage(row: SqlRow): WrappedFirstImage {
  return {
    zipPath: readString(row, "zip_path"),
    conversation: readString(row, "conversation"),
    takenAtMs: readNullableNumber(row, "taken_at_ms"),
  };
}

function onlyRow(rows: SqlRow[], label: string): SqlRow {
  if (rows.length !== 1) {
    throw new Error(`${label} returned an unexpected number of rows.`);
  }
  return rows[0];
}

function optionalRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  return requiredRecord(value, label);
}

function requiredRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number") {
    throw new Error(`${key} must be a number.`);
  }
  return value;
}

function optionalFiniteNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number") {
    throw new Error(`${key} must be a number or null.`);
  }
  return requireFiniteNumber(value, key);
}

function requiredNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  maximumLength: number,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maximumLength) {
    throw new Error(
      `${key} must contain between 1 and ${maximumLength} characters.`,
    );
  }
  return trimmed;
}

function optionalNullableString(
  record: Record<string, unknown>,
  key: string,
  maximumLength: number,
): string | null {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new Error(`${key} must be a string or null.`);
  }
  return value;
}

function optionalMessageCursor(value: unknown): MessageCursor | null {
  if (value === undefined || value === null) {
    return null;
  }
  const cursor = requiredRecord(value, "before");
  const sentAtMs = cursor.sentAtMs;
  const rowId = cursor.rowId;
  if (typeof sentAtMs !== "number" || typeof rowId !== "number") {
    throw new Error("before must contain numeric sentAtMs and rowId values.");
  }
  requireFiniteNumber(sentAtMs, "before.sentAtMs");
  requireFiniteNumber(rowId, "before.rowId");
  if (!Number.isSafeInteger(rowId) || rowId < 0) {
    throw new Error("before.rowId must be a non-negative safe integer.");
  }
  return { sentAtMs, rowId };
}

function activityGranularity(value: unknown): ActivityGranularity {
  if (value === undefined || value === "day") {
    return "day";
  }
  if (value === "month") {
    return "month";
  }
  throw new Error("granularity must be day or month.");
}

function optionalMediaKind(value: unknown): MediaKind | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isMediaKind(value)) {
    throw new Error("kind must be image, video, audio, other, or null.");
  }
  return value;
}

function isExportTableName(value: string): value is ExportTable {
  return value === "messages" || value === "media" || value === "events";
}
