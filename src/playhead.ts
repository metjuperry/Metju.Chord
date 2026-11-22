import { useCallback, useRef, useSyncExternalStore } from 'react';

/**
 * What moves while the song plays: where the playhead is, which section plays, what is queued, the
 * click's beat. It lives here, outside React state, so the ~8 changes a second at 120 BPM re-render only
 * the components that draw a playhead or a "now" mark (they subscribe with `usePlay`), not all of App.
 * App writes it: the playback frame loop (step, sixteenth, chain), section switches (section, queued)
 * and the metronome (metBeat). Code that needs the position at an event (Stop, recording) reads
 * `playStore.get()` or the player, never a render's copy.
 *
 * The cursor (the playhead while stopped, where Play starts) is not here: it changes on user action and
 * is App state, passed down as an ordinary prop.
 */
export interface PlayState {
    /** The open section's step under the playhead while playing, or -1 (stopped, or another section playing). */
    step: number;
    /** The same in 1/16s from the section's top, for the melody and drum grids, or -1. */
    sixteenth: number;
    /** Chain mode while playing: the chain slot playing and the song tick. */
    chain: { index: number; tick: number } | null;
    /** Loop mode while playing: the section playing (it can lag the open one until a queued switch lands). */
    section: string | null;
    /** Loop mode: the section waiting for the next bar line. */
    queued: string | null;
    /** The beat the click just sounded, or null when it's off. */
    metBeat: number | null;
}

export const IDLE: PlayState = { step: -1, sixteenth: -1, chain: null, section: null, queued: null, metBeat: null };

export interface Store<S> {
    get: () => S;
    /** Merge `patch` in; listeners hear of it only when a value actually changed (compared with ===). */
    set: (patch: Partial<S>) => void;
    subscribe: (listener: () => void) => () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => state,
        set: patch => {
            let changed = false;
            for (const k in patch) {
                if (patch[k] !== state[k]) {
                    changed = true;
                    break;
                }
            }
            if (!changed) return;
            state = { ...state, ...patch };
            listeners.forEach(l => l());
        },
        subscribe: listener => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

/** The one playback position of the app. */
export const playStore = createStore<PlayState>(IDLE);

/**
 * Read part of the playback position, re-rendering only when that part changes. `select` must return
 * a primitive or an object from the store as it is (not a new one), and may close over props: the
 * latest `select` is used on every read.
 */
export function usePlay<T>(select: (s: PlayState) => T): T {
    const ref = useRef(select);
    ref.current = select;
    const read = useCallback(() => ref.current(playStore.get()), []);
    return useSyncExternalStore(playStore.subscribe, read, read);
}

/**
 * The step the sequencer marks: while playing, the open section's step under the playhead (-1 when
 * another section plays); while stopped, `cursor`, where Play starts.
 */
export const usePlayhead = (cursor: number, playing: boolean) => usePlay(s => (playing ? s.step : cursor));
