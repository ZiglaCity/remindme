import type { Auth } from "../lib/auth/core";
import { isAPIError } from "better-auth/api";
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
      // Redirects can inherit a JSON content type but have no JSON body.
      // Parsing them would turn a normal OAuth callback into a generic 500.
      if ([302, 303, 307, 308].includes(response.status)) {
        headers.delete("content-type");
        headers.delete("content-length");
        return new Response(null, { status: response.status, headers });
      }
      if (headers.get("Content-Type")?.includes("application/json")) {
        headers.delete("content-length");
        return Response.json(publicResult(await response.json()), {
          status: response.status,
          headers,
        });
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      // OAuth uses redirect APIErrors for successful and rejected callbacks.
      // Preserve their Location/Set-Cookie headers instead of reporting a 500.
      if (
        isAPIError(error) &&
        [302, 303, 307, 308].includes(error.statusCode)
      ) {
        const headers = new Headers(error.headers);
        if (headers.has("Location")) {
          headers.set("Cache-Control", "no-store");
          return new Response(null, { status: error.statusCode, headers });
        }
      }
      return errorResponse(error);
    }
  };
}
