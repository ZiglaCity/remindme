import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, ne, sql } from "drizzle-orm";
import { createDeliveryService } from "../../src/services/notifications/deliver";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/lib/db/connection";
import {
  reminders,
  scheduledNotifications,
  user,
} from "../../src/lib/db/schema";
import { createReminderService } from "../../src/services/reminders/service";
import { claimBatch } from "../../src/repositories/queue";
import { readReminder } from "../../src/repositories/reminders";
import { parseEnvironment, workerEnvSchema } from "../../src/lib/env/schema";

config({
  path: [".env.test.local", ".env.test", ".env.local", ".env"],
  quiet: true,
});
const { db, pool } = createDatabase({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
});
const owner = { userId: randomUUID() };
const env = parseEnvironment(workerEnvSchema, {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  APP_URL: "https://remind.example",
  SMTP_HOST: "fixture",
  SMTP_USER: "fixture",
  SMTP_PASS: "fixture",
  SMTP_SECURE: "false",
  EMAIL_FROM: "fixture@example.test",
  SMTP_APPROVED_RECIPIENTS: `repeat-${owner.userId}@example.test`,
});
let now = new Date("2026-10-20T12:00Z");
const service = createReminderService(db, () => now);
let excluded: string[] = [];
const batch = () => claimBatch(db, env, { now, limit: 1, exclude: excluded });
const input = {
  title: "Research meeting",
  deadline: {
    type: "date_time",
    date: "2026-10-25",
    time: "14:00",
    timeZone: "UTC",
  },
  recurrence: { frequency: "weekly", weekdays: [7] },
};
const queue = (id: string) =>
  db
    .select()
    .from(scheduledNotifications)
    .where(eq(scheduledNotifications.reminderId, id));
// Represent a reminder created before the new deadline-notification policy.
async function legacyCreate(value: unknown = input) {
  const row = await service.create(owner, value);
  await db
    .update(reminders)
    .set({ deadlineNotificationEnabled: false })
    .where(eq(reminders.id, row.id));
  await db
    .delete(scheduledNotifications)
    .where(
      and(
        eq(scheduledNotifications.reminderId, row.id),
        eq(scheduledNotifications.thresholdPercent, 100),
      ),
    );
  return { ...row, deadlineNotificationEnabled: false };
}
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./migrations" });
  excluded = (
    await db
      .select({ id: reminders.id })
      .from(reminders)
      .where(ne(reminders.userId, owner.userId))
  ).map((row) => row.id);
  await db.insert(user).values({
    id: owner.userId,
    name: "Recurring fixture",
    email: `repeat-${owner.userId}@example.test`,
  });
});
beforeEach(async () => {
  now = new Date("2026-10-20T12:00Z");
  await db.delete(reminders).where(eq(reminders.userId, owner.userId));
});
afterAll(async () => {
  try {
    await db.delete(user).where(eq(user.id, owner.userId));
  } finally {
    await pool.end();
  }
});

