import type { Database } from "../../repositories/preferences";
import {
  beginAttempt,
  deliveryContext,
  finishAttempt,
  suppression,
  claimIsCurrent,
  type DeliveryClaim,
  type DeliveryOutcome,
} from "../../repositories/delivery";
import { classifySmtpError, recipientApproved } from "../../lib/email/policy";
import { reminderEmail } from "../../lib/email/template";
import type { EmailConfiguration, EmailSender } from "../../lib/email/smtp";
import type { Clock } from "../scheduling/schedule";

export function createDeliveryService(
  db: Database,
  sender: EmailSender,
  env: EmailConfiguration,
  clock: Clock = () => new Date(),
  options: {
    leaseSeconds?: number;
    log?: (fields: Record<string, string | number>) => void;
  } = {},
) {
  return async (claim: DeliveryClaim) => {
    const started = performance.now();
    const attempt = await beginAttempt(
      db,
      claim,
      env,
      clock(),
      options.leaseSeconds ?? 300,
    );
    if (!attempt) return { status: "skipped" };
    // Fresh owner/state/claim check immediately before delivery; no transaction is held over SMTP.
    const context = await deliveryContext(db, claim.id);
    let outcome: DeliveryOutcome;
    const reason = context ? suppression(context, clock()) : "reminder_missing";
    if (
      !context ||
      reason ||
      !claimIsCurrent(
        context.notification,
        claim,
        clock(),
        options.leaseSeconds ?? 300,
      ) ||
      !recipientApproved(context.email, env.SMTP_APPROVED_RECIPIENTS)
    ) {
      outcome = {
        kind: "blocked",
        code: reason ?? "recipient_or_claim_changed",
      };
    } else {
      try {
        const template = reminderEmail(
          {
            ...context.reminder,
            thresholdPercent: context.notification.thresholdPercent,
          },
          env.APP_URL,
        );
        const result = await sender({
          notificationId: claim.id,
          to: context.email,
          ...template,
        });
        outcome = {
          kind: "accepted",
          messageId: result.messageId.replace(/[\r\n]/g, "").slice(0, 512),
        };
      } catch (error) {
        outcome = { kind: "failure", failure: classifySmtpError(error) };
      }
    }
    const status = await finishAttempt(db, claim, env, outcome, clock());
    const fields = {
      notificationId: claim.id,
      reminderId: context?.reminder.id ?? "missing",
      attempt: attempt.attemptNumber,
      durationMs: Math.round(performance.now() - started),
      queueAgeMs: context
        ? Math.max(
            0,
            clock().getTime() - context.notification.scheduledFor.getTime(),
          )
        : 0,
      outcome: outcome.kind === "failure" ? outcome.failure.code : outcome.kind,
      status,
    };
    if (options.log) options.log(fields);
    else console.info("notification_delivery", fields);
    return { status };
  };
}
