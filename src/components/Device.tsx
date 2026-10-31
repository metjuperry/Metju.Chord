import React, { useEffect, useRef, useState } from 'react';
import './Device.css';
import { NOTE_NAMES, NoteTag, StickDir, STICK_LABELS } from '../theory';

export interface PadView {
    degree: number;
    numeral: string;
    /** Chord this pad plays with the stick where it is now, e.g. "Am7". */
    symbol: string;
    held: boolean;
}

/** What the chord info on the device shows: the chord (or note) played last, live. */
export interface ChordInfoView {
    /** Nothing played yet. */
    idle: boolean;
    /** Something is being held right now (otherwise the last chord stays, calmer). */
    live: boolean;
    symbol: string;
    long: string;
    /** "i", "IV"… for a chord; the scale degree ("3") for a note. */
    numeral: string;
    /** What the stick did: "7th", "Triad"; for a note "note" or "octave up". */
    typeLabel: string;
    /** Extra detail, e.g. "1st inv". */
    extra?: string;
    /** The chord's notes (or, for a note, the scale with it marked). */
    tags: NoteTag[];
    /** Chords that commonly come next. */
    next?: { numeral: string; symbol: string }[];
    /** While recording: where the next chord or note goes. */
    flag?: string;
}

/** A part the pads can play through (chord parts) or record into (melody parts in Notes mode). */
export interface PadTarget {
    id: string;
    name: string;
    color: string;
    instrument: string;
}

/** The thin strip under the chord info: octave, inversion, voice leading, and which part the pads play. */
export interface PlayStripProps {
    padMode: 'chords' | 'notes';
    octave: number;
    octaveMin: number;
    octaveMax: number;
    onOctave: (octave: number) => void;
    inversion: number;
    maxInversion: number;
    onInversion: (inversion: number) => void;
    voiceLeading: boolean;
    onVoiceLeading: (on: boolean) => void;
    /** The part the pads play through (Chords) or record into (Notes), and the others they could. */
    target: PadTarget;
    targets: PadTarget[];
    onTarget: (id: string) => void;
}

interface DeviceProps {
    info: ChordInfoView;
    /** MIDI notes sounding now, for the keyboard strip. */
    sounding: number[];
    scalePcs: number[];
    octave: number;
    pads: PadView[];
    stickDir: StickDir;
    latchedDir: StickDir;
    /** Chord each stick direction gives on the reference pad. */
    stickChords: { [d in StickDir]: string };
    /** Which pad the stick labels are for, e.g. "6 · vi". */
    stickFor: string;
    recording: boolean;
    onPadDown: (degree: number) => void;
    onPadUp: (degree: number) => void;
    onStick: (dir: StickDir) => void;
    /** The stick held by touch or mouse (null when let go). */
    onStickHold: (dir: StickDir | null) => void;
    /** Phone layout: no keyboard strip, no label row. */
    compact?: boolean;
    /** Override the small label under a stick direction (Notes mode: "8va", "♯", "♭"). */
    stickRules?: Partial<Record<StickDir, string>>;
    /** The same overrides as screen readers should hear them ("octave up", "sharp"). */
    stickAria?: Partial<Record<StickDir, string>>;
    /** What the pads play: chords, or single notes on a melody part. */
    padMode: 'chords' | 'notes';
    /** The melody part Notes mode plays, if the song has one. */
    notesPart?: string;
    onPadMode: (mode: 'chords' | 'notes') => void;
    strip: PlayStripProps;
}

/** Chords / Notes: what the pads play. Notes needs a melody part to play on. */
const ModeToggle: React.FC<{ mode: 'chords' | 'notes'; notesPart?: string; onMode: (m: 'chords' | 'notes') => void }> = ({ mode, notesPart, onMode }) => (
    <div className="segmented dark pad-mode" role="group" aria-label="Pads play">
        <button aria-pressed={mode === 'chords'} onClick={() => onMode('chords')} title="Pads play chords (N)">Chords</button>
        <button
            aria-pressed={mode === 'notes'}
            disabled={!notesPart}
            onClick={() => onMode('notes')}
            title={notesPart ? `Pads play single notes on ${notesPart} (N)` : 'Add a Melody part to play notes'}
        >
            Notes
        </button>
    </div>
);

