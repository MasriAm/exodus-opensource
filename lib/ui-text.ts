/**
 * UI copy helpers for counts and script-aware text styling.
 */

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function containsArabic(value: string): boolean {
  return ARABIC_RE.test(value);
}

/** "1 message" / "1,500 messages" with an optional leading formatted number. */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  const formatted =
    typeof Intl !== "undefined"
      ? new Intl.NumberFormat(undefined).format(count)
      : String(count);
  return `${formatted} ${count === 1 ? singular : plural}`;
}

export function normalizeSenderKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function matchesConversationTitle(senderKey: string, conversationKey: string): boolean {
  if (!senderKey || !conversationKey) {
    return false;
  }
  return (
    senderKey === conversationKey ||
    conversationKey.includes(senderKey) ||
    senderKey.includes(conversationKey)
  );
}

/**
 * Infer which sender is "you" for a thread from the full sender roster
 * (not a single page). Conversation title is treated as the other party in 1:1.
 * For groups, prefer archiveSelfHint (sender in the most conversations).
 */
export function resolveSelfSender(
  conversation: string,
  threadSenders: ReadonlyArray<{ sender: string; messageCount: number }>,
  archiveSelfHint?: string | null,
): string | null {
  if (threadSenders.length === 0) {
    return null;
  }
  const conversationKey = normalizeSenderKey(conversation);
  const ranked = [...threadSenders].sort(
    (left, right) =>
      right.messageCount - left.messageCount ||
      left.sender.localeCompare(right.sender),
  );

  const notTitle = ranked.filter(
    (row) => !matchesConversationTitle(normalizeSenderKey(row.sender), conversationKey),
  );

  // 1:1: the participant who is not the conversation title is you.
  if (ranked.length <= 2) {
    return notTitle[0]?.sender ?? null;
  }

  // Groups: prefer the archive-wide "you" hint when they appear in this thread.
  if (archiveSelfHint) {
    const hintKey = normalizeSenderKey(archiveSelfHint);
    const match = ranked.find(
      (row) => normalizeSenderKey(row.sender) === hintKey,
    );
    if (match) {
      return match.sender;
    }
  }

  // Fallback: most active sender who is not the group title.
  return notTitle[0]?.sender ?? ranked[0]?.sender ?? null;
}

/**
 * Decide if a bubble is outgoing ("you").
 * Prefer an explicit selfSender resolved from the full thread roster.
 */
export function isOutgoingSender(
  sender: string,
  conversation: string,
  threadSenders: ReadonlyArray<{ sender: string; messageCount: number }> | readonly string[],
  selfSender?: string | null,
  archiveSelfHint?: string | null,
): boolean {
  const s = normalizeSenderKey(sender);
  if (!s) {
    return false;
  }

  const roster: Array<{ sender: string; messageCount: number }> = Array.isArray(
    threadSenders,
  )
    ? typeof threadSenders[0] === "string"
      ? (threadSenders as readonly string[]).map((entry) => ({
          sender: entry,
          messageCount: 1,
        }))
      : [...(threadSenders as ReadonlyArray<{ sender: string; messageCount: number }>)]
    : [];

  const self =
    selfSender?.trim() ||
    resolveSelfSender(conversation, roster, archiveSelfHint) ||
    null;

  if (self) {
    return s === normalizeSenderKey(self);
  }

  const conversationKey = normalizeSenderKey(conversation);
  if (conversationKey && matchesConversationTitle(s, conversationKey)) {
    return false;
  }

  // Last resort without a roster: treat as outgoing.
  return true;
}
