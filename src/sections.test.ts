import { describe, it, expect } from 'vitest';
import {
    FullSong, SAVE_VERSION, Song, defaultSettings, encodeShare, decodeShare, fromSingleSection, newFullSong, newSong, readFullSong, readSaved,
} from './song';
import {
    addSection, appendToChain, applySectionEdit, chainLayout, changeSongTimeSignature, clearSections, deleteSection, duplicateEntry,
    duplicateSection, moveEntry, partStateIn, removeEntry, renameSection, sectionView, setSectionMute, slotAt,
} from './sections';
import { chainEvents, sectionEvents } from './playback';
import { newPart, placeNote } from './parts';
import { TICKS_PER_STEP as S } from './progression';

/** A v2-style song with chords, a melody and a beat. */
const v2Song = (): Song => {
    const song = { ...newSong(), key: 'A' as const, scale: 'minor' as const, steps: 16 };
    song.chords = [
        { start: 0, len: 4 * S, chord: { degree: 0, type: 'triad', inversion: 0, octave: 4 } },
        { start: 4 * S, len: 4 * S, chord: { degree: 5, type: 'triad', inversion: 0, octave: 4 } },
    ];
    song.parts = song.parts.map(p => (p.kind === 'melody' ? { ...p, notes: [{ start: 0, len: 48, step: 2 }, { start: 96, len: 24, step: 4 }] } : p));
    song.parts.push(newPart('drums', song.parts, { bars: 1, hits: { kick: [0, 8], hat: [2, 6, 10, 14] } }));
    return song;
};

const melodyId = (s: { parts: { id: string; kind: string }[] }) => s.parts.find(p => p.kind === 'melody')!.id;
const drumsId = (s: { parts: { id: string; kind: string }[] }) => s.parts.find(p => p.kind === 'drums')!.id;

describe('save format v3: migrating a v2 song', () => {
    it('becomes one section "A" with all its chords, notes and drums, chained once', () => {
        const old = v2Song();
        const song = fromSingleSection(old);
        expect(song.sections).toHaveLength(1);
        const [a] = song.sections;
        expect([a.name, a.letter, a.steps]).toEqual(['A', 'A', 16]);
        expect(a.chords).toEqual(old.chords);
        expect(a.content[melodyId(old)].notes).toHaveLength(2);
        expect(a.content[drumsId(old)].drums!.hits.kick).toEqual([0, 8]);
        expect(song.chain).toEqual([{ sectionId: a.id }]);
        // parts keep their sound but not their content
        const mel = song.parts.find(p => p.kind === 'melody')!;
        expect(mel.kind === 'melody' && mel.notes).toEqual([]);
        expect([song.key, song.scale]).toEqual(['A', 'minor']);
    });

    it('reads a v2 save (storage, file or link) as v3', () => {
        const saved = readSaved(JSON.parse(JSON.stringify({ version: 2, song: v2Song(), settings: { ...defaultSettings(), octave: 3 } })))!;
        expect(saved.version).toBe(3);
        expect(saved.song.sections[0].chords).toHaveLength(2);
        expect(saved.settings.octave).toBe(3);
        expect(saved.settings.openSection).toBe(saved.song.sections[0].id);
        expect(saved.settings.playMode).toBe('loop');
    });

    it('the projection of the migrated section is the old song', () => {
        const old = v2Song();
        const view = sectionView(fromSingleSection(old), 's1');
        expect(view).toEqual(old);
    });

    it('reads v2 and v3 share links', async () => {
        const v3 = { version: SAVE_VERSION as 3, song: fromSingleSection(v2Song()), settings: defaultSettings() };
        expect(readSaved(await decodeShare(await encodeShare(v3)))!.song).toEqual(v3.song);
        const v2 = { version: 2, song: v2Song(), settings: defaultSettings() };
        expect(readSaved(await decodeShare(await encodeShare(v2 as never)))!.song.sections[0].steps).toBe(16);
    });
});

