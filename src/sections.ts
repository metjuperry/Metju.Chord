import { emptyPattern, isEmptyPattern } from './drums';
import { Part, audibleParts } from './parts';
import { isChordClip } from './progression';
import {
    ChainEntry, FullSong, MAX_CHAIN, MAX_SECTIONS, PartContent, Section, Song, TimeSignature, changeTimeSignature, contentOf, letterFor,
    stepsPerRow, stripContent, ticksPerStep,
} from './song';

// ---- the projection: one section as an ordinary single-section Song, and edits back --------------

export const findSection = (song: FullSong, id: string): Section => song.sections.find(s => s.id === id) ?? song.sections[0];

/** A part with its content for one section filled in (an empty melody / pattern when the section has none). */
function fill(p: Part, c: PartContent | undefined): Part {
    if (p.kind === 'melody') return c?.notes ? { ...p, notes: c.notes } : p.notes.length ? { ...p, notes: [] } : p;
    if (p.kind === 'drums') return c?.drums ? { ...p, drums: c.drums } : p;
    return p;
}

/**
 * Section `id` of `song` as an ordinary single-section Song: its chords and length, the song-wide key,
 * tempo, time signature and effects, and the parts with this section's notes and drum patterns. The
 * sequencer, the melody and drum editors, recording and playback all work on this, unchanged.
 */
export function sectionView(song: FullSong, id: string): Song {
    const sec = findSection(song, id);
    return {
        key: song.key,
        scale: song.scale,
        bpm: song.bpm,
        timeSignature: song.timeSignature,
        space: song.space,
        chords: sec.chords,
        steps: sec.steps,
        parts: song.parts.map(p => fill(p, sec.content[p.id])),
    };
}

