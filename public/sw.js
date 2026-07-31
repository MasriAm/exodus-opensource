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

function isAppRouterFlight(request, requestUrl) {
  if (requestUrl.searchParams.has("_rsc")) {
    return true;
  }
  if (requestUrl.pathname.endsWith(".txt")) {
    return true;
  }
  const headers = request.headers;
  return (
    headers.get("RSC") === "1" ||
    headers.get("Next-Router-State-Tree") != null ||
    headers.get("Next-Router-Prefetch") != null ||
    headers.get("Next-Url") != null
  );
}

function networkFirst(request, cached) {
  return fetch(request)
    .then((response) => {
      if (response.ok && request.method === "GET") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
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
}

function cacheFirst(request, cached) {
  if (cached) {
    return cached;
  }
  return networkFirst(request, null);
}

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

  // Never intercept App Router flight/RSC. Cache-first HTML for these
  // requests makes Next fall back to a full document load, which kills the
  // in-memory DuckDB session right after ingest.
  if (isAppRouterFlight(event.request, requestUrl)) {
    return;
  }

  const networkPreferred =
    event.request.mode === "navigate" ||
    requestUrl.pathname.endsWith(".zip") ||
    requestUrl.pathname.includes("/duckdb/");

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (networkPreferred) {
        return networkFirst(event.request, cached);
      }
      return cacheFirst(event.request, cached);
    }),
  );
});
