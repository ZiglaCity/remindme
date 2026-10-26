import { describe, expect, it } from "vitest";
import {
  parseEnvironment,
  webEnvSchema,
  workerEnvSchema,
} from "../../src/lib/env/schema";

import { resolveWebEnvironment } from "../../src/lib/env/web";

const web = {
  DATABASE_URL: "postgresql://tester:placeholder@localhost/remindme",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};
const worker = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: web.DATABASE_URL,
  SMTP_HOST: "smtp.example.com",
  SMTP_SECURE: "false",
  SMTP_USER: "test",
  SMTP_PASS: "placeholder",
  EMAIL_FROM: "test@example.com",
};
describe("runtime-specific environment validation", () => {
  it("allows web settings without SMTP, Gemini or tester admission configuration", () => {
    const env = parseEnvironment(webEnvSchema, {
      ...web,
      TESTER_ACCESS_MODE: "allowlist",
      TESTER_EMAIL_ALLOWLIST: "",
    });
    expect(env.BETTER_AUTH_URL).toBe(web.BETTER_AUTH_URL);
    expect(env).not.toHaveProperty("TESTER_ACCESS_MODE");
  });
  it("allows worker settings without web/auth/AI secrets", () => {
    expect(parseEnvironment(workerEnvSchema, worker).WORKER_BATCH_SIZE).toBe(
      25,
    );
  });
  it.each([0, 101, "invalid"])("rejects invalid batch size %s", (size) => {
    expect(() =>
      parseEnvironment(workerEnvSchema, { ...worker, WORKER_BATCH_SIZE: size }),
    ).toThrow("WORKER_BATCH_SIZE");
  });
  it("rejects insecure port 465 configuration", () => {
    expect(() =>
      parseEnvironment(workerEnvSchema, { ...worker, SMTP_PORT: 465 }),
    ).toThrow();
  });
  it("does not echo invalid credentials in errors", () => {
    let message = "";
    try {
      parseEnvironment(webEnvSchema, {
        ...web,
        DATABASE_URL: "private-password",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("Invalid environment settings: DATABASE_URL");
    expect(message).not.toContain("private-password");
  });
});

it("uses Vercel's production domain despite stale local URLs, and normalizes trailing paths", () => {
  const resolved = resolveWebEnvironment({
    ...web,
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "remindme.example",
  });
  expect(resolved.BETTER_AUTH_URL).toBe("https://remindme.example");
  expect(resolved.NEXT_PUBLIC_APP_URL).toBe("https://remindme.example");
  expect(
    resolveWebEnvironment({
      ...web,
      BETTER_AUTH_URL: "https://custom.example/",
    }).BETTER_AUTH_URL,
  ).toBe("https://custom.example");
});
it("does not adopt the production domain for local or preview environments", () => {
  expect(
    resolveWebEnvironment({
      ...web,
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "remindme.example",
    }).BETTER_AUTH_URL,
  ).toBe(web.BETTER_AUTH_URL);
});
