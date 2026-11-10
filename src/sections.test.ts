import { describe, it, expect } from 'vitest';
import {
    FullSong, SAVE_VERSION, SavedState, Song, defaultSettings, encodeShare, decodeShare, fromSingleSection, newFullSong, newSong, readFullSong, readSaved, stepsPerRow,
} from './song';
import {
    addSection, appendToChain, applySectionEdit, chainLayout, playedTicks, changeSongTimeSignature, cleanSlate, deleteSection, duplicateEntry,
    duplicateSection, engineStrips, isCleanSlate, moveEntry, partStateIn, removeEntry, renameSection, sectionView, setSectionMute, slotAt, stripId,
} from './sections';
import { chainEvents, sectionEvents, sectionLoopLength } from './playback';
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

    it('sound edits made through a view with the whole song open are song-wide', () => {
        let song = fromSingleSection(v2Song());
        song = addSection(song).song;
        const view = sectionView(song, song.sections[1].id);
        const next = applySectionEdit(song, song.sections[1].id, { ...view, bpm: 140, parts: view.parts.map(p => (p.kind === 'chords' ? { ...p, instrument: 'piano' } : p)) }, 'song');
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
        let song = base(); // A: 16 steps, music for the first 2 bars
        const b = addSection(song); // B: 8 steps, empty
        song = appendToChain(appendToChain(b.song, b.id), 's1');
        const layout = chainLayout(song);
        // each section for as long as it plays (where its music ends, a bar at least), like Loop mode
        expect(layout.map(s => [s.startBar, s.bars, s.start])).toEqual([[1, 2, 0], [3, 1, 8 * S], [4, 2, 12 * S]]);
        expect(slotAt(layout, 9 * S).section.id).toBe(b.id);
    });

    it('plays a section in the chain as long as Loop mode loops it, not its whole length', () => {
        // a 16-bar section whose chords stop after 12 bars
        let song = base();
        const view = sectionView(song, 's1');
        song = applySectionEdit(song, 's1', {
            ...view,
            steps: 64,
            chords: [{ start: 0, len: 48 * S, chord: { degree: 0, type: 'triad', inversion: 0, octave: 4 } }],
            parts: view.parts.map(p => (p.kind === 'melody' ? { ...p, notes: [] } : p.kind === 'drums' ? { ...p, drums: { bars: 1, hits: {} } } : p)),
        });
        song = appendToChain(song, 's1');
        const layout = chainLayout(song);
        expect(layout.map(s => s.bars)).toEqual([12, 12]);
        expect(playedTicks(song, song.sections[0])).toBe(sectionLoopLength(sectionView(song, 's1')));
        expect(chainEvents(song).length).toBe(2 * 48 * S);
        // and never longer than the section: music running past its end is cut there
        expect(playedTicks({ ...song, sections: [{ ...song.sections[0], steps: 32 }] }, { ...song.sections[0], steps: 32 })).toBe(32 * S);
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
        // A (music for 2 bars) then B (2 bars), B's melody note runs to its very end
        const layout = chainLayout(song);
        const { events, length } = chainEvents(song, layout);
        expect(length).toBe(16 * S);
        const kicks = events.filter(e => e.data.drum === 'kick').map(e => e.tick);
        // the A pattern (kicks on 1/16 0 and 8 of each bar) for its 2 bars, then B's own pattern from its top (kick on 0 only)
        expect(kicks).toEqual([0, 192, 384, 576, 8 * S, 12 * S]);
        const mel = song.parts.find(p => p.kind === 'melody')!.id;
        const last = events.filter(e => e.data.part === mel).pop()!;
        expect(last.tick + last.duration).toBe(16 * S);
        song = setSectionMute(song, song.sections[1].id, mel, true);
        expect(chainEvents(song).events.some(e => e.data.part === mel && e.tick >= 8 * S)).toBe(false);
    });

    it('a section on its own plays like the v2 song did', () => {
        const old = v2Song();
        const song = fromSingleSection(old);
        const a = sectionEvents(sectionView(song, 's1'), song.sections[0], 16 * S, 0, false);
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

describe('melody accidentals in saves and links', () => {
    /** v2Song with an F♯ (step 5 sharp in A minor) and a B♭ (step 1 flat) among its naturals. */
    const withAccs = (): Song => {
        const song = v2Song();
        song.parts = song.parts.map(p => (p.kind === 'melody'
            ? { ...p, notes: [{ start: 0, len: 48, step: 2 }, { start: 48, len: 24, step: 5, acc: 1 as const }, { start: 96, len: 24, step: 1, acc: -1 as const }] }
            : p));
        return song;
    };
    const notesOf = (song: FullSong | null) => song!.sections[0].content[melodyId(song!)].notes!;

    it('round-trips through JSON files and share links (same save version)', async () => {
        const state: SavedState = { version: 3, song: fromSingleSection(withAccs()), settings: { ...defaultSettings(), openSection: 's1' } };
        expect(SAVE_VERSION).toBe(3);
        expect(readSaved(JSON.parse(JSON.stringify(state)))).toEqual(state);
        expect(readSaved(await decodeShare(await encodeShare(state)))).toEqual(state);
        expect(notesOf(readSaved(JSON.parse(JSON.stringify(state)))!.song).map(n => n.acc)).toEqual([undefined, 1, -1]);
    });

    it('a natural note saves exactly as before: no acc field', () => {
        const json = JSON.stringify(fromSingleSection(withAccs()));
        expect(json).toContain('{"start":0,"len":48,"step":2}');
        expect(json).toContain('"step":5,"acc":1');
    });

    it('accepts only -1 and 1; 0 and anything else is natural and left out', () => {
        const full = fromSingleSection(v2Song());
        const id = melodyId(full);
        const raw = JSON.parse(JSON.stringify(full));
        raw.sections[0].content[id].notes = [
            { start: 0, len: 24, step: 0, acc: 0 }, { start: 24, len: 24, step: 1, acc: 2 }, { start: 48, len: 24, step: 2, acc: '1' },
            { start: 72, len: 24, step: 3, acc: -1 }, { start: 96, len: 24, step: 4, acc: 0.5 }, { start: 120, len: 24, step: 5, acc: null },
            { start: 144, len: 24, step: 6, acc: 1 }, { start: 168, len: 24, step: 7, acc: -2 },
        ];
        const notes = notesOf(readFullSong(raw));
        expect(notes.map(n => n.acc)).toEqual([undefined, undefined, undefined, -1, undefined, undefined, 1, undefined]);
        expect(notes.filter(n => 'acc' in n)).toHaveLength(2);
    });

    it('old songs (no acc anywhere) load unchanged, v2 too', () => {
        const old = v2Song();
        const v2 = readSaved({ version: 2, song: JSON.parse(JSON.stringify(old)), settings: {} })!;
        expect(notesOf(v2.song)).toEqual([{ start: 0, len: 48, step: 2 }, { start: 96, len: 24, step: 4 }]);
    });

    it('a v2 song with accidentals keeps them when moved into a section', () => {
        const v2 = readSaved({ version: 2, song: JSON.parse(JSON.stringify(withAccs())), settings: {} })!;
        expect(notesOf(v2.song).map(n => n.acc)).toEqual([undefined, 1, -1]);
    });

    it('plays the altered pitch: F♯5 and B♭4 in A minor', () => {
        const song = fromSingleSection(withAccs());
        const view = sectionView(song, 's1');
        const mel = melodyId(song);
        const midi = sectionEvents(view, song.sections[0], 16 * S, 0, false).filter(e => e.data.part === mel).map(e => (e.data.midi ? e.data.midi[0] : -1));
        // A minor from A4 (part octave 4): step 2 = C5, step 5 + ♯ = F♯5, step 1 + ♭ = B♭4
        expect(midi).toEqual([72, 78, 70]);
        // and in the whole chain
        expect(chainEvents(song).events.filter(e => e.data.part === mel).map(e => (e.data.midi ? e.data.midi[0] : -1))).toEqual([72, 78, 70]);
    });
});

describe('clear all: a clean slate', () => {
    /** A busy song: three sections, a longer chain, four parts with effects, a wet master. */
    const busy = (): FullSong => {
        let f = fromSingleSection(v2Song());
        f = duplicateSection(f, f.sections[0].id).song;
        f = addSection(f).song;
        f = appendToChain(appendToChain(f, f.sections[1].id), f.sections[2].id);
        f = {
            ...f,
            bpm: 132,
            timeSignature: { beats: 3, unit: 4 },
            space: { reverb: { size: 6, ret: 1 }, delay: { time: '4n', feedback: 0.7, ret: 1 }, out: { level: 0.6 } },
            parts: f.parts.map(p => (p.kind === 'chords'
                ? { ...p, instrument: 'piano' as const, volume: -6, mute: true, playMode: 'Arp' as const, fx: { ...p.fx, reverb: 0.8, chorus: 0.4 }, tone: { ...p.tone, brightness: 0.9 } }
                : { ...p, fx: { ...p.fx, delay: 0.5 } })),
        };
        return setSectionMute(f, f.sections[0].id, f.parts[0].id, true);
    };

    it('leaves one empty section, chained once', () => {
        const f = busy();
        const c = cleanSlate(f);
        expect(c.sections).toEqual([{ id: f.sections[0].id, name: 'A', letter: 'A', steps: stepsPerRow({ beats: 3, unit: 4 }), chords: [], content: {}, mutes: {} }]);
        expect(c.chain).toEqual([{ sectionId: f.sections[0].id }]);
    });

    it('keeps only the chord part, its id and instrument, with no effects and the tone as designed', () => {
        const f = busy();
        const keys = f.parts.find(p => p.kind === 'chords')!;
        const c = cleanSlate(f);
        expect(c.parts).toHaveLength(1);
        const p = c.parts[0];
        expect(p).toMatchObject({ id: keys.id, kind: 'chords', instrument: 'piano', volume: 0, mute: false, solo: false, playMode: 'Chord', name: 'Keys' });
        expect(Object.values(p.fx).every(v => v === 0)).toBe(true);
        if (p.kind === 'chords') expect([p.tone, p.shape]).toEqual([{ pan: 0.5 }, {}]);
    });

    it('resets the shared reverb, delay and output, and keeps key, scale, tempo and time signature', () => {
        const f = busy();
        const c = cleanSlate(f);
        expect(c.space).toEqual(newFullSong().space);
        expect([c.key, c.scale, c.bpm, c.timeSignature]).toEqual([f.key, f.scale, 132, { beats: 3, unit: 4 }]);
    });

    it('adds a chord part when the song has none', () => {
        const f = busy();
        const c = cleanSlate({ ...f, parts: f.parts.filter(p => p.kind !== 'chords') });
        expect(c.parts.map(p => p.kind)).toEqual(['chords']);
    });

    it('knows when there is nothing left to clear', () => {
        const f = busy();
        expect(isCleanSlate(f)).toBe(false);
        expect(isCleanSlate(cleanSlate(f))).toBe(true);
        expect(cleanSlate(cleanSlate(f))).toEqual(cleanSlate(f));
        expect(readFullSong(JSON.parse(JSON.stringify(cleanSlate(f))))).toEqual(cleanSlate(f));
    });
});

describe('Parts edits what Song has open: a section, or the whole song', () => {
    /** A song with two sections, A and its copy B, a Keys part and a beat. */
    const twoSections = () => {
        const one = fromSingleSection(v2Song());
        return duplicateSection(one, 's1').song;
    };
    const keysId = (s: FullSong) => s.parts.find(p => p.kind === 'chords')!.id;
    const keysIn = (s: FullSong, sec: string, own = true) => sectionView(s, sec, own).parts.find(p => p.kind === 'chords')! as import('./parts').ChordPart;
    /** Edit the Keys part as Parts would, with `scope`. */
    const editKeys = (s: FullSong, sec: string, scope: 'section' | 'song', patch: object) => {
        const view = sectionView(s, sec, scope === 'section');
        return applySectionEdit(s, sec, { ...view, parts: view.parts.map(p => (p.kind === 'chords' ? { ...p, ...patch } as typeof p : p)) }, scope);
    };

    it('an edit with a section open changes that section only', () => {
        const song = editKeys(twoSections(), 's2', 'section', { playMode: 'Arp' });
        const b = song.sections.find(s => s.id === 's2')!;
        expect(keysIn(song, 's2').playMode).toBe('Arp');
        expect(keysIn(song, 's1').playMode).toBe('Chord');
        expect(song.parts.find(p => p.kind === 'chords')).toMatchObject({ playMode: 'Chord' });
        expect(b.sound).toEqual({ [keysId(song)]: { playMode: 'Arp' } });
    });

    it('setting a section back to the song’s value keeps nothing of its own', () => {
        let song = editKeys(twoSections(), 's2', 'section', { playMode: 'Arp' });
        song = editKeys(song, 's2', 'section', { playMode: 'Chord' });
        expect(song.sections.find(s => s.id === 's2')!.sound).toBeUndefined();
    });

    it('name, colour, mute and solo stay song-wide even with a section open', () => {
        const song = editKeys(twoSections(), 's2', 'section', { name: 'Rhodes', mute: true });
        expect(song.parts.find(p => p.kind === 'chords')).toMatchObject({ name: 'Rhodes', mute: true });
        expect(song.sections.find(s => s.id === 's2')!.sound).toBeUndefined();
    });

    it('an edit with the whole song open reaches every section, replacing what a section had for that setting', () => {
        let song = editKeys(twoSections(), 's2', 'section', { playMode: 'Arp', arpRate: '16n', instrument: 'pluck' });
        song = editKeys(song, 's1', 'song', { playMode: 'Strum' });
        expect(keysIn(song, 's1').playMode).toBe('Strum');
        expect(keysIn(song, 's2').playMode).toBe('Strum');
        // other settings the section had stay its own
        expect(song.sections.find(s => s.id === 's2')!.sound).toEqual({ [keysId(song)]: { arpRate: '16n', instrument: 'pluck' } });
    });

    it('in effects and shape, only the knob turned for the whole song is replaced', () => {
        const base = twoSections();
        const fx = keysIn(base, 's2').fx;
        let song = editKeys(base, 's2', 'section', { fx: { ...fx, chorus: 0.5, delay: 0.4 } });
        song = editKeys(song, 's1', 'song', { fx: { ...fx, chorus: 0.2 } });
        expect(keysIn(song, 's1').fx).toMatchObject({ chorus: 0.2, delay: 0 });
        expect(keysIn(song, 's2').fx).toMatchObject({ chorus: 0.2, delay: 0.4 });
    });

    it('the whole song view shows the song’s parts; a section view shows them as they sound there', () => {
        const song = editKeys(twoSections(), 's2', 'section', { volume: -6 });
        expect(keysIn(song, 's2', false).volume).toBe(0);
        expect(keysIn(song, 's2').volume).toBe(-6);
    });

    it('a section that sounds its own way plays through its own engine strip', () => {
        let song = editKeys(twoSections(), 's2', 'section', { playMode: 'Arp' });
        const id = keysId(song);
        // play mode changes the notes, not the strip
        expect(engineStrips(song).map(x => x.id)).toEqual(song.parts.map(p => p.id));
        song = editKeys(song, 's2', 'section', { instrument: 'pluck' });
        const strips = engineStrips(song);
        expect(strips.find(x => x.id === `${id}@s2`)!.part).toMatchObject({ instrument: 'pluck', playMode: 'Arp' });
        const b = song.sections.find(s => s.id === 's2')!;
        expect(stripId(b, id)).toBe(`${id}@s2`);
        expect(stripId(song.sections[0], id)).toBe(id);
        // in the chain, each section's notes go to its strip
        const parts = new Set(chainEvents({ ...song, chain: [{ sectionId: 's1' }, { sectionId: 's2' }] }).events.map(e => e.data.part));
        expect(parts.has(id) && parts.has(`${id}@s2`)).toBe(true);
    });

    it('a copied section keeps its own sound; a removed part loses it', () => {
        let song = editKeys(twoSections(), 's2', 'section', { instrument: 'pluck' });
        song = duplicateSection(song, 's2').song;
        expect(song.sections[2].sound).toEqual(song.sections[1].sound);
        const view = sectionView(song, 's1');
        song = applySectionEdit(song, 's1', { ...view, parts: [...view.parts.filter(p => p.kind !== 'chords'), newPart('chords', view.parts)] });
        expect(song.sections.every(s => !s.sound)).toBe(true);
    });

    it('saves keep a section’s sound, repaired, and drop what is junk or the same as the song', () => {
        const song = editKeys(twoSections(), 's2', 'section', { instrument: 'pluck', volume: -3 });
        const id = keysId(song);
        const raw = JSON.parse(JSON.stringify(song));
        raw.sections[1].sound[id].volume = 999;
        raw.sections[1].sound[id].name = 'Hacked';
        raw.sections[1].sound[id].instrument = 'kazoo';
        raw.sections[1].sound[id].arpRate = '8n';
        raw.sections[1].sound.nope = { volume: 1 };
        raw.sections[0].sound = 'junk';
        const back = readFullSong(raw)!;
        expect(back.sections[0].sound).toBeUndefined();
        // volume clamps; an unknown instrument and a name don't stay; 8n is the song's own rate
        expect(back.sections[1].sound).toEqual({ [id]: { volume: 6 } });
        expect(readFullSong(JSON.parse(JSON.stringify(song)))!.sections[1].sound).toEqual(song.sections[1].sound);
    });
});
