import React, { Component } from 'react';
import './SettingsPanel.css';
import { MusicalKey } from './ScalePicker';

type SynthType = 'Synth' | 'AMSynth' | 'FMSynth' | 'MonoSynth' | 'MembraneSynth';
type PlayMode = 'Chord' | 'Arp';
type ArpPattern = 'up' | 'down' | 'upDown' | 'random';

interface SettingsPanelProps {
    selectedKey: MusicalKey;
    octave: number;
    synthType: SynthType;
    playMode: PlayMode;
    inversion: number;
    arpPattern: ArpPattern;
    arpSpeed: number;
    noteLength: number;
    showArpSettings: boolean;
    onKeyChange: (key: MusicalKey) => void;
    onOctaveChange: (octave: number) => void;
    onSynthChange: (synth: SynthType) => void;
    onPlayModeChange: (mode: PlayMode) => void;
    onInversionChange: (change: number) => void;
    onArpPatternChange: (pattern: ArpPattern) => void;
    onArpSpeedChange: (speed: number) => void;
    onNoteLengthChange: (length: number) => void;
}

class SettingsPanel extends Component<SettingsPanelProps> {
    private readonly keys: MusicalKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    handleOctaveChange = (delta: number) => {
        const { octave } = this.props;
        const newOctave = Math.max(2, Math.min(6, octave + delta));
        this.props.onOctaveChange(newOctave);
    };

    render() {
        const { selectedKey, octave, synthType, playMode, inversion, arpPattern, arpSpeed, noteLength, showArpSettings } = this.props;

        return (
            <div className="settings-panel-wrapper">
                <div className="settings-panel">
                    <div className="settings-section settings-column">
                        <div className="setting-group">
                            <label className="setting-label" htmlFor="key-select">Key</label>
                            <select
                                id="key-select"
                                className="setting-select"
                                value={selectedKey}
                                onChange={(e) => this.props.onKeyChange(e.target.value as MusicalKey)}
                            >
                                {this.keys.map((key) => (
                                    <option key={key} value={key}>
                                        {key}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="setting-group">
                            <label className="setting-label">Octave</label>
                            <div className="octave-controls">
                                <button
                                    className="inversion-button"
                                    onClick={() => this.handleOctaveChange(-1)}
                                    disabled={octave <= 2}
                                >
                                    −
                                </button>
                                <span className="octave-display">{octave === 4 ? '0' : (octave > 4 ? `+${octave - 4}` : `${octave - 4}`)}</span>
                                <button
                                    className="inversion-button"
                                    onClick={() => this.handleOctaveChange(1)}
                                    disabled={octave >= 6}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="settings-section settings-column">
                        <div className="settings-row">
                            <div className="setting-group">
                                <label className="setting-label">Synth</label>
                                <select
                                    className="setting-select"
                                    value={synthType}
                                    onChange={(e) => this.props.onSynthChange(e.target.value as SynthType)}
                                    title="Synthesizer Type"
                                >
                                    <option value="Synth">Basic</option>
                                    <option value="AMSynth">AM Synth</option>
                                    <option value="FMSynth">FM Synth</option>
                                    <option value="MonoSynth">Mono</option>
                                    <option value="MembraneSynth">Membrane</option>
                                </select>
                            </div>
                        </div>

                        <div className="settings-row">
                            <div className="setting-group">
                                <label className="setting-label">Inversion</label>
                                <div className="inversion-controls">
                                    <button
                                        className="inversion-button"
                                        onClick={() => this.props.onInversionChange(-1)}
                                        disabled={inversion <= 0}
                                    >
                                        −
                                    </button>
                                    <span className="inversion-display">
                                        {inversion === 0 ? 'Root' : `${inversion}${inversion === 1 ? 'st' : 'nd'}`}
                                    </span>
                                    <button
                                        className="inversion-button"
                                        onClick={() => this.props.onInversionChange(1)}
                                        disabled={inversion >= 2}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="settings-section settings-column">
                        <div className="settings-row">
                            <div className="setting-group">
                                <label className="setting-label">Mode</label>
                                <div className="mode-toggle">
                                    <button
                                        className={`mode-button ${playMode === 'Chord' ? 'active' : ''}`}
                                        onClick={() => this.props.onPlayModeChange('Chord')}
                                    >
                                        Chord
                                    </button>
                                    <button
                                        className={`mode-button ${playMode === 'Arp' ? 'active' : ''}`}
                                        onClick={() => this.props.onPlayModeChange('Arp')}
                                    >
                                        Arp
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {playMode === 'Arp' && showArpSettings && (
                    <div className="arp-settings">
                        <h3 className="arp-settings-title">ARPEGGIATOR</h3>
                        <div className="setting-group">
                            <label className="setting-label">Pattern</label>
                            <select
                                className="setting-select"
                                value={arpPattern}
                                onChange={(e) => this.props.onArpPatternChange(e.target.value as ArpPattern)}
                                title="Arpeggiator Pattern"
                            >
                                <option value="up">Up</option>
                                <option value="down">Down</option>
                                <option value="upDown">Up-Down</option>
                                <option value="random">Random</option>
                            </select>
                        </div>

                        <div className="setting-group">
                            <label className="setting-label">Speed</label>
                            <div className="slider-control">
                                <input
                                    type="range"
                                    className="setting-slider"
                                    min="0.05"
                                    max="0.5"
                                    step="0.05"
                                    value={arpSpeed}
                                    onChange={(e) => this.props.onArpSpeedChange(parseFloat(e.target.value))}
                                    title="Arpeggiator Speed"
                                />
                                <span className="slider-value">{(arpSpeed * 1000).toFixed(0)}ms</span>
                            </div>
                        </div>

                        <div className="setting-group">
                            <label className="setting-label">Length</label>
                            <div className="slider-control">
                                <input
                                    type="range"
                                    className="setting-slider"
                                    min="0.1"
                                    max="2.0"
                                    step="0.1"
                                    value={noteLength}
                                    onChange={(e) => this.props.onNoteLengthChange(parseFloat(e.target.value))}
                                    title="Note Length"
                                />
                                <span className="slider-value">{noteLength.toFixed(1)}s</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

export default SettingsPanel;
