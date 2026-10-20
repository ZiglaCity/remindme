import type { Recurrence } from "../validation/recurrence";
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function formatRecurrence(rule?: Recurrence | null) {
  if (!rule) return "Does not repeat";
  const unit = { daily: "day", weekly: "week", monthly: "month" }[
    rule.frequency
  ];
  const frequency =
    rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
  const weekdays =
    rule.frequency === "weekly" && rule.weekdays.length
      ? ` on ${rule.weekdays.map((day) => days[day - 1]).join(", ")}`
      : "";
  return `${frequency}${weekdays}${rule.frequency === "monthly" && rule.monthDay ? ` on day ${rule.monthDay} (last day in shorter months)` : ""}${rule.endsOn ? ` · through ${rule.endsOn}` : ""}`;
}
