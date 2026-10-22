import React, { useMemo } from 'react';
import './PartEditors.css';
import { TICKS_PER_SIXTEENTH } from '../drums';
import { Harmony, MELODY_STEPS, MelodyPart, chordAt, melodyMidi, resolveClip } from '../parts';
import { noteNames } from '../theory';

/** Note lengths offered for new notes, in 1/16 steps. */
const LENGTHS: { sixteenths: number; label: string }[] = [
    { sixteenths: 1, label: '1/16' },
    { sixteenths: 2, label: '1/8' },
    { sixteenths: 4, label: '1/4' },
    { sixteenths: 8, label: '1/2' },
];

interface MelodyEditorProps {
    part: MelodyPart;
    harmony: Harmony;
    /** Song length and layout, in sequencer steps (beats). */
    totalSteps: number;
    stepsPerRow: number;
    beatsPerBar: number;
    /** 1/16 steps per beat. */
    perBeat: number;
    /** Playhead in 1/16 steps, or -1 when stopped. */
    playSixteenth: number;
    /** Tap on a cell: add a note of `len` 1/16s there, or remove the note already covering it. */
    onTap: (step: number, sixteenth: number, len: number) => void;
    /** Length of new notes in 1/16s, for taps and for recording from the pads. */
    len: number;
    onLen: (len: number) => void;
    /** Where the next recorded note goes (1/16s), or -1 when not step recording. */
    cursor: number;
    onOctave: (octave: number) => void;
    onClear: () => void;
}

/**
 * A scale-locked piano roll: one row per note of the key (two octaves), one column per 1/16.
 * The notes of the chord under each column are shaded, so you can see where a melody will sit
 * well before you hear it.
 */
