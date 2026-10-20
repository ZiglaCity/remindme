import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
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
const password = `Synthetic-password-${suffix}`;
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

async function fixture() {
  // A fresh secret isolates each scenario's PostgreSQL rate-limit namespace.
  // Sharing four social starts in one fixture exceeded the framework's 3/10s
  // limit on fast CI, but not on the slower remote development test database.
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
  const post = (path: string, body: unknown) =>
    handle(
      new Request(origin + "/api/auth" + path, {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const provider = (await auth.$context).socialProviders.find(
    (provider) => provider.id === "google",
  )!;
  let claims = {
    sub: "",
    email: "",
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
  async function google(email: string, verified = true) {
    claims = {
      ...claims,
      email,
      sub: `${suffix}-${email}`,
      email_verified: verified,
    };
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
  return { post, google, handle };
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./migrations" });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  try {
    await db.delete(user).where(inArray(user.email, emails));
  } finally {
    await pool.end();
  }
});

it("links verified Google to the existing password user and preserves password sign-in", async () => {
  const { post, google, handle } = await fixture();
  const registered = await post("/sign-up/email", {
    name: "Existing fixture",
    email: emails[0],
    password,
  });
  expect(registered.status).toBe(200);
  const originalId = (await registered.json()).user.id;
  const linked = await google(emails[0]);
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
});

it("creates a new Google user once and signs the returning identity in", async () => {
  const { google } = await fixture();
  const created = await google(emails[1]);
  expect(created.status).toBe(302);
  expect(new URL(created.headers.get("location")!, origin).pathname).toBe(
    "/app",
  );
  expect(
    await db.select().from(user).where(eq(user.email, emails[1])),
  ).toHaveLength(1);
  expect((await google(emails[1])).status).toBe(302);
  expect(
    await db.select().from(user).where(eq(user.email, emails[1])),
  ).toHaveLength(1);
});

it("rejects an unverified Google profile without creating a user or session", async () => {
  const { google } = await fixture();
  const denied = await google(emails[2], false);
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
