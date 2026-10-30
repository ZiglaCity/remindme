import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { createDatabase } from "../../src/lib/db/connection";
import { user } from "../../src/lib/db/schema";

const emails = ["c", "d"].map(
  (name) => `browser-${name}-${process.env.REMINDME_E2E_RUN_ID}@example.test`,
);
const password = `Reminder-browser-${randomUUID()}`;
const date = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
test.skip(
  !process.env.TEST_DATABASE_URL,
  "An isolated TEST_DATABASE_URL is required.",
);
test.beforeAll(async () => {
  const { db, pool } = createDatabase({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
  });
  try {
    await migrate(db, { migrationsFolder: "./migrations" });
  } finally {
    await pool.end();
  }
});
test.afterAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;
  const { db, pool } = createDatabase({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
  });
  try {
    await db.delete(user).where(inArray(user.email, emails));
  } finally {
    await pool.end();
  }
});
test("manual CRUD preserves schedules, handles stale edits, and isolates accounts", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const signedUp = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL! },
    data: { name: "Reminder Browser C", email: emails[0], password },
  });
  expect(signedUp.status()).toBe(200);
  await page.goto("/app");
  await page.getByRole("link", { name: "New reminder", exact: true }).click();
  const source =
    "Join the research meeting every Sunday morning and bring progress notes";
  const sunday = (7 - new Date().getUTCDay()) % 7 || 7;
  await page.getByLabel("What do you need to remember?").fill(source);
  // Real protected endpoint, with no provider key in the isolated browser server.
  await page
    .getByRole("button", { name: "Preview reminder", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "unavailable",
  );
  await expect(page.getByLabel("What do you need to remember?")).toHaveValue(
    source,
  );
  let calls = 0;
  await page.route("**/api/ai/parse", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.text).toBe(source);
    calls++;
    if (calls === 1)
      await route.fulfill({
        json: {
          status: "clarify",
          question: "What exact time on Sunday morning?",
        },
      });
    else {
      expect(input.clarification).toEqual([
        { question: "What exact time on Sunday morning?", answer: "9 AM" },
      ]);
      await route.fulfill({
        json: {
          status: "ready",
          draft: {
            title: "AI report",
            description:
              "Join the weekly research meeting and bring your progress notes.",
            priority: "normal",
            recurrence: {
              frequency: "weekly",
              interval: 1,
              weekdays: [7],
              monthDay: null,
              endsOn: null,
            },
            deadline: {
              type: "date_time",
              date: date(sunday),
              time: "09:00",
              timeZone: "UTC",
            },
          },
        },
      });
    }
  });
  await page
    .getByRole("button", { name: "Preview reminder", exact: true })
    .click();
  await page.getByLabel("What exact time on Sunday morning?").fill("9 AM");
  await page
    .getByRole("button", { name: "Use this answer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review and confirm" }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/reminders")).json()).items,
  ).toHaveLength(0);
  await page.getByLabel("Title", { exact: true }).fill("Corrected AI report");
  await expect(page.getByLabel("Repeats", { exact: true })).toHaveValue(
    "weekly",
  );
  await expect(
    page.getByRole("checkbox", { name: "Sunday", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("Description", { exact: false })).toHaveValue(
    "Join the weekly research meeting and bring your progress notes.",
  );
  await page.getByLabel("Date", { exact: true }).fill(date(sunday + 7));
  await page
    .getByRole("button", { name: "Save reminder", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/reminders\/[\w-]+$/);
  const parsedId = new URL(page.url()).pathname.split("/").at(-1)!;
  const parsed = (
    await (await page.request.get(`/api/reminders/${parsedId}`)).json()
  ).reminder;
  expect(parsed.title).toBe("Corrected AI report");
  expect(parsed.dueDate).toBe(date(sunday + 7));
  expect(parsed.recurrence.weekdays).toEqual([7]);
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit reminder", exact: true }),
  ).toBeVisible();
  expect(parsed.sourceText).toBe(source);
  expect(
    (
      await page.request.delete(`/api/reminders/${parsedId}`, {
        headers: { origin: baseURL! },
        data: { expectedRevision: parsed.revision },
      })
    ).status(),
  ).toBe(200);
  await page.unroute("**/api/ai/parse");
  await page.goto("/app/new");
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Browser manual reminder");
  await page
    .getByLabel("Description", { exact: false })
    .fill("Keep my original input.");
  await page
    .getByLabel("Deadline type", { exact: true })
    .selectOption("date_only");
  const initialDate = date(30);
  await page.getByLabel("Date", { exact: true }).fill(initialDate);
  await page.getByLabel("Time zone", { exact: true }).fill("UTC");
  await page
    .getByRole("button", { name: "Save reminder", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/reminders\/[\w-]+$/);
  await expect(
    page.getByRole("heading", { name: "Browser manual reminder", exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const read = async () =>
    (await page.request.get(`/api/reminders/${id}`)).json();
  let detail = await read();
  expect(detail.reminder.dueAt).toBe(`${initialDate}T23:59:00.000Z`);
  expect(detail.reminder.deadlineType).toBe("date_only");
  expect(detail.notifications).toHaveLength(4);
  const originalIds = detail.notifications
    .map((item: { id: string }) => item.id)
    .sort();
  const anchor = Date.parse(detail.reminder.createdAt);
  for (const notification of detail.notifications)
    expect(Date.parse(notification.scheduledFor)).toBe(
      anchor +
        Math.floor(
          ((Date.parse(detail.reminder.dueAt) - anchor) *
            notification.thresholdPercent) /
            100,
        ),
    );
  await page
    .getByRole("button", { name: "Edit reminder", exact: true })
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Renamed browser reminder");
  let saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/reminders/${id}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      name: "Renamed browser reminder",
      exact: true,
    }),
  ).toBeVisible();
  detail = await read();
  expect(detail.reminder.scheduleVersion).toBe(1);
  expect(
    detail.notifications.map((item: { id: string }) => item.id).sort(),
  ).toEqual(originalIds);
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit reminder", exact: true })
    .click();
  const external = await page.request.patch(`/api/reminders/${id}`, {
    headers: { origin: baseURL! },
    data: {
      expectedRevision: detail.reminder.revision,
      description: "Changed in another tab",
    },
  });
  expect(external.status()).toBe(200);
  await page.getByLabel("Title", { exact: true }).fill("Unsaved draft");
  saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/reminders/${id}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await saved).status()).toBe(409);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Unsaved draft",
  );
  await expect(
    page.getByText("This reminder changed.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload saved version" }).click();
  await page
    .getByRole("button", { name: "Edit reminder", exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Renamed browser reminder",
  );
  await page.getByLabel("Date", { exact: true }).fill(date(40));
  saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/reminders/${id}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await saved).status()).toBe(200);
  detail = await read();
  expect(detail.reminder.scheduleVersion).toBe(2);
  expect(
    detail.notifications.filter(
      (item: { status: string }) => item.status === "cancelled",
    ),
  ).toHaveLength(4);
  expect(
    detail.notifications.filter(
      (item: { status: string }) => item.status === "pending",
    ),
  ).toHaveLength(4);
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reopen", exact: true }),
  ).toBeVisible();
  expect(
    (await read()).notifications.filter(
      (item: { status: string }) => item.status === "pending",
    ),
  ).toHaveLength(0);
  await page.getByRole("link", { name: "Completed", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Renamed browser reminder", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Renamed browser reminder", exact: true }),
  ).toHaveCount(0);
  detail = await read();
  expect(detail.reminder.scheduleVersion).toBe(3);
  const other = await browser.newContext({ baseURL });
  try {
    expect(
      (
        await other.request.post("/api/auth/sign-up/email", {
          headers: { origin: baseURL! },
          data: { name: "Reminder Browser D", email: emails[1], password },
        })
      ).status(),
    ).toBe(200);
    expect((await other.request.get(`/api/reminders/${id}`)).status()).toBe(
      404,
    );
    expect(
      (
        await other.request.post(`/api/reminders/${id}/complete`, {
          headers: { origin: baseURL! },
          data: {},
        })
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
  await page.goto("/app");
  await page
    .getByRole("link", { name: "Renamed browser reminder", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/reminders/${id}$`));
  await expect(
    page.getByRole("heading", {
      name: "Renamed browser reminder",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await page.request.get(`/api/reminders/${id}`)).status()).toBe(200);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete reminder", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("link", { name: "Renamed browser reminder", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get(`/api/reminders/${id}`)).status()).toBe(404);
});
