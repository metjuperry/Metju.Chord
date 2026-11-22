/*
 * Metju.Chord service worker (plain JS, copied into the build by webpack, which fills in
 * __VERSION__ and __FILES__). Everything it does is relative to its own location, so it works
 * at a site root and under the GitHub Pages subpath alike.
 *
 * - install: precache the whole build. The page and code must succeed; samples are best-effort
 *   (a sample that fails now is fetched and cached when an instrument first needs it).
 * - activate: drop caches from older builds, take over open pages.
 * - fetch: pages are network-first (so a new deploy shows up as soon as there's a connection),
 *   falling back to the cached page offline or when the network takes over 2.5 s; everything else
 *   is cache-first.
 */
const VERSION = self.__VERSION__;
const FILES = self.__FILES__;
const CACHE = `metju-chord-${VERSION}`;
const SCOPE = new URL('./', self.location).href;
const PAGE = new URL('./', self.location).href;
// how long a page request waits for the network before the cached page is used
const NAV_TIMEOUT = 2500;

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
            // network-first, but not at any price: after NAV_TIMEOUT the cached page answers, and the
            // network response (if it ever arrives) still refreshes the cache for next time
            let refreshed = Promise.resolve();
            const network = fetch(request).then(fresh => {
                if (fresh.ok) {
                    const copy = fresh.clone();
                    refreshed = caches.open(CACHE).then(c => c.put(PAGE, copy)).catch(() => undefined);
                }
                return fresh;
            });
            // keep the worker alive until a late answer has been cached
            event.waitUntil(network.then(() => refreshed, () => undefined));
            const cached = () => caches.match(PAGE);
            let timer;
            const late = new Promise(resolve => { timer = setTimeout(() => resolve(cached()), NAV_TIMEOUT); });
            try {
                const first = await Promise.race([network, late]);
                if (first) return first;
                return await network;
            } catch {
                return (await cached()) || Response.error();
            } finally {
                clearTimeout(timer);
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
