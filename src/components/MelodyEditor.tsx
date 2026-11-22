import React, { memo, useCallback, useMemo, useState } from 'react';
import { MenuAnchor, MoreMenu, PopMenu } from './PopMenu';
import './PartEditors.css';
import { TICKS_PER_SIXTEENTH } from '../drums';
import { Harmony, MELODY_STEPS, NotesPart, chordAt, melodyMidi, resolveClip } from '../parts';
import { noteNames, spellNoteOctave } from '../theory';
import { labelShade } from '../shades';
import { usePlay } from '../playhead';
import { useStable } from '../useStable';

/** Note lengths offered for new notes, in 1/16 steps. */
const LENGTHS: { sixteenths: number; label: string }[] = [
    { sixteenths: 1, label: '1/16' },
    { sixteenths: 2, label: '1/8' },
    { sixteenths: 4, label: '1/4' },
    { sixteenths: 8, label: '1/2' },
];

interface MelodyEditorProps {
    part: NotesPart;
    harmony: Harmony;
    /** Song length and layout, in sequencer steps (beats). */
    totalSteps: number;
    stepsPerRow: number;
    beatsPerBar: number;
    /** 1/16 steps per beat. */
    perBeat: number;
    /** Tap on a cell: add a note of `len` 1/16s there, select the note covering it, or (selected) remove it. */
    onTap: (step: number, sixteenth: number, len: number) => void;
    /** Start tick of the selected note, if any (it gets a yellow edge; its ♭ ♮ ♯ are in the docked toolbar). */
    selectedStart?: number;
    /** Length of new notes in 1/16s, for taps and for recording from the pads. */
    len: number;
    onLen: (len: number) => void;
    /** Where the next recorded note goes (1/16s), or -1 when not step recording. */
    cursor: number;
    onOctave: (octave: number) => void;
    onClear: () => void;
    /** Copy this part's lane in the open section (all its notes or hits, to paste into another section or part). */
    onCopy: () => void;
    /** Replace this lane with what was copied (only when a lane of this kind was copied). */
    onPaste: () => void;
    canPaste: boolean;
    /** A row's ⋯ menu: copy, cut, paste over or clear the notes in [from, to) ticks. */
    onRange: (action: 'copy' | 'cut' | 'paste' | 'clear', from: number, to: number) => void;
    /**
     * Phones: one octave at a time (`high`: the upper one), 1/8 columns unless `fine`, the rows side by
     * side in one sideways scroll, and no head (its tools are `MelodyTools`, in the lane bar).
     */
    compact?: boolean;
    high?: boolean;
    fine?: boolean;
}

/** On phones the grid shows one octave, root to root: the lower (scale steps 0–7) or the upper (7–14). */
export const OCTAVE_ROWS = 8;
const viewSteps = (high: boolean) => Array.from({ length: OCTAVE_ROWS }, (_, i) => (high ? MELODY_STEPS - 1 : OCTAVE_ROWS - 1) - i);
/** Which octave shows more of `notes` (the upper one only when more notes sit above its root than below). */
export const higherOctave = (notes: { step: number }[]) =>
    notes.filter(n => n.step >= OCTAVE_ROWS).length > notes.filter(n => n.step < OCTAVE_ROWS - 1).length;

/**
 * A scale-locked piano roll: one row per note of the key (two octaves), one column per 1/16.
 * The notes of the chord under each column are shaded, so you can see where a melody will sit
 * well before you hear it.
 */
