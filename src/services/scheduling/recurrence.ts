import { Temporal } from "@js-temporal/polyfill";
import type {
  Recurrence,
  StoredRecurrence,
} from "../../lib/validation/recurrence";
import type { DeadlineInput } from "../../lib/validation/reminders";
import { AppError } from "../../lib/http/errors";

export function prepareRecurrence(
  rule: Recurrence | null | undefined,
  deadline: DeadlineInput,
): StoredRecurrence | null {
  if (!rule) return null;
  try {
    const date = Temporal.PlainDate.from(deadline.date, { overflow: "reject" });
    const weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);
    if (rule.frequency === "weekly" && !weekdays.length)
      weekdays.push(date.dayOfWeek);
    if (rule.frequency === "weekly" && !weekdays.includes(date.dayOfWeek))
      throw new AppError(
        400,
        "invalid_recurrence",
        "The first date must fall on one of the selected weekdays.",
      );
    if (rule.frequency !== "weekly" && weekdays.length)
      throw new AppError(
        400,
        "invalid_recurrence",
        "Select weekdays only for weekly repeats.",
      );
    const monthDay =
      rule.frequency === "monthly" ? (rule.monthDay ?? date.day) : null;
    if (rule.frequency !== "monthly" && rule.monthDay !== null)
      throw new AppError(
        400,
        "invalid_recurrence",
        "Choose a day of month only for monthly repeats.",
      );
    if (monthDay && date.day !== Math.min(monthDay, date.daysInMonth))
      throw new AppError(
        400,
        "invalid_recurrence",
        `The first date must use day ${monthDay}, or the last day of a shorter month.`,
      );
    if (
      rule.endsOn &&
      Temporal.PlainDate.compare(
        Temporal.PlainDate.from(rule.endsOn, { overflow: "reject" }),
        date,
      ) < 0
    )
      throw new Error();
    return {
      ...rule,
      weekdays,
      monthDay,
      anchorDate: deadline.date,
      localTime: deadline.type === "date_only" ? "23:59" : deadline.time,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      "invalid_recurrence",
      "Choose valid repeat dates, with the end date on or after the first date.",
    );
  }
}

// Calendar arithmetic jumps near `after`; it never replays years of missed dates.
export function nextOccurrence(
  rule: StoredRecurrence,
  timeZone: string,
  after: Date,
) {
  const anchor = Temporal.PlainDate.from(rule.anchorDate);
  const local = Temporal.Instant.fromEpochMilliseconds(after.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
  const target = Temporal.PlainDate.compare(local, anchor) < 0 ? anchor : local;
  const days = anchor.until(target).days;
  const monthDifference =
    (target.year - anchor.year) * 12 + target.month - anchor.month;
  const monday = anchor.subtract({ days: anchor.dayOfWeek - 1 });
  const week = Math.floor(monday.until(target).days / 7);
  const start =
    rule.frequency === "daily"
      ? Math.floor(days / rule.interval)
      : rule.frequency === "monthly"
        ? Math.floor(monthDifference / rule.interval)
        : Math.floor(week / rule.interval);
  let previousAt: Date | null = null;
  for (
    let cycle = Math.max(0, start - 1);
    cycle <= Math.max(0, start) + 2;
    cycle++
  ) {
    let dates: Temporal.PlainDate[];
    try {
      dates =
        rule.frequency === "daily"
          ? [anchor.add({ days: cycle * rule.interval })]
          : rule.frequency === "monthly"
            ? [
                anchor
                  .add(
                    { months: cycle * rule.interval },
                    { overflow: "constrain" },
                  )
                  .with(
                    { day: rule.monthDay ?? anchor.day },
                    { overflow: "constrain" },
                  ),
              ]
            : rule.weekdays.map((day) =>
                monday.add({ weeks: cycle * rule.interval, days: day - 1 }),
              );
    } catch {
      return null;
    }
    for (const date of dates) {
      if (
        date.year > 9999 ||
        (rule.endsOn &&
          Temporal.PlainDate.compare(
            date,
            Temporal.PlainDate.from(rule.endsOn),
          ) > 0)
      )
        return null;
      if (Temporal.PlainDate.compare(date, anchor) < 0) continue;
      // Future DST gaps move forward; overlaps select the earlier instant once.
      const zoned = date
        .toPlainDateTime(rule.localTime)
        .toZonedDateTime(timeZone, { disambiguation: "compatible" });
      if (zoned.epochMilliseconds > after.getTime())
        return {
          dueAt: new Date(zoned.epochMilliseconds),
          dueDate: date.toString(),
          previousAt,
        };
      previousAt = new Date(zoned.epochMilliseconds);
    }
  }
  return null;
}
