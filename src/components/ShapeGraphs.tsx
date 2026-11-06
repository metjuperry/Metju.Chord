import React, { useRef } from 'react';
import { CUTOFF_MAX, ENV_OCTAVES, KNOBS, LFO_OCTAVES, PartShape, ShapeOverrides, filterResponseDb } from '../sound';

/**
 * Pictures of a part's shape: the envelope (how a note's volume rises and falls) and the filter (which
 * frequencies get through). Simple shows them read-only over the knobs; Advanced makes them draggable
 * (`onChange`): the envelope's three points are Attack, Decay + Sustain and Release, the filter's point
 * is Cutoff (left/right) and Resonance (up/down). The knobs stay the keyboard path; the graphs are
 * hidden from screen readers.
 */

const W = 240;
const PAD = 6;

// ---- envelope ---------------------------------------------------------------------------------

/** A segment's width for a time: log-ish, so 5 ms and 4 s both show and turning a knob always moves it. */
const SPAN_T = 8;
const span = (t: number, max: number) => 8 + (max - 8) * Math.min(1, Math.log1p(Math.max(0, t) * 200) / Math.log1p(SPAN_T * 200));
/** The time a segment `w` wide stands for (the inverse of `span`). */
const unspan = (w: number, max: number) => (Math.exp((Math.max(0, Math.min(1, (w - 8) / (max - 8)))) * Math.log1p(SPAN_T * 200)) - 1) / 200;

const SEG = { a: 70, d: 60, hold: 34, r: 70 };

function envelopeGeometry(s: PartShape, h: number) {
    const base = h - 10;
    const top = 8;
    const ya = (l: number) => base - l * (base - top);
    const xA = PAD + span(s.attack, SEG.a);
    const xD = xA + span(s.decay, SEG.d);
    const xG = xD + SEG.hold;
    const xR = Math.min(W - PAD, xG + span(s.release, SEG.r));
    const pts: [number, number][] = [[PAD, ya(0)], [xA, ya(1)], [xD, ya(s.sustain)], [xG, ya(s.sustain)], [xR, ya(0)]];
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { line, fill: `${line} L${PAD} ${base} Z`, base, top, ya, xA, xD, xG, xR };
}

// ---- filter -----------------------------------------------------------------------------------

const FMIN = 30;
const DBMAX = 24;
const DBMIN = -36;
const fx = (f: number) => PAD + (Math.log(f / FMIN) / Math.log(CUTOFF_MAX / FMIN)) * (W - 2 * PAD);
const unfx = (x: number) => FMIN * Math.pow(CUTOFF_MAX / FMIN, Math.max(0, Math.min(1, (x - PAD) / (W - 2 * PAD))));

function filterGeometry(s: PartShape, h: number) {
    const base = h - 10;
    const top = 8;
    const fy = (db: number) => top + ((DBMAX - Math.max(DBMIN, Math.min(DBMAX, db))) / (DBMAX - DBMIN)) * (base - top);
    let line = '';
    for (let i = 0; i <= 90; i++) {
        const f = FMIN * Math.pow(CUTOFF_MAX / FMIN, i / 90);
        line += `${i ? 'L' : 'M'}${fx(f).toFixed(1)} ${fy(filterResponseDb(s.filterType, s.cutoff, s.resonance, f)).toFixed(1)} `;
    }
    // where the envelope and the LFO move the cutoff to
    const env = s.envAmount * ENV_OCTAVES;
    const lfo = s.lfoDepth * LFO_OCTAVES;
    const clampF = (f: number) => Math.max(FMIN, Math.min(CUTOFF_MAX, f));
    const lo = fx(clampF(s.cutoff * Math.pow(2, Math.min(0, env) - lfo)));
    const hi = fx(clampF(s.cutoff * Math.pow(2, Math.max(0, env) + lfo)));
    const peak = filterResponseDb(s.filterType, s.cutoff, s.resonance, s.cutoff);
    return {
        line, fill: `${line}L${W - PAD} ${base} L${PAD} ${base} Z`, base, top, fy,
        band: env !== 0 || lfo > 0 ? [lo, hi] as const : null,
        hx: fx(Math.min(s.cutoff, CUTOFF_MAX)), hy: fy(peak),
        /** Resonance from a height: the peak's dB back to 0–1 (two stages of 0.5 + 10.5 r dB each). */
        resAt: (y: number) => {
            const db = DBMAX - ((y - top) / (base - top)) * (DBMAX - DBMIN);
            return Math.max(0, Math.min(1, (db / 2 - 0.5) / 10.5));
        },
    };
}

// ---- dragging -----------------------------------------------------------------------------------

/** Pointer position in the svg's own units. */
function svgPoint(svg: SVGSVGElement, e: React.PointerEvent): { x: number; y: number } {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
}

