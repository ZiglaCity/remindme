import { config } from "dotenv";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/lib/db/connection";
import {
  reminders,
  scheduledNotifications,
  notificationAttempts,
  user,
} from "../../src/lib/db/schema";
import { createAuth } from "../../src/lib/auth/core";
import { webEnvSchema, parseEnvironment } from "../../src/lib/env/schema";
import { createReminderService } from "../../src/services/reminders/service";
import { createRemindersHandler } from "../../src/services/reminders/http";
import {
  readReminder,
  listReminders,
  notificationHistory,
  attemptHistory,
} from "../../src/repositories/reminders";
import { savePreferences } from "../../src/repositories/preferences";

config({
  path: [".env.test.local", ".env.test", ".env.local", ".env"],
  quiet: true,
});
const suffix = randomUUID();
const emails = ["a", "b"].map(
  (letter) => `reminder-${letter}-${suffix}@example.test`,
);
const env = parseEnvironment(webEnvSchema, {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  BETTER_AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  TESTER_EMAIL_ALLOWLIST: emails.join(","),
});
const { db, pool } = createDatabase({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
});
const auth = createAuth(db, env);
const fixtures: { userId: string; cookie: string }[] = [];
let now = new Date("2026-10-20T18:00:00Z");
const service = createReminderService(db, () => new Date(now));
const handler = createRemindersHandler(
  db,
  auth,
  env,
  env.BETTER_AUTH_URL,
  () => new Date(now),
);
const input = (title = "Fixture reminder") => ({
  title,
  deadline: {
    type: "date_time",
    date: "2026-10-30",
    time: "18:00",
    timeZone: "UTC",
  },
});
const queue = (id: string) =>
  db
    .select()
    .from(scheduledNotifications)
    .where(eq(scheduledNotifications.reminderId, id));
