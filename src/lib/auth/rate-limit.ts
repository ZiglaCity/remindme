import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../../repositories/preferences";

export function createRateLimiter(db: Database, secret: string) {
  return async (key: string, rule: { window: number; max: number }) => {
    const digest = createHmac("sha256", secret).update(key).digest("hex");
    const result = await db.execute(sql`
      INSERT INTO rate_limits (key, count, expires_at)
      VALUES (${digest}, 1, now() + ${rule.window} * interval '1 second')
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE LEAST(rate_limits.count + 1, ${rule.max + 1}) END,
        expires_at = CASE WHEN rate_limits.expires_at <= now() THEN now() + ${rule.window} * interval '1 second' ELSE rate_limits.expires_at END
      RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - now()))))::int AS retry_after
    `);
    const row = result.rows[0] as { count: number; retry_after: number };
    // Bounded opportunistic cleanup; safe across independent serverless instances.
    await db.execute(
      sql`DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at < now() - interval '1 day' LIMIT 100)`,
    );
    return {
      allowed: row.count <= rule.max,
      retryAfter: row.count <= rule.max ? null : row.retry_after,
    };
  };
}