const MelodyEditor: React.FC<MelodyEditorProps> = p => {
    const { part, harmony, len } = p;
    const names = noteNames(harmony.key, harmony.scale);
    const blockCols = p.stepsPerRow * p.perBeat;
    const blocks = Math.ceil(p.totalSteps / p.stepsPerRow);
    const totalCols = p.totalSteps * p.perBeat;

    // which melody row is which pitch class, and its label
    const rows = useMemo(() => Array.from({ length: MELODY_STEPS }, (_, i) => {
        const step = MELODY_STEPS - 1 - i; // highest at the top
        const midi = melodyMidi(part, harmony, step);
        return { step, pc: midi % 12, label: `${names[midi % 12]}${Math.floor(midi / 12) - 1}`, tonic: step % 7 === 0 };
    }), [part, harmony, names]);

    // the chord tones under every 1/16 column
    const columns = useMemo(() => Array.from({ length: totalCols }, (_, c) => {
        const chord = chordAt(harmony.chords, c * TICKS_PER_SIXTEENTH);
        if (!chord) return null;
        const resolved = resolveClip(harmony, chord);
        return { root: resolved.rootPc, pcs: new Set(resolved.midi.map(m => m % 12)) };
    }), [harmony, totalCols]);

    // which cells are covered by a note, and where notes begin and end
    const covered = useMemo(() => {
        const map = new Map<string, { head: boolean; tail: boolean }>();
        for (const n of part.notes) {
            const from = Math.round(n.start / TICKS_PER_SIXTEENTH);
            const to = Math.round((n.start + n.len) / TICKS_PER_SIXTEENTH);
            for (let c = from; c < to; c++) map.set(`${n.step}:${c}`, { head: c === from, tail: c === to - 1 });
        }
        return map;
    }, [part.notes]);

    const now = p.playSixteenth >= 0 ? p.playSixteenth : -1;
    const barCols = p.beatsPerBar * p.perBeat;

    const renderChordRibbon = (from: number, to: number) => {
        const labels: React.ReactNode[] = [];
        for (const clip of harmony.chords) {
            if (clip.rest) continue;
            const c0 = Math.round(clip.start / TICKS_PER_SIXTEENTH);
            const c1 = Math.round((clip.start + clip.len) / TICKS_PER_SIXTEENTH);
            if (c1 <= from || c0 >= to) continue;
            const a = Math.max(c0, from);
            const b = Math.min(c1, to);
            labels.push(
                <span key={clip.start} className="mel-chord" style={{ gridColumn: `${a - from + 2} / span ${b - a}` }}>
                    {c0 < from ? '↳ ' : ''}{resolveClip(harmony, clip).name.symbol}
                </span>,
            );
        }
        return labels;
    };

    const cols = `var(--mel-label) repeat(${blockCols}, minmax(var(--mel-cell), 1fr))`;

    return (
        <div className="part-editor melody-editor" style={{ '--track': part.color } as React.CSSProperties}>
            <div className="part-head">
                <span className="sel-label">
                    <span className="track-dot" style={{ background: part.color }} />
                    {part.name}
                    <span className="section-note"> · tap to add a note, tap a note to remove it, or play the pads in Notes mode (N)</span>
                </span>
                <div className="segmented" role="group" aria-label="New note length">
                    {LENGTHS.map(l => (
                        <button key={l.sixteenths} aria-pressed={len === l.sixteenths} onClick={() => p.onLen(l.sixteenths)}>{l.label}</button>
                    ))}
                </div>
                <div className="segmented" role="group" aria-label="Melody octave">
                    {[3, 4, 5].map(o => (
                        <button key={o} aria-pressed={part.octave === o} onClick={() => p.onOctave(o)}>C{o}</button>
                    ))}
                </div>
                <button className="chip-button" disabled={part.notes.length === 0} onClick={p.onClear}>Clear</button>
            </div>

            <div className="mel-legend" aria-hidden="true">
                <span><i className="lg-root" />root of the chord</span>
                <span><i className="lg-tone" />other chord notes</span>
                <span><i className="lg-other" />rest of the scale, for passing notes</span>
            </div>

            <div className="mel-blocks">
                {Array.from({ length: blocks }, (_, b) => {
                    const from = b * blockCols;
                    const to = Math.min(from + blockCols, totalCols);
                    return (
                        <div key={b} className="mel-scroll">
                            <div className="mel-block" role="grid" aria-label={`Steps ${b * p.stepsPerRow + 1} to ${b * p.stepsPerRow + p.stepsPerRow}`} style={{ '--mel-cols': blockCols } as React.CSSProperties}>
                                <div className="mel-chords" style={{ gridTemplateColumns: cols }}>
                                    <span />
                                    {renderChordRibbon(from, to)}
                                </div>
                                {rows.map(row => (
                                    <div key={row.step} className="mel-row" role="row" style={{ gridTemplateColumns: cols }}>
                                        <span className={`mel-name ${row.tonic ? 'tonic' : ''}`}>{row.label}</span>
                                        {Array.from({ length: to - from }, (_, j) => {
                                            const c = from + j;
                                            const col = columns[c];
                                            const cover = covered.get(`${row.step}:${c}`);
                                            const tone = col ? (col.root === row.pc ? 'root' : col.pcs.has(row.pc) ? 'tone' : '') : '';
                                            const beat = Math.floor(c / p.perBeat);
                                            return (
                                                <button
                                                    key={c}
                                                    role="gridcell"
                                                    className={[
                                                        'mel-cell', tone,
                                                        c % barCols === 0 ? 'bar' : c % p.perBeat === 0 ? 'beat' : '',
                                                        beat % 2 ? 'alt' : '',
                                                        cover ? 'on' : '', cover?.head ? 'head' : '', cover?.tail ? 'tail' : '',
                                                        c === now ? 'now' : '',
                                                        c === p.cursor ? 'cursor' : '',
                                                    ].filter(Boolean).join(' ')}
                                                    aria-pressed={!!cover}
                                                    aria-label={`${row.label}, beat ${beat + 1}${c % p.perBeat ? `, 1/16 ${(c % p.perBeat) + 1}` : ''}`}
                                                    onClick={() => p.onTap(row.step, c, len)}
                                                />
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MelodyEditor;
