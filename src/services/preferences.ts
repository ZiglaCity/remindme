import type { Auth } from "../lib/auth/core";
import { authorize } from "../lib/auth/authorize";
import { preferencesInput, type AccessPolicy } from "../lib/auth/policy";
import { AppError, errorResponse } from "../lib/http/errors";
import {
  readPreferences,
  savePreferences,
  type Database,
} from "../repositories/preferences";
import { readBoundedBody } from "../lib/http/body";

export function createSettingsHandler(
  db: Database,
  auth: Auth,
  policy: AccessPolicy,
  origin: string,
) {
  return async (request: Request) => {
    try {
      const { owner } = await authorize(auth, request.headers, policy);
      if (request.method === "GET")
        return Response.json(await readPreferences(db, owner), {
          headers: { "Cache-Control": "no-store" },
        });
      if (request.headers.get("origin") !== new URL(origin).origin)
        throw new AppError(
          403,
          "invalid_origin",
          "Request origin is not allowed.",
        );
      const text = await readBoundedBody(request, 1024);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new AppError(400, "invalid_input", "Enter a valid time zone.");
      }
      const parsed = preferencesInput.safeParse(body);
      if (!parsed.success)
        throw new AppError(
          400,
          "invalid_input",
          "Enter a valid time zone; account identifiers cannot be changed here.",
        );
      return Response.json(
        await savePreferences(db, owner, parsed.data.timeZone),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return errorResponse(error);
    }
  };
}
