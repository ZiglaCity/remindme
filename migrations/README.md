# Versioned migrations

`0000_clever_night_nurse.sql` creates the documented Better Auth user/session/account/verification tables, user preferences, and shared atomic rate-limit storage. Auth user IDs are text, and every preference row references its owner. Dates use TIMESTAMPTZ. Provider identity pairs and session tokens are unique.

After modifying the schema, run `npm run db:generate`, review the generated SQL and metadata, then run `npm run db:migrate` against development and isolated test databases. Commit SQL and Drizzle metadata together. Never modify an already-applied migration or use schema push against production.

Use `DATABASE_DIRECT_URL` when a direct migration connection is needed. Keep credentials out of command arguments and source control. Production application of migrations requires a reviewed release procedure and backup/restore plan.
