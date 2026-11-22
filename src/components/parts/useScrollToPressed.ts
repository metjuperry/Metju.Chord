import { useLayoutEffect, useRef } from 'react';

/** Keep the selected tile of a horizontally scrolling row in view when the part changes. */
export function useScrollToPressed(dep: unknown) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const row = ref.current;
        const on = row?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]');
        if (!row || !on) return;
        const left = on.offsetLeft - row.offsetLeft;
        if (left < row.scrollLeft || left + on.offsetWidth > row.scrollLeft + row.clientWidth) {
            row.scrollLeft = Math.max(0, left - (row.clientWidth - on.offsetWidth) / 2);
        }
    }, [dep]);
    return ref;
}
