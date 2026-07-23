/**
 * Parse grown-up search tokens into structured fields + free text.
 * Tokens: from: in: before: after: has:media
 */

export type ParsedSearchQuery = {
  freeText: string;
  from: string | null;
  conversation: string | null;
  beforeMs: number | null;
  afterMs: number | null;
  hasMedia: boolean;
};

const TOKEN_RE =
  /(?:^|\s)(from|in|before|after|has):(?:"([^"]+)"|(\S+))/gi;

function parseDateToken(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return Date.UTC(Number(trimmed), 0, 1);
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [year, month] = trimmed.split("-").map(Number);
    return Date.UTC(year, month - 1, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const input = raw.trim();
  let from: string | null = null;
  let conversation: string | null = null;
  let beforeMs: number | null = null;
  let afterMs: number | null = null;
  let hasMedia = false;

  const freeParts: string[] = [];
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null = TOKEN_RE.exec(input);

  while (match) {
    const matchStart = match.index + (match[0].startsWith(" ") ? 1 : 0);
    if (matchStart > lastIndex) {
      freeParts.push(input.slice(lastIndex, matchStart));
    }
    const key = match[1].toLowerCase();
    const value = (match[2] ?? match[3] ?? "").trim();
    if (key === "from" && value) {
      from = value;
    } else if (key === "in" && value) {
      conversation = value;
    } else if (key === "before" && value) {
      beforeMs = parseDateToken(value);
    } else if (key === "after" && value) {
      afterMs = parseDateToken(value);
    } else if (key === "has" && value.toLowerCase() === "media") {
      hasMedia = true;
    } else {
      freeParts.push(match[0].trimStart());
    }
    lastIndex = TOKEN_RE.lastIndex;
    match = TOKEN_RE.exec(input);
  }

  if (lastIndex < input.length) {
    freeParts.push(input.slice(lastIndex));
  }

  return {
    freeText: freeParts.join(" ").replace(/\s+/g, " ").trim(),
    from,
    conversation,
    beforeMs,
    afterMs,
    hasMedia,
  };
}
