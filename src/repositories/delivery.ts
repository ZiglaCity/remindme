import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  reminders,
  scheduledNotifications,
  user,
  notificationAttempts,
} from "../lib/db/schema";
import type { Database } from "./preferences";
import type { EmailConfiguration } from "../lib/email/smtp";
import {
  recipientApproved,
  type DeliveryFailure,
  retryAt,
} from "../lib/email/policy";

export type DeliveryClaim = { id: string; token: string };
export async function deliveryContext(db: Database, id: string) {
  const [row] = await db
    .select({
      notification: scheduledNotifications,
      reminder: reminders,
      email: user.email,
    })
    .from(scheduledNotifications)
    .innerJoin(reminders, eq(reminders.id, scheduledNotifications.reminderId))
    .innerJoin(user, eq(user.id, reminders.userId))
    .where(eq(scheduledNotifications.id, id));
  return row;
}
export type DeliveryContext = NonNullable<
  Awaited<ReturnType<typeof deliveryContext>>
>;
export function suppression(context: DeliveryContext, now: Date) {
  if (context.reminder.deletedAt) return "reminder_deleted";
  if (context.reminder.status !== "active") return "reminder_inactive";
  if (context.notification.scheduleVersion !== context.reminder.scheduleVersion)
    return "schedule_replaced";
  if (context.reminder.dueAt <= now) return "deadline_passed";
  return null;
}

// Single-item trusted claim for the guarded CLI. Batch selection/recovery belongs to Phase 6.
export async function claimNotification(
  db: Database,
  id: string,
  now: Date,
): Promise<DeliveryClaim | null> {
  const context = await deliveryContext(db, id);
  if (!context) return null;
  return db.transaction(async (tx) => {
    // Reminder first, matching edit/complete/delete lock order.
    const [reminder] = await tx
      .select()
      .from(reminders)
      .where(eq(reminders.id, context.reminder.id))
      .for("update");
    const [notification] = await tx
      .select()
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.id, id))
      .for("update");
    if (!reminder || !notification || notification.status !== "pending")
      return null;
    const reason = suppression(
      { reminder, notification, email: context.email },
      now,
    );
    if (reason) {
      await tx
        .update(scheduledNotifications)
        .set({
          status: "cancelled",
          cancellationReason: reason,
          claimToken: null,
          processingStartedAt: null,
          nextAttemptAt: null,
          updatedAt: now,
        })
        .where(eq(scheduledNotifications.id, id));
      return null;
    }
    if (
      notification.scheduledFor > now ||
      (notification.nextAttemptAt && notification.nextAttemptAt > now)
    )
      return null;
    const token = randomUUID();
    await tx
      .update(scheduledNotifications)
      .set({
        status: "processing",
        claimToken: token,
        processingStartedAt: now,
        updatedAt: now,
      })
      .where(eq(scheduledNotifications.id, id));
    return { id, token };
  });
}

export async function beginAttempt(
  db: Database,
  claim: DeliveryClaim,
  env: EmailConfiguration,
  now: Date,
) {
  const context = await deliveryContext(db, claim.id);
  if (!context) return null;
  return db.transaction(async (tx) => {
    const [reminder] = await tx
      .select()
      .from(reminders)
      .where(eq(reminders.id, context.reminder.id))
      .for("update");
    const [notification] = await tx
      .select()
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.id, claim.id))
      .for("update");
    if (
      !reminder ||
      !notification ||
      notification.status !== "processing" ||
      notification.claimToken !== claim.token
    )
      return null;
    // A token can start only one attempt, including concurrent duplicate invocations.
    const [existing] = await tx
      .select({ id: notificationAttempts.id })
      .from(notificationAttempts)
      .where(eq(notificationAttempts.id, claim.token));
    if (existing) return null;
    const reason = suppression(
      { reminder, notification, email: context.email },
      now,
    );
    const unapproved = !recipientApproved(
      context.email,
      env.SMTP_APPROVED_RECIPIENTS,
    );
    const exhausted = notification.attemptCount >= env.SMTP_MAX_ATTEMPTS;
    if (reason || unapproved || exhausted) {
      const code =
        reason ??
        (unapproved ? "recipient_not_approved" : "attempts_exhausted");
      await tx
        .update(scheduledNotifications)
        .set({
          status: reason ? "cancelled" : "failed",
          cancellationReason: reason,
          lastErrorCode: code,
          claimToken: null,
          processingStartedAt: null,
          nextAttemptAt: null,
          updatedAt: now,
        })
        .where(eq(scheduledNotifications.id, claim.id));
      await tx
        .insert(notificationAttempts)
        .values({
          id: claim.token,
          notificationId: claim.id,
          attemptedAt: now,
          result: "blocked",
          errorCategory: code,
        });
      return null;
    }
    if (
      notification.scheduledFor > now ||
      (notification.nextAttemptAt && notification.nextAttemptAt > now)
    )
      return null;
    await tx
      .update(scheduledNotifications)
      .set({ attemptCount: notification.attemptCount + 1, updatedAt: now })
      .where(eq(scheduledNotifications.id, claim.id));
    await tx
      .insert(notificationAttempts)
      .values({
        id: claim.token,
        notificationId: claim.id,
        attemptedAt: now,
        result: "sending",
      });
    return { attemptNumber: notification.attemptCount + 1 };
  });
}

