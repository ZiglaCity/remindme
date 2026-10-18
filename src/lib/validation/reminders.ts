import { z } from "zod";
import { timeZoneSchema } from "../auth/policy";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const time = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d$/,
    "Choose a time using hours and minutes.",
  );
export const deadlineInput = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("date_only"),
      date,
      timeZone: timeZoneSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("date_time"),
      date,
      time,
      timeZone: timeZoneSchema.optional(),
    })
    .strict(),
]);
export const createReminderInput = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(2000).nullable().optional(),
    sourceText: z.string().max(4000).nullable().optional(),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    deadline: deadlineInput,
  })
  .strict();
export const editReminderInput = z
  .object({
    expectedRevision: z.number().int().positive(),
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(2000).nullable().optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    deadline: deadlineInput.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "expectedRevision"),
    "Supply a change.",
  );
export const actionInput = z
  .object({ expectedRevision: z.number().int().positive().optional() })
  .strict();
export const reminderIdInput = z.string().uuid();
export const paginationInput = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type DeadlineInput = z.infer<typeof deadlineInput>;
export type CreateReminderInput = z.infer<typeof createReminderInput>;
export type EditReminderInput = z.infer<typeof editReminderInput>;
