import React, { useState } from 'react';
import './SoundPanel.css';
import { ArpPattern } from '../theory';
import { ArpRate, FxName, FxState, getEngine } from '../audio/engine';
import { INSTRUMENTS, InstrumentId } from '../audio/instruments';
import { PlayMode } from '../parts';

export const ARP_RATES: { rate: ArpRate; label: string }[] = [
    { rate: '4n', label: '1/4' },
    { rate: '8n', label: '1/8' },
    { rate: '8t', label: '1/8T' },
    { rate: '16n', label: '1/16' },
    { rate: '16t', label: '1/16T' },
    { rate: '32n', label: '1/32' },
];

const ARP_PATTERNS: { id: ArpPattern; label: string }[] = [
    { id: 'up', label: 'Up' },
    { id: 'down', label: 'Down' },
    { id: 'upDown', label: 'Up-Down' },
    { id: 'random', label: 'Random' },
];

const WAVES: { [id in InstrumentId]: string } = {
    pad: 'M1 9 L7 3 L7 9 L13 3 L13 9 L19 3 L19 9 L25 3',
    epiano: 'M1 6 Q2 0 3 6 T5 6 Q8 0 11 6 T17 6 Q20 0 21 6 T25 6',
    organ: 'M1 6 Q3 1 5 6 T9 6 Q11 3 13 6 T17 6 Q19 1 21 6 T25 6',
    pluck: 'M1 6 Q3 -2 5 6 Q7 11 9 6 Q11 3 13 6 Q16 8 19 6 L25 6',
    lead: 'M1 10 V2 H7 V10 H13 V2 H19 V10 H25',
    strings: 'M1 9 L5 3 L9 9 L13 3 L17 9 L21 3 L25 9',
    warmpad: 'M1 6 C5 0 9 0 13 6 S21 12 25 6',
    brass: 'M1 10 L4 2 L4 10 L9 2 L9 10 L14 2 L14 10 L19 2 L19 10 L25 4',
    drawbar: 'M3 11 V5 M7 11 V2 M11 11 V4 M15 11 V7 M19 11 V5 M23 11 V8',
    bells: 'M13 2 C8 2 7 6 6 9 H20 C19 6 18 2 13 2 M11 11 H15',
    mallets: 'M1 6 L5 1 L7 9 L9 4 L11 7 L14 5.5 L25 6',
    chip: 'M1 10 V2 H4 V10 H10 V2 H13 V10 H19 V2 H22 V10 H25',
    bass: 'M1 11 L7 3 V11 L13 3 V11 L19 3 V11 L25 3',
};

/** How a chord part plays the chords: held, or arpeggiated. */
export interface ChordStyle {
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    noteLength: number;
}

/** Play as Chord / Arp, and the arpeggiator's settings. Used in the Sound panel and the chord part editor. */
export const ChordStyleControls: React.FC<{ style: ChordStyle; onChange: (patch: Partial<ChordStyle>) => void }> = ({ style, onChange }) => {
    const rateIndex = Math.max(0, ARP_RATES.findIndex(r => r.rate === style.arpRate));
    return (
        <>
            <div className="sound-row">
                <span>Play as</span>
                <div className="segmented" role="group" aria-label="Play as">
                    {(['Chord', 'Arp'] as PlayMode[]).map(m => (
                        <button key={m} aria-pressed={style.playMode === m} onClick={() => onChange({ playMode: m })}>{m}</button>
                    ))}
                </div>
            </div>
            {style.playMode === 'Arp' && (
                <div className="arp-box">
                    <span className="arp-title">Arpeggiator</span>
                    <div className="arp-patterns" role="group" aria-label="Arp pattern">
                        {ARP_PATTERNS.map(p => (
                            <button key={p.id} aria-pressed={style.arpPattern === p.id} onClick={() => onChange({ arpPattern: p.id })}>{p.label}</button>
                        ))}
                    </div>
                    <Slider label="Rate" value={rateIndex} min={0} max={ARP_RATES.length - 1} step={1} display={ARP_RATES[rateIndex].label} onChange={v => onChange({ arpRate: ARP_RATES[v].rate })} />
                    <Slider label="Note length" value={style.noteLength} min={0.05} max={2} step={0.05} display={`${style.noteLength.toFixed(2)} s`} onChange={noteLength => onChange({ noteLength })} />
                </div>
            )}
        </>
    );
};

interface SoundPanelProps {
    /** The part whose sound this panel sets. */
    partName: string;
    partColor: string;
    instrument: InstrumentId;
    onInstrument: (id: InstrumentId) => void;
    /** For a chord part: how it plays the chords. */
    chordStyle?: ChordStyle;
    onChordStyle: (patch: Partial<ChordStyle>) => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }> =
    ({ label, value, min, max, step, display, onChange }) => (
        <label className="fx-slider">
            <span><span>{label}</span><span className="fx-value">{display}</span></span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
        </label>
    );

