import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * The app's motion: short, calm, and never in the way of playing. Everything here is skipped when
 * the system asks for reduced motion. Durations and easing match the CSS tokens in index.css
 * (--motion-fast, --motion, --ease).
 */

export const MOTION_MS = 200;
export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export const reducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Slide `el`'s content in from the side it's coming from: `dir` 1 = from the right (next), -1 = from the left (previous). */
export function slideIn(els: Iterable<Element>, dir: 1 | -1) {
    if (reducedMotion()) return;
    for (const el of els) {
        (el as HTMLElement).animate?.(
            [{ transform: `translateX(${dir * 28}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
            { duration: MOTION_MS, easing: EASE },
        );
    }
}

/** A quick cross-fade in, for content that was just swapped (another part in Parts). */
export function fadeIn(el: Element | null) {
    if (!el || reducedMotion()) return;
    (el as HTMLElement).animate?.(
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: MOTION_MS, easing: EASE },
    );
}

type ViewTransition = { finished: Promise<void> };
type WithViewTransitions = Document & { startViewTransition?: (update: () => void) => ViewTransition };

/** The name the section tile and the section editor share while one grows into the other. */
const ZOOM_NAME = 'section-zoom';

/**
 * Zoom between a section's tile in the song view and the section editor: the tile grows into the
 * editor, and going back shrinks the editor into the tile. `update` makes the change (it runs
 * synchronously inside the transition). Without View Transitions, or with reduced motion, it just changes.
 */
export function zoomSection(sectionId: string, update: () => void) {
    const doc = document as WithViewTransitions;
    if (!doc.startViewTransition || reducedMotion()) {
        update();
        return;
    }
    const tile = () => document.querySelector<HTMLElement>(`.sec-tile[data-section="${CSS.escape(sectionId)}"]`);
    const editor = () => document.querySelector<HTMLElement>('.progression');
    const named: HTMLElement[] = [];
    const name = (el: HTMLElement | null) => {
        if (!el) return;
        el.style.viewTransitionName = ZOOM_NAME;
        named.push(el);
    };
    // the tile on screen now means zooming in: it becomes the editor; otherwise the editor shrinks into the tile
    const fromTile = tile();
    const from = fromTile ?? editor();
    name(from);
    const t = doc.startViewTransition(() => {
        if (from) from.style.viewTransitionName = '';
        flushSync(update);
        name(fromTile ? editor() : tile());
    });
    t.finished.finally(() => named.forEach(el => (el.style.viewTransitionName = ''))).catch(() => undefined);
}

/**
 * Sliding thumbs for every `.segmented` group: a highlight under the pressed button that slides to
 * the next one, instead of the colour jumping. It's drawn by CSS (`.segmented[data-thumb]::before`)
 * from the position written here; groups with nothing pressed hide it.
 */
export function useSegmentThumbs() {
    useEffect(() => {
        let frame = 0;
        const place = () => {
            frame = 0;
            document.querySelectorAll<HTMLElement>('.segmented').forEach(g => {
                const on = g.querySelector<HTMLElement>(':scope > button[aria-pressed="true"]');
                if (!on || !on.offsetWidth) {
                    if (g.dataset.thumb) g.dataset.thumb = 'off';
                    return;
                }
                const vars: [string, string][] = [
                    ['--seg-x', `${on.offsetLeft}px`], ['--seg-y', `${on.offsetTop}px`],
                    ['--seg-w', `${on.offsetWidth}px`], ['--seg-h', `${on.offsetHeight}px`],
                ];
                vars.forEach(([k, v]) => {
                    if (g.style.getPropertyValue(k) !== v) g.style.setProperty(k, v);
                });
                if (g.dataset.thumb !== 'on') g.dataset.thumb = 'on';
            });
        };
        const soon = () => {
            if (!frame) frame = requestAnimationFrame(place);
        };
        place();
        const mo = new MutationObserver(soon);
        mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'class', 'style', 'hidden'] });
        const ro = new ResizeObserver(soon);
        ro.observe(document.body);
        window.addEventListener('resize', soon);
        document.fonts?.ready.then(soon).catch(() => undefined);
        return () => {
            mo.disconnect();
            ro.disconnect();
            window.removeEventListener('resize', soon);
            cancelAnimationFrame(frame);
        };
    }, []);
}

/**
 * A value that glides to its next state when armed, and follows it at once otherwise: Reset arms
 * it, so the knobs and graphs swing back to the instrument's own sound while turning a knob still
 * tracks your finger exactly. `lerp(a, b, t)` mixes two values.
 */
export function useMorph<T>(value: T, lerp: (a: T, b: T, t: number) => T, ms = 320): [T, () => void] {
    const [shown, setShown] = useState(value);
    const armed = useRef(false);
    const shownRef = useRef(value);
    const frame = useRef(0);
    useLayoutEffect(() => {
        cancelAnimationFrame(frame.current);
        if (!armed.current || reducedMotion()) {
            shownRef.current = value;
            setShown(value);
            return;
        }
        armed.current = false;
        const from = shownRef.current;
        const t0 = performance.now();
        const step = (now: number) => {
            const t = Math.min(1, (now - t0) / ms);
            const eased = 1 - Math.pow(1 - t, 3);
            const v = t >= 1 ? value : lerp(from, value, eased);
            shownRef.current = v;
            setShown(v);
            if (t < 1) frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    useEffect(() => () => cancelAnimationFrame(frame.current), []);
    return [shown, () => (armed.current = true)];
}
