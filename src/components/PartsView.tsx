import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './PartsView.css';
import './FxMatrix.css';
import Knob from './Knob';
import { MenuAnchor, PopMenu } from './PopMenu';
import FxMatrix, { FX_HINTS, FX_LABELS, SpaceControls, fxText } from './FxMatrix';
import { ArpPattern, StrumDirection } from '../theory';
import { STRUM_PATTERNS, STRUM_SPREAD_LABELS, StrumPattern } from '../strum';
import { ArpRate } from '../audio/engine';
import { INSTRUMENTS, InstrumentId } from '../audio/instruments';
import {
    BASS_STYLES, BassPart, BassStyle, FX_KEYS, Harmony, InstrumentPart, MAX_PARTS, PART_LABELS, Part, PartFx, PartKind, PartTone, PlayMode,
    RANGE_OCTAVE, vowelGlideSeconds, STRUM_DIRECTIONS, STRUM_SPREADS, TONE_KEYS, VOWELS, VoicePart, bassNotes, fxAvailable, hasInstrument, shapePan,
} from '../parts';
import { PPQ } from '../progression';
import { ShapeView, Space } from '../song';
import {
    DRIVE_TYPES, DriveType, FILTER_TYPES, FilterType, KNOBS, LFO_RATES, LfoRate, PartShape, ShapeKnob, ShapeOverrides, defaultShape, effectiveShape, fromKnob, shapeText, toKnob,
} from '../sound';
import ShapeGraphs, { EnvelopeGraph, FilterGraph } from './ShapeGraphs';
import Scope, { WaveSource } from './Scope';
import { useMorph } from '../motion';

// ---- shared bits: instrument icons, chord style ------------------------------------------------

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

/** Arp note lengths offered (seconds). A saved length that isn't one of these is kept and listed too. */
const NOTE_LENGTHS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2];

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
    voice: 'M1 6 C3 2 5 2 7 6 S11 10 13 6 S17 2 19 6 S23 10 25 6',
};

export const instrumentLabel = (id: InstrumentId) => (id === 'voice' ? 'the voice' : INSTRUMENTS.find(i => i.id === id)?.label ?? id);

/** How a chord part plays the chords: held, strummed, or arpeggiated. */
export interface ChordStyle {
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    noteLength: number;
    strumSpread: number;
    strumDirection: StrumDirection;
    strumPattern: StrumPattern;
}

const STRUM_LABELS: { [d in StrumDirection]: string } = { down: 'Down ↓', up: 'Up ↑', alternate: 'Alt ↕' };
const STRUM_HINTS: { [d in StrumDirection]: string } = {
    down: 'low note first, like a downstroke',
    up: 'high note first, like an upstroke',
    alternate: 'down, then up, then down… every chord hit',
};
const ms = (s: number) => `${Math.round(s * 1000)} ms`;

/** A strum pattern's strokes as a row of 8 cells: ↓ down, ↑ up, a dot for a rest; beats are marked. */
const StrumPreview: React.FC<{ strokes: string }> = ({ strokes }) => (
    <span className="strum-preview" aria-hidden="true">
        {strokes.split('').map((c, i) => (
            <span key={i} className={`sp-cell ${i % 2 === 0 ? 'beat' : ''} ${c === '-' ? 'rest' : ''}`}>{c === 'D' ? '↓' : c === 'U' ? '↑' : '·'}</span>
        ))}
    </span>
);

const KIND_TAG: { [k in PartKind]: string } = { chords: 'Chords', bass: 'Bass', melody: 'Melody', voice: 'Voice', drums: 'Drums' };
const KIND_HINT: { [k in PartKind]: string } = {
    chords: 'plays the chords',
    bass: 'follows the roots',
    melody: 'your notes',
    voice: 'singers: a solo or a choir',
    drums: 'loops a beat',
};

// ---- tone knobs ---------------------------------------------------------------------------------

const TONE_LABELS: { [k in keyof PartTone]: string } = { pan: 'Pan' };
const TONE_HINTS: { [k in keyof PartTone]: string } = { pan: 'left to right' };

/** What a tone knob reads as. */
export function toneText(_k: keyof PartTone, v: number): string {
    const p = shapePan(v);
    return Math.abs(p) < 0.02 ? 'centre' : `${Math.round(Math.abs(p) * 100)}% ${p < 0 ? 'L' : 'R'}`;
}

// ---- shape knobs (Simple): standard synth names, each audible across its whole range -------------

const SIMPLE_KNOBS: ShapeKnob[] = ['attack', 'release', 'cutoff', 'resonance', 'envAmount', 'drive'];
const SHAPE_HINTS: { [k in ShapeKnob]: string } = {
    attack: 'Attack: how fast a note comes in. Short = a click or pluck, long = a slow swell',
    decay: 'Decay: how fast it falls from its peak to the Sustain level',
    sustain: 'Sustain: the level a held note settles at',
    release: 'Release: how long a note rings after you let go',
    cutoff: 'Cutoff: where the filter starts cutting the highs. Lower = darker, muffled',
    resonance: 'Resonance: a boost right at the cutoff. Higher = sharper, squelchier, whistling',
    envAmount: 'Env Amount: each note opens (right) or closes (left) the filter, then it settles. Needs the Cutoff turned down to hear',
    lfoDepth: 'LFO Depth: how far the LFO sweeps the cutoff up and down',
    drive: 'Drive: pushes the sound until it saturates. Warm, Crunch or Bitcrush',
};

