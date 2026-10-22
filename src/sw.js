/*
 * Metju.Chord service worker (plain JS, copied into the build by webpack, which fills in
 * __VERSION__ and __FILES__). Everything it does is relative to its own location, so it works
 * at a site root and under the GitHub Pages subpath alike.
 *
 * - install: precache the whole build. The page and code must succeed; samples are best-effort
 *   (a sample that fails now is fetched and cached when an instrument first needs it).
 * - activate: drop caches from older builds, take over open pages.
 * - fetch: pages are network-first (so a new deploy shows up as soon as there's a connection),
 *   falling back to the cached page offline; everything else is cache-first.
 */
const VERSION = self.__VERSION__;
const FILES = self.__FILES__;
const CACHE = `metju-chord-${VERSION}`;
const SCOPE = new URL('./', self.location).href;
const PAGE = new URL('./', self.location).href;

const isSample = f => f.startsWith('samples/');

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        const core = ['./', ...FILES.filter(f => !isSample(f) && f !== 'index.html')];
        // 'reload' skips the HTTP cache, so the precache is exactly this deploy
        await cache.addAll(core.map(f => new Request(f, { cache: 'reload' })));
        await Promise.all(FILES.filter(isSample).map(f => cache.add(new Request(f, { cache: 'reload' })).catch(() => undefined)));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.startsWith('metju-chord-') && k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(request);
                if (fresh.ok) (await caches.open(CACHE)).put(PAGE, fresh.clone());
                return fresh;
            } catch {
                return (await caches.match(PAGE)) || Response.error();
            }
        })());
        return;
    }
    event.respondWith((async () => {
        const url = request.url.split('#')[0].split('?')[0];
        const hit = await caches.match(url);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') (await caches.open(CACHE)).put(url, response.clone());
        return response;
    })());
});
