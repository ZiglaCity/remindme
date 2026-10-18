# Versioned migrations

Phase 1 establishes tooling without inventing product tables. The first product migration will be the Better Auth schema in Phase 2.

After modifying the schema, run `npm run db:generate`, review the generated SQL and metadata, then run `npm run db:migrate` against development and isolated test databases. Commit SQL and Drizzle metadata together. Never modify an already-applied migration or use schema push against production.

Use `DATABASE_DIRECT_URL` when a direct migration connection is needed. Keep credentials out of command arguments and source control. Production application of migrations requires a reviewed release procedure and backup/restore plan.