/** A knob with its label and value under it, in a small tile. */
const KnobCell: React.FC<{
    label: string;
    aria: string;
    value: number;
    display: string;
    color: string;
    on: boolean;
    title?: string;
    resetTo?: number;
    offAtZero?: boolean;
    bipolar?: boolean;
    onChange: (v: number) => void;
    onPointerDown?: () => void;
}> = ({ label, aria, value, display, color, on, title, resetTo, offAtZero, bipolar, onChange, onPointerDown }) => (
    <div className={`knob-tile ${on ? 'on' : ''}`} title={title} style={{ '--track': color } as React.CSSProperties} onPointerDownCapture={onPointerDown}>
        <Knob value={value} onChange={onChange} color={color} label={aria} display={display} size={36} resetTo={resetTo} offAtZero={offAtZero} bipolar={bipolar} />
        <span className="knob-label">{label}</span>
        <span className="knob-value">{display}</span>
    </div>
);

// ---- bass style previews ------------------------------------------------------------------------

// Preview material for the style buttons: a bar of C then a bar of F, with a four-on-the-floor kick
// plus one push, so every style (walk, 3-3-2, follow kick...) shows its shape.
const DEMO: Harmony = {
    key: 'C',
    scale: 'major',
    chords: [
        { start: 0, len: 4 * PPQ, chord: { degree: 0, type: 'triad', inversion: 0, octave: 4 } },
        { start: 4 * PPQ, len: 4 * PPQ, chord: { degree: 3, type: 'triad', inversion: 0, octave: 4 } },
    ],
};
const DEMO_KICKS = [0, 1, 2, 2.75, 3, 4, 5, 6, 6.75, 7].map(b => b * PPQ);
const DEMO_LEN = 8 * PPQ;

/** A tiny piano roll of what a bass style plays over the demo bars. */
const StylePreview: React.FC<{ style: BassStyle }> = ({ style }) => {
    const notes = useMemo(
        () => bassNotes({ kind: 'bass', style, octave: 2 } as BassPart, DEMO, { beatTicks: PPQ, kicks: DEMO_KICKS }),
        [style],
    );
    const pitches = notes.map(n => n.midi[0]);
    const lo = Math.min(...pitches);
    const span = Math.max(12, Math.max(...pitches) - lo);
    return (
        <svg className="style-preview" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
            <line x1="50" y1="0" x2="50" y2="28" className="style-bar" />
            {notes.map((n, i) => (
                <rect
                    key={i}
                    x={(n.start / DEMO_LEN) * 100 + 0.4}
                    width={Math.max(1.2, (n.len / DEMO_LEN) * 100 - 0.8)}
                    y={23 - ((n.midi[0] - lo) / span) * 19}
                    height="3.2"
                    rx="1.2"
                />
            ))}
        </svg>
    );
};

// ---- the part list (also the mixer) -------------------------------------------------------------

const VOL_MIN = -24;
const VOL_MAX = 6;
const dB = (v: number) => `${v > 0 ? '+' : ''}${v} dB`;

/** A part's volume as a thin bar in its colour: drag along it, arrow keys, double-tap for 0 dB. */
const VolumeBar: React.FC<{ value: number; color: string; name: string; onChange: (v: number) => void }> = ({ value, color, name, onChange }) => {
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

/**
 * "+ Part": a short menu of part kinds. A PopMenu, so it stays in the window (inside the parts list
 * it was cut off on a phone).
 */
const AddPartMenu: React.FC<{ full: boolean; onAdd: (kind: PartKind) => void }> = ({ full, onAdd }) => {
    const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
    return (
        <div className="add-part">
            <button
                className="chip-button small-chip"
                aria-haspopup="menu"
                aria-expanded={!!anchor}
                disabled={full}
                title={full ? `Up to ${MAX_PARTS} parts` : 'Add a part'}
                // while open, a press here only closes it (the menu's outside-press would close it and the click reopen it)
                onPointerDown={e => anchor && e.stopPropagation()}
                onClick={e => setAnchor(anchor ? null : { rect: e.currentTarget.getBoundingClientRect() })}
            >
                + Part
            </button>
            {anchor && (
                <PopMenu
                    anchor={anchor}
                    label="Add a part"
                    onClose={() => setAnchor(null)}
                    items={(['chords', 'bass', 'melody', 'voice', 'drums'] as PartKind[]).map(k => ({ label: PART_LABELS[k], note: KIND_HINT[k], onSelect: () => onAdd(k) }))}
                />
            )}
        </div>
    );
};

export const MASTER = 'master';

// ---- the selected part --------------------------------------------------------------------------

/** Effect amounts a newly added effect starts at. */
const FX_START: { [k in keyof PartFx]: number } = { chorus: 0.35, tremolo: 0.4, glide: 0.3, reverb: 0.3, delay: 0.25 };
/** Effects shown under EFFECTS (glide sits with the tone: it's how notes connect). */
const EFFECT_KEYS = FX_KEYS.filter(k => k !== 'glide');

/**
 * "+ Effect": the effects that are off, to turn one on. A PopMenu, so it stays in the window: on a
 * landscape phone the button sits low on the screen and the list opens above it.
 */
const AddEffectMenu: React.FC<{ off: (keyof PartFx)[]; onAdd: (k: keyof PartFx) => void }> = ({ off, onAdd }) => {
    const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
    if (off.length === 0) return null;
    return (
        <div className="add-effect">
            <button
                className="knob-tile add-tile"
                aria-haspopup="menu"
                aria-expanded={!!anchor}
                // while open, a press here only closes it (the menu's outside-press would close it and the click reopen it)
                onPointerDown={e => anchor && e.stopPropagation()}
                onClick={e => setAnchor(anchor ? null : { rect: e.currentTarget.getBoundingClientRect() })}
            >
                <span className="add-plus" aria-hidden="true">+</span>
                <span className="knob-label">Effect</span>
            </button>
            {anchor && (
                <PopMenu
                    anchor={anchor}
                    label="Add an effect"
                    onClose={() => setAnchor(null)}
                    items={off.map(k => ({ label: FX_LABELS[k], note: FX_HINTS[k], onSelect: () => onAdd(k) }))}
                />
            )}
        </div>
    );
};

/** Keep the selected tile of a horizontally scrolling row in view when the part changes. */
function useScrollToPressed(dep: unknown) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const row = ref.current;
        const on = row?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]');
        if (!row || !on) return;
        const left = on.offsetLeft - row.offsetLeft;
        if (left < row.scrollLeft || left + on.offsetWidth > row.scrollLeft + row.clientWidth) {
            row.scrollLeft = Math.max(0, left - (row.clientWidth - on.offsetWidth) / 2);
        }
    }, [dep]);
    return ref;
}

