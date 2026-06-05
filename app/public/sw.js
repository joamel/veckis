// Veckis PWA service worker.
//
// Strategi:
// - Statiska assets (bundle, ikoner, manifest) → cache-first med fallback till
//   network (snabb laddning från cache, hämtar nytt vid miss).
// - Navigations-requests (HTML) → network-first med fallback till cache, så
//   nya deploys plockas upp på första lyckade load. Cachad HTML är offline-
//   fallback om man redan har öppnat appen.
// - API-requests (api/, /trpc/, /ws/) → network-only. Vi cachar aldrig data.
//
// När du ändrar i denna fil — bumpa CACHE_VERSION så gamla cacheen rensas.
const CACHE_VERSION = 'veckis-v16';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const HTML_CACHE = `${CACHE_VERSION}-html`;

const STATIC_PRELOAD = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_PRELOAD)),
  );
  // Aktivera nya SW direkt på install — vi vill inte ha en gammal version
  // hängande efter deploy.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API-/realtime-requests: alltid network, ingen cache.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/trpc/') ||
    url.pathname.startsWith('/ws') ||
    url.hostname !== self.location.hostname // cross-origin (Clerk, Render API)
  ) {
    return;
  }

  // Navigations-request (HTML): network-first. Detekterar via mode === 'navigate'
  // *eller* Accept-header som börjar med text/html — prefetch + speculation-
  // load skickar inte alltid mode='navigate' men frågar fortfarande efter HTML,
  // och vi vill inte hamna i cacheFirst för en HTML-route som inte finns som
  // statisk fil (t.ex. /sign-in som är client-side route).
  const accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Allt annat (JS, CSS, ikoner): cache-first.
  event.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    const cache = await caches.open(HTML_CACHE);
    cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cache = await caches.open(HTML_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    // Sista utvägen — root HTML från cache (offline-skärm är fortfarande appen).
    const root = await cache.match('/');
    if (root) return root;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (_err) {
    // Nät nere och inget i cache — släng tillbaka en harmlös 504 istället
    // för att kasta ett rejected promise (som loggar "Failed to fetch" i
    // konsolen utan att vi kan fånga det).
    return new Response('', { status: 504, statusText: 'Network error' });
  }
}
