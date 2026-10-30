import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
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
  notificationAttempts,
  reminders,
  scheduledNotifications,
  user,
} from "../../src/lib/db/schema";
import { parseEnvironment, workerEnvSchema } from "../../src/lib/env/schema";
import { claimBatch } from "../../src/repositories/queue";
import {
  beginAttempt,
  deliveryContext,
  finishAttempt,
} from "../../src/repositories/delivery";
import { createDeliveryService } from "../../src/services/notifications/deliver";
import { processNotifications } from "../../src/services/notifications/processor";
import { createReminderService } from "../../src/services/reminders/service";
import type { EmailSender } from "../../src/lib/email/smtp";

config({
  path: [".env.test.local", ".env.test", ".env.local", ".env"],
  quiet: true,
});
const { db, pool } = createDatabase({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
});
const owner = { userId: randomUUID() };
const email = `queue-${owner.userId}@example.test`;
const env = parseEnvironment(workerEnvSchema, {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  APP_URL: "https://remind.example",
  SMTP_HOST: "smtp.example.test",
  SMTP_USER: "fixture",
  SMTP_PASS: "fixture",
  SMTP_SECURE: "false",
  EMAIL_FROM: "sender@example.test",
  SMTP_APPROVED_RECIPIENTS: email,
  WORKER_CONCURRENCY: 2,
  WORKER_BATCH_SIZE: 3,
});
let now = new Date("2026-10-21T12:00Z");
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./migrations" });
  await db
    .insert(user)
    .values({ id: owner.userId, name: "Queue fixture", email });
});
beforeEach(async () => {
  now = new Date("2026-10-21T12:00Z");
  await db.delete(reminders).where(eq(reminders.userId, owner.userId));
});
afterAll(async () => {
  try {
    await db.delete(user).where(eq(user.id, owner.userId));
  } finally {
    await pool.end();
  }
});
async function fixture(thresholds = [50, 75, 90]) {
  const [reminder] = await db
    .insert(reminders)
    .values({
      userId: owner.userId,
      title: "Queue fixture",
      dueAt: new Date(now.getTime() + 3_600_000),
      dueDate: "2026-10-21",
      deadlineType: "date_time",
      timeZone: "UTC",
      createdAt: new Date(now.getTime() - 3_600_000),
    })
    .returning();
  const notifications = await db
    .insert(scheduledNotifications)
    .values(
      thresholds.map((thresholdPercent) => ({
        reminderId: reminder.id,
        thresholdPercent,
        scheduleVersion: 1,
        scheduledFor: new Date(now.getTime() - (100 - thresholdPercent) * 1000),
      })),
    )
    .returning();
  return { reminder, notifications };
}
const batch = (limit = 2) => claimBatch(db, env, { now, limit });
const rows = (id: string) =>
  db
    .select()
    .from(scheduledNotifications)
    .where(eq(scheduledNotifications.reminderId, id));
