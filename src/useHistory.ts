import { useCallback, useRef, useState } from 'react';

const LIMIT = 200;
/** Edits with the same merge key this close together become one undo step (e.g. dragging a slider). */
const MERGE_MS = 800;

interface History<T> {
    past: T[];
    present: T;
    future: T[];
}

/**
 * Undo/redo over an immutable value. `commit` records a new state; passing a `mergeKey`
 * folds rapid repeated edits of the same thing into a single step.
 */
export function useHistory<T>(initial: () => T) {
    const [h, setH] = useState<History<T>>(() => ({ past: [], present: initial(), future: [] }));
    const last = useRef<{ key: string; at: number } | null>(null);

    const commit = useCallback((update: (present: T) => T, mergeKey?: string) => {
        const now = Date.now();
        const merge = !!mergeKey && last.current?.key === mergeKey && now - last.current.at < MERGE_MS;
        last.current = mergeKey ? { key: mergeKey, at: now } : null;
        setH(cur => {
            const next = update(cur.present);
            if (next === cur.present) return cur;
            return {
                past: merge ? cur.past : [...cur.past, cur.present].slice(-LIMIT),
                present: next,
                future: [],
            };
        });
    }, []);

    const undo = useCallback(() => {
        last.current = null;
        setH(cur => (cur.past.length
            ? { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] }
            : cur));
    }, []);

    const redo = useCallback(() => {
        last.current = null;
        setH(cur => (cur.future.length
            ? { past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) }
            : cur));
    }, []);

    return { state: h.present, commit, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
