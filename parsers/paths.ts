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
    const segments = entryPathSegments(path).map((segment) =>
      segment.toLowerCase(),
    );
    const markerIndex = segments.indexOf("your_instagram_activity");
    return markerIndex >= 0 && markerIndex < segments.length - 1;
  });
}

export function resolveReferencedPath(
  entryPaths: readonly string[],
  referencedPath: string,
): string {
  const normalizedReference = normalizeEntryPath(referencedPath);
  const lowerReference = normalizedReference.toLowerCase();

  const exact = entryPaths.find(
    (path) => normalizeEntryPath(path) === normalizedReference,
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

  return suffixMatches.length === 1
    ? normalizeEntryPath(suffixMatches[0])
    : normalizedReference;
}
