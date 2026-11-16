const CACHE_NAME = "our-museum-shell-v19";
// Cache the install metadata and icons with the offline application shell.
const CORE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/media/placeholder.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    const html = await (await cache.match("/")).text();
    const assets = [...new Set(html.match(/\/assets\/[^"'?#]+\.(?:js|css)/g) ?? [])];
    await cache.addAll(assets);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("our-museum-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match("/", { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put("/", response.clone());
      return response;
    })());
    return;
  }

  if (new URL(request.url).pathname.startsWith("/music/")) return;

  if (new URL(request.url).pathname.startsWith("/assets/") ||
      new URL(request.url).pathname.startsWith("/icons/") ||
      new URL(request.url).pathname === "/manifest.webmanifest" ||
      new URL(request.url).pathname === "/media/placeholder.svg") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
