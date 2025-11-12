import React, { Component } from 'react';
import './EffectsPanel.css';
import * as Tone from 'tone';

interface EffectsPanelProps {
    synth: Tone.PolySynth | null;
}

interface EffectsPanelState {
    reverbEnabled: boolean;
    reverbSize: number;
    reverbWet: number;
    delayEnabled: boolean;
    delayTime: string;
    delayFeedback: number;
    delayWet: number;
    chorusEnabled: boolean;
    chorusDepth: number;
    chorusFrequency: number;
    chorusWet: number;
    distortionEnabled: boolean;
    distortionAmount: number;
}

class EffectsPanel extends Component<EffectsPanelProps, EffectsPanelState> {
    private reverb: Tone.Reverb | null = null;
    private delay: Tone.FeedbackDelay | null = null;
    private chorus: Tone.Chorus | null = null;
    private distortion: Tone.Distortion | null = null;

    constructor(props: EffectsPanelProps) {
        super(props);
        this.state = {
            reverbEnabled: false,
            reverbSize: 1.5,
            reverbWet: 0.3,
            delayEnabled: false,
            delayTime: '8n',
            delayFeedback: 0.3,
            delayWet: 0.3,
            chorusEnabled: false,
            chorusDepth: 0.5,
            chorusFrequency: 4,
            chorusWet: 0.5,
            distortionEnabled: false,
            distortionAmount: 0.4,
        };
    }

    componentDidMount() {
        this.initializeEffects();
    }

    componentDidUpdate(prevProps: EffectsPanelProps) {
        if (prevProps.synth !== this.props.synth) {
            this.reconnectEffects();
        }
    }

    componentWillUnmount() {
        this.disposeEffects();
    }

    initializeEffects = () => {
        // Create effects
        this.reverb = new Tone.Reverb(this.state.reverbSize);
        this.delay = new Tone.FeedbackDelay(this.state.delayTime, this.state.delayFeedback);
        this.chorus = new Tone.Chorus(this.state.chorusFrequency, 2.5, this.state.chorusDepth);
        this.distortion = new Tone.Distortion(this.state.distortionAmount);

        // Set initial wet/dry
        this.reverb.wet.value = 0;
        this.delay.wet.value = 0;
        this.chorus.wet.value = 0;
        this.distortion.wet.value = 0;

        // Start chorus (it needs to be started)
        this.chorus.start();

        this.reconnectEffects();
    };

    reconnectEffects = () => {
        const { synth } = this.props;

        if (!synth || !this.reverb || !this.delay || !this.chorus || !this.distortion) return;

        // Disconnect synth from destination
        synth.disconnect();

        // Chain: synth → distortion → chorus → delay → reverb → destination
        synth.chain(this.distortion, this.chorus, this.delay, this.reverb, Tone.Destination);
    };

    disposeEffects = () => {
        if (this.reverb) this.reverb.dispose();
        if (this.delay) this.delay.dispose();
        if (this.chorus) this.chorus.dispose();
        if (this.distortion) this.distortion.dispose();
    };

    handleReverbToggle = (enabled: boolean) => {
        this.setState({ reverbEnabled: enabled });
        if (this.reverb) {
            this.reverb.wet.value = enabled ? this.state.reverbWet : 0;
        }
    };

    handleReverbSizeChange = (size: number) => {
        this.setState({ reverbSize: size });
        if (this.reverb) {
            this.reverb.decay = size;
        }
    };

    handleReverbWetChange = (wet: number) => {
        this.setState({ reverbWet: wet });
        if (this.reverb && this.state.reverbEnabled) {
            this.reverb.wet.value = wet;
        }
    };

    handleDelayToggle = (enabled: boolean) => {
        this.setState({ delayEnabled: enabled });
        if (this.delay) {
            this.delay.wet.value = enabled ? this.state.delayWet : 0;
        }
    };

    handleDelayTimeChange = (time: string) => {
        this.setState({ delayTime: time });
        if (this.delay) {
            this.delay.delayTime.value = time;
        }
    };

    handleDelayFeedbackChange = (feedback: number) => {
        this.setState({ delayFeedback: feedback });
        if (this.delay) {
            this.delay.feedback.value = feedback;
        }
    };

    handleDelayWetChange = (wet: number) => {
        this.setState({ delayWet: wet });
        if (this.delay && this.state.delayEnabled) {
            this.delay.wet.value = wet;
        }
    };

    handleChorusToggle = (enabled: boolean) => {
        this.setState({ chorusEnabled: enabled });
        if (this.chorus) {
            this.chorus.wet.value = enabled ? this.state.chorusWet : 0;
        }
    };

    handleChorusDepthChange = (depth: number) => {
        this.setState({ chorusDepth: depth });
        if (this.chorus) {
            this.chorus.depth = depth;
        }
    };

    handleChorusFrequencyChange = (frequency: number) => {
        this.setState({ chorusFrequency: frequency });
        if (this.chorus) {
            this.chorus.frequency.value = frequency;
        }
    };

    handleChorusWetChange = (wet: number) => {
        this.setState({ chorusWet: wet });
        if (this.chorus && this.state.chorusEnabled) {
            this.chorus.wet.value = wet;
        }
    };

    handleDistortionToggle = (enabled: boolean) => {
        this.setState({ distortionEnabled: enabled });
        if (this.distortion) {
            this.distortion.wet.value = enabled ? 1 : 0;
        }
    };

    handleDistortionAmountChange = (amount: number) => {
        this.setState({ distortionAmount: amount });
        if (this.distortion) {
            this.distortion.distortion = amount;
        }
    };

