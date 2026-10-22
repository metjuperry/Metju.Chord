import React from 'react';
import './CompactBar.css';
import { KEYS, MusicalKey, SCALES, ScaleId } from '../theory';
import { BPM_MAX, BPM_MIN, OCTAVE_MAX, OCTAVE_MIN } from './TopBar';

export type AppMode = 'play' | 'seq' | 'sound' | 'fx';

const MODES: { id: AppMode; label: string }[] = [
    { id: 'play', label: 'Play' },
    { id: 'seq', label: 'Seq' },
    { id: 'sound', label: 'Sound' },
    { id: 'fx', label: 'FX' },
];

interface CompactBarProps {
    mode: AppMode;
    selectedKey: MusicalKey;
    scale: ScaleId;
    octave: number;
    bpm: number;
    playing: boolean;
    recording: boolean;
    onMode: (mode: AppMode) => void;
    onKeyChange: (key: MusicalKey) => void;
    onScaleChange: (scale: ScaleId) => void;
    onOctaveChange: (octave: number) => void;
    onBpmChange: (bpm: number) => void;
    onTogglePlay: () => void;
    onToggleRecord: () => void;
}

/** The phone header: everything needed while jamming, plus the switch between Play, Sequencer and Sound. */
const CompactBar: React.FC<CompactBarProps> = p => (
    <header className="compact-bar">
        <span className="brand-mark small" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 12V5M8 12V3M13 12V7" />
            </svg>
        </span>

        <div className="cb-group">
            <select aria-label="Key" value={p.selectedKey} onChange={e => p.onKeyChange(e.target.value as MusicalKey)}>
                {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <select aria-label="Scale" value={p.scale} onChange={e => p.onScaleChange(e.target.value as ScaleId)}>
                {SCALES.map(sc => <option key={sc.id} value={sc.id}>{sc.short}</option>)}
            </select>
        </div>

        <div className="cb-group" aria-label="Octave" role="group">
            <button aria-label="Octave down" disabled={p.octave <= OCTAVE_MIN} onClick={() => p.onOctaveChange(p.octave - 1)}>−</button>
            <span className="cb-value">C{p.octave}</span>
            <button aria-label="Octave up" disabled={p.octave >= OCTAVE_MAX} onClick={() => p.onOctaveChange(p.octave + 1)}>+</button>
        </div>

        <div className="cb-group" aria-label="Tempo" role="group">
            <button aria-label="Slower" disabled={p.bpm <= BPM_MIN} onClick={() => p.onBpmChange(p.bpm - 1)}>−</button>
            <span className="cb-value">{p.bpm}</span>
            <button aria-label="Faster" disabled={p.bpm >= BPM_MAX} onClick={() => p.onBpmChange(p.bpm + 1)}>+</button>
        </div>

        <div className="cb-group">
            <button className={`cb-play ${p.playing ? 'on' : ''}`} aria-label={p.playing ? 'Stop progression' : 'Play progression'} onClick={p.onTogglePlay}>
                {p.playing
                    ? <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" /></svg>
                    : <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 1.5v11L12.5 7z" /></svg>}
            </button>
            <button className={`cb-rec ${p.recording ? 'on' : ''}`} aria-pressed={p.recording} aria-label="Record" onClick={p.onToggleRecord}>
                <span className="rec-dot" />
            </button>
        </div>

        <nav className="cb-modes segmented" aria-label="Mode">
            {MODES.map(m => (
                <button key={m.id} aria-pressed={p.mode === m.id} onClick={() => p.onMode(m.id)}>{m.label}</button>
            ))}
        </nav>
    </header>
);

export default CompactBar;
