import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './PartsView.css';
import './FxMatrix.css';
import Knob from './Knob';
import { MenuAnchor, PopMenu } from './PopMenu';
import FxMatrix, { FX_HINTS, FX_LABELS, SpaceControls, fxText } from './FxMatrix';
import { ArpPattern, StrumDirection } from '../theory';
import { ArpRate } from '../audio/engine';
import { INSTRUMENTS, InstrumentId } from '../audio/instruments';
import {
    BASS_STYLES, BassPart, BassStyle, FX_KEYS, Harmony, InstrumentPart, MAX_PARTS, PART_LABELS, Part, PartFx, PartKind, PartTone, PlayMode,
    STRUM_DIRECTIONS, STRUM_SPREADS, TONE_KEYS, bassNotes, fxAvailable, hasInstrument, shapeBrightness, shapePan,
} from '../parts';
import { PPQ } from '../progression';
import { Space } from '../song';

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
};

export const instrumentLabel = (id: InstrumentId) => INSTRUMENTS.find(i => i.id === id)?.label ?? id;

/** How a chord part plays the chords: held, strummed, or arpeggiated. */
export interface ChordStyle {
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    noteLength: number;
    strumSpread: number;
    strumDirection: StrumDirection;
}

const STRUM_LABELS: { [d in StrumDirection]: string } = { down: 'Down ↓', up: 'Up ↑', alternate: 'Alt ↕' };
const STRUM_HINTS: { [d in StrumDirection]: string } = {
    down: 'low note first, like a downstroke',
    up: 'high note first, like an upstroke',
    alternate: 'down, then up, then down… every chord hit',
};
const ms = (s: number) => `${Math.round(s * 1000)} ms`;

const KIND_TAG: { [k in PartKind]: string } = { chords: 'Chords', bass: 'Bass', melody: 'Melody', drums: 'Drums' };
const KIND_HINT: { [k in PartKind]: string } = {
    chords: 'plays the chords',
    bass: 'follows the roots',
    melody: 'your notes',
    drums: 'loops a beat',
};

// ---- tone knobs ---------------------------------------------------------------------------------

const TONE_LABELS: { [k in keyof PartTone]: string } = { attack: 'Attack', release: 'Release', brightness: 'Bright', pan: 'Pan' };
const TONE_HINTS: { [k in keyof PartTone]: string } = {
    attack: 'how fast notes come in: left snappy, right a slow swell',
    release: 'how long notes ring after you let go',
    brightness: 'left darker, right brighter',
    pan: 'left to right',
};

/** What a tone knob reads as. The middle is always the instrument as designed. */
export function toneText(k: keyof PartTone, v: number): string {
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
    onChange: (v: number) => void;
    onPointerDown?: () => void;
}> = ({ label, aria, value, display, color, on, title, resetTo, offAtZero, onChange, onPointerDown }) => (
    <div className={`knob-tile ${on ? 'on' : ''}`} title={title} style={{ '--track': color } as React.CSSProperties} onPointerDownCapture={onPointerDown}>
        <Knob value={value} onChange={onChange} color={color} label={aria} display={display} size={36} resetTo={resetTo} offAtZero={offAtZero} />
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

/** "+ Part": a short menu of part kinds. */
const AddPartMenu: React.FC<{ full: boolean; onAdd: (kind: PartKind) => void }> = ({ full, onAdd }) => {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);
    return (
        <div className="add-part" ref={root}>
            <button
                className="chip-button small-chip"
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={full}
                title={full ? `Up to ${MAX_PARTS} parts` : 'Add a part'}
                onClick={() => setOpen(o => !o)}
            >
                + Part
            </button>
            {open && (
                <div className="song-popover add-part-popover panel" role="menu">
                    {(['chords', 'bass', 'melody', 'drums'] as PartKind[]).map(k => (
                        <button key={k} role="menuitem" onClick={() => { setOpen(false); onAdd(k); }}>
                            {PART_LABELS[k]} <span className="add-part-hint">{KIND_HINT[k]}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export const MASTER = 'master';

// ---- the selected part --------------------------------------------------------------------------

/** Effect amounts a newly added effect starts at. */
const FX_START: { [k in keyof PartFx]: number } = { drive: 0.3, chorus: 0.35, tremolo: 0.4, glide: 0.3, reverb: 0.3, delay: 0.25 };
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

interface PartDetailProps {
    part: Part;
    isPadPart: boolean;
    canRemove: boolean;
    onPadPart: () => void;
    onRemove: () => void;
    onUpdate: (patch: Partial<Part>) => void;
    onTone: (key: keyof PartTone, value: number) => void;
    onFx: (key: keyof PartFx, value: number) => void;
    /** Drums: jump to Song with this part's beat open. */
    onOpenBeat: () => void;
}

const PartDetail: React.FC<PartDetailProps> = ({ part, isPadPart, canRemove, onPadPart, onRemove, onUpdate, onTone, onFx, onOpenBeat }) => {
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

            {hasInstrument(part) ? (
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
                        <div className="segmented small-seg" role="group" aria-label="Strum spread">
                            {STRUM_SPREADS.map(sp => (
                                <button key={sp} aria-pressed={Math.abs(style.strumSpread - sp) < 0.001} onClick={() => onChange({ strumSpread: sp })}>{ms(sp)}</button>
                            ))}
                        </div>
                        <div className="segmented small-seg" role="group" aria-label="Strum direction">
                            {STRUM_DIRECTIONS.map(d => (
                                <button key={d} aria-pressed={style.strumDirection === d} title={STRUM_HINTS[d]} onClick={() => onChange({ strumDirection: d })}>{STRUM_LABELS[d]}</button>
                            ))}
                        </div>
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
    onFx: (id: string, key: keyof PartFx, value: number) => void;
    onSpace: (space: Space) => void;
    onDryAll: () => void;
    onAdd: (kind: PartKind) => void;
    onRemove: (id: string) => void;
    canRemove: (id: string) => boolean;
    onOpenBeat: (id: string) => void;
}

const subLabel = (p: Part) => (hasInstrument(p) ? instrumentLabel((p as InstrumentPart).instrument) : '808/909');

/**
 * Parts mode: how the song sounds. On the left every part as a mixer row (volume, mute, solo) plus
 * the Master; on the right everything about the selected one: instrument, how it plays, tone, effects.
 */
const PartsView: React.FC<PartsViewProps> = p => {
    const part = p.parts.find(x => x.id === p.selected);
    const anySolo = p.parts.some(x => x.solo);
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
