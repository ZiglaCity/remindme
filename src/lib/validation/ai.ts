import { z } from "zod";
import { timeZoneSchema } from "../auth/policy";

export const parseInput = z
  .object({
    text: z.string().trim().min(1).max(4000),
    clarification: z
      .array(
        z
          .object({
            question: z.string().min(1).max(400),
            answer: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .max(5)
      .default([]),
  })
  .strict();

export const modelOutput = z
  .object({
    status: z.enum(["ready", "clarify"]),
    title: z.string().trim().min(1).max(160).nullable(),
    description: z.string().max(2000).nullable(),
    priority: z.enum(["low", "normal", "high"]).nullable(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    deadlineType: z.enum(["date_only", "date_time"]).nullable(),
    deadlineRelation: z.enum(["on_or_by", "before_date"]).nullable(),
    timeZone: timeZoneSchema.nullable(),
    question: z.string().trim().min(1).max(400).nullable(),
  })
  .strict();

export type ReminderDraft = {
  title: string;
  description: string | null;
  priority: "low" | "normal" | "high";
  deadline: {
    type: "date_only" | "date_time";
    date: string;
    time: string;
    timeZone: string;
  };
};
export type ParseResult =
  | { status: "ready"; draft: ReminderDraft; interpretation?: string }
  | { status: "clarify"; question: string };
