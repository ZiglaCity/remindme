import { eq } from "drizzle-orm";
import { reminders, scheduledNotifications } from "../lib/db/schema";
import type { Executor } from "./reminders";
import { cancelOutstanding } from "./reminders";
import { nextOccurrence } from "../services/scheduling/recurrence";
import { reminderSchedule } from "../services/scheduling/schedule";

// Caller holds the reminder lock. Cursor advance and next queue row commit together.
export async function advanceRecurring(
  tx: Executor,
  row: typeof reminders.$inferSelect,
  now: Date,
  reason: string,
) {
  if (!row.recurrence || row.status !== "active" || row.deletedAt) return row;
  await cancelOutstanding(tx, { userId: row.userId }, row.id, reason, now);
  const next = nextOccurrence(
    row.recurrence,
    row.timeZone,
    new Date(Math.max(now.getTime(), row.dueAt.getTime())),
  );
  const [updated] = await tx
    .update(reminders)
    .set({
      ...(next
        ? {
            dueAt: next.dueAt,
            dueDate: next.dueDate,
            occurrenceAnchorAt: next.previousAt ?? now,
          }
        : { status: "completed" as const, completedAt: now }),
      scheduleVersion: row.scheduleVersion + 1,
      revision: row.revision + 1,
      updatedAt: now,
    })
    .where(eq(reminders.id, row.id))
    .returning();
  // Retain due thresholds for the next future occurrence; normal claim coalescing
  // emits at most its latest due check-in after a long outage.
  const schedule = next
    ? reminderSchedule(updated, updated.occurrenceAnchorAt ?? now)
    : [];
  if (schedule.length)
    await tx.insert(scheduledNotifications).values(
      schedule.map((item) => ({
        ...item,
        reminderId: row.id,
        scheduleVersion: updated.scheduleVersion,
        createdAt: now,
        updatedAt: now,
      })),
    );
  return updated;
}
