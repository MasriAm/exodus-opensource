/**
 * Pure follow-graph helpers for Footprint filters.
 */

export type FollowKindRow = {
  kind: "follower" | "following";
  username: string;
  occurredAtMs: number;
};

/** Prefer the Instagram handle; fall back to the path segment of a profile URL. */
export function normalizeFollowUsername(value: string): string {
  let raw = value.trim();
  if (!raw) {
    return "";
  }
  const hrefMatch = raw.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i);
  if (hrefMatch) {
    raw = hrefMatch[1];
  }
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Keep the undecoded handle when it is not URI-encoded.
  }
  return raw.replace(/^@+/, "").trim().toLocaleLowerCase();
}

function usernameKey(value: string): string {
  return normalizeFollowUsername(value);
}

/** Unique usernames for a follow kind (latest event wins for display). */
export function uniqueFollowEvents<T extends FollowKindRow>(
  events: T[],
  kind: "follower" | "following",
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of events) {
    if (row.kind !== kind) {
      continue;
    }
    const key = usernameKey(row.username);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(row);
  }
  return result;
}

/** People you follow who do not appear in the follower list. */
export function followingWithoutFollowBack<T extends FollowKindRow>(
  events: T[],
): T[] {
  const followers = new Set(
    uniqueFollowEvents(events, "follower").map((row) =>
      usernameKey(row.username),
    ),
  );
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of uniqueFollowEvents(events, "following")) {
    const key = usernameKey(row.username);
    if (!key || followers.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(row);
  }
  return result;
}
