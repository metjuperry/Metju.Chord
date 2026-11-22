// Code the first screen doesn't need, loaded on demand: Learn, Paste from Hooktheory, Help and Credits.
// `prefetchLazy()` fetches them when the browser is idle after the intro (the service worker has
// them precached too), so opening one is instant, also offline or on a slow link.

import { lazy, useEffect, useState } from 'react';

const load = {
    learn: () => import(/* webpackChunkName: "learn" */ './components/LearnPanel'),
    learnData: () => import(/* webpackChunkName: "learn" */ './learn'),
    hooktheory: () => import(/* webpackChunkName: "hooktheory" */ './components/HooktheoryDialog'),
    hooktheoryParser: () => import(/* webpackChunkName: "hooktheory" */ './hooktheory'),
    help: () => import(/* webpackChunkName: "help" */ './components/HelpDialog'),
    credits: () => import(/* webpackChunkName: "credits" */ './components/CreditsDialog'),
};

export const LearnPanel = lazy(load.learn);
export const HooktheoryDialog = lazy(load.hooktheory);
export const HelpDialog = lazy(load.help);
export const CreditsDialog = lazy(load.credits);

/** learn.ts's helpers, loaded when a progression is added (the Learn chunk is already there by then). */
export const loadLearn = load.learnData;
/** hooktheory.ts's importer, loaded when a paste is imported. */
export const loadHooktheory = load.hooktheoryParser;

let prefetched = false;
/** Fetch every lazy chunk once, when the browser has nothing better to do. */
export function prefetchLazy() {
    if (prefetched) return;
    prefetched = true;
    const run = () => Object.values(load).forEach(l => l().catch(() => { prefetched = false; }));
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 1500);
}

/** True from the first time `open` is true on: a lazy dialog is mounted then and stays mounted, as it did before. */
export function useEverOpen(open: boolean): boolean {
    const [seen, setSeen] = useState(open);
    useEffect(() => {
        if (open) setSeen(true);
    }, [open]);
    return seen || open;
}
