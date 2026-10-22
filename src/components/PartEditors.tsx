import React, { useMemo } from 'react';
import './PartEditors.css';
import { BASS_STYLES, BassPart, BassStyle, ChordPart, Harmony, bassNotes } from '../parts';
import { PPQ } from '../progression';
import { ChordStyle, ChordStyleControls } from './SoundPanel';

const Head: React.FC<{ name: string; color: string; note: string; children?: React.ReactNode }> = ({ name, color, note, children }) => (
    <div className="part-head">
        <span className="sel-label">
            <span className="track-dot" style={{ background: color }} />
            {name}
            <span className="section-note"> · {note}</span>
        </span>
        {children}
    </div>
);

/** A chord part: how it plays the song's chords. */
export const ChordPartEditor: React.FC<{ part: ChordPart; onChange: (patch: Partial<ChordStyle>) => void }> = ({ part, onChange }) => (
    <div className="part-editor" style={{ '--track': part.color } as React.CSSProperties}>
        <Head name={part.name} color={part.color} note="plays every chord in the chord row" />
        <div className="part-body chord-style">
            <ChordStyleControls style={part} onChange={onChange} />
        </div>
    </div>
);

// Preview material for the style cards: a bar of C then a bar of F, with a four-on-the-floor kick
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

/** A bass part: a rhythm over the chord roots, and how low it sits. */
export const BassEditor: React.FC<{
    part: BassPart;
    onChange: (patch: Partial<Pick<BassPart, 'style' | 'octave'>>) => void;
}> = ({ part, onChange }) => (
    <div className="part-editor" style={{ '--track': part.color } as React.CSSProperties}>
        <Head name={part.name} color={part.color} note="follows the roots of the chord row">
            <div className="segmented" role="group" aria-label="Bass octave">
                {[1, 2, 3].map(o => (
                    <button key={o} aria-pressed={part.octave === o} onClick={() => onChange({ octave: o })}>C{o}</button>
                ))}
            </div>
        </Head>
        <div className="bass-styles" role="radiogroup" aria-label="Bass style">
            {BASS_STYLES.map(s => (
                <button
                    key={s.id}
                    role="radio"
                    aria-checked={part.style === s.id}
                    className="style-card"
                    title={s.hint}
                    onClick={() => onChange({ style: s.id })}
                >
                    <StylePreview style={s.id} />
                    <span className="style-name">{s.label}</span>
                </button>
            ))}
        </div>
        <p className="section-note">{BASS_STYLES.find(s => s.id === part.style)?.label}: {BASS_STYLES.find(s => s.id === part.style)?.hint}.</p>
    </div>
);