const MelodyEditor: React.FC<MelodyEditorProps> = memo(function MelodyEditor(p) {
    const { part, harmony, len } = p;
    const names = useMemo(() => noteNames(harmony.key, harmony.scale), [harmony.key, harmony.scale]);
    const compact = !!p.compact;
    /** 1/16s per column: 1/8 columns on phones unless zoomed in. */
    const res = compact && !p.fine && p.perBeat % 2 === 0 ? 2 : 1;
    const perBeatCols = p.perBeat / res;
    const blockCols = p.stepsPerRow * perBeatCols;
    const blocks = Math.ceil(p.totalSteps / p.stepsPerRow);
    const totalCols = p.totalSteps * perBeatCols;
    const shownSteps = compact ? viewSteps(!!p.high) : null;

    // which melody row is which pitch class, and its label
    const rows = useMemo(() => (shownSteps ?? Array.from({ length: MELODY_STEPS }, (_, i) => MELODY_STEPS - 1 - i)).map(step => {
        // highest at the top
        const midi = melodyMidi(part, harmony, step);
        // each row's letter gets its own shade of the part colour (one per scale degree, the same
        // in both octaves), in a lighter or darker range depending on the theme
        return {
            step, pc: midi % 12, label: `${names[midi % 12]}${Math.floor(midi / 12) - 1}`, tonic: step % 7 === 0,
            style: { '--row-light': labelShade(part.color, step, 'light'), '--row-dark': labelShade(part.color, step, 'dark') } as React.CSSProperties,
        };
    }), [part, harmony, names, p.high, compact]); // eslint-disable-line react-hooks/exhaustive-deps

    // the chord tones under every column
    const columns = useMemo(() => Array.from({ length: totalCols }, (_, c) => {
        const chord = chordAt(harmony.chords, c * res * TICKS_PER_SIXTEENTH);
        if (!chord) return null;
        const resolved = resolveClip(harmony, chord);
        return { root: resolved.rootPc, pcs: new Set(resolved.midi.map(m => m % 12)) };
    }), [harmony, totalCols, res]);

    // which cells are covered by a note, and where notes begin and end
    // (an altered note stays on its scale row, marked ♯ or ♭, and is named as written: F♯4)
    // With 1/8 columns a cell is covered when any of its 1/16s is, and a tap on it is a tap on that note.
    const covered = useMemo(() => {
        const map = new Map<string, { head: boolean; tail: boolean; acc: number; sel: boolean; label: string; name: string; start16: number }>();
        for (const n of part.notes) {
            const from16 = Math.round(n.start / TICKS_PER_SIXTEENTH);
            const to16 = Math.round((n.start + n.len) / TICKS_PER_SIXTEENTH);
            const from = Math.floor(from16 / res);
            const to = Math.ceil(to16 / res);
            const acc = n.acc ?? 0;
            const label = spellNoteOctave(names, melodyMidi(part, harmony, n.step), acc);
            const sel = n.start === p.selectedStart;
            const name = label.replace(/-?\d+$/, ''); // shown on the note itself: C, F♯…
            for (let c = from; c < to; c++) {
                const key = `${n.step}:${c}`;
                if (map.has(key)) continue; // two short notes in one 1/8: the first one answers the tap
                map.set(key, { head: c === from, tail: c === to - 1, acc, sel, label, name, start16: from16 });
            }
        }
        return map;
    }, [part, harmony, names, p.selectedStart, res]);

    // phones: columns with notes in the octave not shown get a mark at the top or bottom edge
    const peek = useMemo(() => {
        const up = new Set<number>(), down = new Set<number>();
        if (!shownSteps) return { up, down };
        const lo = Math.min(...shownSteps), hi = Math.max(...shownSteps);
        for (const n of part.notes) {
            if (n.step >= lo && n.step <= hi) continue;
            const set = n.step > hi ? up : down;
            const from = Math.floor(n.start / TICKS_PER_SIXTEENTH / res);
            const to = Math.ceil((n.start + n.len) / TICKS_PER_SIXTEENTH / res);
            for (let c = from; c < to; c++) set.add(c);
        }
        return { up, down };
    }, [part.notes, res, p.high, compact]); // eslint-disable-line react-hooks/exhaustive-deps

    const cursor = p.cursor >= 0 ? Math.floor(p.cursor / res) : -1;
    const barCols = p.beatsPerBar * perBeatCols;

    const cols = `var(--mel-label) repeat(${blockCols}, minmax(var(--mel-cell), 1fr))`;
    /** The open row menu: which row (block) and where it opened. */
    const [rowMenu, setRowMenu] = useState<{ block: number; anchor: MenuAnchor } | null>(null);
    const blockRange = (b: number) => {
        const from = b * blockCols;
        const to = Math.min(from + blockCols, totalCols);
        return { from, to, label: `${b * p.stepsPerRow + 1}–${Math.min((b + 1) * p.stepsPerRow, p.totalSteps)}` };
    };
    const openMenu = useCallback((block: number, rect: DOMRect) => setRowMenu({ block, anchor: { rect } }), []);
    // one handler for every cell: the cell says which row and which 1/16 a tap means
    const tapCell = useStable((e: React.MouseEvent<HTMLButtonElement>) => {
        const d = e.currentTarget.dataset;
        p.onTap(Number(d.step), Number(d.s16), len);
    });
    const rowItems = (b: number) => {
        const { from, to } = blockRange(b);
        const t0 = from * res * TICKS_PER_SIXTEENTH, t1 = to * res * TICKS_PER_SIXTEENTH;
        const has = part.notes.some(n => n.start >= t0 && n.start < t1);
        const run = (action: 'copy' | 'cut' | 'paste' | 'clear') => () => p.onRange(action, t0, t1);
        return [
            { label: 'Copy', disabled: !has, onSelect: run('copy') },
            { label: 'Cut', disabled: !has, onSelect: run('cut') },
            { label: 'Paste', disabled: !p.canPaste, onSelect: run('paste') },
            { label: 'Clear', disabled: !has, danger: true, onSelect: run('clear') },
        ];
    };

    return (
        <div className={`part-editor melody-editor ${compact ? 'compact' : ''} ${compact && p.fine ? 'fine' : ''}`} style={{ '--track': part.color } as React.CSSProperties}>
            {!compact && <div className="part-head">
                <span className="sel-label">
                    <span className="track-dot" style={{ background: part.color }} />
                    {part.name}
                    <span className="section-note"> · tap to add a note; tap a note to pick it (♭ ♮ ♯ below), again to remove it; or play the pads in Notes mode (N)</span>
                </span>
                <div className="segmented" role="group" aria-label="New note length">
                    {LENGTHS.map(l => (
                        <button key={l.sixteenths} aria-pressed={len === l.sixteenths} onClick={() => p.onLen(l.sixteenths)}>{l.label}</button>
                    ))}
                </div>
                <div className="segmented" role="group" aria-label="Melody octave">
                    {[3, 4, 5].map(o => (
                        <button key={o} aria-pressed={part.octave === o} onClick={() => p.onOctave(o)}>C{o}</button>
                    ))}
                </div>
                <button className="chip-button" disabled={part.notes.length === 0} onClick={p.onCopy}>Copy</button>
                <button className="chip-button" disabled={!p.canPaste} onClick={p.onPaste}>Paste</button>
                <button className="chip-button" disabled={part.notes.length === 0} onClick={p.onClear}>Clear</button>
            </div>}

            <div className="mel-legend" aria-hidden="true">
                <span><i className="lg-root" />root of the chord</span>
                <span><i className="lg-tone" />other chord notes</span>
                <span><i className="lg-other" />rest of the scale, for passing notes</span>
            </div>

            <div className="mel-blocks" {...(compact && { role: 'group', 'aria-label': `${part.name}, ${p.high ? 'upper' : 'lower'} octave` })}>
                {Array.from({ length: blocks }, (_, b) => (
                    <MelodyBlock
                        key={b}
                        from={b * blockCols}
                        to={Math.min(b * blockCols + blockCols, totalCols)}
                        title={`Steps ${b * p.stepsPerRow + 1} to ${b * p.stepsPerRow + p.stepsPerRow}`}
                        menuLabel={`Steps ${blockRange(b).label}: copy, cut, paste or clear`}
                        block={b}
                        blockCols={blockCols}
                        cols={cols}
                        harmony={harmony}
                        rows={rows}
                        columns={columns}
                        covered={covered}
                        peek={peek}
                        cursor={cursor}
                        res={res}
                        perBeat={p.perBeat}
                        perBeatCols={perBeatCols}
                        barCols={barCols}
                        menuOpen={rowMenu?.block === b}
                        onMenu={openMenu}
                        onTap={tapCell}
                    />
                ))}
            </div>
            {rowMenu && (
                <PopMenu anchor={rowMenu.anchor} label={`Steps ${blockRange(rowMenu.block).label}`} items={rowItems(rowMenu.block)} onClose={() => setRowMenu(null)} />
            )}
        </div>
    );
});

