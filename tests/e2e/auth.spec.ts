import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { createDatabase } from "../../src/lib/db/connection";
import { user } from "../../src/lib/db/schema";

const emails = ["a", "b"].map(
  (name) => `browser-${name}-${process.env.REMINDME_E2E_RUN_ID}@example.test`,
);
const password = `Browser-test-${randomUUID()}`;
test.skip(
  !process.env.TEST_DATABASE_URL,
  "An isolated TEST_DATABASE_URL is required for auth browser tests.",
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
test("register, reload, isolate preferences, sign out, and sign back in", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill("Browser Tester A");
  await page.getByLabel("Email", { exact: true }).fill(emails[0]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your reminders" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Time zone", { exact: true }).fill("Africa/Accra");
  await page.getByRole("button", { name: "Confirm time zone" }).click();
  await expect(page.getByRole("status")).toHaveText("Time zone saved.");
  const other = await browser.newContext({ baseURL });
  try {
    const registered = await other.request.post("/api/auth/sign-up/email", {
      headers: { origin: baseURL! },
      data: { name: "Browser Tester B", email: emails[1], password },
    });
    expect(registered.status()).toBe(200);
    const secondId = (await registered.json()).user.id;
    expect(
      (
        await other.request.patch("/api/settings", {
          headers: { origin: baseURL! },
          data: { timeZone: "Asia/Tokyo" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.patch("/api/settings", {
          headers: { origin: baseURL! },
          data: { timeZone: "UTC", userId: secondId },
        })
      ).status(),
    ).toBe(400);
    const secondPreferences = await other.request.get("/api/settings");
    expect((await secondPreferences.json()).timeZone).toBe("Asia/Tokyo");
    expect(
      (
        await page.request.patch("/api/settings", {
          headers: { origin: "https://attacker.example" },
          data: { timeZone: "UTC" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await other.close();
  }
  await page.reload();
  await expect(page.getByLabel("Time zone", { exact: true })).toHaveValue(
    "Africa/Accra",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/settings")).status()).toBe(401);
  await page.getByLabel("Email", { exact: true }).fill(emails[0]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
});
