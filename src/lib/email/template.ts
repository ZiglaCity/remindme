import { formatDeadline } from "../reminders/display";

export type ReminderEmail = {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date;
  dueDate: string;
  deadlineType: "date_only" | "date_time";
  timeZone: string;
  thresholdPercent: number;
};
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
export function reminderEmail(reminder: ReminderEmail, appUrl: string) {
  const base = new URL(appUrl);
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error("Invalid application URL");
  const link = new URL(
    `/app/reminders/${encodeURIComponent(reminder.id)}`,
    base,
  ).href;
  const deadline = formatDeadline(reminder);
  const context = `${reminder.thresholdPercent}% of the time between creation and the deadline has elapsed.`;
  const dateOnly =
    reminder.deadlineType === "date_only"
      ? "Date-only deadline; ends at 11:59 PM in the displayed time zone."
      : "";
  return {
    subject: `RemindMe: ${reminder.title.replace(/[\r\n\t]+/g, " ")}`,
    text: [
      reminder.title,
      reminder.description,
      `Deadline: ${deadline}`,
      dateOnly,
      context,
      `View reminder: ${link}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    html: `<!doctype html><html lang="en"><body><h1>${escapeHtml(reminder.title)}</h1>${reminder.description ? `<p style="white-space:pre-wrap">${escapeHtml(reminder.description)}</p>` : ""}<p><strong>Deadline:</strong> ${escapeHtml(deadline)}</p>${dateOnly ? `<p>${escapeHtml(dateOnly)}</p>` : ""}<p>${escapeHtml(context)}</p><p><a href="${escapeHtml(link)}">View reminder</a></p></body></html>`,
  };
}
