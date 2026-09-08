import { describe, expect, it } from "vitest";

import { extractEvidence } from "@/lib/drama/extract";
import { normalizeForMatch } from "@/lib/drama/lexicon";
import { maskToBlocks, redactName, redactText } from "@/lib/drama/redact";
import {
  buildReport,
  computeMetrics,
  computeVerdicts,
  findComeback,
  findSituationship,
  findSlowFade,
} from "@/lib/drama/verdicts";
import { buildTemplateMessages } from "@/lib/drama/template-data";
import type { DramaMessage } from "@/lib/drama/types";

const DAY = 86_400_000;

/** UTC extractors keep every assertion independent of the runner's timezone. */
const UTC = {
  hourOf: (ms: number) => new Date(ms).getUTCHours(),
  dayOf: (ms: number) => Math.floor(ms / DAY),
};

let nextId = 1;

function message(
  conversation: string,
  isSelf: boolean,
  sentAtMs: number,
  text: string,
): DramaMessage {
  return {
    id: nextId++,
    platform: "snapchat",
    conversation,
    sender: isSelf ? "you" : conversation,
    sentAtMs,
    text,
    isSelf,
  };
}

function at(day: number, hour: number, minute = 0): number {
  return Date.UTC(2023, 0, 1 + day, hour, minute);
}

describe("normalizeForMatch", () => {
  it("folds Arabic orthography so one spelling matches the rest", () => {
    expect(normalizeForMatch("أنا آسِف")).toBe(normalizeForMatch("انا اسف"));
    expect(normalizeForMatch("سارة")).toBe(normalizeForMatch("ساره"));
  });

  it("collapses whitespace and smart quotes", () => {
    expect(normalizeForMatch("  I’m   DONE ")).toBe("i'm done");
  });
});

describe("extractEvidence", () => {
  it("files a message under the category its phrases belong to", () => {
    const exhibits = extractEvidence(
      [
        message("dee", false, at(0, 14), "we need to talk about last night"),
        message("dee", true, at(0, 15), "dont tell anyone i said that please"),
        message("dee", true, at(1, 3), "cant sleep, are you awake"),
      ],
      UTC,
    );

    const byId = new Map(exhibits.map((entry) => [entry.category.id, entry]));
    expect(byId.get("exit")?.items[0].text).toContain("we need to talk");
    expect(byId.get("secret")?.items[0].text).toContain("dont tell anyone");
    expect(byId.get("latenight")?.items[0].text).toContain("cant sleep");
  });

  it("does not match a lexicon phrase inside a longer word", () => {
    const exhibits = extractEvidence(
      [message("dee", true, at(0, 12), "the scandalous sorrymongering continues")],
      UTC,
    );
    expect(exhibits.find((entry) => entry.category.id === "apology")).toBeUndefined();
  });

  it("ranks a 3am message above comparable words sent at noon", () => {
    const exhibits = extractEvidence(
      [
        message("dee", true, at(0, 12), "i think we should stop doing this to each other"),
        message("ray", true, at(1, 3), "i think we should stop doing this to one another"),
      ],
      UTC,
    );

    const exit = exhibits.find((entry) => entry.category.id === "exit");
    expect(exit?.items).toHaveLength(2);
    expect(exit?.items[0].conversation).toBe("ray");
    expect(exit!.items[0].score).toBeGreaterThan(exit!.items[1].score);
  });

  it("collapses the same sentence sent to several people", () => {
    const exhibits = extractEvidence(
      [
        message("dee", true, at(0, 12), "i'm sorry, i should have said something"),
        message("ray", true, at(0, 13), "i'm sorry, i should have said something"),
      ],
      UTC,
    );

    const apology = exhibits.find((entry) => entry.category.id === "apology");
    expect(apology?.items).toHaveLength(1);
    expect(apology?.totalMatches).toBe(2);
  });

  it("spreads an exhibit across conversations instead of one loud chat", () => {
    const messages: DramaMessage[] = [];
    for (let index = 0; index < 6; index += 1) {
      messages.push(
        message("loud", true, at(index, 12), `i'm so sorry about ${index} honestly`),
      );
    }
    messages.push(message("quiet", true, at(9, 12), "i'm so sorry about all of it"));

    const exhibits = extractEvidence(messages, {
      ...UTC,
      perCategory: 3,
      maxPerConversation: 2,
    });
    const apology = exhibits.find((entry) => entry.category.id === "apology");

    expect(apology?.items).toHaveLength(3);
    expect(
      apology?.items.filter((item) => item.conversation === "quiet"),
    ).toHaveLength(1);
    expect(apology?.totalMatches).toBe(7);
  });

  it("keeps The Ick inside the archive's early era", () => {
    const exhibits = extractEvidence(
      [
        message("old", true, Date.UTC(2018, 0, 1), "that outfit is on fleek honestly"),
        message("new", true, Date.UTC(2025, 0, 1), "that outfit is on fleek honestly"),
      ],
      UTC,
    );

    const ick = exhibits.find((entry) => entry.category.id === "ick");
    expect(ick?.items).toHaveLength(1);
    expect(ick?.items[0].conversation).toBe("old");
  });
});

