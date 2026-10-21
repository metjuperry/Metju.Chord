import React from 'react';
import './PartEditors.css';
import { BASS_STYLES, BassPart, ChordPart } from '../parts';
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

/** A bass part: a rhythm over the chord roots, and how low it sits. */
export const BassEditor: React.FC<{
    part: BassPart;
    onChange: (patch: Partial<Pick<BassPart, 'style' | 'octave'>>) => void;
}> = ({ part, onChange }) => (
    <div className="part-editor" style={{ '--track': part.color } as React.CSSProperties}>
        <Head name={part.name} color={part.color} note="follows the roots of the chord row" />
        <div className="part-body">
            <div className="sound-row">
                <span>Style</span>
                <div className="segmented" role="group" aria-label="Bass style">
                    {BASS_STYLES.map(s => (
                        <button key={s.id} aria-pressed={part.style === s.id} title={s.hint} onClick={() => onChange({ style: s.id })}>{s.label}</button>
                    ))}
                </div>
            </div>
            <div className="sound-row">
                <span>Octave</span>
                <div className="segmented" role="group" aria-label="Bass octave">
                    {[1, 2, 3].map(o => (
                        <button key={o} aria-pressed={part.octave === o} onClick={() => onChange({ octave: o })}>C{o}</button>
                    ))}
                </div>
            </div>
            <p className="section-note">{BASS_STYLES.find(s => s.id === part.style)?.hint}.</p>
        </div>
    </div>
);
