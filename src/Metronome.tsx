import React, { Component } from 'react';
import * as Tone from 'tone';
import './Metronome.css';

interface MetronomeProps {
    bpm: number;
    onBpmChange: (bpm: number) => void;
}

interface MetronomeState {
    isPlaying: boolean;
    currentBeat: number;
    beatsPerMeasure: number;
}

class Metronome extends Component<MetronomeProps, MetronomeState> {
    private metronomeLoop: Tone.Loop | null = null;
    private clickSynth: Tone.MembraneSynth | null = null;

    constructor(props: MetronomeProps) {
        super(props);
        this.state = {
            isPlaying: false,
            currentBeat: 0,
            beatsPerMeasure: 4,
        };
    }

    componentDidMount() {
        // Create a simple click sound
        this.clickSynth = new Tone.MembraneSynth({
            pitchDecay: 0.008,
            octaves: 2,
            envelope: {
                attack: 0.001,
                decay: 0.1,
                sustain: 0,
                release: 0.1
            }
        }).toDestination();
    }

    componentWillUnmount() {
        this.stop();
        if (this.clickSynth) {
            this.clickSynth.dispose();
        }
    }

    start = async () => {
        await Tone.start();

        const { bpm } = this.props;
        const { beatsPerMeasure } = this.state;

        if (this.metronomeLoop) {
            this.metronomeLoop.dispose();
        }

        let beat = 0;

        this.metronomeLoop = new Tone.Loop((time) => {
            // Accent on downbeat
            const note = beat % beatsPerMeasure === 0 ? 'C5' : 'C4';
            this.clickSynth?.triggerAttackRelease(note, '32n', time);

            // Update UI on main thread
            Tone.getDraw().schedule(() => {
                this.setState({ currentBeat: beat % beatsPerMeasure });
            }, time);

            beat++;
        }, '4n').start(0);

        Tone.getTransport().bpm.value = bpm;
        Tone.getTransport().start();

        this.setState({ isPlaying: true, currentBeat: 0 });
    };

    stop = () => {
        if (this.metronomeLoop) {
            this.metronomeLoop.stop();
            this.metronomeLoop.dispose();
            this.metronomeLoop = null;
        }
        Tone.getTransport().stop();
        this.setState({ isPlaying: false, currentBeat: 0 });
    };

    toggle = () => {
        if (this.state.isPlaying) {
            this.stop();
        } else {
            this.start();
        }
    };

    adjustBpm = (delta: number) => {
        const newBpm = Math.max(40, Math.min(240, this.props.bpm + delta));
        this.props.onBpmChange(newBpm);

        if (this.state.isPlaying) {
            Tone.getTransport().bpm.value = newBpm;
        }
    };

    changeTimeSignature = (beats: number) => {
        this.setState({ beatsPerMeasure: beats });
    };

    render() {
        const { bpm } = this.props;
        const { isPlaying, currentBeat, beatsPerMeasure } = this.state;

        return (
            <div className="metronome">
                <div className="metronome-header">
                    <h4>METRONOME</h4>
                </div>

                <div className="metronome-display">
                    <div className="beat-indicators">
                        {Array.from({ length: beatsPerMeasure }, (_, i) => (
                            <div
                                key={i}
                                className={`beat-indicator ${i === currentBeat && isPlaying ? 'active' : ''} ${i === 0 ? 'accent' : ''}`}
                            />
                        ))}
                    </div>
                </div>

                <div className="metronome-controls">
                    <div className="bpm-control">
                        <button className="bpm-button" onClick={() => this.adjustBpm(-5)}>−</button>
                        <div className="bpm-display">
                            <span className="bpm-value">{bpm}</span>
                            <span className="bpm-label">BPM</span>
                        </div>
                        <button className="bpm-button" onClick={() => this.adjustBpm(5)}>+</button>
                    </div>

                    <button
                        className={`metro-play-button ${isPlaying ? 'active' : ''}`}
                        onClick={this.toggle}
                    >
                        {isPlaying ? '■' : '▶'}
                    </button>

                    <div className="time-signature">
                        <select
                            className="time-sig-select"
                            value={beatsPerMeasure}
                            onChange={(e) => this.changeTimeSignature(parseInt(e.target.value))}
                            title="Time Signature"
                        >
                            <option value="3">3/4</option>
                            <option value="4">4/4</option>
                            <option value="5">5/4</option>
                            <option value="6">6/8</option>
                        </select>
                    </div>
                </div>
            </div>
        );
    }
}

export default Metronome;
