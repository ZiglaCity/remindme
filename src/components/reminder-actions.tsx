"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import { SessionRecovery } from "./session-recovery";
export function ReminderActions({
  id,
  revision,
  status,
  afterDelete = "/app",
  onChanged,
  recurring = false,
}: {
  id: string;
  revision: number;
  status: "active" | "completed" | "archived";
  afterDelete?: string;
  recurring?: boolean;
  onChanged?: (saved: {
    revision: number;
    status: "active" | "completed" | "archived";
  }) => void;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [local, setLocal] = useState<{
    revision: number;
    status: typeof status;
  } | null>(null);
  const current =
    local && local.revision > revision ? local : { revision, status };
  async function act(action: "complete" | "reopen" | "delete") {
    setBusy(true);
    setError("");
    setExpired(false);
    try {
      const response = await fetch(
        `/api/reminders/${id}${action === "delete" ? "" : `/${action}`}`,
        {
          method: action === "delete" ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: current.revision }),
        },
      );
      if (!response.ok) {
        setExpired(response.status === 401);
        const result = await response.json();
        setError(result.error?.message ?? "Couldn’t update this reminder.");
      } else {
        const result = await response.json();
        setLocal(result.reminder);
        onChanged?.(result.reminder);
        setConfirmDelete(false);
        if (action === "delete") router.replace(afterDelete);
        router.refresh();
      }
    } catch {
      setError("Couldn’t connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reminder-actions">
      <div className="action-controls">
        <button
          disabled={busy}
          onClick={() =>
            act(current.status === "completed" ? "reopen" : "complete")
          }
          className="complete-action disabled:opacity-50"
          title={
            recurring && current.status !== "completed"
              ? "Complete this reminder and stop all future repeats"
              : undefined
          }
        >
          <Icon
            name={current.status === "completed" ? "back" : "check"}
            size={14}
          />
          {current.status === "completed" ? "Reopen" : "Mark complete"}
        </button>
        {!confirmDelete && (
          <button
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="delete-action"
          >
            Delete
          </button>
        )}
        {confirmDelete && (
          <div className="delete-confirmation">
            <span>Delete this reminder?</span>
            <button
              disabled={busy}
              onClick={() => act("delete")}
              className="font-medium text-red-800 underline"
            >
              Delete reminder
            </button>
            <button
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
              className="underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="action-error">
          {error}
        </p>
      )}
      <SessionRecovery visible={expired} />
    </div>
  );
}
