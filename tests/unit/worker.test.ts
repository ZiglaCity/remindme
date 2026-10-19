import { describe, expect, it, vi } from "vitest";
import { processNotifications } from "../../src/services/notifications/processor";
import type { Database } from "../../src/repositories/preferences";
import type { WorkerConfiguration } from "../../src/repositories/queue";
const timer = vi.hoisted(() => vi.fn());
vi.mock("@azure/functions", () => ({
  app: { timer, hook: { appTerminate: vi.fn() } },
}));
describe("Azure worker adapter", () => {
  it("registers only the monitored one-minute timer without running it on startup", async () => {
    const { notificationScheduler } =
      await import("../../azure-functions/notification-scheduler/src/timer");
    expect(timer).toHaveBeenCalledWith("notificationScheduler", {
      schedule: "0 * * * * *",
      useMonitor: true,
      runOnStartup: false,
      handler: notificationScheduler,
    });
  });
  it("sanitizes a database failure and does no work after shutdown", async () => {
    const transaction = vi
      .fn()
      .mockRejectedValue(new Error("private-connection-detail"));
    const db = { transaction } as unknown as Database;
    const env = {
      WORKER_BATCH_SIZE: 25,
      WORKER_CONCURRENCY: 5,
      WORKER_RUN_BUDGET_SECONDS: 240,
    } as WorkerConfiguration;
    const log = vi.fn();
    const sender = vi.fn();
    await expect(
      processNotifications(db, sender, env, { log }),
    ).rejects.toThrow("could not complete");
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private-connection-detail",
    );
    transaction.mockClear();
    await processNotifications(db, sender, env, {
      signal: AbortSignal.abort(),
      log,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });
});
