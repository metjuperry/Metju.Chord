import React, { memo } from 'react';
import './DrumEditor.css';
import { DRUM_LABELS, DRUM_ROWS, DrumPattern, DrumVoice, PATTERN_BARS, PatternBars, hasHit, isEmptyPattern } from '../drums';
import { usePlay } from '../playhead';
import { useStable } from '../useStable';

interface DrumEditorProps {
    name: string;
    color: string;
    pattern: DrumPattern;
    /** 1/16 steps per bar and per beat for the time signature. */
    perBar: number;
    perBeat: number;
    presets: { id: string; label: string }[];
    /** The chord track the pads still play through while the drums are selected. */
    padTrack: string;
    onToggle: (voice: DrumVoice, i: number) => void;
    onBars: (bars: PatternBars) => void;
    onPreset: (id: string) => void;
    onClear: () => void;
    /** Copy this part's lane in the open section (all its notes or hits, to paste into another section or part). */
    onCopy: () => void;
    /** Replace this lane with what was copied (only when a lane of this kind was copied). */
    onPaste: () => void;
    canPaste: boolean;
    onAudition: (voice: DrumVoice) => void;
}

/** The step grid for a drum track: one row per drum, one cell per 1/16, one block per bar. */
const DrumEditor: React.FC<DrumEditorProps> = memo(function DrumEditor(p) {
    const cols = `var(--drum-label) repeat(${p.perBar}, minmax(var(--drum-cell), 1fr))`;
    // one handler for every cell: the cell says which drum and which 1/16
    const toggle = useStable((e: React.MouseEvent<HTMLButtonElement>) => {
        const d = e.currentTarget.dataset;
        p.onToggle(d.voice as DrumVoice, Number(d.i));
    });

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
                <button className="chip-button" disabled={isEmptyPattern(p.pattern)} onClick={p.onCopy}>Copy</button>
                <button className="chip-button" disabled={!p.canPaste} onClick={p.onPaste}>Paste</button>
                <button className="chip-button" disabled={isEmptyPattern(p.pattern)} onClick={p.onClear}>Clear</button>
                <span className="section-note drum-hint">Tap cells to add hits. Pads still play {p.padTrack}.</span>
            </div>

            <div className="drum-bars">
                {Array.from({ length: p.pattern.bars }, (_, bar) => (
                    <DrumBar key={bar} bar={bar} pattern={p.pattern} perBar={p.perBar} perBeat={p.perBeat} cols={cols} onToggle={toggle} onAudition={p.onAudition} />
                ))}
            </div>
        </div>
    );
});

/**
 * One bar of the grid. It follows the playhead itself, only while the playhead is in it (the pattern
 * loops under the song), and its cells are memoised, so a 1/16 re-draws two cells per drum.
 */
const DrumBar: React.FC<{
    bar: number;
    pattern: DrumPattern;
    perBar: number;
    perBeat: number;
    cols: string;
    onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onAudition: (voice: DrumVoice) => void;
}> = memo(function DrumBar({ bar, pattern, perBar, perBeat, cols, onToggle, onAudition }) {
    const length = pattern.bars * perBar;
    // the playhead's 1/16 in this bar of the pattern, else -1
    const now = usePlay(s => {
        const i = s.sixteenth >= 0 ? s.sixteenth % length : -1;
        return i >= bar * perBar && i < (bar + 1) * perBar ? i : -1;
    });
    const style = { gridTemplateColumns: cols };
    return (
        <div className="drum-bar" role="grid" aria-label={`Bar ${bar + 1}`} style={{ '--drum-cols': perBar } as React.CSSProperties}>
            {pattern.bars > 1 && <div className="drum-bar-title">Bar {bar + 1}</div>}
            {DRUM_ROWS.map(voice => (
                <div key={voice} className={`drum-row ${voice === 'kick' ? 'kick' : ''}`} role="row" style={style}>
                    <button className="drum-name" onClick={() => onAudition(voice)} title={`Hear the ${DRUM_LABELS[voice].toLowerCase()}`}>
                        {DRUM_LABELS[voice]}
                    </button>
                    {Array.from({ length: perBar }, (_, j) => {
                        const i = bar * perBar + j;
                        return <DrumCell key={j} voice={voice} bar={bar} j={j} i={i} on={hasHit(pattern, voice, i)} now={i === now} perBeat={perBeat} onToggle={onToggle} />;
                    })}
                </div>
            ))}
            <div className="drum-row drum-count" style={style} aria-hidden="true">
                <span />
                {Array.from({ length: perBar }, (_, j) => (
                    <span key={j} className={j % perBeat === 0 ? 'beat' : ''}>{j % perBeat === 0 ? j / perBeat + 1 : ''}</span>
                ))}
            </div>
        </div>
    );
});

const DrumCell: React.FC<{
    voice: DrumVoice;
    bar: number;
    j: number;
    i: number;
    on: boolean;
    now: boolean;
    perBeat: number;
    onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = memo(function DrumCell({ voice, bar, j, i, on, now, perBeat, onToggle }) {
    return (
        <button
            role="gridcell"
            className={`drum-cell ${on ? 'on' : ''} ${j % perBeat === 0 ? 'beat' : ''} ${Math.floor(j / perBeat) % 2 ? 'alt' : ''} ${now ? 'now' : ''}`}
            aria-pressed={on}
            aria-label={`${DRUM_LABELS[voice]}, bar ${bar + 1}, beat ${Math.floor(j / perBeat) + 1}${j % perBeat ? `, 1/16 ${(j % perBeat) + 1}` : ''}`}
            data-voice={voice}
            data-i={i}
            onClick={onToggle}
        />
    );
});

export default DrumEditor;
