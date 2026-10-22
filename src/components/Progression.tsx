import React, { useEffect, useRef, useState } from 'react';
import './Progression.css';
import './SongMenu.css';
import { Clip, clipAt, clipEnd } from '../progression';
import { TIME_SIGNATURES, TimeSignature, isCompound, tsLabel } from '../song';
import { INSTRUMENTS, InstrumentId } from '../audio/instruments';
import { DrumPattern, DrumVoice, hasHit } from '../drums';
import { MAX_PARTS, PART_LABELS, Part, PartKind, hasInstrument } from '../parts';

/** Which drums show on which line of a drum lane's miniature: cymbals, the backbeat, the kick. */
const MINI_LINES: DrumVoice[][] = [['hat', 'openhat', 'rim'], ['snare', 'clap', 'tomhi', 'tomlo'], ['kick']];

/** A note in a part lane's miniature: position and length in steps, height 0 (low) to 1 (high). */
export interface MiniNote {
    start: number;
    len: number;
    y: number;
}

/** The lane the sequencer is editing: the chord row, or one part. */
export const CHORD_LANE = 'chords';

export type PartPatch = Partial<Pick<Part, 'volume' | 'mute' | 'solo' | 'name'>> & { instrument?: InstrumentId };

interface ProgressionProps {
    total: number;
    /** Steps per row: whole bars, about 8 wide. */
    stepsPerRow: number;
    timeSignature: TimeSignature;
    onTimeSignature: (ts: TimeSignature) => void;
    /** The chord row, with positions and lengths in steps. */
    chords: Clip[];
    parts: Part[];
    /** What each instrument part plays, for its lane's miniature. */
    minis: { [partId: string]: MiniNote[] };
    /** `CHORD_LANE` or a part id. */
    selectedLane: string;
    selected: number;
    /** Step under the playhead. */
    playhead: number;
    playing: boolean;
    loop: boolean;
    recording: boolean;
    canPaste: boolean;
    describe: (clip: Clip) => { symbol: string; numeral: string };
    /** The part the pads play through, e.g. "Keys". */
    padPart: string;
    /** 1/16 steps per sequencer step and per bar, for drum lanes. */
    sixteenthsPerStep: number;
    sixteenthsPerBar: number;
    /** Steps that play before the loop wraps; drum lanes past it are dimmed. */
    loopSteps: number;
    /** Shown instead of the chord toolbar while a part is selected. */
    partEditor?: React.ReactNode;
    onSelect: (step: number, lane: string) => void;
    onSelectLane: (lane: string) => void;
    onUpdatePart: (id: string, patch: PartPatch) => void;
    onAddPart: (kind: PartKind) => void;
    onRemovePart: (id: string) => void;
    canRemovePart: (id: string) => boolean;
    onTogglePlay: () => void;
    onFirst: () => void;
    onPrev: () => void;
    onNext: () => void;
    onToggleLoop: () => void;
    onToggleRecord: () => void;
    onAddRow: () => void;
    onRemoveRow: () => void;
    onLonger: () => void;
    onShorter: () => void;
    onSplit: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onRest: () => void;
    onDelete: () => void;
    onClearAll: () => void;
    canClearAll: boolean;
    /** Undo/redo and the Song menu, shown in the header. */
    songMenu?: React.ReactNode;
}

const steps = (n: number) => (n === 1 ? '1 step' : `${n} steps`);

const Icon = {
    first: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="2" height="10" /><path d="M12 2v10L5 7z" /></svg>,
    prev: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M11 2v10L4 7z" /></svg>,
    next: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2v10l7-5z" /></svg>,
    play: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 1.5v11L12.5 7z" /></svg>,
    stop: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" /></svg>,
    loop: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 9V7a3 3 0 0 1 3-3h7M11 2l2 2-2 2M13 7v2a3 3 0 0 1-3 3H3M5 14l-2-2 2-2" /></svg>,
};

const KIND_HINT: { [k in PartKind]: string } = {
    chords: 'plays the chords',
    bass: 'follows the roots',
    melody: 'your notes',
    drums: 'loops a beat',
};

