import { describe, expect, it } from "vitest";

import {
  isArchiveFilterActive,
  messagesWhere,
  mergeFilters,
  normalizeArchiveFilter,
  yearBoundsMs,
} from "../lib/db/archive-filter";
import { parseSearchQuery } from "../lib/db/search-tokens";

describe("archive-filter", () => {
  it("normalizes empty filters", () => {
    expect(normalizeArchiveFilter(undefined)).toEqual({
      fromMs: null,
      toMs: null,
      platform: null,
      conversation: null,
    });
    expect(isArchiveFilterActive({})).toBe(false);
  });

  it("builds messages WHERE with bound params", () => {
    const fragment = messagesWhere({
      platform: "Instagram",
      conversation: "alpha",
      fromMs: 1000,
      toMs: 2000,
    });
    expect(fragment.clause).toContain("platform = ?");
    expect(fragment.clause).toContain("conversation = ?");
    expect(fragment.clause).toContain("sent_at >= epoch_ms");
    expect(fragment.params).toEqual(["instagram", "alpha", 1000, 2000]);
  });

  it("rejects inverted time bounds", () => {
    expect(() => normalizeArchiveFilter({ fromMs: 5, toMs: 1 })).toThrow(
      /fromMs must be before toMs/,
    );
  });

  it("merges overrides onto a base filter", () => {
    expect(
      mergeFilters(
        { platform: "whatsapp", fromMs: 1 },
        { conversation: "beta", fromMs: 9 },
      ),
    ).toEqual({
      fromMs: 9,
      toMs: null,
      platform: "whatsapp",
      conversation: "beta",
    });
  });

  it("computes year bounds in UTC", () => {
    expect(yearBoundsMs(2020)).toEqual({
      fromMs: Date.UTC(2020, 0, 1),
      toMs: Date.UTC(2021, 0, 1),
    });
  });
});

describe("parseSearchQuery", () => {
  it("parses free text and tokens", () => {
    expect(
      parseSearchQuery('hello from:Amina in:"group chat" after:2019 before:2021-06 has:media'),
    ).toEqual({
      freeText: "hello",
      from: "Amina",
      conversation: "group chat",
      afterMs: Date.UTC(2019, 0, 1),
      beforeMs: Date.UTC(2021, 5, 1),
      hasMedia: true,
    });
  });

  it("allows token-only queries", () => {
    expect(parseSearchQuery("from:sara has:media")).toEqual({
      freeText: "",
      from: "sara",
      conversation: null,
      beforeMs: null,
      afterMs: null,
      hasMedia: true,
    });
  });

  it("keeps unknown has: values as free text", () => {
    const parsed = parseSearchQuery("photo has:link");
    expect(parsed.hasMedia).toBe(false);
    expect(parsed.freeText).toContain("has:link");
  });
});
