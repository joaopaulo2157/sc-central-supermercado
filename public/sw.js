const CACHE = 'sc-central-v6-final-3';
const CORE = [
  '/',
  '/index.html',
  '/store-v6.css?v=6.0.3',
  '/v4-boot.js?v=6.0.3',
  '/v3-data.js?v=6.0.3',
  '/script.js?v=6.0.3',
  '/v3.js?v=6.0.3',
  '/v4-store.js?v=6.0.3',
  '/v6.js?v=6.0.3',
  '/assets/logo-sc-central.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/')
  ) return;

  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      networkFirst(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(networkFirst(event.request));
});
