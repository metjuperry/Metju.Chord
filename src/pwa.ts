// Installable-app plumbing: the offline service worker and the screen wake lock.

/**
 * Register the service worker (production builds only, and only where supported). A new deploy
 * installs a new worker, which takes over at once; the page then reloads to run the new code, but
 * only when it's safe: straight away if nothing has been played yet, otherwise the next time the
 * app is hidden (switching away and back), so a jam is never cut off.
 */
export function registerServiceWorker(isIdle: () => boolean) {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let pending = false;
    const reload = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // the first install takes control of a page that's already running this build: nothing to do
        if (!hadController || pending) return;
        pending = true;
        if (isIdle()) reload();
        else document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && reload());
    });
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            // look for a new deploy whenever the app comes back to the front (iOS keeps PWAs alive for days)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
            });
        }).catch(() => undefined);
    });
}

type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(type: 'release', cb: () => void): void };
type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> };

/**
 * Keep the screen on while the app is in use (iOS Safari 16.4+, Chrome, Edge). The lock is asked
 * for on a user interaction, and asked for again when the page comes back into view, since the
 * browser drops it whenever the page is hidden. Where there's no Wake Lock API this does nothing.
 * Returns a function that stops it.
 */
export function keepScreenOn(): () => void {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api || typeof api.request !== 'function') return () => undefined;
    let lock: Sentinel | null = null;
    let asking = false;
    let stopped = false;
    const acquire = () => {
        if (stopped || asking || (lock && !lock.released) || document.visibilityState !== 'visible') return;
        asking = true;
        api.request('screen')
            .then(l => {
                lock = l;
                l.addEventListener('release', () => (lock = null));
            })
            // refused (low battery mode, no user gesture yet, an iframe): try again on the next interaction
            .catch(() => undefined)
            .finally(() => (asking = false));
    };
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    const events = ['pointerdown', 'keydown'] as const;
    events.forEach(e => window.addEventListener(e, acquire, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    acquire();
    return () => {
        stopped = true;
        events.forEach(e => window.removeEventListener(e, acquire));
        document.removeEventListener('visibilitychange', onVisible);
        lock?.release().catch(() => undefined);
    };
}
