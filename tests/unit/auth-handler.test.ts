import { expect, it } from "vitest";
import { APIError } from "better-auth/api";
import type { Auth } from "../../src/lib/auth/core";
import { createAuthHandler } from "../../src/services/auth";

it("does not JSON-parse empty OAuth redirect responses", async () => {
  const headers = new Headers({
    Location: "http://localhost:3000/app",
    "Content-Type": "application/json",
    "Set-Cookie": "session_token=synthetic; Path=/; HttpOnly",
  });
  const auth = {
    handler: async () => new Response(null, { status: 302, headers }),
  } as unknown as Auth;
  const response = await createAuthHandler(auth)(
    new Request("http://localhost:3000/api/auth/callback/google"),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("http://localhost:3000/app");
  expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("preserves OAuth redirects and cookies when the framework throws a redirect APIError", async () => {
  const headers = new Headers({
    Location: "http://localhost:3000/login?error=oauth",
  });
  headers.append("Set-Cookie", "oauth_state=; Path=/; Max-Age=0; HttpOnly");
  const auth = {
    handler: async () => {
      throw new APIError("FOUND", undefined, headers);
    },
  } as unknown as Auth;
  const response = await createAuthHandler(auth)(
    new Request("http://localhost:3000/api/auth/callback/google"),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "http://localhost:3000/login?error=oauth",
  );
  expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
  expect(response.headers.get("cache-control")).toBe("no-store");
});
