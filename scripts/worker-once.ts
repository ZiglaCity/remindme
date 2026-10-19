import { config } from "dotenv";
import { createDatabase } from "../src/lib/db/connection";
import { parseEnvironment, workerEnvSchema } from "../src/lib/env/schema";
import { createSmtpSender } from "../src/lib/email/smtp";
import { processNotifications } from "../src/services/notifications/processor";

config({ path: [".env.local", ".env"], quiet: true });
async function main() {
  if (process.argv.slice(2).join(" ") !== "--send-approved") {
    console.log(
      "No work claimed and no mail sent. Use worker:check to inspect the queue, or explicitly run: npx tsx scripts/worker-once.ts --send-approved",
    );
    return;
  }
  const env = parseEnvironment(workerEnvSchema, {
    ...process.env,
    APP_URL: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!env.SMTP_APPROVED_RECIPIENTS.trim())
    throw new Error("No approved SMTP recipients configured.");
  const stop = new AbortController();
  const interrupt = () => stop.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const { db, pool } = createDatabase(env);
  pool.on("error", () => console.error("worker_database_idle_error"));
  try {
    await processNotifications(db, createSmtpSender(env).send, env, {
      signal: stop.signal,
    });
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Worker failed. Check private configuration, database access and sanitized worker logs.",
  );
  process.exitCode = 1;
});
