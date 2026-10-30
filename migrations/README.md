# Versioned migrations

`0000_clever_night_nurse.sql` creates the documented Better Auth user/session/account/verification tables, user preferences, and shared atomic rate-limit storage. Auth user IDs are text, and every preference row references its owner. Dates use TIMESTAMPTZ. Provider identity pairs and session tokens are unique.

`0001_nosy_kid_colt.sql` adds reminders, scheduled notifications, and notification attempts. It is additive; it does not replace auth tables or existing data. It includes owner/FK relations, soft-delete support, revision/version checks, queue uniqueness, status/length constraints, and due/retry/stale-work indexes.

`0002_noisy_lady_ursula.sql` adds a nullable UUID claim token to scheduled notifications. Trusted delivery claims use it to prevent duplicate execution and stale outcome updates. The existing notification-attempt UUID stores the claim token, enforcing one attempt per claim without another table. No existing rows or history are removed.

`0003_young_zarda.sql` adds a nonnegative `recovery_count`, defaulting to zero, and extends the counter constraint. It bounds repeated worker crashes even when they happen before an SMTP attempt starts. Apply it before running the Phase 6 worker; existing reminders and attempt history remain intact.

`0004_talented_shinobi_shaw.sql` and `0005_tiresome_mulholland_black.sql` add nullable recurrence JSON and a separate interval anchor, validate their relationship/rule envelope, and index active repeating deadlines for the worker. Existing one-off rows stay null and retain their schedules. Apply both before serving the recurring-reminder web/worker version.

After modifying the schema, run `npm run db:generate`, review the generated SQL and metadata, then run `npm run db:migrate` against development and isolated test databases. Commit SQL and Drizzle metadata together. Never modify an already-applied migration or use schema push against production.

Use `DATABASE_DIRECT_URL` when a direct migration connection is needed. Keep credentials out of command arguments and source control. Production application of migrations requires a reviewed release procedure and backup/restore plan.

`0006_nebulous_sandman.sql` permits threshold 100 and adds a non-null `deadline_notification_enabled` flag defaulting to false, preserving all existing reminders. The new creation service sets true for new reminders only. No notification backfill or existing schedule rewrite is included. Review/apply the migration before the new worker, then deploy the new web app. Keep the old web version until the new worker is active, since old workers cancel notifications at/after their deadlines. During verification, TEST_DATABASE_URL was discovered to point at the application database; the existing test setup therefore already applied this additive migration there. A read-only audit afterward found zero opted-in reminders and zero 100% notification rows. Do not edit or remove the applied migration; use a new migration for any reviewed schema amendment. Integration/browser startup now rejects a test URL matching the application database (including pooled/direct Neon aliases). Configure a genuinely separate test database before further database checks.