const Effects: React.FC = () => {
    const [fx, setFx] = useState<FxState>(() => getEngine().fx.get());
    const update = <N extends FxName>(name: N, params: Partial<FxState[N]>) => {
        getEngine().fx.set(name, params);
        setFx(getEngine().fx.get());
    };

    const rows: { name: FxName; label: string; enabled: boolean; body: React.ReactNode }[] = [
        {
            name: 'distortion', label: 'Distortion', enabled: fx.distortion.enabled,
            body: <Slider label="Drive" value={fx.distortion.amount} min={0} max={1} step={0.05} display={pct(fx.distortion.amount)} onChange={amount => update('distortion', { amount })} />,
        },
        {
            name: 'chorus', label: 'Chorus', enabled: fx.chorus.enabled,
            body: <>
                <Slider label="Depth" value={fx.chorus.depth} min={0} max={1} step={0.05} display={pct(fx.chorus.depth)} onChange={depth => update('chorus', { depth })} />
                <Slider label="Rate" value={fx.chorus.frequency} min={0.5} max={10} step={0.5} display={`${fx.chorus.frequency.toFixed(1)} Hz`} onChange={frequency => update('chorus', { frequency })} />
                <Slider label="Mix" value={fx.chorus.wet} min={0} max={1} step={0.05} display={pct(fx.chorus.wet)} onChange={wet => update('chorus', { wet })} />
            </>,
        },
        {
            name: 'delay', label: 'Delay', enabled: fx.delay.enabled,
            body: <>
                <label className="fx-slider">
                    <span><span>Time</span></span>
                    <select value={fx.delay.time} onChange={e => update('delay', { time: e.target.value })}>
                        <option value="16n">1/16</option>
                        <option value="8n">1/8</option>
                        <option value="4n">1/4</option>
                        <option value="2n">1/2</option>
                    </select>
                </label>
                <Slider label="Feedback" value={fx.delay.feedback} min={0} max={0.9} step={0.05} display={pct(fx.delay.feedback)} onChange={feedback => update('delay', { feedback })} />
                <Slider label="Mix" value={fx.delay.wet} min={0} max={1} step={0.05} display={pct(fx.delay.wet)} onChange={wet => update('delay', { wet })} />
            </>,
        },
        {
            name: 'reverb', label: 'Reverb', enabled: fx.reverb.enabled,
            body: <>
                <Slider label="Size" value={fx.reverb.decay} min={0.1} max={5} step={0.1} display={`${fx.reverb.decay.toFixed(1)} s`} onChange={decay => update('reverb', { decay })} />
                <Slider label="Mix" value={fx.reverb.wet} min={0} max={1} step={0.05} display={pct(fx.reverb.wet)} onChange={wet => update('reverb', { wet })} />
            </>,
        },
    ];

    return (
        <section className="panel sound-section" aria-labelledby="fx-title">
            <div className="section-head">
                <h2 className="eyebrow" id="fx-title">Effects</h2>
                <span className="section-note">signal flows top → bottom</span>
            </div>
            {rows.map((row, i) => (
                <div key={row.name} className={`fx-row ${row.enabled ? 'on' : ''}`}>
                    <div className="fx-head">
                        <span className="fx-name"><span className="fx-index">0{i + 1}</span>{row.label}</span>
                        <button
                            className="switch"
                            role="switch"
                            aria-checked={row.enabled}
                            aria-label={row.label}
                            onClick={() => update(row.name, { enabled: !row.enabled } as Partial<FxState[typeof row.name]>)}
                        >
                            <span />
                        </button>
                    </div>
                    {row.enabled && <div className="fx-body">{row.body}</div>}
                </div>
            ))}
        </section>
    );
};

const SoundPanel: React.FC<SoundPanelProps> = ({ partName, partColor, instrument, onInstrument, chordStyle, onChordStyle }) => (
    <aside className="sound-panel" aria-label="Sound">
        <section className="panel sound-section" aria-labelledby="inst-title">
            <div className="section-head">
                <h2 className="eyebrow" id="inst-title">Instrument</h2>
                <span className="section-note track-tag"><span className="track-dot" style={{ background: partColor }} />{partName}</span>
            </div>
            <div className="instrument-grid" role="group" aria-labelledby="inst-title">
                {INSTRUMENTS.map(({ id, label }) => (
                    <button key={id} aria-pressed={instrument === id} onClick={() => onInstrument(id)}>
                        <svg width="26" height="12" viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={WAVES[id]} /></svg>
                        <span>{label}</span>
                    </button>
                ))}
            </div>
            {chordStyle && <ChordStyleControls style={chordStyle} onChange={onChordStyle} />}
            <p className="section-note">
                {chordStyle
                    ? `${chordStyle.playMode === 'Chord' ? 'Chords ring while you hold a pad. ' : ''}${partName} plays the whole chord row this way, and so do the pads.`
                    : `Select a part in the sequencer to change its sound.`}
            </p>
        </section>

        <Effects />
    </aside>
);

export default SoundPanel;
