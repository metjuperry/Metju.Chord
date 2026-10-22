import React from 'react';
import './FxMatrix.css';
import Knob from './Knob';
import { FX_KEYS, Part, PartFx, fxAvailable, glideSeconds } from '../parts';
import { DELAY_TIMES, DelayTime, Space } from '../song';

const FX_LABELS: { [k in keyof PartFx]: string } = { drive: 'Drive', chorus: 'Chorus', tremolo: 'Tremolo', glide: 'Glide', reverb: '→ Reverb', delay: '→ Delay' };
const FX_HINTS: { [k in keyof PartFx]: string } = {
    drive: 'grit and warmth, on this part only',
    chorus: 'width and shimmer, on this part only',
    tremolo: 'a volume wobble in 1/8 notes of the tempo, on this part only',
    glide: 'single notes slide into the next one (bass, melody, arpeggios; block chords don\'t glide)',
    reverb: 'how much of this part goes into the shared reverb',
    delay: 'how much of this part goes into the shared delay',
};
const TIME_LABELS: { [t in DelayTime]: string } = { '16n': '1/16', '8n': '1/8', '8t': '1/8T', '4n': '1/4', '2n': '1/2' };

/** Reverb size knob: 0..1 over 0.5..6 s. */
const SIZE_MIN = 0.5;
const SIZE_SPAN = 5.5;
const FEEDBACK_MAX = 0.9;
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** How an effect amount reads: glide as its time, the rest as a percentage. */
const fxText = (k: keyof PartFx, v: number) => (v <= 0 ? 'off' : k === 'glide' ? `${Math.round(glideSeconds(v) * 1000)} ms` : pct(v));

interface FxMatrixProps {
    parts: Part[];
    space: Space;
    selectedPart?: string;
    onSelectPart: (id: string) => void;
    onFx: (partId: string, key: keyof PartFx, value: number) => void;
    onSpace: (space: Space) => void;
    onDryAll: () => void;
}

/**
 * Effects as a matrix: a row per part, a column per effect, a knob in each cell. Drive and chorus
 * colour one part; the reverb and delay columns are sends into the song's shared reverb and delay,
 * whose settings sit underneath.
 */
const FxMatrix: React.FC<FxMatrixProps> = ({ parts, space, selectedPart, onSelectPart, onFx, onSpace, onDryAll }) => {
    const anyWet = parts.some(p => FX_KEYS.some(k => p.fx[k] > 0));
    const setSpace = <K extends keyof Space>(key: K, patch: Partial<Space[K]>) => onSpace({ ...space, [key]: { ...space[key], ...patch } });
    return (
        <section className="panel fx-matrix" aria-label="Effects">
            <div className="fx-head">
                <h2 className="eyebrow">Effects</h2>
                <span className="section-note fx-hint">drag a knob up or down · double-tap for off</span>
                <button className="chip-button" disabled={!anyWet} onClick={onDryAll}>All dry</button>
            </div>

            <div className="fx-grid" role="grid" aria-label="Effects per part">
                <span />
                {FX_KEYS.map(k => <span key={k} className="fx-col" title={FX_HINTS[k]}>{FX_LABELS[k]}</span>)}
                {parts.map(p => (
                    <React.Fragment key={p.id}>
                        <button
                            className={`fx-part ${p.id === selectedPart ? 'selected' : ''}`}
                            style={{ '--track': p.color } as React.CSSProperties}
                            aria-pressed={p.id === selectedPart}
                            onClick={() => onSelectPart(p.id)}
                        >
                            <i />{p.name}
                        </button>
                        {FX_KEYS.map(k => (fxAvailable(p.kind, k) ? (
                            <div key={k} className={`fx-cell ${p.fx[k] > 0 ? 'on' : ''}`} style={{ '--track': p.color } as React.CSSProperties}>
                                <Knob
                                    value={p.fx[k]}
                                    onChange={v => onFx(p.id, k, v)}
                                    color={p.color}
                                    label={`${p.name} ${FX_LABELS[k].replace('→ ', '')}`}
                                    display={fxText(k, p.fx[k])}
                                    offAtZero
                                />
                                <span className="fx-value">{fxText(k, p.fx[k])}</span>
                            </div>
                        ) : (
                            <div key={k} className="fx-cell na" title="Drums keep a clean hit: only reverb and delay">—</div>
                        )))}
                    </React.Fragment>
                ))}
            </div>

            <div className="fx-space">
                <div className="fx-card">
                    <b>Reverb</b>
                    <Knob
                        value={(space.reverb.size - SIZE_MIN) / SIZE_SPAN}
                        onChange={v => setSpace('reverb', { size: Math.round((SIZE_MIN + v * SIZE_SPAN) * 10) / 10 })}
                        color="var(--accent)" label="Reverb size" display={`${space.reverb.size.toFixed(1)} s`} size={32} resetTo={(2.5 - SIZE_MIN) / SIZE_SPAN}
                    />
                    <span className="fx-card-val">size {space.reverb.size.toFixed(1)} s</span>
                    <Knob value={space.reverb.ret} onChange={v => setSpace('reverb', { ret: v })} color="var(--accent)" label="Reverb return" display={pct(space.reverb.ret)} size={32} resetTo={0.8} />
                    <span className="fx-card-val">return {pct(space.reverb.ret)}</span>
                </div>
                <div className="fx-card">
                    <b>Delay</b>
                    <select aria-label="Delay time" value={space.delay.time} onChange={e => setSpace('delay', { time: e.target.value as DelayTime })}>
                        {DELAY_TIMES.map(t => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
                    </select>
                    <Knob
                        value={space.delay.feedback / FEEDBACK_MAX}
                        onChange={v => setSpace('delay', { feedback: Math.round(v * FEEDBACK_MAX * 100) / 100 })}
                        color="var(--accent)" label="Delay feedback" display={pct(space.delay.feedback)} size={32} resetTo={0.35 / FEEDBACK_MAX}
                    />
                    <span className="fx-card-val">feedback {pct(space.delay.feedback)}</span>
                    <Knob value={space.delay.ret} onChange={v => setSpace('delay', { ret: v })} color="var(--accent)" label="Delay return" display={pct(space.delay.ret)} size={32} resetTo={0.7} />
                    <span className="fx-card-val">return {pct(space.delay.ret)}</span>
                </div>
                <div className="fx-card">
                    <b>Out</b>
                    <Knob value={space.out.level} onChange={v => setSpace('out', { level: v })} color="var(--accent)" label="Output level" display={pct(space.out.level)} size={32} resetTo={1} />
                    <span className="fx-card-val">level {pct(space.out.level)} · limiter</span>
                </div>
            </div>
        </section>
    );
};

export default FxMatrix;
