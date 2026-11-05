/* ReWorth service worker — minimal fetch handler for installability. */
const CACHE = "reworth-pwa-v10";
const OFFLINE_URL = "/offline.html";

function unavailableResponse() {
  return new Response("", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.add(OFFLINE_URL);
      } catch {
        // Offline page is best-effort; do not fail install.
      }
      // Activate ASAP so the tab is controlled (required for address-bar Install).
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("reworth-pwa-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING" || type === "CLAIM_CLIENTS") {
    event.waitUntil(
      (async () => {
        if (type === "SKIP_WAITING") await self.skipWaiting();
        await self.clients.claim();
      })(),
    );
  }
});

/**
 * Real fetch handler required for installability.
 * Do NOT intercept navigations (e.g. "/") — serving offline/error for start_url
 * makes Chrome hide the address-bar Install icon.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/")) return;
  if (request.mode === "navigate") return;

  // Only handle static brand / offline assets so the handler is non-empty.
  if (!url.pathname.startsWith("/brand/") && url.pathname !== OFFLINE_URL) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) void cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(request);
        return cached || unavailableResponse();
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    payload = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = typeof payload.title === "string" ? payload.title : "ReWorth";
  const target = typeof payload.url === "string" ? payload.url : "/notifications";
  let url = "/notifications";
  try {
    const safeUrl = new URL(target, self.location.origin);
    if (safeUrl.origin === self.location.origin) url = safeUrl.href;
  } catch {
    // keep default
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body:
        typeof payload.body === "string"
          ? payload.body
          : "You have a new update.",
      icon: "/brand/icons/pwa-192.png",
      badge: "/brand/icons/pwa-192.png",
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url;
  let url = `${self.location.origin}/notifications`;
  try {
    const safeUrl = new URL(
      typeof target === "string" ? target : "/notifications",
      self.location.origin,
    );
    if (safeUrl.origin === self.location.origin) url = safeUrl.href;
  } catch {
    // keep default
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => client.url === url);
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      }),
  );
});
