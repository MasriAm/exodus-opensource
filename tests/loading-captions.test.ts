import { describe, expect, it } from "vitest";

import {
  FALLBACK_LOADING_CAPTIONS,
  normalizeLoadingCaptions,
  pickCaption,
  sceneForProgress,
} from "@/lib/loading-captions";

describe("loading captions", () => {
  it("falls back when json is missing or empty", () => {
    expect(normalizeLoadingCaptions(null)).toEqual(FALLBACK_LOADING_CAPTIONS);
    expect(normalizeLoadingCaptions({})).toEqual(FALLBACK_LOADING_CAPTIONS);
  });

  it("rewrites gif paths to webp and fills missing captions", () => {
    const normalized = normalizeLoadingCaptions({
      loading: {
        dusting: {
          path: "assets/dusting.gif",
          captions: ["  Custom dust  ", ""],
        },
        scroll: {
          path: "/assets/scroll.webp",
        },
      },
      interactive_states: {
        cringe_prompts: ["Only one"],
        artifact_prompts: [],
      },
    });

    expect(normalized.scenes[0].path).toBe("/assets/dusting.webp");
    expect(normalized.scenes[0].captions).toEqual(["Custom dust"]);
    expect(normalized.scenes[1].captions).toEqual(
      FALLBACK_LOADING_CAPTIONS.scenes[1].captions,
    );
    expect(normalized.interactive.cringePrompts).toEqual(["Only one"]);
    expect(normalized.interactive.artifactPrompts).toEqual(
      FALLBACK_LOADING_CAPTIONS.interactive.artifactPrompts,
    );
  });

  it("maps progress into the three scenes", () => {
    expect(sceneForProgress(10)).toBe("dusting");
    expect(sceneForProgress(50)).toBe("scroll");
    expect(sceneForProgress(90)).toBe("cauldron");
  });

  it("never returns an empty caption", () => {
    expect(pickCaption([], 0, "fallback")).toBe("fallback");
    expect(pickCaption(["a", "b"], 3, "fallback")).toBe("b");
  });
});
