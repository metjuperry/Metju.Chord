import React from 'react';
import './IntroScreen.css';

export type IntroPhase = 'idle' | 'leaving' | 'done';

interface IntroScreenProps {
    phase: IntroPhase;
    /** The chord that rings out as the intro fades, e.g. "Fmaj9". */
    chord: string;
    onStart: () => void;
}

/**
 * The first screen. Browsers only allow sound after a click, so this is that click, made into a
 * moment: the start key turns into a chord name, the chord rings out and the screen fades into the app.
 */
const IntroScreen: React.FC<IntroScreenProps> = ({ phase, chord, onStart }) => (
    <div className={`intro ${phase}`} aria-hidden={phase === 'leaving'}>
        <div className="intro-card">
            <span className="intro-logo">metju<span>.</span>chord</span>
            <button className="intro-key" onClick={onStart} disabled={phase !== 'idle'}>
                {phase === 'idle' ? (
                    <>
                        <span className="intro-key-top">Tap to start</span>
                        <span className="intro-key-sub">sound on</span>
                    </>
                ) : (
                    <span className="intro-chord">{chord}</span>
                )}
            </button>
            <span className="intro-note">Your browser needs a tap before it can play sound.</span>
        </div>
    </div>
);

export default IntroScreen;
