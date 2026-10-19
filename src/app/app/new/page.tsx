import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { readPreferences } from "@/repositories/preferences";
import { ReminderCapture } from "@/components/reminder-capture";
import Link from "next/link";
import { Icon } from "@/components/icon";
export default async function NewReminderPage() {
  const { owner } = await requirePageSession();
  const preferences = await readPreferences(getDatabase(), owner);
  return (
    <main className="narrow-page">
      <Link href="/app" className="breadcrumb">
        <Icon name="back" size={15} />
        Back to your reminders
      </Link>
      <div className="page-heading compact">
        <div>
          <p className="eyebrow">A THOUGHT WORTH KEEPING</p>
          <h1 className="page-title">Let’s take it off your mind.</h1>
          <p className="page-description">
            Big plans or little things. There’s room for all of it.
          </p>
        </div>
      </div>
      {!preferences.reviewedAt && (
        <p className="mt-4 text-sm text-stone-600">
          Review your time zone below, or{" "}
          <Link href="/app/settings" className="underline">
            update your settings
          </Link>
          .
        </p>
      )}
      <ReminderCapture
        timeZone={preferences.timeZone}
        detectTimeZone={!preferences.reviewedAt}
      />
    </main>
  );
}
