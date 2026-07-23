import { instagramParser } from "./instagram";
import type { DataParser } from "./types";
import { whatsappParser } from "./whatsapp";

export const parsers: DataParser[] = [instagramParser, whatsappParser];

export function detectParser(entryPaths: string[]): DataParser | null {
  return parsers.find((parser) => parser.detect(entryPaths)) ?? null;
}
