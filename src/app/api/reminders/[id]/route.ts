import { handleReminders } from "@/lib/reminders/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function handle(request: Request, context: Context) {
  return handleReminders(request, { id: (await context.params).id });
}
export const GET = handle;
export const PATCH = handle;
export const DELETE = handle;
