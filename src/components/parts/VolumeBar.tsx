import React, { useRef } from 'react';

const VOL_MIN = -24;
const VOL_MAX = 6;
const dB = (v: number) => `${v > 0 ? '+' : ''}${v} dB`;

/** A part's volume as a thin bar in its colour: drag along it, arrow keys, double-tap for 0 dB. */
export const VolumeBar: React.FC<{ value: number; color: string; name: string; onChange: (v: number) => void }> = ({ value, color, name, onChange }) => {
    const drag = useRef<{ id: number } | null>(null);
    const lastTap = useRef(0);
    const clamp = (v: number) => Math.max(VOL_MIN, Math.min(VOL_MAX, Math.round(v)));
    const fromX = (e: React.PointerEvent<HTMLSpanElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        return clamp(VOL_MIN + ((e.clientX - box.left) / box.width) * (VOL_MAX - VOL_MIN));
    };
    const frac = (value - VOL_MIN) / (VOL_MAX - VOL_MIN);
    const zero = (0 - VOL_MIN) / (VOL_MAX - VOL_MIN);
    return (
        <span
            className="vol-bar"
            role="slider"
            tabIndex={0}
            aria-label={`${name} volume`}
            aria-valuemin={VOL_MIN}
            aria-valuemax={VOL_MAX}
            aria-valuenow={value}
            aria-valuetext={dB(value)}
            title={`Volume ${dB(value)} · drag · double-tap for 0 dB`}
            style={{ '--track': color } as React.CSSProperties}
            onPointerDown={e => {
                if (e.button > 0) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const now = performance.now();
                if (now - lastTap.current < 300) {
                    lastTap.current = 0;
                    drag.current = null;
                    onChange(0);
                    return;
                }
                lastTap.current = now;
                drag.current = { id: e.pointerId };
                const v = fromX(e);
                if (v !== value) onChange(v);
            }}
            onPointerMove={e => {
                if (drag.current?.id !== e.pointerId) return;
                const v = fromX(e);
                if (v !== value) onChange(v);
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
                const step = e.shiftKey ? 3 : 1;
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(clamp(value + step));
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(clamp(value - step));
                else if (e.key === 'Home' || e.key === 'Delete' || e.key === 'Backspace') onChange(0);
                else return;
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <span className="vol-fill" style={{ width: `${frac * 100}%` }} />
            <span className="vol-zero" style={{ left: `${zero * 100}%` }} aria-hidden="true" />
        </span>
    );
};