    render() {
        const {
            reverbEnabled,
            reverbSize,
            reverbWet,
            delayEnabled,
            delayTime,
            delayFeedback,
            delayWet,
            chorusEnabled,
            chorusDepth,
            chorusFrequency,
            chorusWet,
            distortionEnabled,
            distortionAmount,
        } = this.state;

        return (
            <div className="effects-panel">
                <h3 className="effects-title">EFFECTS CHAIN</h3>

                {/* Reverb */}
                <div className="effect-section">
                    <div className="effect-header">
                        <label className="effect-toggle">
                            <input
                                type="checkbox"
                                checked={reverbEnabled}
                                onChange={(e) => this.handleReverbToggle(e.target.checked)}
                            />
                            <span className="effect-name">REVERB</span>
                        </label>
                    </div>
                    {reverbEnabled && (
                        <div className="effect-controls">
                            <div className="control-group">
                                <label className="control-label">Size</label>
                                <input
                                    type="range"
                                    className="effect-slider"
                                    min="0.1"
                                    max="5"
                                    step="0.1"
                                    value={reverbSize}
                                    onChange={(e) => this.handleReverbSizeChange(parseFloat(e.target.value))}
                                />
                                <span className="control-value">{reverbSize.toFixed(1)}s</span>
                            </div>
                            <div className="control-group">
                                <label className="control-label">Mix</label>
                                <input
                                    type="range"
                                    className="effect-slider"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={reverbWet}
                                    onChange={(e) => this.handleReverbWetChange(parseFloat(e.target.value))}
                                />
                                <span className="control-value">{Math.round(reverbWet * 100)}%</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Delay */}
                <div className="effect-section">
                    <div className="effect-header">
                        <label className="effect-toggle">
                            <input
                                type="checkbox"
                                checked={delayEnabled}
                                onChange={(e) => this.handleDelayToggle(e.target.checked)}
                            />
                            <span className="effect-name">DELAY</span>
                        </label>
                    </div>
                    {delayEnabled && (
                        <div className="effect-controls">
                            <div className="control-group">
                                <label className="control-label">Time</label>
                                <select
                                    className="effect-select"
                                    value={delayTime}
                                    onChange={(e) => this.handleDelayTimeChange(e.target.value)}
                                >
                                    <option value="16n">1/16</option>
                                    <option value="8n">1/8</option>
                                    <option value="4n">1/4</option>
                                    <option value="2n">1/2</option>
                                </select>
                            </div>
                            <div className="control-group">
                                <label className="control-label">Feedback</label>
                                <input
                                    type="range"
                                    className="effect-slider"
                                    min="0"
                                    max="0.9"
                                    step="0.05"
                                    value={delayFeedback}
                                    onChange={(e) => this.handleDelayFeedbackChange(parseFloat(e.target.value))}
                                />
                                <span className="control-value">{Math.round(delayFeedback * 100)}%</span>
                            </div>
                            <div className="control-group">
                                <label className="control-label">Mix</label>
                                <input
                                    type="range"
                                    className="effect-slider"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={delayWet}
                                    onChange={(e) => this.handleDelayWetChange(parseFloat(e.target.value))}
                                />
                                <span className="control-value">{Math.round(delayWet * 100)}%</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Chorus */}
                <div className="effect-section">
                    <div className="effect-header">
                        <label className="effect-toggle">
                            <input
                                type="checkbox"
                                checked={chorusEnabled}
                                onChange={(e) => this.handleChorusToggle(e.target.checked)}
                            />
                            <span className="effect-name">CHORUS</span>
                        </label>
                    </div>
                    {chorusEnabled && (
                        <div className="effect-controls">
                            <div className="control-group">
                                <label className="control-label">Depth</label>
                                <input
                                    type="range"
                                    className="effect-slider"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={chorusDepth}
                                    onChange={(e) => this.handleChorusDepthChange(parseFloat(e.target.value))}
                                />
                                <span className="control-value">{Math.round(chorusDepth * 100)}%</span>
                            </div>
                            <div className="control-group">
                                <label className="control-label">Rate</label>
                                <input
                                    type="range"
                                    className="effect-slider"
                                    min="0.5"
                                    max="10"
                                    step="0.5"
                                    value={chorusFrequency}
                                    onChange={(e) => this.handleChorusFrequencyChange(parseFloat(e.target.value))}
                                />
                                <span className="control-value">{chorusFrequency.toFixed(1)}Hz</span>
                            </div>
                            <div className="control-group">
                                <label className="control-label">Mix</label>
                                <input
                                    type="range"
                                    className="effect-slider"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={chorusWet}
                                    onChange={(e) => this.handleChorusWetChange(parseFloat(e.target.value))}
                                />
                                <span className="control-value">{Math.round(chorusWet * 100)}%</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Distortion */}
                <div className="effect-section">
                    <div className="effect-header">
                        <label className="effect-toggle">
                            <input
                                type="checkbox"
                                checked={distortionEnabled}
                                onChange={(e) => this.handleDistortionToggle(e.target.checked)}
                            />
                            <span className="effect-name">DISTORTION</span>
                        </label>
                    </div>
                    {distortionEnabled && (
                        <div className="effect-controls">
                            <div className="control-group">
                                <label className="control-label">Amount</label>
                                <input
                                    type="range"
                                    className="effect-slider"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={distortionAmount}
                                    onChange={(e) => this.handleDistortionAmountChange(parseFloat(e.target.value))}
                                />
                                <span className="control-value">{Math.round(distortionAmount * 100)}%</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

export default EffectsPanel;
