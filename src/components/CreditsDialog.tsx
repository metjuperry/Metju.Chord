import React, { useRef } from 'react';
import { useDialog } from './useDialog';

/** The sample libraries' credits (CC BY asks for them). */
const CreditsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const box = useRef<HTMLDivElement>(null);
    useDialog(box, open, onClose);
    if (!open) return null;
    return (
        <div className="help-backdrop credits-backdrop" onClick={onClose}>
            <div ref={box} className="help-dialog panel credits" role="dialog" aria-modal="true" aria-labelledby="credits-title" onClick={e => e.stopPropagation()}>
                <div className="help-head">
                    <h2 id="credits-title">Credits</h2>
                    <button className="icon-button" aria-label="Close" onClick={onClose}>✕</button>
                </div>
                <p className="help-lead">The recorded instruments are freely licensed sample libraries. Thank you to:</p>
                <table className="help-table">
                    <thead>
                        <tr><th>Instrument</th><th>Samples</th><th>Licence</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Piano</td>
                            <td>Salamander Grand Piano V3 by Alexander Holm (via <a href="https://github.com/Tonejs/audio/tree/master/salamander" target="_blank" rel="noreferrer">Tonejs/audio</a>)</td>
                            <td><a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a></td>
                        </tr>
                        <tr>
                            <td>E-Piano, Celesta</td>
                            <td>FluidR3_GM soundfont by Frank Wen (rendered by <a href="https://github.com/gleitz/midi-js-soundfonts" target="_blank" rel="noreferrer">gleitz/midi-js-soundfonts</a>)</td>
                            <td><a href="https://creativecommons.org/licenses/by/3.0/us/" target="_blank" rel="noreferrer">CC BY 3.0</a></td>
                        </tr>
                        <tr>
                            <td>Strings, Organ, Brass, Marimba</td>
                            <td><a href="https://github.com/sgossner/VSCO-2-CE" target="_blank" rel="noreferrer">VSCO-2 Community Edition</a> by Versilian Studios (organ: Simon Dalzell / Ivy Audio)</td>
                            <td><a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0 1.0</a></td>
                        </tr>
                    </tbody>
                </table>
                <p className="section-note">The synths and the 808/909-style drum kit are made in the app with Tone.js.</p>
                <p className="section-note">
                    The Voice part's singers are measured (not sampled) from the long tones of{' '}
                    <a href="https://doi.org/10.5281/zenodo.1442513" target="_blank" rel="noreferrer">VocalSet: A Singing Voice Dataset</a>{' '}
                    by Julia Wilkins, Prem Seetharaman, Alison Wahl and Bryan Pardo (Northwestern University, 2018),{' '}
                    <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>:
                    each singer's voice colour and where each vowel's resonances sit. No recording is included.
                </p>
            </div>
        </div>
    );
};

export default CreditsDialog;
