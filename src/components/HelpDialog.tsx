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
    ['Space', 'Play / pause (carries on from where it stopped). On a button you reached with Tab, Space presses that button'],
    ['Home', 'Stop and go back to the start'],
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
                        (tap to open that section, or while the chain plays to jump there; ⋯ or long-press to move, duplicate or remove; + adds the open
                        section). <b>Chain</b> plays the sections in order; <b>Loop</b> loops the open one, and picking another while it plays
                        switches at the next bar line. Record works in Loop (in Chain it switches to Loop first).
                        Inside a section: the chord row the pads record into and a lane per part. Tap a lane's name to edit that part's notes or
                        beat below; its <b>M</b> mutes it in this section only. The chord tools stay docked at the bottom. ‹ › and the section name
                        switch sections; ‹ Song goes back. While a section is open, Parts changes how the parts sound in that section only; from the whole song, a change reaches every section. New, open, save, share and Paste from Hooktheory (into the open section) are in the Song menu; on a phone a section's ⋯ has them, with its length (− Row / + Row) and the time signature. On a phone a Melody, Drums or Voice lane opens its editor full screen, with the chords along the top; ‹ Lanes goes back to the list. The melody and drum editors have Copy and Paste: copy a lane, open another section, paste. In the melody grid each row's ⋯ copies, cuts, pastes or clears just that row, to move a phrase.</dd>
                    <dt><b>Parts</b></dt>
                    <dd><i>How</i> it sounds: every part with its volume, mute and solo, and for the selected one its instrument, how it plays
                        (chord, strum, arpeggio; bass style; melody range), tone knobs and effects. On a phone these are three tabs next to the part's name: <b>Sound</b> (instrument, how it plays), <b>Shape</b> (the shape and tone knobs) and <b>Effects</b>. <b>Master</b> holds the shared reverb, delay and output. Mute and solo here are for the whole song.
                        The chip at the top says where changes go: <i>Chorus only</i> while a section is open in Song, <i>Whole song</i>
                        otherwise; tap it to switch. With a section open, a dot marks every setting it sets its own way, and
                        <b>Use the song's sound</b> (<b>↺ Song</b> on a phone) takes that part back to the song's sound there.</dd>
                    <dt><b>Top bar</b></dt>
                    <dd>Always in reach, on every screen: key, scale and tempo, Stop, Play and Record, <b>undo and redo</b>, the modes, Learn and ⚙.
                        Hold <b>−</b> or <b>+</b> to run the tempo, or type the number. On a phone, key, scale and tempo are one button
                        (<i>C Major · 100 BPM</i>): tap it for the three, and <b>Tap</b> the beat a few times to set the tempo by feel.
                        A notice about something you can take back (New song, Clear all, a removed part or section) has its own <b>Undo</b>.</dd>
                    <dt><b>Desktop</b></dt>
                    <dd>On a wide screen the instrument stays on the left and Song and Parts are tabs on the right.</dd>
                    <dt><b>Learn</b></dt>
                    <dd>A reference for a blank song: chord progressions in your key (hear one, or put it into the open section), what each
                        stick direction and pad tends to sound like, and short melody guidelines with tiny examples. On desktop it opens on the right.</dd>
                    <dt><b>⚙</b></dt>
                    <dd>Theme, the click, the next-chord hint, the chord mood in Play mode, Pocket Operator sync (a clock on the left channel of the headphone out, for a cable into a PO set to SY4), this help and the credits. A dot on ⚙ means sync is on.</dd>
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
                    Switch the pads from Chords to Notes (or press N) and they play single notes of the key on your Melody part (or a Voice part singing notes),
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
                    that scale note, so it moves with the key: F♯ in A minor becomes C♯ in E minor. On a phone the grid shows one octave
                    at a time: <b>Low</b> / <b>High</b> switch, and a mark at the top or bottom of a column means a note in the other one.
                    Columns are 1/8 (<b>1/16</b> zooms in); new-note length and the part's octave are under ⋯.
                </p>

                <h3 className="eyebrow">The chord row</h3>
                <p className="section-note">
                    Each chord shows a dot where it's struck and a bar while it keeps ringing (held, not struck again); while playing, the part
                    already played turns orange. New chords are as long as <b>New</b> next to the chord tools says (1 beat, 2 beats or 1 bar; also in ⚙).
                    Lengthen with the grip or <kbd>]</kbd>: the chords after it move along while there's room at the end of the row; a rest can let some parts play on through it (by default
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
