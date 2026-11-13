import React, { useEffect, useRef, useState } from 'react';
import './Progression.css';
import './SongMenu.css';
import { Clip, clipAt, clipEnd } from '../progression';
import { CHORD_LENGTHS, ChordLength, TIME_SIGNATURES, TimeSignature, isCompound, tsLabel } from '../song';
import { InstrumentId } from '../audio/instruments';
import { DrumPattern, DrumVoice, hasHit } from '../drums';
import { MenuAnchor, MenuItem, PopMenu } from './PopMenu';
import { Part, outsideRests, playsThroughRest, restSpans, writesNotes } from '../parts';

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
    /** In Notes mode: the melody part the pads record into. */
    recordInto?: string;
    /** 1/16 steps per sequencer step and per bar, for drum lanes. */
    sixteenthsPerStep: number;
    sixteenthsPerBar: number;
    /** Steps that play before the loop wraps; drum lanes past it are dimmed. */
    loopSteps: number;
    /** Shown instead of the chord toolbar while a part is selected. */
    partEditor?: React.ReactNode;
    /** The selected melody note's tools (♭ ♮ ♯, Delete), docked like the chord toolbar while a part is selected. */
    partDock?: React.ReactNode;
    onSelect: (step: number, lane: string) => void;
    onSelectLane: (lane: string) => void;
    onUpdatePart: (id: string, patch: PartPatch) => void;
    onFirst: () => void;
    onPrev: () => void;
    onNext: () => void;
    onToggleLoop: () => void;
    onAddRow: () => void;
    onRemoveRow: () => void;
    onLonger: () => void;
    onShorter: () => void;
    onSplit: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onRest: () => void;
    /** Whether the selected rest lets a part play through. */
    onRestPart: (id: string, plays: boolean) => void;
    onDelete: () => void;
    /** The Song menu, shown at the end of the header. */
    songMenu?: React.ReactNode;
    /** Phones: the header is one row; bars, time signature, rows and the Song menu's items sit behind "⋯". */
    compact?: boolean;
    /** The Song menu's entries for that "⋯" menu. */
    songItems?: MenuItem[];
    /** "‹ Song" and the section switcher, at the start of the header. */
    sectionHeader?: React.ReactNode;
    /** The open section's name and its mutes: each lane's M silences its part in this section only. */
    sectionName?: string;
    sectionMutes?: { [partId: string]: true };
    onSectionMute?: (partId: string, muted: boolean) => void;
    /** Shown in the chord toolbar when the section is in the chain more than once. */
    repeatNote?: string;
    /**
     * Phones, a note, drum or voice lane picked: its editor fills the section instead of the lane list
     * (the editor carries the `LaneBar` with "‹ Lanes" and the chord strip).
     */
    focus?: boolean;
    /** How long chords recorded from the pads (and placed from the toolbar) are. */
    chordLength: ChordLength;
    onChordLength: (length: ChordLength) => void;
    /** The `LaneBar` over the full-height editor. */
    laneBar?: React.ReactNode;
}

const steps = (n: number) => (n === 1 ? '1 step' : `${n} steps`);