/** Same keys, same values (one level deep), apart from `skip`: a part whose sound didn't change keeps its object. */
function shallowEqual(a: object, b: object, skip: string[] = []): boolean {
    const ka = Object.keys(a).filter(k => !skip.includes(k));
    const kb = Object.keys(b).filter(k => !skip.includes(k));
    return ka.length === kb.length && ka.every(k => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

const sameContent = (a: Section['content'], b: Section['content']) =>
    shallowEqual(a, b) || (Object.keys(a).length === Object.keys(b).length
        && Object.keys(a).every(k => b[k] && a[k].notes === b[k].notes && a[k].drums === b[k].drums));

/** `rec` without the keys that aren't parts any more (same object when nothing goes). */
function onlyParts<T>(rec: { [id: string]: T }, ids: Set<string>): { [id: string]: T } {
    const keys = Object.keys(rec);
    return keys.every(k => ids.has(k)) ? rec : Object.fromEntries(keys.filter(k => ids.has(k)).map(k => [k, rec[k]]));
}

/**
 * Write an edited section view back: its chords, length and content go into section `id`; key, scale,
 * tempo, time signature, effects and the parts' sound go song-wide. A part removed in the view loses its
 * content and mutes in every section. Unchanged parts and sections keep their objects.
 */
export function applySectionEdit(song: FullSong, id: string, view: Song): FullSong {
    const sec = findSection(song, id);
    const content: Section['content'] = {};
    view.parts.forEach(p => {
        const c = contentOf(p);
        if (c) content[p.id] = c;
    });
    const parts = view.parts.map(p => {
        const stripped = stripContent(p);
        const old = song.parts.find(o => o.id === p.id);
        return old && shallowEqual(old, stripped, ['notes', 'drums']) ? old : stripped;
    });
    const ids = new Set(parts.map(p => p.id));
    const sections = song.sections.map(s => {
        if (s.id !== sec.id) {
            const c = onlyParts(s.content, ids);
            const m = onlyParts(s.mutes, ids);
            return c === s.content && m === s.mutes ? s : { ...s, content: c, mutes: m };
        }
        const next = {
            ...s,
            chords: view.chords,
            steps: view.steps,
            content: sameContent(content, s.content) ? s.content : content,
            mutes: onlyParts(s.mutes, ids),
        };
        return shallowEqual(next, s) ? s : next;
    });
    return {
        key: view.key,
        scale: view.scale,
        bpm: view.bpm,
        timeSignature: view.timeSignature,
        space: view.space,
        parts: parts.length === song.parts.length && parts.every((p, i) => p === song.parts[i]) ? song.parts : parts,
        sections: sections.every((s, i) => s === song.sections[i]) ? song.sections : sections,
        chain: song.chain,
    };
}

// ---- sections ------------------------------------------------------------------------------------

export const sectionTicks = (song: FullSong, sec: Section) => sec.steps * ticksPerStep(song.timeSignature);
export const sectionBars = (ts: TimeSignature, sec: Section) => Math.round((sec.steps / ts.beats) * 10) / 10;

/** How many times a section is in the chain. */
export const chainCount = (song: FullSong, id: string) => song.chain.filter(e => e.sectionId === id).length;

function newId(song: FullSong): string {
    const n = song.sections.reduce((m, s) => Math.max(m, parseInt(s.id.replace(/\D/g, ''), 10) || 0), 0);
    return `s${n + 1}`;
}

/** A new section's default name: a letter, counting on from the number of sections, that no section uses yet. */
function freeLetter(song: FullSong): string {
    for (let k = 0; k < 26; k++) {
        const l = String.fromCharCode(65 + ((song.sections.length + k) % 26));
        if (!song.sections.some(s => s.name === l || s.letter === l)) return l;
    }
    return 'N';
}

/** An empty section, one row long, after the others. */
export function addSection(song: FullSong): { song: FullSong; id: string } {
    if (song.sections.length >= MAX_SECTIONS) return { song, id: '' };
    const id = newId(song);
    const name = freeLetter(song);
    const sec: Section = { id, name, letter: letterFor(name), steps: stepsPerRow(song.timeSignature), chords: [], content: {}, mutes: {} };
    return { song: { ...song, sections: [...song.sections, sec] }, id };
}

/** A name for a copy: "Verse" → "Verse 2", "Verse 2" → "Verse 3", skipping names in use. */
function copyName(song: FullSong, name: string): string {
    const base = name.replace(/\s+\d+$/, '');
    for (let n = 2; n < 100; n++) {
        const candidate = `${base} ${n}`.slice(0, 24);
        if (!song.sections.some(s => s.name === candidate)) return candidate;
    }
    return base;
}

/** A copy of section `id` (chords, content, mutes), right after it. It isn't added to the chain. */
export function duplicateSection(song: FullSong, id: string): { song: FullSong; id: string } {
    const src = song.sections.find(s => s.id === id);
    if (!src || song.sections.length >= MAX_SECTIONS) return { song, id: '' };
    const copy: Section = { ...src, id: newId(song), name: copyName(song, src.name) };
    const at = song.sections.indexOf(src) + 1;
    return { song: { ...song, sections: [...song.sections.slice(0, at), copy, ...song.sections.slice(at)] }, id: copy.id };
}

/** Remove section `id` and its chain entries. The last section stays; the chain is never left empty. */
export function deleteSection(song: FullSong, id: string): FullSong {
    if (song.sections.length <= 1 || !song.sections.some(s => s.id === id)) return song;
    const sections = song.sections.filter(s => s.id !== id);
    const chain = song.chain.filter(e => e.sectionId !== id);
    return { ...song, sections, chain: chain.length ? chain : [{ sectionId: sections[0].id }] };
}

export function renameSection(song: FullSong, id: string, name: string): FullSong {
    const clean = name.trim().slice(0, 24);
    if (!clean) return song;
    return { ...song, sections: song.sections.map(s => (s.id === id ? { ...s, name: clean, letter: letterFor(clean) } : s)) };
}

/** Mute (or unmute) a part in one section only. */
export function setSectionMute(song: FullSong, id: string, partId: string, muted: boolean): FullSong {
    return {
        ...song,
        sections: song.sections.map(s => {
            if (s.id !== id) return s;
            const { [partId]: _gone, ...rest } = s.mutes;
            return { ...s, mutes: muted ? { ...rest, [partId]: true } : rest };
        }),
    };
}

// ---- the chain -----------------------------------------------------------------------------------

export function appendToChain(song: FullSong, id: string): FullSong {
    if (song.chain.length >= MAX_CHAIN || !song.sections.some(s => s.id === id)) return song;
    return { ...song, chain: [...song.chain, { sectionId: id }] };
}

/** Swap chain entry `i` with its neighbour (`dir` -1 = left, 1 = right). */
export function moveEntry(song: FullSong, i: number, dir: -1 | 1): FullSong {
    const j = i + dir;
    if (i < 0 || j < 0 || i >= song.chain.length || j >= song.chain.length) return song;
    const chain = [...song.chain];
    [chain[i], chain[j]] = [chain[j], chain[i]];
    return { ...song, chain };
}

export function duplicateEntry(song: FullSong, i: number): FullSong {
    if (i < 0 || i >= song.chain.length || song.chain.length >= MAX_CHAIN) return song;
    return { ...song, chain: [...song.chain.slice(0, i + 1), { ...song.chain[i] }, ...song.chain.slice(i + 1)] };
}

export function removeEntry(song: FullSong, i: number): FullSong {
    if (song.chain.length <= 1 || i < 0 || i >= song.chain.length) return song;
    return { ...song, chain: song.chain.filter((_, k) => k !== i) };
}

/** One slot of the chain, laid out in time. */
export interface ChainSlot {
    index: number;
    entry: ChainEntry;
    section: Section;
    /** Start and length in ticks. */
    start: number;
    len: number;
    /** Start bar (1-based) and length in bars. */
    startBar: number;
    bars: number;
}

/** The chain laid end to end: where each slot starts, in ticks and bars. */
export function chainLayout(song: FullSong): ChainSlot[] {
    const step = ticksPerStep(song.timeSignature);
    let tick = 0;
    let beat = 0;
    return song.chain.map((entry, index) => {
        const section = findSection(song, entry.sectionId);
        const slot = { index, entry, section, start: tick, len: section.steps * step, startBar: Math.floor(beat / song.timeSignature.beats) + 1, bars: sectionBars(song.timeSignature, section) };
        tick += slot.len;
        beat += section.steps;
        return slot;
    });
}

/** The slot playing at song tick `tick` (the last one past the end). */
export function slotAt(layout: ChainSlot[], tick: number): ChainSlot {
    return layout.find(s => tick >= s.start && tick < s.start + s.len) ?? layout[layout.length - 1];
}

/** Total length of the chain, in ticks. */
export const chainTicks = (layout: ChainSlot[]) => layout.reduce((m, s) => m + s.len, 0);

// ---- song-wide edits that touch every section ----------------------------------------------------

/** Change the time signature of every section (each keeps its chords on their steps, see `changeTimeSignature`). */
export function changeSongTimeSignature(song: FullSong, next: TimeSignature): FullSong {
    if (song.timeSignature.beats === next.beats && song.timeSignature.unit === next.unit) return song;
    let out: FullSong = song;
    for (const s of song.sections) {
        const changed = changeTimeSignature(sectionView(song, s.id), next);
        out = applySectionEdit(out, s.id, changed);
    }
    return { ...out, timeSignature: next };
}

/** Empty every section: no chords, melodies or beats (sections, chain and parts stay). */
export function clearSections(song: FullSong): FullSong {
    return {
        ...song,
        sections: song.sections.map(s => ({
            ...s,
            chords: [],
            content: Object.fromEntries(Object.entries(s.content).filter(([, c]) => c.drums).map(([id, c]) => [id, { drums: emptyPattern(c.drums!.bars) }])),
        })),
    };
}

/** Whether `sec` has anything to clear. */
export const sectionsHaveContent = (song: FullSong) =>
    song.sections.some(s => s.chords.length > 0 || Object.values(s.content).some(c => c.notes?.length || (c.drums && !isEmptyPattern(c.drums))));

/** What a part does in a section, for the section tile's little bars. */
export type PartState = 'plays' | 'muted' | 'silent';

export function partStateIn(song: FullSong, sec: Section, part: Part): PartState {
    const audible = audibleParts(song.parts).includes(part);
    const c = sec.content[part.id];
    const has = part.kind === 'melody' ? !!c?.notes?.length
        : part.kind === 'drums' ? !!c?.drums && !isEmptyPattern(c.drums)
            : sec.chords.some(isChordClip);
    // a mute (in this section, or for the whole song) shows even where the part has nothing to play
    if (!audible || sec.mutes[part.id]) return 'muted';
    return has ? 'plays' : 'silent';
}
