export const thresholds = [50, 75, 90, 100] as const;
export type Clock = () => Date;
export function reminderSchedule(
  row: {
    createdAt: Date;
    dueAt: Date;
    recurrence?: unknown;
    occurrenceAnchorAt?: Date | null;
    deadlineNotificationEnabled?: boolean;
  },
  now: Date,
) {
  return calculateSchedule(
    row.recurrence ? (row.occurrenceAnchorAt ?? row.createdAt) : row.createdAt,
    row.dueAt,
    now,
    row.deadlineNotificationEnabled ?? false,
  );
}
export function calculateSchedule(
  createdAt: Date,
  dueAt: Date,
  now: Date,
  includeDeadline = false,
) {
  if (![createdAt, dueAt, now].every((date) => Number.isFinite(date.getTime())))
    throw new Error("Schedule requires valid instants.");
  const anchor = BigInt(createdAt.getTime());
  const duration = BigInt(dueAt.getTime()) - anchor;
  if (duration <= 0n || dueAt <= now) return [];
  return thresholds
    .filter((threshold) => includeDeadline || threshold !== 100)
    .map((thresholdPercent) => ({
      thresholdPercent,
      scheduledFor: new Date(
        Number(anchor + (duration * BigInt(thresholdPercent)) / 100n),
      ),
    }))
    .filter((item) => item.scheduledFor > now);
}
