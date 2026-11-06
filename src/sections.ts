import { isEmptyPattern } from './drums';
import { ChordPart, Part, audibleParts, musicLoopEnd, newPart } from './parts';
import { isChordClip } from './progression';
import {
    ChainEntry, FullSong, MAX_CHAIN, MAX_SECTIONS, PartContent, STRIP_KEYS, Section, SectionSound, Song, TimeSignature, changeTimeSignature, contentOf,
    defaultSpace, isSoundKey, letterFor, sameValue, stepsPerRow, stripContent, ticksPerBar, ticksPerStep, withSound,
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
 * The parts sound the way they do in this section; with `ownSound` false, the way the song has them
 * (what Parts shows and edits while the whole song is open).
 */
export function sectionView(song: FullSong, id: string, ownSound = true): Song {
    const sec = findSection(song, id);
    return {
        key: song.key,
        scale: song.scale,
        bpm: song.bpm,
        timeSignature: song.timeSignature,
        space: song.space,
        chords: sec.chords,
        steps: sec.steps,
        parts: song.parts.map(p => fill(ownSound ? withSound(p, sec.sound?.[p.id]) : p, sec.content[p.id])),
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

/** Where an edit to a part's sound goes: the open section only, or the whole song (every section). */
export type SoundScope = 'section' | 'song';

type Rec = { [k: string]: unknown };
const rec = (p: Part) => p as unknown as Rec;

/** `own` with `key` set to `value`, or without it when the song has that value anyway. */
function setOwn(own: SectionSound, key: string, value: unknown, songValue: unknown): SectionSound {
    const { [key]: _old, ...rest } = own;
    return sameValue(value, songValue) ? rest : { ...rest, [key]: value };
}

/**
 * A song-wide change to `key` (from `before` to `after`), as it reaches a section that had its own
 * value: a plain value is the song's again; in a record (effects, pan, shape) just the entries that
 * changed are.
 */
function followSong(own: SectionSound, key: string, before: unknown, after: unknown): SectionSound {
    if (!(key in own)) return own;
    const mine = own[key];
    if (typeof mine !== 'object' || mine === null || typeof after !== 'object' || after === null) {
        const { [key]: _gone, ...rest } = own;
        return rest;
    }
    const b = (before ?? {}) as Rec;
    const a = after as Rec;
    const next: Rec = { ...(mine as Rec) };
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
        if (b[k] === a[k]) continue;
        if (a[k] === undefined) delete next[k];
        else next[k] = a[k];
    }
    return setOwn(own, key, next, after);
}

/**
 * Write an edited section view back: its chords, length and content go into section `id`; key, scale,
 * tempo, time signature and the shared effects go song-wide. A part's name, colour, mute and solo are
 * song-wide too. Its sound and style (instrument, volume, effects, pan, shape, play mode…) go where
 * `scope` says: with 'section', into this section's own sound (`view` shows the parts as they sound
 * here); with 'song', into the song's part, replacing what any section had for that setting (`view`
 * shows the song's parts). A part added in the view is added to the song; one removed loses its
 * content, mutes and sound in every section. Unchanged parts and sections keep their objects.
 */
export function applySectionEdit(song: FullSong, id: string, view: Song, scope: SoundScope = 'section'): FullSong {
    const sec = findSection(song, id);
    const before = sectionView(song, sec.id, scope === 'section');
    const content: Section['content'] = {};
    view.parts.forEach(p => {
        const c = contentOf(p);
        if (c) content[p.id] = c;
    });
    /** Sections' own sound, per section id, as it changes. */
    const sounds = new Map(song.sections.map(s => [s.id, s.sound ?? {}]));
    const parts = view.parts.map(p => {
        const stripped = stripContent(p);
        const old = song.parts.find(o => o.id === p.id);
        const prev = before.parts.find(o => o.id === p.id);
        if (!old || !prev || old.kind !== p.kind) return stripped;
        const changed = Object.keys(stripped).filter(k => isSoundKey(k) && !sameValue(rec(stripped)[k], rec(prev)[k]));
        let next: Part;
        if (scope === 'section') {
            // the song's part takes the name, colour, mute and solo; this section takes the sound
            next = Object.fromEntries(Object.keys(stripped).map(k => [k, isSoundKey(k) ? rec(old)[k] : rec(stripped)[k]])) as unknown as Part;
            let own = sounds.get(sec.id)![p.id] ?? {};
            for (const k of changed) own = setOwn(own, k, rec(stripped)[k], rec(old)[k]);
            const all = { ...sounds.get(sec.id)! };
            if (Object.keys(own).length) all[p.id] = own;
            else delete all[p.id];
            sounds.set(sec.id, all);
        } else {
            next = stripped;
            for (const [sid, all] of sounds) {
                const mine = all[p.id];
                if (!mine) continue;
                let own = mine;
                for (const k of changed) own = followSong(own, k, rec(prev)[k], rec(stripped)[k]);
                if (own === mine) continue;
                const nextAll = { ...all };
                if (Object.keys(own).length) nextAll[p.id] = own;
                else delete nextAll[p.id];
                sounds.set(sid, nextAll);
            }
        }
        return shallowEqual(old, next, ['notes', 'drums']) ? old : next;
    });
    const ids = new Set(parts.map(p => p.id));
    /** The section's own sound after the edit: same object when nothing changed, left out when empty. */
    const soundOf = (s: Section): Section['sound'] => {
        const after = onlyParts(sounds.get(s.id)!, ids);
        if (s.sound && shallowEqual(after, s.sound)) return s.sound;
        if (!s.sound && !Object.keys(after).length) return undefined;
        return Object.keys(after).length ? after : undefined;
    };
    const withSoundOf = (s: Section, next: Section): Section => {
        const sound = soundOf(s);
        if (sound === next.sound) return next;
        const { sound: _old, ...rest } = next;
        return sound ? { ...rest, sound } : rest;
    };
    const sections = song.sections.map(s => {
        if (s.id !== sec.id) {
            const c = onlyParts(s.content, ids);
            const m = onlyParts(s.mutes, ids);
            const out = withSoundOf(s, c === s.content && m === s.mutes ? s : { ...s, content: c, mutes: m });
            return shallowEqual(out, s) ? s : out;
        }
        const next = withSoundOf(s, {
            ...s,
            chords: view.chords,
            steps: view.steps,
            content: sameContent(content, s.content) ? s.content : content,
            mutes: onlyParts(s.mutes, ids),
        });
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

// ---- the engine strips: one per part, and one more for each section that sounds its own way ----------

/** The engine strip a part plays through in section `sec`: its own when the section changes how the part sounds. */
export function stripId(sec: Section | undefined, partId: string): string {
    const own = sec?.sound?.[partId];
    return own && STRIP_KEYS.some(k => k in own) ? `${partId}@${sec!.id}` : partId;
}

/** Every strip the song needs, with the part as it sounds through it. */
export function engineStrips(song: FullSong): { id: string; part: Part }[] {
    const out = song.parts.map(p => ({ id: p.id, part: p }));
    for (const s of song.sections) {
        for (const p of song.parts) {
            const id = stripId(s, p.id);
            if (id !== p.id) out.push({ id, part: withSound(p, s.sound?.[p.id]) });
        }
    }
    return out;
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

/**
 * How long a section plays: where its music ends, rounded up to a bar (at least one), and never past
 * its length. The same length Loop mode loops it at, so a 16-bar section with 12 bars of music plays
 * 12 bars in the chain too.
 */
export function playedTicks(song: FullSong, sec: Section): number {
    const view = sectionView(song, sec.id);
    return Math.min(musicLoopEnd(view.chords, view.parts, ticksPerBar(song.timeSignature)), sectionTicks(song, sec));
}

/** The chain laid end to end: where each slot starts, in ticks and bars, each section for as long as it plays. */
export function chainLayout(song: FullSong): ChainSlot[] {
    const bar = ticksPerBar(song.timeSignature);
    const played = new Map<string, number>();
    let tick = 0;
    return song.chain.map((entry, index) => {
        const section = findSection(song, entry.sectionId);
        let len = played.get(section.id);
        if (len === undefined) {
            len = playedTicks(song, section);
            played.set(section.id, len);
        }
        const slot = { index, entry, section, start: tick, len, startBar: Math.floor(tick / bar) + 1, bars: Math.round((len / bar) * 10) / 10 };
        tick += len;
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

/**
 * Clear all: a clean slate. One empty section "A" (one row), the chain just that, one chord part
 * with no effects and the tone as designed, and the shared reverb, delay and output back to their
 * defaults. Key, scale, tempo and time signature stay. The first chord part keeps its id (the pads
 * keep playing through it) and its instrument; the first section keeps its id. A clean slate
 * cleans to itself, so `isCleanSlate` can tell when there's nothing left to clear.
 */
export function cleanSlate(song: FullSong): FullSong {
    const old = song.parts.find((p): p is ChordPart => p.kind === 'chords');
    const fresh = newPart('chords', []) as ChordPart;
    const keys: ChordPart = old ? { ...fresh, id: old.id, instrument: old.instrument } : fresh;
    const id = song.sections[0]?.id ?? 's1';
    return {
        key: song.key,
        scale: song.scale,
        bpm: song.bpm,
        timeSignature: song.timeSignature,
        space: defaultSpace(),
        parts: [keys],
        sections: [{ id, name: 'A', letter: 'A', steps: stepsPerRow(song.timeSignature), chords: [], content: {}, mutes: {} }],
        chain: [{ sectionId: id }],
    };
}

/** Whether Clear all would change nothing. */
export const isCleanSlate = (song: FullSong) => JSON.stringify(cleanSlate(song)) === JSON.stringify(song);

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
