import React, { useEffect, useRef, useState } from 'react';
import './TopBar.css';
import { KEYS, MusicalKey, SCALES, ScaleId } from '../theory';
import { addTap, tapBpm } from '../tempo';
import { useDialog } from './useDialog';
import { UndoRedo } from './SongMenu';

export const OCTAVE_MIN = 2;
export const OCTAVE_MAX = 6;
export const BPM_MIN = 40;
export const BPM_MAX = 240;
export const clampBpm = (bpm: number) => Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm)));

/** The three modes: Play (the instrument), Song (what plays), Parts (how it sounds). */
export type AppMode = 'play' | 'song' | 'parts';

export const MODES: { id: AppMode; label: string; hint: string }[] = [
    { id: 'play', label: 'Play', hint: 'the instrument' },
    { id: 'song', label: 'Song', hint: 'what plays: chords, melody, drums' },
    { id: 'parts', label: 'Parts', hint: 'how it sounds: instruments, style, tone, effects' },
];

interface TopBarProps {
    /** Phones and small windows: a slimmer bar without the name. */
    compact: boolean;
    mode: AppMode;
    selectedKey: MusicalKey;
    scale: ScaleId;
    bpm: number;
    playing: boolean;
    recording: boolean;
    /** Why Record can't be used right now (it's disabled with this as its hint), if it can't. */
    recordBlocked?: string;
    /** Beat lit by the click or the playhead, or null when nothing runs. */
    beat: number | null;
    beats: number;
    /** Which modes are offered (none: the desktop layout shows the instrument and has its own Song | Parts tabs). */
    modes?: AppMode[];
    onMode: (mode: AppMode) => void;
    onKeyChange: (key: MusicalKey) => void;
    onScaleChange: (scale: ScaleId) => void;
    onBpmChange: (bpm: number) => void;
    onTogglePlay: () => void;
    /** Stop and go back to the start (of the open section, or of the chain in Chain mode). */
    onStop: () => void;
    onToggleRecord: () => void;
    onOpenSettings: () => void;
    /** Sync out is on: the gear gets a dot, since the left channel is clicks. */
    syncOn?: boolean;
    /** 📖 Learn: open (yellow edge while it's showing) or closed. */
    learnOpen: boolean;
    onToggleLearn: () => void;
    /** Undo and redo of every song edit: here, so they are in reach on every screen. */
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    /** Compact: the key, scale and tempo sheet behind the chip (App owns it, so shortcuts rest while it's open). */
    keyOpen?: boolean;
    onKeyOpen?: (open: boolean) => void;
}

const Chevron = () => (
    <svg className="tb-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M2 3.5l3 3 3-3" />
    </svg>
);

/** ⚙ a cog (the old sun-like circle with rays read as a theme switch). */
export const GearIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
        <path d="M13.16 6.40 L15.10 6.78 L15.10 9.22 L13.16 9.60 L12.78 10.52 L13.88 12.16 L12.16 13.88 L10.52 12.78 L9.60 13.16 L9.22 15.10 L6.78 15.10 L6.40 13.16 L5.48 12.78 L3.84 13.88 L2.12 12.16 L3.22 10.52 L2.84 9.60 L0.90 9.22 L0.90 6.78 L2.84 6.40 L3.22 5.48 L2.12 3.84 L3.84 2.12 L5.48 3.22 L6.40 2.84 L6.78 0.90 L9.22 0.90 L9.60 2.84 L10.52 3.22 L12.16 2.12 L13.88 3.84 L12.78 5.48Z" />
        <circle cx="8" cy="8" r="2.3" />
    </svg>
);

/** 📖 an open book, for Learn. */
export const BookIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M8 4.2C6.6 3 4.6 2.6 2 2.8v9.4c2.6-.2 4.6.2 6 1.4 1.4-1.2 3.4-1.6 6-1.4V2.8c-2.6-.2-4.6.2-6 1.4zM8 4.2v9.4" />
    </svg>
);

/** How long − / + wait before repeating while held, and the gaps after that (they quicken). */
const HOLD_DELAY = 380;
const HOLD_GAPS = [110, 110, 110, 110, 80, 80, 80, 80, 55];

/**
 * A button that steps once on a press and keeps stepping while it's held (pointer or key). `step`
 * returns false when it can't go further, which ends the hold.
 */
function useHoldRepeat(step: () => boolean) {
    const fn = useRef(step);
    fn.current = step;
    const timer = useRef<number | null>(null);
    const stop = () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
    };
    useEffect(() => {
        return stop;
    }, []);
    return {
        onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
            if (e.button > 0) return;
            stop();
            if (!fn.current()) return;
            let n = 0;
            const again = () => {
                timer.current = fn.current() ? window.setTimeout(again, HOLD_GAPS[Math.min(n++, HOLD_GAPS.length - 1)]) : null;
            };
            timer.current = window.setTimeout(again, HOLD_DELAY);
        },
        onPointerUp: stop,
        onPointerCancel: stop,
        onPointerLeave: stop,
        onBlur: stop,
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        // the pointer already stepped; a click without one is the keyboard (which repeats by itself while held)
        onClick: (e: React.MouseEvent) => {
            if (e.detail === 0) fn.current();
        },
    };
}

