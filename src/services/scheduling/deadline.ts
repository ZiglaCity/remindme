import { Temporal } from "@js-temporal/polyfill";
import type { DeadlineInput } from "../../lib/validation/reminders";
import { AppError } from "../../lib/http/errors";

export function resolveDeadline(input: DeadlineInput, defaultZone: string) {
  const timeZone = input.timeZone ?? defaultZone;
  let local: Temporal.PlainDateTime;
  try {
    const date = Temporal.PlainDate.from(input.date, { overflow: "reject" });
    if (date.year < 1 || date.year > 9999) throw new RangeError();
    local = date.toPlainDateTime(
      input.type === "date_only" ? "23:59" : input.time,
    );
  } catch {
    throw new AppError(
      400,
      "invalid_deadline",
      "Choose a valid calendar date and time.",
    );
  }
  try {
    const zoned = local.toZonedDateTime(timeZone, { disambiguation: "reject" });
    return {
      dueAt: new Date(zoned.epochMilliseconds),
      dueDate: input.date,
      deadlineType: input.type,
      timeZone,
    };
  } catch {
    throw new AppError(
      400,
      "deadline_clarification",
      "This local time is missing or occurs twice because of a clock change. Choose another time or an explicit time zone such as UTC.",
    );
  }
}
export function deadlineFields(reminder: {
  dueAt: Date | string;
  dueDate: string;
  deadlineType: "date_only" | "date_time";
  timeZone: string;
}) {
  const zoned = Temporal.Instant.from(
    new Date(reminder.dueAt).toISOString(),
  ).toZonedDateTimeISO(reminder.timeZone);
  return {
    type: reminder.deadlineType,
    date: reminder.dueDate,
    time: `${String(zoned.hour).padStart(2, "0")}:${String(zoned.minute).padStart(2, "0")}`,
    timeZone: reminder.timeZone,
  };
}
