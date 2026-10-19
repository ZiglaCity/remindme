import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDatabase } from "../src/lib/db/connection";

config({ path: [".env.local", ".env"], quiet: true });
// Read-only operational check. No claim, SMTP connection or email sending.
const { db, pool } = createDatabase(process.env);
try {
  const result = await db.execute(sql`select
    count(*) filter (where status = 'pending' and scheduled_for <= now() and (next_attempt_at is null or next_attempt_at <= now()))::int as due,
    count(*) filter (where status = 'processing')::int as processing,
    count(*) filter (where status = 'processing' and (processing_started_at is null or processing_started_at <= now() - interval '5 minutes'))::int as stale_at_default_lease,
    count(*) filter (where status = 'failed')::int as failed
    from scheduled_notifications`);
  console.log("Queue status (read-only):", result.rows[0]);
} catch {
  console.error(
    "Queue check failed. Verify database settings, network access and migrations.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
