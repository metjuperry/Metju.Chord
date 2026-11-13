import { useCallback, useState } from 'react';

const LIMIT = 200;
/** Edits with the same merge key this close together become one undo step (e.g. dragging a slider). */
export const MERGE_MS = 800;

export interface History<T> {
    past: T[];
    present: T;
    future: T[];
    /** The merge key of the last edit that changed something, and when (ms): the step a same-key edit folds into. */
    last: { key: string; at: number } | null;
}

export const initialHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], last: null });

/**
 * Record `update(present)` as a new step at time `now` (ms), or fold it into the last step when that
 * one changed something with the same `mergeKey` less than `MERGE_MS` ago. An edit that changes nothing
 * records nothing and starts no merge, so the next real edit still gets its own step.
 */
export function commitHistory<T>(h: History<T>, update: (present: T) => T, mergeKey: string | undefined, now: number): History<T> {
    const next = update(h.present);
    if (next === h.present) return h;
    const merge = !!mergeKey && h.last?.key === mergeKey && now - h.last.at < MERGE_MS;
    return {
        past: merge ? h.past : [...h.past, h.present].slice(-LIMIT),
        present: next,
        future: [],
        last: mergeKey ? { key: mergeKey, at: now } : null,
    };
}

export const undoHistory = <T>(h: History<T>): History<T> => (h.past.length
    ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], last: null }
    : h);

export const redoHistory = <T>(h: History<T>): History<T> => (h.future.length
    ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), last: null }
    : h);

/**
 * Undo/redo over an immutable value. `commit` records a new state; passing a `mergeKey`
 * folds rapid repeated edits of the same thing into a single step.
 */
export function useHistory<T>(initial: () => T) {
    const [h, setH] = useState<History<T>>(() => initialHistory(initial()));

    const commit = useCallback((update: (present: T) => T, mergeKey?: string) => {
        const now = Date.now();
        setH(cur => commitHistory(cur, update, mergeKey, now));
    }, []);

    const undo = useCallback(() => setH(undoHistory), []);
    const redo = useCallback(() => setH(redoHistory), []);

    return { state: h.present, commit, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
