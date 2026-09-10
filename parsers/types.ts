import type { ZipEntryMap } from "../lib/zip";
import type { NormalizedRow } from "../lib/schema";

export interface ParserProgress {
  done: number;            // rows emitted so far
  label: string;           // "Parsing messages…"
}

export interface DetectContext {
  /**
   * The uploaded file's own name.
   *
   * Split exports need this: Snapchat hands out `mydata~<id>-3.zip` parts that
   * hold nothing but media, so the archive name is the only thing in them that
   * still says which app they came from.
   */
  fileName?: string;
}

export interface DataParser {
  id: string;              // "instagram"
  displayName: string;     // "Instagram"
  /** Return true iff this parser recognizes the archive from its shape. */
  detect(entryPaths: string[], context?: DetectContext): boolean;
  /** Read entries via the map, emit normalized rows in batches of <= 2000. */
  parse(
    entries: ZipEntryMap,
    emit: (batch: NormalizedRow[]) => Promise<void>,
    progress: (p: ParserProgress) => void
  ): Promise<void>;
}