describe("durable repeating reminders", () => {
  it("sends each new series' 100% notification before advancing, including its final occurrence", async () => {
    const first = await service.create(owner, {
      ...input,
      recurrence: { ...input.recurrence, endsOn: "2026-11-01" },
    });
    expect(await queue(first.id)).toHaveLength(4);
    let sent = 0;
    const deliver = createDeliveryService(
      db,
      async () => {
        sent++;
        return { messageId: "<recurring-deadline>" };
      },
      env,
      () => now,
    );
    for (const version of [1, 2]) {
      const current = await readReminder(db, owner, first.id);
      now = new Date(current.dueAt);
      const results = await Promise.all([batch(), batch()]);
      const claims = results.flatMap((result) => result.claims);
      expect(claims).toHaveLength(1);
      expect((await readReminder(db, owner, first.id)).scheduleVersion).toBe(
        version,
      );
      expect((await deliver(claims[0])).status).toBe("sent");
      await batch();
      if (version === 1) {
        const next = await readReminder(db, owner, first.id);
        expect(next.dueDate).toBe("2026-11-01");
        expect(next.deadlineNotificationEnabled).toBe(true);
        expect(
          (await queue(first.id))
            .filter((row) => row.status === "pending")
            .map((row) => row.thresholdPercent)
            .sort((a, b) => a - b),
        ).toEqual([50, 75, 90, 100]);
      }
    }
    expect((await readReminder(db, owner, first.id)).status).toBe("completed");
    expect(sent).toBe(2);
    expect(
      (await queue(first.id)).filter(
        (row) => row.thresholdPercent === 100 && row.status === "sent",
      ),
    ).toHaveLength(2);
  });
  it("advances once across concurrent workers and calculates fresh 50/75/90 schedules", async () => {
    const first = await legacyCreate(input);
    expect(await queue(first.id)).toHaveLength(3);
    now = new Date("2026-10-25T14:00Z");
    await Promise.all([batch(), batch()]);
    const next = await readReminder(db, owner, first.id);
    expect(next.dueDate).toBe("2026-11-01");
    expect(next.createdAt).toEqual(first.createdAt);
    expect(next.occurrenceAnchorAt).toEqual(first.dueAt);
    expect(next.scheduleVersion).toBe(2);
    const rows = await queue(first.id);
    expect(rows.filter((row) => row.status === "cancelled")).toHaveLength(3);
    const future = rows.filter((row) => row.status === "pending");
    expect(future).toHaveLength(3);
    for (const row of future)
      expect(row.scheduledFor.getTime()).toBe(
        first.dueAt.getTime() +
          Math.floor(
            ((next.dueAt.getTime() - first.dueAt.getTime()) *
              row.thresholdPercent) /
              100,
          ),
      );
    now = new Date("2026-10-31T23:00Z");
    const claimed = await batch();
    expect(claimed.examined).toContain(first.id);
    expect(claimed.claims).toHaveLength(1);
    expect(
      (await queue(first.id)).find((row) => row.id === claimed.claims[0].id)
        ?.thresholdPercent,
    ).toBe(90);
    await service.transition(owner, first.id, "complete", {
      expectedRevision: next.revision,
    });
    now = new Date("2026-11-03T12:00Z");
    await batch();
    expect((await readReminder(db, owner, first.id)).status).toBe("completed");
    expect(
      (await queue(first.id)).filter((row) =>
        ["pending", "processing"].includes(row.status),
      ),
    ).toHaveLength(0);
  });
  it("skips missed occurrences, preserves the calendar anchor on text edits, and stops at its end date", async () => {
    const first = await legacyCreate({
      ...input,
      recurrence: { ...input.recurrence, endsOn: "2026-11-08" },
    });
    const edited = await service.edit(owner, first.id, {
      expectedRevision: first.revision,
      title: "Polished meeting title",
    });
    expect(edited.scheduleVersion).toBe(first.scheduleVersion);
    await db
      .update(scheduledNotifications)
      .set({ status: "sent", sentAt: now })
      .where(eq(scheduledNotifications.reminderId, first.id));
    now = new Date("2026-11-02T12:00Z");
    await batch();
    const next = await readReminder(db, owner, first.id);
    expect(next.dueDate).toBe("2026-11-08");
    expect(next.occurrenceAnchorAt).toEqual(new Date("2026-11-01T14:00Z"));
    now = new Date("2026-11-08T14:00Z");
    await batch();
    expect((await readReminder(db, owner, first.id)).status).toBe("completed");
    await expect(
      service.transition(owner, first.id, "reopen"),
    ).rejects.toMatchObject({ code: "recurrence_ended" });
  });
  it("rolls back the cursor if next-occurrence queue insertion fails", async () => {
    const first = await legacyCreate(input);
    const name = `repeat_fail_${owner.userId.replaceAll("-", "")}`;
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reminder_id = '${first.id}' AND NEW.schedule_version > 1 THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${name} BEFORE INSERT ON scheduled_notifications FOR EACH ROW EXECUTE FUNCTION ${name}()`,
      ),
    );
    try {
      now = new Date("2026-10-25T14:00Z");
      await expect(batch()).rejects.toThrow();
      expect((await readReminder(db, owner, first.id)).scheduleVersion).toBe(1);
      expect(
        (await queue(first.id)).every((row) => row.status === "pending"),
      ).toBe(true);
    } finally {
      await db.execute(
        sql.raw(`DROP TRIGGER IF EXISTS ${name} ON scheduled_notifications`),
      );
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${name}()`));
    }
  });
});
