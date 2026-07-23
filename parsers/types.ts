import type { ZipEntryMap } from "../lib/zip";
import type { NormalizedRow } from "../lib/schema";

export interface ParserProgress {
  done: number;            // rows emitted so far
  label: string;           // "Parsing messages…"
}

export interface DataParser {
  id: string;              // "instagram"
  displayName: string;     // "Instagram"
  /** Return true iff this parser recognizes the archive from entry paths alone. */
  detect(entryPaths: string[]): boolean;
  /** Read entries via the map, emit normalized rows in batches of <= 2000. */
  parse(
    entries: ZipEntryMap,
    emit: (batch: NormalizedRow[]) => Promise<void>,
    progress: (p: ParserProgress) => void
  ): Promise<void>;
}