function request(
  method: string,
  body?: unknown,
  cookie = fixtures[0]?.cookie,
  origin = env.BETTER_AUTH_URL,
  path = "/api/reminders",
) {
  return new Request(`${env.BETTER_AUTH_URL}${path}`, {
    method,
    headers: {
      origin,
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./migrations" });
  for (const email of emails) {
    const response = await auth.handler(
      request(
        "POST",
        { name: "Reminder tester", email, password: `Test-only-${suffix}` },
        "",
        env.BETTER_AUTH_URL,
        "/api/auth/sign-up/email",
      ),
    );
    expect(response.status).toBe(200);
    fixtures.push({
      userId: (await response.json()).user.id,
      cookie: response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; "),
    });
  }
}, 120_000);
afterAll(async () => {
  try {
    await db.delete(user).where(inArray(user.email, emails));
  } finally {
    await pool.end();
  }
}, 30_000);

describe("transactional reminders and schedules", () => {
  it("persists exactly three formula-based notifications and enforces queue constraints", async () => {
    now = new Date("2026-10-20T18:00:00Z");
    const row = await service.create(fixtures[0], input());
    const notifications = (await queue(row.id)).sort(
      (a, b) => a.thresholdPercent - b.thresholdPercent,
    );
    expect(
      notifications.map((item) => item.scheduledFor.toISOString()),
    ).toEqual([
      "2026-10-25T18:00:00.000Z",
      "2026-10-28T06:00:00.000Z",
      "2026-10-29T18:00:00.000Z",
    ]);
    await expect(
      db.insert(scheduledNotifications).values({
        reminderId: row.id,
        thresholdPercent: 50,
        scheduleVersion: 1,
        scheduledFor: now,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(scheduledNotifications).values({
        reminderId: row.id,
        thresholdPercent: 42,
        scheduleVersion: 2,
        scheduledFor: now,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(reminders).values({
        userId: fixtures[0].userId,
        title: " ",
        dueAt: now,
        dueDate: "2026-10-20",
        deadlineType: "date_only",
        timeZone: "UTC",
      }),
    ).rejects.toThrow();
  });
  it("replaces only the changed deadline, retaining sent history and the original anchor", async () => {
    now = new Date("2026-10-20T18:00:00Z");
    let row = await service.create(fixtures[0], input());
    const original = await queue(row.id);
    row = await service.edit(fixtures[0], row.id, {
      title: "Renamed",
      description: "Details",
      expectedRevision: row.revision,
    });
    expect(row.scheduleVersion).toBe(1);
    expect((await queue(row.id)).map((item) => item.id).sort()).toEqual(
      original.map((item) => item.id).sort(),
    );
    await db
      .update(scheduledNotifications)
      .set({ status: "sent", sentAt: new Date("2026-10-25T18:00:00Z") })
      .where(eq(scheduledNotifications.id, original[0].id));
    now = new Date("2026-10-28T18:00:00Z");
    row = await service.edit(fixtures[0], row.id, {
      expectedRevision: row.revision,
      deadline: { type: "date_time", date: "2026-11-01", time: "18:00" },
    });
    expect(row.createdAt.toISOString()).toBe("2026-10-20T18:00:00.000Z");
    expect(row.scheduleVersion).toBe(2);
    const changed = await queue(row.id);
    expect(
      changed.filter(
        (item) => item.scheduleVersion === 1 && item.status === "sent",
      ),
    ).toHaveLength(1);
    expect(
      changed.filter(
        (item) => item.scheduleVersion === 1 && item.status === "cancelled",
      ),
    ).toHaveLength(2);
    expect(
      changed
        .filter((item) => item.scheduleVersion === 2)
        .map((item) => item.thresholdPercent)
        .sort(),
    ).toEqual([75, 90]);
  });
  it("completes and deletes idempotently, cancels claims, and reopens into a new version", async () => {
    now = new Date("2026-10-20T18:00:00Z");
    let row = await service.create(fixtures[0], input());
    const [first] = await queue(row.id);
    await db
      .update(scheduledNotifications)
      .set({ status: "processing", processingStartedAt: now })
      .where(eq(scheduledNotifications.id, first.id));
    const completed = await service.transition(
      fixtures[0],
      row.id,
      "complete",
      { expectedRevision: row.revision },
    );
    now = new Date("2026-10-21T18:00:00Z");
    const repeated = await service.transition(fixtures[0], row.id, "complete", {
      expectedRevision: row.revision,
    });
    expect(repeated.completedAt?.toISOString()).toBe(
      completed.completedAt?.toISOString(),
    );
    expect(repeated.revision).toBe(completed.revision);
    expect(
      (await queue(row.id)).every(
        (item) =>
          item.status === "cancelled" && item.processingStartedAt === null,
      ),
    ).toBe(true);
    row = await service.transition(fixtures[0], row.id, "reopen", {
      expectedRevision: completed.revision,
    });
    expect(row.status).toBe("active");
    expect(row.completedAt).toBeNull();
    expect(row.scheduleVersion).toBe(2);
    expect(
      (await queue(row.id)).filter((item) => item.status === "pending"),
    ).toHaveLength(3);
    const deleted = await service.transition(fixtures[0], row.id, "delete", {
      expectedRevision: row.revision,
    });
    expect(
      (
        await service.transition(fixtures[0], row.id, "delete", {
          expectedRevision: row.revision,
        })
      ).deletedAt?.toISOString(),
    ).toBe(deleted.deletedAt?.toISOString());
    await expect(
      service.transition(fixtures[0], row.id, "reopen"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(readReminder(db, fixtures[0], row.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await queue(row.id)).every((item) => item.status === "cancelled"),
    ).toBe(true);
  });
  it("creates/reopens past-deadline reminders without new notifications and keeps completed edits inactive", async () => {
    now = new Date("2026-11-02T18:00:00Z");
    let row = await service.create(fixtures[0], input());
    expect(await queue(row.id)).toHaveLength(0);
    row = await service.transition(fixtures[0], row.id, "complete");
    row = await service.transition(fixtures[0], row.id, "reopen");
    expect(row.status).toBe("active");
    expect(await queue(row.id)).toHaveLength(0);
    row = await service.transition(fixtures[0], row.id, "complete");
    row = await service.edit(fixtures[0], row.id, {
      expectedRevision: row.revision,
      deadline: { type: "date_only", date: "2026-12-01" },
    });
    expect(row.status).toBe("completed");
    expect(await queue(row.id)).toHaveLength(0);
  });
  it("serializes concurrent edits and rejects the stale revision without duplicate schedules", async () => {
    now = new Date("2026-10-20T18:00:00Z");
    const row = await service.create(fixtures[0], input());
    const results = await Promise.allSettled(
      ["2026-11-02", "2026-11-03"].map((date) =>
        service.edit(fixtures[0], row.id, {
          expectedRevision: row.revision,
          deadline: { type: "date_only", date },
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.some(
        (result) =>
          result.status === "rejected" && result.reason.status === 409,
      ),
    ).toBe(true);
    const notifications = await queue(row.id);
    expect(
      notifications.filter((item) => item.status === "pending"),
    ).toHaveLength(3);
    expect((await readReminder(db, fixtures[0], row.id)).scheduleVersion).toBe(
      2,
    );
  });
  it("keeps existing instants/zones stable when preferences change and applies the new zone only on create", async () => {
    now = new Date("2026-10-20T18:00:00Z");
    await savePreferences(db, fixtures[0], "America/New_York");
    const payload = {
      title: "Date only",
      deadline: { type: "date_only", date: "2026-10-30" },
    };
    const row = await service.create(fixtures[0], payload);
    const original = (await queue(row.id)).map((item) =>
      item.scheduledFor.toISOString(),
    );
    await savePreferences(db, fixtures[0], "Asia/Tokyo");
    expect(
      (await readReminder(db, fixtures[0], row.id)).dueAt.toISOString(),
    ).toBe(row.dueAt.toISOString());
    expect(
      (await queue(row.id)).map((item) => item.scheduledFor.toISOString()),
    ).toEqual(original);
    expect((await service.create(fixtures[0], payload)).timeZone).toBe(
      "Asia/Tokyo",
    );
    const edited = await service.edit(fixtures[0], row.id, {
      expectedRevision: row.revision,
      deadline: { type: "date_only", date: "2026-11-01" },
    });
    expect(edited.timeZone).toBe("America/New_York");
  });
});

it("rolls back reminder creation and schedule replacement when notification persistence fails", async () => {
  now = new Date("2026-10-20T18:00:00Z");
  const name = `queue_failure_${suffix.replaceAll("-", "")}`;
  const marker = `rollback-${suffix}`;
  const row = await service.create(fixtures[0], input(marker));
  // All interpolated identifiers/literals below are generated UUIDs or fixed test prefixes.
  await db.execute(
    sql.raw(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM reminders WHERE id = NEW.reminder_id AND title IN ('${marker}', '${marker}-create')) AND (NEW.schedule_version > 1 OR EXISTS (SELECT 1 FROM reminders WHERE id = NEW.reminder_id AND title = '${marker}-create')) THEN RAISE EXCEPTION 'fixture queue failure'; END IF; RETURN NEW; END; $$`,
    ),
  );
  try {
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${name} BEFORE INSERT ON scheduled_notifications FOR EACH ROW EXECUTE FUNCTION ${name}()`,
      ),
    );
    await expect(
      service.create(fixtures[0], input(`${marker}-create`)),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(reminders)
        .where(
          and(
            eq(reminders.userId, fixtures[0].userId),
            eq(reminders.title, `${marker}-create`),
          ),
        ),
    ).toHaveLength(0);
    await expect(
      service.edit(fixtures[0], row.id, {
        expectedRevision: row.revision,
        deadline: { type: "date_only", date: "2026-11-01" },
      }),
    ).rejects.toThrow();
    const unchanged = await readReminder(db, fixtures[0], row.id);
    expect(unchanged.scheduleVersion).toBe(1);
    expect(unchanged.revision).toBe(1);
    expect(unchanged.dueAt.toISOString()).toBe(row.dueAt.toISOString());
    expect(
      (await queue(row.id)).every(
        (item) => item.status === "pending" && item.scheduleVersion === 1,
      ),
    ).toBe(true);
  } finally {
    await db.execute(
      sql.raw(`DROP TRIGGER IF EXISTS ${name} ON scheduled_notifications`),
    );
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${name}()`));
  }
}, 60_000);

it("enforces ownership through every HTTP operation, history join, and repository path", async () => {
  now = new Date("2026-10-20T18:00:00Z");
  const foreign = await service.create(
    fixtures[1],
    input("Private B reminder"),
  );
  const [notification] = await queue(foreign.id);
  await db.insert(notificationAttempts).values({
    notificationId: notification.id,
    result: "fixture",
    errorCategory: "fixture_only",
  });
  for (const [method, action, body] of [
    ["GET", undefined, undefined],
    ["PATCH", undefined, { title: "Stolen", expectedRevision: 1 }],
    ["POST", "complete", {}],
    ["POST", "reopen", {}],
    ["DELETE", undefined, {}],
  ] as const) {
    expect(
      (await handler(request(method, body), { id: foreign.id, action })).status,
    ).toBe(404);
  }
  await expect(readReminder(db, fixtures[0], foreign.id)).rejects.toMatchObject(
    { status: 404 },
  );
  await expect(
    notificationHistory(db, fixtures[0], foreign.id),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    attemptHistory(db, fixtures[0], foreign.id),
  ).rejects.toMatchObject({ status: 404 });
  expect(await attemptHistory(db, fixtures[1], foreign.id)).toHaveLength(1);
  const ownList = await listReminders(db, fixtures[0], "active", 1, 100);
  expect(
    ownList.items.every((item) => item.userId === fixtures[0].userId),
  ).toBe(true);
  expect((await handler(request("GET", undefined, ""))).status).toBe(401);
  expect(
    (await handler(request("POST", { ...input(), userId: fixtures[1].userId })))
      .status,
  ).toBe(400);
  expect(
    (
      await handler(
        request(
          "POST",
          input(),
          fixtures[0].cookie,
          "https://attacker.example",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handler(
        request(
          "GET",
          undefined,
          fixtures[0].cookie,
          env.BETTER_AUTH_URL,
          "/api/reminders?pageSize=101",
        ),
      )
    ).status,
  ).toBe(400);
  const page = await handler(
    request(
      "GET",
      undefined,
      fixtures[0].cookie,
      env.BETTER_AUTH_URL,
      "/api/reminders?pageSize=1",
    ),
  );
  const data = await page.json();
  expect(data.items).toHaveLength(1);
  expect(data.hasMore).toBe(true);
}, 60_000);
