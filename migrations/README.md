# Versioned migrations

`0000_clever_night_nurse.sql` creates the documented Better Auth user/session/account/verification tables, user preferences, and shared atomic rate-limit storage. Auth user IDs are text, and every preference row references its owner. Dates use TIMESTAMPTZ. Provider identity pairs and session tokens are unique.

`0001_nosy_kid_colt.sql` adds reminders, scheduled notifications, and notification attempts. It is additive; it does not replace auth tables or existing data. It includes owner/FK relations, soft-delete support, revision/version checks, queue uniqueness, status/length constraints, and due/retry/stale-work indexes.

`0002_noisy_lady_ursula.sql` adds a nullable UUID claim token to scheduled notifications. Trusted delivery claims use it to prevent duplicate execution and stale outcome updates. The existing notification-attempt UUID stores the claim token, enforcing one attempt per claim without another table. No existing rows or history are removed.

`0003_young_zarda.sql` adds a nonnegative `recovery_count`, defaulting to zero, and extends the counter constraint. It bounds repeated worker crashes even when they happen before an SMTP attempt starts. Apply it before running the Phase 6 worker; existing reminders and attempt history remain intact.

`0004_talented_shinobi_shaw.sql` and `0005_tiresome_mulholland_black.sql` add nullable recurrence JSON and a separate interval anchor, validate their relationship/rule envelope, and index active repeating deadlines for the worker. Existing one-off rows stay null and retain their schedules. Apply both before serving the recurring-reminder web/worker version.

After modifying the schema, run `npm run db:generate`, review the generated SQL and metadata, then run `npm run db:migrate` against development and isolated test databases. Commit SQL and Drizzle metadata together. Never modify an already-applied migration or use schema push against production.

Use `DATABASE_DIRECT_URL` when a direct migration connection is needed. Keep credentials out of command arguments and source control. Production application of migrations requires a reviewed release procedure and backup/restore plan.