const DIR_VECTOR: { [d in StickDir]: [number, number] } = {
    C: [0, 0], U: [0, -1], UR: [0.71, -0.71], R: [1, 0], DR: [0.71, 0.71],
    D: [0, 1], DL: [-0.71, 0.71], L: [-1, 0], UL: [-0.71, -0.71],
};
const DIR_KEYS: { [d in StickDir]: string } = { UL: 'Q', U: 'W', UR: 'E', L: 'A', C: 'S', R: 'D', DL: 'Z', D: 'X', DR: 'C' };
const RING: StickDir[] = ['U', 'UR', 'R', 'DR', 'D', 'DL', 'L', 'UL'];
/** The ring's eight wedges, in a -50..50 box: 45° each with a small gap, around the knob. */
const SEGMENTS: { [d in StickDir]?: string } = {
    U: 'M-17.76 -45.67A49 49 0 0 1 17.76 -45.67L7.61 -19.57A21 21 0 0 0 -7.61 -19.57Z',
    UR: 'M19.73 -44.85A49 49 0 0 1 44.85 -19.73L19.22 -8.46A21 21 0 0 0 8.46 -19.22Z',
    R: 'M45.67 -17.76A49 49 0 0 1 45.67 17.76L19.57 7.61A21 21 0 0 0 19.57 -7.61Z',
    DR: 'M44.85 19.73A49 49 0 0 1 19.73 44.85L8.46 19.22A21 21 0 0 0 19.22 8.46Z',
    D: 'M17.76 45.67A49 49 0 0 1 -17.76 45.67L-7.61 19.57A21 21 0 0 0 7.61 19.57Z',
    DL: 'M-19.73 44.85A49 49 0 0 1 -44.85 19.73L-19.22 8.46A21 21 0 0 0 -8.46 19.22Z',
    L: 'M-45.67 17.76A49 49 0 0 1 -45.67 -17.76L-19.57 -7.61A21 21 0 0 0 -19.57 7.61Z',
    UL: 'M-44.85 -19.73A49 49 0 0 1 -19.73 -44.85L-8.46 -19.22A21 21 0 0 0 -19.22 -8.46Z',
};
const INVERSIONS = ['Root', '1st', '2nd', '3rd'];

/**
 * The chord just played, drawn on the instrument's body in the app's own type: the name large,
 * the numeral and chord type, its notes as tags (root dark, what the stick added yellow), and the
 * chords that often come next. Playback never touches it: it follows live playing only.
 */
