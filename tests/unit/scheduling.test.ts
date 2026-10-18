import { describe, expect, it } from "vitest";
import { resolveDeadline } from "../../src/services/scheduling/deadline";
import { calculateSchedule } from "../../src/services/scheduling/schedule";
import {
  createReminderInput,
  editReminderInput,
  paginationInput,
} from "../../src/lib/validation/reminders";
import { formatDeadline } from "../../src/lib/reminders/display";

const created = new Date("2026-10-20T18:00:00Z");
const due = new Date("2026-10-30T18:00:00Z");
describe("deadline interpretation", () => {
  it("preserves date-only intent and uses 23:59 in the supplied zone", () => {
    const result = resolveDeadline(
      {
        type: "date_only",
        date: "2026-10-30",
        timeZone: "America/Los_Angeles",
      },
      "UTC",
    );
    expect(result.dueAt.toISOString()).toBe("2026-10-31T06:59:00.000Z");
    expect(result.deadlineType).toBe("date_only");
    expect(result.dueDate).toBe("2026-10-30");
    expect(formatDeadline(result)).not.toMatch(/23:59|11:59/);
  });
  it("uses the default zone and handles a +14 hour date boundary", () => {
    expect(
      resolveDeadline(
        { type: "date_time", date: "2026-10-30", time: "01:00" },
        "Pacific/Kiritimati",
      ).dueAt.toISOString(),
    ).toBe("2026-10-29T11:00:00.000Z");
  });
  it.each(["2026-02-29", "2026-04-31", "0000-01-01"])(
    "rejects invalid calendar date %s",
    (date) => {
      expect(() => resolveDeadline({ type: "date_only", date }, "UTC")).toThrow(
        "valid calendar date",
      );
    },
  );
  it("accepts leap day and is independent of host time zone", () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      expect(
        resolveDeadline(
          { type: "date_time", date: "2028-02-29", time: "18:00" },
          "Africa/Accra",
        ).dueAt.toISOString(),
      ).toBe("2028-02-29T18:00:00.000Z");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
  it.each([
    ["2026-03-08", "02:30"],
    ["2026-11-01", "01:30"],
  ])("requires clarification for DST gap/overlap %s %s", (date, time) => {
    expect(() =>
      resolveDeadline(
        { type: "date_time", date, time, timeZone: "America/New_York" },
        "UTC",
      ),
    ).toThrow("clock change");
  });
  it("rejects an entirely skipped local date", () => {
    expect(() =>
      resolveDeadline(
        { type: "date_only", date: "2011-12-30", timeZone: "Pacific/Apia" },
        "UTC",
      ),
    ).toThrow("clock change");
  });
});
describe("threshold scheduling", () => {
  it("follows the formula, correcting the PRD's illustrative 75% arithmetic", () => {
    expect(
      calculateSchedule(created, due, created).map((item) => [
        item.thresholdPercent,
        item.scheduledFor.toISOString(),
      ]),
    ).toEqual([
      [50, "2026-10-25T18:00:00.000Z"],
      [75, "2026-10-28T06:00:00.000Z"],
      [90, "2026-10-29T18:00:00.000Z"],
    ]);
  });
  it("omits exact-now and passed thresholds when recalculating from the original anchor", () => {
    expect(
      calculateSchedule(created, due, new Date("2026-10-28T06:00:00Z")).map(
        (item) => item.thresholdPercent,
      ),
    ).toEqual([90]);
  });
  it("does not schedule overdue or nonpositive intervals", () => {
    expect(calculateSchedule(created, due, due)).toEqual([]);
    expect(
      calculateSchedule(created, new Date(created.getTime() - 1), created),
    ).toEqual([]);
  });
  it("rounds down to integer milliseconds and filters a very short interval", () => {
    expect(
      calculateSchedule(new Date(0), new Date(10), new Date(5)).map((item) =>
        item.scheduledFor.getTime(),
      ),
    ).toEqual([7, 9]);
    expect(calculateSchedule(new Date(0), new Date(1), new Date(0))).toEqual(
      [],
    );
  });
});
describe("strict reminder input limits", () => {
  const input = {
    title: "a",
    deadline: { type: "date_only", date: "2026-10-30" },
  };
  it("accepts maximum lengths and rejects over-limit or injected fields", () => {
    expect(
      createReminderInput.safeParse({
        ...input,
        title: "a".repeat(160),
        description: "a".repeat(2000),
        sourceText: "a".repeat(4000),
      }).success,
    ).toBe(true);
    for (const extra of [
      { title: "a".repeat(161) },
      { title: " " },
      { description: "a".repeat(2001) },
      { sourceText: "a".repeat(4001) },
      { userId: "other" },
      { status: "completed" },
      { priority: "urgent" },
    ])
      expect(
        createReminderInput.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
  });
  it("requires a time for time-specific input and a revision for edits", () => {
    expect(
      createReminderInput.safeParse({
        ...input,
        deadline: { type: "date_time", date: "2026-10-30" },
      }).success,
    ).toBe(false);
    expect(editReminderInput.safeParse({ title: "changed" }).success).toBe(
      false,
    );
    expect(editReminderInput.safeParse({ expectedRevision: 1 }).success).toBe(
      false,
    );
  });
  it("bounds pagination and rejects client ownership keys", () => {
    expect(paginationInput.parse({}).pageSize).toBe(20);
    expect(paginationInput.safeParse({ pageSize: 100 }).success).toBe(true);
    for (const value of [{ pageSize: 101 }, { page: 0 }, { userId: "other" }])
      expect(paginationInput.safeParse(value).success).toBe(false);
  });
});
