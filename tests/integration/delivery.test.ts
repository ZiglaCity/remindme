import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createDatabase } from "../../src/lib/db/connection";
import {
  reminders,
  scheduledNotifications,
  notificationAttempts,
  user,
} from "../../src/lib/db/schema";
import { emailEnvSchema, parseEnvironment } from "../../src/lib/env/schema";
import {
  claimNotification,
  deliveryContext,
} from "../../src/repositories/delivery";
import { createDeliveryService } from "../../src/services/notifications/deliver";
import { createReminderService } from "../../src/services/reminders/service";
import type { EmailSender } from "../../src/lib/email/smtp";

config({
  path: [".env.test.local", ".env.test", ".env.local", ".env"],
  quiet: true,
});
const { db, pool } = createDatabase({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
});
const ids = [randomUUID(), randomUUID()];
const emails = ids.map((id) => `delivery-${id}@example.test`);
const env = parseEnvironment(emailEnvSchema, {
  APP_URL: "https://remind.example",
  SMTP_HOST: "smtp.example.test",
  SMTP_USER: "fixture",
  SMTP_PASS: "fixture",
  SMTP_SECURE: "false",
  EMAIL_FROM: "sender@example.test",
  SMTP_APPROVED_RECIPIENTS: emails[0],
  SMTP_MAX_ATTEMPTS: 2,
});
let now = new Date("2026-10-20T12:00:00Z");
beforeEach(() => {
  now = new Date("2026-10-20T12:00:00Z");
});
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./migrations" });
  await db.insert(user).values(
    ids.map((id, index) => ({
      id,
      name: "Delivery fixture",
      email: emails[index],
    })),
  );
});
afterAll(async () => {
  try {
    await db.delete(user).where(inArray(user.id, ids));
  } finally {
    await pool.end();
  }
});
async function fixture(owner = 0) {
  const due = new Date(now.getTime() + 3_600_000);
  const [reminder] = await db
    .insert(reminders)
    .values({
      userId: ids[owner],
      title: "Fixture delivery",
      dueAt: due,
      dueDate: due.toISOString().slice(0, 10),
      deadlineType: "date_time",
      timeZone: "UTC",
      createdAt: new Date(now.getTime() - 3_600_000),
    })
    .returning();
  const [notification] = await db
    .insert(scheduledNotifications)
    .values({
      reminderId: reminder.id,
      thresholdPercent: 50,
      scheduleVersion: 1,
      scheduledFor: now,
    })
    .returning();
  return { reminder, notification };
}
async function claim(id: string) {
  const result = await claimNotification(db, id, now);
  expect(result).not.toBeNull();
  return result!;
}
describe("persistent email delivery", () => {
  it("resolves the owner recipient, records acceptance and prevents duplicate claim execution", async () => {
    const f = await fixture();
    const c = await claim(f.notification.id);
    const sender = vi.fn<EmailSender>(async () => ({
      messageId: "<fixture-provider-id>",
    }));
    const deliver = createDeliveryService(db, sender, env, () => now);
    const outcomes = await Promise.all([deliver(c), deliver(c)]);
    expect(outcomes.map((r) => r.status).sort()).toEqual(["sent", "skipped"]);
    expect(sender).toHaveBeenCalledOnce();
    expect(sender.mock.calls[0][0]).toMatchObject({ to: emails[0] });
    const saved = await deliveryContext(db, f.notification.id);
    expect(saved?.notification).toMatchObject({
      status: "sent",
      attemptCount: 1,
      providerMessageId: "<fixture-provider-id>",
      claimToken: null,
    });
    const attempts = await db
      .select()
      .from(notificationAttempts)
      .where(eq(notificationAttempts.notificationId, f.notification.id));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].result).toBe("sent");
    expect(await claimNotification(db, f.notification.id, now)).toBeNull();
  });
  it("blocks unapproved recipients, inactive reminders and replaced schedule versions", async () => {
    const sender = vi.fn(async () => ({ messageId: "never" }));
    const deliver = createDeliveryService(db, sender, env, () => now);
    const unapproved = await fixture(1);
    await deliver(await claim(unapproved.notification.id));
    expect(
      (await deliveryContext(db, unapproved.notification.id))?.notification
        .lastErrorCode,
    ).toBe("recipient_not_approved");
    const inactive = await fixture();
    const old = await claim(inactive.notification.id);
    await createReminderService(db, () => now).transition(
      { userId: ids[0] },
      inactive.reminder.id,
      "complete",
    );
    expect((await deliver(old)).status).toBe("skipped");
    const replaced = await fixture();
    const stale = await claim(replaced.notification.id);
    await db
      .update(reminders)
      .set({ scheduleVersion: 2 })
      .where(eq(reminders.id, replaced.reminder.id));
    await deliver(stale);
    expect(
      (await deliveryContext(db, replaced.notification.id))?.notification
        .status,
    ).toBe("cancelled");
    expect(sender).not.toHaveBeenCalled();
  });
  it("persists retry timing, blocks early retries and terminates exhausted/permanent failures", async () => {
    const f = await fixture();
    const sender = vi
      .fn()
      .mockRejectedValueOnce({ code: "EENVELOPE", responseCode: 450 })
      .mockRejectedValueOnce({ code: "ETIMEDOUT", command: "DATA" });
    const deliver = createDeliveryService(db, sender, env, () => now);
    expect((await deliver(await claim(f.notification.id))).status).toBe(
      "retry_scheduled",
    );
    expect(
      (
        await deliveryContext(db, f.notification.id)
      )?.notification.nextAttemptAt?.getTime(),
    ).toBe(now.getTime() + 60_000);
    expect(await claimNotification(db, f.notification.id, now)).toBeNull();
    now = new Date(now.getTime() + 60_000);
    expect((await deliver(await claim(f.notification.id))).status).toBe(
      "failed",
    );
    expect(await claimNotification(db, f.notification.id, now)).toBeNull();
    expect(
      (await deliveryContext(db, f.notification.id))?.notification.attemptCount,
    ).toBe(2);
    const permanent = await fixture();
    const reject = createDeliveryService(
      db,
      async () => {
        throw { responseCode: 550 };
      },
      env,
      () => now,
    );
    expect((await reject(await claim(permanent.notification.id))).status).toBe(
      "failed",
    );
    expect(
      (await deliveryContext(db, permanent.notification.id))?.notification
        .nextAttemptAt,
    ).toBeNull();
  });
  it("records acceptance during a completion race without reviving cancelled work", async () => {
    const f = await fixture();
    const c = await claim(f.notification.id);
    const deliver = createDeliveryService(
      db,
      async () => {
        await createReminderService(db, () => now).transition(
          { userId: ids[0] },
          f.reminder.id,
          "complete",
        );
        return { messageId: "<accepted-during-completion>" };
      },
      env,
      () => now,
    );
    expect((await deliver(c)).status).toBe("superseded");
    expect(
      (await deliveryContext(db, f.notification.id))?.notification.status,
    ).toBe("cancelled");
    const [attempt] = await db
      .select()
      .from(notificationAttempts)
      .where(
        and(
          eq(notificationAttempts.notificationId, f.notification.id),
          eq(notificationAttempts.result, "sent"),
        ),
      );
    expect(attempt.providerMessageId).toBe("<accepted-during-completion>");
  });
});
