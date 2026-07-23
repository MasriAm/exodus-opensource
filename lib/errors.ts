export function friendlyError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.toLocaleLowerCase();

  // Specific worker messages first — many contain the word "archive".
  if (
    message.includes("not a recognized") ||
    message.includes("no supported whatsapp") ||
    message.includes("recogn") ||
    message.includes("parser") ||
    message.includes("platform")
  ) {
    return "This archive is not a recognized Instagram or WhatsApp export.";
  }
  if (message.includes("could not be safely imported")) {
    return "This archive contains data that could not be safely imported.";
  }
  if (
    message.includes("import an archive before") ||
    message.includes("before opening media")
  ) {
    return "Import an archive first, then open media or Wrapped.";
  }
  if (
    message.includes("password") ||
    message.includes("signature") ||
    message.includes("corrupt") ||
    message.includes("damaged") ||
    (message.includes("zip") &&
      (message.includes("open") ||
        message.includes("read") ||
        message.includes("invalid") ||
        message.includes("closed")))
  ) {
    return "This ZIP could not be opened. It may be damaged or password-protected.";
  }
  if (message.includes("memory") || message.includes("allocation")) {
    return "The browser ran out of memory while reading this export. Close other tabs and try again.";
  }

  return fallback;
}
