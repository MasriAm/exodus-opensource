import { describe, expect, it } from "vitest";

import {
  PLATFORM_THEMES,
  platformThemeMeta,
  resolvePlatformTheme,
} from "@/lib/platform-theme";

describe("resolvePlatformTheme", () => {
  it("gives a single-platform archive that platform's skin", () => {
    expect(resolvePlatformTheme(["instagram"])).toBe("instagram");
    expect(resolvePlatformTheme(["snapchat"])).toBe("snapchat");
    expect(resolvePlatformTheme(["facebook"])).toBe("facebook");
    expect(resolvePlatformTheme(["whatsapp"])).toBe("whatsapp");
  });

  it("falls back to the paper archive once two platforms are present", () => {
    expect(resolvePlatformTheme(["instagram", "snapchat"])).toBe("archive");
    expect(resolvePlatformTheme(["snapchat", "whatsapp", "facebook"])).toBe(
      "archive",
    );
  });

  it("treats repeats of one platform as still that platform", () => {
    expect(resolvePlatformTheme(["snapchat", "snapchat"])).toBe("snapchat");
    expect(resolvePlatformTheme(["Instagram", "instagram"])).toBe("instagram");
  });

  it("ignores casing and whitespace from the archive", () => {
    expect(resolvePlatformTheme([" Snapchat "])).toBe("snapchat");
  });

  it("maps Messenger onto the Facebook skin", () => {
    expect(resolvePlatformTheme(["messenger"])).toBe("facebook");
    expect(resolvePlatformTheme(["messenger", "facebook"])).toBe("facebook");
  });

  it("stays neutral for an empty or unrecognized archive", () => {
    expect(resolvePlatformTheme([])).toBe("archive");
    expect(resolvePlatformTheme(["myspace"])).toBe("archive");
    // An unknown platform is still a second voice, so it breaks the tie.
    expect(resolvePlatformTheme(["instagram", "myspace"])).toBe("archive");
  });

  it("describes every theme it can return", () => {
    for (const theme of PLATFORM_THEMES) {
      const meta = platformThemeMeta(theme);
      expect(meta.id).toBe(theme);
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});
