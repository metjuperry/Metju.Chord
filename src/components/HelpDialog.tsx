import React, { useEffect, useRef } from 'react';
import './HelpDialog.css';
import { STICK_LABELS, StickDir } from '../theory';

interface HelpDialogProps {
    open: boolean;
    onClose: () => void;
}

const STICK_HELP: { dir: StickDir; key: string; major: string; minor: string }[] = [
    { dir: 'C', key: 'S / none', major: 'C', minor: 'Dm' },
    { dir: 'U', key: 'W', major: 'Cm', minor: 'D' },
    { dir: 'UR', key: 'E', major: 'C7', minor: 'D7' },
    { dir: 'R', key: 'D', major: 'Cmaj7', minor: 'Dm7' },
    { dir: 'DR', key: 'C', major: 'Cmaj9', minor: 'Dm9' },
    { dir: 'D', key: 'X', major: 'Csus4', minor: 'Dsus4' },
    { dir: 'DL', key: 'Z', major: 'C6', minor: 'Dsus2' },
    { dir: 'L', key: 'A', major: 'C°', minor: 'D°' },
    { dir: 'UL', key: 'Q', major: 'C+', minor: 'D+' },
];

const SHORTCUTS: [string, string][] = [
    ['1 – 7', 'Play the chord on that scale degree (hold to sustain)'],
    ['Q W E · A D · Z X C', 'Hold to push the stick while playing'],
    ['← →', 'Inversion'],
    ['↑ ↓', 'Octave'],
    ['Space', 'Play / stop the progression'],
    ['R', 'Arm recording'],
    ['[  ]', 'Shorten / lengthen the selected chord'],
    ['/', 'Split the selected chord at the cursor'],
    ['.', 'Make the selected beat a rest'],
    ['⌫', 'Delete the selected chord'],
    ['Esc', 'Centre the stick, close this panel'],
];

const HelpDialog: React.FC<HelpDialogProps> = ({ open, onClose }) => {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (open) closeRef.current?.focus();
    }, [open]);

    if (!open) return null;

    return (
        <div className="help-backdrop" onClick={onClose}>
            <div className="help-dialog panel" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}>
                <div className="help-head">
                    <h2 id="help-title">How to play</h2>
                    <button ref={closeRef} className="icon-button" aria-label="Close" onClick={onClose}>✕</button>
                </div>

                <p className="help-lead">
                    Each pad plays a chord from the selected key: <b>1</b> is I, <b>2</b> is ii, and so on up to <b>7</b> (vii°).
                    Push the stick to change the chord type. The pads show what they will play with the stick where it is.
                </p>

                <h3 className="eyebrow">The stick</h3>
                <table className="help-table">
                    <thead>
                        <tr><th>Direction</th><th>Key</th><th>Does</th><th>On 1 (C)</th><th>On 2 (Dm)</th></tr>
                    </thead>
                    <tbody>
                        {STICK_HELP.map(row => (
                            <tr key={row.dir}>
                                <td>{row.dir === 'C' ? 'Centre' : row.dir}</td>
                                <td><kbd>{row.key}</kbd></td>
                                <td>{STICK_LABELS[row.dir]}</td>
                                <td>{row.major}</td>
                                <td>{row.minor}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="section-note">On 7 (B°) the directions that don’t make sense for a diminished chord leave it alone, and ← makes it minor.</p>

                <h3 className="eyebrow">Keyboard</h3>
                <dl className="help-keys">
                    {SHORTCUTS.map(([k, v]) => (
                        <React.Fragment key={k}>
                            <dt><kbd>{k}</kbd></dt>
                            <dd>{v}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            </div>
        </div>
    );
};

export default HelpDialog;
