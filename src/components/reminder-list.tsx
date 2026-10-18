import Link from "next/link";
import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { listReminders } from "@/repositories/reminders";
import { paginationInput } from "@/lib/validation/reminders";
import { formatDeadline } from "@/lib/reminders/display";
import { ReminderActions } from "./reminder-actions";
import { readPreferences } from "@/repositories/preferences";

export async function ReminderList({
  completed = false,
  searchParams,
}: {
  completed?: boolean;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { owner } = await requirePageSession();
  const preferences = await readPreferences(getDatabase(), owner);
  const query = paginationInput.safeParse(await searchParams);
  if (!query.success)
    return (
      <main>
        <h1 className="text-2xl font-semibold">Invalid page</h1>
        <Link
          href={completed ? "/app/completed" : "/app"}
          className="mt-5 block underline"
        >
          Return to reminders
        </Link>
      </main>
    );
  const result = await listReminders(
    getDatabase(),
    owner,
    completed ? "completed" : "active",
    query.data.page,
    query.data.pageSize,
  );
  const base = completed ? "/app/completed" : "/app";
  const now = new Date();
  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">
          {completed ? "Completed reminders" : "Your reminders"}
        </h1>
        <Link
          href="/app/new"
          className="rounded-lg bg-emerald-900 px-4 py-3 text-sm font-medium text-white"
        >
          New reminder
        </Link>
      </div>
      <p className="mt-4 text-sm text-stone-600">
        Email notifications are not enabled yet.
      </p>
      {!preferences.reviewedAt && !completed && (
        <p className="mt-4 text-sm text-stone-600">
          <Link href="/app/settings" className="underline">
            Review your time zone
          </Link>{" "}
          before adding deadlines.
        </p>
      )}
      {!result.items.length && (
        <p className="mt-10 border-y border-stone-200 py-10 text-stone-600">
          {completed
            ? "No completed reminders yet."
            : "Nothing to remember yet. Add your first reminder."}
        </p>
      )}
      <ul className="mt-6 divide-y divide-stone-200">
        {result.items.map((reminder) => (
          <li key={reminder.id} className="py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Link
                href={`/app/reminders/${reminder.id}`}
                className="text-lg font-medium underline decoration-stone-300 underline-offset-4"
              >
                {reminder.title}
              </Link>
              {reminder.status === "active" && reminder.dueAt <= now && (
                <span className="text-sm font-medium text-red-800">
                  Overdue
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-stone-600">
              {formatDeadline(reminder)}
            </p>
            {reminder.priority !== "normal" && (
              <p className="mt-1 text-sm text-stone-600">
                {reminder.priority === "high" ? "High" : "Low"} priority
              </p>
            )}
            {reminder.nextNotificationAt && (
              <p className="mt-1 text-xs text-stone-500">
                Next scheduled notification:{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: reminder.timeZone,
                }).format(reminder.nextNotificationAt)}
              </p>
            )}
            <ReminderActions
              id={reminder.id}
              revision={reminder.revision}
              status={reminder.status}
              afterDelete={base}
            />
          </li>
        ))}
      </ul>
      <nav
        aria-label="Reminder pages"
        className="mt-8 flex justify-between text-sm"
      >
        {result.page > 1 ? (
          <Link
            className="underline"
            href={`${base}?page=${result.page - 1}&pageSize=${result.pageSize}`}
          >
            Previous page
          </Link>
        ) : (
          <span />
        )}
        {result.hasMore && (
          <Link
            className="underline"
            href={`${base}?page=${result.page + 1}&pageSize=${result.pageSize}`}
          >
            Next page
          </Link>
        )}
      </nav>
    </main>
  );
}
