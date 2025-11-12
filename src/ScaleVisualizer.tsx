import React, { Component } from 'react';
import './ScaleVisualizer.css';
import { MusicalKey } from './ScalePicker';
import { getNoteInKey } from './chordUtils';

interface ScaleVisualizerProps {
    selectedKey: MusicalKey;
    lastPlayedNotes: string[];
}

class ScaleVisualizer extends Component<ScaleVisualizerProps> {
    // All 12 chromatic notes
    private chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // Scale degrees for major scale
    private scaleDegrees = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii'];

    getScaleNotes = (): string[] => {
        const { selectedKey } = this.props;
        const scaleNotes: string[] = [];

        for (let i = 0; i < 7; i++) {
            const note = getNoteInKey(selectedKey, i);
            scaleNotes.push(note);
        }

        return scaleNotes;
    };

    isNoteInScale = (note: string): boolean => {
        const scaleNotes = this.getScaleNotes();
        return scaleNotes.includes(note);
    };

    isNotePlaying = (note: string): boolean => {
        const { lastPlayedNotes } = this.props;
        return lastPlayedNotes.some(playedNote => {
            // Extract note name without octave number (e.g., "C4" -> "C", "C#5" -> "C#")
            const noteName = playedNote.replace(/\d+$/, '');
            return noteName === note;
        });
    };

    getScaleDegree = (note: string): string | null => {
        const scaleNotes = this.getScaleNotes();
        const index = scaleNotes.indexOf(note);
        return index >= 0 ? this.scaleDegrees[index] : null;
    };

    isBlackKey = (note: string): boolean => {
        return note.includes('#');
    };

    render() {
        const { selectedKey } = this.props;

        return (
            <div className="scale-visualizer">
                <h3 className="scale-viz-title">SCALE: {selectedKey} MAJOR</h3>

                <div className="piano-roll">
                    {this.chromaticNotes.map((note, index) => {
                        const inScale = this.isNoteInScale(note);
                        const isPlaying = this.isNotePlaying(note);
                        const scaleDegree = this.getScaleDegree(note);
                        const isBlack = this.isBlackKey(note);

                        return (
                            <div
                                key={index}
                                className={`piano-key ${isBlack ? 'black-key' : 'white-key'} ${inScale ? 'in-scale' : ''} ${isPlaying ? 'playing' : ''}`}
                                title={`${note}${scaleDegree ? ` (${scaleDegree})` : ''}`}
                            >
                                <span className="note-label">{note}</span>
                                {scaleDegree && <span className="degree-label">{scaleDegree}</span>}
                            </div>
                        );
                    })}
                </div>

                <div className="scale-legend">
                    <div className="legend-item">
                        <div className="legend-indicator in-scale-indicator"></div>
                        <span className="legend-text">In Scale</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-indicator playing-indicator"></div>
                        <span className="legend-text">Playing</span>
                    </div>
                </div>

                <div className="keyboard-hints">
                    <span className="hint-title">KEYBOARD:</span>
                    <span className="hint-text">1-7 = Scale Degrees</span>
                </div>
            </div>
        );
    }
}

export default ScaleVisualizer;
