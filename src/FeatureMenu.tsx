import React, { Component } from 'react';
import './FeatureMenu.css';

interface FeatureMenuProps {
    isOpen: boolean;
    onToggle: () => void;
    showMetronome: boolean;
    showSequencer: boolean;
    showArpSettings: boolean;
    showEffects: boolean;
    showScaleViz: boolean;
    theme: 'dark' | 'light';
    onMetronomeToggle: (show: boolean) => void;
    onSequencerToggle: (show: boolean) => void;
    onArpSettingsToggle: (show: boolean) => void;
    onEffectsToggle: (show: boolean) => void;
    onScaleVizToggle: (show: boolean) => void;
    onThemeToggle: () => void;
    onHelpToggle: () => void;
}

class FeatureMenu extends Component<FeatureMenuProps> {
    render() {
        const { isOpen, onToggle, showMetronome, showSequencer, showArpSettings, showEffects, showScaleViz, theme, onMetronomeToggle, onSequencerToggle, onArpSettingsToggle, onEffectsToggle, onScaleVizToggle, onThemeToggle, onHelpToggle } = this.props;

        return (
            <>
                <button className="hamburger-button" onClick={onToggle} title="Toggle Features Menu" aria-label="Toggle Features Menu">
                    <div className="hamburger-line"></div>
                    <div className="hamburger-line"></div>
                    <div className="hamburger-line"></div>
                </button>

                <button className="help-button" onClick={onHelpToggle} title="Help & Documentation" aria-label="Help & Documentation">
                    ?
                </button>

                {isOpen && <div className="menu-overlay" onClick={onToggle}></div>}

                <div className={`feature-menu ${isOpen ? 'open' : ''}`}>
                    <div className="menu-header">
                        <h2>FEATURES</h2>
                        <button className="close-button" onClick={onToggle}>✕</button>
                    </div>

                    <div className="menu-content">
                        <div className="feature-toggle">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={showSequencer}
                                    onChange={(e) => onSequencerToggle(e.target.checked)}
                                />
                                <span className="toggle-label">SEQUENCER</span>
                            </label>
                        </div>

                        <div className="feature-toggle">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={showMetronome}
                                    onChange={(e) => onMetronomeToggle(e.target.checked)}
                                />
                                <span className="toggle-label">METRONOME</span>
                            </label>
                        </div>

                        <div className="feature-toggle">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={showArpSettings}
                                    onChange={(e) => onArpSettingsToggle(e.target.checked)}
                                />
                                <span className="toggle-label">ARP SETTINGS</span>
                            </label>
                        </div>

                        <div className="feature-toggle">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={showEffects}
                                    onChange={(e) => onEffectsToggle(e.target.checked)}
                                />
                                <span className="toggle-label">EFFECTS CHAIN</span>
                            </label>
                        </div>

                        <div className="feature-toggle">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={showScaleViz}
                                    onChange={(e) => onScaleVizToggle(e.target.checked)}
                                />
                                <span className="toggle-label">SCALE VISUALIZER</span>
                            </label>
                        </div>

                        <div className="theme-section">
                            <h3>THEME</h3>
                            <button
                                className="theme-toggle-menu"
                                onClick={onThemeToggle}
                                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                            >
                                {theme === 'dark' ? '☀ LIGHT MODE' : '☾ DARK MODE'}
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }
}

export default FeatureMenu;
