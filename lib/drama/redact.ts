/**
 * Share-safety helpers.
 *
 * Receipts is built to be screenshotted, and the thing being screenshotted is
 * somebody's real DM. Every exhibit therefore renders redacted first and only
 * un-redacts on a deliberate click, so nothing identifying is on screen by
 * default when a phone gets handed around.
 */

const BLOCK = "█";

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/gu;
/** 7+ digits with optional separators — long enough to be a phone number. */
const PHONE_PATTERN = /(?<![\w])\+?[\d][\d\s().-]{6,}\d(?![\w])/gu;
const HANDLE_PATTERN = /(?<![\w])@[\w.]{2,30}/gu;
const URL_PATTERN = /https?:\/\/\S+/gu;

function blocks(count: number): string {
  return BLOCK.repeat(Math.max(2, Math.min(count, 12)));
}

/**
 * Turn a message into a censored-document version of itself: letters and digits
 * become blocks, spacing and punctuation survive so the shape of the sentence
 * still reads. This is what an exhibit looks like before you ask to see it.
 */
export function maskToBlocks(value: string): string {
  return value.replace(/[\p{L}\p{N}]+/gu, (run) =>
    BLOCK.repeat(Math.min(Array.from(run).length, 14)),
  );
}

/** `Maya Khalil` → `M███ K█████`. Keeps the shape, loses the person. */
export function redactName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  return trimmed
    .split(/(\s+)/u)
    .map((part) => {
      if (/^\s+$/u.test(part) || part.length === 0) {
        return part;
      }
      const characters = Array.from(part);
      if (characters.length <= 1) {
        return part;
      }
      return `${characters[0]}${blocks(characters.length - 1)}`;
    })
    .join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Redact a message body: contact details always, plus any names supplied by
 * the caller (conversation titles and senders from the same archive).
 */
export function redactText(
  text: string,
  names: readonly string[] = [],
): string {
  let output = text
    .replace(URL_PATTERN, "███████")
    .replace(EMAIL_PATTERN, "█████@█████")
    .replace(PHONE_PATTERN, (match) => blocks(match.trim().length))
    .replace(HANDLE_PATTERN, (match) => `@${blocks(match.length - 1)}`);

  const uniqueNames = Array.from(
    new Set(
      names
        .flatMap((name) => name.split(/[\s_.-]+/u))
        .map((name) => name.trim())
        .filter((name) => Array.from(name).length >= 3),
    ),
  ).sort((left, right) => right.length - left.length);

  for (const name of uniqueNames) {
    output = output.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu"),
      (match) => redactName(match),
    );
  }

  return output;
}
