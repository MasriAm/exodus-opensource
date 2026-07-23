/**
 * Pure streak / silence helpers for person and calendar facts.
 * Kept free of React/DuckDB so unit tests can lock superlative order.
 */

const DAY_MS = 86_400_000;

export type StreakSilenceFacts = {
  longestStreakDays: number;
  longestSilenceDays: number;
};

/**
 * Given sorted unique active-day timestamps (UTC day starts), compute
 * longest consecutive-day streak and longest gap between active days.
 * Silence is the empty days between two active days (gapDays - 1).
 */
export function computeStreakSilence(dayMsSorted: number[]): StreakSilenceFacts {
  if (dayMsSorted.length === 0) {
    return { longestStreakDays: 0, longestSilenceDays: 0 };
  }

  let longestStreakDays = 1;
  let longestSilenceDays = 0;
  let streak = 1;

  for (let i = 1; i < dayMsSorted.length; i += 1) {
    const gapDays = Math.round((dayMsSorted[i] - dayMsSorted[i - 1]) / DAY_MS);
    if (gapDays === 1) {
      streak += 1;
      longestStreakDays = Math.max(longestStreakDays, streak);
    } else if (gapDays > 1) {
      streak = 1;
      longestSilenceDays = Math.max(longestSilenceDays, gapDays - 1);
    }
  }

  return { longestStreakDays, longestSilenceDays };
}

/** Assert streak and silence are non-negative and independently sensible. */
export function assertStreakSilenceOrder(facts: StreakSilenceFacts): void {
  if (facts.longestStreakDays < 0 || facts.longestSilenceDays < 0) {
    throw new Error("streak/silence cannot be negative");
  }
}
