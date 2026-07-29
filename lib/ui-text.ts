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

/**
 * Rough "you vs them" for bubble alignment.
 * 1:1 threads: the conversation title is usually the other person.
 * Groups: the most frequent sender on the page is treated as you.
 */
export function isOutgoingSender(
  sender: string,
  conversation: string,
  pageSenders: readonly string[],
  platformOwner?: string | null,
): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  const s = normalize(sender);
  const c = normalize(conversation);

  // If we have a globally determined platform owner, trust it definitively.
  if (platformOwner) {
    return s === normalize(platformOwner);
  }

  // Thread title often matches the other person (slug or display name).
  // In WhatsApp, unnamed groups are named after the OTHER participants.
  // So if the sender's name is in the thread title, they are almost certainly NOT you.
  if (c && (s === c || c.includes(s) || s.includes(c))) {
    return false;
  }

  // --- Fallback heuristics if platformOwner is unavailable ---
  const uniqueSenders = [...new Set(pageSenders.filter(Boolean))];
  const unique = [...new Set(uniqueSenders.map(normalize).filter(Boolean))];

  if (unique.length <= 2) {
    // Prefer Latin-script participant as "you" in bilingual chats.
    const latinSelf = uniqueSenders.find(
      (entry) => !containsArabic(entry) && /[A-Za-z]/.test(entry),
    );
    if (latinSelf) {
      return normalize(latinSelf) === s;
    }
    return true;
  }

  const counts = new Map<string, number>();
  for (const entry of pageSenders) {
    const key = normalize(entry);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let top: string | null = null;
  let topCount = -1;
  for (const [key, count] of counts) {
    if (count > topCount) {
      top = key;
      topCount = count;
    }
  }
  return top !== null && s === top;
}
