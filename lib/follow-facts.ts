/**
 * Pure follow-graph helpers for Footprint filters.
 */

export type FollowKindRow = {
  kind: "follower" | "following";
  username: string;
  occurredAtMs: number;
};

/** People you follow who do not appear in the follower list. */
export function followingWithoutFollowBack<T extends FollowKindRow>(
  events: T[],
): T[] {
  const followers = new Set(
    events
      .filter((row) => row.kind === "follower")
      .map((row) => row.username.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of events) {
    if (row.kind !== "following") {
      continue;
    }
    const key = row.username.trim().toLocaleLowerCase();
    if (!key || followers.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(row);
  }
  return result;
}
