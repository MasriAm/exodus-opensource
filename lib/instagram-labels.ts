/**
 * Instagram inbox folders look like `username_12345678901234567`.
 * Prefer the handle; drop the trailing numeric id for display and storage.
 * Exception: "Instagram User" deleted/blocked threads keep the id so they
 * don't collapse into one conversation.
 */

const FOLDER_ID_SUFFIX = /_(\d{6,})$/u;

/** Strip a trailing Instagram folder id (`name_23924…` → `name`). */
export function stripInstagramFolderId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return trimmed.replace(FOLDER_ID_SUFFIX, "");
}

function isInstagramUserLabel(value: string): boolean {
  const key = value.trim().toLocaleLowerCase().replace(/[_\s]+/g, " ");
  return (
    key === "instagram user" ||
    key === "instagramuser" ||
    /^instagram user(?: \d+)?$/u.test(key)
  );
}

/**
 * Key used in DuckDB for a conversation. Strips folder ids for normal
 * handles; keeps the full folder name for deleted "Instagram User" threads.
 */
export function conversationStorageKey(folderName: string): string {
  const trimmed = folderName.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const stripped = stripInstagramFolderId(trimmed);
  if (isInstagramUserLabel(stripped)) {
    return trimmed;
  }
  return stripped;
}

/**
 * Friendly label for inbox folders / titles.
 * Deleted or blocked accounts often appear as "Instagram User".
 */
export function displayConversationLabel(value: string): string {
  const stripped = stripInstagramFolderId(value);
  if (isInstagramUserLabel(stripped) || isInstagramUserLabel(value)) {
    return "Deleted account";
  }
  return stripped;
}

/** True when Instagram used a system / log-style DM placeholder as content. */
export function isInstagramSystemMessage(content: string | null | undefined): boolean {
  if (content === null || content === undefined) {
    return false;
  }
  const text = content.trim();
  if (text.length === 0) {
    return false;
  }
  const lower = text.toLocaleLowerCase();

  if (
    /^(?:[^:]{1,80}\s)?(?:sent|shared)\s+(?:an?\s+)?(?:attachment|photo|video|audio|gif|file|post|reel|story|link|voice message|voice note)/i.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /^(?:you\s+)?(?:sent|shared)\s+(?:an?\s+)?(?:attachment|photo|video|audio|gif|file|post|reel|story|link)/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    lower.includes("liked a message") ||
    lower.includes("reacted to your message") ||
    lower.includes("reacted to a message") ||
    lower.includes("changed the group photo") ||
    lower.includes("named the group") ||
    lower.includes("turned on disappearing messages") ||
    lower.includes("turned off disappearing messages") ||
    lower.startsWith("you missed a") ||
    lower.includes("started a call") ||
    lower.includes("ended the call") ||
    lower.includes("is now a follower") ||
    lower.includes("this message was unsent") ||
    lower.includes("this message was deleted")
  ) {
    return true;
  }

  return false;
}
