import { RefObject, useEffect } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, newest last: only the top one handles keys (Credits opened from Settings closes first). */
const stack: object[] = [];

/**
 * A modal's keyboard behaviour: focus moves into it when it opens (and back where it was when it
 * closes), Tab and Shift+Tab stay inside it, and Escape closes it. Pair with `role="dialog"` and
 * `aria-modal="true"` on the element.
 */
export function useDialog(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
    useEffect(() => {
        if (!open) return;
        const me = {};
        stack.push(me);
        const before = document.activeElement as HTMLElement | null;
        const node = ref.current;
        const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
        first?.focus();
        const key = (e: KeyboardEvent) => {
            const el = ref.current;
            if (!el || stack[stack.length - 1] !== me) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;
            const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(x => x.offsetParent !== null || x === document.activeElement);
            if (items.length === 0) return;
            const a = items[0];
            const z = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === a || !el.contains(document.activeElement))) {
                e.preventDefault();
                z.focus();
            } else if (!e.shiftKey && (document.activeElement === z || !el.contains(document.activeElement))) {
                e.preventDefault();
                a.focus();
            }
        };
        // capture: Escape closes the top dialog before the app's own handler sees it
        document.addEventListener('keydown', key, true);
        return () => {
            document.removeEventListener('keydown', key, true);
            stack.splice(stack.indexOf(me), 1);
            if (before && document.contains(before)) before.focus();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
}