describe('save format v3: reading untrusted songs', () => {
    const full = (): FullSong => {
        let song = fromSingleSection(v2Song());
        song = addSection(song).song;
        song = appendToChain(song, song.sections[1].id);
        return song;
    };

    it('round-trips through JSON unchanged', () => {
        const song = full();
        expect(readFullSong(JSON.parse(JSON.stringify(song)))).toEqual(song);
        const state = { version: SAVE_VERSION, song, settings: { ...defaultSettings(), openSection: song.sections[1].id, playMode: 'chain' } };
        expect(readSaved(JSON.parse(JSON.stringify(state)))).toEqual(state);
    });

    it('drops chain entries naming unknown sections and never leaves the chain empty', () => {
        const song = full();
        const raw = JSON.parse(JSON.stringify(song));
        raw.chain = [{ sectionId: 'nope' }, { sectionId: song.sections[1].id }, 'junk'];
        expect(readFullSong(raw)!.chain).toEqual([{ sectionId: song.sections[1].id }]);
        raw.chain = [{ sectionId: 'nope' }];
        expect(readFullSong(raw)!.chain).toEqual([{ sectionId: song.sections[0].id }]);
    });

    it('always has a section, repairs ids, names, letters and lengths', () => {
        const song = full();
        const raw = JSON.parse(JSON.stringify(song));
        raw.sections = [];
        const empty = readFullSong(raw)!;
        expect(empty.sections).toHaveLength(1);
        expect(empty.chain).toEqual([{ sectionId: empty.sections[0].id }]);
        raw.sections = [{ id: 'x', name: '  Chorus  ', steps: 9999, chords: [{ start: 0, len: 96, chord: { degree: 9, type: 'triad' } }] }, { id: 'x', name: '' }, 7];
        const fixed = readFullSong(raw)!;
        expect(fixed.sections.map(s => [s.name, s.letter])).toEqual([['Chorus', 'C'], ['B', 'B']]);
        expect(fixed.sections[0].steps).toBe(512);
        expect(fixed.sections[0].chords[0].rest || fixed.sections[0].chords[0].chord.degree).toBe(6);
        expect(new Set(fixed.sections.map(s => s.id)).size).toBe(2);
    });

    it('drops content and mutes of parts the song does not have, and clamps notes to the section', () => {
        const song = full();
        const raw = JSON.parse(JSON.stringify(song));
        const mel = melodyId(song);
        raw.sections[0].content.ghost = { notes: [{ start: 0, len: 24, step: 1 }] };
        raw.sections[0].content[mel].notes.push({ start: 99999, len: 24, step: 1 });
        raw.sections[0].mutes = { ghost: true, [mel]: true, [drumsId(song)]: 'yes' };
        const read = readFullSong(raw)!;
        expect(read.sections[0].content.ghost).toBeUndefined();
        expect(read.sections[0].content[mel].notes).toHaveLength(2);
        expect(read.sections[0].mutes).toEqual({ [mel]: true });
    });

    it('rejects things that are not songs', () => {
        expect(readSaved({ version: 3, song: { parts: [] } })).toBeNull();
        expect(readSaved({ version: 4, song: newFullSong() })).toBeNull();
        expect(readFullSong(null)).toBeNull();
    });
});

describe('the section projection', () => {
    it('round-trips: an edit through the view lands in that section only', () => {
        let song = fromSingleSection(v2Song());
        const added = addSection(song);
        song = added.song;
        const b = added.id;
        const view = sectionView(song, b);
        expect(view.chords).toEqual([]);
        expect(view.parts.find(p => p.kind === 'melody')!.kind === 'melody' && (view.parts.find(p => p.kind === 'melody') as { notes: unknown[] }).notes).toEqual([]);
        // write a chord and a note into B
        const mel = melodyId(song);
        const edited: Song = {
            ...view,
            chords: [{ start: 0, len: S, chord: { degree: 3, type: 'triad', inversion: 0, octave: 4 } }],
            parts: view.parts.map(p => (p.kind === 'melody' ? { ...p, notes: placeNote(p.notes, { start: 24, len: 24, step: 5 }) } : p)),
        };
        const next = applySectionEdit(song, b, edited);
        expect(sectionView(next, b)).toEqual(edited);
        // A is untouched (same object) and still has its own material
        expect(next.sections[0]).toBe(song.sections[0]);
        expect(next.sections[1].content[mel].notes).toEqual([{ start: 24, len: 24, step: 5 }]);
        expect(next.parts).toBe(song.parts);
    });

    it('sound edits made through a view are song-wide', () => {
        let song = fromSingleSection(v2Song());
        song = addSection(song).song;
        const view = sectionView(song, song.sections[1].id);
        const next = applySectionEdit(song, song.sections[1].id, { ...view, bpm: 140, parts: view.parts.map(p => (p.kind === 'chords' ? { ...p, instrument: 'piano' } : p)) });
        expect(next.bpm).toBe(140);
        expect(sectionView(next, song.sections[0].id).parts.find(p => p.kind === 'chords')!).toMatchObject({ instrument: 'piano' });
        expect(sectionView(next, song.sections[0].id).chords).toHaveLength(2);
    });

    it('removing a part through a view removes its content and mutes everywhere', () => {
        let song = fromSingleSection(v2Song());
        const mel = melodyId(song);
        song = setSectionMute(song, 's1', mel, true);
        song = addSection(song).song;
        const view = sectionView(song, song.sections[1].id);
        const next = applySectionEdit(song, song.sections[1].id, { ...view, parts: view.parts.filter(p => p.id !== mel) });
        expect(next.sections[0].content[mel]).toBeUndefined();
        expect(next.sections[0].mutes).toEqual({});
    });

    it('a time signature change converts every section', () => {
        let song = fromSingleSection(v2Song());
        song = addSection(song).song;
        const next = changeSongTimeSignature(song, { beats: 3, unit: 4 });
        expect(next.timeSignature).toEqual({ beats: 3, unit: 4 });
        expect(next.sections.every(s => s.steps % 9 === 0)).toBe(true);
        expect(next.sections[0].chords).toHaveLength(2);
    });
});