export type DeliveryOutcome =
  | { kind: "accepted"; messageId: string }
  | { kind: "failure"; failure: DeliveryFailure }
  | { kind: "blocked"; code: string };
export async function finishAttempt(
  db: Database,
  claim: DeliveryClaim,
  env: EmailConfiguration,
  outcome: DeliveryOutcome,
  now: Date,
) {
  const context = await deliveryContext(db, claim.id);
  if (!context) return "gone" as const;
  return db.transaction(async (tx) => {
    const [reminder] = await tx
      .select()
      .from(reminders)
      .where(eq(reminders.id, context.reminder.id))
      .for("update");
    const [notification] = await tx
      .select()
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.id, claim.id))
      .for("update");
    if (!reminder || !notification) return "gone" as const;
    const accepted = outcome.kind === "accepted";
    // Preserve actual SMTP outcome even if a concurrent completion cancelled the queue row.
    await tx
      .update(notificationAttempts)
      .set({
        result: accepted
          ? "sent"
          : outcome.kind === "blocked"
            ? "blocked"
            : outcome.failure.category === "uncertain"
              ? "uncertain"
              : "failed",
        errorCategory:
          outcome.kind === "failure"
            ? outcome.failure.code
            : outcome.kind === "blocked"
              ? outcome.code
              : null,
        providerMessageId: accepted ? outcome.messageId : null,
      })
      .where(
        and(
          eq(notificationAttempts.id, claim.token),
          eq(notificationAttempts.result, "sending"),
        ),
      );
    if (
      notification.status !== "processing" ||
      notification.claimToken !== claim.token
    )
      return "superseded" as const;
    const reason = suppression(
      { reminder, notification, email: context.email },
      now,
    );
    const clear = {
      claimToken: null,
      processingStartedAt: null,
      nextAttemptAt: null,
      updatedAt: now,
    };
    if (reason) {
      await tx
        .update(scheduledNotifications)
        .set({ ...clear, status: "cancelled", cancellationReason: reason })
        .where(eq(scheduledNotifications.id, claim.id));
      return "cancelled" as const;
    }
    if (accepted) {
      await tx
        .update(scheduledNotifications)
        .set({
          ...clear,
          status: "sent",
          sentAt: now,
          providerMessageId: outcome.messageId,
          lastErrorCode: null,
        })
        .where(eq(scheduledNotifications.id, claim.id));
      return "sent" as const;
    }
    const next =
      outcome.kind === "failure" &&
      outcome.failure.category !== "permanent" &&
      notification.attemptCount < env.SMTP_MAX_ATTEMPTS
        ? retryAt(notification.attemptCount, now, env.SMTP_RETRY_DELAYS_SECONDS)
        : null;
    const retry = next && next < reminder.dueAt;
    await tx
      .update(scheduledNotifications)
      .set({
        ...clear,
        status: retry ? "pending" : "failed",
        nextAttemptAt: retry ? next : null,
        lastErrorCode:
          outcome.kind === "failure" ? outcome.failure.code : outcome.code,
      })
      .where(eq(scheduledNotifications.id, claim.id));
    return retry ? ("retry_scheduled" as const) : ("failed" as const);
  });
}
