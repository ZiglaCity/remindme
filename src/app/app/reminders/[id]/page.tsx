import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { readReminder, notificationHistory } from "@/repositories/reminders";
import { reminderIdInput } from "@/lib/validation/reminders";
import { AppError } from "@/lib/http/errors";
import { deadlineFields } from "@/services/scheduling/deadline";
import { formatDeadline } from "@/lib/reminders/display";
import { ReminderEditor } from "@/components/reminder-editor";
export default async function ReminderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { owner } = await requirePageSession();
  const { id } = await params;
  if (!reminderIdInput.safeParse(id).success) notFound();
  const db = getDatabase();
  const reminder = await readReminder(db, owner, id).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  const notifications = await notificationHistory(db, owner, id);
  return (
    <main>
      <h1 className="text-3xl font-semibold">{reminder.title}</h1>
      <p className="mt-3 text-sm text-stone-600">{formatDeadline(reminder)}</p>
      <p className="mt-2 text-sm font-medium">
        {reminder.status === "completed"
          ? "Completed"
          : reminder.dueAt <= new Date()
            ? "Overdue"
            : "Active"}
      </p>
      <ReminderEditor
        key={id}
        initial={{
          id,
          title: reminder.title,
          description: reminder.description,
          priority: reminder.priority,
          revision: reminder.revision,
          status: reminder.status,
          deadline: deadlineFields(reminder),
        }}
      />
      <section className="mt-12 border-t border-stone-200 pt-6">
        <h2 className="text-xl font-semibold">Notification schedule</h2>
        <p className="mt-2 text-sm text-stone-600">
          Email notifications are not enabled yet.
        </p>
        {!notifications.length && (
          <p className="mt-4 text-sm">No notifications scheduled.</p>
        )}
        <ul className="mt-4 space-y-3">
          {notifications.map((notification) => (
            <li key={notification.id} className="text-sm">
              <span>
                {notification.thresholdPercent}% ·{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: reminder.timeZone,
                }).format(notification.scheduledFor)}{" "}
                · {notification.status}
              </span>
              {notification.scheduleVersion !== reminder.scheduleVersion && (
                <span className="text-stone-500"> · Previous deadline</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
