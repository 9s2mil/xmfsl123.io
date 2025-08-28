const CACHE_NAME_PLAN = 'pwa-plan-v2';

// 사전 캐시
const ASSETS_PLAN = [
  './index.html',
  './plan.css',
  './plan.js',
  './play.css',
  './play.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME_PLAN).then((cache) => cache.addAll(ASSETS_PLAN))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME_PLAN).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME_PLAN).then((cache) => cache.put('./index.html', copy));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((networkResp) => {
            caches.open(CACHE_NAME_PLAN).then((cache) => cache.put(request, networkResp.clone()));
            return networkResp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      const resClone = response.clone();
      caches.open(CACHE_NAME_PLAN).then(cache => cache.put(event.request, resClone));
      return response;
    })
  );

});
