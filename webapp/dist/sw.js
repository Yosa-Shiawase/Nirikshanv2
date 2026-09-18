/* NIRAKSHAN offline fallback worker.
   Scope is deliberately tiny: it caches ONLY /404.html and only steps in when a
   navigation fails. Application assets are never cached or intercepted, so the
   live console can never be served stale. */
const CACHE = "nir-404-v1";
const OFFLINE_URL = "/404.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch (err) {
        /* offline page missing — worker still installs */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.indexOf("nir-404-") === 0 && k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only navigation requests are considered; assets always go to the network.
  if (req.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch (err) {
        try {
          const cache = await caches.open(CACHE);
          const hit = await cache.match(OFFLINE_URL);
          if (hit) return hit;
        } catch (err2) {
          /* fall through */
        }
        return new Response("<!doctype html><title>Offline</title><p>Offline.", {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    })()
  );
});
