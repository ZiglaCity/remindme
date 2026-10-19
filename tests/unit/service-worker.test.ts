import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
function worker() {
  const handlers: Record<string, (event: Record<string, unknown>) => void> = {};
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn(),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi
      .fn()
      .mockResolvedValue([
        "remindme-public-old",
        "remindme-public-v1",
        "unrelated",
      ]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue("public offline fallback"),
  };
  const self = {
    location: { origin: "https://remind.example" },
    addEventListener: (event: string, handler: (typeof handlers)[string]) => {
      handlers[event] = handler;
    },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
  };
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    caches,
    fetch,
    URL,
    Request,
    Response,
  });
  return { handlers, cache, caches, self, fetch };
}
describe("public-only offline cache", () => {
  it("precaches only public assets and removes only obsolete app caches", async () => {
    const w = worker();
    let pending: Promise<unknown> | undefined;
    w.handlers.install({
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    expect(
      w.cache.addAll.mock.calls[0][0].every(
        (path: string) =>
          path === "/offline.html" || path.startsWith("/icons/"),
      ),
    ).toBe(true);
    w.handlers.activate({
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    expect(w.caches.delete.mock.calls).toEqual([["remindme-public-old"]]);
  });
  it("returns generic offline HTML for failed navigation and never caches APIs or mutations", async () => {
    const w = worker();
    let response: Promise<unknown> | undefined;
    const navigation = new Request(
      "https://remind.example/app/reminders/private",
    );
    Object.defineProperty(navigation, "mode", { value: "navigate" });
    w.handlers.fetch({
      request: navigation,
      respondWith: (promise: Promise<unknown>) => {
        response = promise;
      },
    });
    await expect(response).resolves.toBe("public offline fallback");
    expect(w.fetch.mock.calls[0][0].cache).toBe("no-store");
    const respondWith = vi.fn();
    for (const path of ["/api/reminders", "/api/auth/get-session"])
      w.handlers.fetch({
        request: new Request(`https://remind.example${path}`),
        respondWith,
      });
    w.handlers.fetch({
      request: new Request("https://remind.example/api/reminders", {
        method: "POST",
      }),
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(w.cache.addAll).not.toHaveBeenCalled();
  });
  it("activates waiting updates only after an explicit update message", () => {
    const w = worker();
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.handlers.message({ data: { type: "SKIP_WAITING" } });
    expect(w.self.skipWaiting).toHaveBeenCalledOnce();
  });
});