/**
 * Tempo: − and + (one step a press, repeating while held) around a number you can type, and in the
 * compact sheet a Tap button (the average of the last few taps).
 */
export const Tempo: React.FC<{ bpm: number; onChange: (bpm: number) => void; tap?: boolean }> = ({ bpm, onChange, tap }) => {
    // the newest tempo, also between renders while a button is held
    const now = useRef(bpm);
    now.current = bpm;
    const [draft, setDraft] = useState<string | null>(null);
    const taps = useRef<number[]>([]);
    const [tapped, setTapped] = useState(0);
    const step = (by: number) => () => {
        const next = clampBpm(now.current + by);
        if (next === now.current) return false;
        now.current = next;
        onChange(next);
        return next > BPM_MIN && next < BPM_MAX;
    };
    const slower = useHoldRepeat(step(-1));
    const faster = useHoldRepeat(step(1));
    const commit = () => {
        const typed = draft === null ? NaN : parseInt(draft, 10);
        setDraft(null);
        if (Number.isFinite(typed) && clampBpm(typed) !== bpm) onChange(clampBpm(typed));
    };
    const onTap = () => {
        taps.current = addTap(taps.current, performance.now());
        setTapped(taps.current.length);
        const found = tapBpm(taps.current);
        if (found !== null && clampBpm(found) !== now.current) onChange(clampBpm(found));
    };
    return (
        <>
            <button className="tb-step" aria-label="Slower" title="Slower (hold to keep going)" disabled={bpm <= BPM_MIN} {...slower}>−</button>
            <span className="tb-tempo">
                <input
                    className="tb-bpm"
                    aria-label={`Tempo in BPM, ${BPM_MIN} to ${BPM_MAX}`}
                    title="Tempo: type a number"
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    autoComplete="off"
                    value={draft ?? String(bpm)}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
                    onBlur={commit}
                    onKeyDown={e => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            setDraft(null);
                            step(e.key === 'ArrowUp' ? 1 : -1)();
                        }
                    }}
                />
                {' '}<span className="tb-unit">BPM</span>
            </span>
            <button className="tb-step" aria-label="Faster" title="Faster (hold to keep going)" disabled={bpm >= BPM_MAX} {...faster}>+</button>
            {tap && (
                <button
                    className="tb-tap"
                    title="Tap the beat a few times to set the tempo"
                    aria-label="Tap tempo"
                    // on the press, not the release: that is where the beat is felt
                    onPointerDown={e => {
                        if (e.button === 0) onTap();
                    }}
                    onClick={e => {
                        if (e.detail === 0) onTap();
                    }}
                >
                    Tap{tapped === 1 && <span className="tb-tap-hint"> again</span>}
                </button>
            )}
        </>
    );
};

