import React from 'react';
import './SoundPanel.css';
import { ArpPattern, StrumDirection } from '../theory';
import { ArpRate } from '../audio/engine';
import { INSTRUMENTS, InstrumentId } from '../audio/instruments';
import { PartTone, PlayMode, STRUM_DIRECTIONS, STRUM_SPREADS, TONE_KEYS, shapeBrightness, shapePan } from '../parts';
import Knob from './Knob';

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
    piano: 'M2 11 V2 M6 11 V2 M10 11 V2 M14 11 V2 M18 11 V2 M22 11 V2 M4 2 V7 M8 2 V7 M16 2 V7 M20 2 V7',
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

/** How a chord part plays the chords: held, strummed, or arpeggiated. */
export interface ChordStyle {
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    noteLength: number;
    strumSpread: number;
    strumDirection: StrumDirection;
}

const STRUM_LABELS: { [d in StrumDirection]: string } = { down: 'Down ↓', up: 'Up ↑', alternate: 'Alternate ↕' };
const STRUM_HINTS: { [d in StrumDirection]: string } = {
    down: 'low note first, like a downstroke',
    up: 'high note first, like an upstroke',
    alternate: 'down, then up, then down… every chord hit',
};
const ms = (s: number) => `${Math.round(s * 1000)} ms`;

/** Play as Chord / Strum / Arp, and the strum's or arpeggiator's settings. Used in the Sound panel and the chord part editor. */
export const ChordStyleControls: React.FC<{ style: ChordStyle; onChange: (patch: Partial<ChordStyle>) => void }> = ({ style, onChange }) => {
    const rateIndex = Math.max(0, ARP_RATES.findIndex(r => r.rate === style.arpRate));
    return (
        <>
            <div className="sound-row">
                <span>Play as</span>
                <div className="segmented" role="group" aria-label="Play as">
                    {(['Chord', 'Strum', 'Arp'] as PlayMode[]).map(m => (
                        <button key={m} aria-pressed={style.playMode === m} onClick={() => onChange({ playMode: m })}>{m}</button>
                    ))}
                </div>
            </div>
            {style.playMode === 'Strum' && (
                <div className="arp-box">
                    <span className="arp-title">Strum</span>
                    <div className="sound-row">
                        <span>Spread</span>
                        <div className="segmented" role="group" aria-label="Strum spread">
                            {STRUM_SPREADS.map(sp => (
                                <button key={sp} aria-pressed={Math.abs(style.strumSpread - sp) < 0.001} onClick={() => onChange({ strumSpread: sp })}>{ms(sp)}</button>
                            ))}
                        </div>
                    </div>
                    <div className="arp-patterns strum-dirs" role="group" aria-label="Strum direction">
                        {STRUM_DIRECTIONS.map(d => (
                            <button key={d} aria-pressed={style.strumDirection === d} title={STRUM_HINTS[d]} onClick={() => onChange({ strumDirection: d })}>{STRUM_LABELS[d]}</button>
                        ))}
                    </div>
                </div>
            )}
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

const TONE_LABELS: { [k in keyof PartTone]: string } = { attack: 'Attack', release: 'Release', brightness: 'Bright', pan: 'Pan' };
const TONE_HINTS: { [k in keyof PartTone]: string } = {
    attack: 'how fast notes come in: left snappy, right a slow swell',
    release: 'how long notes ring after you let go',
    brightness: 'left darker, right brighter',
    pan: 'left to right',
};

/** What a tone knob reads as. The middle is always the instrument as designed. */
function toneText(k: keyof PartTone, v: number): string {
    const off = Math.round((v - 0.5) * 200);
    if (k === 'pan') {
        const p = shapePan(v);
        return Math.abs(p) < 0.02 ? 'centre' : `${Math.round(Math.abs(p) * 100)}% ${p < 0 ? 'L' : 'R'}`;
    }
    if (Math.abs(off) < 2) return 'as is';
    if (k === 'brightness') {
        const { cutoff, shelfDb } = shapeBrightness(v);
        return shelfDb > 0 ? `+${shelfDb.toFixed(1)} dB` : `${cutoff >= 1000 ? `${(cutoff / 1000).toFixed(1)}k` : Math.round(cutoff)} Hz`;
    }
    return off < 0 ? `shorter ${-off}%` : `longer ${off}%`;
}

/** Attack, release, brightness and pan for one part: knobs, 12 o'clock = the instrument as designed. */
export const ToneControls: React.FC<{ tone: PartTone; color: string; partName: string; onChange: (key: keyof PartTone, value: number) => void }> =
    ({ tone, color, partName, onChange }) => (
        <div className="tone-strip" role="group" aria-label={`${partName} tone`}>
            {TONE_KEYS.map(k => (
                <div key={k} className={`tone-cell ${Math.abs(tone[k] - 0.5) > 0.01 ? "on" : ""}`} title={TONE_HINTS[k]} style={{ "--track": color } as React.CSSProperties}>
                    <Knob value={tone[k]} onChange={v => onChange(k, v)} color={color} label={`${partName} ${TONE_LABELS[k]}`} display={toneText(k, tone[k])} size={34} resetTo={0.5} />
                    <span className="tone-label">{TONE_LABELS[k]}</span>
                    <span className="tone-value">{toneText(k, tone[k])}</span>
                </div>
            ))}
        </div>
    );

interface SoundPanelProps {
    /** The part whose sound this panel sets. */
    partName: string;
    partColor: string;
    instrument: InstrumentId;
    onInstrument: (id: InstrumentId) => void;
    tone: PartTone;
    onTone: (key: keyof PartTone, value: number) => void;
    /** For a chord part: how it plays the chords. */
    chordStyle?: ChordStyle;
    onChordStyle: (patch: Partial<ChordStyle>) => void;
}


const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }> =
    ({ label, value, min, max, step, display, onChange }) => (
        <label className="fx-slider">
            <span><span>{label}</span><span className="fx-value">{display}</span></span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
        </label>
    );

const SoundPanel: React.FC<SoundPanelProps> = ({ partName, partColor, instrument, onInstrument, tone, onTone, chordStyle, onChordStyle }) => (
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
            <div className="section-head">
                <h3 className="eyebrow">Tone</h3>
                <span className="section-note">double-tap a knob: as designed</span>
            </div>
            <ToneControls tone={tone} color={partColor} partName={partName} onChange={onTone} />
            {chordStyle && <ChordStyleControls style={chordStyle} onChange={onChordStyle} />}
            <p className="section-note">
                {chordStyle
                    ? `${chordStyle.playMode !== 'Arp' ? 'Chords ring while you hold a pad. ' : ''}${partName} plays the whole chord row this way, and so do the pads.`
                    : `Select a part in the sequencer to change its sound.`}
            </p>
        </section>

    </aside>
);

export default SoundPanel;
