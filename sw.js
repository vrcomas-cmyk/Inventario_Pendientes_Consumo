/* ===========================================================================
   sw.js · Service Worker del Portal DEGASA (PWA)
   Estrategia:
   - Estáticos propios (html/js/css/iconos): stale-while-revalidate → 2ª carga
     instantánea y actualización silenciosa en segundo plano.
   - CDNs (XLSX, supabase-js, Chart): cache-first (versionados por URL).
   - Datos (Supabase REST/Storage, gviz, AppScript): SIEMPRE red — el portal ya
     tiene su propia caché de datos con markers en IndexedDB.
   =========================================================================== */
const VERSION = 'degasa-v2-1';
const STATIC_CACHE = VERSION + '-static';
const CDN_CACHE = VERSION + '-cdn';

const PRECACHE = ['./', './index.html', './manifest.json', './css/variables.css', './css/portal.css', './css/animations.css', './css/mobile.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isData = url =>
  url.hostname.endsWith('supabase.co') ||
  url.hostname.includes('googleusercontent') ||
  url.hostname.includes('script.google.com') ||
  url.hostname.includes('docs.google.com');

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || isData(url)) return;          // datos: red directa

  if (url.hostname.includes('cdn.jsdelivr.net')) {                // CDN: cache-first
    e.respondWith(caches.open(CDN_CACHE).then(async c => (await c.match(e.request)) ||
      fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (url.origin === location.origin) {                           // estáticos: stale-while-revalidate
    e.respondWith(caches.open(STATIC_CACHE).then(async c => {
      const cached = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => cached);
      return cached || net;
    }));
  }
});