const KeySelect: React.FC<{ value: MusicalKey; onChange: (key: MusicalKey) => void }> = ({ value, onChange }) => (
    <label className="tb-select">
        <select aria-label="Key" value={value} onChange={e => onChange(e.target.value as MusicalKey)}>
            {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <Chevron />
    </label>
);

const ScaleSelect: React.FC<{ value: ScaleId; long?: boolean; onChange: (scale: ScaleId) => void }> = ({ value, long, onChange }) => (
    <label className="tb-select">
        <select aria-label="Scale" value={value} onChange={e => onChange(e.target.value as ScaleId)}>
            {SCALES.map(sc => <option key={sc.id} value={sc.id} title={sc.label}>{long ? sc.label : sc.short}</option>)}
        </select>
        <Chevron />
    </label>
);

/** Compact: the sheet behind the key · tempo chip, with the key, the scale and the tempo (− / +, typed, tapped). */
const KeySheet: React.FC<{ p: TopBarProps; onClose: () => void }> = ({ p, onClose }) => {
    const sheet = useRef<HTMLDivElement>(null);
    useDialog(sheet, true, onClose);
    return (
        <div className="ss-backdrop tb-sheet-backdrop" onPointerDown={e => e.target === e.currentTarget && onClose()}>
            <div ref={sheet} className="ss-sheet tb-sheet panel" role="dialog" aria-modal="true" aria-label="Key, scale and tempo">
                <div className="tb-sheet-row">
                    <span className="pd-label">Key</span>
                    <KeySelect value={p.selectedKey} onChange={p.onKeyChange} />
                    <ScaleSelect value={p.scale} long onChange={p.onScaleChange} />
                    <span className="ss-space" />
                    <button className="ss-close" aria-label="Close" onClick={onClose}>✕</button>
                </div>
                <div className="tb-sheet-row" role="group" aria-label="Tempo">
                    <span className="pd-label">Tempo</span>
                    <Tempo bpm={p.bpm} onChange={p.onBpmChange} tap />
                </div>
            </div>
        </div>
    );
};

/**
 * The one header, on phones and desktop: key, scale, tempo, the only Play/Pause, Stop and Record buttons,
 * the mode switch and the settings button. A select keeps its native picker (the wheel on iOS).
 * On compact it is one fixed row: key, scale and tempo fold into one chip that opens a sheet.
 */
const TopBar: React.FC<TopBarProps> = p => (<>
    <header className={`top-bar ${p.compact ? 'compact' : ''}`}>
        <div className="brand">
            <span className="brand-mark" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M3 12V5M8 12V3M13 12V7" />
                </svg>
            </span>
            {!p.compact && <span className="brand-name">metju<span className="brand-dot">.</span>chord</span>}
        </div>

        {p.compact ? (
            <button
                className="tb-chip"
                aria-haspopup="dialog"
                aria-expanded={!!p.keyOpen}
                aria-label={`Key ${p.selectedKey} ${SCALES.find(sc => sc.id === p.scale)?.label}, ${p.bpm} BPM. Change key, scale or tempo`}
                onClick={() => p.onKeyOpen?.(true)}
            >
                <b>{p.selectedKey} {SCALES.find(sc => sc.id === p.scale)?.short}</b>
                <span>{p.bpm} <span className="tb-unit">BPM</span></span>
            </button>
        ) : (<>
            <div className="tb-group">
                <KeySelect value={p.selectedKey} onChange={p.onKeyChange} />
                <ScaleSelect value={p.scale} onChange={p.onScaleChange} />
            </div>

            <div className="tb-group" role="group" aria-label="Tempo">
                <Tempo bpm={p.bpm} onChange={p.onBpmChange} />
                <span className="beat-dots" aria-hidden="true">
                    {Array.from({ length: p.beats }, (_, i) => (
                        <span key={i} className={`beat-dot ${p.beat === i ? (i === 0 ? 'down' : 'on') : ''}`} />
                    ))}
                </span>
            </div>
        </>)}

        <div className="tb-group">
            <button className="tb-stop" aria-label="Stop, back to start (Home)" title="Stop, back to start (Home)" onClick={p.onStop}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1" /></svg>
            </button>
            <button className={`tb-play ${p.playing ? 'on' : ''}`} aria-label={p.playing ? 'Pause (Space)' : 'Play (Space)'} title={p.playing ? 'Pause (Space)' : 'Play (Space)'} onClick={p.onTogglePlay}>
                {p.playing
                    ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z" /></svg>
                    : <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 1.5v9l7-4.5z" /></svg>}
            </button>
            <button
                className={`tb-rec ${p.recording ? 'on' : ''}`}
                aria-pressed={p.recording}
                aria-label={p.recordBlocked ? `Record: ${p.recordBlocked}` : 'Record (R)'}
                title={p.recordBlocked ?? 'Record (R)'}
                disabled={!!p.recordBlocked && !p.recording}
                onClick={p.onToggleRecord}
            >
                <span className="rec-dot" />
            </button>
        </div>

        <UndoRedo canUndo={p.canUndo} canRedo={p.canRedo} onUndo={p.onUndo} onRedo={p.onRedo} />

        {(!p.modes || p.modes.length > 0) && (
            <nav className="tb-modes segmented" aria-label="Mode">
                {MODES.filter(m => !p.modes || p.modes.includes(m.id)).map(m => (
                    <button key={m.id} aria-pressed={p.mode === m.id} title={`${m.label}: ${m.hint}`} onClick={() => p.onMode(m.id)}>{m.label}</button>
                ))}
            </nav>
        )}

        <button
            className="tb-gear tb-learn"
            aria-label="Learn: progressions, chords, melody"
            title="Learn: progressions, chords, melody"
            aria-pressed={p.learnOpen}
            onClick={p.onToggleLearn}
        >
            <BookIcon />
            <span className="tb-learn-label">Learn</span>
        </button>

        <button
            className={`tb-gear tb-settings ${p.syncOn ? 'sync-on' : ''}`}
            aria-label={p.syncOn ? 'Settings (PO sync is on)' : 'Settings'}
            title={p.syncOn ? 'Settings · PO sync is on: the left channel is clicks' : 'Settings'}
            aria-haspopup="dialog"
            onClick={p.onOpenSettings}
        >
            <GearIcon />
        </button>
    </header>
    {p.compact && p.keyOpen && <KeySheet p={p} onClose={() => p.onKeyOpen?.(false)} />}
</>);

export default TopBar;
