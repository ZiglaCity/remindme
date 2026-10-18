"use client";
import { useState, useSyncExternalStore } from "react";
const subscribe = () => () => {};
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
export function TimeZoneForm({
  initialZone,
  reviewed,
}: {
  initialZone: string;
  reviewed: boolean;
}) {
  const detected = useSyncExternalStore(
    subscribe,
    browserZone,
    () => initialZone,
  );
  const [editedZone, setZone] = useState<string | null>(null);
  const zone = editedZone ?? (reviewed ? initialZone : detected);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ timeZone: zone }),
          });
          const data = await response.json();
          setMessage(
            response.ok
              ? "Time zone saved."
              : (data.error?.message ?? "Couldn’t save. Please retry."),
          );
        } catch {
          setMessage("Couldn’t connect. Please retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block">
        Time zone
        <input
          value={zone}
          onChange={(event) => setZone(event.target.value)}
          required
          maxLength={100}
          list="time-zones"
          className="mt-2 block w-full rounded-lg border border-stone-300 bg-white px-3 py-3"
        />
      </label>
      <datalist id="time-zones">
        {[
          "UTC",
          "Atlantic/Reykjavik",
          "Africa/Accra",
          "Europe/London",
          "America/New_York",
          "Asia/Tokyo",
        ].map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <p className="text-sm text-stone-600">
        Review the detected IANA time zone or enter your own. Changes apply to
        new reminders only.
      </p>
      <button
        disabled={busy}
        className="rounded-lg bg-emerald-900 px-5 py-3 text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Confirm time zone"}
      </button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </form>
  );
}