interface MelodyRow {
    step: number;
    pc: number;
    label: string;
    tonic: boolean;
    style: React.CSSProperties;
}
interface Cover { head: boolean; tail: boolean; acc: number; sel: boolean; label: string; name: string; start16: number }

/**
 * One row block of the grid (a sequencer row's worth of columns, every pitch). It follows the playhead
 * itself, and only while the playhead is in it, so playing re-renders one block a 1/16, and in it only
 * the cells that gain or lose the "now" mark (`MelodyCell` is memoised).
 */
const MelodyBlock: React.FC<{
    from: number;
    to: number;
    block: number;
    title: string;
    menuLabel: string;
    blockCols: number;
    cols: string;
    harmony: Harmony;
    rows: MelodyRow[];
    columns: ({ root: number; pcs: Set<number> } | null)[];
    covered: Map<string, Cover>;
    peek: { up: Set<number>; down: Set<number> };
    cursor: number;
    res: number;
    perBeat: number;
    perBeatCols: number;
    barCols: number;
    menuOpen: boolean;
    onMenu: (block: number, rect: DOMRect) => void;
    onTap: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = memo(function MelodyBlock(p) {
    const { from, to, res, harmony } = p;
    // the playhead's column while it is in this block, else -1
    const now = usePlay(s => {
        const c = s.sixteenth >= 0 ? Math.floor(s.sixteenth / res) : -1;
        return c >= from && c < to ? c : -1;
    });
    const labels: React.ReactNode[] = [];
    for (const clip of harmony.chords) {
        if (clip.rest) continue;
        const c0 = Math.round(clip.start / TICKS_PER_SIXTEENTH / res);
        const c1 = Math.round((clip.start + clip.len) / TICKS_PER_SIXTEENTH / res);
        if (c1 <= from || c0 >= to) continue;
        const a = Math.max(c0, from);
        const b = Math.min(c1, to);
        labels.push(
            <span key={clip.start} className="mel-chord" style={{ gridColumn: `${a - from + 2} / span ${b - a}` }}>
                {c0 < from ? '↳ ' : ''}{resolveClip(harmony, clip).name.symbol}
            </span>,
        );
    }
    return (
        <div className="mel-scroll">
            <div className="mel-block" role="grid" aria-label={p.title} style={{ '--mel-cols': p.blockCols } as React.CSSProperties}>
                <div className="mel-chords" style={{ gridTemplateColumns: p.cols }}>
                    <span className="mel-row-tools">
                        <button
                            className="mel-row-menu"
                            aria-label={p.menuLabel}
                            aria-haspopup="menu"
                            aria-expanded={p.menuOpen}
                            onClick={e => p.onMenu(p.block, e.currentTarget.getBoundingClientRect())}
                        >⋯</button>
                    </span>
                    {labels}
                </div>
                {p.rows.map((row, ri) => {
                    const top = ri === 0, bottom = ri === p.rows.length - 1;
                    return (
                        <div key={row.step} className="mel-row" role="row" style={{ gridTemplateColumns: p.cols }}>
                            <span className={`mel-name ${row.tonic ? 'tonic' : ''}`} style={row.style}>{row.label}</span>
                            {Array.from({ length: to - from }, (_, j) => {
                                const c = from + j;
                                return (
                                    <MelodyCell
                                        key={c}
                                        c={c}
                                        row={row}
                                        col={p.columns[c]}
                                        cover={p.covered.get(`${row.step}:${c}`)}
                                        now={c === now}
                                        cursor={c === p.cursor}
                                        peekUp={top && p.peek.up.has(c)}
                                        peekDown={bottom && p.peek.down.has(c)}
                                        res={res}
                                        perBeat={p.perBeat}
                                        perBeatCols={p.perBeatCols}
                                        barCols={p.barCols}
                                        onTap={p.onTap}
                                    />
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

/** One cell of the melody grid: a 1/16 (or 1/8) of one scale row. A tap says its row and 1/16 through data attributes. */
const MelodyCell: React.FC<{
    c: number;
    row: MelodyRow;
    col: { root: number; pcs: Set<number> } | null;
    cover: Cover | undefined;
    now: boolean;
    cursor: boolean;
    peekUp: boolean;
    peekDown: boolean;
    res: number;
    perBeat: number;
    perBeatCols: number;
    barCols: number;
    onTap: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = memo(function MelodyCell({ c, row, col, cover, now, cursor, peekUp, peekDown, res, perBeat, perBeatCols, barCols, onTap }) {
    const tone = col ? (col.root === row.pc ? 'root' : col.pcs.has(row.pc) ? 'tone' : '') : '';
    const s16 = c * res;
    const beat = Math.floor(s16 / perBeat);
    const sub = s16 % perBeat;
    return (
        <button
            role="gridcell"
            className={[
                'mel-cell', tone,
                c % barCols === 0 ? 'bar' : c % perBeatCols === 0 ? 'beat' : '',
                beat % 2 ? 'alt' : '',
                cover ? 'on' : '', cover?.head ? 'head' : '', cover?.tail ? 'tail' : '',
                cover?.sel ? 'sel' : '',
                now ? 'now' : '',
                cursor ? 'cursor' : '',
                peekUp ? 'peek-up' : '',
                peekDown ? 'peek-down' : '',
            ].filter(Boolean).join(' ')}
            aria-pressed={!!cover}
            aria-current={cover?.sel && cover.head ? 'true' : undefined}
            aria-label={`${cover ? cover.label : row.label}, beat ${beat + 1}${sub ? `, 1/16 ${sub + 1}` : ''}${cover?.sel ? ', selected' : ''}${peekUp ? ', more notes above' : ''}${peekDown ? ', more notes below' : ''}`}
            data-step={row.step}
            data-s16={cover ? cover.start16 : s16}
            onClick={onTap}
        >
            {cover?.head && <span className="mel-acc" aria-hidden="true">{cover.name}</span>}
        </button>
    );
});

/**
 * The melody grid's tools on phones, in the lane bar: which octave shows (Low / High), 1/8 or 1/16
 * columns, and under ⋯ the new notes' length, the part's octave, Copy, Paste and Clear.
 */
export const MelodyTools: React.FC<{
    part: NotesPart;
    harmony: Harmony;
    high: boolean;
    onHigh: (high: boolean) => void;
    fine: boolean;
    onFine: (fine: boolean) => void;
    /** 1/16s per beat: in x/8 a 1/8 column is a whole step, so 1/16 is the zoom. */
    perBeat: number;
    len: number;
    onLen: (len: number) => void;
    onOctave: (octave: number) => void;
    onCopy: () => void;
    onPaste: () => void;
    canPaste: boolean;
    onClear: () => void;
}> = p => {
    const empty = p.part.notes.length === 0;
    const names = noteNames(p.harmony.key, p.harmony.scale);
    // the rows' names at the octaves' edges (C4, C5, C6), for the buttons' titles
    const rowName = (step: number) => {
        const midi = melodyMidi(p.part, p.harmony, step);
        return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
    };
    const rowNames = [rowName(0), rowName(OCTAVE_ROWS - 1), rowName(MELODY_STEPS - 1)];
    return (
        <div className="lane-tools" style={{ '--track': p.part.color } as React.CSSProperties}>
            <div className="segmented" role="group" aria-label="Octave shown">
                <button aria-pressed={!p.high} title={`${rowNames[0]}–${rowNames[1]}`} onClick={() => p.onHigh(false)}>Low</button>
                <button aria-pressed={p.high} title={`${rowNames[1]}–${rowNames[2]}`} onClick={() => p.onHigh(true)}>High</button>
            </div>
            {p.perBeat % 2 === 0 && (
                <div className="segmented" role="group" aria-label="Grid">
                    <button aria-pressed={!p.fine} onClick={() => p.onFine(false)}>1/8</button>
                    <button aria-pressed={p.fine} onClick={() => p.onFine(true)}>1/16</button>
                </div>
            )}
            <MoreMenu
                label={`${p.part.name}: note length, octave, copy, paste, clear`}
                items={[
                    { label: 'Copy', disabled: empty, onSelect: p.onCopy },
                    { label: 'Paste', disabled: !p.canPaste, onSelect: p.onPaste },
                    { label: 'Clear', disabled: empty, danger: true, onSelect: p.onClear },
                ]}
            >
                <div className="menu-field">
                    <span className="section-note">New notes</span>
                    <div className="segmented" role="group" aria-label="New note length" style={{ '--seg-thumb': p.part.color } as React.CSSProperties}>
                        {LENGTHS.map(l => (
                            <button key={l.sixteenths} aria-pressed={p.len === l.sixteenths} onClick={() => p.onLen(l.sixteenths)}>{l.label}</button>
                        ))}
                    </div>
                </div>
                <div className="menu-field">
                    <span className="section-note">Octave</span>
                    <div className="segmented" role="group" aria-label="Melody octave" style={{ '--seg-thumb': p.part.color } as React.CSSProperties}>
                        {[3, 4, 5].map(o => (
                            <button key={o} aria-pressed={p.part.octave === o} onClick={() => p.onOctave(o)}>C{o}</button>
                        ))}
                    </div>
                </div>
            </MoreMenu>
        </div>
    );
};

export default MelodyEditor;
