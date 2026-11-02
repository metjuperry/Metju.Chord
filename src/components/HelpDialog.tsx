import React, { useRef } from 'react';
import { useDialog } from './useDialog';
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
    ['N', 'Pads play chords / single notes on the melody'],
    ['[  ]', 'Shorten / lengthen the selected chord'],
    ['/', 'Split the selected chord at the cursor'],
    ['.', 'Make the selected beat a rest (then pick which parts keep playing through it)'],
    ['⌫', 'Delete the selected chord (or the selected melody note)'],
    ['Shift ↑ / Shift ↓', 'With a melody note selected: sharpen / flatten it (♭ → ♮ → ♯)'],
    ['Ctrl/⌘ Z', 'Undo'],
    ['Shift Ctrl/⌘ Z  ·  Ctrl Y', 'Redo'],
    ['Esc', 'Centre the stick, close a panel'],
];

const HelpDialog: React.FC<HelpDialogProps> = ({ open, onClose }) => {
    const box = useRef<HTMLDivElement>(null);
    useDialog(box, open, onClose);

    if (!open) return null;

    return (
        <div className="help-backdrop" onClick={onClose}>
            <div ref={box} className="help-dialog panel" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}>
                <div className="help-head">
                    <h2 id="help-title">How to play</h2>
                    <button data-autofocus className="icon-button" aria-label="Close" onClick={onClose}>✕</button>
                </div>

                <p className="help-lead">
                    Each pad plays a chord from the selected key and scale: in C major <b>1</b> is I, <b>2</b> is ii, and so on up to <b>7</b> (vii°).
                    Push the stick to change the chord type: press and slide toward a direction, and let go to spring back. A quick tap locks a
                    direction. The pads show what they will play with the stick where it is.
                </p>

                <h3 className="eyebrow">Three modes</h3>
                <dl className="help-keys">
                    <dt><b>Play</b></dt>
                    <dd>The instrument: the stick on the left, the pads on the right. Above them the chord you played, its notes (the root dark,
                        the notes the stick added yellow) and the chords that often come next. The strip under it sets the octave, inversion,
                        voice leading, and which part the pads play through (<b>Pads →</b>).</dd>
                    <dt><b>Song</b></dt>
                    <dd><i>What</i> plays, in <b>sections</b> (verse, chorus…) put in order in the <b>chain</b>. The song view shows the sections as
                        tiles (tap one to open it; long-press or ⋯ to rename, duplicate, delete or add it to the chain) and the chain as blocks
                        (tap to open that section, or while the chain plays to jump there; long-press to move, duplicate or remove; + adds the open
                        section). <b>Chain</b> plays the sections in order; <b>Loop</b> loops the open one, and picking another while it plays
                        switches at the next bar line. Record works in Loop (in Chain it switches to Loop first).
                        Inside a section: the chord row the pads record into and a lane per part. Tap a lane's name to edit that part's notes or
                        beat below; its <b>M</b> mutes it in this section only. The chord tools stay docked at the bottom. ‹ › and the section name
                        switch sections; ‹ Song goes back. New, open, save, share and Paste from Hooktheory (into the open section) are in the Song menu. The melody and drum editors have Copy and Paste: copy a lane, open another section, paste.</dd>
                    <dt><b>Parts</b></dt>
                    <dd><i>How</i> it sounds: every part with its volume, mute and solo, and for the selected one its instrument, how it plays
                        (chord, strum, arpeggio; bass style; melody range), tone knobs and effects. <b>Master</b> holds the shared reverb, delay and output. Mute and solo here are for the whole song.</dd>
                    <dt><b>Desktop</b></dt>
                    <dd>On a wide screen the instrument stays on the left and Song and Parts are tabs on the right.</dd>
                    <dt><b>Learn</b></dt>
                    <dd>A reference for a blank song: chord progressions in your key (hear one, or put it into the open section), what each
                        stick direction and pad tends to sound like, and short melody guidelines with tiny examples. On desktop it opens on the right.</dd>
                    <dt><b>⚙</b></dt>
                    <dd>Theme, the click, the next-chord hint, the chord mood in Play mode, this help and the credits.</dd>
                </dl>

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

                <h3 className="eyebrow">Notes mode</h3>
                <p className="section-note">
                    Switch the pads from Chords to Notes (or press N) and they play single notes of the key on your Melody part,
                    1–7 up the scale. The stick changes the note: <b>↑</b> the octave above (8va), <b>→</b> sharp (♯), <b>←</b> flat (♭),
                    and <b>↗</b> / <b>↖</b> both (octave up and sharp / flat), so an F♯ in A minor is pad 6 with the stick right. The lower
                    three directions do nothing here. With Record on, a stopped song writes each note at the cursor (length set in the
                    Melody editor) and moves on; a playing song records notes where you play them, snapped to 1/16. Sharps and flats are
                    recorded too.
                </p>

                <h3 className="eyebrow">Melody grid</h3>
                <p className="section-note">
                    One row per note of the scale. Tap an empty cell to add a note, tap a note to select it (yellow edge), tap it again to
                    remove it. With a note selected, <b>♭ ♮ ♯</b> in the toolbar at the bottom (or <kbd>Shift ↑</kbd> / <kbd>Shift ↓</kbd>)
                    make it a semitone lower or higher: it stays on its row with a small ♯ or ♭ and is named as written (F♯, G♭). It's still
                    that scale note, so it moves with the key: F♯ in A minor becomes C♯ in E minor.
                </p>

                <h3 className="eyebrow">The chord row</h3>
                <p className="section-note">
                    Each chord shows a dot where it's struck and a bar while it keeps ringing (held, not struck again); while playing, the part
                    already played turns orange. Lengthen with the grip or <kbd>]</kbd>; a rest can let some parts play on through it (by default
                    chords and bass stop, melody and drums carry on).
                </p>

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
