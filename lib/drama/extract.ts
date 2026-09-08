/**
 * Evidence extraction: find the messages that actually carry drama.
 *
 * The hot path is one `String.includes` per phrase per message; the boundary
 * regex only runs on the handful that already matched as a substring, so a
 * 60k-message archive scans in well under a second.
 */

import {
  CATEGORY_BY_ID,
  DRAMA_LEXICON,
  ERA_LOCKED_CATEGORIES,
  ERA_LOCK_FRACTION,
  EVIDENCE_CATEGORIES,
  isArabicPhrase,
  normalizeForMatch,
  type LexiconPhrase,
} from "./lexicon";
import type {
  DramaMessage,
  EvidenceCategoryId,
  EvidenceExhibit,
  EvidenceItem,
} from "./types";

export interface ExtractOptions {
  /** Exhibits keep at most this many items. */
  perCategory?: number;
  /** …and at most this many from any single conversation. */
  maxPerConversation?: number;
  minLength?: number;
  maxLength?: number;
  /** Local-hour extractor; overridden in tests for determinism. */
  hourOf?: (sentAtMs: number) => number;
}

const DEFAULTS = {
  perCategory: 5,
  maxPerConversation: 2,
  minLength: 6,
  maxLength: 420,
} as const;

export function localHour(sentAtMs: number): number {
  return new Date(sentAtMs).getHours();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const boundaryCache = new Map<string, RegExp>();

function boundaryPattern(phrase: string): RegExp {
  const cached = boundaryCache.get(phrase);
  if (cached) {
    return cached;
  }
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`,
    "u",
  );
  boundaryCache.set(phrase, pattern);
  return pattern;
}

function phraseMatches(normalized: string, entry: LexiconPhrase): boolean {
  // Cheap substring gate first — most phrases fail here and never compile.
  if (!normalized.includes(entry.phrase)) {
    return false;
  }
  // Arabic attaches prefixes to words, so a substring hit is the right answer.
  return isArabicPhrase(entry.phrase)
    ? true
    : boundaryPattern(entry.phrase).test(normalized);
}

const CAPS_PATTERN = /\p{Lu}/gu;
const LETTER_PATTERN = /\p{L}/gu;

function shoutiness(text: string): number {
  const letters = text.match(LETTER_PATTERN)?.length ?? 0;
  if (letters < 8) {
    return 0;
  }
  const caps = text.match(CAPS_PATTERN)?.length ?? 0;
  return caps / letters;
}

/**
 * Multipliers that separate a real moment from a phrase that happened to fire.
 * Length sanity dominates: "sorry" is not an exhibit, a four-line apology is.
 */
function intensityMultiplier(
  message: DramaMessage,
  hourOf: (sentAtMs: number) => number,
): number {
  const length = message.text.trim().length;
  let multiplier = 1;

  if (length < 14) {
    multiplier *= 0.65;
  } else if (length >= 25 && length <= 220) {
    multiplier *= 1.15;
  } else if (length > 320) {
    multiplier *= 0.85;
  }

  const hour = hourOf(message.sentAtMs);
  if (hour >= 1 && hour <= 4) {
    multiplier *= 1.25;
  }

  if (shoutiness(message.text) >= 0.6) {
    multiplier *= 1.2;
  }

  if (/[!?]{3,}/u.test(message.text)) {
    multiplier *= 1.15;
  }

  return multiplier;
}

interface Scored {
  item: EvidenceItem;
  /** Collapses near-duplicate texts (the same "sorry" sent to four people). */
  dedupeKey: string;
}

/**
 * Score every message against every category and return exhibits ordered by
 * the category list, each capped and spread across conversations.
 */
export function extractEvidence(
  messages: readonly DramaMessage[],
  options: ExtractOptions = {},
): EvidenceExhibit[] {
  const perCategory = options.perCategory ?? DEFAULTS.perCategory;
  const maxPerConversation =
    options.maxPerConversation ?? DEFAULTS.maxPerConversation;
  const minLength = options.minLength ?? DEFAULTS.minLength;
  const maxLength = options.maxLength ?? DEFAULTS.maxLength;
  const hourOf = options.hourOf ?? localHour;

  const scoredByCategory = new Map<EvidenceCategoryId, Scored[]>();
  const totals = new Map<EvidenceCategoryId, number>();
  for (const category of EVIDENCE_CATEGORIES) {
    scoredByCategory.set(category.id, []);
    totals.set(category.id, 0);
  }

  const eraCutoff = earlyEraCutoff(messages);

  for (const message of messages) {
    const trimmed = message.text.trim();
    if (trimmed.length < minLength || trimmed.length > maxLength) {
      continue;
    }

    const normalized = normalizeForMatch(trimmed);
    if (normalized.length === 0) {
      continue;
    }
    const multiplier = intensityMultiplier(message, hourOf);

    for (const category of EVIDENCE_CATEGORIES) {
      if (
        ERA_LOCKED_CATEGORIES.has(category.id) &&
        eraCutoff !== null &&
        message.sentAtMs > eraCutoff
      ) {
        continue;
      }

      let weight = 0;
      const triggers: string[] = [];
      for (const entry of DRAMA_LEXICON[category.id]) {
        if (phraseMatches(normalized, entry)) {
          weight += entry.weight;
          triggers.push(entry.phrase);
        }
      }

      if (weight === 0) {
        continue;
      }

      totals.set(category.id, (totals.get(category.id) ?? 0) + 1);
      scoredByCategory.get(category.id)?.push({
        dedupeKey: normalized,
        item: {
          messageId: message.id,
          category: category.id,
          conversation: message.conversation,
          sender: message.sender,
          sentAtMs: message.sentAtMs,
          text: trimmed,
          isSelf: message.isSelf,
          score: Math.round(weight * multiplier * 100) / 100,
          triggers,
        },
      });
    }
  }

  const exhibits: EvidenceExhibit[] = [];
  for (const category of EVIDENCE_CATEGORIES) {
    const scored = scoredByCategory.get(category.id) ?? [];
    if (scored.length === 0) {
      continue;
    }
    exhibits.push({
      category,
      totalMatches: totals.get(category.id) ?? 0,
      items: selectSpread(scored, perCategory, maxPerConversation),
    });
  }

  return exhibits;
}

/** Timestamp before which a message counts as "the old days". */
function earlyEraCutoff(messages: readonly DramaMessage[]): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const message of messages) {
    if (message.sentAtMs < earliest) {
      earliest = message.sentAtMs;
    }
    if (message.sentAtMs > latest) {
      latest = message.sentAtMs;
    }
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || latest <= earliest) {
    return null;
  }
  return earliest + (latest - earliest) * ERA_LOCK_FRACTION;
}

/**
 * Take the strongest items, but refuse to let one loud conversation own an
 * exhibit — the report is more interesting when six people show up in it.
 * Slots left over after the spread pass are filled by raw score.
 */
function selectSpread(
  scored: Scored[],
  limit: number,
  maxPerConversation: number,
): EvidenceItem[] {
  const ranked = [...scored].sort(
    (left, right) =>
      right.item.score - left.item.score ||
      right.item.sentAtMs - left.item.sentAtMs,
  );

  const seenText = new Set<string>();
  const perConversation = new Map<string, number>();
  const picked: EvidenceItem[] = [];
  const overflow: EvidenceItem[] = [];

  for (const entry of ranked) {
    if (seenText.has(entry.dedupeKey)) {
      continue;
    }
    seenText.add(entry.dedupeKey);

    const used = perConversation.get(entry.item.conversation) ?? 0;
    if (used >= maxPerConversation) {
      overflow.push(entry.item);
      continue;
    }
    perConversation.set(entry.item.conversation, used + 1);
    picked.push(entry.item);
    if (picked.length === limit) {
      return picked;
    }
  }

  for (const item of overflow) {
    if (picked.length === limit) {
      break;
    }
    picked.push(item);
  }

  return picked.sort(
    (left, right) => right.score - left.score || right.sentAtMs - left.sentAtMs,
  );
}

export { CATEGORY_BY_ID, EVIDENCE_CATEGORIES };
