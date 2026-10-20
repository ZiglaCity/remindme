import { reminders, scheduledNotifications } from "../../lib/db/schema";
import {
  createReminderInput,
  editReminderInput,
  actionInput,
  reminderIdInput,
} from "../../lib/validation/reminders";
import { AppError } from "../../lib/http/errors";
import {
  cancelOutstanding,
  lockReminder,
  ownedReminder,
} from "../../repositories/reminders";
import {
  readPreferences,
  type Database,
  type Owner,
} from "../../repositories/preferences";
import { resolveDeadline, deadlineFields } from "../scheduling/deadline";
import { reminderSchedule, type Clock } from "../scheduling/schedule";
import { prepareRecurrence, nextOccurrence } from "../scheduling/recurrence";
import type { z } from "zod";

function validated<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      400,
      "invalid_input",
      result.error.issues[0]?.message ?? "Check the reminder fields.",
    );
  return result.data;
}
function checkRevision(row: { revision: number }, expected?: number) {
  if (expected !== undefined && row.revision !== expected)
    throw new AppError(
      409,
      "conflict",
      "This reminder changed. Reload it before saving your changes.",
    );
}
export function createReminderService(
  db: Database,
  clock: Clock = () => new Date(),
) {
  return {
    async create(owner: Owner, raw: unknown) {
      const input = validated(createReminderInput, raw);
      const preferences = await readPreferences(db, owner);
      const deadline = resolveDeadline(input.deadline, preferences.timeZone);
      const recurrence = prepareRecurrence(input.recurrence, input.deadline);
      return db.transaction(async (tx) => {
        const now = clock();
        if (recurrence && deadline.dueAt <= now)
          throw new AppError(
            400,
            "invalid_recurrence",
            "Choose a future first occurrence for this repeating reminder.",
          );
        const [row] = await tx
          .insert(reminders)
          .values({
            userId: owner.userId,
            title: input.title,
            description: input.description ?? null,
            sourceText: input.sourceText ?? null,
            priority: input.priority,
            recurrence,
            occurrenceAnchorAt: recurrence ? now : null,
            ...deadline,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const schedule = reminderSchedule(row, now);
        if (schedule.length)
          await tx.insert(scheduledNotifications).values(
            schedule.map((item) => ({
              ...item,
              reminderId: row.id,
              scheduleVersion: row.scheduleVersion,
              createdAt: now,
              updatedAt: now,
            })),
          );
        return row;
      });
    },
    async edit(owner: Owner, id: string, raw: unknown) {
      validated(reminderIdInput, id);
      const input = validated(editReminderInput, raw);
      return db.transaction(async (tx) => {
        const row = await lockReminder(tx, owner, id);
        checkRevision(row, input.expectedRevision);
        const now = clock();
        const deadline = input.deadline
          ? resolveDeadline(input.deadline, row.timeZone)
          : null;
        const deadlineChanged = Boolean(
          deadline &&
          (deadline.dueAt.getTime() !== row.dueAt.getTime() ||
            deadline.dueDate !== row.dueDate ||
            deadline.deadlineType !== row.deadlineType ||
            deadline.timeZone !== row.timeZone),
        );
        let recurrence =
          input.recurrence !== undefined || deadlineChanged
            ? prepareRecurrence(
                input.recurrence === undefined
                  ? row.recurrence
                  : input.recurrence,
                input.deadline ?? deadlineFields(row),
              )
            : row.recurrence;
        const samePattern =
          recurrence &&
          row.recurrence &&
          recurrence.frequency === row.recurrence.frequency &&
          recurrence.interval === row.recurrence.interval &&
          recurrence.monthDay === row.recurrence.monthDay &&
          JSON.stringify(recurrence.weekdays) ===
            JSON.stringify(row.recurrence.weekdays);
        if (recurrence && row.recurrence && samePattern && !deadlineChanged)
          recurrence = {
            ...recurrence,
            anchorDate: row.recurrence.anchorDate,
            localTime: row.recurrence.localTime,
          };
        const recurrenceChanged =
          JSON.stringify(recurrence) !== JSON.stringify(row.recurrence);
        const changed = deadlineChanged || recurrenceChanged;
        if (
          changed &&
          row.status === "active" &&
          recurrence &&
          (deadline?.dueAt ?? row.dueAt) <= now
        )
          throw new AppError(
            400,
            "invalid_recurrence",
            "Choose a future first occurrence when changing this repeating schedule.",
          );
        const version = row.scheduleVersion + (changed ? 1 : 0);
        if (changed)
          await cancelOutstanding(
            tx,
            owner,
            id,
            deadlineChanged ? "deadline_changed" : "recurrence_changed",
            now,
          );
        const [updated] = await tx
          .update(reminders)
          .set({
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.priority !== undefined
              ? { priority: input.priority }
              : {}),
            ...(deadline ?? {}),
            recurrence,
            occurrenceAnchorAt: recurrence
              ? changed && (!samePattern || deadlineChanged)
                ? now
                : (row.occurrenceAnchorAt ?? row.createdAt)
              : null,
            scheduleVersion: version,
            revision: row.revision + 1,
            updatedAt: now,
          })
          .where(ownedReminder(owner, id))
          .returning();
        if (changed && row.status === "active") {
          const schedule = reminderSchedule(updated, now);
          if (schedule.length)
            await tx.insert(scheduledNotifications).values(
              schedule.map((item) => ({
                ...item,
                reminderId: id,
                scheduleVersion: version,
                createdAt: now,
                updatedAt: now,
              })),
            );
        }
        return updated;
      });
    },
    async transition(
      owner: Owner,
      id: string,
      action: "complete" | "reopen" | "delete",
      raw: unknown = {},
    ) {
      validated(reminderIdInput, id);
      const input = validated(actionInput, raw);
      return db.transaction(async (tx) => {
        const row = await lockReminder(tx, owner, id, action === "delete");
        if (action === "delete" && row.deletedAt) return row;
        if (
          (action === "complete" && row.status === "completed") ||
          (action === "reopen" && row.status === "active")
        )
          return row;
        checkRevision(row, input.expectedRevision);
        if (row.status === "archived")
          throw new AppError(
            409,
            "conflict",
            "This reminder cannot be changed here.",
          );
        const now = clock();
        await cancelOutstanding(
          tx,
          owner,
          id,
          action === "delete"
            ? "deleted"
            : action === "complete"
              ? "completed"
              : "reopened",
          now,
        );
        const next =
          action === "reopen" && row.recurrence && row.dueAt <= now
            ? nextOccurrence(row.recurrence, row.timeZone, now)
            : null;
        if (action === "reopen" && row.recurrence && row.dueAt <= now && !next)
          throw new AppError(
            400,
            "recurrence_ended",
            "This repeating schedule has ended. Edit its end date before reopening.",
          );
        const changes =
          action === "delete"
            ? { deletedAt: now }
            : action === "complete"
              ? { status: "completed" as const, completedAt: now }
              : {
                  status: "active" as const,
                  completedAt: null,
                  scheduleVersion: row.scheduleVersion + 1,
                  ...(next
                    ? {
                        dueAt: next.dueAt,
                        dueDate: next.dueDate,
                        occurrenceAnchorAt: next.previousAt ?? now,
                      }
                    : {}),
                };
        const [updated] = await tx
          .update(reminders)
          .set({ ...changes, revision: row.revision + 1, updatedAt: now })
          .where(ownedReminder(owner, id))
          .returning();
        if (action === "reopen") {
          const schedule = reminderSchedule(updated, now);
          if (schedule.length)
            await tx.insert(scheduledNotifications).values(
              schedule.map((item) => ({
                ...item,
                reminderId: id,
                scheduleVersion: updated.scheduleVersion,
                createdAt: now,
                updatedAt: now,
              })),
            );
        }
        return updated;
      });
    },
  };
}
