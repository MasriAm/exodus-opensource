import { describe, expect, it } from "vitest";

import { normalizedRowSchema } from "../lib/schema";
import { fixMojibake, tokenize } from "../lib/text";

describe("core text normalization", () => {
  it("repairs Instagram Arabic mojibake without damaging clean text", () => {
    expect(fixMojibake("Ù…Ø±Ø­Ø¨Ø§")).toBe("مرحبا");
    expect(fixMojibake("plain ASCII")).toBe("plain ASCII");
    expect(fixMojibake("مرحبا بالعالم")).toBe("مرحبا بالعالم");
    expect(fixMojibake("café")).toBe("café");
    expect(fixMojibake("Clean مرحبا + Ù…Ø±Ø­Ø¨Ø§ 😊")).toBe(
      "Clean مرحبا + مرحبا 😊",
    );
  });

  it("tokenizes Arabic and English while filtering committed stopwords", () => {
    expect(
      tokenize(
        "The QUICK, brown fox! في البيت الجميل، and مرحبًا مرحباً 3 a",
      ),
    ).toEqual([
      "quick",
      "brown",
      "fox",
      "البيت",
      "الجميل",
      "مرحبا",
      "مرحبا",
    ]);
  });
});

describe("normalized row schemas", () => {
  it("accepts each normalized row variant", () => {
    const rows: unknown[] = [
      {
        table: "messages",
        platform: "instagram",
        conversation: "friends",
        sender: "علي",
        sent_at_ms: 1_700_000_000_000,
        text: "مرحبا",
        media_ref: null,
      },
      {
        table: "media",
        platform: "whatsapp",
        zip_path: "omitted://example",
        kind: "image",
        taken_at_ms: null,
        conversation: "_chat.txt",
      },
      {
        table: "events",
        platform: "instagram",
        kind: "follower",
        occurred_at_ms: 1_700_000_000_000,
        payload: '{"name":"سارة"}',
      },
    ];

    for (const row of rows) {
      expect(normalizedRowSchema.safeParse(row).success).toBe(true);
    }
  });

  it("rejects extra fields, unsupported media kinds, and invalid JSON", () => {
    expect(
      normalizedRowSchema.safeParse({
        table: "messages",
        platform: "instagram",
        conversation: "friends",
        sender: "Ali",
        sent_at_ms: 1,
        text: null,
        media_ref: null,
        extra: true,
      }).success,
    ).toBe(false);

    expect(
      normalizedRowSchema.safeParse({
        table: "media",
        platform: "instagram",
        zip_path: "photo.jpg",
        kind: "document",
        taken_at_ms: null,
        conversation: null,
      }).success,
    ).toBe(false);

    expect(
      normalizedRowSchema.safeParse({
        table: "events",
        platform: "instagram",
        kind: "follower",
        occurred_at_ms: 1,
        payload: "{broken",
      }).success,
    ).toBe(false);
  });
});
