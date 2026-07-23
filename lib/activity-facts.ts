/**
 * Pure calendar / ledger fact helpers.
 * Kept free of React so they can be unit-tested against fixture expectations.
 */

export type DayCount = { dayMs: number; messageCount: number };

export type ActivityFacts = {
  busiestDay: DayCount;
  quietestDay: DayCount;
  busiestMonth: { monthIndex: number; messageCount: number };
  quietestMonth: { monthIndex: number; messageCount: number };
  longestStreakDays: number;
  totalMessages: number;
  activeDays: number;
};

const DAY_MS = 86_400_000;

/** Among days that have activity, pick max and min by message count. */
export function computeActivityFacts(days: DayCount[]): ActivityFacts | null {
  const active = days.filter((day) => day.messageCount > 0);
  if (active.length === 0) {
    return null;
  }

  let busiestDay = active[0];
  let quietestDay = active[0];
  for (const day of active) {
    if (
      day.messageCount > busiestDay.messageCount ||
      (day.messageCount === busiestDay.messageCount &&
        day.dayMs < busiestDay.dayMs)
    ) {
      busiestDay = day;
    }
    if (
      day.messageCount < quietestDay.messageCount ||
      (day.messageCount === quietestDay.messageCount &&
        day.dayMs < quietestDay.dayMs)
    ) {
      quietestDay = day;
    }
  }

  const monthTotals = new Map<number, number>();
  for (const day of active) {
    const month = new Date(day.dayMs).getUTCMonth();
    monthTotals.set(month, (monthTotals.get(month) ?? 0) + day.messageCount);
  }

  let busiestMonth = { monthIndex: 0, messageCount: 0 };
  let quietestMonth = {
    monthIndex: 0,
    messageCount: Number.POSITIVE_INFINITY,
  };
  for (const [monthIndex, messageCount] of monthTotals) {
    if (
      messageCount > busiestMonth.messageCount ||
      (messageCount === busiestMonth.messageCount &&
        monthIndex < busiestMonth.monthIndex)
    ) {
      busiestMonth = { monthIndex, messageCount };
    }
    if (
      messageCount < quietestMonth.messageCount ||
      (messageCount === quietestMonth.messageCount &&
        monthIndex < quietestMonth.monthIndex)
    ) {
      quietestMonth = { monthIndex, messageCount };
    }
  }

  const sorted = [...active].map((day) => day.dayMs).sort((a, b) => a - b);
  let longestStreakDays = 1;
  let streak = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] === DAY_MS) {
      streak += 1;
      longestStreakDays = Math.max(longestStreakDays, streak);
    } else {
      streak = 1;
    }
  }

  return {
    busiestDay,
    quietestDay,
    busiestMonth,
    quietestMonth: {
      monthIndex: quietestMonth.monthIndex,
      messageCount: Number.isFinite(quietestMonth.messageCount)
        ? quietestMonth.messageCount
        : 0,
    },
    longestStreakDays,
    totalMessages: active.reduce((sum, day) => sum + day.messageCount, 0),
    activeDays: active.length,
  };
}

/** Assert busiest ≥ quietest for both day and month facts. */
export function assertSuperlativeOrder(facts: ActivityFacts): void {
  if (facts.busiestDay.messageCount < facts.quietestDay.messageCount) {
    throw new Error(
      `busiest day (${facts.busiestDay.messageCount}) is quieter than quietest day (${facts.quietestDay.messageCount})`,
    );
  }
  if (facts.busiestMonth.messageCount < facts.quietestMonth.messageCount) {
    throw new Error(
      `busiest month (${facts.busiestMonth.messageCount}) is quieter than quietest month (${facts.quietestMonth.messageCount})`,
    );
  }
}
