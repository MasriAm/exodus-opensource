import { describe, expect, it } from "vitest";

import { followingWithoutFollowBack } from "@/lib/follow-facts";

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
});
