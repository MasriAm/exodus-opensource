export type LoadingSceneId = "dusting" | "scroll" | "cauldron";

export type LoadingSceneCopy = {
  id: LoadingSceneId;
  path: string;
  captions: string[];
};

export type InteractiveStates = {
  cringePrompts: string[];
  artifactPrompts: string[];
};

export type LoadingCaptions = {
  scenes: LoadingSceneCopy[];
  interactive: InteractiveStates;
};

/** Bundled fallback — never crash, never show an empty caption. */
export const FALLBACK_LOADING_CAPTIONS: LoadingCaptions = {
  scenes: [
    {
      id: "dusting",
      path: "/assets/dusting.webp",
      captions: [
        "Dusting your old DMs...",
        "Sweeping up your memories...",
        "Clearing your archive...",
        "Brushing your data...",
      ],
    },
    {
      id: "scroll",
      path: "/assets/scroll.webp",
      captions: [
        "Finding out who your real friends are...",
        "Checking the timestamps...",
        "Auditing your follower history...",
        "Calculating who actually stuck around...",
      ],
    },
    {
      id: "cauldron",
      path: "/assets/cauldron.webp",
      captions: [
        "Locating your most embarrassing moments...",
        "Extracting highly toxic memories...",
        "Handling your past aesthetics...",
        "Brewing up your worst takes...",
      ],
    },
  ],
  interactive: {
    cringePrompts: [
      "According to our historical records, you thought it was a good idea to say:",
      "We found this gem buried deep in the archives. Care to explain?",
      "Our algorithm detected high levels of regret regarding this statement:",
      "Evidence suggests you sent this with a straight face:",
    ],
    artifactPrompts: [
      "Careful, you might shed a tear!",
      "A perfectly preserved relic from day one.",
      "Warning: highly concentrated nostalgia ahead.",
      "The digital fossil that started it all.",
    ],
  },
};

type CaptionsJson = {
  loading?: Partial<
    Record<
      LoadingSceneId,
      {
        path?: string;
        captions?: string[];
      }
    >
  >;
  interactive_states?: {
    cringe_prompts?: string[];
    artifact_prompts?: string[];
  };
};

function nonEmptyStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : fallback;
}

function resolveAssetPath(raw: string | undefined, fallback: string): string {
  if (!raw || typeof raw !== "string") {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  // captions.json may say "assets/..." without a leading slash
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  // Prefer converted WebP siblings when the JSON still points at GIF originals
  if (withSlash.endsWith(".gif")) {
    return withSlash.replace(/\.gif$/i, ".webp");
  }
  return withSlash;
}

export function normalizeLoadingCaptions(
  raw: CaptionsJson | null | undefined,
): LoadingCaptions {
  if (!raw || typeof raw !== "object") {
    return FALLBACK_LOADING_CAPTIONS;
  }

  const scenes = FALLBACK_LOADING_CAPTIONS.scenes.map((fallbackScene) => {
    const entry = raw.loading?.[fallbackScene.id];
    return {
      id: fallbackScene.id,
      path: resolveAssetPath(entry?.path, fallbackScene.path),
      captions: nonEmptyStrings(entry?.captions, fallbackScene.captions),
    };
  });

  return {
    scenes,
    interactive: {
      cringePrompts: nonEmptyStrings(
        raw.interactive_states?.cringe_prompts,
        FALLBACK_LOADING_CAPTIONS.interactive.cringePrompts,
      ),
      artifactPrompts: nonEmptyStrings(
        raw.interactive_states?.artifact_prompts,
        FALLBACK_LOADING_CAPTIONS.interactive.artifactPrompts,
      ),
    },
  };
}

let cached: LoadingCaptions | null = null;
let loadingPromise: Promise<LoadingCaptions> | null = null;

/** Load captions once (fetch + bundled fallback). Safe offline. */
export async function loadLoadingCaptions(): Promise<LoadingCaptions> {
  if (cached) {
    return cached;
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const response = await fetch("/assets/captions.json", {
        cache: "force-cache",
      });
      if (!response.ok) {
        cached = FALLBACK_LOADING_CAPTIONS;
        return cached;
      }
      const json = (await response.json()) as CaptionsJson;
      cached = normalizeLoadingCaptions(json);
      return cached;
    } catch {
      cached = FALLBACK_LOADING_CAPTIONS;
      return cached;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export function getCachedLoadingCaptions(): LoadingCaptions {
  return cached ?? FALLBACK_LOADING_CAPTIONS;
}

/** Map ingest progress into which mood animation is on stage. */
export function sceneForProgress(percent: number | undefined): LoadingSceneId {
  const value = percent ?? 0;
  if (value < 34) {
    return "dusting";
  }
  if (value < 68) {
    return "scroll";
  }
  return "cauldron";
}

export function pickCaption(
  captions: string[],
  index: number,
  fallback: string,
): string {
  if (captions.length === 0) {
    return fallback;
  }
  return captions[Math.abs(index) % captions.length] ?? fallback;
}
