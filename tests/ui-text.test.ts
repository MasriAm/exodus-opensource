import { describe, expect, it } from "vitest";

import { containsArabic, isOutgoingSender, pluralize } from "@/lib/ui-text";

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
    expect(
      isOutgoingSender("سارة", "sara_al_haddad", ["Yousef", "سارة"]),
    ).toBe(false);
    expect(
      isOutgoingSender("Yousef", "sara_al_haddad", ["Yousef", "سارة"]),
    ).toBe(true);
  });
});
