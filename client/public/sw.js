/* global self, caches, fetch, Response, URL */

const SHELL_CACHE = "voxlibris-shell-v2";
const ASSET_CACHE = "voxlibris-assets-v1";
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.png",
  "/apple-touch-icon.png",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isStaticAssetRequest(request, url) {
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    return true;
  }

  return ["script", "style", "font", "image"].includes(request.destination);
}

async function updateCache(cacheName, request, response) {
  if (!response || !response.ok) {
    return response;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    await updateCache(SHELL_CACHE, "/", response.clone());
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cachedResponse = await cache.match(request);
    return cachedResponse || cache.match("/");
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetch(request)
    .then((response) => updateCache(ASSET_CACHE, request, response))
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkResponsePromise;
  return networkResponse || Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => ![SHELL_CACHE, ASSET_CACHE].includes(cacheName))
        .map((cacheName) => caches.delete(cacheName)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (SHELL_URLS.includes(url.pathname) || isStaticAssetRequest(request, url)) {
    event.respondWith(handleStaticAsset(request));
  }
});
