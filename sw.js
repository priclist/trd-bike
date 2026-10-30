// TRD service worker: the site and the sales app open offline from the last visit.
// Pages and stock are network-first (always fresh when online); images and code are cache-first.
const VERSION = "trd-v16";
const SHELL = [
  "/", "/assets/styles.css", "/assets/app.js", "/assets/site.js", "/assets/install.js", "/assets/brand/logo.webp",
  "/sales/", "/sales/sales.css", "/sales/sales.js", "/manifest.webmanifest", "/sales/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // signed-in API calls are never cached; the public feed falls back to its last copy
  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/public") return;
  const fresh = req.mode === "navigate" || url.pathname.endsWith(".json") || url.pathname === "/api/public" ||
    /\.(css|js|webmanifest)$/.test(url.pathname);
  e.respondWith(fresh ? networkFirst(req) : cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: req.mode === "navigate" })) ||
      (req.mode === "navigate" && (await cache.match(new URL(req.url).pathname.startsWith("/sales") ? "/sales/" : "/"))) ||
      Response.error();
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // keep the site's own artwork and the team's photos; stock photos and video stay on the network
  const keep = /^\/(assets|icons|uploads)\//.test(new URL(req.url).pathname) && !/\.(mp4|webm)$/.test(req.url);
  if (keep && res.status === 200 && !req.headers.has("range")) cache.put(req, res.clone());
  return res;
}
