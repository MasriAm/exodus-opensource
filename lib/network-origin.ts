/**
 * Classify Performance resource URLs for the landing trust badge.
 * Same-origin app assets (and blob:/data:) are local; everything else is external.
 */
export function isCrossOriginResource(
  resourceUrl: string,
  pageHref: string,
): boolean {
  try {
    const pageOrigin = new URL(pageHref).origin;
    const url = new URL(resourceUrl, pageHref);
    if (url.protocol === "blob:" || url.protocol === "data:") {
      return false;
    }
    return url.origin !== pageOrigin;
  } catch {
    return true;
  }
}

export function countResourceOrigins(
  resourceUrls: readonly string[],
  pageHref: string,
): { local: number; external: number } {
  let local = 0;
  let external = 0;
  for (const resourceUrl of resourceUrls) {
    if (isCrossOriginResource(resourceUrl, pageHref)) {
      external += 1;
    } else {
      local += 1;
    }
  }
  return { local, external };
}
