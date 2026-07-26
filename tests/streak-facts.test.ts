import { describe, expect, it } from "vitest";

import {
  assertSuperlativeOrder,
  computeActivityFacts,
} from "@/lib/activity-facts";
import {
  assertStreakSilenceOrder,
  computeStreakSilence,
} from "@/lib/streak-facts";
import manifest from "../fixtures/manifest.json";

describe("computeStreakSilence", () => {
  it("keeps longest streak on consecutive days and silence on gaps", () => {
    const facts = computeStreakSilence([
      Date.UTC(2023, 0, 1),
      Date.UTC(2023, 0, 2),
      Date.UTC(2023, 0, 3),
      Date.UTC(2023, 0, 10),
    ]);
    assertStreakSilenceOrder(facts);
    expect(facts.longestStreakDays).toBe(3);
    expect(facts.longestSilenceDays).toBe(6);
  });

  it("never swaps streak for silence when gaps dominate", () => {
    const facts = computeStreakSilence([
      Date.UTC(2023, 0, 1),
      Date.UTC(2023, 0, 30),
    ]);
    expect(facts.longestStreakDays).toBe(1);
    expect(facts.longestSilenceDays).toBe(28);
    expect(facts.longestSilenceDays).toBeGreaterThan(facts.longestStreakDays);
  });

  it("returns zeros for an empty series", () => {
    expect(computeStreakSilence([])).toEqual({
      longestStreakDays: 0,
      longestSilenceDays: 0,
    });
  });
});

describe("fixture manifest superlatives", () => {
  const analytics = manifest.instagram.analytics;

  it("documents a genuine per-day peak (burstier than a flat 3)", () => {
    const { busiestDay } = analytics;
    expect(busiestDay.messages).toBeGreaterThan(10);
    expect(busiestDay.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Month totals can still exceed a single day — never compare as peers.
    expect(analytics.activeDayCount).toBeLessThan(700);
  });

  it("keeps top contacts ordered by message count descending", () => {
    const tops = analytics.topConversations;
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i - 1].messages).toBeGreaterThanOrEqual(tops[i].messages);
    }
    expect(tops[0]?.conversation).toBe("family_group");
  });

  it("keeps first message before last date in range", () => {
    const { firstMessage, dateRange } = analytics;
    expect(firstMessage.sentAtMs).toBe(dateRange.firstSentAtMs);
    expect(firstMessage.sentAtMs).toBeLessThanOrEqual(dateRange.lastSentAtMs);
  });

  it("has a meaningful streak shorter than a solid two-year block", () => {
    const streak = analytics.longestDailyActivityStreak;
    expect(streak.days).toBeGreaterThan(1);
    expect(streak.days).toBeLessThan(400);
    expect(streak.startDate <= streak.endDate).toBe(true);
  });

  it("activity facts stay ordered when month totals dwarf day peaks", () => {
    const days = Array.from({ length: 31 }, (_, index) => ({
      dayMs: Date.UTC(2023, 0, index + 1),
      messageCount: index === 0 ? 3 : 2,
    }));
    const facts = computeActivityFacts(days);
    expect(facts).not.toBeNull();
    assertSuperlativeOrder(facts!);
    expect(facts!.busiestDay.messageCount).toBe(3);
    expect(facts!.quietestMonth.messageCount).toBeGreaterThan(
      facts!.busiestDay.messageCount,
    );
  });
});
