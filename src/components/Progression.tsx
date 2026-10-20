import React from 'react';
import './Progression.css';
import { BEATS_PER_BAR, STEPS_PER_ROW, Clip, clipAt, clipEnd } from '../progression';

interface ProgressionProps {
    total: number;
    clips: Clip[];
    selected: number;
    /** Beat under the playhead. */
    playhead: number;
    playing: boolean;
    loop: boolean;
    recording: boolean;
    canPaste: boolean;
    describe: (clip: Clip) => { symbol: string; numeral: string; sound: string };
    /** The sound new recordings get, e.g. "E-Piano". */
    currentSound: string;
    onSelect: (beat: number) => void;
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
    onRestamp: () => void;
    onClearAll: () => void;
}

const beats = (n: number) => (n === 1 ? '1 step' : `${n} steps`);

const Icon = {
    first: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="2" height="10" /><path d="M12 2v10L5 7z" /></svg>,
    prev: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M11 2v10L4 7z" /></svg>,
    next: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2v10l7-5z" /></svg>,
    play: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 1.5v11L12.5 7z" /></svg>,
    stop: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" /></svg>,
    loop: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 9V7a3 3 0 0 1 3-3h7M11 2l2 2-2 2M13 7v2a3 3 0 0 1-3 3H3M5 14l-2-2 2-2" /></svg>,
};

