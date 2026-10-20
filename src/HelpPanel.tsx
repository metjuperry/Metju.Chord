import React, { Component } from 'react';
import './HelpPanel.css';

interface HelpPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

class HelpPanel extends Component<HelpPanelProps> {
    render() {
        const { isOpen, onClose } = this.props;

        return (
            <>
                {isOpen && <div className="help-overlay" onClick={onClose}></div>}

                <div className={`help-panel ${isOpen ? 'open' : ''}`}>
                    <div className="help-header">
                        <h2>HELP & DOCUMENTATION</h2>
                        <button className="close-button" onClick={onClose}>✕</button>
                    </div>

                    <div className="help-content">
                        <section className="help-section">
                            <h3>🎵 SCALE DEGREES</h3>
                            <p>The seven buttons represent the diatonic triads in your selected key:</p>
                            <ul>
                                <li><strong>I, IV, V</strong> - Major chords (uppercase Roman numerals)</li>
                                <li><strong>ii, iii, vi</strong> - Minor chords (lowercase Roman numerals)</li>
                                <li><strong>vii</strong> - Diminished chord</li>
                            </ul>
                        </section>

                        <section className="help-section">
                            <h3>🎹 CHORD GRID</h3>
                            <p>The joystick-style grid modifies the selected chord:</p>
                            <ul>
                                <li><strong>Triad</strong> - The diatonic triad (centre)</li>
                                <li><strong>Flip 3rd</strong> - The triad with its 3rd flipped, major to minor or minor to major</li>
                                <li><strong>7th</strong> - Dominant 7th built on the chord's root (a secondary dominant)</li>
                                <li><strong>maj7</strong> - Diatonic 7th chord</li>
                                <li><strong>add9</strong> - Diatonic 7th chord plus a major 9th</li>
                                <li><strong>sus4 / sus2/6</strong> - Suspended chords</li>
                                <li><strong>dim / aug</strong> - Diminished and augmented triads</li>
                            </ul>
                            <p>Try different positions while playing chords!</p>
                        </section>

                        <section className="help-section">
                            <h3>⚙️ SETTINGS</h3>
                            <ul>
                                <li><strong>Key</strong> - Select the musical key (C, D, E, F, G, A, B)</li>
                                <li><strong>Octave</strong> - Adjust pitch range (1-7)</li>
                                <li><strong>Synth Type</strong> - Choose an instrument: Pad, E-Piano, Organ, Pluck or Lead/Bass</li>
                                <li><strong>Play Mode</strong> - Switch between Chord and Arp (arpeggio)</li>
                                <li><strong>Inversion</strong> - Rearrange chord notes (up to one fewer than the number of notes in the chord)</li>
                            </ul>
                        </section>

                        <section className="help-section">
                            <h3>🎼 SEQUENCER</h3>
                            <p>Record and play back chord progressions:</p>
                            <ol>
                                <li>Click a slot to arm recording (red border)</li>
                                <li>Play a chord to record it</li>
                                <li>Click recorded slots to play them back</li>
                                <li>Use ⏮ ⏪ ⏩ to navigate slots</li>
                                <li>Right-click slots for copy/delete options</li>
                                <li>Use + / - to add or remove rows</li>
                            </ol>
                        </section>

                        <section className="help-section">
                            <h3>⏱️ METRONOME</h3>
                            <p>Keep time with an adjustable metronome:</p>
                            <ul>
                                <li>Set BPM (40-240)</li>
                                <li>Adjust beats per measure (2-12)</li>
                                <li>Visual beat indicator</li>
                                <li>Click ▶ to start, ⏸ to stop</li>
                            </ul>
                        </section>

                        <section className="help-section">
                            <h3>🎛️ ARP SETTINGS</h3>
                            <p>Customize arpeggiator behavior in Arp mode:</p>
                            <ul>
                                <li><strong>Pattern</strong> - Up, Down, Up-Down, or Random</li>
                                <li><strong>Speed</strong> - Time between notes (0.05s - 0.5s)</li>
                                <li><strong>Note Length</strong> - Duration of each note (0.1s - 2s)</li>
                            </ul>
                        </section>

                        <section className="help-section">
                            <h3>🎚️ EFFECTS CHAIN</h3>
                            <p>Add audio effects to shape your sound:</p>
                            <ul>
                                <li><strong>Reverb</strong> - Add space and ambience</li>
                                <li><strong>Delay</strong> - Create echoes</li>
                                <li><strong>Distortion</strong> - Add grit and harmonics</li>
                                <li><strong>Chorus</strong> - Thicken the sound</li>
                            </ul>
                            <p>Toggle effects on/off and adjust their parameters in real-time.</p>
                        </section>

                        <section className="help-section">
                            <h3>🎨 SCALE VISUALIZER</h3>
                            <p>Visual representation of your selected scale on a piano keyboard. Notes you play are highlighted, helping you understand scale degrees and chord composition.</p>
                        </section>

                        <section className="help-section">
                            <h3>⌨️ KEYBOARD SHORTCUTS</h3>
                            <ul>
                                <li><strong>1-7</strong> - Play scale degree chords</li>
                                <li><strong>Arrow Keys</strong> - Move chord grid position</li>
                                <li><strong>Space</strong> - Toggle metronome</li>
                            </ul>
                        </section>

                        <section className="help-section">
                            <h3>💡 TIPS</h3>
                            <ul>
                                <li>Try common progressions: I-V-vi-IV or ii-V-I</li>
                                <li>Use the sequencer to build progressions</li>
                                <li>Experiment with inversions for smoother voice leading</li>
                                <li>Combine effects for unique sounds</li>
                                <li>Hold buttons in Chord mode for sustained notes</li>
                            </ul>
                        </section>
                    </div>
                </div>
            </>
        );
    }
}

export default HelpPanel;