/** The Voice part's singers: who sings, how high, what (their own notes or the chords), the vowel, vibrato and breath. */
const VoiceBlock: React.FC<{ part: VoicePart; onUpdate: (patch: Partial<VoicePart>) => void }> = ({ part, onUpdate }) => {
    const vowel = VOWELS.find(v => v.id === part.vowel);
    return (
        <div className="pd-block voice-block">
            <span className="pd-label">Singers</span>
            <div className="pd-style voice-row">
                <div className="segmented small-seg" role="group" aria-label="Singers">
                    <button aria-pressed={part.singers === 'solo'} onClick={() => onUpdate({ singers: 'solo' })}>Solo</button>
                    <button aria-pressed={part.singers === 'choir'} onClick={() => onUpdate({ singers: 'choir' })}>Choir</button>
                </div>
                <div className="segmented small-seg" role="group" aria-label="Voice range">
                    <button aria-pressed={part.range === 'low'} title="men's voices" onClick={() => onUpdate({ range: 'low', octave: RANGE_OCTAVE.low })}>Low</button>
                    <button aria-pressed={part.range === 'high'} title="women's voices" onClick={() => onUpdate({ range: 'high', octave: RANGE_OCTAVE.high })}>High</button>
                </div>
                <span className="section-note voice-tag">sings</span>
                <div className="segmented small-seg" role="group" aria-label="Sings">
                    <button aria-pressed={part.sings === 'chords'} title="the chord row, like a chord part" onClick={() => onUpdate({ sings: 'chords' })}>Chords</button>
                    <button aria-pressed={part.sings === 'notes'} title="its own notes: play them on the keys in Notes mode, or write them in Song" onClick={() => onUpdate({ sings: 'notes' })}>Notes</button>
                </div>
                <div className="segmented small-seg" role="group" aria-label="Octave">
                    {[2, 3, 4, 5].map(o => (
                        <button key={o} aria-pressed={part.octave === o} onClick={() => onUpdate({ octave: o })}>C{o}</button>
                    ))}
                </div>
            </div>
            <span className="pd-label">Vowel</span>
            <div className="pd-style voice-row">
                <div className="segmented small-seg vowel-seg" role="group" aria-label="Vowel">
                    {VOWELS.map(v => (
                        <button key={v.id} aria-pressed={part.vowel === v.id} title={v.hint} onClick={() => onUpdate({ vowel: v.id })}>{v.label}</button>
                    ))}
                </div>
                <span className="section-note">{vowel?.hint}</span>
            </div>
            <div className="knob-row voice-knobs">
                <KnobCell
                    label="Vibrato"
                    aria={`${part.name} Vibrato`}
                    title="how much the pitch wavers, as singers do on a held note"
                    value={part.vibrato}
                    display={`${Math.round(part.vibrato * 100)}%`}
                    color={part.color}
                    on={part.vibrato > 0}
                    resetTo={0.35}
                    onChange={v => onUpdate({ vibrato: v })}
                />
                <KnobCell
                    label="Breath"
                    aria={`${part.name} Breath`}
                    title="air in the voice: from clear to whispery"
                    value={part.breath}
                    display={`${Math.round(part.breath * 100)}%`}
                    color={part.color}
                    on={part.breath > 0}
                    resetTo={0.15}
                    onChange={v => onUpdate({ breath: v })}
                />
                <KnobCell
                    label="Vowel glide"
                    aria={`${part.name} Vowel glide`}
                    title="how quickly the singers move to the next vowel in the vowel lane (in Song): from a snap to a slow morph"
                    value={part.vowelGlide}
                    display={`${Math.round(vowelGlideSeconds(part.vowelGlide) * 1000)} ms`}
                    color={part.color}
                    on
                    resetTo={0.3}
                    onChange={v => onUpdate({ vowelGlide: v })}
                />
            </div>
            <p className="section-note pd-hint">
                {part.sings === 'notes'
                    ? 'Sings its own notes: switch the pads to Notes to sing them live, or write them in Song.'
                    : 'Sings every chord in the chord row.'}
            </p>
        </div>
    );
};

