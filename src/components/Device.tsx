import React, { useRef } from 'react';
import './Device.css';
import { NOTE_NAMES, StickDir, STICK_LABELS } from '../theory';

export interface PadView {
    degree: number;
    numeral: string;
    /** Chord this pad plays with the stick where it is now, e.g. "Am7". */
    symbol: string;
    held: boolean;
}

export interface ScreenView {
    idle: boolean;
    symbol: string;
    long: string;
    numeral: string;
    notes: string[];
    stick: StickDir;
    inversionLabel: string;
    status: string[];
    /** Right-hand status flag, e.g. "REC" or "BEAT 3 · HELD 2/3". */
    flag?: string;
}

interface DeviceProps {
    screen: ScreenView;
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
    inversion: number;
    maxInversion: number;
    recording: boolean;
    onPadDown: (degree: number) => void;
    onPadUp: (degree: number) => void;
    onStick: (dir: StickDir) => void;
    onInversion: (inversion: number) => void;
}

// Staggered like the hardware: 2 4 6 above, 1 3 5 7 below
const TOP_ROW = [1, 3, 5];
const BOTTOM_ROW = [0, 2, 4, 6];

const DIR_VECTOR: { [d in StickDir]: [number, number] } = {
    C: [0, 0], U: [0, -1], UR: [0.71, -0.71], R: [1, 0], DR: [0.71, 0.71],
    D: [0, 1], DL: [-0.71, 0.71], L: [-1, 0], UL: [-0.71, -0.71],
};
const DIR_ANGLE: { [d in StickDir]: number } = { C: 0, U: 0, UR: 45, R: 90, DR: 135, D: 180, DL: 225, L: 270, UL: 315 };
const DIR_KEYS: { [d in StickDir]: string } = { UL: 'Q', U: 'W', UR: 'E', L: 'A', C: 'S', R: 'D', DL: 'Z', D: 'X', DR: 'C' };
const RING: StickDir[] = ['U', 'UR', 'R', 'DR', 'D', 'DL', 'L', 'UL'];
const INVERSIONS = ['Root', '1st', '2nd', '3rd'];

const Screen: React.FC<{ view: ScreenView; recording: boolean }> = ({ view, recording }) => (
    <div className="oled" role="status" aria-live="polite" aria-label={view.idle ? 'Ready' : `${view.long}, ${view.numeral}`}>
        <div className="oled-status">
            {view.status.map(s => <span key={s}>{s}</span>)}
            <span className={`oled-flag ${recording ? 'rec' : ''}`}>{recording ? '● REC' : view.flag ?? ''}</span>
        </div>
        {view.idle ? (
            <div className="oled-main idle">
                <span className="oled-symbol">PRESS 1–7</span>
            </div>
        ) : (
            <div className="oled-main">
                <span className="oled-symbol">{view.symbol}</span>
                <span className="oled-side">
                    <span className="oled-numeral">{view.numeral}</span>
                    <span className="oled-stick">
                        <StickGlyph dir={view.stick} /> {STICK_LABELS[view.stick].toUpperCase()}
                    </span>
                </span>
            </div>
        )}
        <div className="oled-foot">
            <span>{view.idle ? 'HOLD A PAD · PUSH THE STICK' : view.notes.join(' ')}</span>
            <span>{view.idle ? '' : view.inversionLabel}</span>
        </div>
    </div>
);

const StickGlyph: React.FC<{ dir: StickDir; size?: number }> = ({ dir, size = 12 }) =>
    dir === 'C' ? (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="3" fill="currentColor" /></svg>
    ) : (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" style={{ transform: `rotate(${DIR_ANGLE[dir]}deg)` }}>
            <path d="M6 1.5 10 7H7v3.5H5V7H2z" fill="currentColor" />
        </svg>
    );

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

const Stick: React.FC<{ dir: StickDir; latched: StickDir; chords: { [d in StickDir]: string }; forPad: string; onStick: (d: StickDir) => void }> =
    ({ dir, latched, chords, forPad, onStick }) => {
        const [vx, vy] = DIR_VECTOR[dir];
        return (
            <div className="stick-area">
                <div className="stick" role="group" aria-label={`Chord stick, showing chords for pad ${forPad}`}>
                    <div className="stick-well" />
                    {RING.map(d => {
                        const [x, y] = DIR_VECTOR[d];
                        return (
                            <button
                                key={d}
                                className={`stick-dir ${dir === d ? 'active' : ''}`}
                                style={{ left: `calc(50% + ${x * 104}px)`, top: `calc(50% + ${y * 92}px)` }}
                                aria-pressed={latched === d}
                                aria-label={`${chords[d]}: ${STICK_LABELS[d]} (hold ${DIR_KEYS[d]})`}
                                title={`${STICK_LABELS[d]} · hold ${DIR_KEYS[d]}`}
                                onClick={() => onStick(latched === d ? 'C' : d)}
                            >
                                <span className="dir-name"><span className="led" />{chords[d]}</span>
                                <span className="dir-rule">{STICK_LABELS[d]}</span>
                            </button>
                        );
                    })}
                    <button
                        className={`stick-knob ${dir === 'C' ? 'active' : ''}`}
                        style={{ transform: `translate(${vx * 10}px, ${vy * 10}px)` }}
                        aria-label={`${chords.C}: centre the stick, plain triad`}
                        onClick={() => onStick('C')}
                    >
                        <span className="knob-name">{chords.C}</span>
                        <span className="knob-rule">Triad</span>
                    </button>
                </div>
                <p className="stick-caption">Chords for pad <b>{forPad}</b></p>
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
            className={`pad ${pad.held ? 'held' : ''}`}
            style={{ gridArea: `p${pad.degree + 1}` }}
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
    screen, sounding, scalePcs, octave, pads, stickDir, latchedDir, stickChords, stickFor, inversion, maxInversion, recording,
    onPadDown, onPadUp, onStick, onInversion,
}) => (
    <section className="device" aria-label="Instrument">
        <div className="device-top">
            <span className="device-label">metju.chord</span>
            <span className="device-leds" aria-hidden="true">
                <span className={recording ? 'led-rec' : ''} />
                <span className={pads.some(p => p.held) ? 'led-play' : ''} />
            </span>
        </div>

        <Screen view={screen} recording={recording} />
        <ScaleKeys sounding={sounding} scalePcs={scalePcs} octave={octave} />

        <div className="device-controls">
            <Stick dir={stickDir} latched={latchedDir} chords={stickChords} forPad={stickFor} onStick={onStick} />
            <div className="pads">
                {[...TOP_ROW, ...BOTTOM_ROW].map(d => (
                    <Pad key={d} pad={pads[d]} onDown={onPadDown} onUp={onPadUp} />
                ))}
            </div>
        </div>

        <div className="device-foot">
            <div className="inversion">
                <span className="device-caption" id="inv-label">Inversion</span>
                <div className="segmented dark" role="group" aria-labelledby="inv-label">
                    {INVERSIONS.map((label, i) => (
                        <button key={label} aria-pressed={inversion === i} disabled={i > maxInversion} onClick={() => onInversion(i)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <p className="device-hint">
                Click a stick direction to latch it, or hold <kbd>Q W E</kbd> <kbd>A D</kbd> <kbd>Z X C</kbd> while playing <kbd>1–7</kbd>.
            </p>
        </div>
    </section>
);

export default Device;
