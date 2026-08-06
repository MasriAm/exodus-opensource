import { describe, expect, it } from "vitest";

import {
  deskSectionHref,
  parseDeskSection,
  wrappedSlideHref,
} from "@/components/dashboard/session-history";

describe("session history helpers", () => {
  it("parses known desk sections and falls back to overview", () => {
    expect(parseDeskSection("messages")).toBe("messages");
    expect(parseDeskSection("export")).toBe("export");
    expect(parseDeskSection("nope")).toBe("desk");
    expect(parseDeskSection(null)).toBe("desk");
  });

  it("keeps overview URLs free of query noise", () => {
    expect(deskSectionHref("desk")).toBe("/dashboard");
    expect(deskSectionHref("people")).toBe("/dashboard?view=people");
  });

  it("encodes wrapped slides without storing archive content", () => {
    expect(wrappedSlideHref(0)).toBe("/wrapped");
    expect(wrappedSlideHref(3)).toBe("/wrapped?slide=3");
  });
});
