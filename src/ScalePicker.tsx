import React, { Component } from 'react';
import './ScalePicker.css';

export type MusicalKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

interface ScalePickerProps {
    selectedKey?: MusicalKey;
    octave?: number;
    onKeyChange?: (key: MusicalKey) => void;
    onOctaveChange?: (octave: number) => void;
}

interface ScalePickerState {
    selectedKey: MusicalKey;
    octave: number;
}

class ScalePicker extends Component<ScalePickerProps, ScalePickerState> {
    private keys: MusicalKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    constructor(props: ScalePickerProps) {
        super(props);
        this.state = {
            selectedKey: props.selectedKey || 'C',
            octave: props.octave || 4,
        };
    }

    handleKeyChange = (key: MusicalKey) => {
        this.setState({ selectedKey: key });
        if (this.props.onKeyChange) {
            this.props.onKeyChange(key);
        }
    };

    handleOctaveChange = (change: number) => {
        const newOctave = Math.max(2, Math.min(6, this.state.octave + change));
        this.setState({ octave: newOctave });
        if (this.props.onOctaveChange) {
            this.props.onOctaveChange(newOctave);
        }
    };

    render() {
        const { selectedKey, octave } = this.state;

        return (
            <div className="scale-picker-container">
                <div className="picker-group">
                    <label className="scale-picker-label" htmlFor="key-select">Key</label>
                    <select
                        id="key-select"
                        className="scale-picker-select"
                        value={selectedKey}
                        onChange={(e) => this.handleKeyChange(e.target.value as MusicalKey)}
                    >
                        {this.keys.map((key) => (
                            <option key={key} value={key}>
                                {key}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="picker-group">
                    <label className="scale-picker-label">Octave</label>
                    <div className="octave-controls">
                        <button
                            className="octave-button"
                            onClick={() => this.handleOctaveChange(-1)}
                            disabled={octave <= 2}
                        >
                            −
                        </button>
                        <span className="octave-display">{octave === 4 ? '0' : (octave > 4 ? `+${octave - 4}` : `${octave - 4}`)}</span>
                        <button
                            className="octave-button"
                            onClick={() => this.handleOctaveChange(1)}
                            disabled={octave >= 6}
                        >
                            +
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ScalePicker;
