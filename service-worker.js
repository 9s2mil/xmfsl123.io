const CACHE_NAME = 'pwa-index-only-v1';

// 사전 캐시(인덱스 중심). index.html만 쓸 경우에 필요한 최소 자원 위주로 구성.
const ASSETS = [
  './',
  './index.html',
  './plan.css',
  './plan.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 설치: 필수 자원 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 정리 + 즉시 제어
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 가져오기 처리
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 네비게이션 요청은 네트워크 우선, 실패 시 캐시된 index.html 제공
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          // 최신 index.html을 캐시에 갱신
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 동일 출처 정적 자원: Stale-While-Revalidate
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((networkResp) => {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResp.clone()));
            return networkResp;
          })
          .catch(() => cached); // 네트워크 실패 시 캐시가 있으면 사용
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 외부 리소스: 네트워크 우선, 실패 시 캐시 백업(있다면)
  event.respondWith(
    fetch(request)
      .then((networkResp) => networkResp)
      .catch(() => caches.match(request))
  );
});

