import { describe, expect, it } from 'vitest';
import { byPart, pid, sid } from './testing';
import { FullSong, defaultSettings, newFullSong, readSaved } from './song';
import { applySectionEdit, sectionView } from './sections';
import { Part, VoicePart, newPart } from './parts';
import { CONTENT, CONTENT_KEYS, ContentKey, PartContent, contentOf, fillContent, musicEnd, readContent, stripContent } from './content';
import { Clip, PPQ } from './progression';
import { sectionLoopLength } from './playback';

const BAR = 4 * PPQ;
const chord = (start: number, len: number): Clip => ({ start, len, chord: { degree: 0, type: 'triad', inversion: 0, octave: 4 } });

/** Keys, Bass, Melody (p1–p3), Drums (p4) and a Voice (p5), with `content` in the one section. */
function songWith(content: { [id: string]: PartContent }, voice: Partial<VoicePart> = {}): FullSong {
    const song = newFullSong();
    const parts: Part[] = [...song.parts];
    parts.push(newPart('drums', parts));
    parts.push({ ...(newPart('voice', parts) as VoicePart), ...voice });
    return { ...song, parts, sections: [{ ...song.sections[0], chords: [chord(0, BAR)], content }] };
}

describe('an edit that changes nothing', () => {
    const cases: [string, { [id: string]: PartContent }][] = [
        ['no content', {}],
        ['melody notes', { p3: { notes: [{ start: 0, len: 24, step: 3 }] } }],
        ['a drum pattern', { p4: { drums: { bars: 2, hits: { kick: [0, 8] } } } }],
        ['voice notes', { p5: { notes: [{ start: 0, len: 24, step: 3 }] } }],
        ['an empty two-bar pattern', { p4: { drums: { bars: 2, hits: {} } } }],
        ['all of them', {
            p3: { notes: [{ start: 0, len: 24, step: 3, acc: -1 }] },
            p4: { drums: { bars: 4, hits: { kick: [0, 32], hat: [2] } } },
            p5: { notes: [{ start: 24, len: 24, step: 1 }] },
        }],
    ];
    // every kind of content the table knows has a case here
    it('covers every content kind', () => {
        const kinds = new Set(cases.flatMap(([, c]) => Object.values(c).flatMap(x => Object.keys(x))));
        expect([...kinds].sort()).toEqual([...CONTENT_KEYS].sort());
    });

    for (const [name, content] of cases) {
        it(`returns the same song, with ${name}`, () => {
            const song = songWith(content);
            for (const scope of ['section', 'song'] as const) {
                expect(applySectionEdit(song, sid('s1'), sectionView(song, sid('s1'), scope === 'section'), scope)).toBe(song);
            }
        });
    }

    it('keeps every part and section object, with a section sounding its own way too', () => {
        for (const [, content] of cases) {
            const plain = songWith(content);
            const song = { ...plain, sections: [{ ...plain.sections[0], sound: { p3: { octave: 5 }, p4: { volume: -3 }, p5: { sings: 'notes' as const } } }] };
            for (const scope of ['section', 'song'] as const) {
                const next = applySectionEdit(song, sid('s1'), sectionView(song, sid('s1'), scope === 'section'), scope);
                expect(next).toBe(song);
            }
        }
    });

    it('setting a part to what it already is returns the same song (no undo step)', () => {
        const song = songWith({ p5: { notes: [{ start: 0, len: PPQ, step: 2 }] } });
        const view = sectionView(song, sid('s1'), false);
        const same = { ...view, parts: view.parts.map(p => (p.id === pid('p1') && p.kind === 'chords' ? { ...p, instrument: p.instrument, playMode: p.playMode } : p)) };
        expect(applySectionEdit(song, sid('s1'), same, 'song')).toBe(song);
    });

    it('a real edit still gives a new song, and keeps the parts it didn’t touch', () => {
        const song = songWith({ p5: { notes: [{ start: 0, len: PPQ, step: 2 }] } });
        const view = sectionView(song, sid('s1'), false);
        const next = applySectionEdit(song, sid('s1'), { ...view, bpm: 90 }, 'song');
        expect(next).not.toBe(song);
        expect(next.bpm).toBe(90);
        expect(next.parts).toBe(song.parts);
        expect(next.sections).toBe(song.sections);
    });
});

