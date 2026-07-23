import { describe, expect, it } from "vitest";

import { friendlyError } from "../lib/errors";

describe("friendlyError", () => {
  it("prefers unrecognized-export messaging over generic ZIP damage", () => {
    expect(
      friendlyError(
        new Error("This archive is not a recognized Instagram or WhatsApp export."),
      ),
    ).toBe("This archive is not a recognized Instagram or WhatsApp export.");
  });

  it("keeps safe-import and media-gate messages distinct", () => {
    expect(
      friendlyError(
        new Error("This archive contains data that could not be safely imported."),
      ),
    ).toBe("This archive contains data that could not be safely imported.");
    expect(
      friendlyError(new Error("Import an archive before opening media.")),
    ).toBe("Import an archive first, then open media or Wrapped.");
  });

  it("maps damaged ZIP signatures to the password/damage copy", () => {
    expect(friendlyError(new Error("Invalid zip signature"))).toBe(
      "This ZIP could not be opened. It may be damaged or password-protected.",
    );
  });
});