/** One "+ Part" button that opens a short menu of part kinds. */
const AddPartMenu: React.FC<{ full: boolean; onAdd: (kind: PartKind) => void }> = ({ full, onAdd }) => {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);
    return (
        <div className="add-part" ref={root}>
            <button
                className="chip-button add-track"
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={full}
                title={full ? `Up to ${MAX_PARTS} parts` : 'Add a part'}
                onClick={() => setOpen(o => !o)}
            >
                + Part
            </button>
            {open && (
                <div className="song-popover add-part-popover panel" role="menu">
                    {(['chords', 'bass', 'melody', 'drums'] as PartKind[]).map(k => (
                        <button key={k} role="menuitem" onClick={() => { setOpen(false); onAdd(k); }}>
                            {PART_LABELS[k]} <span className="add-part-hint">{KIND_HINT[k]}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const PartStrip: React.FC<{
    part: Part;
    selected: boolean;
    silenced: boolean;
    canRemove: boolean;
    onSelect: () => void;
    onUpdate: ProgressionProps['onUpdatePart'];
    onRemove: () => void;
}> = ({ part, selected, silenced, canRemove, onSelect, onUpdate, onRemove }) => (
    <div className={`track-strip ${selected ? 'selected' : ''} ${silenced ? 'silenced' : ''}`} style={{ '--track': part.color } as React.CSSProperties}>
        <button className="track-pick" aria-pressed={selected} onClick={onSelect} title={`${part.name} ${KIND_HINT[part.kind]}`}>
            <span className="track-dot" />
            <span className="track-name">{part.name}</span>
        </button>
        {hasInstrument(part) ? (
            <select
                aria-label={`${part.name} instrument`}
                value={part.instrument}
                onChange={e => onUpdate(part.id, { instrument: e.target.value as InstrumentId })}
            >
                {INSTRUMENTS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
        ) : (
            <span className="track-kit">Drum kit</span>
        )}
        <label className="track-volume" title={`Volume ${part.volume > 0 ? '+' : ''}${part.volume} dB`}>
            <span className="visually-hidden">{part.name} volume</span>
            <input type="range" min={-24} max={6} step={1} value={part.volume} onChange={e => onUpdate(part.id, { volume: parseInt(e.target.value, 10) })} />
        </label>
        <button className="ms-button" aria-pressed={part.mute} aria-label={`Mute ${part.name}`} title="Mute in playback" onClick={() => onUpdate(part.id, { mute: !part.mute })}>M</button>
        <button className="ms-button solo" aria-pressed={part.solo} aria-label={`Solo ${part.name}`} title="Solo in playback" onClick={() => onUpdate(part.id, { solo: !part.solo })}>S</button>
        {canRemove && (
            <button className="ms-button remove" aria-label={`Remove ${part.name}`} title="Remove part" onClick={onRemove}>×</button>
        )}
    </div>
);

const Progression: React.FC<ProgressionProps> = props => {
    const { total, chords, parts, selectedLane, selected, playhead, playing, loop, recording, canPaste, describe } = props;
    const onChords = selectedLane === CHORD_LANE;
    const selPart = parts.find(p => p.id === selectedLane);
    const selClip = clipAt(chords, selected);
    const selInfo = selClip && !selClip.rest ? describe(selClip) : null;
    const STEPS_PER_ROW = props.stepsPerRow;
    const beatsPerBar = props.timeSignature.beats;
    const compound = isCompound(props.timeSignature);
    const rows = Math.ceil(total / STEPS_PER_ROW);
    const cols = { gridTemplateColumns: `repeat(${STEPS_PER_ROW}, minmax(0, 1fr))` };
    const anySolo = parts.some(p => p.solo);
    const silenced = (p: Part) => (anySolo ? !p.solo : p.mute);

    /** The chord row within one sequencer row. A chord held past the end of a row continues in the next. */
    const renderChordLane = (rowStart: number, rowEnd: number) => {
        const items: React.ReactNode[] = [];
        for (let step = rowStart; step < rowEnd;) {
            const clip = clipAt(chords, step);
            if (!clip) {
                const s = step;
                const sel = onChords && selected === s;
                items.push(
                    <button
                        key={`e${s}`}
                        className={`cell empty ${sel ? 'selected' : ''}`}
                        style={{ gridColumn: `${s - rowStart + 1} / span 1` }}
                        aria-label={`Chords, step ${s + 1}, empty`}
                        aria-pressed={sel}
                        onClick={() => props.onSelect(s, CHORD_LANE)}
                    >
                        +
                    </button>,
                );
                step++;
                continue;
            }
            const segStart = step;
            const segEnd = Math.min(clipEnd(clip), rowEnd);
            const segLen = segEnd - segStart;
            const continued = clip.start < segStart;
            const continues = clipEnd(clip) > rowEnd;
            const isSel = onChords && selected >= clip.start && selected < clipEnd(clip);
            const isHere = playhead >= clip.start && playhead < clipEnd(clip);
            const info = clip.rest ? null : describe(clip);
            const held = !clip.rest && clip.len > 1;
            items.push(
                <div key={`c${segStart}`} className="clip-wrap" style={{ gridColumn: `${segStart - rowStart + 1} / span ${segLen}` }}>
                    <button
                        className={`cell clip ${clip.rest ? 'rest' : ''} ${isSel ? 'selected' : ''} ${isHere && playing ? 'here' : ''} ${continued ? 'continued' : ''} ${continues ? 'continues' : ''}`}
                        aria-pressed={isSel}
                        aria-label={`${info ? info.symbol : 'Rest'}, step ${clip.start + 1}${clip.len > 1 ? ` to ${clipEnd(clip)}` : ''}${held ? ', held' : ''}${continued ? ', continued from the row above' : ''}`}
                        onClick={() => props.onSelect(clip.start, CHORD_LANE)}
                    >
                        {!clip.rest && !continued && <span className="onset" />}
                        <span className="beats">
                            {Array.from({ length: segLen }, (_, i) => {
                                const abs = segStart + i;
                                const passed = playing && isHere && abs <= playhead;
                                return <span key={i} className={`beat ${i === 0 ? 'first' : ''} ${passed ? 'passed' : ''} ${playing && abs === playhead ? 'now' : ''}`} />;
                            })}
                        </span>
                        <span className="clip-top">
                            <span>{continued ? '↳ held' : info?.numeral ?? ''}</span>
                            {!continued && <span className={held ? 'len held' : 'len'}>{held ? `held · ${steps(clip.len)}` : steps(clip.len)}</span>}
                        </span>
                        <span className="clip-name">{info ? info.symbol : 'Rest'}</span>
                        <span className="envelope" aria-hidden="true">
                            {Array.from({ length: segLen }, (_, i) => {
                                const abs = segStart + i;
                                const passed = playing && isHere && abs <= playhead;
                                const first = i === 0 && !continued;
                                const last = i === segLen - 1 && !continues;
                                return (
                                    <span key={i} className={`env ${first ? 'first' : ''} ${last ? 'last' : ''} ${i === 0 && continued ? 'edge' : ''} ${passed ? 'passed' : ''}`}>
                                        {first && !clip.rest && <span className="strike" />}
                                    </span>
                                );
                            })}
                        </span>
                    </button>
                    {isSel && !clip.rest && !continues && clipEnd(clip) < total && (
                        <button className="grip" aria-label="Hold one step longer" title="Hold one step longer ( ] )" onClick={props.onLonger}>
                            <svg width="8" height="18" viewBox="0 0 8 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2.5 3v12M5.5 3v12" /></svg>
                        </button>
                    )}
                </div>,
            );
            step = segEnd;
        }
        return (
            <div key="chords" className={`lane-row chord-lane ${onChords ? 'current' : ''}`} style={{ '--track': 'var(--accent)' } as React.CSSProperties}>
                <button className="lane-label" onClick={() => props.onSelectLane(CHORD_LANE)} aria-label="Select the chord row">
                    <span className="track-dot" />
                    <span>Chords</span>
                </button>
                <div className="lane" style={cols}>{items}</div>
            </div>
        );
    };

    /** A drum part's lane: each step shows the pattern's hits in it, repeating from the top of the song. */
    const renderDrumSteps = (part: Part, pattern: DrumPattern, rowStart: number, rowEnd: number) => {
        const per = props.sixteenthsPerStep;
        const length = pattern.bars * props.sixteenthsPerBar;
        const isCurrent = part.id === selectedLane;
        return Array.from({ length: rowEnd - rowStart }, (_, j) => {
            const step = rowStart + j;
            const past = step >= props.loopSteps;
            return (
                <button
                    key={step}
                    className={`drum-mini ${isCurrent ? 'selected' : ''} ${playing && playhead === step ? 'here' : ''}`}
                    style={{ gridColumn: `${j + 1} / span 1`, opacity: past ? 0.35 : undefined }}
                    aria-label={`${part.name}, step ${step + 1}`}
                    onClick={() => props.onSelect(step, part.id)}
                >
                    {Array.from({ length: per }, (_, k) => {
                        const i = (step * per + k) % length;
                        return (
                            <span key={k} className="drum-mini-col">
                                {MINI_LINES.map((voices, l) => <i key={l} className={voices.some(v => hasHit(pattern, v, i)) ? 'on' : ''} />)}
                            </span>
                        );
                    })}
                </button>
            );
        });
    };

    /** An instrument part's lane: a miniature piano roll of what it plays in this row. */
    const renderNoteStrip = (part: Part, rowStart: number, rowEnd: number) => {
        const notes = (props.minis[part.id] ?? []).filter(n => n.start < rowEnd && n.start + n.len > rowStart);
        const width = rowEnd - rowStart;
        const isCurrent = part.id === selectedLane;
        return (
            <button
                className={`note-mini ${isCurrent ? 'selected' : ''}`}
                style={{ gridColumn: `1 / span ${width}` }}
                aria-label={`${part.name}, steps ${rowStart + 1} to ${rowEnd}`}
                onClick={e => {
                    const box = e.currentTarget.getBoundingClientRect();
                    const step = rowStart + Math.min(width - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * width)));
                    props.onSelect(step, part.id);
                }}
            >
                {Array.from({ length: width - 1 }, (_, i) => (
                    <span key={`g${i}`} className="note-mini-grid" style={{ left: `${((i + 1) / width) * 100}%` }} />
                ))}
                {notes.map((n, i) => {
                    const from = Math.max(n.start, rowStart);
                    const to = Math.min(n.start + n.len, rowEnd);
                    return (
                        <i
                            key={i}
                            style={{ left: `${((from - rowStart) / width) * 100}%`, width: `${((to - from) / width) * 100}%`, bottom: `${8 + n.y * 74}%` }}
                        />
                    );
                })}
                {notes.length === 0 && part.kind === 'melody' && rowStart === 0 && <span className="note-mini-empty">Tap to write a melody</span>}
            </button>
        );
    };

    const renderPartLane = (part: Part, rowStart: number, rowEnd: number) => (
        <div
            key={part.id}
            className={`lane-row part-lane ${part.id === selectedLane ? 'current' : ''} ${silenced(part) ? 'silenced' : ''}`}
            style={{ '--track': part.color } as React.CSSProperties}
        >
            <button className="lane-label" onClick={() => props.onSelectLane(part.id)} aria-label={`Select ${part.name}`}>
                <span className="track-dot" />
                <span>{part.name}</span>
            </button>
            <div className="lane" style={cols}>
                {part.kind === 'drums' ? renderDrumSteps(part, part.drums, rowStart, rowEnd) : renderNoteStrip(part, rowStart, rowEnd)}
            </div>
        </div>
    );

    const renderRow = (row: number) => {
        const rowStart = row * STEPS_PER_ROW;
        const rowEnd = rowStart + STEPS_PER_ROW;
        const headHere = playhead >= rowStart && playhead < rowEnd;
        return (
            <div key={row} className="seq-row">
                <div className="lane-scroll">
                    <div className="lane-inner" style={{ minWidth: `${100 + STEPS_PER_ROW * 70}px` }}>
                        <div className="lane-row ruler-row">
                            <span className="lane-label static">{rowStart + 1}–{rowEnd}</span>
                            <div className="ruler" style={cols} aria-hidden="true">
                                {Array.from({ length: STEPS_PER_ROW }, (_, j) => {
                                    const i = rowStart + j;
                                    return (
                                        <div key={i} className={`tick ${i % beatsPerBar === 0 ? 'down' : compound && (i % beatsPerBar) % 3 === 0 ? 'group' : ''} ${Math.floor(i / beatsPerBar) % 2 === 0 ? 'shade' : ''} ${i === playhead ? 'head' : ''}`}>
                                            {i % beatsPerBar === 0 ? <b>{i + 1}</b> : <span>{i + 1}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {renderChordLane(rowStart, rowEnd)}
                        {parts.map(p => renderPartLane(p, rowStart, rowEnd))}
                        {headHere && (
                            <div className="playhead-track" aria-hidden="true">
                                <div className="playhead" style={{ left: `calc(${playhead - rowStart} * (100% + 4px) / ${STEPS_PER_ROW})` }} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <section className="panel progression" aria-label="Sequencer">
            <div className="prog-head">
                <h2 className="seq-title">SEQ-{total}</h2>
                <div className="transport">
                    <button className="icon-button" aria-label="Back to start" onClick={props.onFirst}>{Icon.first}</button>
                    <button className="icon-button" aria-label="Previous chord" onClick={props.onPrev}>{Icon.prev}</button>
                    <button className="play-button" aria-label={playing ? 'Stop (Space)' : 'Play (Space)'} onClick={props.onTogglePlay}>
                        {playing ? Icon.stop : Icon.play}
                    </button>
                    <button className="icon-button" aria-label="Next chord" onClick={props.onNext}>{Icon.next}</button>
                    <button className="icon-button" aria-label="Loop" aria-pressed={loop} onClick={props.onToggleLoop}>{Icon.loop}</button>
                </div>
                <button className={`rec-button ${recording ? 'on' : ''}`} aria-pressed={recording} onClick={props.onToggleRecord}>
                    <span className="rec-dot" />{recording ? 'Recording' : 'Record'} <kbd className="kbd">R</kbd>
                </button>
                <span className="section-note prog-hint">
                    {recording
                        ? `Play a pad to write it into the chord row at step ${selected + 1}; the cursor moves on.`
                        : 'Pads record into the chord row. Every part below plays those chords in its own way.'}
                </span>
                {props.songMenu}
                <div className="bars">
                    <span className="section-note">{Math.round((total / beatsPerBar) * 10) / 10} bars</span>
                    <select
                        className="ts-select"
                        aria-label="Time signature"
                        value={tsLabel(props.timeSignature)}
                        onChange={e => props.onTimeSignature(TIME_SIGNATURES.find(t => tsLabel(t) === e.target.value)!)}
                    >
                        {TIME_SIGNATURES.map(t => <option key={tsLabel(t)} value={tsLabel(t)}>{tsLabel(t)}</option>)}
                    </select>
                    {rows > 1 && <button className="chip-button" onClick={props.onRemoveRow}>− Remove row</button>}
                    <button className="chip-button" onClick={props.onAddRow}>+ Add row</button>
                </div>
            </div>

            <div className="track-bar" role="group" aria-label="Parts">
                {parts.map(p => (
                    <PartStrip
                        key={p.id}
                        part={p}
                        selected={p.id === selectedLane}
                        silenced={silenced(p)}
                        canRemove={props.canRemovePart(p.id)}
                        onSelect={() => props.onSelectLane(p.id)}
                        onUpdate={props.onUpdatePart}
                        onRemove={() => props.onRemovePart(p.id)}
                    />
                ))}
                <AddPartMenu full={parts.length >= MAX_PARTS} onAdd={props.onAddPart} />
            </div>

            <div className="seq-rows">{Array.from({ length: rows }, (_, r) => renderRow(r))}</div>

            {selPart && props.partEditor}

            {onChords && (
                <>
                    <div className="legend" aria-hidden="true">
                        <span><i className="lg-strike" />chord is struck</span>
                        <span><i className="lg-sustain" />keeps ringing (held, not struck again)</span>
                        <span><i className="lg-passed" />already played</span>
                    </div>

                    <div className="toolbar" role="toolbar" aria-label="Chord actions">
                        <span className="sel-label">
                            <span className="track-dot" style={{ background: 'var(--accent)' }} />
                            Chords · {selClip && selClip.len > 1 ? `Steps ${selClip.start + 1}–${clipEnd(selClip)}` : `Step ${selected + 1}`}
                            <span className="section-note"> · {selClip ? (selInfo ? selInfo.symbol : 'rest') : 'empty'}</span>
                        </span>
                        <div className="length" role="group" aria-label="Length">
                            <span>Length</span>
                            <button aria-label="Shorter" disabled={!selClip || selClip.len < 2} onClick={props.onShorter}>−</button>
                            <b>{selClip ? steps(selClip.len) : '—'}</b>
                            <button aria-label="Longer" disabled={!selClip || clipEnd(selClip) >= total} onClick={props.onLonger}>+</button>
                            <kbd className="kbd">[ ]</kbd>
                        </div>
                        <button className="chip-button" disabled={!selClip || selClip.len < 2} onClick={props.onSplit}>Split at cursor <kbd>/</kbd></button>
                        <button className="chip-button" disabled={!selClip} onClick={props.onCopy}>Copy</button>
                        <button className="chip-button" disabled={!canPaste} onClick={props.onPaste}>Paste</button>
                        <button className="chip-button" onClick={props.onRest}>Make rest <kbd>.</kbd></button>
                        <button className="chip-button" disabled={!selClip} onClick={props.onDelete}>Delete <kbd>⌫</kbd></button>
                        <button className="chip-button danger" disabled={!props.canClearAll} onClick={props.onClearAll}>Clear all</button>
                    </div>
                </>
            )}
        </section>
    );
};

export default Progression;
