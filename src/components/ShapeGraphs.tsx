import React from 'react';
import { CUTOFF_MAX, ENV_OCTAVES, LFO_OCTAVES, PartShape, filterResponseDb } from '../sound';

/**
 * Read-only pictures of a part's shape, redrawn as its knobs turn: the envelope (how a note's volume
 * rises and falls) and the filter (which frequencies get through). Simple mode shows these over the
 * knobs; they don't take input.
 */

const W = 240;
const H = 84;
const PAD = 6;
const BASE = H - 12;
const TOP = 8;

/** A segment's width for a time: log-ish, so 5 ms and 4 s both show and turning a knob always moves it. */
const span = (t: number, max: number) => 8 + (max - 8) * Math.min(1, Math.log1p(t * 200) / Math.log1p(8 * 200));

function envelopePath(s: PartShape): { line: string; fill: string; gateX: number } {
    const ya = (l: number) => BASE - l * (BASE - TOP);
    const xA = PAD + span(s.attack, 70);
    const xD = xA + span(s.decay, 60);
    const xG = xD + 34;
    const xR = Math.min(W - PAD, xG + span(s.release, 70));
    const pts: [number, number][] = [[PAD, ya(0)], [xA, ya(1)], [xD, ya(s.sustain)], [xG, ya(s.sustain)], [xR, ya(0)]];
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { line, fill: `${line} L${PAD} ${BASE} Z`, gateX: xG };
}

const FMIN = 30;
const fx = (f: number) => PAD + (Math.log(f / FMIN) / Math.log(CUTOFF_MAX / FMIN)) * (W - 2 * PAD);
const DBMAX = 24;
const DBMIN = -36;
const fy = (db: number) => TOP + ((DBMAX - Math.max(DBMIN, Math.min(DBMAX, db))) / (DBMAX - DBMIN)) * (BASE - TOP);

function filterPath(s: PartShape): { line: string; fill: string; band: [number, number] | null } {
    let line = '';
    for (let i = 0; i <= 80; i++) {
        const f = FMIN * Math.pow(CUTOFF_MAX / FMIN, i / 80);
        line += `${i ? 'L' : 'M'}${fx(f).toFixed(1)} ${fy(filterResponseDb(s.filterType, s.cutoff, s.resonance, f)).toFixed(1)} `;
    }
    // where the envelope and the LFO move the cutoff to
    const env = s.envAmount * ENV_OCTAVES;
    const lfo = s.lfoDepth * LFO_OCTAVES;
    const lo = s.cutoff * Math.pow(2, Math.min(0, env) - lfo);
    const hi = s.cutoff * Math.pow(2, Math.max(0, env) + lfo);
    const clampF = (f: number) => Math.max(FMIN, Math.min(CUTOFF_MAX, f));
    const band: [number, number] | null = env !== 0 || lfo > 0 ? [fx(clampF(lo)), fx(clampF(hi))] : null;
    return { line, fill: `${line}L${W - PAD} ${BASE} L${PAD} ${BASE} Z`, band };
}

const ShapeGraphs: React.FC<{ shape: PartShape; color: string }> = ({ shape, color }) => {
    const env = envelopePath(shape);
    const flt = filterPath(shape);
    return (
        <div className="shape-graphs" aria-hidden="true">
            <figure className="shape-graph">
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                    <line x1={env.gateX} y1={TOP} x2={env.gateX} y2={BASE} className="sg-gate" />
                    <path d={env.fill} fill={color} fillOpacity={0.16} />
                    <path d={env.line} stroke={color} className="sg-line" />
                    <line x1={PAD} y1={BASE} x2={W - PAD} y2={BASE} className="sg-axis" />
                </svg>
                <figcaption>Envelope <span>key held · let go</span></figcaption>
            </figure>
            <figure className="shape-graph">
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                    {[100, 1000, 10000].map(f => <line key={f} x1={fx(f)} y1={TOP} x2={fx(f)} y2={BASE} className="sg-grid" />)}
                    <line x1={PAD} y1={fy(0)} x2={W - PAD} y2={fy(0)} className="sg-grid" />
                    {flt.band && <rect x={flt.band[0]} y={TOP} width={Math.max(1, flt.band[1] - flt.band[0])} height={BASE - TOP} className="sg-band" />}
                    <path d={flt.fill} fill={color} fillOpacity={0.16} />
                    <path d={flt.line} stroke={color} className="sg-line" />
                </svg>
                <figcaption>Filter <span>100 · 1k · 10k Hz</span></figcaption>
            </figure>
        </div>
    );
};

export default ShapeGraphs;
