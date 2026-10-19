import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/lib/db/connection";
import { user } from "../../src/lib/db/schema";
const emails = ["e", "f"].map(
  (name) => `browser-${name}-${process.env.REMINDME_E2E_RUN_ID}@example.test`,
);
const password = `Pwa-browser-${randomUUID()}`;
test.skip(
  !process.env.TEST_DATABASE_URL,
  "An isolated test database is required.",
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
  const { db, pool } = createDatabase({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
  });
  try {
    await db.delete(user).where(inArray(user.email, emails));
  } finally {
    await pool.end();
  }
});
test("responsive dashboard, real filters and private-safe offline installation shell", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1050 });
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { origin: baseURL! },
        data: { name: "Alex Morgan", email: emails[0], password },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch("/api/settings", {
        headers: { origin: baseURL! },
        data: { timeZone: "UTC" },
      })
    ).status(),
  ).toBe(200);
  const date = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  let privateId = "";
  for (const [title, days, priority] of [
    ["Send the little project into the world", 2, "high"],
    ["Make time for a proper catch-up", 4, "normal"],
    ["Book the annual check-up", 7, "low"],
    ["Return the library books", -1, "normal"],
  ] as const) {
    const response = await page.request.post("/api/reminders", {
      headers: { origin: baseURL! },
      data: {
        title,
        description:
          days === 2
            ? "The last few details, then a well-earned deep breath."
            : null,
        priority,
        deadline: { type: "date_only", date: date(days), timeZone: "UTC" },
      },
    });
    expect(response.status()).toBe(201);
    const data = await response.json();
    if (days === 2) privateId = data.reminder.id;
  }
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Your reminders", exact: false }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.screenshot({
    path: testInfo.outputPath("dashboard-desktop.png"),
    fullPage: true,
    caret: "initial",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Overdue", exact: false }).click();
  await expect(
    page.getByRole("link", { name: "Return the library books", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Send the little project into the world",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto("/app");
  await page
    .getByRole("searchbox", { name: "Search reminders" })
    .fill("annual");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Book the annual check-up", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return the library books", exact: true }),
  ).toHaveCount(0);
  await page.goto("/app");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("dashboard-mobile.png"),
    fullPage: true,
    caret: "initial",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/app/new");
  await page.screenshot({
    path: testInfo.outputPath("capture-mobile.png"),
    fullPage: true,
    caret: "initial",
  });
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await page.goto(`/app/reminders/${privateId}`);
  await page.screenshot({
    path: testInfo.outputPath("detail-mobile.png"),
    fullPage: true,
    caret: "initial",
  });
  const privateResponse = await page.request.get(`/api/reminders/${privateId}`);
  expect(privateResponse.headers()["cache-control"]).toContain("no-store");
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  expect(installability.installabilityErrors).toEqual([]);
  expect(manifest.start_url).toBe("/app");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons)
    expect((await page.request.get(icon.src)).status()).toBe(200);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys())
        urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(
    cached.every(
      (path) => path === "/offline.html" || path.startsWith("/icons/"),
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.goto(`/app/reminders/${privateId}`);
  await expect(
    page.getByRole("heading", { name: "A little pause." }),
  ).toBeVisible();
  await expect(
    page.getByText("Send the little project into the world", { exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { origin: baseURL! },
        data: { name: "Second account", email: emails[1], password },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/app");
  await expect(
    page.getByText("Send the little project into the world", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "A fresh page. A clearer mind." }),
  ).toBeVisible();
});
