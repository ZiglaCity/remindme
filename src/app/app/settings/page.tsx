import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { readPreferences } from "@/repositories/preferences";
import { TimeZoneForm } from "@/components/time-zone-form";
export default async function SettingsPage() {
  const { owner, user } = await requirePageSession();
  const preferences = await readPreferences(getDatabase(), owner);
  return (
    <main>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-4 text-stone-600">{user.email}</p>
      <TimeZoneForm
        initialZone={preferences.timeZone}
        reviewed={Boolean(preferences.reviewedAt)}
      />
      <p className="mt-10 text-sm text-stone-600">
        Email/password addresses are unverified in V1. Password reset and
        account linking are not available.
      </p>
    </main>
  );
}