const ChordInfo: React.FC<{ view: ChordInfoView }> = ({ view }) => (
    <div
        className={`chord-info ${view.idle ? 'idle' : ''} ${view.live ? 'live' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={view.idle ? 'Ready: hold a pad and push the stick' : `${view.long}, ${view.numeral}${view.next?.length ? `. Often next: ${view.next.map(c => c.symbol).join(', ')}` : ''}`}
    >
        {view.idle ? (
            <span className="ci-prompt">Hold a pad · push the stick</span>
        ) : (
            <>
                <span className="ci-symbol">{view.symbol}</span>
                <span className="ci-detail" aria-hidden="true">
                    <span className="ci-type">{[view.numeral, view.typeLabel, view.extra].filter(Boolean).join(' · ')}</span>
                    <span className="ci-tags">
                        {view.tags.map((t, i) => <span key={`${t.name}${i}`} className={`ci-tag ${t.role}`}>{t.name}</span>)}
                    </span>
                </span>
            </>
        )}
        <span className="ci-space" />
        {view.flag && <span className="ci-rec">{view.flag}</span>}
        {!view.idle && view.next && view.next.length > 0 && (
            <span className="ci-next" aria-hidden="true">
                <span className="ci-next-label">Often next</span>
                {view.next.map(c => (
                    <span key={c.numeral} className="ci-next-card"><span className="ci-next-numeral">{c.numeral}</span>{c.symbol}</span>
                ))}
            </span>
        )}
    </div>
);

/** "PADS → ● Keys · Piano ▾": which part the pads play through, made explicit, with a menu of the others. */
const PadsPicker: React.FC<{ notes: boolean; target: PadTarget; targets: PadTarget[]; onPick: (id: string) => void }> = ({ notes, target, targets, onPick }) => {
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
    const label = notes ? 'Notes' : 'Pads';
    return (
        <div className="pads-picker" ref={root}>
            <button
                className="strip-button pads-target"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`${label} play ${notes ? 'into' : 'through'} ${target.name}, ${target.instrument}. Change part`}
                disabled={targets.length < 2}
                onClick={() => setOpen(o => !o)}
            >
                <span className="strip-label">{label} →</span>
                <span className="track-dot" style={{ background: target.color }} />
                <b>{target.name}</b>
                <span className="pads-inst">· {target.instrument}</span>
                {targets.length > 1 && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
                )}
            </button>
            {open && (
                <div className="song-popover pads-popover panel" role="menu" aria-label={notes ? 'Melody part the pads play' : 'Chord part the pads play'}>
                    {targets.map(t => (
                        <button key={t.id} role="menuitemradio" aria-checked={t.id === target.id} onClick={() => { setOpen(false); onPick(t.id); }}>
                            <span className="pads-option"><span className="track-dot" style={{ background: t.color }} />{t.name}</span>
                            <span className="kbd">{t.instrument}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Octave, inversion, voice leading and the pads' part: a thin strip on the device, under the chord info. */
export const PlayStrip: React.FC<PlayStripProps> = s => {
    const notes = s.padMode === 'notes';
    return (
        <div className="play-strip">
            <div className="strip-group" role="group" aria-label={notes ? 'Melody octave' : 'Octave'}>
                <span className="strip-label">Oct</span>
                <button className="strip-step" aria-label="Octave down" disabled={s.octave <= s.octaveMin} onClick={() => s.onOctave(s.octave - 1)}>−</button>
                <span className="strip-value" aria-live="polite">C{s.octave}</span>
                <button className="strip-step" aria-label="Octave up" disabled={s.octave >= s.octaveMax} onClick={() => s.onOctave(s.octave + 1)}>+</button>
            </div>
            <span className="strip-rule" aria-hidden="true" />
            <div className="strip-group" role="group" aria-label="Inversion">
                <span className="strip-label">Inv</span>
                <div className="segmented dark strip-seg">
                    {INVERSIONS.map((label, i) => (
                        <button key={label} aria-pressed={!s.voiceLeading && !notes && s.inversion === i} disabled={notes || s.voiceLeading || i > s.maxInversion} onClick={() => s.onInversion(i)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <button
                className="strip-button vl-button"
                role="switch"
                aria-checked={s.voiceLeading}
                disabled={notes}
                title="Pick each chord's inversion so it moves as little as possible from the last chord"
                onClick={() => s.onVoiceLeading(!s.voiceLeading)}
            >
                <span className="mini-switch" aria-hidden="true"><span /></span>
                Voice leading
            </button>
            <span className="strip-space" />
            <PadsPicker notes={notes} target={s.target} targets={s.targets} onPick={s.onTarget} />
        </div>
    );
};

const ScaleKeys: React.FC<{ sounding: number[]; scalePcs: number[]; octave: number }> = ({ sounding, scalePcs, octave }) => {
    const base = 12 * (octave + 1);
    const on = new Set(sounding);
    const inScale = new Set(scalePcs);
    const whites: number[] = [];
    const blacks: { midi: number; slot: number }[] = [];
    for (let oct = 0; oct < 2; oct++) {
        [0, 2, 4, 5, 7, 9, 11].forEach(pc => whites.push(base + oct * 12 + pc));
        [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]].forEach(([pc, w]) => blacks.push({ midi: base + oct * 12 + pc, slot: oct * 7 + w }));
    }
    const cls = (m: number) => (on.has(m) ? 'on' : inScale.has(m % 12) ? 'in' : 'out');
    return (
        <div className="scale-keys" aria-hidden="true">
            {whites.map(m => (
                <div key={m} className={`white ${cls(m)}`}>
                    <span>{m % 12 === 0 ? `C${Math.floor(m / 12) - 1}` : on.has(m) ? NOTE_NAMES[m % 12] : ''}</span>
                </div>
            ))}
            {blacks.map(({ midi, slot }) => (
                <div key={midi} className={`black ${cls(midi)}`} style={{ left: `calc(${(slot + 1) / 14} * 100% - 2.2%)` }} />
            ))}
        </div>
    );
};

/** Which way a point is pushed from the stick's centre; inside the dead zone it's the centre. */
function dirFromPoint(dx: number, dy: number, deadZone: number): StickDir {
    if (Math.hypot(dx, dy) < deadZone) return 'C';
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // 0 = right, 90 = down
    const sectors: StickDir[] = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'];
    return sectors[Math.round(((angle + 360) % 360) / 45) % 8];
}

/** A tap shorter than this, without sliding, latches a direction instead of holding it. */
const TAP_MS = 250;

const Stick: React.FC<{
    dir: StickDir;
    latched: StickDir;
    chords: { [d in StickDir]: string };
    rules?: Partial<Record<StickDir, string>>;
    ariaRules?: Partial<Record<StickDir, string>>;
    caption: string;
    forPad: string;
    showCaption: boolean;
    onStick: (d: StickDir) => void;
    onHold: (d: StickDir | null) => void;
}> = ({ dir, latched, chords, rules, ariaRules, caption, forPad, showCaption, onStick, onHold }) => {
    // an unused direction (no chord or note there) gets no label either
    const rule = (d: StickDir) => (!chords[d] ? '' : rules?.[d] ?? STICK_LABELS[d]);
    const ariaRule = (d: StickDir) => (!chords[d] ? '' : ariaRules?.[d] ?? rule(d));
    const [vx, vy] = DIR_VECTOR[dir];
    const gesture = useRef<{ id: number; start: number; dir: StickDir; moved: boolean } | null>(null);

    const pointDir = (e: React.PointerEvent<HTMLDivElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        const knob = e.currentTarget.querySelector('.stick-knob')?.getBoundingClientRect();
        return dirFromPoint(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2), knob ? knob.width / 2 : 30);
    };

    // Thumb-stick: press anywhere on it and slide; the direction follows the angle from the centre,
    // and letting go springs back. Works with one thumb here and the other on the pads.
    const down = (e: React.PointerEvent<HTMLDivElement>) => {
        if (gesture.current || e.button > 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const d = pointDir(e);
        gesture.current = { id: e.pointerId, start: performance.now(), dir: d, moved: false };
        onHold(d);
    };
    const move = (e: React.PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        const d = pointDir(e);
        if (d !== g.dir) {
            g.dir = d;
            g.moved = true;
            onHold(d);
        }
    };
    const up = (e: React.PointerEvent<HTMLDivElement>) => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        gesture.current = null;
        onHold(null);
        // A quick tap without sliding latches that direction (or unlatches it / the centre clears it)
        const tap = !g.moved && performance.now() - g.start < TAP_MS;
        if (tap) onStick(g.dir === 'C' || latched === g.dir ? 'C' : g.dir);
    };

    return (
        <div className="stick-area">
            <div
                className="stick"
                role="group"
                aria-label={`Chord stick, showing chords for pad ${forPad}`}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onContextMenu={e => e.preventDefault()}
            >
                <svg className="stick-ring" viewBox="-50 -50 100 100" aria-hidden="true">
                    {RING.map(d => (
                        <path key={d} d={SEGMENTS[d]} className={`seg ${dir === d ? 'active' : ''} ${latched === d ? 'latched' : ''} ${chords[d] ? '' : 'off'}`} />
                    ))}
                </svg>
                {RING.map(d => {
                    const [x, y] = DIR_VECTOR[d];
                    return (
                        <button
                            key={d}
                            className={`stick-dir ${dir === d ? 'active' : ''} ${chords[d] ? '' : 'off'}`}
                            style={{ left: `calc(50% + ${x} * var(--label-r))`, top: `calc(50% + ${y} * var(--label-r))` }}
                            aria-pressed={latched === d}
                            aria-label={`${chords[d] || 'Nothing'}: ${ariaRule(d) || 'unused'} (hold ${DIR_KEYS[d]})`}
                            title={`${rule(d) || 'unused here'} · hold ${DIR_KEYS[d]}`}
                            // pointer input is handled by the stick itself; this is for keyboard (Enter/Space)
                            onClick={e => { if (e.detail === 0) onStick(latched === d ? 'C' : d); }}
                        >
                            <span className="dir-name">{chords[d]}</span>
                            <span className="dir-rule">{rule(d)}</span>
                        </button>
                    );
                })}
                <button
                    className={`stick-knob ${dir === 'C' ? 'active' : ''}`}
                    style={{ transform: `translate(${vx * 6}px, ${vy * 6}px)` }}
                    aria-label={`${chords.C}: centre the stick, ${ariaRules?.C ?? 'plain triad'}`}
                    onClick={e => { if (e.detail === 0) onStick('C'); }}
                >
                    <span className="knob-name">{chords.C}</span>
                    <span className="knob-rule">{rules?.C ?? 'Triad'}</span>
                </button>
            </div>
            {showCaption && <p className="stick-caption">{caption} <b>{forPad}</b></p>}
        </div>
    );
};

const Pad: React.FC<{ pad: PadView; onDown: (d: number) => void; onUp: (d: number) => void }> = ({ pad, onDown, onUp }) => {
    const holding = useRef(false);
    const down = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (holding.current || e.button > 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        holding.current = true;
        onDown(pad.degree);
    };
    const up = () => {
        if (!holding.current) return;
        holding.current = false;
        onUp(pad.degree);
    };
    return (
        <button
            className={`pad pad-${pad.degree + 1} ${pad.degree % 2 ? 'upper' : 'lower'} ${pad.held ? 'held' : ''}`}
            aria-label={`${pad.degree + 1}: ${pad.numeral}, ${pad.symbol}`}
            onPointerDown={down}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
            onContextMenu={e => e.preventDefault()}
        >
            <span className="pad-number">{pad.degree + 1}</span>
            <span className="pad-meta">
                <span className="pad-numeral">{pad.numeral}</span>
                <span className="pad-symbol">{pad.symbol}</span>
            </span>
        </button>
    );
};

const Device: React.FC<DeviceProps> = ({
    info, sounding, scalePcs, octave, pads, stickDir, latchedDir, stickChords, stickFor, recording,
    onPadDown, onPadUp, onStick, onStickHold, compact = false, stickRules, stickAria, padMode, notesPart, onPadMode, strip,
}) => (
    <section className={`device ${compact ? 'compact' : ''}`} aria-label="Instrument">
        {!compact && (
            <div className="device-top">
                <span className="device-label">metju.chord</span>
                <span className="device-leds" aria-hidden="true">
                    <span className={recording ? 'led-rec' : ''} />
                    <span className={pads.some(p => p.held) ? 'led-play' : ''} />
                </span>
            </div>
        )}

        <div className="info-row">
            <ChordInfo view={info} />
            <ModeToggle mode={padMode} notesPart={notesPart} onMode={onPadMode} />
        </div>
        <PlayStrip {...strip} />
        {!compact && <ScaleKeys sounding={sounding} scalePcs={scalePcs} octave={octave} />}

        <div className="device-controls">
            <Stick
                dir={stickDir}
                latched={latchedDir}
                chords={stickChords}
                rules={stickRules}
                ariaRules={stickAria}
                caption={padMode === 'notes' ? `Notes on ${notesPart ?? ''} · pad` : 'Chords for pad'}
                forPad={stickFor}
                showCaption={!compact}
                onStick={onStick}
                onHold={onStickHold}
            />
            <div className="pads">
                {[0, 2, 4, 6, 1, 3, 5].map(d => (
                    <Pad key={d} pad={pads[d]} onDown={onPadDown} onUp={onPadUp} />
                ))}
            </div>
        </div>

        {!compact && (
            <p className="device-hint">
                Press and slide the stick, or tap a direction to lock it. Keys: hold <kbd>Q W E</kbd> <kbd>A D</kbd> <kbd>Z X C</kbd> while playing <kbd>1–7</kbd>.
            </p>
        )}
    </section>
);

export default Device;
