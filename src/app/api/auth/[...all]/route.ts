import { getAuth } from "@/lib/auth/server";
import { errorResponse } from "@/lib/http/errors";
import { createAuthHandler } from "@/services/auth";
export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    return await createAuthHandler(getAuth())(request);
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