describe("computeMetrics", () => {
  it("counts a run of unanswered messages once, not per message", () => {
    const metrics = computeMetrics(
      [
        message("dee", true, at(0, 12, 0), "hey"),
        message("dee", true, at(0, 12, 8), "you around?"),
        message("dee", true, at(0, 12, 20), "ok"),
        message("dee", false, at(0, 13, 0), "sorry was driving"),
      ],
      UTC,
    );

    expect(metrics.doubleTextRuns).toBe(1);
    expect(metrics.spiralRuns).toBe(0);
  });

  it("ignores a rapid burst that was answered straight away", () => {
    const metrics = computeMetrics(
      [
        message("dee", true, at(0, 12, 0), "hey"),
        message("dee", true, at(0, 12, 1), "quick q"),
        message("dee", false, at(0, 12, 2), "go on"),
      ],
      UTC,
    );

    expect(metrics.doubleTextRuns).toBe(0);
  });

  it("separates who left whom on read", () => {
    const metrics = computeMetrics(
      [
        message("dee", false, at(0, 9), "morning"),
        message("dee", true, at(1, 22), "sorry only seeing this"),
        message("dee", false, at(1, 23), "all good"),
      ],
      UTC,
    );

    expect(metrics.youLeftOnRead).toBe(1);
    expect(metrics.theyLeftYouOnRead).toBe(0);
  });

  it("measures the late-night share against your own messages only", () => {
    const metrics = computeMetrics(
      [
        message("dee", true, at(0, 3), "cant sleep"),
        message("dee", true, at(0, 15), "hey"),
        message("dee", false, at(0, 3), "same"),
        message("dee", false, at(0, 4), "same again"),
      ],
      UTC,
    );

    expect(metrics.lateNightShare).toBeCloseTo(0.5, 5);
    expect(metrics.lateNightAccomplice).toEqual({
      conversation: "dee",
      messageCount: 1,
    });
  });
});

