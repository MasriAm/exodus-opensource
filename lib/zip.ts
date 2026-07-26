import {
  BlobReader,
  BlobWriter,
  TextWriter,
  ZipReader,
  getMimeType,
  type FileEntry,
} from "@zip.js/zip.js";

function normalizePath(path: string): string {
  const segments = path.replace(/\\/g, "/").split("/");
  const normalized: string[] = [];

  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === ".." || segment.includes("\0")) {
      throw new Error(`Unsafe ZIP entry path: ${path}`);
    }
    normalized.push(segment);
  }

  if (normalized.length === 0) {
    throw new Error(`Invalid empty ZIP entry path: ${path}`);
  }

  return normalized.join("/");
}

function buildWrapperAliases(
  entries: ReadonlyMap<string, FileEntry>,
): ReadonlyMap<string, FileEntry> {
  const candidates = new Map<string, FileEntry | null>();

  for (const [path, entry] of entries) {
    const separatorIndex = path.indexOf("/");
    if (separatorIndex < 0) {
      continue;
    }

    const alias = path.slice(separatorIndex + 1);
    const exactEntry = entries.get(alias);
    if (exactEntry !== undefined && exactEntry !== entry) {
      candidates.set(alias, null);
      continue;
    }

    const prior = candidates.get(alias);
    candidates.set(alias, prior === undefined || prior === entry ? entry : null);
  }

  const aliases = new Map<string, FileEntry>();
  for (const [alias, entry] of candidates) {
    if (entry !== null) {
      aliases.set(alias, entry);
    }
  }
  return aliases;
}

/**
 * Random-access facade over zip.js metadata. Opening an archive reads only its
 * central directory; individual files are decompressed when readText/readBlob
 * is called.
 */
export class ZipEntryMap {
  private closed = false;

  private constructor(
    private readonly reader: ZipReader<Blob>,
    private readonly entries: ReadonlyMap<string, FileEntry>,
    private readonly aliases: ReadonlyMap<string, FileEntry>,
    private readonly entryPaths: readonly string[],
  ) {}

  static async fromBlob(blob: Blob): Promise<ZipEntryMap> {
    const reader = new ZipReader(new BlobReader(blob), {
      useWebWorkers: false,
    });

    try {
      const zipEntries = await reader.getEntries({ strictness: "balanced" });
      const entries = new Map<string, FileEntry>();

      for (const entry of zipEntries) {
        if (entry.directory) {
          continue;
        }

        const path = normalizePath(entry.filename);
        if (entries.has(path)) {
          throw new Error(`ZIP contains a duplicate entry path: ${path}`);
        }
        entries.set(path, entry);
      }

      const entryPaths = Array.from(entries.keys()).sort((left, right) =>
        left.localeCompare(right, "en"),
      );

      return new ZipEntryMap(
        reader,
        entries,
        buildWrapperAliases(entries),
        entryPaths,
      );
    } catch (error: unknown) {
      try {
        await reader.close();
      } catch {
        // Preserve the archive-opening error.
      }
      throw error;
    }
  }

  static async open(blob: Blob): Promise<ZipEntryMap> {
    return ZipEntryMap.fromBlob(blob);
  }

  paths(): string[] {
    return [...this.entryPaths];
  }

  /** Uncompressed size when the ZIP central directory provides it; else null. */
  entrySize(path: string): number | null {
    const entry = this.resolve(path);
    const size = entry.uncompressedSize;
    return typeof size === "number" && Number.isFinite(size) ? size : null;
  }

  async readText(path: string, options?: { maxBytes?: number }): Promise<string> {
    const entry = this.resolve(path);
    const maxBytes = options?.maxBytes;
    if (maxBytes !== undefined) {
      const size = entry.uncompressedSize;
      if (typeof size === "number" && size > maxBytes) {
        throw new Error(
          `ZIP entry too large to load into memory (${size} bytes > ${maxBytes}): ${path}`,
        );
      }
    }
    return entry.getData(new TextWriter("utf-8"), {
      checkSignature: true,
      useWebWorkers: false,
    });
  }

  async readBlob(path: string, options?: { maxBytes?: number }): Promise<Blob> {
    const entry = this.resolve(path);
    const maxBytes = options?.maxBytes;
    if (maxBytes !== undefined) {
      const size = entry.uncompressedSize;
      if (typeof size === "number" && size > maxBytes) {
        throw new Error(
          `ZIP entry too large to load into memory (${size} bytes > ${maxBytes}): ${path}`,
        );
      }
    }
    return entry.getData(new BlobWriter(getMimeType(entry.filename)), {
      checkSignature: true,
      useWebWorkers: false,
    });
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      await this.reader.close();
    }
  }

  private resolve(requestedPath: string): FileEntry {
    if (this.closed) {
      throw new Error("Cannot read from a closed ZIP archive");
    }

    const path = normalizePath(requestedPath);
    const entry = this.entries.get(path) ?? this.aliases.get(path);
    if (entry === undefined) {
      throw new Error(`ZIP entry not found: ${requestedPath}`);
    }
    return entry;
  }
}

export async function openZip(blob: Blob): Promise<ZipEntryMap> {
  return ZipEntryMap.fromBlob(blob);
}
