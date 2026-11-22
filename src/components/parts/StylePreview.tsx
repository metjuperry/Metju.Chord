import React, { useMemo } from 'react';
import { BassPart, BassStyle, Harmony, bassNotes } from '../../parts';
import { PPQ } from '../../progression';

// ---- bass style previews ------------------------------------------------------------------------

// Preview material for the style buttons: a bar of C then a bar of F, with a four-on-the-floor kick
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
export const StylePreview: React.FC<{ style: BassStyle }> = ({ style }) => {
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
