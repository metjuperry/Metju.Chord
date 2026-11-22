import React from 'react';
import { VoicePart } from '../../parts';
import { Own } from './Own';

/** The Voice part: what it sings (its own notes or the chords) and in which octave. */
export const VoiceBlock: React.FC<{ part: VoicePart; onUpdate: (patch: Partial<VoicePart>) => void }> = ({ part, onUpdate }) => (
        <div className="pd-block voice-block">
            <span className="pd-label">Sings</span>
            <div className="pd-style voice-row">
                <div className="segmented small-seg" role="group" aria-label="Sings">
                    <button aria-pressed={part.sings === 'chords'} title="the chord row, like a chord part" onClick={() => onUpdate({ sings: 'chords' })}>Chords<Own k="sings" when={part.sings === 'chords'} /></button>
                    <button aria-pressed={part.sings === 'notes'} title="its own notes: play them on the keys in Notes mode, or write them in Song" onClick={() => onUpdate({ sings: 'notes' })}>Notes<Own k="sings" when={part.sings === 'notes'} /></button>
                </div>
                <div className="segmented small-seg" role="group" aria-label="Octave">
                    {[2, 3, 4, 5].map(o => (
                        <button key={o} aria-pressed={part.octave === o} onClick={() => onUpdate({ octave: o })}>C{o}<Own k="octave" when={part.octave === o} /></button>
                    ))}
                </div>
            </div>
            <p className="section-note pd-hint">
                {part.sings === 'notes'
                    ? 'Sings its own notes: switch the pads to Notes to sing them live, or write them in Song.'
                    : 'Sings every chord in the chord row.'}
            </p>
        </div>
);