const Progression: React.FC<ProgressionProps> = props => {
    const { total, clips, selected, playhead, playing, loop, recording, canPaste, describe } = props;
    const selClip = clipAt(clips, selected);
    const selInfo = selClip && !selClip.rest ? describe(selClip) : null;
    const rows = Math.ceil(total / STEPS_PER_ROW);
    const cols = { gridTemplateColumns: `repeat(${STEPS_PER_ROW}, minmax(0, 1fr))` };

    /** One row of 8 steps. A chord held past the end of a row continues at the start of the next one. */
    const renderRow = (row: number) => {
        const rowStart = row * STEPS_PER_ROW;
        const rowEnd = rowStart + STEPS_PER_ROW;
        const items: React.ReactNode[] = [];
        for (let beat = rowStart; beat < rowEnd;) {
            const clip = clipAt(clips, beat);
            if (!clip) {
                const b = beat;
                items.push(
                    <button
                        key={`e${b}`}
                        className={`cell empty ${selected === b ? 'selected' : ''}`}
                        style={{ gridColumn: `${b - rowStart + 1} / span 1` }}
                        aria-label={`Step ${b + 1}, empty`}
                        aria-pressed={selected === b}
                        onClick={() => props.onSelect(b)}
                    >
                        +
                    </button>,
                );
                beat++;
                continue;
            }
            const segStart = beat;
            const segEnd = Math.min(clipEnd(clip), rowEnd);
            const segLen = segEnd - segStart;
            const continued = clip.start < segStart;
            const continues = clipEnd(clip) > rowEnd;
            const isSel = selected >= clip.start && selected < clipEnd(clip);
            const isHere = playhead >= clip.start && playhead < clipEnd(clip);
            const info = clip.rest ? null : describe(clip);
            const held = !clip.rest && clip.len > 1;
            items.push(
                <div key={`c${segStart}`} className="clip-wrap" style={{ gridColumn: `${segStart - rowStart + 1} / span ${segLen}` }}>
                    <button
                        className={`cell clip ${clip.rest ? 'rest' : ''} ${isSel ? 'selected' : ''} ${isHere && playing ? 'here' : ''} ${continued ? 'continued' : ''} ${continues ? 'continues' : ''}`}
                        aria-pressed={isSel}
                        aria-label={`${info ? info.symbol : 'Rest'}, step ${clip.start + 1}${clip.len > 1 ? ` to ${clipEnd(clip)}` : ''}${held ? ', held' : ''}${continued ? ', continued from the row above' : ''}`}
                        onClick={() => props.onSelect(clip.start)}
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
                            {!continued && <span className={held ? 'len held' : 'len'}>{held ? `held · ${beats(clip.len)}` : beats(clip.len)}</span>}
                        </span>
                        <span className="clip-name">{info ? info.symbol : 'Rest'}</span>
                        {info && !continued && <span className="clip-sound">{info.sound}</span>}
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
            beat = segEnd;
        }
        const headHere = playhead >= rowStart && playhead < rowEnd;
        return (
            <div key={row} className="seq-row">
                <div className="row-label" aria-hidden="true">{rowStart + 1}–{rowEnd}</div>
                <div className="lane-scroll">
                    <div className="lane-inner">
                        <div className="ruler" style={cols} aria-hidden="true">
                            {Array.from({ length: STEPS_PER_ROW }, (_, j) => {
                                const i = rowStart + j;
                                return (
                                    <div key={i} className={`tick ${i % BEATS_PER_BAR === 0 ? 'down' : ''} ${Math.floor(i / BEATS_PER_BAR) % 2 === 0 ? 'shade' : ''} ${i === playhead ? 'head' : ''}`}>
                                        {i % BEATS_PER_BAR === 0 ? <b>{i + 1}</b> : <span>{i + 1}</span>}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="lane" style={cols}>{items}</div>
                        {headHere && (
                            <div className="playhead" aria-hidden="true" style={{ left: `calc(${playhead - rowStart} * (100% + 4px) / ${STEPS_PER_ROW})` }} />
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <section className="panel progression" aria-label="Progression">
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
                        ? `Play a pad to write it on step ${selected + 1} with ${props.currentSound}; the cursor moves on.`
                        : 'Each chord keeps the sound it was recorded with. Select a step, press Record, then play pads.'}
                </span>
                <div className="bars">
                    <span className="section-note">{total / BEATS_PER_BAR} bars · 4/4</span>
                    {rows > 1 && <button className="chip-button" onClick={props.onRemoveRow}>− Remove row</button>}
                    <button className="chip-button" onClick={props.onAddRow}>+ Add row</button>
                </div>
            </div>

            <div className="seq-rows">{Array.from({ length: rows }, (_, r) => renderRow(r))}</div>

            <div className="legend" aria-hidden="true">
                <span><i className="lg-strike" />chord is struck</span>
                <span><i className="lg-sustain" />keeps ringing (held, not struck again)</span>
                <span><i className="lg-passed" />already played</span>
            </div>

            <div className="toolbar" role="toolbar" aria-label="Chord actions">
                <span className="sel-label">
                    {selClip && selClip.len > 1 ? `Steps ${selClip.start + 1}–${clipEnd(selClip)}` : `Step ${selected + 1}`}
                    <span className="section-note"> · {selClip ? (selInfo ? `${selInfo.symbol} · ${selInfo.sound}` : 'rest') : 'empty'}</span>
                </span>
                <div className="length" role="group" aria-label="Length">
                    <span>Length</span>
                    <button aria-label="Shorter" disabled={!selClip || selClip.len < 2} onClick={props.onShorter}>−</button>
                    <b>{selClip ? beats(selClip.len) : '—'}</b>
                    <button aria-label="Longer" disabled={!selClip || clipEnd(selClip) >= total} onClick={props.onLonger}>+</button>
                    <kbd className="kbd">[ ]</kbd>
                </div>
                <button className="chip-button" disabled={!selClip || selClip.len < 2} onClick={props.onSplit}>Split at cursor <kbd>/</kbd></button>
                <button className="chip-button" disabled={!selClip} onClick={props.onCopy}>Copy</button>
                <button className="chip-button" disabled={!canPaste} onClick={props.onPaste}>Paste</button>
                <button className="chip-button" onClick={props.onRest}>Make rest <kbd>.</kbd></button>
                <button className="chip-button" disabled={!selInfo} onClick={props.onRestamp} title={`Re-record this chord's sound as ${props.currentSound}`}>Use current sound</button>
                <button className="chip-button" disabled={!selClip} onClick={props.onDelete}>Delete <kbd>⌫</kbd></button>
                <button className="chip-button danger" disabled={clips.length === 0} onClick={props.onClearAll}>Clear all</button>
            </div>
        </section>
    );
};

export default Progression;
