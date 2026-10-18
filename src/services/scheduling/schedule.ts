export const thresholds = [50, 75, 90] as const;
export type Clock = () => Date;
export function calculateSchedule(createdAt: Date, dueAt: Date, now: Date) {
  if (![createdAt, dueAt, now].every((date) => Number.isFinite(date.getTime())))
    throw new Error("Schedule requires valid instants.");
  const anchor = BigInt(createdAt.getTime());
  const duration = BigInt(dueAt.getTime()) - anchor;
  if (duration <= 0n || dueAt <= now) return [];
  return thresholds
    .map((thresholdPercent) => ({
      thresholdPercent,
      scheduledFor: new Date(
        Number(anchor + (duration * BigInt(thresholdPercent)) / 100n),
      ),
    }))
    .filter((item) => item.scheduledFor > now);
}
