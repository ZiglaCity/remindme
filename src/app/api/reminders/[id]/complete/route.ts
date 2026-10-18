import { handleReminders } from "@/lib/reminders/server";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleReminders(request, {
    id: (await context.params).id,
    action: "complete",
  });
}
