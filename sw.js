/* Instapaper PWA service worker — offline app shell + runtime caching */
const CACHE = 'instapaper-shell-v74';
const SHELL = ['./', './index.html', './app.js', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png',
  './newspaper.html', './newspaper.js', './newspaper.manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js'];
const RUNTIME_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(req, navFallback) {
  const c = await caches.open(CACHE);
  const cached = await c.match(req, { ignoreSearch: navFallback });
  const net = fetch(req).then(res => {
    if (res && res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (cached) { net.catch(() => {}); return cached; }
  const fresh = await net;
  if (fresh) return fresh;
  if (navFallback) {
    const shell = await c.match('./index.html');
    if (shell) return shell;
  }
  return Response.error();
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const cached = await c.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin === location.origin) {
    e.respondWith(staleWhileRevalidate(req, req.mode === 'navigate'));
  } else if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(req));
  }
  /* everything else (article download proxies etc.) goes straight to the network */
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
