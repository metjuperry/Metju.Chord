import React from 'react';
import './Progression.css';
import { BEATS_PER_BAR, Clip, clipAt, clipEnd } from '../progression';

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
    describe: (clip: Clip) => { symbol: string; numeral: string };
    onSelect: (beat: number) => void;
    onTogglePlay: () => void;
    onFirst: () => void;
    onPrev: () => void;
    onNext: () => void;
    onToggleLoop: () => void;
    onToggleRecord: () => void;
    onAddBar: () => void;
    onRemoveBar: () => void;
    onLonger: () => void;
    onShorter: () => void;
    onSplit: () => void;
    onCopy: () => void;
    onPaste: () => void;
    onRest: () => void;
    onDelete: () => void;
    onClearAll: () => void;
}

const beats = (n: number) => (n === 1 ? '1 beat' : `${n} beats`);

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
    const cols = { gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` };

    // Lane items in order: a clip where one starts, an empty cell everywhere else
    const lane: React.ReactNode[] = [];
    for (let beat = 0; beat < total;) {
        const clip = clips.find(c => c.start === beat);
        if (!clip) {
            const b = beat;
            lane.push(
                <button
                    key={`e${b}`}
                    className={`cell empty ${selected === b ? 'selected' : ''}`}
                    style={{ gridColumn: `${b + 1} / span 1` }}
                    aria-label={`Beat ${b + 1}, empty`}
                    aria-pressed={selected === b}
                    onClick={() => props.onSelect(b)}
                >
                    +
                </button>,
            );
            beat++;
            continue;
        }
        const isSel = selected >= clip.start && selected < clipEnd(clip);
        const isHere = playhead >= clip.start && playhead < clipEnd(clip);
        const info = clip.rest ? null : describe(clip);
        const held = !clip.rest && clip.len > 1;
        lane.push(
            <div key={`c${clip.start}`} className="clip-wrap" style={{ gridColumn: `${clip.start + 1} / span ${clip.len}` }}>
                <button
                    className={`cell clip ${clip.rest ? 'rest' : ''} ${isSel ? 'selected' : ''} ${isHere && playing ? 'here' : ''}`}
                    aria-pressed={isSel}
                    aria-label={`${info ? info.symbol : 'Rest'}, beat ${clip.start + 1}${clip.len > 1 ? ` to ${clipEnd(clip)}` : ''}${held ? ', held' : ''}`}
                    onClick={() => props.onSelect(clip.start)}
                >
                    {!clip.rest && <span className="onset" />}
                    <span className="beats">
                        {Array.from({ length: clip.len }, (_, i) => {
                            const abs = clip.start + i;
                            const passed = playing && isHere && abs <= playhead;
                            return <span key={i} className={`beat ${i === 0 ? 'first' : ''} ${passed ? 'passed' : ''} ${playing && abs === playhead ? 'now' : ''}`} />;
                        })}
                    </span>
                    <span className="clip-top">
                        <span>{info?.numeral ?? ''}</span>
                        <span className={held ? 'len held' : 'len'}>{held ? `held · ${beats(clip.len)}` : beats(clip.len)}</span>
                    </span>
                    <span className="clip-name">{info ? info.symbol : 'Rest'}</span>
                    <span className="envelope" aria-hidden="true">
                        {Array.from({ length: clip.len }, (_, i) => {
                            const abs = clip.start + i;
                            const passed = playing && isHere && abs <= playhead;
                            return (
                                <span key={i} className={`env ${i === 0 ? 'first' : ''} ${i === clip.len - 1 ? 'last' : ''} ${passed ? 'passed' : ''}`}>
                                    {i === 0 && !clip.rest && <span className="strike" />}
                                </span>
                            );
                        })}
                    </span>
                </button>
                {isSel && !clip.rest && clipEnd(clip) < total && (
                    <button className="grip" aria-label="Hold one beat longer" title="Hold one beat longer ( ] )" onClick={props.onLonger}>
                        <svg width="8" height="18" viewBox="0 0 8 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2.5 3v12M5.5 3v12" /></svg>
                    </button>
                )}
            </div>,
        );
        beat = clipEnd(clip);
    }

    return (
        <section className="panel progression" aria-label="Progression">
            <div className="prog-head">
                <h2 className="eyebrow">Progression</h2>
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
                        ? `Play a pad to write it on beat ${selected + 1}; the cursor moves on.`
                        : 'Select a beat, press Record, then play pads.'}
                </span>
                <div className="bars">
                    <span className="section-note">{total / BEATS_PER_BAR} bars · 4/4</span>
                    <button className="chip-button" onClick={props.onRemoveBar} disabled={total <= BEATS_PER_BAR}>− Bar</button>
                    <button className="chip-button" onClick={props.onAddBar}>+ Bar</button>
                </div>
            </div>

            <div className="lane-scroll">
                <div className="lane-inner" style={{ minWidth: `${total * 76}px` }}>
                    <div className="ruler" style={cols} aria-hidden="true">
                        {Array.from({ length: total }, (_, i) => (
                            <div key={i} className={`tick ${i % BEATS_PER_BAR === 0 ? 'down' : ''} ${Math.floor(i / BEATS_PER_BAR) % 2 === 0 ? 'shade' : ''} ${i === playhead ? 'head' : ''}`}>
                                {i % BEATS_PER_BAR === 0 ? <b>{i / BEATS_PER_BAR + 1}</b> : <span>.{(i % BEATS_PER_BAR) + 1}</span>}
                            </div>
                        ))}
                    </div>
                    <div className="lane" style={cols}>{lane}</div>
                    <div className="playhead" aria-hidden="true" style={{ left: `calc(${playhead} * (100% + 4px) / ${total})` }} />
                </div>
            </div>

            <div className="legend" aria-hidden="true">
                <span><i className="lg-strike" />chord is struck</span>
                <span><i className="lg-sustain" />keeps ringing (held, not struck again)</span>
                <span><i className="lg-passed" />already played</span>
            </div>

            <div className="toolbar" role="toolbar" aria-label="Chord actions">
                <span className="sel-label">
                    {selClip && selClip.len > 1 ? `Beats ${selClip.start + 1}–${clipEnd(selClip)}` : `Beat ${selected + 1}`}
                    <span className="section-note"> · {selClip ? (selInfo ? selInfo.symbol : 'rest') : 'empty'}</span>
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
                <button className="chip-button" disabled={!selClip} onClick={props.onDelete}>Delete <kbd>⌫</kbd></button>
                <button className="chip-button danger" disabled={clips.length === 0} onClick={props.onClearAll}>Clear all</button>
            </div>
        </section>
    );
};

export default Progression;
