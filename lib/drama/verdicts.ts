/**
 * Behavioural metrics and the archetype verdict.
 *
 * Everything is derived from message timing and authorship alone — no content
 * analysis, no model, no network. The point is that each number is defensible:
 * "double text" means a run of your messages nobody answered, not a vibe.
 */

import { tokenize } from "@/lib/text";

import { extractEvidence, localHour, type ExtractOptions } from "./extract";
import type {
  Comeback,
  DramaMessage,
  DramaReport,
  DramaStat,
  SlowFade,
  Situationship,
  Verdict,
} from "./types";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** A run of ≥2 of your messages spanning this long counts as a double text. */
const DOUBLE_TEXT_SPAN_MS = 5 * MINUTE_MS;
/** Answering later than this is "left on read", not "was busy". */
const LEFT_ON_READ_MS = 12 * HOUR_MS;
/** Replies slower than this are a new conversation, not a reply. */
const REPLY_WINDOW_MS = 24 * HOUR_MS;
const MIN_CONVERSATION_MESSAGES = 20;
const RAW_WORD_PATTERN = /[\p{L}\p{N}']+/gu;
const MIN_FADE_DAYS = 21;
const MIN_COMEBACK_DAYS = 21;

export interface MetricsOptions {
  hourOf?: (sentAtMs: number) => number;
  dayOf?: (sentAtMs: number) => number;
  /**
   * Reference point for silence maths. Defaults to the archive's own last
   * message so results are stable; callers with a live archive pass Date.now()
   * so "silent for two years" stays true as time passes.
   */
  nowMs?: number;
}

export interface ConversationStats {
  conversation: string;
  messageCount: number;
  selfCount: number;
  firstAtMs: number;
  lastAtMs: number;
  activeDays: number;
  spanDays: number;
  lastMessage: DramaMessage;
  firstMessage: DramaMessage;
  lastWordWasYours: boolean;
  longestGapMs: number;
  revival: { gapMs: number; message: DramaMessage } | null;
}

export interface DramaMetrics {
  totalMessages: number;
  selfMessages: number;
  otherMessages: number;
  conversationCount: number;
  activeFromMs: number | null;
  activeToMs: number | null;
  nowMs: number;
  platforms: string[];
  /** 24 buckets of your own messages. */
  hourHistogram: number[];
  lateNightMessages: number;
  lateNightShare: number;
  lateNightAccomplice: { conversation: string; messageCount: number } | null;
  doubleTextRuns: number;
  spiralRuns: number;
  youLeftOnRead: number;
  theyLeftYouOnRead: number;
  medianReplyMsYou: number | null;
  medianReplyMsThem: number | null;
  avgLengthYou: number;
  avgLengthThem: number;
  wordsTyped: number;
  topConversationShare: number;
  fadedConversationShare: number;
  conversations: ConversationStats[];
  signatureWords: Array<{ word: string; count: number }>;
}

function localDay(sentAtMs: number): number {
  const date = new Date(sentAtMs);
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function computeMetrics(
  messages: readonly DramaMessage[],
  options: MetricsOptions = {},
): DramaMetrics {
  const hourOf = options.hourOf ?? localHour;
  const dayOf = options.dayOf ?? localDay;

  const empty: DramaMetrics = {
    totalMessages: 0,
    selfMessages: 0,
    otherMessages: 0,
    conversationCount: 0,
    activeFromMs: null,
    activeToMs: null,
    nowMs: options.nowMs ?? 0,
    platforms: [],
    hourHistogram: new Array<number>(24).fill(0),
    lateNightMessages: 0,
    lateNightShare: 0,
    lateNightAccomplice: null,
    doubleTextRuns: 0,
    spiralRuns: 0,
    youLeftOnRead: 0,
    theyLeftYouOnRead: 0,
    medianReplyMsYou: null,
    medianReplyMsThem: null,
    avgLengthYou: 0,
    avgLengthThem: 0,
    wordsTyped: 0,
    topConversationShare: 0,
    fadedConversationShare: 0,
    conversations: [],
    signatureWords: [],
  };

  if (messages.length === 0) {
    return empty;
  }

  const byConversation = new Map<string, DramaMessage[]>();
  const platforms = new Set<string>();
  let activeFromMs = Number.POSITIVE_INFINITY;
  let activeToMs = Number.NEGATIVE_INFINITY;

  for (const message of messages) {
    platforms.add(message.platform);
    activeFromMs = Math.min(activeFromMs, message.sentAtMs);
    activeToMs = Math.max(activeToMs, message.sentAtMs);
    const bucket = byConversation.get(message.conversation);
    if (bucket) {
      bucket.push(message);
    } else {
      byConversation.set(message.conversation, [message]);
    }
  }

  const nowMs = options.nowMs ?? activeToMs;

  const hourHistogram = new Array<number>(24).fill(0);
  const lateNightByConversation = new Map<string, number>();
  const replyYou: number[] = [];
  const replyThem: number[] = [];
  const wordCounts = new Map<string, number>();

  let selfMessages = 0;
  let otherMessages = 0;
  let lengthYou = 0;
  let lengthThem = 0;
  let lateNightMessages = 0;
  let doubleTextRuns = 0;
  let spiralRuns = 0;
  let youLeftOnRead = 0;
  let theyLeftYouOnRead = 0;
  let wordsTyped = 0;

  const conversations: ConversationStats[] = [];

  for (const [conversation, bucket] of byConversation) {
    const ordered = [...bucket].sort(
      (left, right) => left.sentAtMs - right.sentAtMs || left.id - right.id,
    );

    const activeDayKeys = new Set<number>();
    let selfCount = 0;
    let longestGapMs = 0;
    let revival: ConversationStats["revival"] = null;

    // A run is a block of consecutive messages from the same side.
    let runIsSelf = ordered[0].isSelf;
    let runStartMs = ordered[0].sentAtMs;
    let runEndMs = ordered[0].sentAtMs;
    let runLength = 0;

    const closeRun = (nextMessage: DramaMessage | null) => {
      if (runLength === 0) {
        return;
      }
      if (runIsSelf) {
        if (runLength >= 2 && runEndMs - runStartMs >= DOUBLE_TEXT_SPAN_MS) {
          doubleTextRuns += 1;
        }
        if (runLength >= 4) {
          spiralRuns += 1;
        }
        const waited = nextMessage
          ? nextMessage.sentAtMs - runEndMs
          : nowMs - runEndMs;
        if (nextMessage && waited <= REPLY_WINDOW_MS) {
          replyThem.push(waited);
        }
        if (waited >= LEFT_ON_READ_MS) {
          theyLeftYouOnRead += 1;
        }
      } else {
        const waited = nextMessage
          ? nextMessage.sentAtMs - runEndMs
          : nowMs - runEndMs;
        if (nextMessage && waited <= REPLY_WINDOW_MS) {
          replyYou.push(waited);
        }
        if (waited >= LEFT_ON_READ_MS) {
          youLeftOnRead += 1;
        }
      }
    };

    for (let index = 0; index < ordered.length; index += 1) {
      const message = ordered[index];
      activeDayKeys.add(dayOf(message.sentAtMs));

      if (index > 0) {
        const gap = message.sentAtMs - ordered[index - 1].sentAtMs;
        if (gap > longestGapMs) {
          longestGapMs = gap;
          revival = { gapMs: gap, message };
        }
      }

      if (message.isSelf) {
        selfCount += 1;
        selfMessages += 1;
        lengthYou += message.text.trim().length;
        const hour = hourOf(message.sentAtMs);
        hourHistogram[hour] += 1;
        if (hour >= 1 && hour <= 4) {
          lateNightMessages += 1;
          lateNightByConversation.set(
            conversation,
            (lateNightByConversation.get(conversation) ?? 0) + 1,
          );
        }
        wordsTyped += message.text.match(RAW_WORD_PATTERN)?.length ?? 0;
        // Signature words drop stopwords; the headline count above does not.
        for (const token of tokenize(message.text)) {
          wordCounts.set(token, (wordCounts.get(token) ?? 0) + 1);
        }
      } else {
        otherMessages += 1;
        lengthThem += message.text.trim().length;
      }

      if (message.isSelf === runIsSelf) {
        runLength += 1;
        runEndMs = message.sentAtMs;
      } else {
        closeRun(message);
        runIsSelf = message.isSelf;
        runStartMs = message.sentAtMs;
        runEndMs = message.sentAtMs;
        runLength = 1;
      }
    }
    closeRun(null);

    const firstMessage = ordered[0];
    const lastMessage = ordered[ordered.length - 1];
    const spanDays = Math.max(
      0,
      Math.round((lastMessage.sentAtMs - firstMessage.sentAtMs) / DAY_MS),
    );

    conversations.push({
      conversation,
      messageCount: ordered.length,
      selfCount,
      firstAtMs: firstMessage.sentAtMs,
      lastAtMs: lastMessage.sentAtMs,
      activeDays: activeDayKeys.size,
      spanDays,
      firstMessage,
      lastMessage,
      lastWordWasYours: lastMessage.isSelf,
      longestGapMs,
      revival,
    });
  }

  conversations.sort((left, right) => right.messageCount - left.messageCount);

  const lateNightAccomplice = [...lateNightByConversation.entries()]
    .map(([conversation, messageCount]) => ({ conversation, messageCount }))
    .sort(
      (left, right) =>
        right.messageCount - left.messageCount ||
        left.conversation.localeCompare(right.conversation),
    )[0];

  const fadedCount = conversations.filter(
    (entry) =>
      entry.messageCount >= MIN_CONVERSATION_MESSAGES &&
      (nowMs - entry.lastAtMs) / DAY_MS >= 180,
  ).length;
  const eligibleForFade = conversations.filter(
    (entry) => entry.messageCount >= MIN_CONVERSATION_MESSAGES,
  ).length;

  const signatureWords = [...wordCounts.entries()]
    .filter(([word, count]) => count >= 3 && Array.from(word).length >= 3)
    .map(([word, count]) => ({ word, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.word.localeCompare(right.word),
    )
    .slice(0, 8);

  return {
    totalMessages: messages.length,
    selfMessages,
    otherMessages,
    conversationCount: conversations.length,
    activeFromMs: Number.isFinite(activeFromMs) ? activeFromMs : null,
    activeToMs: Number.isFinite(activeToMs) ? activeToMs : null,
    nowMs,
    platforms: [...platforms].sort((left, right) => left.localeCompare(right)),
    hourHistogram,
    lateNightMessages,
    lateNightShare: selfMessages === 0 ? 0 : lateNightMessages / selfMessages,
    lateNightAccomplice: lateNightAccomplice ?? null,
    doubleTextRuns,
    spiralRuns,
    youLeftOnRead,
    theyLeftYouOnRead,
    medianReplyMsYou: median(replyYou),
    medianReplyMsThem: median(replyThem),
    avgLengthYou: selfMessages === 0 ? 0 : lengthYou / selfMessages,
    avgLengthThem: otherMessages === 0 ? 0 : lengthThem / otherMessages,
    wordsTyped,
    topConversationShare:
      conversations.length === 0
        ? 0
        : conversations[0].messageCount / messages.length,
    fadedConversationShare:
      eligibleForFade === 0 ? 0 : fadedCount / eligibleForFade,
    conversations,
    signatureWords,
  };
}

const VERDICT_COPY: Record<
  Verdict["id"],
  { title: string; line: (metrics: DramaMetrics) => string }
> = {
  "night-shift": {
    title: "The Night Shift",
    line: () =>
      "Your best material only exists because you were awake when you shouldn't have been.",
  },
  "double-texter": {
    title: "The Double Text Menace",
    line: () =>
      "Silence is not an answer, and you have never once accepted it as one.",
  },
  "dry-texter": {
    title: "The Dry Texter",
    line: () =>
      "You have conducted entire relationships in under six words a message.",
  },
  novelist: {
    title: "The Novelist",
    line: () =>
      "Nobody asked for the paragraph. You sent the paragraph. You sent two.",
  },
  ghost: {
    title: "The Soft Ghost",
    line: () =>
      "You do reply. Eventually. Once the conversation has been dead for a day.",
  },
  "always-online": {
    title: "Always Online",
    line: () =>
      "Read, typed, sent — before they'd put the phone down. You are terrifying.",
  },
  "slow-fader": {
    title: "The Slow Fader",
    line: () =>
      "You don't end things. You just get slower until the chat ends itself.",
  },
  "one-chat-wonder": {
    title: "The One Chat Wonder",
    line: (metrics) =>
      `${Math.round(metrics.topConversationShare * 100)}% of everything you typed went to one person. Hope that worked out.`,
  },
  peacekeeper: {
    title: "The Peacekeeper",
    line: () =>
      "You apologise first, even when the receipts say you didn't have to.",
  },
};

function formatDuration(ms: number): string {
  if (ms < MINUTE_MS) {
    return `${Math.max(1, Math.round(ms / 1000))}s`;
  }
  if (ms < HOUR_MS) {
    return `${Math.round(ms / MINUTE_MS)} min`;
  }
  if (ms < DAY_MS) {
    const hours = ms / HOUR_MS;
    return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hrs`;
  }
  return `${Math.round(ms / DAY_MS)} days`;
}

export function computeVerdicts(metrics: DramaMetrics): Verdict[] {
  if (metrics.selfMessages === 0) {
    return [];
  }

  const doubleTextRate =
    (metrics.doubleTextRuns / Math.max(1, metrics.selfMessages)) * 100;
  const ignoreRate = metrics.youLeftOnRead / Math.max(1, metrics.otherMessages);

  // `confidence` is a raw ratio here — 1.0 means "hit the threshold exactly",
  // above 1.0 means "comfortably past it". It is clamped on the way out.
  const candidates: Array<Omit<Verdict, "title" | "line">> = [
    {
      id: "night-shift",
      confidence: Math.max(0, metrics.lateNightShare / 0.22),
      evidence: `${Math.round(metrics.lateNightShare * 100)}% of your messages sent 1–5am`,
    },
    {
      id: "double-texter",
      confidence: Math.max(0, doubleTextRate / 7),
      evidence: `${metrics.doubleTextRuns.toLocaleString()} unanswered runs of your own messages`,
    },
    {
      id: "dry-texter",
      confidence: Math.max(0, (26 - metrics.avgLengthYou) / 16),
      evidence: `${Math.round(metrics.avgLengthYou)} characters per message, on average`,
    },
    {
      id: "novelist",
      confidence: Math.max(0, (metrics.avgLengthYou - 85) / 110),
      evidence: `${Math.round(metrics.avgLengthYou)} characters per message, on average`,
    },
    {
      id: "ghost",
      confidence: Math.max(0, ignoreRate / 0.16),
      evidence: `${metrics.youLeftOnRead.toLocaleString()} messages you sat on for half a day`,
    },
    {
      id: "always-online",
      confidence:
        metrics.medianReplyMsYou === null
          ? 0
          : Math.max(
              0,
              (6 * MINUTE_MS - metrics.medianReplyMsYou) / (5 * MINUTE_MS),
            ),
      evidence:
        metrics.medianReplyMsYou === null
          ? "no measurable reply time"
          : `${formatDuration(metrics.medianReplyMsYou)} typical reply time`,
    },
    {
      id: "slow-fader",
      confidence: Math.max(0, metrics.fadedConversationShare / 0.45),
      evidence: `${Math.round(metrics.fadedConversationShare * 100)}% of your real chats have gone quiet`,
    },
    {
      id: "one-chat-wonder",
      confidence: Math.max(0, (metrics.topConversationShare - 0.35) / 0.4),
      evidence: `${Math.round(metrics.topConversationShare * 100)}% of your messages went to one chat`,
    },
    {
      id: "peacekeeper",
      confidence: Math.max(
        0,
        metrics.theyLeftYouOnRead /
          Math.max(1, metrics.youLeftOnRead + metrics.theyLeftYouOnRead) -
          0.5,
      ),
      evidence: `${metrics.theyLeftYouOnRead.toLocaleString()} times you were the one waiting`,
    },
  ];

  // Rank on the raw score so archetypes that all blow past their threshold
  // still order sensibly, then clamp for display.
  return candidates
    .sort(
      (left, right) =>
        right.confidence - left.confidence || left.id.localeCompare(right.id),
    )
    .slice(0, 3)
    .map((candidate) => ({
      ...candidate,
      confidence: clamp01(candidate.confidence),
      title: VERDICT_COPY[candidate.id].title,
      line: VERDICT_COPY[candidate.id].line(metrics),
    }));
}

export function findSituationship(metrics: DramaMetrics): Situationship | null {
  const eligible = metrics.conversations.filter(
    (entry) =>
      entry.messageCount >= MIN_CONVERSATION_MESSAGES && entry.spanDays >= 3,
  );
  if (eligible.length === 0) {
    return null;
  }

  // Burn rate rewards volume packed into a short window: the whole point of a
  // situationship is that it was intense and it did not last.
  const best = eligible
    .map((entry) => ({
      entry,
      burn: entry.messageCount / Math.max(1, entry.spanDays),
    }))
    .sort(
      (left, right) =>
        right.burn - left.burn ||
        right.entry.messageCount - left.entry.messageCount,
    )[0];

  return {
    conversation: best.entry.conversation,
    messageCount: best.entry.messageCount,
    spanDays: best.entry.spanDays,
    intensity:
      Math.round(
        (best.entry.messageCount / Math.max(1, best.entry.activeDays)) * 10,
      ) / 10,
    firstMessage: best.entry.firstMessage,
    lastMessage: best.entry.lastMessage,
  };
}

/**
 * The chat that went quiet and stayed quiet.
 *
 * `exclude` keeps the report from telling the same story twice — a chat that
 * already appeared as the situationship should not also be the slow fade.
 */
export function findSlowFade(
  metrics: DramaMetrics,
  exclude?: string | null,
): SlowFade | null {
  const faded = metrics.conversations
    .filter(
      (entry) =>
        entry.messageCount >= MIN_CONVERSATION_MESSAGES &&
        entry.conversation !== exclude,
    )
    .map((entry) => ({
      entry,
      silentDays: Math.floor((metrics.nowMs - entry.lastAtMs) / DAY_MS),
    }))
    .filter((entry) => entry.silentDays >= MIN_FADE_DAYS)
    .sort(
      (left, right) =>
        right.silentDays - left.silentDays ||
        right.entry.messageCount - left.entry.messageCount,
    )[0];

  if (!faded) {
    return null;
  }

  return {
    conversation: faded.entry.conversation,
    messageCount: faded.entry.messageCount,
    silentDays: faded.silentDays,
    lastMessage: faded.entry.lastMessage,
    lastWordWasYours: faded.entry.lastWordWasYours,
  };
}

export function findComeback(metrics: DramaMetrics): Comeback | null {
  const best = metrics.conversations
    .filter((entry) => entry.revival !== null)
    .map((entry) => ({
      conversation: entry.conversation,
      revival: entry.revival!,
      silentDays: Math.floor(entry.revival!.gapMs / DAY_MS),
    }))
    .filter((entry) => entry.silentDays >= MIN_COMEBACK_DAYS)
    .sort(
      (left, right) =>
        right.silentDays - left.silentDays ||
        left.conversation.localeCompare(right.conversation),
    )[0];

  if (!best) {
    return null;
  }

  return {
    conversation: best.conversation,
    silentDays: best.silentDays,
    revivedAtMs: best.revival.message.sentAtMs,
    message: best.revival.message,
    revivedByYou: best.revival.message.isSelf,
  };
}

function buildStats(metrics: DramaMetrics, comeback: Comeback | null): DramaStat[] {
  const stats: DramaStat[] = [
    {
      id: "late-night",
      label: "The 3AM index",
      value: `${Math.round(metrics.lateNightShare * 100)}%`,
      caption: "of your messages were sent between 1am and 5am.",
    },
    {
      id: "double-text",
      label: "Double texts",
      value: metrics.doubleTextRuns.toLocaleString(),
      caption: "times you kept typing while nobody was replying.",
    },
    {
      id: "left-on-read",
      label: "Left on read",
      value: metrics.youLeftOnRead.toLocaleString(),
      caption: "messages you took more than half a day to answer.",
    },
    {
      id: "reply-time",
      label: "Your reply time",
      value:
        metrics.medianReplyMsYou === null
          ? "—"
          : formatDuration(metrics.medianReplyMsYou),
      caption:
        metrics.medianReplyMsThem === null
          ? "typical wait before you answer."
          : `typical wait before you answer. They take ${formatDuration(metrics.medianReplyMsThem)}.`,
    },
    {
      id: "words",
      label: "Words typed",
      value: metrics.wordsTyped.toLocaleString(),
      caption: "in the conversations we could read.",
    },
  ];

  if (comeback) {
    stats.push({
      id: "comeback",
      label: "Longest silence broken",
      value: `${comeback.silentDays.toLocaleString()} days`,
      caption: comeback.revivedByYou
        ? "and then you were the one who caved."
        : "and then they came back like nothing happened.",
    });
  }

  return stats;
}

export interface BuildReportOptions extends MetricsOptions {
  isDemo?: boolean;
  ownerLabel?: string;
  extract?: ExtractOptions;
  /**
   * The archive's true message count, when the corpus handed in was capped.
   * Keeps the cover honest: "read 60,000 of your 214,880 messages".
   */
  totalMessages?: number;
}

/** One call from raw messages to everything the report page renders. */
export function buildReport(
  messages: readonly DramaMessage[],
  options: BuildReportOptions = {},
): DramaReport {
  const metrics = computeMetrics(messages, options);
  const comeback = findComeback(metrics);
  const situationship = findSituationship(metrics);

  return {
    isDemo: options.isDemo ?? false,
    ownerLabel: options.ownerLabel ?? "you",
    platforms: metrics.platforms,
    totalMessages: options.totalMessages ?? metrics.totalMessages,
    analyzedMessages: metrics.totalMessages,
    conversationCount: metrics.conversationCount,
    activeFromMs: metrics.activeFromMs,
    activeToMs: metrics.activeToMs,
    exhibits: extractEvidence(messages, {
      hourOf: options.hourOf,
      ...options.extract,
    }),
    verdicts: computeVerdicts(metrics),
    stats: buildStats(metrics, comeback),
    situationship,
    slowFade: findSlowFade(metrics, situationship?.conversation ?? null),
    comeback,
    signatureWords: metrics.signatureWords,
    lateNightShare: metrics.lateNightShare,
    lateNightAccomplice: metrics.lateNightAccomplice,
  };
}

export { formatDuration };
