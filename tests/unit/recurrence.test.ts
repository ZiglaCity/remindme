import { describe, expect, it } from "vitest";
import {
  prepareRecurrence,
  nextOccurrence,
} from "../../src/services/scheduling/recurrence";
import { recurrenceInput } from "../../src/lib/validation/recurrence";

const deadline = {
  type: "date_time" as const,
  date: "2026-10-25",
  time: "14:00",
  timeZone: "America/New_York",
};
describe("calendar recurrence", () => {
  it("preserves Sunday 2 PM across DST and retains a fresh period anchor", () => {
    const rule = prepareRecurrence(
      recurrenceInput.parse({ frequency: "weekly", weekdays: [7] }),
      deadline,
    )!;
    const next = nextOccurrence(
      rule,
      deadline.timeZone,
      new Date("2026-10-25T18:00Z"),
    )!;
    expect(next.dueAt.toISOString()).toBe("2026-11-01T19:00:00.000Z");
    expect(next.previousAt?.toISOString()).toBe("2026-10-25T18:00:00.000Z");
    const later = nextOccurrence(
      rule,
      deadline.timeZone,
      new Date("2030-10-20T23:00Z"),
    )!;
    expect(later.dueAt > new Date("2030-10-20T23:00Z")).toBe(true);
    expect(later.previousAt! < later.dueAt).toBe(true);
  });
  it("restores monthly day 31 after short months and honors an inclusive end", () => {
    const rule = prepareRecurrence(
      recurrenceInput.parse({ frequency: "monthly", endsOn: "2028-03-31" }),
      { ...deadline, date: "2028-01-31" },
    )!;
    expect(
      nextOccurrence(rule, "UTC", new Date("2028-01-31T14:00Z"))?.dueDate,
    ).toBe("2028-02-29");
    expect(
      nextOccurrence(rule, "UTC", new Date("2028-02-29T14:00Z"))?.dueDate,
    ).toBe("2028-03-31");
    expect(
      nextOccurrence(rule, "UTC", new Date("2028-03-31T14:00Z")),
    ).toBeNull();
  });
  it("handles multiple weekdays, intervals and DST gaps without duplicating an occurrence", () => {
    const rule = prepareRecurrence(
      recurrenceInput.parse({
        frequency: "weekly",
        interval: 2,
        weekdays: [3, 1, 3],
      }),
      { ...deadline, date: "2026-10-19" },
    )!;
    expect(rule.weekdays).toEqual([1, 3]);
    expect(
      nextOccurrence(rule, "UTC", new Date("2026-10-21T14:00Z"))?.dueDate,
    ).toBe("2026-11-02");
    const gapRule = prepareRecurrence(
      recurrenceInput.parse({ frequency: "daily" }),
      { ...deadline, date: "2027-03-13", time: "02:30" },
    )!;
    expect(
      nextOccurrence(
        gapRule,
        "America/New_York",
        new Date("2027-03-13T07:30Z"),
      )?.dueAt.toISOString(),
    ).toBe("2027-03-14T07:30:00.000Z");
    expect(
      nextOccurrence(
        gapRule,
        "America/New_York",
        new Date("2027-03-14T07:30Z"),
      )?.dueAt.toISOString(),
    ).toBe("2027-03-15T06:30:00.000Z");
    expect(() =>
      prepareRecurrence(
        recurrenceInput.parse({ frequency: "weekly", weekdays: [1] }),
        deadline,
      ),
    ).toThrow("first date");
  });
});
