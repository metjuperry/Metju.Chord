import React, { useEffect, useRef } from 'react';

interface KnobProps {
    /** 0..1 */
    value: number;
    onChange: (value: number) => void;
    /** Arc colour; grey when the knob is at 0 and `offAtZero`. */
    color: string;
    label: string;
    /** What the value reads as, e.g. "40%" or "2.8 s". */
    display: string;
    size?: number;
    /** 0 means off (dim arc, "off"), for effect amounts. */
    offAtZero?: boolean;
    /** Double-click / double-tap goes here (default 0). */
    resetTo?: number;
}

const SWEEP = 270;
/** Pixels of drag for the full range: fine enough to hit a value, short enough for a thumb. */
const DRAG_RANGE = 160;

/**
 * A rotary knob: drag up or down (mouse or touch), scroll, or use the arrow keys; double-click resets.
 * Drawn as an arc from 7 to 5 o'clock with a pointer, like the rest of the instrument's controls.
 */
const Knob: React.FC<KnobProps> = ({ value, onChange, color, label, display, size = 38, offAtZero = false, resetTo = 0 }) => {
    const drag = useRef<{ y: number; start: number; id: number } | null>(null);
    const el = useRef<HTMLSpanElement>(null);
    const latest = useRef({ value, onChange });
    latest.current = { value, onChange };

    // The wheel turns the knob. A native, non-passive listener, so the page doesn't scroll at the same time.
    useEffect(() => {
        const node = el.current;
        if (!node) return;
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            const { value: v, onChange: change } = latest.current;
            const next = Math.min(1, Math.max(0, Math.round((v - Math.sign(e.deltaY) * 0.05) * 100) / 100));
            if (next !== v) change(next);
        };
        node.addEventListener('wheel', wheel, { passive: false });
        return () => node.removeEventListener('wheel', wheel);
    }, []);
    const lastTap = useRef(0);
    const off = offAtZero && value <= 0;
    const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 100) / 100));

    const r = size / 2 - 4;
    const c = size / 2;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const at = (deg: number): [number, number] => [c + r * Math.cos(rad(deg)), c + r * Math.sin(rad(deg))];
    const a0 = 135;
    const a1 = a0 + SWEEP * value;
    const [x0, y0] = at(a0);
    const [xe, ye] = at(a0 + SWEEP);
    const [xv, yv] = at(a1);
    const pointer: [number, number] = [c + (r - 8) * Math.cos(rad(a1)), c + (r - 8) * Math.sin(rad(a1))];

    return (
        <span
            ref={el}
            className={`knob ${off ? 'off' : ''}`}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value * 100)}
            aria-valuetext={display}
            style={{ '--knob': color } as React.CSSProperties}
            onPointerDown={e => {
                if (e.button > 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                // a second tap within 300 ms resets (double-click on desktop, double-tap on phones)
                const now = performance.now();
                if (now - lastTap.current < 300) {
                    onChange(resetTo);
                    lastTap.current = 0;
                    drag.current = null;
                    return;
                }
                lastTap.current = now;
                drag.current = { y: e.clientY, start: value, id: e.pointerId };
            }}
            onPointerMove={e => {
                const d = drag.current;
                if (!d || d.id !== e.pointerId) return;
                const next = clamp(d.start + (d.y - e.clientY) / DRAG_RANGE);
                if (next !== value) onChange(next);
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={e => {
                const step = e.shiftKey ? 0.1 : 0.05;
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step));
                else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step));
                else if (e.key === 'Home' || e.key === 'Backspace' || e.key === 'Delete') onChange(resetTo);
                else return;
                e.preventDefault();
                // the keys belong to the knob here, not to the app's shortcuts (arrows also change octave)
                e.stopPropagation();
            }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                <path d={`M${x0} ${y0} A${r} ${r} 0 1 1 ${xe} ${ye}`} className="knob-track" />
                {value > 0.001 && (
                    <path d={`M${x0} ${y0} A${r} ${r} 0 ${SWEEP * value > 180 ? 1 : 0} 1 ${xv} ${yv}`} className="knob-arc" />
                )}
                <circle cx={c} cy={c} r={r - 5} className="knob-cap" />
                <line x1={c} y1={c} x2={pointer[0]} y2={pointer[1]} className="knob-pointer" />
            </svg>
        </span>
    );
};

export default Knob;
