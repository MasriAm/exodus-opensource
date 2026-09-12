export function entryPathSegments(path: string): string[] {
  const segments = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");

  return segments.includes("..") ? [] : segments;
}

export function normalizeEntryPath(path: string): string {
  return entryPathSegments(path).join("/");
}

export function entryBasename(path: string): string {
  const segments = entryPathSegments(path);
  return segments.at(-1) ?? "";
}

export function containsPathSequence(
  path: string,
  sequence: readonly string[],
): number {
  const segments = entryPathSegments(path).map((segment) =>
    segment.toLowerCase(),
  );
  const expected = sequence.map((segment) => segment.toLowerCase());

  for (
    let index = 0;
    index <= segments.length - expected.length;
    index += 1
  ) {
    if (
      expected.every(
        (segment, offset) => segments[index + offset] === segment,
      )
    ) {
      return index;
    }
  }

  return -1;
}

/**
 * Meta's export tool lets people tick individual categories, so an archive
 * often arrives without the `your_*_activity` folder entirely — a
 * followers-only export is just `connections/followers_and_following/`.
 *
 * Several top-level folders (`personal_information`, `ads_information`,
 * `preferences`) appear in both the Instagram and Facebook exports, so those
 * are useless for telling the two apart. Only paths unique to one product
 * belong in these lists.
 */
const INSTAGRAM_SIGNATURES: readonly string[] = [
  "your_instagram_activity",
  "connections/followers_and_following",
  "instagram_profile_information",
  "close_friends",
  "instagram_ads_and_businesses",
  "recently_deleted_content",
];

const FACEBOOK_SIGNATURES: readonly string[] = [
  "your_facebook_activity",
  "facebook_ads_and_businesses",
  "facebook_accounts_center",
  "connections/friends",
  "friends_and_followers",
  "groups/your_group_membership_activity",
  "pages/your_pages",
];

function matchesAnySignature(
  paths: readonly string[],
  signatures: readonly string[],
): boolean {
  return paths.some((path) => {
    const lower = normalizeEntryPath(path).toLowerCase();
    return signatures.some((signature) => lower.includes(signature));
  });
}

export function hasInstagramMarker(paths: readonly string[]): boolean {
  return matchesAnySignature(paths, INSTAGRAM_SIGNATURES);
}

export function hasFacebookMarker(paths: readonly string[]): boolean {
  return matchesAnySignature(paths, FACEBOOK_SIGNATURES);
}

/**
 * Folders Meta ships in both products. On their own they prove the archive
 * came from Meta but not which app, which happens when someone exports only
 * account-level categories. Specific enough not to collide with a Snapchat or
 * WhatsApp archive.
 */
const SHARED_META_SIGNATURES: readonly string[] = [
  "personal_information/personal_information.json",
  "ads_information/ads_and_topics",
  "ads_and_topics/ads_interests.json",
  "apps_and_websites_off_of_meta",
  "security_and_login_information/login_and_profile_creation",
  "preferences/your_topics",
];

/** True for a Meta export whose categories do not name the product. */
export function hasSharedMetaMarker(paths: readonly string[]): boolean {
  return matchesAnySignature(paths, SHARED_META_SIGNATURES);
}

function decodePathCandidate(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Map an Instagram/WhatsApp media URI onto a real ZIP entry.
 * Archives often nest under a root folder, so suffix / basename matching matters.
 */
export function resolveReferencedPath(
  entryPaths: readonly string[],
  referencedPath: string,
): string {
  const candidates = [
    normalizeEntryPath(referencedPath),
    normalizeEntryPath(decodePathCandidate(referencedPath)),
  ].filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);

  for (const normalizedReference of candidates) {
    const lowerReference = normalizedReference.toLowerCase();
    const exact = entryPaths.find(
      (path) => normalizeEntryPath(path).toLowerCase() === lowerReference,
    );
    if (exact !== undefined) {
      return normalizeEntryPath(exact);
    }

    const suffixMatches = entryPaths.filter((path) => {
      const normalizedPath = normalizeEntryPath(path).toLowerCase();
      return (
        normalizedPath === lowerReference ||
        normalizedPath.endsWith(`/${lowerReference}`)
      );
    });
    if (suffixMatches.length === 1) {
      return normalizeEntryPath(suffixMatches[0]);
    }
    if (suffixMatches.length > 1) {
      const preferred =
        suffixMatches.find((path) =>
          path.toLowerCase().includes("your_instagram_activity"),
        ) ??
        suffixMatches.find((path) => path.toLowerCase().includes("/messages/")) ??
        suffixMatches[0];
      return normalizeEntryPath(preferred);
    }

    const base = entryBasename(normalizedReference).toLowerCase();
    if (base.length > 0) {
      const baseMatches = entryPaths.filter(
        (path) => entryBasename(path).toLowerCase() === base,
      );
      if (baseMatches.length === 1) {
        return normalizeEntryPath(baseMatches[0]);
      }
      if (baseMatches.length > 1) {
        const preferred =
          baseMatches.find((path) =>
            path.toLowerCase().includes("your_instagram_activity"),
          ) ?? baseMatches[0];
        return normalizeEntryPath(preferred);
      }
    }
  }

  return normalizeEntryPath(referencedPath);
}
