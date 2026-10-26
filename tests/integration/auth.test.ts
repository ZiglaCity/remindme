import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, inArray } from "drizzle-orm";
import { createHmac, randomUUID } from "node:crypto";
import { createDatabase } from "../../src/lib/db/connection";
import { account, user, rateLimits } from "../../src/lib/db/schema";
import { createAuth } from "../../src/lib/auth/core";
import { createRateLimiter } from "../../src/lib/auth/rate-limit";
import { authorize } from "../../src/lib/auth/authorize";
import { createSettingsHandler } from "../../src/services/preferences";
import { createAuthHandler } from "../../src/services/auth";
import {
  readPreferences,
  savePreferences,
} from "../../src/repositories/preferences";
import { parseEnvironment, webEnvSchema } from "../../src/lib/env/schema";

config({
  path: [".env.test.local", ".env.test", ".env.local", ".env"],
  quiet: true,
});
const suffix = randomUUID();
const emails = [`a-${suffix}@example.com`, `b-${suffix}@example.com`];
const openEmail = `open-${suffix}@example.com`;
const origin = "http://localhost:3000";
const secret = randomUUID() + randomUUID();
const env = parseEnvironment(webEnvSchema, {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
});
const connection = createDatabase({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
});
const auth = createAuth(connection.db, env);
const authHandler = createAuthHandler(auth);
const settings = createSettingsHandler(connection.db, auth, origin);
const identities: { userId: string; cookie: string }[] = [];
const password = `Test-only-${randomUUID()}`;
function request(
  path: string,
  body?: unknown,
  cookie?: string,
  requestOrigin = origin,
) {
  return new Request(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      origin: requestOrigin,
      "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}
beforeAll(async () => {
  await migrate(connection.db, { migrationsFolder: "./migrations" });
  for (let i = 0; i < 2; i++) {
    const response = await authHandler(
      request("/api/auth/sign-up/email", {
        name: `Tester ${i}`,
        email: emails[i],
        password,
      }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Object.hasOwn(data, "token")).toBe(false);
    identities.push({ userId: data.user.id, cookie: cookieFrom(response) });
    expect(
      response.headers
        .getSetCookie()
        .some(
          (cookie) =>
            cookie.toLowerCase().includes("httponly") &&
            cookie.toLowerCase().includes("samesite=lax"),
        ),
    ).toBe(true);
    expect(data.user.emailVerified).toBe(false);
  }
}, 120_000);
afterAll(async () => {
  try {
    await connection.db
      .delete(user)
      .where(inArray(user.email, [...emails, openEmail]));
  } finally {
    await connection.pool.end();
  }
}, 30_000);

describe("real Better Auth and owner boundaries", () => {
  it("admits an unlisted account without tester access configuration", async () => {
    const openAuth = createAuth(connection.db, env);
    const response = await createAuthHandler(openAuth)(
      request("/api/auth/sign-up/email", {
        name: "Open access tester",
        email: openEmail,
        password,
      }),
    );
    expect(response.status).toBe(200);
    const current = await authorize(
      openAuth,
      new Headers({ cookie: cookieFrom(response) }),
    );
    expect(current.user.email).toBe(openEmail);
  });
  it("hides session internals and disables non-V1 auth endpoints", async () => {
    const response = await authHandler(
      request("/api/auth/get-session", undefined, identities[0].cookie),
    );
    const data = await response.json();
    expect(Object.hasOwn(data.session, "token")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      (
        await authHandler(
          request(
            "/api/auth/get-access-token",
            { providerId: "google" },
            identities[0].cookie,
          ),
        )
      ).status,
    ).toBe(404);
    const secureAuth = createAuth(connection.db, {
      ...env,
      BETTER_AUTH_URL: "https://example.com",
    });
    expect(
      (await secureAuth.$context).authCookies.sessionToken.attributes.secure,
    ).toBe(true);
  });
  it("persists sessions, uses supported password hashing, and rejects unauthenticated settings", async () => {
    const current = await authorize(
      auth,
      new Headers({ cookie: identities[0].cookie }),
    );
    expect(current.owner.userId).toBe(identities[0].userId);
    const [credentials] = await connection.db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, identities[0].userId));
    expect(
      Boolean(credentials.password && credentials.password !== password),
    ).toBe(true);
    expect((await settings(request("/api/settings"))).status).toBe(401);
    expect(
      (
        await settings(
          request(
            "/api/settings",
            undefined,
            "better-auth.session_token=forged",
          ),
        )
      ).status,
    ).toBe(401);
  });
  it("isolates preferences through both the HTTP handler and repository", async () => {
    await savePreferences(
      connection.db,
      { userId: identities[1].userId },
      "Asia/Tokyo",
    );
    const mutation = new Request(`${origin}/api/settings`, {
      method: "PATCH",
      headers: {
        cookie: identities[0].cookie,
        origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timeZone: "Atlantic/Reykjavik" }),
    });
    expect((await settings(mutation)).status).toBe(200);
    const attempt = new Request(`${origin}/api/settings`, {
      method: "PATCH",
      headers: {
        cookie: identities[0].cookie,
        origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timeZone: "UTC", userId: identities[1].userId }),
    });
    expect((await settings(attempt)).status).toBe(400);
    expect(
      (await readPreferences(connection.db, { userId: identities[1].userId }))
        .timeZone,
    ).toBe("Asia/Tokyo");
    const response = await settings(
      request("/api/settings", undefined, identities[0].cookie),
    );
    expect((await response.json()).timeZone).toBe("Atlantic/Reykjavik");
  });
  it("blocks foreign origins and invalid preferences", async () => {
    const mutation = (body: unknown, requestOrigin: string) =>
      new Request(`${origin}/api/settings`, {
        method: "PATCH",
        headers: {
          cookie: identities[0].cookie,
          origin: requestOrigin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    expect(
      (
        await settings(
          mutation({ timeZone: "UTC" }, "https://attacker.example"),
        )
      ).status,
    ).toBe(403);
    expect(
      (await settings(mutation({ timeZone: "Fake/Zone" }, origin))).status,
    ).toBe(400);
    expect(
      (
        await auth.handler(
          request(
            "/api/auth/sign-in/email",
            { email: emails[0], password },
            undefined,
            "https://attacker.example",
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("enables same-email linking but does not trust an unverified Google profile", async () => {
    expect(auth.options.account?.accountLinking).toMatchObject({
      enabled: true,
      requireLocalEmailVerified: false,
      trustedProviders: [],
      allowDifferentEmails: false,
    });
    const googleAuth = createAuth(connection.db, {
      ...env,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    });
    const provider = (await googleAuth.$context).socialProviders.find(
      (provider) => provider.id === "google",
    );
    expect(Boolean(provider)).toBe(true);
    // Real OAuth exchange needs Google credentials. Exercise our verified-claim gate directly.
    const mapping = googleAuth.options.socialProviders.google;
    if (!mapping || typeof mapping === "function")
      throw new Error("Google configuration unavailable");
    await expect(async () =>
      mapping.mapProfileToUser!({
        email: emails[0],
        email_verified: false,
      } as never),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });
  it("signs in with credentials, rejects a wrong password, and invalidates sign-out sessions", async () => {
    const failed = await auth.handler(
      request("/api/auth/sign-in/email", {
        email: emails[0],
        password: "incorrect-password",
      }),
    );
    expect(failed.status).toBe(401);
    const response = await auth.handler(
      request("/api/auth/sign-in/email", { email: emails[0], password }),
    );
    expect(response.status).toBe(200);
    const cookie = cookieFrom(response);
    const current = await authorize(auth, new Headers({ cookie }));
    expect(current.owner.userId).toBe(identities[0].userId);
    expect(
      (await auth.handler(request("/api/auth/sign-out", {}, cookie))).status,
    ).toBe(200);
    await expect(
      authorize(auth, new Headers({ cookie })),
    ).rejects.toMatchObject({ status: 401 });
  });
});

it("returns HTTP 429 with retry indication for an exhausted account window", async () => {
  const digest = createHmac("sha256", secret)
    .update(`account-auth:${emails[0]}`)
    .digest("hex");
  try {
    await connection.db
      .insert(rateLimits)
      .values({
        key: digest,
        count: 10,
        expiresAt: new Date(Date.now() + 900_000),
      })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: 10, expiresAt: new Date(Date.now() + 900_000) },
      });
    const response = await authHandler(
      request("/api/auth/sign-in/email", { email: emails[0], password }),
    );
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after")) > 0).toBe(true);
  } finally {
    await connection.db.delete(rateLimits).where(eq(rateLimits.key, digest));
  }
});

it("enforces atomic shared limits across separate pools and resets expired windows", async () => {
  const second = createDatabase({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
  });
  const key = `concurrency:${suffix}`;
  const digest = createHmac("sha256", secret).update(key).digest("hex");
  try {
    const firstLimiter = createRateLimiter(connection.db, secret);
    const secondLimiter = createRateLimiter(second.db, secret);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? firstLimiter : secondLimiter)(key, { window: 900, max: 3 }),
      ),
    );
    expect(results.filter((result) => result.allowed).length).toBe(3);
    expect(
      results
        .filter((result) => !result.allowed)
        .every((result) => Number(result.retryAfter) > 0),
    ).toBe(true);
    await connection.db
      .update(rateLimits)
      .set({ expiresAt: new Date(0) })
      .where(eq(rateLimits.key, digest));
    expect((await secondLimiter(key, { window: 900, max: 3 })).allowed).toBe(
      true,
    );
  } finally {
    await connection.db.delete(rateLimits).where(eq(rateLimits.key, digest));
    await second.pool.end();
  }
}, 60_000);
