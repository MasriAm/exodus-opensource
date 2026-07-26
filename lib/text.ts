const WINDOWS_1252_BYTES = new Map<string, number>([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

const MOJIBAKE_LEAD_CHARACTERS = new Set([
  "Â",
  "Ã",
  "Ð",
  "Ñ",
  "Ò",
  "Ó",
  "Ô",
  "Õ",
  "Ø",
  "Ù",
  "â",
  "ð",
]);

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function legacyByte(character: string): number | null {
  const windowsByte = WINDOWS_1252_BYTES.get(character);
  if (windowsByte !== undefined) {
    return windowsByte;
  }

  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && codePoint <= 0xff ? codePoint : null;
}

function mojibakeScore(value: string): number {
  let score = 0;

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (character === "\uFFFD") {
      score += 4;
    } else if (MOJIBAKE_LEAD_CHARACTERS.has(character)) {
      score += 2;
    } else if (
      codePoint !== undefined &&
      codePoint >= 0x80 &&
      codePoint <= 0x9f
    ) {
      score += 1;
    }
  }

  return score;
}

function repairLegacyRun(run: string): string {
  const bytes: number[] = [];

  for (const character of run) {
    const byte = legacyByte(character);
    if (byte === null) {
      return run;
    }
    bytes.push(byte);
  }

  let decoded: string;
  try {
    decoded = utf8Decoder.decode(new Uint8Array(bytes));
  } catch {
    return run;
  }

  return decoded !== run && mojibakeScore(decoded) < mojibakeScore(run)
    ? decoded
    : run;
}

function repairMojibakePass(value: string): string {
  let result = "";
  let legacyRun = "";

  const flushLegacyRun = () => {
    if (legacyRun.length > 0) {
      result += repairLegacyRun(legacyRun);
      legacyRun = "";
    }
  };

  for (const character of value) {
    if (legacyByte(character) !== null) {
      legacyRun += character;
    } else {
      flushLegacyRun();
      result += character;
    }
  }

  flushLegacyRun();
  return result;
}

/**
 * Repairs UTF-8 text that Instagram represented through a Latin-1/Windows-1252
 * byte string. A fatal decoder and a mojibake score keep already-correct text
 * unchanged; separate byte-compatible runs allow clean Arabic and emoji to
 * coexist with a damaged segment.
 */
export function fixMojibake(value: string): string {
  let repaired = value;

  for (let pass = 0; pass < 3; pass += 1) {
    const next = repairMojibakePass(repaired);
    if (next === repaired) {
      break;
    }
    repaired = next;
  }

  return repaired;
}

export const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "about",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "don",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "me",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  // Instagram / WhatsApp placeholder tokens (from "Sent an attachment." etc.)
  "sent",
  "attachment",
  "attachments",
  "message",
  "messages",
  "photo",
  "photos",
  "video",
  "videos",
  "audio",
  "gif",
  "gifs",
  "file",
  "files",
  "shared",
  "reacted",
  "liked",
  "unsent",
  "reel",
  "reels",
  "story",
  "stories",
  "post",
  "posts",
  "voice",
  "note",
  "notes",
  "call",
  "missed",
]);

export const ARABIC_STOPWORDS: ReadonlySet<string> = new Set([
  "أجل",
  "أحد",
  "أصبح",
  "أمام",
  "أن",
  "أنا",
  "أنت",
  "أنتم",
  "أنتن",
  "أو",
  "أولئك",
  "أي",
  "أين",
  "إذا",
  "إذ",
  "إلى",
  "إلا",
  "إن",
  "إنه",
  "اي",
  "اذا",
  "الى",
  "الا",
  "ان",
  "انه",
  "بعد",
  "بعض",
  "بل",
  "بها",
  "به",
  "بين",
  "تحت",
  "تكون",
  "تلك",
  "ثم",
  "حتى",
  "حول",
  "حيث",
  "حين",
  "خلال",
  "ذلك",
  "دون",
  "سوف",
  "عند",
  "على",
  "عليها",
  "عليه",
  "عن",
  "فإن",
  "فقط",
  "في",
  "فيها",
  "فيه",
  "كان",
  "كانت",
  "كما",
  "كل",
  "كلا",
  "لكن",
  "لدى",
  "لدي",
  "لذلك",
  "لم",
  "لن",
  "له",
  "لها",
  "لو",
  "ليس",
  "ما",
  "ماذا",
  "متى",
  "مع",
  "من",
  "منذ",
  "نحن",
  "نحو",
  "نفس",
  "هذا",
  "هذه",
  "هل",
  "هناك",
  "هو",
  "هي",
  "هنا",
  "هم",
  "هن",
  "ولا",
  "ولكن",
  "وما",
  "وهو",
  "وهي",
  "يا",
  "يكون",
  "يمكن",
]);

const TOKEN_PATTERN = /[\p{L}\p{M}\p{N}]+/gu;
const ARABIC_DIACRITICS_PATTERN =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

function normalizeToken(token: string): string {
  return token
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u0640/g, "")
    .replace(ARABIC_DIACRITICS_PATTERN, "");
}

/**
 * Produces normalized Arabic/English word tokens for aggregate word counts.
 * Punctuation and whitespace split words, one-character tokens and committed
 * stopwords are removed.
 */
export function tokenize(value: string): string[] {
  const matches = value.normalize("NFKC").match(TOKEN_PATTERN) ?? [];
  const tokens: string[] = [];

  for (const match of matches) {
    const token = normalizeToken(match);
    if (
      Array.from(token).length >= 2 &&
      !ENGLISH_STOPWORDS.has(token) &&
      !ARABIC_STOPWORDS.has(token)
    ) {
      tokens.push(token);
    }
  }

  return tokens;
}
