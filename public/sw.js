/* Public assets only. Never store pages, API responses, RSC, auth or reminder data. */
const CACHE = "remindme-public-v1";
const ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith("remindme-public-") && name !== CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) => (await cache.match(url.pathname)) || fetch(request),
        ),
    );
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" })).catch(async () => {
        const fallback = await caches.match("/offline.html");
        return (
          fallback ||
          new Response("You’re offline. Reconnect to open RemindMe.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
    );
  }
  // Everything else uses the network/browser defaults. No runtime cache writes.
});
