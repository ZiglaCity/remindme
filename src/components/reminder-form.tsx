"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
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
  detectTimeZone = false,
  onSaved,
}: {
  timeZone: string;
  initial?: ReminderFormInitial;
  detectTimeZone?: boolean;
  onSaved?: (saved: {
    revision: number;
    status: "active" | "completed" | "archived";
  }) => void;
}) {
  const router = useRouter();
  const detectedZone = useSyncExternalStore(
    subscribe,
    browserZone,
    () => timeZone,
  );
  const [enteredZone, setEnteredZone] = useState<string | null>(
    initial?.deadline.timeZone ?? null,
  );
  const currentZone = enteredZone ?? (detectTimeZone ? detectedZone : timeZone);
  const [kind, setKind] = useState(initial?.deadline.type ?? "date_time");
  const [revision, setRevision] = useState(initial?.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const field =
    "mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-3";
  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
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
          ...(initial ? { expectedRevision: revision } : {}),
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
            setError(
              result.error?.message ??
                "Couldn’t save this reminder. Please try again.",
            );
            setConflict(response.status === 409);
          } else {
            setRevision(result.reminder.revision);
            onSaved?.(result.reminder);
            if (initial) router.refresh();
            else router.replace(`/app/reminders/${result.reminder.id}`);
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
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <label className="block">
          Title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={initial?.title ?? ""}
            className={field}
          />
        </label>
        <label className="block">
          Description <span className="text-sm text-stone-500">(optional)</span>
          <textarea
            name="description"
            rows={3}
            maxLength={2000}
            defaultValue={initial?.description ?? ""}
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
              defaultValue={initial?.priority ?? "normal"}
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
              defaultValue={initial?.deadline.date ?? ""}
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
                defaultValue={initial?.deadline.time ?? ""}
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
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
        <button className="rounded-lg bg-emerald-900 px-5 py-3 font-medium text-white">
          {busy ? "Saving…" : initial ? "Save changes" : "Save reminder"}
        </button>
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
