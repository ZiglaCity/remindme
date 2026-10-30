import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { getWebEnvironment } from "@/lib/env/server";
import { readReminder, notificationHistory } from "@/repositories/reminders";
import { reminderIdInput } from "@/lib/validation/reminders";
import { AppError } from "@/lib/http/errors";
import { deadlineFields } from "@/services/scheduling/deadline";
import { formatDeadline } from "@/lib/reminders/display";
import { ReminderEditor } from "@/components/reminder-editor";
import Link from "next/link";
import { Icon } from "@/components/icon";
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
      <Link href="/app" className="breadcrumb">
        <Icon name="back" size={15} />
        Back to your reminders
      </Link>
      <p className="eyebrow">A THOUGHT YOU MADE ROOM FOR</p>
      <h1 className="page-title">{reminder.title}</h1>
      <div className="detail-summary">
        <Icon name="calendar" size={15} />
        <span>{formatDeadline(reminder)}</span>
        <span className="pill today-pill">
          {reminder.status === "completed"
            ? "Completed"
            : reminder.dueAt <= new Date()
              ? "Overdue"
              : "Active"}
        </span>
      </div>
      <div className="detail-grid">
        <section aria-label="Reminder details">
          <ReminderEditor
            key={id}
            initial={{
              id,
              title: reminder.title,
              description: reminder.description,
              priority: reminder.priority,
              revision: reminder.revision,
              status: reminder.status,
              recurrence: reminder.recurrence,
              deadlineNotificationEnabled: reminder.deadlineNotificationEnabled,
              deadline: deadlineFields(reminder),
            }}
          />
          {reminder.sourceText && (
            <details className="original-thought">
              <summary>Original thought</summary>
              <p>{reminder.sourceText}</p>
            </details>
          )}
        </section>
        <section className="schedule-panel">
          <p className="eyebrow">A LITTLE NUDGE, ALONG THE WAY</p>
          <h2>Notification schedule</h2>
          <p>
            {getWebEnvironment().EMAIL_DELIVERY_ENABLED
              ? "Email check-ins are enabled for approved recipients."
              : "Email delivery isn’t active yet. Your reminder is saved."}
          </p>
          {!notifications.length && (
            <p className="mt-4 text-sm">No notifications scheduled.</p>
          )}
          <ul className="schedule-list">
            {notifications.map((notification) => (
              <li key={notification.id} className="text-sm">
                <strong>{notification.thresholdPercent}% check-in</strong>
                <span>
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: reminder.timeZone,
                  }).format(notification.scheduledFor)}{" "}
                  · {notification.status}
                </span>
                {notification.scheduleVersion !== reminder.scheduleVersion && (
                  <span className="text-stone-500">
                    {" "}
                    ·{" "}
                    {reminder.recurrence
                      ? "Previous occurrence or schedule"
                      : "Previous deadline"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
