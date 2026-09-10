/**
 * Which skin the capsule wears.
 *
 * A single-platform archive gets that platform's own colours, because the
 * whole point is that it should feel like the app the memories came from. The
 * moment two platforms are in the archive there is no honest answer to "whose
 * colours" — so it falls back to the neutral paper archive, which is also the
 * identity the rest of the product uses.
 */

export const PLATFORM_THEMES = [
  "archive",
  "instagram",
  "snapchat",
  "facebook",
  "whatsapp",
] as const;

export type PlatformThemeId = (typeof PLATFORM_THEMES)[number];

export interface PlatformThemeMeta {
  id: PlatformThemeId;
  /** Shown on the Wrapped cover. */
  label: string;
  /** True when the deck is drawn light-on-dark. */
  dark: boolean;
}

export const PLATFORM_THEME_META: Readonly<
  Record<PlatformThemeId, PlatformThemeMeta>
> = {
  archive: { id: "archive", label: "Your archive", dark: false },
  instagram: { id: "instagram", label: "Instagram", dark: true },
  snapchat: { id: "snapchat", label: "Snapchat", dark: false },
  facebook: { id: "facebook", label: "Facebook", dark: false },
  whatsapp: { id: "whatsapp", label: "WhatsApp", dark: false },
};

/** Parsers store ids lowercase, but archives and fixtures are less careful. */
function normalize(platform: string): PlatformThemeId | null {
  const key = platform.trim().toLocaleLowerCase();
  switch (key) {
    case "instagram":
      return "instagram";
    case "snapchat":
      return "snapchat";
    case "facebook":
    case "messenger":
      return "facebook";
    case "whatsapp":
      return "whatsapp";
    default:
      return null;
  }
}

/**
 * Resolve the deck theme for an archive.
 *
 * Exactly one recognized platform wins. Anything else — none, several, or an
 * unrecognized name — falls back to the paper archive.
 */
export function resolvePlatformTheme(
  platforms: readonly string[],
): PlatformThemeId {
  const distinct = new Set<PlatformThemeId>();
  for (const platform of platforms) {
    const themed = normalize(platform);
    // One unrecognized platform is still a second voice in the archive, so it
    // has to break the tie rather than be quietly ignored.
    if (themed === null) {
      return "archive";
    }
    distinct.add(themed);
  }

  if (distinct.size !== 1) {
    return "archive";
  }
  return [...distinct][0];
}

export function platformThemeMeta(id: PlatformThemeId): PlatformThemeMeta {
  return PLATFORM_THEME_META[id];
}
