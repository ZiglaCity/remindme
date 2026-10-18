"use client";
import { useState } from "react";
import { ReminderForm, type ReminderFormInitial } from "./reminder-form";
import { ReminderActions } from "./reminder-actions";

type State = { revision: number; status: "active" | "completed" | "archived" };
export function ReminderEditor({
  initial,
}: {
  initial: ReminderFormInitial & State;
}) {
  const [saved, setSaved] = useState<State | null>(null);
  // A successful local save is immediately usable even while the server page refreshes.
  const current = saved && saved.revision > initial.revision ? saved : initial;
  return (
    <>
      <ReminderActions
        id={initial.id}
        revision={current.revision}
        status={current.status}
        onChanged={setSaved}
      />
      <ReminderForm
        timeZone={initial.deadline.timeZone}
        initial={initial}
        onSaved={setSaved}
      />
    </>
  );
}
