import { describe, expect, it } from 'vitest';
import { FullSong, newFullSong } from './song';
import { applySectionEdit, sectionView } from './sections';
import { Part, VoicePart, musicEnd, newPart } from './parts';
import { Clip, PPQ } from './progression';
import { sectionLoopLength } from './playback';

const BAR = 4 * PPQ;
const chord = (start: number, len: number): Clip => ({ start, len, chord: { degree: 0, type: 'triad', inversion: 0, octave: 4 } });

/** Keys, Bass, Melody (p1–p3), Drums (p4) and a Voice (p5), with `content` in the one section. */
function songWith(content: FullSong['sections'][0]['content'], voice: Partial<VoicePart> = {}): FullSong {
    const song = newFullSong();
    const parts: Part[] = [...song.parts];
    parts.push(newPart('drums', parts));
    parts.push({ ...(newPart('voice', parts) as VoicePart), ...voice });
    return { ...song, parts, sections: [{ ...song.sections[0], chords: [chord(0, BAR)], content }] };
}

describe('an edit that changes nothing', () => {
    const cases: [string, FullSong['sections'][0]['content']][] = [
        ['no content', {}],
        ['melody notes', { p3: { notes: [{ start: 0, len: 24, step: 3 }] } }],
        ['a drum pattern', { p4: { drums: { bars: 2, hits: { kick: [0, 8] } } } }],
        ['voice notes', { p5: { notes: [{ start: 0, len: 24, step: 3 }] } }],
        ['a vowel lane', { p5: { vowels: [{ start: 0, len: PPQ, vowel: 'a' }] } }],
        ['voice notes and a vowel lane', { p5: { notes: [{ start: 0, len: 24, step: 3 }], vowels: [{ start: 0, len: PPQ, vowel: 'a' }] } }],
    ];
    for (const [name, content] of cases) {
        it(`returns the same song, with ${name}`, () => {
            const song = songWith(content);
            for (const scope of ['section', 'song'] as const) {
                expect(applySectionEdit(song, 's1', sectionView(song, 's1', scope === 'section'), scope)).toBe(song);
            }
        });
    }

    it('setting a part to what it already is returns the same song (no undo step)', () => {
        const song = songWith({ p5: { vowels: [{ start: 0, len: PPQ, vowel: 'a' }] } });
        const view = sectionView(song, 's1', false);
        const same = { ...view, parts: view.parts.map(p => (p.id === 'p1' && p.kind === 'chords' ? { ...p, instrument: p.instrument, playMode: p.playMode } : p)) };
        expect(applySectionEdit(song, 's1', same, 'song')).toBe(song);
    });

    it('a real edit still gives a new song, and keeps the parts it didn’t touch', () => {
        const song = songWith({ p5: { vowels: [{ start: 0, len: PPQ, vowel: 'a' }] } });
        const view = sectionView(song, 's1', false);
        const next = applySectionEdit(song, 's1', { ...view, bpm: 90 }, 'song');
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
        const view = sectionView(song, 's1');
        expect(musicEnd(view.chords, view.parts, BAR)).toBe(3 * BAR + PPQ);
    });

    it('a voice singing the chords doesn’t stretch the section with notes it still holds', () => {
        const song = songWith({ p5: { notes: late } }, { sings: 'chords' });
        const view = sectionView(song, 's1');
        expect(musicEnd(view.chords, view.parts.filter(p => p.kind !== 'drums'), BAR)).toBe(BAR);
        expect(sectionLoopLength(view)).toBe(BAR);
        // and the notes are still there for when it sings them again
        expect(view.parts.find(p => p.id === 'p5')).toMatchObject({ notes: late });
    });
});
