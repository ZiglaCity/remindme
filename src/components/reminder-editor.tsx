"use client";
import { useState } from "react";
import { ReminderForm, type ReminderFormInitial } from "./reminder-form";
import { ReminderActions } from "./reminder-actions";
import { formatRecurrence } from "@/lib/reminders/recurrence-display";

type State = { revision: number; status: "active" | "completed" | "archived" };
export function ReminderEditor({
  initial,
}: {
  initial: ReminderFormInitial & State;
}) {
  const [saved, setSaved] = useState<State | null>(null);
  const [editing, setEditing] = useState(false);
  // A successful local save is immediately usable even while the server page refreshes.
  const current = saved && saved.revision > initial.revision ? saved : initial;
  return (
    <>
      <ReminderActions
        id={initial.id}
        revision={current.revision}
        status={current.status}
        recurring={Boolean(initial.recurrence)}
        onChanged={setSaved}
      />
      {editing ? (
        <>
          <ReminderForm
            timeZone={initial.deadline.timeZone}
            initial={initial}
            onSaved={(value) => {
              setSaved(value);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </>
      ) : (
        <section className="settings-card mt-6" aria-label="Saved reminder">
          <div>
            <p className="eyebrow">REMINDER DETAILS</p>
            <h2>About this reminder</h2>
            {initial.description && (
              <p className="whitespace-pre-wrap">{initial.description}</p>
            )}
            <p>Priority: {initial.priority}</p>
            <p>{formatRecurrence(initial.recurrence)}</p>
            <button
              type="button"
              className="button button-outline mt-4"
              onClick={() => setEditing(true)}
            >
              Edit reminder
            </button>
          </div>
        </section>
      )}
    </>
  );
}
