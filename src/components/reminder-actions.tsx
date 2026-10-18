"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ReminderActions({
  id,
  revision,
  status,
  afterDelete = "/app",
  onChanged,
}: {
  id: string;
  revision: number;
  status: "active" | "completed" | "archived";
  afterDelete?: string;
  onChanged?: (saved: {
    revision: number;
    status: "active" | "completed" | "archived";
  }) => void;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [local, setLocal] = useState<{
    revision: number;
    status: typeof status;
  } | null>(null);
  const current =
    local && local.revision > revision ? local : { revision, status };
  async function act(action: "complete" | "reopen" | "delete") {
    setBusy(true);
    setError("");
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
    <div className="mt-5 text-sm">
      <div className="flex flex-wrap items-center gap-5">
        <button
          disabled={busy}
          onClick={() =>
            act(current.status === "completed" ? "reopen" : "complete")
          }
          className="font-medium text-emerald-900 underline disabled:opacity-50"
        >
          {current.status === "completed" ? "Reopen" : "Mark complete"}
        </button>
        {!confirmDelete && (
          <button
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="text-stone-600 underline"
          >
            Delete
          </button>
        )}
        {confirmDelete && (
          <>
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
          </>
        )}
      </div>
      <p role="alert" className="mt-2 text-red-800">
        {error}
      </p>
    </div>
  );
}
