import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import type { Database, Owner } from "./preferences";
import {
  notificationAttempts,
  reminders,
  scheduledNotifications,
} from "../lib/db/schema";
import { AppError } from "../lib/http/errors";

export type Executor = Pick<Database, "select" | "insert" | "update">;
export const ownedReminder = (
  owner: Owner,
  id: string,
  includeDeleted = false,
) =>
  and(
    eq(reminders.id, id),
    eq(reminders.userId, owner.userId),
    ...(includeDeleted ? [] : [isNull(reminders.deletedAt)]),
  );
export async function lockReminder(
  db: Executor,
  owner: Owner,
  id: string,
  includeDeleted = false,
) {
  const [row] = await db
    .select()
    .from(reminders)
    .where(ownedReminder(owner, id, includeDeleted))
    .for("update");
  if (!row) throw new AppError(404, "not_found", "Reminder not found.");
  return row;
}
export async function readReminder(db: Executor, owner: Owner, id: string) {
  const [row] = await db
    .select()
    .from(reminders)
    .where(ownedReminder(owner, id));
  if (!row) throw new AppError(404, "not_found", "Reminder not found.");
  return row;
}
export async function listReminders(
  db: Executor,
  owner: Owner,
  status: "active" | "completed",
  page: number,
  pageSize: number,
) {
  const rows = await db
    .select({
      ...getTableColumns(reminders),
      nextNotificationAt:
        sql<Date | null>`(select min(coalesce(n.next_attempt_at, n.scheduled_for)) from scheduled_notifications n where n.reminder_id = ${reminders.id} and n.schedule_version = ${reminders.scheduleVersion} and n.status in ('pending','processing'))`.mapWith(
          {
            mapFromDriverValue: (value) =>
              value ? new Date(value as string) : null,
          },
        ),
    })
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, owner.userId),
        eq(reminders.status, status),
        isNull(reminders.deletedAt),
      ),
    )
    .orderBy(asc(reminders.dueAt), asc(reminders.createdAt), asc(reminders.id))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return {
    items: rows.slice(0, pageSize),
    page,
    pageSize,
    hasMore: rows.length > pageSize,
  };
}
export async function notificationHistory(
  db: Executor,
  owner: Owner,
  id: string,
) {
  await readReminder(db, owner, id);
  return db
    .select({
      id: scheduledNotifications.id,
      thresholdPercent: scheduledNotifications.thresholdPercent,
      scheduleVersion: scheduledNotifications.scheduleVersion,
      scheduledFor: scheduledNotifications.scheduledFor,
      status: scheduledNotifications.status,
      cancellationReason: scheduledNotifications.cancellationReason,
      sentAt: scheduledNotifications.sentAt,
    })
    .from(scheduledNotifications)
    .innerJoin(reminders, eq(scheduledNotifications.reminderId, reminders.id))
    .where(ownedReminder(owner, id))
    .orderBy(
      desc(scheduledNotifications.scheduleVersion),
      asc(scheduledNotifications.thresholdPercent),
      asc(scheduledNotifications.id),
    )
    .limit(100);
}
export async function attemptHistory(db: Executor, owner: Owner, id: string) {
  await readReminder(db, owner, id);
  return db
    .select({
      id: notificationAttempts.id,
      notificationId: notificationAttempts.notificationId,
      attemptedAt: notificationAttempts.attemptedAt,
      result: notificationAttempts.result,
      errorCategory: notificationAttempts.errorCategory,
    })
    .from(notificationAttempts)
    .innerJoin(
      scheduledNotifications,
      eq(notificationAttempts.notificationId, scheduledNotifications.id),
    )
    .innerJoin(reminders, eq(scheduledNotifications.reminderId, reminders.id))
    .where(ownedReminder(owner, id))
    .orderBy(
      desc(notificationAttempts.attemptedAt),
      desc(notificationAttempts.id),
    )
    .limit(100);
}
export async function cancelOutstanding(
  db: Executor,
  owner: Owner,
  id: string,
  reason: string,
  now: Date,
) {
  // Caller already holds the owned reminder row lock within the mutation transaction.
  await db
    .update(scheduledNotifications)
    .set({
      status: "cancelled",
      cancellationReason: reason,
      processingStartedAt: null,
      claimToken: null,
      nextAttemptAt: null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(
          scheduledNotifications.reminderId,
          db
            .select({ id: reminders.id })
            .from(reminders)
            .where(ownedReminder(owner, id)),
        ),
        inArray(scheduledNotifications.status, ["pending", "processing"]),
      ),
    );
}
