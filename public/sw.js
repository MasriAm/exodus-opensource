const CACHE_NAME = "exodus-shell-__BUILD_HASH__";
const APP_SHELL = [
  /* PRECACHE_START */
  "/",
  "/dashboard",
  "/dashboard/",
  "/dashboard.html",
  "/wrapped",
  "/wrapped/",
  "/wrapped.html",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/duckdb/duckdb-mvp.wasm",
  "/duckdb/duckdb-eh.wasm",
  "/duckdb/duckdb-browser-mvp.worker.js",
  "/duckdb/duckdb-browser-eh.worker.js",
  "/demo-instagram.zip",
  "/demo-whatsapp.zip",
  /* PRECACHE_END */
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }

  // Demo ZIPs and DuckDB binaries: prefer network so a stale/empty cache cannot
  // break "Try synthetic export" or DB boot after a rebuild.
  const networkFirst =
    requestUrl.pathname.endsWith(".zip") ||
    requestUrl.pathname.includes("/duckdb/");

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(
          () =>
            cached ??
            new Response("Exodus is offline and this asset is not cached.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            }),
        );

      if (networkFirst) {
        return network;
      }
      return cached ?? network;
    }),
  );
});