const Icon = {
    first: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="2" height="10" /><path d="M12 2v10L5 7z" /></svg>,
    prev: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M11 2v10L4 7z" /></svg>,
    next: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2v10l7-5z" /></svg>,
    loop: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 9V7a3 3 0 0 1 3-3h7M11 2l2 2-2 2M13 7v2a3 3 0 0 1-3 3H3M5 14l-2-2 2-2" /></svg>,
};

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
    const mutedHere = (p: Part) => !!props.sectionMutes?.[p.id];
    const silenced = (p: Part) => (anySolo ? !p.solo : p.mute) || mutedHere(p);
    const barsLabel = `${Math.round((total / beatsPerBar) * 10) / 10} bars`;
    const [more, setMore] = useState<MenuAnchor | null>(null);
    /** When "⋯" last closed: the press that closes it (outside the menu, on the button) must not open it again. */
    const moreClosed = useRef(0);
    const tsSelect = (
        <select
            className="ts-select"
            aria-label="Time signature"
            value={tsLabel(props.timeSignature)}
            onChange={e => props.onTimeSignature(TIME_SIGNATURES.find(t => tsLabel(t) === e.target.value)!)}
        >
            {TIME_SIGNATURES.map(t => <option key={tsLabel(t)} value={tsLabel(t)}>{tsLabel(t)}</option>)}
        </select>
    );

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
                <div className="lane-label">
                    <button className="lane-pick" onClick={() => props.onSelectLane(CHORD_LANE)} aria-label="Edit the chord row" aria-pressed={onChords}>
                        <span className="track-dot" />
                        <span className="lane-name">Chords</span>
                    </button>
                </div>
                <div className="lane" style={cols}>{items}</div>
            </div>
        );
    };

    /** A drum part's lane: each step shows the pattern's hits in it, repeating from the top of the song. */
    const renderDrumSteps = (part: Part, pattern: DrumPattern, rowStart: number, rowEnd: number) => {
        const per = props.sixteenthsPerStep;
        const length = pattern.bars * props.sixteenthsPerBar;
        const isCurrent = part.id === selectedLane;
        const rests = restSpans(chords, part);
        return Array.from({ length: rowEnd - rowStart }, (_, j) => {
            const step = rowStart + j;
            // past the loop, or under a rest that silences the drums
            const past = step >= props.loopSteps || !outsideRests(rests, step);
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
                {notes.length === 0 && writesNotes(part) && rowStart === 0 && <span className="note-mini-empty">{part.kind === 'voice' ? 'Tap to write what the voice sings' : 'Tap to write a melody'}</span>}
            </button>
        );
    };

    const renderPartLane = (part: Part, rowStart: number, rowEnd: number) => (
        <div
            key={part.id}
            className={`lane-row part-lane ${part.id === selectedLane ? 'current' : ''} ${silenced(part) ? 'silenced' : ''}`}
            style={{ '--track': part.color } as React.CSSProperties}
        >
            <div className="lane-label">
                <button className="lane-pick" onClick={() => props.onSelectLane(part.id)} aria-label={`Edit ${part.name}`} aria-pressed={part.id === selectedLane}>
                    <span className="track-dot" />
                    <span className="lane-name">{part.name}</span>
                </button>
                {props.onSectionMute ? (
                    <button
                        className="ms-button lane-ms"
                        aria-pressed={mutedHere(part)}
                        aria-label={`Mute ${part.name} in ${props.sectionName}`}
                        title={`Mute ${part.name} in ${props.sectionName} only (mute and solo for the whole song are in Parts)`}
                        onClick={() => props.onSectionMute!(part.id, !mutedHere(part))}
                    >
                        M
                    </button>
                ) : (
                    <>
                        <button className="ms-button lane-ms" aria-pressed={part.mute} aria-label={`Mute ${part.name}`} title="Mute in playback" onClick={() => props.onUpdatePart(part.id, { mute: !part.mute })}>M</button>
                        <button className="ms-button lane-ms solo" aria-pressed={part.solo} aria-label={`Solo ${part.name}`} title="Solo in playback" onClick={() => props.onUpdatePart(part.id, { solo: !part.solo })}>S</button>
                    </>
                )}
            </div>
            <div className="lane" style={cols}>
                {part.kind === 'drums' ? renderDrumSteps(part, part.drums, rowStart, rowEnd) : renderNoteStrip(part, rowStart, rowEnd)}
                {mutedHere(part) && rowStart === 0 && <span className="lane-muted">muted in {props.sectionName}</span>}
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
                                <div
                                    className="playhead"
                                    // while playing, App writes the exact position (--pp, in steps) every frame so it glides
                                    style={{ '--step': playhead, '--row-start': rowStart, left: `calc(clamp(0, var(--pp, var(--step)) - var(--row-start), ${STEPS_PER_ROW - 0.01}) * (100% + 4px) / ${STEPS_PER_ROW})` } as React.CSSProperties}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (props.focus && selPart) {
        return (
            <section className="panel progression lane-focus" aria-label={`${selPart.name} in ${props.sectionName ?? 'the section'}`}>
                {props.laneBar}
                <div className="focus-body">{props.partEditor}</div>
                {props.partDock}
            </section>
        );
    }

    return (
        <section className="panel progression" aria-label="Sequencer">
            <div className="prog-head">
                {props.sectionHeader}
                <h2 className="seq-title">SEQ-{total}</h2>
                <div className="transport" role="group" aria-label="Cursor">
                    <button className="icon-button" aria-label="Back to start" onClick={props.onFirst}>{Icon.first}</button>
                    <button className="icon-button" aria-label="Previous chord" onClick={props.onPrev}>{Icon.prev}</button>
                    <button className="icon-button" aria-label="Next chord" onClick={props.onNext}>{Icon.next}</button>
                    <button className="icon-button" aria-label="Loop" title="Loop: play to the end of the music and start again" aria-pressed={loop} onClick={props.onToggleLoop}>{Icon.loop}</button>
                </div>
                {recording && (
                    <span className="rec-note" role="status">
                        ● {props.recordInto
                            ? `Pads write notes into ${props.recordInto}${playing ? ' where you play them' : ' at the cursor'}`
                            : `Pads write chords at step ${selected + 1}`}
                    </span>
                )}
                {props.compact ? (
                    <>
                        <button
                            className="icon-button prog-more"
                            aria-haspopup="menu"
                            aria-expanded={!!more}
                            aria-label={`More: ${barsLabel}, time signature, rows, song menu`}
                            title="Length, time signature, song menu"
                            onClick={e => {
                                if (performance.now() - moreClosed.current > 350) setMore({ rect: e.currentTarget.getBoundingClientRect() });
                            }}
                        >
                            ⋯
                        </button>
                        {more && (
                            <PopMenu
                                anchor={more}
                                label="Section length, time signature and the song menu"
                                items={props.songItems ?? []}
                                onClose={() => {
                                    moreClosed.current = performance.now();
                                    setMore(null);
                                }}
                            >
                                <div className="more-row">
                                    <span className="section-note">{barsLabel}</span>
                                    {tsSelect}
                                    <span className="more-space" />
                                    <button role="menuitem" className="chip-button" disabled={rows < 2} onClick={props.onRemoveRow}>− Row</button>
                                    <button role="menuitem" className="chip-button" onClick={props.onAddRow}>+ Row</button>
                                </div>
                            </PopMenu>
                        )}
                    </>
                ) : (
                    <div className="bars">
                        <span className="section-note">{barsLabel}</span>
                        {tsSelect}
                        {rows > 1 && <button className="chip-button" onClick={props.onRemoveRow}>− Row</button>}
                        <button className="chip-button" onClick={props.onAddRow}>+ Row</button>
                        {props.songMenu}
                    </div>
                )}
            </div>

            <div className="seq-rows">{Array.from({ length: rows }, (_, r) => renderRow(r))}</div>

            {selPart && props.partEditor}
            {selPart && props.partDock}

            {onChords && (
                <div className="dock" role="toolbar" aria-label="Selected chord">
                    <div className="dock-row">
                        <span className="sel-label">
                            <span className="track-dot" style={{ background: 'var(--accent)' }} />
                            <b className="sel-name">{selClip ? (selInfo ? selInfo.symbol : 'Rest') : 'Empty'}</b>
                            <span className="section-note">{selClip && selClip.len > 1 ? `steps ${selClip.start + 1}–${clipEnd(selClip)}` : `step ${selected + 1}`}</span>
                        </span>
                        <div className="length" role="group" aria-label="Length">
                            <button aria-label="Shorter ( [ )" disabled={!selClip || selClip.len < 2} onClick={props.onShorter}>−</button>
                            <b>{selClip ? steps(selClip.len) : '—'}</b>
                            <button aria-label="Longer ( ] )" disabled={!selClip || clipEnd(selClip) >= total} onClick={props.onLonger}>+</button>
                        </div>
                        <button className="chip-button" disabled={!selClip || selClip.len < 2} title="Split at the cursor ( / )" onClick={props.onSplit}>Split</button>
                        <button className="chip-button" disabled={!selClip} onClick={props.onCopy}>Copy</button>
                        <button className="chip-button" disabled={!canPaste} onClick={props.onPaste}>Paste</button>
                        <button className="chip-button" title="Make this a rest ( . )" onClick={props.onRest}>Rest</button>
                        <button className="chip-button" disabled={!selClip} title="Delete ( ⌫ )" onClick={props.onDelete}>Delete</button>
                        {props.repeatNote && <span className="section-note repeat-note">{props.repeatNote}</span>}
                        <div className="chord-length" role="group" aria-label="Length of new chords">
                            <span className="section-note">New</span>
                            <div className="segmented">
                                {CHORD_LENGTHS.map(l => (
                                    <button key={l.id} aria-pressed={props.chordLength === l.id} title={`Chords you record or place are ${l.label} long`} onClick={() => props.onChordLength(l.id)}>{l.label}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {selClip?.rest && (
                        <div className="dock-row rest-parts" role="group" aria-label="Parts that keep playing through this rest">
                            <span className="section-note">Plays through:</span>
                            {parts.map(p => {
                                const plays = playsThroughRest(selClip, p);
                                return (
                                    <button
                                        key={p.id}
                                        className="chip-button rest-part"
                                        style={{ '--track': p.color } as React.CSSProperties}
                                        aria-pressed={plays}
                                        title={plays ? `${p.name} keeps playing; click to silence it here` : `${p.name} is silent here; click to let it play`}
                                        onClick={() => props.onRestPart(p.id, !plays)}
                                    >
                                        <span className="track-dot" />{p.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

/**
 * The top of a lane's full-height editor on phones: "‹ Lanes" back to the lane list, the part's name,
 * and the section's chord row as read-only chips across its steps, with the playhead.
 */
export const LaneBar: React.FC<{
    name: string;
    color: string;
    /** The chord row, with positions and lengths in steps. */
    chords: Clip[];
    total: number;
    beatsPerBar: number;
    /** Step under the playhead, or -1. */
    playhead: number;
    playing: boolean;
    describe: (clip: Clip) => { symbol: string; numeral: string };
    onBack: () => void;
    /** The editor's own tools, at the end of the bar (the melody grid's octave and zoom). */
    tools?: React.ReactNode;
}> = p => {
    const pct = (steps: number) => `${(steps / p.total) * 100}%`;
    const back = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        // opened from the keyboard: the lane button that had the focus is gone, so the focus comes here
        if (!document.activeElement || document.activeElement === document.body) back.current?.focus({ preventScroll: true });
    }, []);
    return (
        <div className="lane-bar" style={{ '--track': p.color } as React.CSSProperties}>
            <button ref={back} className="chip-button lane-back" title="Back to the lane list" onClick={p.onBack}>‹ Lanes</button>
            <span className="lane-bar-name"><span className="track-dot" />{p.name}</span>
            <div className="chord-strip" role="img" aria-label={`Chords: ${p.chords.filter(c => !c.rest).map(c => p.describe(c).symbol).join(', ') || 'none yet'}`}>
                {Array.from({ length: Math.floor((p.total - 1) / p.beatsPerBar) }, (_, i) => (
                    <i key={i} className="strip-bar" style={{ left: pct((i + 1) * p.beatsPerBar) }} />
                ))}
                {p.chords.map(c => (
                    <span key={c.start} className={`strip-chip ${c.rest ? 'rest' : ''} ${p.playing && p.playhead >= c.start && p.playhead < clipEnd(c) ? 'here' : ''}`} style={{ left: pct(c.start), width: pct(c.len) }}>
                        {c.rest ? '' : p.describe(c).symbol}
                    </span>
                ))}
                {p.playing && p.playhead >= 0 && (
                    // App writes the exact position (--pp, in steps) on every .playhead each frame while playing
                    <span className="playhead strip-head" style={{ '--step': p.playhead, left: `calc(var(--pp, var(--step)) / ${p.total} * 100%)` } as React.CSSProperties} />
                )}
            </div>
            {p.tools}
        </div>
    );
};

export default Progression;
