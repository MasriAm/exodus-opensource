/**
 * Shared shapes for the Receipts insight engine.
 *
 * Everything here is plain data so the engine can run identically over the
 * fictional template corpus (no worker) and over DuckDB rows from a real
 * export. Nothing in this folder touches React, DuckDB or the network.
 */

/** One message, flattened to the only fields the engine reasons about. */
export interface DramaMessage {
  /** Stable id — DuckDB rowid, or an index for the template corpus. */
  id: number;
  platform: string;
  conversation: string;
  sender: string;
  sentAtMs: number;
  text: string;
  /** True when the archive owner wrote it. */
  isSelf: boolean;
}

export type EvidenceCategoryId =
  | "argument"
  | "exit"
  | "confession"
  | "secret"
  | "apology"
  | "latenight"
  | "ghost"
  | "tea"
  | "ick";

export interface EvidenceCategory {
  id: EvidenceCategoryId;
  /** Screaming tabloid label — used as the exhibit heading. */
  label: string;
  /** One line of context under the heading. */
  blurb: string;
  emoji: string;
  /** Design token suffix, e.g. `--rc-hot` → "hot". */
  tone: "hot" | "acid" | "violet" | "ice" | "amber";
}

export interface EvidenceItem {
  messageId: number;
  category: EvidenceCategoryId;
  conversation: string;
  sender: string;
  sentAtMs: number;
  text: string;
  isSelf: boolean;
  /** Higher is spicier. Used for ordering and for the exhibit "heat" meter. */
  score: number;
  /** Lowercased lexicon phrases that fired, for the "why this one" caption. */
  triggers: string[];
}

export interface EvidenceExhibit {
  category: EvidenceCategory;
  items: EvidenceItem[];
  /** Total matches found, which can exceed `items.length` after capping. */
  totalMatches: number;
}

export type VerdictId =
  | "night-shift"
  | "double-texter"
  | "dry-texter"
  | "novelist"
  | "ghost"
  | "always-online"
  | "slow-fader"
  | "one-chat-wonder"
  | "peacekeeper";

export interface Verdict {
  id: VerdictId;
  /** The archetype name shown huge on the verdict card. */
  title: string;
  /** Second-person sentence delivering the diagnosis. */
  line: string;
  /** The number that earned it, already formatted. */
  evidence: string;
  /** 0–1, how strongly this archetype fits. */
  confidence: number;
}

export interface DramaStat {
  id: string;
  label: string;
  /** Pre-formatted headline value. */
  value: string;
  /** Short second-person explanation. */
  caption: string;
}

/** A chat that burned bright and died fast. */
export interface Situationship {
  conversation: string;
  messageCount: number;
  /** Days between first and last message. */
  spanDays: number;
  /** Messages per active day while it lasted. */
  intensity: number;
  firstMessage: DramaMessage | null;
  lastMessage: DramaMessage | null;
}

/** A chat that went quiet and never came back. */
export interface SlowFade {
  conversation: string;
  messageCount: number;
  /** Days since the last message, relative to the archive's own "now". */
  silentDays: number;
  lastMessage: DramaMessage | null;
  /** Who got the last word. */
  lastWordWasYours: boolean;
}

/** A long silence that someone eventually broke. */
export interface Comeback {
  conversation: string;
  silentDays: number;
  revivedAtMs: number;
  /** The message that broke the silence. */
  message: DramaMessage;
  revivedByYou: boolean;
}

export interface DramaReport {
  /** True when this came from the fictional demo corpus. */
  isDemo: boolean;
  ownerLabel: string;
  platforms: string[];
  totalMessages: number;
  /** Messages the engine could actually read (non-empty text). */
  analyzedMessages: number;
  conversationCount: number;
  activeFromMs: number | null;
  activeToMs: number | null;
  exhibits: EvidenceExhibit[];
  /** Ordered best-fit first; the first entry is "the verdict". */
  verdicts: Verdict[];
  stats: DramaStat[];
  situationship: Situationship | null;
  slowFade: SlowFade | null;
  comeback: Comeback | null;
  /** Words you overuse, minus stopwords. */
  signatureWords: Array<{ word: string; count: number }>;
  /** Share of messages sent between 1am and 5am. */
  lateNightShare: number;
  /** Who you talk to when you should be asleep. */
  lateNightAccomplice: { conversation: string; messageCount: number } | null;
}
