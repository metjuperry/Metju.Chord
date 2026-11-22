import { describe, expect, it } from 'vitest';
import { IDLE, createStore, playStore } from './playhead';

describe('createStore', () => {
    it('merges a patch and tells every listener', () => {
        const store = createStore({ a: 1, b: 'x' });
        const heard: number[] = [];
        store.subscribe(() => heard.push(store.get().a));
        store.subscribe(() => heard.push(-store.get().a));
        store.set({ a: 2 });
        expect(store.get()).toEqual({ a: 2, b: 'x' });
        expect(heard).toEqual([2, -2]);
    });

    it('stays quiet, and keeps its state object, when nothing changed', () => {
        const store = createStore({ step: 3, chain: null as { index: number } | null });
        const before = store.get();
        let calls = 0;
        store.subscribe(() => calls++);
        store.set({ step: 3 });
        store.set({ step: 3, chain: null });
        store.set({});
        expect(calls).toBe(0);
        expect(store.get()).toBe(before);
    });

    it('compares objects by identity: a new chain position is a change', () => {
        const store = createStore({ chain: { index: 0, tick: 0 } as { index: number; tick: number } | null });
        let calls = 0;
        store.subscribe(() => calls++);
        store.set({ chain: { index: 0, tick: 0 } });
        expect(calls).toBe(1);
    });

    it('stops telling a listener once it unsubscribes', () => {
        const store = createStore({ n: 0 });
        let calls = 0;
        const off = store.subscribe(() => calls++);
        store.set({ n: 1 });
        off();
        store.set({ n: 2 });
        expect(calls).toBe(1);
    });
});

describe('playStore', () => {
    it('starts idle: no step, no 1/16, nothing playing or queued, no click', () => {
        expect(playStore.get()).toEqual(IDLE);
        expect(IDLE).toEqual({ step: -1, sixteenth: -1, chain: null, section: null, queued: null, metBeat: null });
    });
});
