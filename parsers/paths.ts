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

export function hasInstagramMarker(paths: readonly string[]): boolean {
  return paths.some((path) => {
    const lower = path.toLowerCase();
    return lower.includes("your_instagram_activity");
  });
}

export function hasFacebookMarker(paths: readonly string[]): boolean {
  return paths.some((path) => {
    const lower = path.toLowerCase();
    return lower.includes("your_facebook_activity");
  });
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