describe('how long a section plays', () => {
    const late = [{ start: 3 * BAR, len: PPQ, step: 0 }];

    it('a voice singing its own notes counts them', () => {
        const song = songWith({ p5: { notes: late } }, { sings: 'notes' });
        const view = sectionView(song, sid('s1'));
        expect(musicEnd(view.chords, view.parts, BAR)).toBe(3 * BAR + PPQ);
    });

    it('a voice singing the chords doesn’t stretch the section with notes it still holds', () => {
        const song = songWith({ p5: { notes: late } }, { sings: 'chords' });
        const view = sectionView(song, sid('s1'));
        expect(musicEnd(view.chords, view.parts.filter(p => p.kind !== 'drums'), BAR)).toBe(BAR);
        expect(sectionLoopLength(view)).toBe(BAR);
        // and the notes are still there for when it sings them again
        expect(view.parts.find(p => p.id === pid('p5'))).toMatchObject({ notes: late });
    });
});

/** One part of each kind that holds content, and some content for it. */
const SAMPLES: { [K in ContentKey]: { part: () => Part; value: PartContent } } = {
    notes: { part: () => newPart('melody', []), value: { notes: [{ start: 0, len: 48, step: 2, acc: 1 }, { start: 96, len: 24, step: 9 }] } },
    drums: { part: () => newPart('drums', []), value: { drums: { bars: 2, hits: { kick: [0, 16], snare: [4] } } } },
};

const emptyIs = <K extends ContentKey>(key: K) => ({ empty: CONTENT[key].isEmpty(CONTENT[key].empty()), silent: CONTENT[key].silent(CONTENT[key].empty()) });

describe('the content table', () => {
    it('has a sample for every kind', () => expect(Object.keys(SAMPLES).sort()).toEqual([...CONTENT_KEYS].sort()));

    for (const key of CONTENT_KEYS) {
        describe(key, () => {
            const { part, value } = SAMPLES[key];
            const kind = CONTENT[key];
            const filled = fillContent(part(), value);

            it('is held by its part, and empty in a new one', () => {
                const p = part();
                expect(kind.holds(p)).toBe(true);
                expect(contentOf(p)).toBeUndefined();
                expect(stripContent(p)).toBe(p);
                expect(emptyIs(key)).toEqual({ empty: true, silent: true });
            });

            it('goes into a part and back out', () => {
                expect(contentOf(filled)).toEqual(value);
                expect(contentOf(stripContent(filled))).toBeUndefined();
                expect(fillContent(stripContent(filled), undefined)).toEqual(stripContent(filled));
                // a section without content empties a view's part again
                expect(contentOf(fillContent(filled, undefined))).toBeUndefined();
            });

            it('reads back from a save as it was', () => {
                expect(readContent(part(), JSON.parse(JSON.stringify(value)), { maxTick: 16 * 96, barLen: 16 })).toEqual(value);
                expect(readContent(part(), 'junk', { maxTick: 16 * 96, barLen: 16 })).toBeUndefined();
                expect(readContent(part(), { [key]: 'junk' }, { maxTick: 16 * 96, barLen: 16 })).toBeUndefined();
            });

            it('round-trips through a saved song', () => {
                const song = newFullSong();
                const p = { ...part(), id: pid('p9') };
                const full: FullSong = { ...song, parts: [...song.parts, stripContent(p)], sections: [{ ...song.sections[0], steps: 16, content: byPart({ p9: value }) }] };
                const read = readSaved(JSON.parse(JSON.stringify({ version: 3, song: full, settings: defaultSettings() })))!;
                expect(read.song.sections[0].content[pid('p9')]).toEqual(value);
                expect(contentOf(sectionView(read.song, sid('s1')).parts.find(x => x.id === pid('p9'))!)).toEqual(value);
                // and a view of it written back is the same song
                expect(applySectionEdit(read.song, sid('s1'), sectionView(read.song, sid('s1')))).toBe(read.song);
            });

            it('is left alone by parts that hold another kind', () => {
                for (const other of CONTENT_KEYS.filter(k => k !== key)) {
                    expect(CONTENT[other].holds(part())).toBe(false);
                }
                const chords = newPart('chords', []);
                expect(kind.holds(chords)).toBe(false);
                expect(fillContent(chords, value)).toBe(chords);
                expect(contentOf(chords)).toBeUndefined();
            });
        });
    }

    it('a voice singing the chords holds notes but doesn’t play them', () => {
        const voice = { ...(newPart('voice', []) as VoicePart), sings: 'chords' as const };
        expect(CONTENT.notes.holds(voice)).toBe(true);
        expect(CONTENT.notes.plays(voice)).toBe(false);
        expect(CONTENT.notes.plays({ ...voice, sings: 'notes' })).toBe(true);
    });
});
