import { describe, expect, it } from "vitest";

import {
  canonicalFollowHandle,
  followingWithoutFollowBack,
  normalizeFollowUsername,
} from "@/lib/follow-facts";

describe("normalizeFollowUsername", () => {
  it("strips @ and profile URLs down to the handle", () => {
    expect(normalizeFollowUsername("@Sara_Al")).toBe("sara_al");
    expect(
      normalizeFollowUsername("https://www.instagram.com/_u/sara_al/"),
    ).toBe("sara_al");
  });
});

describe("canonicalFollowHandle", () => {
  it("prefers the profile URL handle over a display-name value", () => {
    expect(
      canonicalFollowHandle({
        href: "https://www.instagram.com/sara_al/",
        value: "سارة",
        name: "سارة",
      }),
    ).toBe("sara_al");
  });
});

describe("followingWithoutFollowBack", () => {
  it("lists accounts you follow that are not followers", () => {
    const rows = followingWithoutFollowBack([
      { kind: "following", username: "only_out", occurredAtMs: 1 },
      { kind: "following", username: "mutual", occurredAtMs: 2 },
      { kind: "follower", username: "mutual", occurredAtMs: 3 },
      { kind: "follower", username: "only_in", occurredAtMs: 4 },
      { kind: "following", username: "Only_Out", occurredAtMs: 5 },
    ]);
    expect(rows.map((row) => row.username)).toEqual(["only_out"]);
  });

  it("matches handles when one side uses a profile URL", () => {
    const rows = followingWithoutFollowBack([
      {
        kind: "following",
        username: "https://www.instagram.com/only_out/",
        occurredAtMs: 1,
      },
      {
        kind: "follower",
        username: "@mutual",
        occurredAtMs: 2,
      },
      {
        kind: "following",
        username: "mutual",
        occurredAtMs: 3,
      },
    ]);
    expect(rows.map((row) => normalizeFollowUsername(row.username))).toEqual([
      "only_out",
    ]);
  });

  it("treats display-name vs URL-handle pairs as the same person via canonical keys", () => {
    const followerHandle = canonicalFollowHandle({
      href: "https://www.instagram.com/mutual_pal/",
      value: "Mutual Pal",
      name: "Mutual Pal",
    });
    const followingHandle = canonicalFollowHandle({
      href: null,
      value: "mutual_pal",
      name: "Mutual Pal",
    });
    expect(followerHandle).toBe(followingHandle);
    const rows = followingWithoutFollowBack([
      {
        kind: "follower",
        username: followerHandle,
        occurredAtMs: 1,
      },
      {
        kind: "following",
        username: followingHandle,
        occurredAtMs: 2,
      },
      {
        kind: "following",
        username: "only_out",
        occurredAtMs: 3,
      },
    ]);
    expect(rows.map((row) => row.username)).toEqual(["only_out"]);
  });
});
