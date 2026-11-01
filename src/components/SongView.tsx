import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './SongView.css';
import { MenuAnchor, MenuItem, PopMenu, useLongPress } from './PopMenu';
import { ChainSlot, PartState, chainCount, chainLayout, partStateIn, sectionBars } from '../sections';
import { FullSong, MAX_CHAIN, MAX_SECTIONS, PlaybackMode, Section } from '../song';
import { isChordClip } from '../progression';
import { resolveClip } from '../parts';

interface SongViewProps {
    song: FullSong;
    openId: string;
    playMode: PlaybackMode;
    onPlayMode: (m: PlaybackMode) => void;
    playing: boolean;
    /** Chain mode while playing: the slot playing and the song tick. */
    chainPos: { index: number; tick: number } | null;
    /** Loop mode while playing: the section playing, and the one queued for the next bar. */
    playingSection: string | null;
    queued: string | null;
    /** Tap a section tile: open it (zoom into its sequencer). */
    onOpen: (id: string) => void;
    /** Tap a chain block: make its section the open one (and while the chain plays, jump there). */
    onPickSlot: (slot: ChainSlot) => void;
    onNew: () => void;
    onRename: (id: string, name: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    onAddToChain: (id: string) => void;
    onMoveEntry: (i: number, dir: -1 | 1) => void;
    onDuplicateEntry: (i: number) => void;
    onRemoveEntry: (i: number) => void;
    songMenu: React.ReactNode;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Px per bar for chain blocks, and the narrowest block. */
const BAR_PX = 24;
const MIN_BLOCK = 58;

/**
 * One line of chord chips: as many as fit, then a dark "+N" chip. Widths are measured, not estimated:
 * every chip (and a "+N" sample) is laid out in a hidden copy first.
 */
const ChipLine: React.FC<{ labels: string[] }> = ({ labels }) => {
    const row = useRef<HTMLSpanElement>(null);
    const measure = useRef<HTMLSpanElement>(null);
    const [fit, setFit] = useState(labels.length);
    const [fontsTick, setFontsTick] = useState(0);
    useEffect(() => {
        let alive = true;
        document.fonts?.ready.then(() => alive && setFontsTick(t => t + 1));
        return () => {
            alive = false;
        };
    }, []);
    const key = labels.join('|');
    useLayoutEffect(() => {
        const m = measure.current;
        const r = row.current;
        if (!m || !r) return;
        const avail = r.clientWidth;
        const gap = 4;
        const widths = Array.from(m.children).map(c => (c as HTMLElement).offsetWidth);
        const more = widths.pop() ?? 0;
        let used = 0;
        let n = 0;
        for (let i = 0; i < widths.length; i++) {
            const w = widths[i] + (i ? gap : 0);
            const reserve = i < widths.length - 1 ? gap + more : 0;
            if (used + w + reserve > avail) break;
            used += w;
            n++;
        }
        setFit(n);
    }, [key, fontsTick]);
    const rest = labels.length - fit;
    return (
        <span className="chip-line" ref={row}>
            {labels.slice(0, fit).map((l, i) => <span key={`${l}${i}`} className="chord-chip">{l}</span>)}
            {rest > 0 && <span className="chord-chip more">+{rest}</span>}
            {labels.length === 0 && <span className="chip-empty">no chords yet</span>}
            <span className="chip-measure" ref={measure} aria-hidden="true">
                {labels.map((l, i) => <span key={`${l}${i}`} className="chord-chip">{l}</span>)}
                <span className="chord-chip more">+{labels.length}</span>
            </span>
        </span>
    );
};

const SectionTile: React.FC<{
    song: FullSong;
    section: Section;
    open: boolean;
    tag: 'playing' | 'next' | null;
    onOpen: () => void;
    onMenu: (anchor: MenuAnchor) => void;
}> = ({ song, section, open, tag, onOpen, onMenu }) => {
    const press = useLongPress(onMenu);
    const harmony = { key: song.key, scale: song.scale, chords: section.chords };
    const chords = section.chords.filter(isChordClip).map(c => resolveClip(harmony, c).name.symbol);
    const bars = sectionBars(song.timeSignature, section);
    const states: { color: string; state: PartState; name: string }[] = song.parts.map(p => ({ color: p.color, state: partStateIn(song, section, p), name: p.name }));
    const playsLabel = states.filter(s => s.state === 'plays').map(s => s.name).join(', ') || 'nothing';
    return (
        <div className={`sec-tile ${open ? 'open' : ''} ${tag === 'playing' ? 'playing' : ''}`}>
            <button
                className="sec-main"
                aria-label={`Open ${section.name}, ${plural(bars, 'bar')}, ${chords.length ? `chords ${chords.join(' ')}` : 'no chords'}; playing: ${playsLabel}${tag === 'playing' ? '. Playing now' : tag === 'next' ? '. Next' : ''}. Long-press for options`}
                {...press.handlers}
                onClick={() => {
                    if (!press.wasLongPress()) onOpen();
                }}
            >
                <span className="sec-top">
                    <span className="sec-badge">{section.letter}</span>
                    <span className="sec-name">{section.name}</span>
                </span>
                <ChipLine labels={chords} />
                <span className="sec-foot">
                    <span className="sec-parts" aria-hidden="true">
                        {states.map((s, i) => <i key={i} className={s.state} style={{ '--track': s.color } as React.CSSProperties} />)}
                    </span>
                    {tag === 'playing' ? <span className="sec-tag playing">▶ PLAYING</span>
                        : tag === 'next' ? <span className="sec-tag next">NEXT</span>
                            : <span className="sec-bars">{plural(bars, 'bar')}</span>}
                </span>
            </button>
            <button className="sec-more" aria-label={`${section.name}: options`} aria-haspopup="menu" onClick={e => onMenu({ rect: e.currentTarget.getBoundingClientRect() })}>⋯</button>
        </div>
    );
};

const ChainBlock: React.FC<{
    slot: ChainSlot;
    open: boolean;
    state: 'playing' | 'done' | null;
    /** 0..1 through the block while it plays. */
    progress: number;
    onPick: () => void;
    onMenu: (anchor: MenuAnchor) => void;
}> = ({ slot, open, state, progress, onPick, onMenu }) => {
    const press = useLongPress(onMenu);
    return (
        <button
            className={`chain-block ${open ? 'open' : ''} ${state ?? ''}`}
            style={{ flexBasis: Math.max(MIN_BLOCK, slot.bars * BAR_PX) }}
            aria-label={`${slot.section.name} from bar ${slot.startBar}${state === 'playing' ? ', playing' : ''}. Long-press to move, duplicate or remove`}
            aria-current={state === 'playing' ? 'step' : undefined}
            data-index={slot.index}
            {...press.handlers}
            onClick={() => {
                if (!press.wasLongPress()) onPick();
            }}
        >
            <span className="cb-bar">{slot.startBar}</span>
            <span className="cb-name">{slot.section.name}</span>
            {state === 'playing' && <span className="cb-head" style={{ left: `${progress * 100}%` }} aria-hidden="true" />}
        </button>
    );
};

/** A section's rename box, inside its menu. */
const RenameBox: React.FC<{ name: string; onSave: (name: string) => void }> = ({ name, onSave }) => {
    const [text, setText] = useState(name);
    return (
        <form
            className="rename-box"
            onSubmit={e => {
                e.preventDefault();
                onSave(text);
            }}
        >
            <input aria-label="Section name" value={text} maxLength={24} autoFocus onChange={e => setText(e.target.value)} onFocus={e => e.currentTarget.select()} />
            <button type="submit" className="chip-button">Rename</button>
        </form>
    );
};

/**
 * Song mode's top level: the sections as tiles (tap one to open it), and the chain, the running
 * order, as blocks as wide as they are long. While the chain plays it follows the playhead.
 */
const SongView: React.FC<SongViewProps> = p => {
    const { song } = p;
    const layout = chainLayout(song);
    const totalBars = layout.reduce((m, s) => m + s.bars, 0);
    const [menu, setMenu] = useState<{ anchor: MenuAnchor; kind: 'section'; id: string; renaming?: boolean } | { anchor: MenuAnchor; kind: 'slot'; index: number } | null>(null);
    const chainRow = useRef<HTMLDivElement>(null);

    const chainPlaying = p.playing && p.playMode === 'chain' && p.chainPos !== null;
    const cur = chainPlaying ? layout[p.chainPos!.index] : undefined;
    const nextSlot = cur ? layout[cur.index + 1] : undefined;
    const playingId = chainPlaying ? cur?.section.id : p.playing ? p.playingSection : null;
    const nextId = chainPlaying ? nextSlot?.section.id : p.queued;

    // keep the playing block in view
    useEffect(() => {
        const row = chainRow.current;
        if (!row || !cur) return;
        const el = row.querySelector<HTMLElement>(`[data-index="${cur.index}"]`);
        if (!el) return;
        const left = el.offsetLeft - row.offsetLeft;
        if (left < row.scrollLeft + 8 || left + el.offsetWidth > row.scrollLeft + row.clientWidth - 8) {
            row.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
        }
    }, [cur?.index]);

    const sectionItems = (id: string): MenuItem[] => {
        const sec = song.sections.find(s => s.id === id);
        return [
            { label: 'Rename…', keepOpen: true, onSelect: () => setMenu(m => (m && m.kind === 'section' ? { ...m, renaming: true } : m)) },
            { label: 'Duplicate', disabled: song.sections.length >= MAX_SECTIONS, onSelect: () => p.onDuplicate(id) },
            { label: 'Add to chain', hint: `×${chainCount(song, id)} now`, disabled: song.chain.length >= MAX_CHAIN, onSelect: () => p.onAddToChain(id) },
            { label: 'Delete', hint: 'undoable', danger: true, disabled: song.sections.length <= 1, onSelect: () => p.onDelete(id) },
        ].filter(() => !!sec);
    };
    const slotItems = (i: number): MenuItem[] => [
        { label: 'Move ←', disabled: i === 0, onSelect: () => p.onMoveEntry(i, -1) },
        { label: 'Move →', disabled: i >= song.chain.length - 1, onSelect: () => p.onMoveEntry(i, 1) },
        { label: 'Duplicate', disabled: song.chain.length >= MAX_CHAIN, onSelect: () => p.onDuplicateEntry(i) },
        { label: 'Remove', danger: true, disabled: song.chain.length <= 1, onSelect: () => p.onRemoveEntry(i) },
    ];
    const openName = song.sections.find(s => s.id === p.openId)?.name ?? '';

    let status: React.ReactNode;
    if (chainPlaying && cur) {
        const bar = cur.startBar + Math.floor((p.chainPos!.tick - cur.start) / (cur.len / Math.max(1, cur.bars)));
        status = (
            <>
                <b>bar {Math.min(bar, totalBars)} / {totalBars}</b>
                <span className="section-note"> · {cur.section.name}{nextSlot ? ` · next ${nextSlot.section.name}` : ''}</span>
            </>
        );
    } else if (p.playing && p.playMode === 'loop' && p.playingSection) {
        const name = (id: string | null) => song.sections.find(s => s.id === id)?.name ?? '';
        status = (
            <>
                <b>looping {name(p.playingSection)}</b>
                {p.queued && <span className="section-note"> · next {name(p.queued)} at the bar line</span>}
            </>
        );
    } else {
        status = <span className="section-note">{plural(song.sections.length, 'section')} · chain of {song.chain.length} · {plural(totalBars, 'bar')}</span>;
    }

    return (
        <section className="panel song-view" aria-label="Song: sections and chain">
            <div className="sv-head">
                <h2 className="seq-title">SONG</h2>
                <span className="sv-status" aria-live="polite">{status}</span>
                <span className="sv-space" />
                <div className="segmented sv-mode" role="group" aria-label="Playback">
                    <button aria-pressed={p.playMode === 'chain'} title="Play the sections in chain order" onClick={() => p.onPlayMode('chain')}>Chain</button>
                    <button aria-pressed={p.playMode === 'loop'} title="Loop the open section" onClick={() => p.onPlayMode('loop')}>Loop</button>
                </div>
                {p.songMenu}
            </div>

            <div className="sv-label">
                <span className="pd-label">Sections</span>
                <span className="section-note sv-hint">tap one to open it · long-press for more</span>
            </div>
            <div className="sec-row">
                {song.sections.map(sec => (
                    <SectionTile
                        key={sec.id}
                        song={song}
                        section={sec}
                        open={sec.id === p.openId}
                        tag={sec.id === playingId ? 'playing' : sec.id === nextId ? 'next' : null}
                        onOpen={() => p.onOpen(sec.id)}
                        onMenu={anchor => setMenu({ anchor, kind: 'section', id: sec.id })}
                    />
                ))}
                <button className="sec-new" disabled={song.sections.length >= MAX_SECTIONS} onClick={p.onNew} aria-label="New section">
                    <span className="add-plus" aria-hidden="true">+</span>
                    <span>New</span>
                </button>
            </div>

            <div className="sv-label">
                <span className="pd-label">Chain</span>
                <span className="section-note sv-hint">{chainPlaying ? 'tap a block to jump there' : 'tap a block to open its section · long-press to move · + adds the open section'}</span>
            </div>
            <div className="chain-row" ref={chainRow}>
                {layout.map(slot => {
                    const state = cur ? (slot.index === cur.index ? 'playing' : slot.index < cur.index ? 'done' : null) : null;
                    return (
                        <ChainBlock
                            key={slot.index}
                            slot={slot}
                            open={slot.section.id === p.openId}
                            state={state}
                            progress={state === 'playing' ? Math.min(1, (p.chainPos!.tick - slot.start) / slot.len) : 0}
                            onPick={() => p.onPickSlot(slot)}
                            onMenu={anchor => setMenu({ anchor, kind: 'slot', index: slot.index })}
                        />
                    );
                })}
                <button className="chain-add" disabled={song.chain.length >= MAX_CHAIN} aria-label={`Add ${openName} to the chain`} title={`Add ${openName} to the chain`} onClick={() => p.onAddToChain(p.openId)}>+</button>
            </div>

            {menu?.kind === 'section' && (
                <PopMenu anchor={menu.anchor} label={`${song.sections.find(s => s.id === menu.id)?.name ?? ''} options`} items={menu.renaming ? [] : sectionItems(menu.id)} onClose={() => setMenu(null)}>
                    {menu.renaming && <RenameBox
                        name={song.sections.find(s => s.id === menu.id)?.name ?? ''}
                        onSave={name => {
                            p.onRename(menu.id, name);
                            setMenu(null);
                        }}
                    />}
                </PopMenu>
            )}
            {menu?.kind === 'slot' && (
                <PopMenu anchor={menu.anchor} label={`${layout[menu.index]?.section.name ?? ''} in the chain`} items={slotItems(menu.index)} onClose={() => setMenu(null)} />
            )}
        </section>
    );
};

export default SongView;
