"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { ReminderDraft } from "@/lib/validation/ai";
import { SessionRecovery } from "./session-recovery";
import type { Recurrence } from "@/lib/validation/recurrence";
const subscribe = () => () => {};
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export type ReminderFormInitial = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "normal" | "high";
  revision: number;
  recurrence?: Recurrence | null;
  deadlineNotificationEnabled?: boolean;
  deadline: {
    type: "date_only" | "date_time";
    date: string;
    time: string;
    timeZone: string;
  };
};
export function ReminderForm({
  timeZone,
  initial,
  draft,
  sourceText,
  detectTimeZone = false,
  onSaved,
  onCancel,
}: {
  timeZone: string;
  initial?: ReminderFormInitial;
  draft?: ReminderDraft;
  sourceText?: string;
  detectTimeZone?: boolean;
  onCancel?: () => void;
  onSaved?: (saved: {
    revision: number;
    status: "active" | "completed" | "archived";
  }) => void;
}) {
  const router = useRouter();
  const values = initial ?? draft;
  const detectedZone = useSyncExternalStore(
    subscribe,
    browserZone,
    () => timeZone,
  );
  const [enteredZone, setEnteredZone] = useState<string | null>(
    values?.deadline.timeZone ?? null,
  );
  const currentZone = enteredZone ?? (detectTimeZone ? detectedZone : timeZone);
  const [kind, setKind] = useState(values?.deadline.type ?? "date_time");
  const [repeat, setRepeat] = useState<"none" | Recurrence["frequency"]>(
    values?.recurrence?.frequency ?? "none",
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    values?.recurrence?.weekdays ?? [],
  );
  const [revision, setRevision] = useState(initial?.revision);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [conflict, setConflict] = useState(false);
  const field =
    "mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-3";
  return (
    <form
      className="mt-8 space-y-5 reminder-form"
      aria-busy={busy || created}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || created) return;
        setError("");
        setExpired(false);
        setConflict(false);
        const form = new FormData(event.currentTarget);
        const deadline = {
          type: kind,
          date: String(form.get("date")),
          timeZone: String(form.get("timeZone")),
          ...(kind === "date_time" ? { time: String(form.get("time")) } : {}),
        };
        const payload = {
          title: String(form.get("title")),
          description: String(form.get("description")) || null,
          priority: String(form.get("priority")),
          deadline,
          recurrence:
            repeat === "none"
              ? null
              : {
                  frequency: repeat,
                  interval: Number(form.get("repeatInterval")),
                  weekdays: repeat === "weekly" ? weekdays : [],
                  monthDay:
                    repeat === "monthly"
                      ? Number(form.get("monthDay")) || null
                      : null,
                  endsOn: String(form.get("repeatEnd")) || null,
                },
          ...(initial ? { expectedRevision: revision } : {}),
          ...(!initial && sourceText ? { sourceText } : {}),
        };
        setBusy(true);
        try {
          const response = await fetch(
            initial ? `/api/reminders/${initial.id}` : "/api/reminders",
            {
              method: initial ? "PATCH" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          const result = await response.json();
          if (!response.ok) {
            setExpired(response.status === 401);
            setError(
              result.error?.message ??
                "Couldn’t save this reminder. Please try again.",
            );
            setConflict(response.status === 409);
          } else {
            setRevision(result.reminder.revision);
            onSaved?.(result.reminder);
            if (initial) router.refresh();
            else {
              setCreated(true);
              router.replace(`/app/reminders/${result.reminder.id}`);
            }
          }
        } catch {
          setError(
            "Couldn’t connect. Your input is still here; please try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset
        disabled={busy || created}
        className="space-y-5 disabled:opacity-60"
      >
        <SessionRecovery visible={expired} />
        <label className="block">
          Title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={values?.title ?? ""}
            className={field}
          />
        </label>
        <label className="block">
          Description <span className="text-sm text-stone-500">(optional)</span>
          <textarea
            name="description"
            rows={3}
            maxLength={2000}
            defaultValue={values?.description ?? ""}
            className={field}
          />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="deadline-type" className="block">
              Deadline type
            </label>
            <select
              id="deadline-type"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
              className={field}
            >
              <option value="date_time">Date and time</option>
              <option value="date_only">Date only</option>
            </select>
          </div>
          <div>
            <label htmlFor="reminder-priority" className="block">
              Priority
            </label>
            <select
              id="reminder-priority"
              name="priority"
              defaultValue={values?.priority ?? "normal"}
              className={field}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            Date
            <input
              type="date"
              name="date"
              required
              min="0001-01-01"
              max="9999-12-31"
              defaultValue={values?.deadline.date ?? ""}
              className={field}
            />
          </label>
          {kind === "date_time" && (
            <label className="block">
              Time
              <input
                type="time"
                name="time"
                required
                step={60}
                defaultValue={values?.deadline.time ?? ""}
                className={field}
              />
            </label>
          )}
        </div>
        <label className="block">
          Time zone
          <input
            name="timeZone"
            required
            maxLength={100}
            value={currentZone}
            onChange={(event) => setEnteredZone(event.target.value)}
            className={field}
          />
        </label>
        {kind === "date_only" && (
          <p className="text-sm text-stone-600">
            Date-only deadlines use 11:59 PM in the chosen time zone.
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="reminder-repeat" className="block">
              Repeats
            </label>
            <select
              id="reminder-repeat"
              value={repeat}
              onChange={(event) =>
                setRepeat(event.target.value as typeof repeat)
              }
              className={field}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {repeat !== "none" && (
            <div>
              <label htmlFor="repeat-interval" className="block">
                Repeat every
              </label>
              <input
                id="repeat-interval"
                name="repeatInterval"
                type="number"
                required
                min={1}
                max={365}
                defaultValue={values?.recurrence?.interval ?? 1}
                className={field}
              />
              <span className="text-sm text-stone-600">
                {repeat === "daily"
                  ? "day(s)"
                  : repeat === "weekly"
                    ? "week(s)"
                    : "month(s)"}
              </span>
            </div>
          )}
        </div>
        {repeat === "weekly" && (
          <fieldset className="space-y-2">
            <legend className="font-medium">Repeat on</legend>
            <div className="flex flex-wrap gap-3">
              {[
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ].map((day, index) => (
                <label key={day} className="repeat-day flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={weekdays.includes(index + 1)}
                    onChange={(event) =>
                      setWeekdays((previous) =>
                        event.target.checked
                          ? [...previous, index + 1].sort((a, b) => a - b)
                          : previous.filter((value) => value !== index + 1),
                      )
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
            <p className="text-sm text-stone-600">
              Leave all unchecked to repeat on the first date’s weekday. The
              first date must match a selected day.
            </p>
          </fieldset>
        )}
        {repeat !== "none" && (
          <>
            {repeat === "monthly" && (
              <div>
                <label htmlFor="repeat-month-day" className="block">
                  Day of month (optional)
                </label>
                <input
                  id="repeat-month-day"
                  aria-describedby="repeat-month-day-help"
                  name="monthDay"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={values?.recurrence?.monthDay ?? ""}
                  className={field}
                />
                <span
                  id="repeat-month-day-help"
                  className="text-sm text-stone-600"
                >
                  Leave blank to use the first date’s day. Shorter months use
                  their last day.
                </span>
              </div>
            )}
            <label className="block">
              Repeat until (optional)
              <input
                type="date"
                name="repeatEnd"
                min="0001-01-01"
                max="9999-12-31"
                defaultValue={values?.recurrence?.endsOn ?? ""}
                className={field}
              />
            </label>
            <p className="text-sm text-stone-600">
              Each occurrence gets advance check-ins at 50%, 75% and 90% of its
              interval.
              {(!initial || initial.deadlineNotificationEnabled) &&
                " A final reminder is scheduled for the due time (100%)."}{" "}
              Mark complete stops the entire repeating reminder. Monthly dates
              use the last day when needed; repeats keep this time zone.
            </p>
          </>
        )}
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
        <button className="rounded-lg bg-emerald-900 px-5 py-3 font-medium text-white">
          {busy
            ? "Saving…"
            : created
              ? "Opening reminder…"
              : initial
                ? "Save changes"
                : "Save reminder"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="button button-outline ml-3"
          >
            Cancel editing
          </button>
        )}
        {conflict && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-4 underline"
          >
            Reload saved version
          </button>
        )}
      </fieldset>
    </form>
  );
}
