import { randomUUID } from "node:crypto";
import type { Database } from "../../repositories/preferences";
import {
  claimBatch,
  releaseUnstartedClaims,
  type WorkerConfiguration,
} from "../../repositories/queue";
import { createDeliveryService } from "./deliver";
import type { EmailSender } from "../../lib/email/smtp";
import type { Clock } from "../scheduling/schedule";

export type WorkerLog = (
  event: string,
  fields: Record<string, string | number | boolean>,
) => void;
// Stop admission early enough to drain the current wave before the host's 5-minute limit.
export const DELIVERY_RESERVE_MS = 120_000;
export async function processNotifications(
  db: Database,
  sender: EmailSender,
  env: WorkerConfiguration,
  options: {
    invocationId?: string;
    clock?: Clock;
    elapsed?: () => number;
    signal?: AbortSignal;
    log?: WorkerLog;
  } = {},
) {
  const clock = options.clock ?? (() => new Date());
  const elapsed = options.elapsed ?? (() => performance.now());
  const started = elapsed();
  const invocationId = options.invocationId ?? randomUUID();
  const logger: WorkerLog =
    options.log ?? ((event, fields) => console.info(event, fields));
  const log: WorkerLog = (event, fields) =>
    logger(event, { invocationId, ...fields });
  const stats = {
    examined: 0,
    claimed: 0,
    sent: 0,
    retries: 0,
    failed: 0,
    errors: 0,
    cancelled: 0,
    recovered: 0,
    skipped: 0,
  };
  const excluded: string[] = [];
  const deliver = createDeliveryService(db, sender, env, clock, {
    leaseSeconds: env.PROCESSING_LEASE_SECONDS,
    log: (fields) => log("notification_delivery", fields),
  });
  log("worker_started", {
    batchLimit: env.WORKER_BATCH_SIZE,
    concurrency: env.WORKER_CONCURRENCY,
  });
  try {
    while (
      !options.signal?.aborted &&
      stats.examined < env.WORKER_BATCH_SIZE &&
      elapsed() - started <=
        env.WORKER_RUN_BUDGET_SECONDS * 1000 - DELIVERY_RESERVE_MS
    ) {
      const batch = await claimBatch(db, env, {
        now: clock(),
        limit: Math.min(
          env.WORKER_CONCURRENCY,
          env.WORKER_BATCH_SIZE - stats.examined,
        ),
        exclude: excluded,
      });
      stats.examined += batch.examined.length;
      stats.claimed += batch.claims.length;
      stats.cancelled += batch.cancelled;
      stats.recovered += batch.recovered;
      stats.failed += batch.failed;
      excluded.push(...batch.examined);
      if (
        options.signal?.aborted ||
        elapsed() - started >
          env.WORKER_RUN_BUDGET_SECONDS * 1000 - DELIVERY_RESERVE_MS
      ) {
        await releaseUnstartedClaims(db, batch.claims, clock());
        break;
      }
      // Claims are no larger than available send slots; nothing waits behind SMTP.
      await Promise.all(
        batch.claims.map(async (claim) => {
          try {
            const result = await deliver(claim);
            if (result.status === "sent") stats.sent++;
            else if (result.status === "retry_scheduled") stats.retries++;
            else if (result.status === "failed") stats.failed++;
            else stats.skipped++;
          } catch {
            // Preserve processing token/attempt for lease recovery. Never log raw SQL/SMTP errors.
            stats.errors++;
            log("notification_interrupted", {
              notificationId: claim.id,
              reminderId: claim.reminderId,
              category: "delivery_or_persistence_failure",
            });
          }
        }),
      );
      if (!batch.examined.length) break;
    }
    return stats;
  } catch {
    log("worker_failed", { category: "database_or_claim_failure" });
    throw new Error(
      "Notification worker could not complete its database operation.",
    );
  } finally {
    log("worker_finished", {
      ...stats,
      durationMs: Math.round(elapsed() - started),
      stopped: Boolean(options.signal?.aborted),
    });
  }
}
