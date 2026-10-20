import React, { Component } from 'react';
import './EffectsPanel.css';
import { engine, FxName, FxState } from './audio/engine';

type EffectsPanelState = FxState;

/** UI only: all audio nodes and effect state live in the engine, so toggling the panel never touches the signal path. */
class EffectsPanel extends Component<{}, EffectsPanelState> {
    constructor(props: {}) {
        super(props);
        this.state = engine.fx.get();
    }

    private update = <N extends FxName>(name: N, params: Partial<FxState[N]>) => {
        engine.fx.set(name, params);
        this.setState(engine.fx.get());
    };

    handleReverbToggle = (enabled: boolean) => this.update('reverb', { enabled });
    handleReverbSizeChange = (decay: number) => this.update('reverb', { decay });
    handleReverbWetChange = (wet: number) => this.update('reverb', { wet });

    handleDelayToggle = (enabled: boolean) => this.update('delay', { enabled });
    handleDelayTimeChange = (time: string) => this.update('delay', { time });
    handleDelayFeedbackChange = (feedback: number) => this.update('delay', { feedback });
    handleDelayWetChange = (wet: number) => this.update('delay', { wet });

    handleChorusToggle = (enabled: boolean) => this.update('chorus', { enabled });
    handleChorusDepthChange = (depth: number) => this.update('chorus', { depth });
    handleChorusFrequencyChange = (frequency: number) => this.update('chorus', { frequency });
    handleChorusWetChange = (wet: number) => this.update('chorus', { wet });

    handleDistortionToggle = (enabled: boolean) => this.update('distortion', { enabled });
    handleDistortionAmountChange = (amount: number) => this.update('distortion', { amount });

    render() {
        const { reverb, delay, chorus, distortion } = this.state;
        const { enabled: reverbEnabled, decay: reverbSize, wet: reverbWet } = reverb;
        const { enabled: delayEnabled, time: delayTime, feedback: delayFeedback, wet: delayWet } = delay;
        const { enabled: chorusEnabled, depth: chorusDepth, frequency: chorusFrequency, wet: chorusWet } = chorus;
        const { enabled: distortionEnabled, amount: distortionAmount } = distortion;

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