describe('sections and the chain', () => {
    const base = () => fromSingleSection(v2Song());

    it('adds, renames, duplicates and deletes sections', () => {
        let song = base();
        const b = addSection(song);
        song = b.song;
        expect(song.sections[1]).toMatchObject({ name: 'B', letter: 'B', steps: 8, chords: [] });
        song = renameSection(song, b.id, 'Chorus');
        expect(song.sections[1]).toMatchObject({ name: 'Chorus', letter: 'C' });
        const copy = duplicateSection(song, b.id);
        expect(copy.song.sections.map(s => s.name)).toEqual(['A', 'Chorus', 'Chorus 2']);
        song = appendToChain(copy.song, b.id);
        song = deleteSection(song, b.id);
        expect(song.sections.map(s => s.name)).toEqual(['A', 'Chorus 2']);
        expect(song.chain.every(e => e.sectionId !== b.id)).toBe(true);
        // the last section can't go
        expect(deleteSection(deleteSection(song, song.sections[1].id), 's1').sections).toHaveLength(1);
    });

    it('moves, duplicates and removes chain entries, never emptying the chain', () => {
        let song = base();
        const b = addSection(song);
        song = appendToChain(b.song, b.id);
        expect(song.chain.map(e => e.sectionId)).toEqual(['s1', b.id]);
        song = moveEntry(song, 1, -1);
        expect(song.chain.map(e => e.sectionId)).toEqual([b.id, 's1']);
        song = duplicateEntry(song, 0);
        expect(song.chain.map(e => e.sectionId)).toEqual([b.id, b.id, 's1']);
        song = removeEntry(removeEntry(removeEntry(song, 0), 0), 0);
        expect(song.chain).toHaveLength(1);
    });

    it('lays the chain out in ticks and bars', () => {
        let song = base(); // A: 16 steps = 4 bars
        const b = addSection(song); // B: 8 steps = 2 bars
        song = appendToChain(appendToChain(b.song, b.id), 's1');
        const layout = chainLayout(song);
        expect(layout.map(s => [s.startBar, s.bars, s.start])).toEqual([[1, 4, 0], [5, 2, 16 * S], [7, 4, 24 * S]]);
        expect(slotAt(layout, 20 * S).section.id).toBe(b.id);
    });

    it('clears every section but keeps the sections and the chain', () => {
        const song = clearSections(appendToChain(base(), 's1'));
        expect(song.sections[0].chords).toEqual([]);
        expect(song.sections[0].content[drumsId(song)]?.drums?.hits).toEqual({});
        expect(song.chain).toHaveLength(2);
    });

    it('says which parts play in a section', () => {
        let song = base();
        const mel = song.parts.find(p => p.kind === 'melody')!;
        expect(partStateIn(song, song.sections[0], mel)).toBe('plays');
        song = setSectionMute(song, 's1', mel.id, true);
        expect(partStateIn(song, song.sections[0], song.parts.find(p => p.id === mel.id)!)).toBe('muted');
        song = addSection(song).song;
        expect(partStateIn(song, song.sections[1], song.parts[0])).toBe('silent');
    });
});

describe('chain playback', () => {
    it('restarts drum patterns at each section and cuts notes at the section end', () => {
        let song = base2();
        // A (4 bars) then B (2 bars), B has a long melody note running past its end
        const layout = chainLayout(song);
        const { events, length } = chainEvents(song, layout);
        expect(length).toBe(24 * S);
        const kicks = events.filter(e => e.data.drum === 'kick').map(e => e.tick);
        // the A pattern (kicks on 1/16 0 and 8 of each bar) for 4 bars, then B's own pattern from its top (kick on 0 only)
        expect(kicks).toEqual([0, 192, 384, 576, 768, 960, 1152, 1344, 16 * S, 20 * S]);
        const mel = song.parts.find(p => p.kind === 'melody')!.id;
        const last = events.filter(e => e.data.part === mel).pop()!;
        expect(last.tick + last.duration).toBe(24 * S);
        song = setSectionMute(song, song.sections[1].id, mel, true);
        expect(chainEvents(song).events.some(e => e.data.part === mel && e.tick >= 16 * S)).toBe(false);
    });

    it('a section on its own plays like the v2 song did', () => {
        const old = v2Song();
        const song = fromSingleSection(old);
        const a = sectionEvents(sectionView(song, 's1'), {}, 16 * S, 0, false);
        expect(a.length).toBeGreaterThan(10);
        expect(a.filter(e => e.data.drum).length).toBe(4 * 6);
    });
});

/** A (from v2Song, 4 bars) then a 2-bar B with its own beat and a long note past its end. */
function base2(): FullSong {
    let song = fromSingleSection(v2Song());
    const b = addSection(song);
    song = appendToChain(b.song, b.id);
    const view = sectionView(song, b.id);
    return applySectionEdit(song, b.id, {
        ...view,
        chords: [{ start: 0, len: 8 * S, chord: { degree: 3, type: 'triad', inversion: 0, octave: 4 } }],
        parts: view.parts.map(p => (p.kind === 'drums' ? { ...p, drums: { bars: 1, hits: { kick: [0] } } }
            : p.kind === 'melody' ? { ...p, notes: [{ start: 6 * S, len: 2 * S, step: 3 }] } : p)),
    });
}
