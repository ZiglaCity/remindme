import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  notificationAttempts,
  reminders,
  scheduledNotifications,
} from "../lib/db/schema";
import { retryAt } from "../lib/email/policy";
import { suppression, type DeliveryClaim } from "./delivery";
import { advanceRecurring } from "./recurrence";
import type { Database } from "./preferences";
import type { z } from "zod";
import type { workerEnvSchema } from "../lib/env/schema";

export type WorkerConfiguration = z.infer<typeof workerEnvSchema>;
export type QueueClaim = DeliveryClaim & {
  reminderId: string;
  scheduledFor: Date;
};

export async function claimBatch(
  db: Database,
  env: WorkerConfiguration,
  options: { now: Date; limit: number; exclude?: string[] },
) {
  const now = options.now;
  const cutoff = new Date(now.getTime() - env.PROCESSING_LEASE_SECONDS * 1000);
  const limit = Math.max(
    1,
    Math.min(options.limit, env.WORKER_CONCURRENCY, env.WORKER_BATCH_SIZE),
  );
  const result = {
    claims: [] as QueueClaim[],
    examined: [] as string[],
    recovered: 0,
    cancelled: 0,
    failed: 0,
  };
  await db.transaction(async (tx) => {
    // Lock the reminder first, just like edit/complete/delete and delivery finalization.
    // A fresh in-flight claim excludes that reminder from another worker's batch.
    const owners = await tx
      .select()
      .from(reminders)
      .where(
        and(
          options.exclude?.length
            ? notInArray(reminders.id, options.exclude)
            : undefined,
          sql`((${reminders.recurrence} is not null and ${reminders.status} = 'active' and ${reminders.deletedAt} is null and ${reminders.dueAt} <= ${now}) or exists (select 1 from scheduled_notifications n where n.reminder_id = ${reminders.id} and n.status in ('pending','processing') and (
        ${reminders.deletedAt} is not null or ${reminders.status} <> 'active' or ${reminders.dueAt} <= ${now} or n.schedule_version <> ${reminders.scheduleVersion}
        or (n.status = 'pending' and n.scheduled_for <= ${now} and (n.next_attempt_at is null or n.next_attempt_at <= ${now}))
        or (n.status = 'processing' and (n.processing_started_at is null or n.processing_started_at <= ${cutoff}))
      )))`,
          sql`(${reminders.deletedAt} is not null or ${reminders.status} <> 'active' or ${reminders.dueAt} <= ${now} or not exists (
        select 1 from scheduled_notifications active where active.reminder_id = ${reminders.id} and active.schedule_version = ${reminders.scheduleVersion}
        and active.status = 'processing' and active.processing_started_at > ${cutoff}
      ))`,
        ),
      )
      .orderBy(asc(reminders.dueAt), asc(reminders.id))
      .limit(limit)
      .for("update", { skipLocked: true });
    for (const reminder of owners) {
      result.examined.push(reminder.id);
      if (
        reminder.recurrence &&
        reminder.status === "active" &&
        !reminder.deletedAt &&
        reminder.dueAt <= now
      ) {
        await advanceRecurring(tx, reminder, now, "occurrence_elapsed");
        continue;
      }
      const rows = await tx
        .select()
        .from(scheduledNotifications)
        .where(
          and(
            eq(scheduledNotifications.reminderId, reminder.id),
            inArray(scheduledNotifications.status, ["pending", "processing"]),
          ),
        )
        .orderBy(
          desc(scheduledNotifications.scheduleVersion),
          desc(scheduledNotifications.thresholdPercent),
        )
        .limit(100)
        .for("update");
      const pending: (typeof rows)[number][] = [];
      let inFlight = false;
      for (const row of rows) {
        const clear = {
          claimToken: null,
          processingStartedAt: null,
          nextAttemptAt: null,
          updatedAt: now,
        };
        const reason = suppression(
          { reminder, notification: row, email: "" },
          now,
        );
        if (reason) {
          await tx
            .update(scheduledNotifications)
            .set({ ...clear, status: "cancelled", cancellationReason: reason })
            .where(eq(scheduledNotifications.id, row.id));
          result.cancelled++;
          continue;
        }
        if (row.status === "processing") {
          if (row.processingStartedAt && row.processingStartedAt > cutoff) {
            inFlight = true;
            continue;
          }
          result.recovered++;
          // A previous sending attempt may have reached SMTP before its worker died.
          if (row.claimToken)
            await tx
              .update(notificationAttempts)
              .set({
                result: "uncertain",
                errorCategory: "worker_lease_expired",
              })
              .where(
                and(
                  eq(notificationAttempts.id, row.claimToken),
                  eq(notificationAttempts.result, "sending"),
                ),
              );
          const recoveries = row.recoveryCount + 1;
          const exhausted =
            recoveries >= env.WORKER_MAX_RECOVERIES ||
            row.attemptCount >= env.SMTP_MAX_ATTEMPTS;
          const next = row.attemptCount
            ? retryAt(row.attemptCount, now, env.SMTP_RETRY_DELAYS_SECONDS)
            : now;
          const failed = exhausted || next >= reminder.dueAt;
          await tx
            .update(scheduledNotifications)
            .set({
              ...clear,
              status: failed ? "failed" : "pending",
              recoveryCount: recoveries,
              lastErrorCode: exhausted
                ? "worker_recovery_exhausted"
                : "worker_lease_expired",
              nextAttemptAt: failed ? null : next,
            })
            .where(eq(scheduledNotifications.id, row.id));
          if (failed) {
            result.failed++;
            continue;
          }
          pending.push({
            ...row,
            status: "pending",
            claimToken: null,
            processingStartedAt: null,
            recoveryCount: recoveries,
            nextAttemptAt: next,
          });
        } else pending.push(row);
      }
      if (inFlight) continue;
      // Rows are highest-threshold first. Coalesce scheduled-due lower thresholds
      // even when the highest one is waiting for backoff, so lower work cannot burst.
      const due = pending.filter((row) => row.scheduledFor <= now);
      const highest = due[0];
      if (!highest) continue;
      for (const lower of due.slice(1)) {
        await tx
          .update(scheduledNotifications)
          .set({
            status: "cancelled",
            cancellationReason: "coalesced_catch_up",
            claimToken: null,
            processingStartedAt: null,
            nextAttemptAt: null,
            updatedAt: now,
          })
          .where(eq(scheduledNotifications.id, lower.id));
        result.cancelled++;
      }
      if (highest.nextAttemptAt && highest.nextAttemptAt > now) continue;
      if (highest.attemptCount >= env.SMTP_MAX_ATTEMPTS) {
        await tx
          .update(scheduledNotifications)
          .set({
            status: "failed",
            lastErrorCode: "attempts_exhausted",
            nextAttemptAt: null,
            updatedAt: now,
          })
          .where(eq(scheduledNotifications.id, highest.id));
        result.failed++;
        continue;
      }
      const token = randomUUID();
      await tx
        .update(scheduledNotifications)
        .set({
          status: "processing",
          claimToken: token,
          processingStartedAt: now,
          updatedAt: now,
        })
        .where(eq(scheduledNotifications.id, highest.id));
      result.claims.push({
        id: highest.id,
        token,
        reminderId: reminder.id,
        scheduledFor: highest.scheduledFor,
      });
    }
  });
  return result;
}

export async function releaseUnstartedClaims(
  db: Database,
  claims: DeliveryClaim[],
  now: Date,
) {
  for (const claim of claims)
    await db
      .update(scheduledNotifications)
      .set({
        status: "pending",
        claimToken: null,
        processingStartedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(scheduledNotifications.id, claim.id),
          eq(scheduledNotifications.status, "processing"),
          eq(scheduledNotifications.claimToken, claim.token),
          sql`not exists (select 1 from notification_attempts a where a.id = ${claim.token})`,
        ),
      );
}
