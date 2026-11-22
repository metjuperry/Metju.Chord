import { useCallback, useRef, useState } from 'react';

/**
 * A function that keeps its identity for the component's life and always calls the latest `fn`: for
 * handlers handed to memoised components (`React.memo`), so a parent's re-render doesn't re-render them
 * just because a closure was made again. Call it from events and effects, not during render.
 */
export function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    const ref = useRef(fn);
    ref.current = fn;
    return useCallback((...args: A) => ref.current(...args), []);
}

/**
 * `useStable` for an object of functions (App's `edit`, `melodyActions`…): the same object, with the
 * same functions, for the component's life, each calling the latest version. The keys must not change.
 */
export function useStableActions<T extends { [k: string]: (...args: never[]) => unknown }>(actions: T): T {
    const ref = useRef(actions);
    ref.current = actions;
    const [stable] = useState(() => Object.fromEntries(Object.keys(actions).map(k => [
        k,
        (...args: never[]) => (ref.current[k] as (...a: never[]) => unknown)(...args),
    ])) as T);
    return stable;
}