/** Drag state for one graph: which handle is held; pointer capture keeps the drag when it leaves the svg. */
function useDrag<T extends string>(onMove: (which: T, p: { x: number; y: number }) => void) {
    const held = useRef<T | null>(null);
    const svg = useRef<SVGSVGElement>(null);
    return {
        svg,
        grab: (which: T) => (e: React.PointerEvent) => {
            held.current = which;
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            e.preventDefault();
        },
        move: (e: React.PointerEvent) => {
            if (held.current && svg.current) onMove(held.current, svgPoint(svg.current, e));
        },
        end: () => {
            held.current = null;
        },
    };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A draggable point: a small visible dot inside a much bigger invisible target, so a fingertip can grab it. */
const Handle: React.FC<{ x: number; y: number; r: number; onGrab: (e: React.PointerEvent) => void }> = ({ x, y, r, onGrab }) => (
    <g>
        <circle cx={x} cy={y} r={r * 3} className="sg-hit" onPointerDown={onGrab} />
        <circle cx={x} cy={y} r={r} className="sg-handle" />
    </g>
);

export const EnvelopeGraph: React.FC<{ shape: PartShape; color: string; height?: number; onChange?: (patch: ShapeOverrides, key: string) => void }> = ({ shape, color, height = 84, onChange }) => {
    const g = envelopeGeometry(shape, height);
    const drag = useDrag<'a' | 'd' | 'r'>((which, p) => {
        if (!onChange) return;
        if (which === 'a') onChange({ attack: clamp(unspan(p.x - PAD, SEG.a), KNOBS.attack.min, KNOBS.attack.max) }, 'attack');
        if (which === 'd') {
            const sustain = clamp((g.base - p.y) / (g.base - g.top), 0, 1);
            onChange({ decay: clamp(unspan(p.x - g.xA, SEG.d), KNOBS.decay.min, KNOBS.decay.max), sustain }, 'decay+sustain');
        }
        if (which === 'r') onChange({ release: clamp(unspan(p.x - g.xG, SEG.r), KNOBS.release.min, KNOBS.release.max) }, 'release');
    });
    return (
        <figure className={`shape-graph ${onChange ? 'live' : ''}`} aria-hidden="true">
            <svg
                ref={drag.svg}
                viewBox={`0 0 ${W} ${height}`}
                preserveAspectRatio={onChange ? 'xMidYMid meet' : 'none'}
                style={onChange ? { aspectRatio: `${W} / ${height}`, height: 'auto' } : undefined}
                onPointerMove={drag.move}
                onPointerUp={drag.end}
                onPointerCancel={drag.end}
            >
                <line x1={g.xG} y1={g.top} x2={g.xG} y2={g.base} className="sg-gate" />
                <path d={g.fill} fill={color} fillOpacity={0.16} />
                <path d={g.line} stroke={color} className="sg-line" />
                <line x1={PAD} y1={g.base} x2={W - PAD} y2={g.base} className="sg-axis" />
                {onChange && (
                    <>
                        <Handle x={g.xA} y={g.ya(1)} r={4.5} onGrab={drag.grab('a')} />
                        <Handle x={g.xD} y={g.ya(shape.sustain)} r={4.5} onGrab={drag.grab('d')} />
                        <Handle x={g.xR} y={g.ya(0)} r={4.5} onGrab={drag.grab('r')} />
                    </>
                )}
            </svg>
            <figcaption>Envelope <span>{onChange ? 'drag: attack · decay & sustain · release' : 'key held · let go'}</span></figcaption>
        </figure>
    );
};

export const FilterGraph: React.FC<{ shape: PartShape; color: string; height?: number; onChange?: (patch: ShapeOverrides, key: string) => void }> = ({ shape, color, height = 84, onChange }) => {
    const g = filterGeometry(shape, height);
    const drag = useDrag<'f'>((_, p) => {
        if (!onChange) return;
        onChange({ cutoff: clamp(unfx(p.x), KNOBS.cutoff.min, KNOBS.cutoff.max), resonance: g.resAt(p.y) }, 'cutoff+resonance');
    });
    return (
        <figure className={`shape-graph ${onChange ? 'live' : ''}`} aria-hidden="true">
            <svg
                ref={drag.svg}
                viewBox={`0 0 ${W} ${height}`}
                preserveAspectRatio={onChange ? 'xMidYMid meet' : 'none'}
                style={onChange ? { aspectRatio: `${W} / ${height}`, height: 'auto' } : undefined}
                onPointerMove={drag.move}
                onPointerUp={drag.end}
                onPointerCancel={drag.end}
            >
                {[100, 1000, 10000].map(f => <line key={f} x1={fx(f)} y1={g.top} x2={fx(f)} y2={g.base} className="sg-grid" />)}
                <line x1={PAD} y1={g.fy(0)} x2={W - PAD} y2={g.fy(0)} className="sg-grid" />
                {g.band && <rect x={g.band[0]} y={g.top} width={Math.max(1, g.band[1] - g.band[0])} height={g.base - g.top} className="sg-band" />}
                <path d={g.fill} fill={color} fillOpacity={0.16} />
                <path d={g.line} stroke={color} className="sg-line" />
                {onChange && <Handle x={g.hx} y={g.hy} r={5} onGrab={drag.grab('f')} />}
            </svg>
            <figcaption>Filter <span>{onChange ? 'drag: ← → cutoff · ↑ ↓ resonance' : '100 · 1k · 10k Hz'}</span></figcaption>
        </figure>
    );
};

/** Simple: both pictures, read-only. */
const ShapeGraphs: React.FC<{ shape: PartShape; color: string }> = ({ shape, color }) => (
    <div className="shape-graphs">
        <EnvelopeGraph shape={shape} color={color} />
        <FilterGraph shape={shape} color={color} />
    </div>
);

export default ShapeGraphs;
