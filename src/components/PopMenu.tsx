import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Where a menu opens: under (or over) an element, or at a point (right-click). */
export type MenuAnchor = { rect: DOMRect } | { x: number; y: number };

export interface MenuItem {
    label: string;
    hint?: string;
    /** A short description after the label, in plain text (not a key). */
    note?: string;
    disabled?: boolean;
    danger?: boolean;
    /** Leave the menu open after picking it (e.g. "Rename…" swaps in a text box). */
    keepOpen?: boolean;
    onSelect: () => void;
}

/**
 * A small menu floating over the page (fixed, kept inside the window), for long-press and right-click
 * menus. Closes on a tap outside, Esc, or after picking an item; arrow keys move between items.
 */
export const PopMenu: React.FC<{ anchor: MenuAnchor; label: string; items: MenuItem[]; onClose: () => void; children?: React.ReactNode }> = ({ anchor, label, items, onClose, children }) => {
    const box = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        const el = box.current;
        if (!el) return;
        const w = el.offsetWidth;
        // never taller than the window (it scrolls inside itself then)
        const h = Math.min(el.offsetHeight, window.innerHeight - 16);
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left: number;
        let top: number;
        if ('rect' in anchor) {
            // under the element if it fits, else over it, else as low as it fits (a short landscape phone)
            left = anchor.rect.left;
            top = anchor.rect.bottom + 4;
            if (top + h > vh - 8) top = anchor.rect.top - h - 4 >= 8 ? anchor.rect.top - h - 4 : Math.max(8, vh - h - 8);
        } else {
            left = anchor.x;
            top = anchor.y;
            if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
        }
        left = Math.max(8, Math.min(left, vw - w - 8));
        setPos({ left, top });
    }, [anchor, items.length]);

    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        box.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
        const close = (e: PointerEvent) => {
            if (!box.current?.contains(e.target as Node)) closeRef.current();
        };
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeRef.current();
                return;
            }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const list = Array.from(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
            const i = list.indexOf(document.activeElement as HTMLElement);
            const next = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
            next?.focus();
            e.preventDefault();
        };
        // a frame later, so the press that opened the menu doesn't close it
        const t = setTimeout(() => document.addEventListener('pointerdown', close), 0);
        document.addEventListener('keydown', key, true);
        return () => {
            clearTimeout(t);
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', key, true);
            if (before && document.contains(before) && box.current?.contains(document.activeElement)) before.focus();
        };
    }, []);

    return (
        <div
            ref={box}
            className="song-popover pop-menu panel"
            role="menu"
            aria-label={label}
            style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, right: 'auto', maxHeight: 'calc(100vh - 16px)', maxWidth: 'calc(100vw - 16px)', overflowY: 'auto' }}
        >
            {children}
            {items.map(it => (
                <button
                    key={it.label}
                    role="menuitem"
                    className={it.danger ? 'danger' : undefined}
                    disabled={it.disabled}
                    onClick={() => {
                        if (!it.keepOpen) onClose();
                        it.onSelect();
                    }}
                >
                    {it.label}
                    {it.note && <span className="add-part-hint">{it.note}</span>}
                    {it.hint && <span className="kbd">{it.hint}</span>}
                </button>
            ))}
        </div>
    );
};

/**
 * Long-press (touch or mouse held ~0.5 s without moving) and right-click open a menu; a plain tap still
 * clicks. Spread the returned handlers on the element, and call `wasLongPress()` in its onClick to
 * ignore the click that ends a long-press.
 */
export function useLongPress(onLong: (anchor: MenuAnchor) => void) {
    const timer = useRef<number | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const fired = useRef(false);
    const clear = () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
    };
    useEffect(() => clear, []);
    return {
        handlers: {
            onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
                if (e.button > 0) return;
                fired.current = false;
                start.current = { x: e.clientX, y: e.clientY };
                const rect = e.currentTarget.getBoundingClientRect();
                clear();
                timer.current = window.setTimeout(() => {
                    fired.current = true;
                    onLong({ rect });
                }, 500);
            },
            onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
                const s = start.current;
                if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) clear();
            },
            onPointerUp: clear,
            onPointerCancel: clear,
            onPointerLeave: clear,
            onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
                e.preventDefault();
                clear();
                fired.current = true;
                // keyboard (Menu key / Shift+F10) fires this at 0,0: open under the element instead
                onLong(e.clientX === 0 && e.clientY === 0 ? { rect: e.currentTarget.getBoundingClientRect() } : { x: e.clientX, y: e.clientY });
            },
        },
        wasLongPress: () => {
            const f = fired.current;
            fired.current = false;
            return f;
        },
    };
}
