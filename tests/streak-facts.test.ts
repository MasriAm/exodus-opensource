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

  it("documents busiest day as a day count (not a month total)", () => {
    const { busiestDay } = analytics;
    expect(busiestDay.messages).toBe(3);
    expect(busiestDay.date).toBe("2023-01-01");
    // A quiet month total can exceed the busiest day — never compare them as peers.
    expect(busiestDay.messages).toBeLessThan(59);
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
    expect(firstMessage.conversation).toBe("omar_khalil");
  });

  it("matches longest streak length to the fixture span", () => {
    const streak = analytics.longestDailyActivityStreak;
    expect(streak.days).toBe(731);
    expect(streak.startDate).toBe("2023-01-01");
    expect(streak.endDate).toBe("2024-12-31");
  });

  it("activity facts stay ordered when month totals dwarf day peaks", () => {
    // Mimic the live bug class: many quiet days → large month, tiny peak day.
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
