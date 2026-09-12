import { instagramParser } from "./instagram";
import { facebookParser } from "./facebook";
import { snapchatParser } from "./snapchat";
import type { DataParser, DetectContext } from "./types";
import { whatsappParser } from "./whatsapp";

export const parsers: DataParser[] = [
  instagramParser,
  facebookParser,
  snapchatParser,
  whatsappParser,
];

export function detectParser(
  entryPaths: string[],
  context?: DetectContext,
): DataParser | null {
  return parsers.find((parser) => parser.detect(entryPaths, context)) ?? null;
}
