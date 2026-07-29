import { instagramParser } from "./instagram";
import { facebookParser } from "./facebook";
import type { DataParser } from "./types";
import { whatsappParser } from "./whatsapp";

export const parsers: DataParser[] = [instagramParser, facebookParser, whatsappParser];

export function detectParser(entryPaths: string[]): DataParser | null {
  return parsers.find((parser) => parser.detect(entryPaths)) ?? null;
}
