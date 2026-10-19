import type { Database } from "../../repositories/preferences";
import {
  beginAttempt,
  deliveryContext,
  finishAttempt,
  suppression,
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
) {
  return async (claim: DeliveryClaim) => {
    const attempt = await beginAttempt(db, claim, env, clock());
    if (!attempt) return { status: "skipped" };
    // Fresh owner/state/claim check immediately before delivery; no transaction is held over SMTP.
    const context = await deliveryContext(db, claim.id);
    let outcome: DeliveryOutcome;
    const reason = context ? suppression(context, clock()) : "reminder_missing";
    if (
      !context ||
      reason ||
      context.notification.status !== "processing" ||
      context.notification.claimToken !== claim.token ||
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
    console.info("notification_delivery", {
      notificationId: claim.id,
      attempt: attempt.attemptNumber,
      outcome: outcome.kind === "failure" ? outcome.failure.code : outcome.kind,
      status,
    });
    return { status };
  };
}
