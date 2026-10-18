import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
config({
  path: [".env.test.local", ".env.test", ".env.local", ".env"],
  quiet: true,
});
process.env.REMINDME_E2E_RUN_ID ??= randomUUID();
const testEmails = ["a", "b"].map(
  (name) => `browser-${name}-${process.env.REMINDME_E2E_RUN_ID}@example.test`,
);
const baseURL = "http://127.0.0.1:3100";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...(process.env.TEST_DATABASE_URL
        ? { DATABASE_URL: process.env.TEST_DATABASE_URL }
        : {}),
      BETTER_AUTH_SECRET: "e2e-test-only-" + process.env.REMINDME_E2E_RUN_ID,
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      TESTER_ACCESS_MODE: "allowlist",
      TESTER_EMAIL_ALLOWLIST: testEmails.join(","),
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
    timeout: 120_000,
  },
});
