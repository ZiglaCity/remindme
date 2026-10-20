import { z } from "zod";

export const recurrenceInput = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1).max(365).default(1),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    monthDay: z.number().int().min(1).max(31).nullable().default(null),
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
  })
  .strict();
export type Recurrence = z.infer<typeof recurrenceInput>;
// Anchor fields are derived server-side, never accepted in a client mutation.
export type StoredRecurrence = Recurrence & {
  anchorDate: string;
  localTime: string;
};
