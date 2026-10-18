import { handleReminders } from "@/lib/reminders/server";
export const runtime = "nodejs";
export const GET = (request: Request) => handleReminders(request);
export const POST = (request: Request) => handleReminders(request);
