import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { readPreferences } from "@/repositories/preferences";
import { TimeZoneForm } from "@/components/time-zone-form";
import { InstallCard } from "@/components/pwa";
import { SignOut } from "@/components/sign-out";
export default async function SettingsPage() {
  const { owner, user } = await requirePageSession();
  const preferences = await readPreferences(getDatabase(), owner);
  return (
    <main className="narrow-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">JUST THE WAY YOU LIKE IT</p>
          <h1 className="page-title">Your little corner.</h1>
          <p className="page-description">
            A few settings to make RemindMe feel like home.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <p className="eyebrow">YOUR ACCOUNT</p>
          <div className="account-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h2>{user.name}</h2>
          <p className="account-email">{user.email}</p>
          <div className="account-note">
            Password recovery isn’t available yet. Google sign-in can connect to
            your account using the same verified email.
          </div>
          <div className="account-signout">
            <span>Finished for now?</span>
            <SignOut />
          </div>
        </section>
        <section className="settings-card">
          <p className="eyebrow">RIGHT PLACE, RIGHT TIME</p>
          <h2>Your time zone</h2>
          <p>So “tomorrow” means your tomorrow.</p>
          <TimeZoneForm
            initialZone={preferences.timeZone}
            reviewed={Boolean(preferences.reviewedAt)}
          />
        </section>
        <InstallCard />
      </div>
    </main>
  );
}
