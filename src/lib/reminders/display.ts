export function formatDeadline(reminder: {
  dueAt: Date | string;
  dueDate: string;
  deadlineType: "date_only" | "date_time";
  timeZone: string;
}) {
  if (reminder.deadlineType === "date_only")
    return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${reminder.dueDate}T12:00:00Z`))} · ${reminder.timeZone}`;
  return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: reminder.timeZone }).format(new Date(reminder.dueAt))} · ${reminder.timeZone}`;
}
