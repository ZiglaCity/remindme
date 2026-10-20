import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/lib/db/connection";
import { account, user } from "../../src/lib/db/schema";
import { createAuth } from "../../src/lib/auth/core";
import { parseEnvironment, webEnvSchema } from "../../src/lib/env/schema";
import { createAuthHandler } from "../../src/services/auth";

config({
  path: [".env.test.local", ".env.test", ".env.local", ".env"],
  quiet: true,
});
const { db, pool } = createDatabase({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
});
const suffix = randomUUID();
const emails = ["existing", "new", "unverified"].map(
  (name) => `oauth-${name}-${suffix}@example.test`,
);
const origin = "http://localhost:3000";
const auth = createAuth(
  db,
  parseEnvironment(webEnvSchema, {
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
    BETTER_AUTH_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
    GOOGLE_CLIENT_ID: "synthetic-client",
    GOOGLE_CLIENT_SECRET: "synthetic-secret",
    TESTER_EMAIL_ALLOWLIST: emails.join(","),
  }),
);
const handle = createAuthHandler(auth);
const password = `Synthetic-password-${suffix}`;
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
const post = (path: string, body: unknown) =>
  handle(
    new Request(origin + "/api/auth" + path, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./migrations" });
});
afterAll(async () => {
  vi.restoreAllMocks();
  try {
    await db.delete(user).where(inArray(user.email, emails));
  } finally {
    await pool.end();
  }
});

it("links verified Google to the existing password user, creates new Google users, and rejects unverified claims", async () => {
  const registered = await post("/sign-up/email", {
    name: "Existing fixture",
    email: emails[0],
    password,
  });
  expect(registered.status).toBe(200);
  const originalId = (await registered.json()).user.id;
  const provider = (await auth.$context).socialProviders.find(
    (provider) => provider.id === "google",
  )!;
  let claims = {
    sub: suffix + "-existing",
    email: emails[0],
    name: "OAuth fixture",
    email_verified: true,
  };
  // Mock Google's exchange only. Real state cookies, profile mapping, linking,
  // PostgreSQL users/accounts and session creation run through the HTTP adapter.
  vi.spyOn(provider, "validateAuthorizationCode").mockImplementation(
    async () => ({
      accessToken: "synthetic-access-token",
      idToken: [
        "e30",
        Buffer.from(JSON.stringify(claims)).toString("base64url"),
        "synthetic",
      ].join("."),
    }),
  );
  async function google() {
    const start = await post("/sign-in/social", {
      provider: "google",
      callbackURL: "/app",
      errorCallbackURL: "/login?error=oauth",
    });
    expect(start.status).toBe(200);
    const state = new URL((await start.json()).url).searchParams.get("state")!;
    return handle(
      new Request(
        origin +
          "/api/auth/callback/google?" +
          new URLSearchParams({
            state,
            code: "synthetic-code",
            iss: "https://accounts.google.com",
          }),
        {
          headers: { cookie: cookieFrom(start) },
        },
      ),
    );
  }
  const linked = await google();
  expect(linked.status).toBe(302);
  expect(new URL(linked.headers.get("location")!, origin).pathname).toBe(
    "/app",
  );
  const session = await handle(
    new Request(origin + "/api/auth/get-session", {
      headers: { cookie: cookieFrom(linked) },
    }),
  );
  expect((await session.json()).user.id).toBe(originalId);
  const accounts = await db
    .select()
    .from(account)
    .where(eq(account.userId, originalId));
  expect(accounts.map((row) => row.providerId).sort()).toEqual([
    "credential",
    "google",
  ]);
  expect(
    (await post("/sign-in/email", { email: emails[0], password })).status,
  ).toBe(200);

  claims = { ...claims, sub: suffix + "-new", email: emails[1] };
  const created = await google();
  expect(created.status).toBe(302);
  expect(new URL(created.headers.get("location")!, origin).pathname).toBe(
    "/app",
  );
  expect(
    await db.select().from(user).where(eq(user.email, emails[1])),
  ).toHaveLength(1);
  expect((await google()).status).toBe(302);
  expect(
    await db.select().from(user).where(eq(user.email, emails[1])),
  ).toHaveLength(1);

  claims = {
    ...claims,
    sub: suffix + "-unverified",
    email: emails[2],
    email_verified: false,
  };
  const denied = await google();
  expect([302, 403]).toContain(denied.status);
  expect(
    denied.headers
      .getSetCookie()
      .some((cookie) => cookie.includes("session_token=")),
  ).toBe(false);
  expect(
    await db.select().from(user).where(eq(user.email, emails[2])),
  ).toHaveLength(0);
});
