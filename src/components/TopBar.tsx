import React from 'react';
import './TopBar.css';
import { KEYS, MusicalKey } from '../theory';

export const OCTAVE_MIN = 2;
export const OCTAVE_MAX = 6;
export const BPM_MIN = 40;
export const BPM_MAX = 240;

interface TopBarProps {
    selectedKey: MusicalKey;
    octave: number;
    bpm: number;
    metronomeOn: boolean;
    /** Beat 0-3 currently lit, or null when nothing is running. */
    beat: number | null;
    theme: 'dark' | 'light';
    onKeyChange: (key: MusicalKey) => void;
    onOctaveChange: (octave: number) => void;
    onBpmChange: (bpm: number) => void;
    onToggleMetronome: () => void;
    onToggleTheme: () => void;
    onOpenHelp: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
    selectedKey, octave, bpm, metronomeOn, beat, theme,
    onKeyChange, onOctaveChange, onBpmChange, onToggleMetronome, onToggleTheme, onOpenHelp,
}) => (
    <header className="top-bar panel">
        <div className="brand">
            <span className="brand-mark" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12V5M8 12V3M13 12V7" />
                </svg>
            </span>
            <span className="brand-name">metju<span className="brand-dot">.</span>chord</span>
        </div>

        <div className="top-group">
            <span className="eyebrow" id="key-label">Key</span>
            <div className="key-strip" role="group" aria-labelledby="key-label">
                {KEYS.map(key => (
                    <button
                        key={key}
                        className={key.length > 1 ? 'sharp' : undefined}
                        aria-pressed={key === selectedKey}
                        onClick={() => onKeyChange(key)}
                    >
                        {key}
                    </button>
                ))}
            </div>
            <span className="scale-chip">Major</span>
        </div>

        <div className="top-group">
            <span className="eyebrow">Octave</span>
            <button className="step-button" aria-label="Octave down" disabled={octave <= OCTAVE_MIN} onClick={() => onOctaveChange(octave - 1)}>−</button>
            <span className="step-value" aria-live="polite">C{octave}</span>
            <button className="step-button" aria-label="Octave up" disabled={octave >= OCTAVE_MAX} onClick={() => onOctaveChange(octave + 1)}>+</button>
        </div>

        <div className="top-group">
            <span className="eyebrow">Tempo</span>
            <button className="step-button" aria-label="Slower" disabled={bpm <= BPM_MIN} onClick={() => onBpmChange(bpm - 1)}>−</button>
            <span className="step-value tempo"><b>{bpm}</b> <span className="unit">BPM</span></span>
            <button className="step-button" aria-label="Faster" disabled={bpm >= BPM_MAX} onClick={() => onBpmChange(bpm + 1)}>+</button>
        </div>

        <button className="metronome-toggle" aria-pressed={metronomeOn} onClick={onToggleMetronome}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M5 2h6l2.5 12h-11zM8 11l4-7" />
            </svg>
            <span>Click</span>
            <span className="beat-dots" aria-hidden="true">
                {[0, 1, 2, 3].map(i => (
                    <span key={i} className={`beat-dot ${beat === i ? (i === 0 ? 'down' : 'on') : ''}`} />
                ))}
            </span>
        </button>

        <div className="top-actions">
            <button className="icon-button" aria-label="Keyboard shortcuts and help" onClick={onOpenHelp}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <rect x="1.5" y="4" width="15" height="10" rx="2" />
                    <path d="M4.5 7h1M8.5 7h1M12.5 7h1M5 11h8" />
                </svg>
            </button>
            <button className="icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={onToggleTheme}>
                {theme === 'dark' ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <circle cx="9" cy="9" r="3.5" />
                        <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" />
                    </svg>
                ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <path d="M15 11.5A6.5 6.5 0 0 1 6.5 3a6.5 6.5 0 1 0 8.5 8.5z" />
                    </svg>
                )}
            </button>
        </div>
    </header>
);

export default TopBar;
