import React from 'react';
import './DrumEditor.css';
import { DRUM_LABELS, DRUM_ROWS, DrumPattern, DrumVoice, PATTERN_BARS, PatternBars, hasHit, isEmptyPattern } from '../drums';

interface DrumEditorProps {
    name: string;
    color: string;
    pattern: DrumPattern;
    /** 1/16 steps per bar and per beat for the time signature. */
    perBar: number;
    perBeat: number;
    /** Playhead in 1/16 steps from the top of the song, or -1 when stopped. */
    playSixteenth: number;
    presets: { id: string; label: string }[];
    /** The chord track the pads still play through while the drums are selected. */
    padTrack: string;
    onToggle: (voice: DrumVoice, i: number) => void;
    onBars: (bars: PatternBars) => void;
    onPreset: (id: string) => void;
    onClear: () => void;
    onAudition: (voice: DrumVoice) => void;
}

/** The step grid for a drum track: one row per drum, one cell per 1/16, one block per bar. */
const DrumEditor: React.FC<DrumEditorProps> = p => {
    const length = p.pattern.bars * p.perBar;
    const now = p.playSixteenth >= 0 ? p.playSixteenth % length : -1;
    const cols = { gridTemplateColumns: `var(--drum-label) repeat(${p.perBar}, minmax(var(--drum-cell), 1fr))` };

    return (
        <div className="drum-editor" style={{ '--track': p.color } as React.CSSProperties} aria-label={`${p.name} pattern`}>
            <div className="drum-head">
                <span className="sel-label">
                    <span className="track-dot" style={{ background: p.color }} />
                    {p.name} · loops under the song
                </span>
                <div className="segmented" role="group" aria-label="Pattern length">
                    {PATTERN_BARS.map(b => (
                        <button key={b} aria-pressed={p.pattern.bars === b} onClick={() => p.onBars(b)}>
                            {b} {b === 1 ? 'bar' : 'bars'}
                        </button>
                    ))}
                </div>
                <select className="drum-preset" aria-label="Starter beat" value="" onChange={e => e.target.value && p.onPreset(e.target.value)}>
                    <option value="">Starter beat…</option>
                    {p.presets.map(pr => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
                </select>
                <button className="chip-button" disabled={isEmptyPattern(p.pattern)} onClick={p.onClear}>Clear</button>
                <span className="section-note drum-hint">Tap cells to add hits. Pads still play {p.padTrack}.</span>
            </div>

            <div className="drum-bars">
                {Array.from({ length: p.pattern.bars }, (_, bar) => (
                    <div key={bar} className="drum-bar" role="grid" aria-label={`Bar ${bar + 1}`} style={{ '--drum-cols': p.perBar } as React.CSSProperties}>
                        {p.pattern.bars > 1 && <div className="drum-bar-title">Bar {bar + 1}</div>}
                        {DRUM_ROWS.map(voice => (
                            <div key={voice} className={`drum-row ${voice === 'kick' ? 'kick' : ''}`} role="row" style={cols}>
                                <button className="drum-name" onClick={() => p.onAudition(voice)} title={`Hear the ${DRUM_LABELS[voice].toLowerCase()}`}>
                                    {DRUM_LABELS[voice]}
                                </button>
                                {Array.from({ length: p.perBar }, (_, j) => {
                                    const i = bar * p.perBar + j;
                                    const on = hasHit(p.pattern, voice, i);
                                    return (
                                        <button
                                            key={j}
                                            role="gridcell"
                                            className={`drum-cell ${on ? 'on' : ''} ${j % p.perBeat === 0 ? 'beat' : ''} ${Math.floor(j / p.perBeat) % 2 ? 'alt' : ''} ${i === now ? 'now' : ''}`}
                                            aria-pressed={on}
                                            aria-label={`${DRUM_LABELS[voice]}, bar ${bar + 1}, beat ${Math.floor(j / p.perBeat) + 1}${j % p.perBeat ? `, 1/16 ${(j % p.perBeat) + 1}` : ''}`}
                                            onClick={() => p.onToggle(voice, i)}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                        <div className="drum-row drum-count" style={cols} aria-hidden="true">
                            <span />
                            {Array.from({ length: p.perBar }, (_, j) => (
                                <span key={j} className={j % p.perBeat === 0 ? 'beat' : ''}>{j % p.perBeat === 0 ? j / p.perBeat + 1 : ''}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DrumEditor;
