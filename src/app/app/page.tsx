import Link from "next/link";
import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { readPreferences } from "@/repositories/preferences";
export default async function AppPage() {
  const { owner, user } = await requirePageSession();
  const preferences = await readPreferences(getDatabase(), owner);
  return (
    <main>
      <h1 className="text-3xl font-semibold">Welcome, {user.name}</h1>
      <p className="mt-4 text-stone-600">
        Your account is ready. Reminder capture is coming in the next phase.
      </p>
      {!preferences.reviewedAt && (
        <p className="mt-8 rounded-lg border border-stone-200 p-5">
          First,{" "}
          <Link className="underline" href="/app/settings">
            review your time zone
          </Link>{" "}
          so future deadlines use the right local time.
        </p>
      )}
    </main>
  );
}
