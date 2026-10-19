import { config } from "dotenv";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { createDatabase } from "../src/lib/db/connection";
import { scheduledNotifications, user } from "../src/lib/db/schema";
import { emailEnvSchema, parseEnvironment } from "../src/lib/env/schema";
import { createSmtpSender } from "../src/lib/email/smtp";
import { classifySmtpError, recipientApproved } from "../src/lib/email/policy";
import {
  claimNotification,
  deliveryContext,
} from "../src/repositories/delivery";
import { createDeliveryService } from "../src/services/notifications/deliver";
import { createReminderService } from "../src/services/reminders/service";

config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--send") || args.length > 1)
    throw new Error(
      "Use smtp:check with no arguments to verify, or --send for one approved test email.",
    );
  const env = parseEnvironment(emailEnvSchema, {
    ...process.env,
    APP_URL: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
  });
  const smtp = createSmtpSender(env);
  await smtp.verify();
  console.log(
    "SMTP connection, TLS and authentication verified. This does not prove inbox delivery.",
  );
  if (!args.includes("--send")) return;
  const recipient = process.env.SMTP_TEST_RECIPIENT?.trim();
  if (
    !recipient ||
    !z.email().safeParse(recipient).success ||
    !recipientApproved(recipient, env.SMTP_APPROVED_RECIPIENTS)
  )
    throw new Error(
      "Set SMTP_TEST_RECIPIENT to one exact address also listed in SMTP_APPROVED_RECIPIENTS.",
    );
  const { db, pool } = createDatabase(process.env);
  let reminderId: string | undefined;
  let owner: { userId: string } | undefined;
  const reminders = createReminderService(db);
  try {
    const [account] = await db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${recipient.toLowerCase()}`);
    if (!account)
      throw new Error(
        "The approved test recipient must already have a stored application account.",
      );
    owner = { userId: account.id };
    const due = new Date(Date.now() + 30 * 60_000);
    const reminder = await reminders.create(owner, {
      title: "RemindMe email delivery check",
      description:
        "This is the single controlled Phase 5 delivery test. Please confirm receipt in the project chat.",
      sourceText:
        "Synthetic SMTP smoke test; created by the guarded CLI, then completed after the delivery attempt.",
      deadline: {
        type: "date_time",
        date: due.toISOString().slice(0, 10),
        time: due.toISOString().slice(11, 16),
        timeZone: "UTC",
      },
    });
    reminderId = reminder.id;
    // Only this synthetic reminder's 50% notification is made due. No real queue work is selected.
    await db
      .update(scheduledNotifications)
      .set({
        status: "cancelled",
        cancellationReason: "smtp_smoke_test_unused",
      })
      .where(
        and(
          eq(scheduledNotifications.reminderId, reminder.id),
          ne(scheduledNotifications.thresholdPercent, 50),
        ),
      );
    const [notification] = await db
      .update(scheduledNotifications)
      .set({ scheduledFor: new Date() })
      .where(
        and(
          eq(scheduledNotifications.reminderId, reminder.id),
          eq(scheduledNotifications.thresholdPercent, 50),
        ),
      )
      .returning({ id: scheduledNotifications.id });
    const claim = await claimNotification(db, notification.id, new Date());
    if (!claim)
      throw new Error(
        "The synthetic notification was no longer eligible; nothing was sent.",
      );
    const result = await createDeliveryService(db, smtp.send, env)(claim);
    const persisted = await deliveryContext(db, notification.id);
    if (
      result.status !== "sent" ||
      persisted?.notification.status !== "sent" ||
      !persisted.notification.providerMessageId
    )
      throw new Error(
        "The test did not record SMTP acceptance. Inspect the synthetic reminder history.",
      );
    console.log(
      `SMTP accepted one test email and its outcome is persisted. Reminder ID: ${reminder.id}`,
    );
    console.log(
      "Inbox receipt remains unconfirmed until the recipient checks their inbox/spam folder.",
    );
  } finally {
    try {
      // Stop this diagnostic from being retried later by a scheduler, even on failure.
      if (reminderId && owner)
        await reminders.transition(owner, reminderId, "complete");
    } finally {
      await pool.end();
    }
  }
}
main().catch((error: unknown) => {
  // Deliberate CLI guard messages are safe; provider/SQL errors may contain secrets or addresses.
  const safe =
    error instanceof Error &&
    /^(Use smtp:check|Set SMTP_TEST_RECIPIENT|The approved test recipient|The synthetic notification|The test did not record)/.test(
      error.message,
    );
  console.error(
    safe
      ? error.message
      : `SMTP check failed (${classifySmtpError(error).code}). Check private settings and connectivity.`,
  );
  process.exitCode = 1;
});
