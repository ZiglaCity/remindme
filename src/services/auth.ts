import type { Auth } from "../lib/auth/core";
import { readBoundedBody } from "../lib/http/body";
import { errorResponse } from "../lib/http/errors";

const routes = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/social",
  "/get-session",
  "/sign-out",
  "/callback/google",
  "/error",
]);
const privateFields = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "password",
  "ipAddress",
  "userAgent",
]);
function publicResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicResult);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateFields.has(key))
        .map(([key, entry]) => [key, publicResult(entry)]),
    );
  return value;
}
// Better Auth owns sessions/cookies; this adapter limits V1 surface and response fields.
export function createAuthHandler(auth: Auth) {
  return async (request: Request) => {
    try {
      const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
      if (!routes.has(path))
        return Response.json(
          { error: { code: "not_found", message: "Not found." } },
          { status: 404 },
        );
      const bounded =
        request.method === "POST"
          ? new Request(request, {
              body: await readBoundedBody(request, 16_384),
            })
          : request;
      const response = await auth.handler(bounded);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      if (headers.has("X-Retry-After"))
        headers.set("Retry-After", headers.get("X-Retry-After")!);
      if (headers.get("Content-Type")?.includes("application/json")) {
        headers.delete("content-length");
        return Response.json(publicResult(await response.json()), {
          status: response.status,
          headers,
        });
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
