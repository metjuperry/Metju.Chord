import React, { Component } from 'react';
import * as Tone from 'tone';
import './NoteButton.css';

interface NoteButtonProps {
    notes: string[];  // Changed from single note to array of notes
    label?: string;
    synth: Tone.PolySynth | null;
    playMode: 'Chord' | 'Arp';
    arpPattern?: 'up' | 'down' | 'upDown' | 'random';
    arpSpeed?: number;
    noteLength?: number;
    onPlay?: (label: string) => void;
}

interface NoteButtonState {
    isPlaying: boolean;
    isHolding: boolean;
}

class NoteButton extends Component<NoteButtonProps, NoteButtonState> {
    private arpInterval: NodeJS.Timeout | null = null;
    private currentArpIndex: number = 0;
    private releaseTimeout: NodeJS.Timeout | null = null;

    constructor(props: NoteButtonProps) {
        super(props);
        this.state = {
            isPlaying: false,
            isHolding: false,
        };
    }

    componentWillUnmount() {
        this.stopNote();
    }

    getArpeggiatedNotes = () => {
        const { notes, arpPattern = 'up' } = this.props;

        switch (arpPattern) {
            case 'down':
                return [...notes].reverse();
            case 'upDown':
                return [...notes, ...notes.slice(0, -1).reverse()];
            case 'random':
                return [...notes].sort(() => Math.random() - 0.5);
            case 'up':
            default:
                return notes;
        }
    };

    handleMouseDown = async () => {
        if (!this.props.synth) return;

        try {
            await Tone.start();

            const { notes, label, onPlay, playMode, arpSpeed = 0.1, noteLength = 0.5 } = this.props;

            this.setState({ isPlaying: true, isHolding: true });

            if (onPlay && label) {
                onPlay(label);
            }

            if (playMode === 'Arp') {
                // Start arpeggiator
                const arpNotes = this.getArpeggiatedNotes();
                this.currentArpIndex = 0;

                // Play first note immediately
                this.props.synth.triggerAttackRelease(arpNotes[0], noteLength);

                // Continue arpeggiating
                this.arpInterval = setInterval(() => {
                    if (!this.state.isHolding) {
                        this.stopArpeggiator();
                        return;
                    }

                    this.currentArpIndex = (this.currentArpIndex + 1) % arpNotes.length;
                    this.props.synth?.triggerAttackRelease(arpNotes[this.currentArpIndex], noteLength);
                }, arpSpeed * 1000);
            } else {
                // Chord: play all notes at once and sustain
                this.props.synth.triggerAttack(notes);
            }
        } catch (error) {
            console.error('Error playing note:', error);
            this.setState({ isPlaying: false, isHolding: false });
        }
    };

    handleMouseUp = () => {
        const { playMode } = this.props;

        if (playMode === 'Chord' && this.props.synth && this.state.isHolding) {
            // Release the chord
            this.props.synth.triggerRelease(this.props.notes);
        }

        this.stopNote();
    };

    handleMouseLeave = () => {
        // Only stop if we're holding
        if (this.state.isHolding) {
            this.handleMouseUp();
        }
    };

    stopArpeggiator = () => {
        if (this.arpInterval) {
            clearInterval(this.arpInterval);
            this.arpInterval = null;
        }
    };

    stopNote = () => {
        this.stopArpeggiator();

        this.setState({ isHolding: false });

        // Delay resetting isPlaying for visual feedback
        this.releaseTimeout = setTimeout(() => {
            this.setState({ isPlaying: false });
        }, 100);
    };

    render() {
        const { label, notes } = this.props;
        const { isPlaying } = this.state;

        return (
            <button
                className={`note-button ${isPlaying ? 'playing' : ''}`}
                onMouseDown={this.handleMouseDown}
                onMouseUp={this.handleMouseUp}
                onMouseLeave={this.handleMouseLeave}
                onTouchStart={this.handleMouseDown}
                onTouchEnd={this.handleMouseUp}
            >
                {label || notes[0]}
            </button>
        );
    }
}

export default NoteButton;