describe("verdicts and arcs", () => {
  it("names the archetype the numbers actually support", () => {
    const messages: DramaMessage[] = [];
    for (let day = 0; day < 40; day += 1) {
      // They open, you answer within minutes — so nobody is left on read and
      // the only thing left to explain is the hour.
      messages.push(message("dee", false, at(day, 3), "you up"));
      messages.push(message("dee", true, at(day, 3, 2), "unfortunately, yes i am"));
    }

    const verdicts = computeVerdicts(computeMetrics(messages, UTC));
    expect(verdicts[0].id).toBe("night-shift");
    expect(verdicts[0].confidence).toBeLessThanOrEqual(1);
  });

  it("picks the fastest-burning chat as the situationship", () => {
    const messages: DramaMessage[] = [];
    for (let index = 0; index < 40; index += 1) {
      // Intense and short.
      messages.push(message("spark", true, at(Math.floor(index / 2), 20), "hi again"));
    }
    for (let index = 0; index < 40; index += 1) {
      // Same volume, spread over two years.
      messages.push(message("steady", true, at(index * 18, 20), "hey how are you"));
    }

    const situationship = findSituationship(computeMetrics(messages, UTC));
    expect(situationship?.conversation).toBe("spark");
  });

  it("finds the chat that went quiet and the silence that got broken", () => {
    const messages: DramaMessage[] = [];
    for (let index = 0; index < 25; index += 1) {
      messages.push(message("gone", true, at(index, 12), "chatting away here"));
    }
    for (let index = 0; index < 25; index += 1) {
      messages.push(message("alive", true, at(600 + index, 12), "still going strong"));
    }
    messages.push(message("gone", false, at(900, 12), "hey stranger"));

    const metrics = computeMetrics(messages, { ...UTC, nowMs: at(1000, 12) });

    expect(findSlowFade(metrics)?.conversation).toBe("alive");
    const comeback = findComeback(metrics);
    expect(comeback?.conversation).toBe("gone");
    expect(comeback?.silentDays).toBe(876);
    expect(comeback?.revivedByYou).toBe(false);
  });

  it("reports the archive total when the corpus was capped", () => {
    const report = buildReport([message("dee", true, at(0, 12), "hello there")], {
      ...UTC,
      totalMessages: 90_000,
    });

    expect(report.totalMessages).toBe(90_000);
    expect(report.analyzedMessages).toBe(1);
  });

  it("survives an empty archive without throwing", () => {
    const report = buildReport([], UTC);
    expect(report.verdicts).toEqual([]);
    expect(report.exhibits).toEqual([]);
    expect(report.situationship).toBeNull();
  });
});

describe("redaction", () => {
  it("keeps the shape of a name and loses the person", () => {
    expect(redactName("Maya")).toBe("M███");
    expect(redactName("Maya Khalil")).toBe("M███ K█████");
  });

  it("strips contact details and known names from a revealed quote", () => {
    const redacted = redactText(
      "call me on 07700 900461 or maya@example.com, ask Maya",
      ["Maya"],
    );

    expect(redacted).not.toContain("900461");
    expect(redacted).not.toContain("maya@example.com");
    expect(redacted).not.toContain("ask Maya");
    expect(redacted).toContain("M███");
  });

  it("blocks letters and digits but keeps the sentence shape", () => {
    expect(maskToBlocks("hey, are you up?")).toBe("███, ███ ███ ██?");
  });
});

describe("the demo corpus", () => {
  const report = buildReport(buildTemplateMessages(), { isDemo: true });

  it("is large and varied enough to exercise every part of the report", () => {
    expect(report.analyzedMessages).toBeGreaterThan(200);
    expect(report.conversationCount).toBe(6);
    expect(report.platforms).toEqual(["Instagram", "Snapchat"]);
  });

  it("produces every headline section the report renders", () => {
    expect(report.verdicts.length).toBeGreaterThan(0);
    expect(report.situationship).not.toBeNull();
    expect(report.slowFade).not.toBeNull();
    expect(report.comeback).not.toBeNull();
    expect(report.signatureWords.length).toBeGreaterThan(0);
  });

  it("carries evidence for the categories the landing page advertises", () => {
    const found = new Set(report.exhibits.map((entry) => entry.category.id));
    for (const required of [
      "argument",
      "exit",
      "confession",
      "secret",
      "apology",
      "latenight",
      "ghost",
      "tea",
      "ick",
    ] as const) {
      expect(found).toContain(required);
    }
  });

  it("is entirely fictional — no real handles leak into it", () => {
    for (const message of buildTemplateMessages()) {
      expect(message.text).not.toMatch(/@[\w.]+\.(com|net|org)/u);
    }
  });
});

describe("report composition", () => {
  it("does not tell the same story twice as situationship and slow fade", () => {
    const messages: DramaMessage[] = [];
    // One intense, long-dead chat that would otherwise win both slots.
    for (let index = 0; index < 40; index += 1) {
      messages.push(message("spark", true, at(Math.floor(index / 2), 20), `burning ${index}`));
    }
    // A second chat that also went quiet, just less dramatically.
    for (let index = 0; index < 25; index += 1) {
      messages.push(message("steady", true, at(100 + index, 12), `chatting ${index}`));
    }

    const report = buildReport(messages, { ...UTC, nowMs: at(900, 12) });

    expect(report.situationship?.conversation).toBe("spark");
    expect(report.slowFade?.conversation).toBe("steady");
  });
});