interface PartDetailProps {
    part: Part;
    isPadPart: boolean;
    canRemove: boolean;
    onPadPart: () => void;
    onRemove: () => void;
    onUpdate: (patch: Partial<Part>) => void;
    onTone: (key: keyof PartTone, value: number) => void;
    onShape: (patch: ShapeOverrides, key: string) => void;
    onShapeReset: () => void;
    shapeView: ShapeView;
    onShapeView: (v: ShapeView) => void;
    scope: () => WaveSource | null;
    onFx: (key: keyof PartFx, value: number) => void;
    /** Drums: jump to Song with this part's beat open. */
    onOpenBeat: () => void;
}

const PartDetail: React.FC<PartDetailProps> = ({ part, isPadPart, canRemove, onPadPart, onRemove, onUpdate, onTone, onShape, onShapeReset, shapeView, onShapeView, scope, onFx, onOpenBeat }) => {
    // Effects stay on screen while you turn them (even down to 0) and after "+ Effect"; double-tap (0) takes one away
    const [pinned, setPinned] = useState<(keyof PartFx)[]>([]);
    useEffect(() => {
        setPinned([]);
    }, [part.id]);
    const instRow = useScrollToPressed(`${part.id}:${hasInstrument(part) ? part.instrument : ''}`);
    const styleRow = useScrollToPressed(`${part.id}:${part.kind === 'bass' ? part.style : ''}`);

    const effects = EFFECT_KEYS.filter(k => fxAvailable(part.kind, k));
    const shown = effects.filter(k => part.fx[k] > 0 || pinned.includes(k));
    const off = effects.filter(k => !shown.includes(k));
    const setFx = (k: keyof PartFx, v: number) => {
        // a jump to 0 (double-tap, Delete) takes the effect off the screen; a drag down to 0 leaves it there
        if (v <= 0 && part.fx[k] > 0.05) setPinned(ps => ps.filter(x => x !== k));
        onFx(k, v);
    };

    return (
        <section className="part-detail panel" aria-label={`${part.name}: sound`} style={{ '--track': part.color } as React.CSSProperties}>
            <div className="pd-head">
                <span className="pd-dot" aria-hidden="true" />
                <h2 className="pd-name">{part.name}</h2>
                <span className="pd-kind">{KIND_TAG[part.kind]}</span>
                <span className="pd-space" />
                {part.kind === 'chords' && (
                    <button
                        className="chip-button pd-pads"
                        aria-pressed={isPadPart}
                        title={isPadPart ? 'The pads play through this part' : 'Make the pads play through this part'}
                        onClick={onPadPart}
                    >
                        Pads play this part
                    </button>
                )}
                {canRemove && (
                    <button className="pd-remove" aria-label={`Remove ${part.name}`} title="Remove part (undoable)" onClick={onRemove}>×</button>
                )}
            </div>

            {part.kind === 'voice' ? (
                <VoiceBlock part={part} onUpdate={patch => onUpdate(patch as Partial<Part>)} />
            ) : hasInstrument(part) ? (
                <div className="pd-block">
                    <span className="pd-label" id={`inst-${part.id}`}>Instrument</span>
                    <div className="inst-row" role="group" aria-labelledby={`inst-${part.id}`} ref={instRow}>
                        {INSTRUMENTS.map(({ id, label }) => (
                            <button key={id} className="inst-tile" aria-pressed={part.instrument === id} onClick={() => onUpdate({ instrument: id } as Partial<Part>)}>
                                <svg width="26" height="12" viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={WAVES[id]} /></svg>
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="pd-block">
                    <span className="pd-label">Kit</span>
                    <div className="kit-row">
                        <span className="kit-tile">808 / 909 synth kit</span>
                        <span className="section-note">The beat is written in Song.</span>
                        <button className="chip-button small-chip" onClick={onOpenBeat}>Open the beat</button>
                    </div>
                </div>
            )}

            {part.kind === 'chords' && <ChordStyleRow style={part} onChange={patch => onUpdate(patch as Partial<Part>)} />}

            {part.kind === 'bass' && (
                <div className="pd-block">
                    <span className="pd-label">Style</span>
                    <div className="pd-style">
                        <div className="bass-row" role="radiogroup" aria-label="Bass style" ref={styleRow}>
                            {BASS_STYLES.map(s => (
                                <button key={s.id} role="radio" aria-checked={part.style === s.id} className="bass-tile" title={s.hint} onClick={() => onUpdate({ style: s.id } as Partial<Part>)}>
                                    <StylePreview style={s.id} />
                                    <span>{s.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="segmented small-seg" role="group" aria-label="Bass octave">
                            {[1, 2, 3].map(o => (
                                <button key={o} aria-pressed={part.octave === o} onClick={() => onUpdate({ octave: o } as Partial<Part>)}>C{o}</button>
                            ))}
                        </div>
                    </div>
                    <p className="section-note pd-hint">{BASS_STYLES.find(s => s.id === part.style)?.label}: {BASS_STYLES.find(s => s.id === part.style)?.hint}.</p>
                </div>
            )}

            {part.kind === 'melody' && (
                <div className="pd-block">
                    <span className="pd-label">Range</span>
                    <div className="pd-style">
                        <div className="segmented small-seg" role="group" aria-label="Melody octave">
                            {[3, 4, 5].map(o => (
                                <button key={o} aria-pressed={part.octave === o} onClick={() => onUpdate({ octave: o } as Partial<Part>)}>C{o}</button>
                            ))}
                        </div>
                        <span className="section-note">two octaves of the key from C{part.octave} up · the notes are written in Song</span>
                    </div>
                </div>
            )}

            {hasInstrument(part) && (
                <ShapeBlock part={part} view={shapeView} onView={onShapeView} onShape={onShape} onReset={onShapeReset} scope={scope} />
            )}

            <div className="pd-knobs">
                {hasInstrument(part) && (
                    <div className="knob-group" role="group" aria-label={`${part.name} tone`}>
                        <span className="pd-label">Tone</span>
                        <div className="knob-row">
                            {TONE_KEYS.map(k => (
                                <KnobCell
                                    key={k}
                                    label={TONE_LABELS[k]}
                                    aria={`${part.name} ${TONE_LABELS[k]}`}
                                    title={TONE_HINTS[k]}
                                    value={part.tone[k]}
                                    display={toneText(k, part.tone[k])}
                                    color={part.color}
                                    on={Math.abs(part.tone[k] - 0.5) > 0.01}
                                    resetTo={0.5}
                                    onChange={v => onTone(k, v)}
                                />
                            ))}
                            <KnobCell
                                label="Glide"
                                aria={`${part.name} Glide`}
                                title={FX_HINTS.glide}
                                value={part.fx.glide}
                                display={fxText('glide', part.fx.glide)}
                                color={part.color}
                                on={part.fx.glide > 0}
                                offAtZero
                                onChange={v => onFx('glide', v)}
                            />
                        </div>
                    </div>
                )}
                <div className="knob-group" role="group" aria-label={`${part.name} effects`}>
                    <span className="pd-label">Effects{part.kind === 'drums' ? ' · sends' : ''}</span>
                    <div className="knob-row">
                        {shown.map(k => (
                            <KnobCell
                                key={k}
                                label={FX_LABELS[k]}
                                aria={`${part.name} ${FX_LABELS[k].replace('→ ', '')}`}
                                title={`${FX_HINTS[k]} · double-tap to remove`}
                                value={part.fx[k]}
                                display={fxText(k, part.fx[k])}
                                color={part.color}
                                on={part.fx[k] > 0}
                                offAtZero
                                onPointerDown={() => setPinned(ps => (ps.includes(k) ? ps : [...ps, k]))}
                                onChange={v => setFx(k, v)}
                            />
                        ))}
                        <AddEffectMenu
                            off={off}
                            onAdd={k => {
                                setPinned(ps => [...ps, k]);
                                onFx(k, FX_START[k]);
                            }}
                        />
                        {shown.length === 0 && off.length === 0 && <span className="section-note">—</span>}
                    </div>
                </div>
            </div>
        </section>
    );
};

const FILTER_LABELS: { [t in FilterType]: [string, string] } = {
    lowpass: ['Low-pass', 'lets the lows through: turning Cutoff down makes it darker'],
    highpass: ['High-pass', 'lets the highs through: turning Cutoff up makes it thinner'],
    bandpass: ['Band-pass', 'only a band around the cutoff: nasal, like a radio or a telephone'],
};
const DRIVE_LABELS: { [t in DriveType]: [string, string] } = {
    warm: ['Warm', 'soft saturation: rounder, fuller, like tape or a tube'],
    crunch: ['Crunch', 'hard distortion: buzzy and aggressive'],
    bitcrush: ['Bitcrush', 'fewer bits: grainy, stepped lo-fi, like old samplers'],
};
const LFO_LABELS: { [r in LfoRate]: string } = { '1n': '1/1', '2n': '1/2', '4n': '1/4', '8n': '1/8', '16n': '1/16', '8t': '1/8T' };

interface ShapeBlockProps {
    part: InstrumentPart;
    view: ShapeView;
    onView: (v: ShapeView) => void;
    onShape: (patch: ShapeOverrides, key: string) => void;
    onReset: () => void;
    scope: () => WaveSource | null;
}

/**
 * Shape: Simple shows the envelope and filter read-only over six knobs; Advanced makes the graphs
 * draggable and adds Decay, Sustain, the filter type, the LFO and the drive type, plus a live scope.
 * Both edit the same shape. Reset goes back to the instrument's own sound; a knob's double-tap puts
 * just that one back.
 */
/** Two shapes mixed `t` of the way, knob by knob (in knob travel, so a log knob swings evenly); switches flip at once. */
function lerpShape(a: PartShape, b: PartShape, t: number): PartShape {
    const out = { ...b };
    for (const k of Object.keys(KNOBS) as ShapeKnob[]) {
        out[k] = fromKnob(k, toKnob(k, a[k] as number) + (toKnob(k, b[k] as number) - toKnob(k, a[k] as number)) * t);
    }
    return out;
}

const ShapeBlock: React.FC<ShapeBlockProps> = ({ part, view, onView, onShape, onReset: reset, scope }) => {
    const own = defaultShape(part.instrument);
    const target = useMemo(() => effectiveShape(part.instrument, part.shape), [part.instrument, part.shape]);
    // Reset swings the knobs and graphs back to the instrument's own sound; everything else follows at once
    const [shape, armMorph] = useMorph(target, lerpShape);
    const onReset = () => {
        armMorph();
        reset();
    };
    const changed = Object.keys(part.shape).length > 0;
    const knob = (k: ShapeKnob) => (
        <KnobCell
            key={k}
            label={KNOBS[k].label}
            aria={`${part.name} ${KNOBS[k].label}`}
            title={`${SHAPE_HINTS[k]} · double-tap: back to ${instrumentLabel(part.instrument)}'s own`}
            value={toKnob(k, shape[k] as number)}
            display={shapeText(k, shape[k] as number)}
            color={part.color}
            on={part.shape[k] !== undefined && Math.abs(toKnob(k, part.shape[k] as number) - toKnob(k, own[k] as number)) > 0.005}
            resetTo={toKnob(k, own[k] as number)}
            bipolar={k === 'envAmount'}
            onChange={v => onShape({ [k]: fromKnob(k, v) }, k)}
        />
    );
    return (
        <div className="pd-block shape-block" role="group" aria-label={`${part.name} shape`}>
            <div className="shape-head">
                <span className="pd-label">Shape</span>
                <span className="section-note shape-note">how each note rises, falls and is filtered</span>
                <span className="shape-space" />
                <div className="segmented small-seg" role="group" aria-label="Shape view">
                    <button aria-pressed={view === 'simple'} title="six knobs" onClick={() => onView('simple')}>Simple</button>
                    <button aria-pressed={view === 'advanced'} title="every control, draggable graphs and a scope" onClick={() => onView('advanced')}>Advanced</button>
                </div>
                <button className="chip-button shape-reset" disabled={!changed} title={`Back to ${instrumentLabel(part.instrument)} as designed`} onClick={onReset}>Reset</button>
            </div>
            {view === 'simple' ? (
                <>
                    <ShapeGraphs shape={shape} color={part.color} />
                    <div className="knob-row shape-knobs">{SIMPLE_KNOBS.map(knob)}</div>
                </>
            ) : (
                <>
                    <div className="shape-graphs advanced">
                        <EnvelopeGraph shape={shape} color={part.color} height={64} onChange={onShape} />
                        <FilterGraph shape={shape} color={part.color} height={64} onChange={onShape} />
                    </div>
                    <div className="shape-sections">
                        <div className="shape-section" role="group" aria-label="Envelope">
                            <span className="shape-sub">Envelope</span>
                            <div className="knob-row shape-knobs">{(['attack', 'decay', 'sustain', 'release'] as ShapeKnob[]).map(knob)}</div>
                        </div>
                        <div className="shape-section" role="group" aria-label="Filter">
                            <span className="shape-sub">Filter</span>
                            <div className="segmented small-seg" role="group" aria-label="Filter type">
                                {FILTER_TYPES.map(t => (
                                    <button key={t} aria-pressed={shape.filterType === t} title={FILTER_LABELS[t][1]} onClick={() => onShape({ filterType: t }, 'filterType')}>{FILTER_LABELS[t][0]}</button>
                                ))}
                            </div>
                            <div className="knob-row shape-knobs">{(['cutoff', 'resonance', 'envAmount'] as ShapeKnob[]).map(knob)}</div>
                        </div>
                        <div className="shape-section" role="group" aria-label="LFO">
                            <span className="shape-sub" title="LFO: a slow wave that sweeps the cutoff up and down, in time with the song">LFO</span>
                            <div className="segmented small-seg" role="group" aria-label="LFO rate">
                                {LFO_RATES.map(r => (
                                    <button key={r} aria-pressed={shape.lfoRate === r} title={`LFO Rate: one sweep per ${LFO_LABELS[r]} note`} onClick={() => onShape({ lfoRate: r }, 'lfoRate')}>{LFO_LABELS[r]}</button>
                                ))}
                            </div>
                            <div className="knob-row shape-knobs">{knob('lfoDepth')}</div>
                        </div>
                        <div className="shape-section" role="group" aria-label="Drive">
                            <span className="shape-sub">Drive</span>
                            <div className="segmented small-seg" role="group" aria-label="Drive type">
                                {DRIVE_TYPES.map(t => (
                                    <button key={t} aria-pressed={shape.driveType === t} title={DRIVE_LABELS[t][1]} onClick={() => onShape({ driveType: t }, 'driveType')}>{DRIVE_LABELS[t][0]}</button>
                                ))}
                            </div>
                            <div className="knob-row shape-knobs">{knob('drive')}</div>
                        </div>
                    </div>
                    <Scope source={scope} color={part.color} label={part.name} />
                </>
            )}
        </div>
    );
};

/** Play as Chord / Strum / Arp, and that mode's options inline. */
const ChordStyleRow: React.FC<{ style: ChordStyle; onChange: (patch: Partial<ChordStyle>) => void }> = ({ style, onChange }) => {
    const lengths = NOTE_LENGTHS.includes(style.noteLength) ? NOTE_LENGTHS : [...NOTE_LENGTHS, style.noteLength].sort((a, b) => a - b);
    return (
        <div className="pd-block">
            <span className="pd-label">Play as</span>
            <div className="pd-style">
                <div className="segmented small-seg" role="group" aria-label="Play as">
                    {(['Chord', 'Strum', 'Arp'] as PlayMode[]).map(m => (
                        <button key={m} aria-pressed={style.playMode === m} onClick={() => onChange({ playMode: m })}>{m}</button>
                    ))}
                </div>
                {style.playMode === 'Chord' && <span className="section-note">chords ring for as long as they're held</span>}
                {style.playMode === 'Strum' && (
                    <>
                        <div className="bass-row strum-row" role="radiogroup" aria-label="Strum pattern">
                            {STRUM_PATTERNS.map(p => (
                                <button key={p.id} role="radio" aria-checked={style.strumPattern === p.id} className="bass-tile strum-tile" title={p.hint} onClick={() => onChange({ strumPattern: p.id })}>
                                    <StrumPreview strokes={p.strokes} />
                                    <span>{p.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="segmented small-seg" role="group" aria-label="Strum speed">
                            {STRUM_SPREADS.map((sp, i) => (
                                <button key={sp} aria-pressed={Math.abs(style.strumSpread - sp) < 0.001} title={`${ms(sp)} from the low note to the high one`} onClick={() => onChange({ strumSpread: sp })}>{STRUM_SPREAD_LABELS[i]}</button>
                            ))}
                        </div>
                        <div className="segmented small-seg" role="group" aria-label={style.strumPattern === 'once' ? 'Strum direction' : 'Strum direction on the pads'}>
                            {STRUM_DIRECTIONS.map(d => (
                                <button key={d} aria-pressed={style.strumDirection === d} title={STRUM_HINTS[d]} onClick={() => onChange({ strumDirection: d })}>{STRUM_LABELS[d]}</button>
                            ))}
                        </div>
                        <span className="section-note pd-hint">
                            {STRUM_PATTERNS.find(p => p.id === style.strumPattern)?.label}: {STRUM_PATTERNS.find(p => p.id === style.strumPattern)?.hint}.
                            {style.strumPattern === 'once' ? ' The direction sets which way it rolls.' : ' Up strokes are lighter and catch the top notes; the pads play one stroke, in the direction set here.'}
                        </span>
                    </>
                )}
                {style.playMode === 'Arp' && (
                    <>
                        <div className="segmented small-seg" role="group" aria-label="Arp pattern">
                            {ARP_PATTERNS.map(p => (
                                <button key={p.id} aria-pressed={style.arpPattern === p.id} onClick={() => onChange({ arpPattern: p.id })}>{p.label}</button>
                            ))}
                        </div>
                        <label className="pd-select">
                            <span>Rate</span>
                            <select value={style.arpRate} onChange={e => onChange({ arpRate: e.target.value as ArpRate })}>
                                {ARP_RATES.map(r => <option key={r.rate} value={r.rate}>{r.label}</option>)}
                            </select>
                        </label>
                        <label className="pd-select">
                            <span>Length</span>
                            <select value={style.noteLength} onChange={e => onChange({ noteLength: parseFloat(e.target.value) })}>
                                {lengths.map(l => <option key={l} value={l}>{l.toFixed(2)} s</option>)}
                            </select>
                        </label>
                    </>
                )}
            </div>
        </div>
    );
};

const MasterDetail: React.FC<{
    parts: Part[];
    space: Space;
    onSpace: (space: Space) => void;
    onDryAll: () => void;
    onFx: (partId: string, key: keyof PartFx, value: number) => void;
    onSelect: (id: string) => void;
}> = ({ parts, space, onSpace, onDryAll, onFx, onSelect }) => {
    const [overview, setOverview] = useState(false);
    const anyWet = parts.some(p => FX_KEYS.some(k => p.fx[k] > 0));
    return (
        <section className="part-detail panel master-detail" aria-label="Master: shared reverb, delay and output">
            <div className="pd-head">
                <span className="pd-dot master" aria-hidden="true" />
                <h2 className="pd-name">Master</h2>
                <span className="pd-kind">Shared</span>
                <span className="pd-space" />
                <button className="chip-button small-chip" aria-pressed={overview} onClick={() => setOverview(o => !o)}>Mix overview</button>
                <button className="chip-button small-chip" disabled={!anyWet} onClick={onDryAll} title="Turn every part's effects off (undoable)">All dry</button>
            </div>
            <p className="section-note">Every part can send into one reverb and one delay; their returns and the output level are set here.</p>
            <SpaceControls space={space} onSpace={onSpace} />
            {overview && (
                <div className="pd-block">
                    <span className="pd-label">Every part's effects</span>
                    <FxMatrix parts={parts} onSelectPart={onSelect} onFx={onFx} />
                </div>
            )}
        </section>
    );
};

// ---- the whole view -----------------------------------------------------------------------------

interface PartsViewProps {
    parts: Part[];
    space: Space;
    /** A part id or `MASTER`. */
    selected: string;
    onSelect: (id: string) => void;
    padPartId: string;
    onPadPart: (id: string) => void;
    onUpdate: (id: string, patch: Partial<Part>) => void;
    onTone: (id: string, key: keyof PartTone, value: number) => void;
    onShape: (id: string, patch: ShapeOverrides, key: string) => void;
    onShapeReset: (id: string) => void;
    shapeView: ShapeView;
    onShapeView: (v: ShapeView) => void;
    /** The selected part's live waveform, for the Advanced scope. */
    scope: (id: string) => WaveSource | null;
    onFx: (id: string, key: keyof PartFx, value: number) => void;
    onSpace: (space: Space) => void;
    onDryAll: () => void;
    onAdd: (kind: PartKind) => void;
    onRemove: (id: string) => void;
    canRemove: (id: string) => boolean;
    onOpenBeat: (id: string) => void;
}

/** What a part sounds like, in a word: its instrument, Solo or Choir for a voice, the kit for drums. */
export const subLabel = (p: Part) => (p.kind === 'voice' ? (p.singers === 'choir' ? 'Choir' : 'Solo') : hasInstrument(p) ? instrumentLabel((p as InstrumentPart).instrument) : '808/909');

/**
 * Parts mode: how the song sounds. On the left every part as a mixer row (volume, mute, solo) plus
 * the Master; on the right everything about the selected one: instrument, how it plays, tone, effects.
 */
const PartsView: React.FC<PartsViewProps> = p => {
    const part = p.parts.find(x => x.id === p.selected);
    const anySolo = p.parts.some(x => x.solo);
    // one function per selected part, so the scope keeps drawing across re-renders
    const scopeOf = p.scope;
    const partId = part?.id ?? '';
    const scopeFor = useCallback(() => scopeOf(partId), [scopeOf, partId]);
    return (
        <div className="parts-view">
            <aside className="parts-list panel" aria-label="Parts and mixer">
                <div className="pl-head">
                    <span className="pd-label">Parts</span>
                    <AddPartMenu full={p.parts.length >= MAX_PARTS} onAdd={p.onAdd} />
                </div>
                <div className="pl-rows">
                    {p.parts.map(x => {
                        const sel = x.id === p.selected;
                        const silenced = anySolo ? !x.solo : x.mute;
                        return (
                            <div key={x.id} className={`pl-row ${sel ? 'selected' : ''} ${silenced ? 'silenced' : ''}`} style={{ '--track': x.color } as React.CSSProperties}>
                                <div className="pl-main">
                                    <button className="pl-pick" aria-pressed={sel} aria-label={`${x.name}, ${KIND_TAG[x.kind]}, ${subLabel(x)}`} onClick={() => p.onSelect(x.id)}>
                                        <span className="track-dot" aria-hidden="true" />
                                        <span className="pl-name">{x.name}</span>
                                        <span className="pl-sub">{subLabel(x)}</span>
                                    </button>
                                    <VolumeBar value={x.volume} color={x.color} name={x.name} onChange={v => p.onUpdate(x.id, { volume: v })} />
                                </div>
                                <button className="ms-button" aria-pressed={x.mute} aria-label={`Mute ${x.name}`} title="Mute in playback" onClick={() => p.onUpdate(x.id, { mute: !x.mute })}>M</button>
                                <button className="ms-button solo" aria-pressed={x.solo} aria-label={`Solo ${x.name}`} title="Solo in playback" onClick={() => p.onUpdate(x.id, { solo: !x.solo })}>S</button>
                            </div>
                        );
                    })}
                </div>
                <button className={`pl-row pl-master ${p.selected === MASTER ? 'selected' : ''}`} aria-pressed={p.selected === MASTER} onClick={() => p.onSelect(MASTER)}>
                    <span className="pd-dot master" aria-hidden="true" />
                    <span className="pl-name">Master</span>
                    <span className="pl-sub">reverb · delay · out</span>
                </button>
            </aside>

            {part ? (
                <PartDetail
                    key={part.id}
                    part={part}
                    isPadPart={part.id === p.padPartId}
                    canRemove={p.canRemove(part.id)}
                    onPadPart={() => p.onPadPart(part.id)}
                    onRemove={() => p.onRemove(part.id)}
                    onUpdate={patch => p.onUpdate(part.id, patch)}
                    onTone={(k, v) => p.onTone(part.id, k, v)}
                    onShape={(patch, key) => p.onShape(part.id, patch, key)}
                    onShapeReset={() => p.onShapeReset(part.id)}
                    shapeView={p.shapeView}
                    onShapeView={p.onShapeView}
                    scope={scopeFor}
                    onFx={(k, v) => p.onFx(part.id, k, v)}
                    onOpenBeat={() => p.onOpenBeat(part.id)}
                />
            ) : (
                <MasterDetail parts={p.parts} space={p.space} onSpace={p.onSpace} onDryAll={p.onDryAll} onFx={p.onFx} onSelect={p.onSelect} />
            )}
        </div>
    );
};

export default PartsView;
