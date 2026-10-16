// The Vault service worker. VERSION must equal CONFIG.APP_VERSION in js/config.js (a test checks).
// Bump both on every deploy. Never caches Apps Script calls (cross-origin is ignored).
const VERSION = '1.1.7';
const CACHE = `vault-shell-${VERSION}`;
const SHELL = [
  './index.html',
  './manifest.json',
  './css/app.css',
  './fonts/Outfit-Variable.woff2',
  './js/actions.js',
  './js/api/errors.js',
  './js/api/fixtures.js',
  './js/api/index.js',
  './js/api/mock-server.js',
  './js/api/mock.js',
  './js/api/remote.js',
  './js/app.js',
  './js/avatar.js',
  './js/bio.js',
  './js/config.js',
  './js/env.js',
  './js/identity.js',
  './js/ids.js',
  './js/money.js',
  './js/outbox.js',
  './js/platform.js',
  './js/router.js',
  './js/selectors.js',
  './js/storage.js',
  './js/store.js',
  './js/ui/approvals.js',
  './js/ui/avatarBuilder.js',
  './js/ui/celebrate.js',
  './js/ui/decisions.js',
  './js/ui/dom.js',
  './js/ui/donut.js',
  './js/ui/emoji.js',
  './js/ui/entry.js',
  './js/ui/family.js',
  './js/ui/goal.js',
  './js/ui/header.js',
  './js/ui/home.js',
  './js/ui/kid.js',
  './js/ui/ledger.js',
  './js/ui/lock.js',
  './js/ui/reason.js',
  './js/ui/settings.js',
  './js/ui/sheet.js',
  './js/ui/tithe.js',
  './js/ui/txcard.js',
  './js/ui/who.js',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // cache:'reload' skips the HTTP cache so an update never mixes old and new files.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
  // No skipWaiting here: the page shows "Update ready" and asks first.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('vault-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // script.google.com, googleusercontent, etc.
  // Only the app's own page is served from the shell; other pages (e.g. vault-demo.html) go to the network.
  const scopePath = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate' && (url.pathname === scopePath || url.pathname === scopePath + 'index.html')) {
    event.respondWith((async () => {
      const cached = await caches.match('./index.html', { ignoreSearch: true });
      return cached || fetch(req);
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    return cached || fetch(req);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
