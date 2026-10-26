import { getDatabase } from "@/lib/db/server";
import { getAuth } from "@/lib/auth/server";
import { getWebEnvironment } from "@/lib/env/server";
import { createSettingsHandler } from "@/services/preferences";
import { errorResponse } from "@/lib/http/errors";
export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    const env = getWebEnvironment();
    return await createSettingsHandler(
      getDatabase(),
      getAuth(),
      env.BETTER_AUTH_URL,
    )(request);
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const PATCH = handle;
