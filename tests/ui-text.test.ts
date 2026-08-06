import { describe, expect, it } from "vitest";

import {
  containsArabic,
  isOutgoingSender,
  pluralize,
  resolveSelfSender,
} from "@/lib/ui-text";

describe("pluralize", () => {
  it("uses singular for one", () => {
    expect(pluralize(1, "message")).toBe("1 message");
  });

  it("uses plural otherwise", () => {
    expect(pluralize(0, "message")).toBe("0 messages");
    expect(pluralize(2, "person", "people")).toBe("2 people");
  });
});

describe("containsArabic", () => {
  it("detects Arabic runs", () => {
    expect(containsArabic("سارة")).toBe(true);
    expect(containsArabic("Yousef")).toBe(false);
    expect(containsArabic("Meet at 3am خلينا")).toBe(true);
  });
});

describe("isOutgoingSender", () => {
  it("treats the conversation title as the other party in 1:1", () => {
    const roster = [
      { sender: "Yousef", messageCount: 10 },
      { sender: "sara_al_haddad", messageCount: 12 },
    ];
    expect(isOutgoingSender("sara_al_haddad", "sara_al_haddad", roster)).toBe(
      false,
    );
    expect(isOutgoingSender("Yousef", "sara_al_haddad", roster)).toBe(true);
  });

  it("stays stable across a page that only contains the other person", () => {
    const roster = [
      { sender: "Yousef", messageCount: 40 },
      { sender: "sara", messageCount: 55 },
    ];
    expect(isOutgoingSender("sara", "sara", roster)).toBe(false);
    expect(isOutgoingSender("Yousef", "sara", roster)).toBe(true);
  });

  it("uses archiveSelfHint for groups", () => {
    const roster = [
      { sender: "you", messageCount: 5 },
      { sender: "a", messageCount: 20 },
      { sender: "b", messageCount: 18 },
    ];
    expect(isOutgoingSender("you", "family_group", roster, null, "you")).toBe(
      true,
    );
    expect(isOutgoingSender("a", "family_group", roster, null, "you")).toBe(
      false,
    );
  });
});

describe("resolveSelfSender", () => {
  it("picks the non-title participant in 1:1", () => {
    expect(
      resolveSelfSender("sara", [
        { sender: "sara", messageCount: 10 },
        { sender: "me", messageCount: 8 },
      ]),
    ).toBe("me");
  });
});
