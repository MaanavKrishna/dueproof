/*
 * Dueproof service worker (03 §5, 05 §7).
 *
 * - Caches the app shell's static assets only: build output under
 *   /_next/static/ (content-hashed), the icons and the manifest. It never
 *   caches pages, API responses, page images or document data, so nothing
 *   about a client or a notice is left on the phone.
 * - Offline navigations get a small built-in "You're offline" page (not a
 *   cached copy of anything the person saw).
 * - Web Push: shows the generic line the server sent ("A deadline needs
 *   attention") and opens the app path on click.
 *
 * Versioned: a new VERSION replaces the old cache on the next visit.
 */
const VERSION = "dueproof-shell-v1";
const SHELL = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isShellAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/manifest.webmanifest")
  );
}

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Dueproof</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto"><h1 style="font-size:1.25rem">You're offline</h1><p>Dueproof needs a connection to show your notices and deadlines. Nothing is stored on this phone. Try again when you're back online.</p><p><a href="">Try again</a></p></body></html>`;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isShellAsset(url)) {
    // Cache first: these files are content-hashed or versioned.
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok && res.type === "basic") cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }
  if (request.mode === "navigate") {
    // Network only; a built-in page when offline. Pages are never cached.
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      ),
    );
  }
  // Everything else (API, signed storage URLs, data) goes straight to the network.
});

self.addEventListener("push", (event) => {
  let data = { title: "Dueproof", body: "", url: "/today", tag: "dueproof" };
  try {
    data = { ...data, ...(event.data ? event.data.json() : {}) };
  } catch {
    // A payload we can't read: show the generic line.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || "Open Dueproof to see what changed.",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(path);
          return w.focus();
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", () => {
  // The app re-subscribes on its next visit (PushToggle checks the subscription).
});
