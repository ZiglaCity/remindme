import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/authorize";
import { getAuth } from "@/lib/auth/server";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { getDatabase } from "@/lib/db/server";
import { userPreferences } from "@/lib/db/schema";
import { getWebEnvironment } from "@/lib/env/server";
import { readBoundedBody } from "@/lib/http/body";
import { AppError, errorResponse } from "@/lib/http/errors";
import { parseInput } from "@/lib/validation/ai";
import { createGeminiParser } from "@/services/ai/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    const env = getWebEnvironment();
    const { owner } = await authorize(getAuth(), request.headers, env);
    if (request.headers.get("origin") !== new URL(env.BETTER_AUTH_URL).origin)
      throw new AppError(
        403,
        "invalid_origin",
        "Request origin is not allowed.",
      );
    let body: unknown;
    const text = await readBoundedBody(request, 32_768);
    try {
      body = JSON.parse(text);
    } catch {
      throw new AppError(
        400,
        "invalid_input",
        "Enter a reminder of up to 4,000 characters.",
      );
    }
    const input = parseInput.safeParse(body);
    if (!input.success)
      throw new AppError(
        400,
        "invalid_input",
        "Check your reminder and clarification answers. You can also enter it manually.",
      );
    const db = getDatabase();
    const limit = await createRateLimiter(db, env.BETTER_AUTH_SECRET)(
      `ai:parse:${owner.userId}`,
      { max: 10, window: 60 },
    );
    if (!limit.allowed)
      return Response.json(
        {
          error: {
            code: "rate_limited",
            message:
              "You’ve reached 10 interpretations this minute. Wait a moment or enter your reminder manually.",
          },
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(limit.retryAfter),
          },
        },
      );
    // Read only: interpretation never creates preferences, reminders or schedules.
    const [preferences] = await db
      .select({ timeZone: userPreferences.timeZone })
      .from(userPreferences)
      .where(eq(userPreferences.userId, owner.userId));
    const result = await createGeminiParser(
      env.GEMINI_API_KEY,
      env.GEMINI_MODEL,
    )(input.data, preferences?.timeZone ?? "UTC", new Date(), request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
