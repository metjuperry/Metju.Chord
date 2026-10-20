import React from 'react';
import './Progression.css';
import { BEATS_PER_BAR, MAX_TRACKS, STEPS_PER_ROW, Clip, Track, clipAt, clipEnd } from '../progression';
import { INSTRUMENTS, InstrumentId } from '../audio/instruments';

/** A track as the grid shows it: clip positions and lengths in steps. */
export type TrackView = Track;

interface ProgressionProps {
    total: number;
    tracks: TrackView[];
    selectedTrack: string;
    selected: number;
    /** Step under the playhead. */
    playhead: number;
    playing: boolean;
    loop: boolean;
    recording: boolean;
    canPaste: boolean;
    describe: (clip: Clip) => { symbol: string; numeral: string; sound: string };
    /** How new recordings will be played, e.g. "Arp up 1/8". */
    currentSound: string;
    onSelect: (step: number, track: string) => void;
    onSelectTrack: (track: string) => void;
    onUpdateTrack: (track: string, patch: Partial<Pick<Track, 'instrument' | 'volume' | 'mute' | 'solo' | 'name'>>) => void;
    onAddTrack: () => void;
    onRemoveTrack: (track: string) => void;
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

const steps = (n: number) => (n === 1 ? '1 step' : `${n} steps`);

const Icon = {
    first: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="2" height="10" /><path d="M12 2v10L5 7z" /></svg>,
    prev: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M11 2v10L4 7z" /></svg>,
    next: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2v10l7-5z" /></svg>,
    play: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 1.5v11L12.5 7z" /></svg>,
    stop: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" /></svg>,
    loop: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 9V7a3 3 0 0 1 3-3h7M11 2l2 2-2 2M13 7v2a3 3 0 0 1-3 3H3M5 14l-2-2 2-2" /></svg>,
};

const TrackStrip: React.FC<{
    track: TrackView;
    selected: boolean;
    silenced: boolean;
    canRemove: boolean;
    onSelect: () => void;
    onUpdate: ProgressionProps['onUpdateTrack'];
    onRemove: () => void;
}> = ({ track, selected, silenced, canRemove, onSelect, onUpdate, onRemove }) => (
    <div className={`track-strip ${selected ? 'selected' : ''} ${silenced ? 'silenced' : ''}`} style={{ '--track': track.color } as React.CSSProperties}>
        <button className="track-pick" aria-pressed={selected} onClick={onSelect} title="Play and record on this track">
            <span className="track-dot" />
            <span className="track-name">{track.name}</span>
        </button>
        <select
            aria-label={`${track.name} instrument`}
            value={track.instrument}
            onChange={e => onUpdate(track.id, { instrument: e.target.value as InstrumentId })}
        >
            {INSTRUMENTS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
        <label className="track-volume" title={`Volume ${track.volume > 0 ? '+' : ''}${track.volume} dB`}>
            <span className="visually-hidden">{track.name} volume</span>
            <input type="range" min={-24} max={6} step={1} value={track.volume} onChange={e => onUpdate(track.id, { volume: parseInt(e.target.value, 10) })} />
        </label>
        <button className="ms-button" aria-pressed={track.mute} aria-label={`Mute ${track.name}`} title="Mute in playback" onClick={() => onUpdate(track.id, { mute: !track.mute })}>M</button>
        <button className="ms-button solo" aria-pressed={track.solo} aria-label={`Solo ${track.name}`} title="Solo in playback" onClick={() => onUpdate(track.id, { solo: !track.solo })}>S</button>
        {canRemove && (
            <button className="ms-button remove" aria-label={`Remove ${track.name}`} title="Remove track" onClick={onRemove}>×</button>
        )}
    </div>
);

const Progression: React.FC<ProgressionProps> = props => {
    const { total, tracks, selectedTrack, selected, playhead, playing, loop, recording, canPaste, describe } = props;
    const current = tracks.find(t => t.id === selectedTrack) ?? tracks[0];
    const selClip = clipAt(current.clips, selected);
    const selInfo = selClip && !selClip.rest ? describe(selClip) : null;
    const rows = Math.ceil(total / STEPS_PER_ROW);
    const cols = { gridTemplateColumns: `repeat(${STEPS_PER_ROW}, minmax(0, 1fr))` };
    const anySolo = tracks.some(t => t.solo);
    const silenced = (t: TrackView) => (anySolo ? !t.solo : t.mute);

    /** One track's lane within a row. A chord held past the end of a row continues in the next row. */
    const renderLane = (track: TrackView, rowStart: number, rowEnd: number) => {
        const isCurrent = track.id === current.id;
        const items: React.ReactNode[] = [];
        for (let step = rowStart; step < rowEnd;) {
            const clip = clipAt(track.clips, step);
            if (!clip) {
                const s = step;
                const sel = isCurrent && selected === s;
                items.push(
                    <button
                        key={`e${s}`}
                        className={`cell empty ${sel ? 'selected' : ''}`}
                        style={{ gridColumn: `${s - rowStart + 1} / span 1` }}
                        aria-label={`${track.name}, step ${s + 1}, empty`}
                        aria-pressed={sel}
                        onClick={() => props.onSelect(s, track.id)}
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
            const isSel = isCurrent && selected >= clip.start && selected < clipEnd(clip);
            const isHere = playhead >= clip.start && playhead < clipEnd(clip);
            const info = clip.rest ? null : describe(clip);
            const held = !clip.rest && clip.len > 1;
            items.push(
                <div key={`c${segStart}`} className="clip-wrap" style={{ gridColumn: `${segStart - rowStart + 1} / span ${segLen}` }}>
                    <button
                        className={`cell clip ${clip.rest ? 'rest' : ''} ${isSel ? 'selected' : ''} ${isHere && playing ? 'here' : ''} ${continued ? 'continued' : ''} ${continues ? 'continues' : ''}`}
                        aria-pressed={isSel}
                        aria-label={`${track.name}: ${info ? info.symbol : 'Rest'}, step ${clip.start + 1}${clip.len > 1 ? ` to ${clipEnd(clip)}` : ''}${held ? ', held' : ''}${continued ? ', continued from the row above' : ''}`}
                        onClick={() => props.onSelect(clip.start, track.id)}
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
                        {info && info.sound && !continued && <span className="clip-sound">{info.sound}</span>}
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
            <div
                key={track.id}
                className={`lane-row ${isCurrent ? 'current' : ''} ${silenced(track) ? 'silenced' : ''}`}
                style={{ '--track': track.color } as React.CSSProperties}
            >
                <button className="lane-label" onClick={() => props.onSelectTrack(track.id)} aria-label={`Select ${track.name}`}>
                    <span className="track-dot" />
                    <span>{track.name}</span>
                </button>
                <div className="lane" style={cols}>{items}</div>
            </div>
        );
    };

    const renderRow = (row: number) => {
        const rowStart = row * STEPS_PER_ROW;
        const rowEnd = rowStart + STEPS_PER_ROW;
        const headHere = playhead >= rowStart && playhead < rowEnd;
        return (
            <div key={row} className="seq-row">
                <div className="lane-scroll">
                    <div className="lane-inner">
                        <div className="lane-row ruler-row">
                            <span className="lane-label static">{rowStart + 1}–{rowEnd}</span>
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
                        </div>
                        {tracks.map(t => renderLane(t, rowStart, rowEnd))}
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
                        ? `Play a pad to write it on ${current.name}, step ${selected + 1}${props.currentSound ? ` (${props.currentSound})` : ''}; the cursor moves on.`
                        : `Pads play and record on the selected track (${current.name}). Select a step, press Record, then play pads.`}
                </span>
                <div className="bars">
                    <span className="section-note">{total / BEATS_PER_BAR} bars · 4/4</span>
                    {rows > 1 && <button className="chip-button" onClick={props.onRemoveRow}>− Remove row</button>}
                    <button className="chip-button" onClick={props.onAddRow}>+ Add row</button>
                </div>
            </div>

            <div className="track-bar" role="group" aria-label="Tracks">
                {tracks.map(t => (
                    <TrackStrip
                        key={t.id}
                        track={t}
                        selected={t.id === current.id}
                        silenced={silenced(t)}
                        canRemove={tracks.length > 1}
                        onSelect={() => props.onSelectTrack(t.id)}
                        onUpdate={props.onUpdateTrack}
                        onRemove={() => props.onRemoveTrack(t.id)}
                    />
                ))}
                {tracks.length < MAX_TRACKS && (
                    <button className="chip-button add-track" onClick={props.onAddTrack}>+ Track</button>
                )}
            </div>

            <div className="seq-rows">{Array.from({ length: rows }, (_, r) => renderRow(r))}</div>

            <div className="legend" aria-hidden="true">
                <span><i className="lg-strike" />chord is struck</span>
                <span><i className="lg-sustain" />keeps ringing (held, not struck again)</span>
                <span><i className="lg-passed" />already played</span>
            </div>

            <div className="toolbar" role="toolbar" aria-label="Chord actions">
                <span className="sel-label">
                    <span className="track-dot" style={{ background: current.color }} />
                    {current.name} · {selClip && selClip.len > 1 ? `Steps ${selClip.start + 1}–${clipEnd(selClip)}` : `Step ${selected + 1}`}
                    <span className="section-note"> · {selClip ? (selInfo ? [selInfo.symbol, selInfo.sound].filter(Boolean).join(' · ') : 'rest') : 'empty'}</span>
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
                <button className="chip-button" disabled={!selInfo} onClick={props.onRestamp} title="Re-apply the current key and chord/arp settings to this chord">Use current settings</button>
                <button className="chip-button" disabled={!selClip} onClick={props.onDelete}>Delete <kbd>⌫</kbd></button>
                <button className="chip-button danger" disabled={tracks.every(t => t.clips.length === 0)} onClick={props.onClearAll}>Clear all</button>
            </div>
        </section>
    );
};

export default Progression;
