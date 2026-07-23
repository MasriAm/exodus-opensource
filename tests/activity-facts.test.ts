import { describe, expect, it } from "vitest";

import {
  assertSuperlativeOrder,
  computeActivityFacts,
} from "@/lib/activity-facts";

describe("computeActivityFacts", () => {
  it("keeps busiest day ≥ quietest day (same unit)", () => {
    const facts = computeActivityFacts([
      { dayMs: Date.UTC(2023, 0, 1), messageCount: 3 },
      { dayMs: Date.UTC(2023, 0, 2), messageCount: 1 },
      { dayMs: Date.UTC(2023, 0, 3), messageCount: 2 },
      { dayMs: Date.UTC(2023, 5, 1), messageCount: 10 },
      { dayMs: Date.UTC(2023, 5, 2), messageCount: 8 },
    ]);
    expect(facts).not.toBeNull();
    assertSuperlativeOrder(facts!);
    expect(facts!.busiestDay.messageCount).toBe(10);
    expect(facts!.quietestDay.messageCount).toBe(1);
    expect(facts!.busiestMonth.monthIndex).toBe(5);
    expect(facts!.busiestMonth.messageCount).toBe(18);
    expect(facts!.quietestMonth.monthIndex).toBe(0);
    expect(facts!.quietestMonth.messageCount).toBe(6);
  });

  it("never treats a month total as a day count", () => {
    // Reproduce the UX bug: month totals can exceed any single day.
    const facts = computeActivityFacts(
      Array.from({ length: 30 }, (_, index) => ({
        dayMs: Date.UTC(2023, 2, index + 1),
        messageCount: index === 0 ? 3 : 2,
      })),
    );
    expect(facts).not.toBeNull();
    expect(facts!.busiestDay.messageCount).toBe(3);
    expect(facts!.quietestDay.messageCount).toBe(2);
    expect(facts!.quietestMonth.messageCount).toBeGreaterThan(
      facts!.busiestDay.messageCount,
    );
    assertSuperlativeOrder(facts!);
  });

  it("computes longest consecutive-day streak", () => {
    const facts = computeActivityFacts([
      { dayMs: Date.UTC(2023, 0, 1), messageCount: 1 },
      { dayMs: Date.UTC(2023, 0, 2), messageCount: 1 },
      { dayMs: Date.UTC(2023, 0, 3), messageCount: 1 },
      { dayMs: Date.UTC(2023, 0, 5), messageCount: 1 },
    ]);
    expect(facts!.longestStreakDays).toBe(3);
  });

  it("returns null when there is no activity", () => {
    expect(computeActivityFacts([])).toBeNull();
    expect(
      computeActivityFacts([{ dayMs: Date.UTC(2023, 0, 1), messageCount: 0 }]),
    ).toBeNull();
  });
});
