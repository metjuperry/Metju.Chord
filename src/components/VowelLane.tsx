import React, { useRef, useState } from 'react';
import { VOWELS, VoicePart, Vowel, VowelClip, vowelClipsFromSteps, vowelPerChord, vowelSteps } from '../parts';
import { Clip } from '../progression';

/**
 * A Voice part's vowel lane: which vowel the singers sing where in the section, one cell per beat.
 * Pick a vowel (or "own", the part's vowel from Parts) and tap or drag across the beats to paint it;
 * neighbouring beats on the same vowel are one stretch. "Per chord" gives each chord its own vowel to
 * start from. The vowel changes glide as fast as Vowel glide in Parts says.
 */
interface VowelLaneProps {
    part: VoicePart;
    chords: Clip[];
    totalSteps: number;
    stepsPerRow: number;
    stepTicks: number;
    beatsPerBar: number;
    /** The step the playhead is on, or -1. */
    playStep: number;
    onChange: (vowels: VowelClip[]) => void;
}

/** What the brush paints: a vowel, or the part's own (clears the lane there). */
type Brush = Vowel | 'own';

const VowelLane: React.FC<VowelLaneProps> = ({ part, chords, totalSteps, stepsPerRow, stepTicks, beatsPerBar, playStep, onChange }) => {
    const [brush, setBrush] = useState<Brush>(part.vowel === 'a' ? 'o' : 'a');
    const steps = vowelSteps(part.vowels, totalSteps, stepTicks);
    const painting = useRef<(Vowel | null)[] | null>(null);

    const paint = (i: number) => {
        const cur = painting.current;
        if (!cur) return;
        const v = brush === 'own' ? null : brush;
        if (cur[i] === v) return;
        cur[i] = v;
        onChange(vowelClipsFromSteps(cur, stepTicks));
    };
    const down = (i: number) => (e: React.PointerEvent) => {
        e.preventDefault();
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        painting.current = [...steps];
        paint(i);
    };
    const enter = (i: number) => (e: React.PointerEvent) => {
        if (e.buttons & 1) paint(i);
    };
    const up = () => (painting.current = null);
    // keyboard: Enter/Space paints the focused beat
    const key = (i: number) => (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        painting.current = [...steps];
        paint(i);
        painting.current = null;
    };

    const rows: number[][] = [];
    for (let r = 0; r < totalSteps; r += stepsPerRow) rows.push(Array.from({ length: Math.min(stepsPerRow, totalSteps - r) }, (_, k) => r + k));
    const own = VOWELS.find(v => v.id === part.vowel)!;

    return (
        <div className="vowel-lane" style={{ '--track': part.color } as React.CSSProperties} onPointerUp={up} onPointerLeave={up}>
            <div className="part-head">
                <span className="sel-label">Vowels</span>
                <div className="segmented small-seg" role="group" aria-label="Vowel brush">
                    {VOWELS.map(v => (
                        <button key={v.id} aria-pressed={brush === v.id} title={`paint ${v.hint}`} onClick={() => setBrush(v.id)}>{v.label}</button>
                    ))}
                    <button aria-pressed={brush === 'own'} title={`back to the part's own vowel (${own.label}, set in Parts)`} onClick={() => setBrush('own')}>Own</button>
                </div>
                <button className="chip-button" title="a vowel for each chord of the chord row, to start from" onClick={() => onChange(vowelPerChord(chords))}>Per chord</button>
                <button className="chip-button" disabled={!part.vowels.length} title={`the whole section on ${own.label}`} onClick={() => onChange([])}>Clear</button>
            </div>
            <div className="vowel-rows" role="grid" aria-label={`${part.name} vowels`}>
                {rows.map(row => (
                    <div className="vowel-row" role="row" key={row[0]} style={{ gridTemplateColumns: `repeat(${stepsPerRow}, 1fr)` }}>
                        {row.map(i => {
                            const v = steps[i];
                            const startsStretch = i === 0 || steps[i - 1] !== v || i % stepsPerRow === 0;
                            return (
                                <button
                                    key={i}
                                    role="gridcell"
                                    className={`vowel-cell ${v ? 'set' : ''} ${i % beatsPerBar === 0 ? 'bar' : ''} ${i === playStep ? 'now' : ''}`}
                                    aria-label={`beat ${i + 1}: ${(VOWELS.find(x => x.id === (v ?? part.vowel)) ?? own).label}${v ? '' : ' (own)'}`}
                                    onPointerDown={down(i)}
                                    onPointerEnter={enter(i)}
                                    onKeyDown={key(i)}
                                >
                                    {startsStretch ? (VOWELS.find(x => x.id === (v ?? part.vowel)) ?? own).label : ''}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VowelLane;
