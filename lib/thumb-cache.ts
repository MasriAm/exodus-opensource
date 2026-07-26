/**
 * Bounded object-URL cache for archive media thumbs.
 * Evicts LRU when entry count or approximate byte budget is exceeded.
 */

const MAX_ENTRIES = 48;
const MAX_BYTES = 48 * 1024 * 1024;

type CacheEntry = {
  url: string;
  bytes: number;
  lastUsed: number;
};

const entries = new Map<string, CacheEntry>();
let totalBytes = 0;

function touch(path: string, entry: CacheEntry): string {
  entry.lastUsed = performance.now();
  entries.delete(path);
  entries.set(path, entry);
  return entry.url;
}

function evictOne(): void {
  let oldestPath: string | null = null;
  let oldestUsed = Number.POSITIVE_INFINITY;
  for (const [path, entry] of entries) {
    if (entry.lastUsed < oldestUsed) {
      oldestUsed = entry.lastUsed;
      oldestPath = path;
    }
  }
  if (oldestPath === null) {
    return;
  }
  const removed = entries.get(oldestPath);
  entries.delete(oldestPath);
  if (removed) {
    totalBytes = Math.max(0, totalBytes - removed.bytes);
    URL.revokeObjectURL(removed.url);
  }
}

function ensureBudget(additionalBytes: number): void {
  while (
    entries.size > 0 &&
    (entries.size >= MAX_ENTRIES || totalBytes + additionalBytes > MAX_BYTES)
  ) {
    evictOne();
  }
}

export function thumbCacheGet(path: string): string | null {
  const hit = entries.get(path);
  if (!hit) {
    return null;
  }
  return touch(path, hit);
}

export function thumbCacheSet(path: string, blob: Blob): string {
  const existing = entries.get(path);
  if (existing) {
    URL.revokeObjectURL(existing.url);
    totalBytes = Math.max(0, totalBytes - existing.bytes);
    entries.delete(path);
  }
  const bytes = blob.size;
  ensureBudget(bytes);
  const url = URL.createObjectURL(blob);
  const entry: CacheEntry = { url, bytes, lastUsed: performance.now() };
  entries.set(path, entry);
  totalBytes += bytes;
  return url;
}

/** Drop one path (e.g. caller wants exclusive ownership). */
export function thumbCacheForget(path: string): void {
  const existing = entries.get(path);
  if (!existing) {
    return;
  }
  entries.delete(path);
  totalBytes = Math.max(0, totalBytes - existing.bytes);
  URL.revokeObjectURL(existing.url);
}

export function thumbCacheClear(): void {
  for (const entry of entries.values()) {
    URL.revokeObjectURL(entry.url);
  }
  entries.clear();
  totalBytes = 0;
}
