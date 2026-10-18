import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { readPreferences } from "@/repositories/preferences";
import { ReminderForm } from "@/components/reminder-form";
import Link from "next/link";
export default async function NewReminderPage() {
  const { owner } = await requirePageSession();
  const preferences = await readPreferences(getDatabase(), owner);
  return (
    <main>
      <h1 className="text-3xl font-semibold">New reminder</h1>
      {!preferences.reviewedAt && (
        <p className="mt-4 text-sm text-stone-600">
          Review your time zone below, or{" "}
          <Link href="/app/settings" className="underline">
            update your settings
          </Link>
          .
        </p>
      )}
      <ReminderForm
        timeZone={preferences.timeZone}
        detectTimeZone={!preferences.reviewedAt}
      />
    </main>
  );
}
