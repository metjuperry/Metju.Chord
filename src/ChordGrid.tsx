import React, { Component } from 'react';
import './ChordGrid.css';

export type JoystickPosition = 'neutral' | 'maj/min' | 'dim' | 'aug' | '7' | 'maj/min7' | 'sus4' | 'sus2/maj6' | 'maj/min9';

interface ChordGridProps {
    onChordChange: (position: JoystickPosition) => void;
}

interface ChordGridState {
    selectedPosition: JoystickPosition;
}

class ChordGrid extends Component<ChordGridProps, ChordGridState> {
    private chordButtons: { label: string; position: JoystickPosition }[][] = [
        [
            { label: 'sus4', position: 'sus4' },
            { label: 'min/maj', position: 'maj/min' },
            { label: 'add9', position: 'maj/min9' }
        ],
        [
            { label: '7th', position: '7' },
            { label: 'neutral', position: 'neutral' },
            { label: 'maj7', position: 'maj/min7' }
        ],
        [
            { label: 'dim', position: 'dim' },
            { label: 'aug', position: 'aug' },
            { label: 'sus2/6', position: 'sus2/maj6' }
        ]
    ];

    constructor(props: ChordGridProps) {
        super(props);
        this.state = {
            selectedPosition: 'neutral'
        };
    }

    handleButtonClick = (position: JoystickPosition) => {
        this.setState({ selectedPosition: position });
        this.props.onChordChange(position);
    };

    render() {
        const { selectedPosition } = this.state;

        return (
            <div className="chord-grid-container">
                <h3 className="chord-grid-title">CHORD MODES</h3>
                <div className="chord-grid">
                    {this.chordButtons.map((row, rowIndex) => (
                        <div key={rowIndex} className="chord-grid-row">
                            {row.map((button, colIndex) => (
                                <button
                                    key={`${rowIndex}-${colIndex}`}
                                    className={`chord-grid-button ${selectedPosition === button.position ? 'active' : ''}`}
                                    onClick={() => this.handleButtonClick(button.position)}
                                >
                                    {button.label}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}

export default ChordGrid;
