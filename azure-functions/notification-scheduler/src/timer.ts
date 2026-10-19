import { app, type InvocationContext, type Timer } from "@azure/functions";
import { createDatabase } from "../../../src/lib/db/connection";
import { workerEnvSchema, parseEnvironment } from "../../../src/lib/env/schema";
import { createSmtpSender } from "../../../src/lib/email/smtp";
import { processNotifications } from "../../../src/services/notifications/processor";

export const TIMER_SCHEDULE = "0 * * * * *";
const shutdown = new AbortController();
app.hook.appTerminate(() => {
  shutdown.abort();
});
export async function notificationScheduler(
  timer: Timer,
  context: InvocationContext,
) {
  let connection: ReturnType<typeof createDatabase> | undefined;
  try {
    const env = parseEnvironment(workerEnvSchema, process.env);
    connection = createDatabase(env);
    connection.pool.on("error", () =>
      context.error("worker_database_idle_error", {
        invocationId: context.invocationId,
      }),
    );
    if (timer.isPastDue)
      context.log("worker_timer_past_due", {
        invocationId: context.invocationId,
      });
    await processNotifications(connection.db, createSmtpSender(env).send, env, {
      invocationId: context.invocationId,
      signal: shutdown.signal,
      log: (event, fields) => context.log(event, fields),
    });
  } catch {
    context.error("worker_invocation_failed", {
      invocationId: context.invocationId,
      category: "configuration_or_processing_error",
    });
    // Throw a sanitized failure so Azure records an unsuccessful invocation.
    throw new Error(
      "Notification scheduler invocation failed. Check sanitized worker logs and private settings.",
    );
  } finally {
    try {
      await connection?.pool.end();
    } catch {
      context.error("worker_database_close_failed", {
        invocationId: context.invocationId,
      });
    }
  }
}
app.timer("notificationScheduler", {
  schedule: TIMER_SCHEDULE,
  useMonitor: true,
  runOnStartup: false,
  handler: notificationScheduler,
});