describe("queue processing", () => {
  it("delivers the new 100% row at the deadline, persists acceptance after it, and does not resend", async () => {
    const service = createReminderService(db, () => now);
    const reminder = await service.create(owner, {
      title: "Deadline fixture",
      deadline: {
        type: "date_time",
        date: "2026-10-21",
        time: "12:10",
        timeZone: "UTC",
      },
    });
    expect(
      (await rows(reminder.id))
        .map((row) => row.thresholdPercent)
        .sort((a, b) => a - b),
    ).toEqual([50, 75, 90, 100]);
    const sender = vi.fn<EmailSender>(async (message) => {
      expect(message.text).toContain("100%");
      now = new Date(now.getTime() + 1000);
      return { messageId: "<deadline>" };
    });
    now = new Date(reminder.dueAt);
    const result = await processNotifications(db, sender, env, {
      clock: () => now,
      log: () => {},
    });
    expect(result.sent).toBe(1);
    expect(
      (await rows(reminder.id)).find((row) => row.thresholdPercent === 100)
        ?.status,
    ).toBe("sent");
    await processNotifications(db, sender, env, {
      clock: () => now,
      log: () => {},
    });
    expect(sender).toHaveBeenCalledOnce();
  });
  it("retries the deadline email after its due time and still honors completion before a claimed send", async () => {
    const service = createReminderService(db, () => now);
    const reminder = await service.create(owner, {
      title: "Deadline retry fixture",
      deadline: {
        type: "date_time",
        date: "2026-10-21",
        time: "12:10",
        timeZone: "UTC",
      },
    });
    now = new Date(reminder.dueAt.getTime() + 30_000);
    const sender = vi
      .fn<EmailSender>()
      .mockRejectedValueOnce({ responseCode: 421 })
      .mockResolvedValue({ messageId: "<deadline-retry>" });
    const run = () =>
      processNotifications(db, sender, env, {
        clock: () => now,
        log: () => {},
      });
    expect((await run()).retries).toBe(1);
    const deadline = (await rows(reminder.id)).find(
      (row) => row.thresholdPercent === 100,
    )!;
    expect(deadline.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());
    expect((await run()).claimed).toBe(0);
    now = deadline.nextAttemptAt!;
    expect((await run()).sent).toBe(1);
    expect(sender).toHaveBeenCalledTimes(2);
    const cancelled = await service.create(owner, {
      title: "Completed deadline fixture",
      deadline: {
        type: "date_time",
        date: "2026-10-21",
        time: "12:20",
        timeZone: "UTC",
      },
    });
    now = new Date(cancelled.dueAt);
    const claim = (await batch(1)).claims[0];
    await service.transition(owner, cancelled.id, "complete");
    expect(
      (await createDeliveryService(db, sender, env, () => now)(claim)).status,
    ).toBe("skipped");
    expect(sender).toHaveBeenCalledTimes(2);
    expect(
      (await rows(cancelled.id)).find((row) => row.thresholdPercent === 100)
        ?.status,
    ).toBe("cancelled");
  });
  it("keeps legacy reminders on their original thresholds after edits and reopening", async () => {
    const { reminder } = await fixture();
    expect(reminder.deadlineNotificationEnabled).toBe(false);
    const service = createReminderService(db, () => now);
    let updated = await service.edit(owner, reminder.id, {
      expectedRevision: reminder.revision,
      deadline: {
        type: "date_time",
        date: "2026-10-22",
        time: "12:00",
        timeZone: "UTC",
      },
    });
    updated = await service.transition(owner, reminder.id, "complete", {
      expectedRevision: updated.revision,
    });
    await service.transition(owner, reminder.id, "reopen", {
      expectedRevision: updated.revision,
    });
    const pending = (await rows(reminder.id)).filter(
      (row) => row.status === "pending",
    );
    expect(
      pending.map((row) => row.thresholdPercent).sort((a, b) => a - b),
    ).toEqual([50, 75, 90]);
  });
  it("coalesces catch-up, suppresses deadlines and prevents overlapping claims", async () => {
    const a = await fixture();
    const b = await fixture();
    const [first, second] = await Promise.all([batch(1), batch(1)]);
    const claims = [...first.claims, ...second.claims];
    // A selector may see a candidate just before another transaction claims it.
    // Its locked recheck safely skips that row; a later wave fills the remaining slot.
    expect(claims.length).toBeGreaterThan(0);
    expect(new Set(claims.map((claim) => claim.id)).size).toBe(claims.length);
    const remaining = await claimBatch(db, env, {
      now,
      limit: 2,
      exclude: claims.map((claim) => claim.reminderId),
    });
    claims.push(...remaining.claims);
    expect(claims).toHaveLength(2);
    expect(new Set(claims.map((claim) => claim.id)).size).toBe(2);
    expect(new Set(claims.map((claim) => claim.reminderId))).toEqual(
      new Set([a.reminder.id, b.reminder.id]),
    );
    const queue = await db
      .select()
      .from(scheduledNotifications)
      .where(
        inArray(scheduledNotifications.reminderId, [
          a.reminder.id,
          b.reminder.id,
        ]),
      );
    expect(
      queue
        .filter((row) => row.status === "processing")
        .map((row) => row.thresholdPercent),
    ).toEqual([90, 90]);
    expect(
      queue.filter((row) => row.cancellationReason === "coalesced_catch_up"),
    ).toHaveLength(4);
    expect((await batch()).claims).toHaveLength(0);
    const expired = await fixture();
    await db
      .update(reminders)
      .set({ dueAt: new Date(now.getTime() - 1) })
      .where(eq(reminders.id, expired.reminder.id));
    await batch();
    expect(
      (await rows(expired.reminder.id)).every(
        (row) => row.cancellationReason === "deadline_passed",
      ),
    ).toBe(true);
  });
  it("recovers interrupted sends, fences late workers and caps crashes before SMTP", async () => {
    const f = await fixture([50]);
    const old = (await batch(1)).claims[0];
    await beginAttempt(db, old, env, now);
    now = new Date(now.getTime() + 301_000);
    const sender = vi.fn<EmailSender>(async () => ({ messageId: "never" }));
    expect(
      (await createDeliveryService(db, sender, env, () => now)(old)).status,
    ).toBe("skipped");
    const recovered = await batch(1);
    expect(recovered.recovered).toBe(1);
    expect(recovered.claims).toHaveLength(0);
    expect((await deliveryContext(db, old.id))?.notification).toMatchObject({
      status: "pending",
      recoveryCount: 1,
    });
    const [uncertain] = await db
      .select()
      .from(notificationAttempts)
      .where(eq(notificationAttempts.id, old.token));
    expect(uncertain.result).toBe("uncertain");
    now = new Date(now.getTime() + 61_000);
    const current = (await batch(1)).claims[0];
    expect(current.token).not.toBe(old.token);
    expect(
      await finishAttempt(
        db,
        old,
        env,
        { kind: "accepted", messageId: "<late-acceptance>" },
        now,
      ),
    ).toBe("superseded");
    expect(
      (await deliveryContext(db, current.id))?.notification.claimToken,
    ).toBe(current.token);
    const [late] = await db
      .select()
      .from(notificationAttempts)
      .where(eq(notificationAttempts.id, old.token));
    expect(late.result).toBe("sent");
    expect(sender).not.toHaveBeenCalled();
    await createReminderService(db, () => now).transition(
      owner,
      f.reminder.id,
      "complete",
    );
    const crashing = await fixture([50]);
    await batch(1);
    for (let count = 0; count < 3; count++) {
      now = new Date(now.getTime() + 301_000);
      await batch(1);
    }
    expect((await rows(crashing.reminder.id))[0]).toMatchObject({
      status: "failed",
      recoveryCount: 3,
      attemptCount: 0,
      lastErrorCode: "worker_recovery_exhausted",
    });
  });
  it("honors retry backoff, per-run capacity and admission budget despite partial failure", async () => {
    await fixture([50]);
    await fixture([50]);
    await fixture([50]);
    let running = 0;
    let maximum = 0;
    let elapsed = 0;
    let sent = 0;
    const sender: EmailSender = async () => {
      running++;
      maximum = Math.max(maximum, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      elapsed = 150_000;
      sent++;
      if (sent === 1) throw { responseCode: 421 };
      return { messageId: "<fixture>" };
    };
    const summary = await processNotifications(db, sender, env, {
      clock: () => now,
      elapsed: () => elapsed,
      log: () => {},
    });
    expect(summary.claimed).toBe(2);
    expect(summary.sent).toBe(1);
    expect(summary.retries).toBe(1);
    expect(maximum).toBeLessThanOrEqual(2);
    const next = await processNotifications(
      db,
      async () => ({ messageId: "<next>" }),
      env,
      { clock: () => now, log: () => {} },
    );
    expect(next.sent).toBe(1);
    expect(next.claimed).toBe(1);
  });
  it("suppresses mutations after claim and cancels old versions before delivery", async () => {
    const f = await fixture([50]);
    const claim = (await batch(1)).claims[0];
    await createReminderService(db, () => now).transition(
      owner,
      f.reminder.id,
      "delete",
    );
    const sender = vi.fn<EmailSender>(async () => ({ messageId: "never" }));
    expect(
      (await createDeliveryService(db, sender, env, () => now)(claim)).status,
    ).toBe("skipped");
    const replaced = await fixture();
    await db
      .update(reminders)
      .set({ scheduleVersion: 2 })
      .where(eq(reminders.id, replaced.reminder.id));
    expect((await batch()).claims).toHaveLength(0);
    expect(
      (await rows(replaced.reminder.id)).every(
        (row) => row.cancellationReason === "schedule_replaced",
      ),
    ).toBe(true);
    expect(sender).not.toHaveBeenCalled();
  });
});
