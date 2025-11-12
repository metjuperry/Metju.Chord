import React, { Component } from 'react';
import './ChordDisplay.css';

interface ChordDisplayProps {
    chordName: string;
    notes: string[];
}

interface ChordDisplayState {
    isPlaying: boolean;
}

class ChordDisplay extends Component<ChordDisplayProps, ChordDisplayState> {
    private animationTimeout: NodeJS.Timeout | null = null;

    constructor(props: ChordDisplayProps) {
        super(props);
        this.state = {
            isPlaying: false,
        };
    }

    componentDidUpdate(prevProps: ChordDisplayProps) {
        // Trigger animation when chord changes
        if (prevProps.chordName !== this.props.chordName && this.props.chordName) {
            this.setState({ isPlaying: true });

            // Clear existing timeout if any
            if (this.animationTimeout) {
                clearTimeout(this.animationTimeout);
            }

            // Remove the playing class after animation
            this.animationTimeout = setTimeout(() => {
                this.setState({ isPlaying: false });
            }, 400);
        }
    }

    componentWillUnmount() {
        if (this.animationTimeout) {
            clearTimeout(this.animationTimeout);
        }
    }

    render() {
        const { chordName, notes } = this.props;
        const { isPlaying } = this.state;

        return (
            <div className={`chord-display ${isPlaying ? 'playing' : ''}`}>
                <div className="chord-display-content">
                    {chordName ? (
                        <>
                            <div className="chord-label">NOW PLAYING</div>
                            <div className="chord-name">{chordName}</div>
                            <div className="chord-notes">{notes.join(' - ')}</div>
                        </>
                    ) : (
                        <div className="chord-placeholder">Play a chord...</div>
                    )}
                </div>
            </div>
        );
    }
}

export default ChordDisplay;