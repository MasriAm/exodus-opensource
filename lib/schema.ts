import { z } from "zod";

const timestampSchema = z.number().int();

const jsonStringSchema = z.string().refine(
  (value) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== undefined;
    } catch {
      return false;
    }
  },
  { message: "Expected a valid JSON string" },
);

export const messageRowSchema = z.strictObject({
  table: z.literal("messages"),
  platform: z.string(),
  conversation: z.string(),
  sender: z.string(),
  sent_at_ms: timestampSchema,
  text: z.string().nullable(),
  media_ref: z.string().nullable(),
});

export const mediaRowSchema = z.strictObject({
  table: z.literal("media"),
  platform: z.string(),
  zip_path: z.string(),
  kind: z.enum(["image", "video", "audio", "other"]),
  taken_at_ms: timestampSchema.nullable(),
  conversation: z.string().nullable(),
});

export const eventRowSchema = z.strictObject({
  table: z.literal("events"),
  platform: z.string(),
  kind: z.string(),
  occurred_at_ms: timestampSchema,
  payload: jsonStringSchema,
});

export const normalizedRowSchema = z.discriminatedUnion("table", [
  messageRowSchema,
  mediaRowSchema,
  eventRowSchema,
]);

export type MessageRow = z.infer<typeof messageRowSchema>;
export type MediaRow = z.infer<typeof mediaRowSchema>;
export type EventRow = z.infer<typeof eventRowSchema>;
export type NormalizedRow = z.infer<typeof normalizedRowSchema>;
