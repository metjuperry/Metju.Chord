import { describe, expect, it } from 'vitest';
import {
    BassPart, ChordPart, Harmony, MelodyPart, Part, audibleParts, bassNotes, chordPartNotes, melodyMidi, melodyNotes, musicLoopEnd,
    newPart, placeNote, noteAt, fitNotes, outsideRests, restSpans,
} from './parts';
import { Clip, TICKS_PER_STEP as S, PPQ } from './progression';

const chord = (start: number, len: number, degree: number): Clip => ({
    start: start * S, len: len * S, chord: { degree, type: 'triad', inversion: 0, octave: 4 },
});
// C | Am | F | G, one bar each in 4/4
const song: Harmony = { key: 'C', scale: 'major', chords: [chord(0, 4, 0), chord(4, 4, 5), chord(8, 4, 3), chord(12, 4, 4)] };
const named = (m: number) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12] + (Math.floor(m / 12) - 1);

const parts = (): Part[] => {
    const out: Part[] = [];
    for (const k of ['chords', 'chords', 'bass', 'melody', 'drums'] as const) out.push(newPart(k, out));
    return out;
};

describe('parts', () => {
    it('get their own colour, id and a sensible name', () => {
        const ps = parts();
        expect(ps.map(p => p.name)).toEqual(['Keys', 'Keys 2', 'Bass', 'Melody', 'Drums']);
        expect(new Set(ps.map(p => p.color)).size).toBe(5);
        expect(new Set(ps.map(p => p.id)).size).toBe(5);
    });

    it('play every unmuted part, or only the soloed ones', () => {
        const [a, b, c] = parts();
        expect(audibleParts([a, { ...b, mute: true }, c]).map(p => p.name)).toEqual(['Keys', 'Bass']);
        expect(audibleParts([a, { ...b, solo: true }, { ...c, solo: true, mute: true }]).map(p => p.name)).toEqual(['Keys 2', 'Bass']);
    });
});

describe('a chord part', () => {
    const keys = newPart('chords', []) as ChordPart;

    it('holds each chord for its length', () => {
        const notes = chordPartNotes(keys, song);
        expect(notes.map(n => [n.start / S, n.len / S, n.midi.map(named).join(' ')])).toEqual([
            [0, 4, 'C4 E4 G4'], [4, 4, 'A4 C5 E5'], [8, 4, 'F4 A4 C5'], [12, 4, 'G4 B4 D5'],
        ]);
    });

    it('arpeggiates at its rate, the same way every time', () => {
        const arp: ChordPart = { ...keys, playMode: 'Arp', arpPattern: 'up', arpRate: '8n' };
        const first = chordPartNotes(arp, song).filter(n => n.start < 4 * S);
        expect(first).toHaveLength(8);
        expect(first.map(n => named(n.midi[0]))).toEqual(['C4', 'E4', 'G4', 'C4', 'E4', 'G4', 'C4', 'E4']);
        const random: ChordPart = { ...arp, arpPattern: 'random' };
        expect(chordPartNotes(random, song)).toEqual(chordPartNotes(random, song));
    });
});

describe('a bass part', () => {
    const bass = newPart('bass', []) as BassPart;
    const roots = (p: BassPart) => bassNotes(p, song, { beatTicks: S }).map(n => named(n.midi[0]));

    it('holds the root of each chord', () => {
        expect(roots({ ...bass, style: 'hold' })).toEqual(['C2', 'A2', 'F2', 'G2']);
    });

    it('plays the root on every beat', () => {
        const notes = bassNotes({ ...bass, style: 'pulse' }, song, { beatTicks: S });
        expect(notes).toHaveLength(16);
        expect(notes.every(n => n.len === S)).toBe(true);
    });

    it('drives in eighths', () => {
        expect(bassNotes({ ...bass, style: 'eighths' }, song, { beatTicks: S })).toHaveLength(32);
        expect(bassNotes({ ...bass, style: 'eighths' }, song, { beatTicks: S })[1].start).toBe(PPQ / 2);
    });

    it('alternates root and fifth', () => {
        expect(roots({ ...bass, style: 'rootFifth' }).slice(0, 4)).toEqual(['C2', 'G2', 'C2', 'G2']);
    });

    it('walks into the next chord on the last beat', () => {
        const walk = roots({ ...bass, style: 'walk' });
        // C C C then G, stepping up into A; A A A then G, stepping down into F
        expect(walk.slice(0, 8)).toEqual(['C2', 'C2', 'C2', 'G2', 'A2', 'A2', 'A2', 'G2']);
        // the last chord has nothing to walk into
        expect(walk.slice(12)).toEqual(['G2', 'G2', 'G2', 'G2']);
    });

    it('bounces between root and octave', () => {
        expect(roots({ ...bass, style: 'octaves' }).slice(0, 4)).toEqual(['C2', 'C3', 'C2', 'C3']);
    });

    it('plays off the beat', () => {
        const notes = bassNotes({ ...bass, style: 'offbeat' }, song, { beatTicks: S });
        expect(notes.slice(0, 2).map(n => n.start)).toEqual([S / 2, S + S / 2]);
        expect(notes).toHaveLength(16);
    });

    it('arpeggiates up through the chord', () => {
        // Am: A C E A
        const am = bassNotes({ ...bass, style: 'arp' }, song, { beatTicks: S }).filter(n => n.start >= 4 * S && n.start < 6 * S);
        expect(am.map(n => named(n.midi[0]))).toEqual(['A2', 'C3', 'E3', 'A3']);
    });

    it('plays 3-3-2: two long roots and a short fifth', () => {
        const bar = bassNotes({ ...bass, style: 'tresillo' }, song, { beatTicks: S }).filter(n => n.start < 2 * S);
        expect(bar.map(n => [n.start / (S / 4), n.len / (S / 4), named(n.midi[0])])).toEqual([[0, 3, 'C2'], [3, 3, 'C2'], [6, 2, 'G2']]);
    });

    it('follows the kick', () => {
        const kicks = [0, 2 * S, 2 * S + S / 2, 4 * S];
        const notes = bassNotes({ ...bass, style: 'kick' }, song, { beatTicks: S, kicks });
        expect(notes.slice(0, 4).map(n => [n.start / S, n.len / S, named(n.midi[0])])).toEqual([[0, 1, 'C2'], [2, 0.5, 'C2'], [2.5, 1, 'C2'], [4, 1, 'A2']]);
        // a chord with no kick under it holds its root
        expect(notes.find(n => n.start === 8 * S)?.len).toBe(4 * S);
    });

    it('sits in the octave you choose', () => {
        expect(roots({ ...bass, style: 'hold', octave: 1 })[0]).toBe('C1');
    });
});

describe('a melody part', () => {
    const mel = newPart('melody', []) as MelodyPart;

    it('maps rows to notes of the key, two octaves up from the root', () => {
        expect([0, 2, 4, 7, 14].map(s => named(melodyMidi(mel, song, s)))).toEqual(['C4', 'E4', 'G4', 'C5', 'C6']);
        expect(named(melodyMidi(mel, { key: 'A', scale: 'minor' }, 2))).toBe('C5');
    });

    it('follows the song into a new key', () => {
        expect(named(melodyMidi(mel, { key: 'D', scale: 'major' }, 0))).toBe('D4');
    });

    it('plays one note at a time: a new note cuts the one it lands on', () => {
        let notes = placeNote([], { start: 0, len: 96, step: 0 });
        notes = placeNote(notes, { start: 48, len: 24, step: 4 });
        expect(notes).toEqual([{ start: 0, len: 48, step: 0 }, { start: 48, len: 24, step: 4 }]);
        notes = placeNote(notes, { start: 48, len: 96, step: 2 });
        expect(notes).toEqual([{ start: 0, len: 48, step: 0 }, { start: 48, len: 96, step: 2 }]);
        expect(noteAt(notes, 100, 2)).toEqual({ start: 48, len: 96, step: 2 });
        expect(noteAt(notes, 100, 4)).toBeUndefined();
    });

    it('trims notes when the song gets shorter', () => {
        expect(fitNotes([{ start: 0, len: 96, step: 0 }, { start: 200, len: 10, step: 0 }], 48)).toEqual([{ start: 0, len: 48, step: 0 }]);
    });

    it('a melody longer than the chords sets the loop', () => {
        const long: MelodyPart = { ...mel, notes: [{ start: 17 * S, len: S, step: 0 }] };
        expect(musicLoopEnd(song.chords, [long], 4 * S) / S).toBe(20);
    });
});

describe('a rest', () => {
    const [keys, bass, mel, drums] = (() => {
        const out: Part[] = [];
        for (const k of ['chords', 'bass', 'melody', 'drums'] as const) out.push(newPart(k, out));
        return out;
    })() as [ChordPart, BassPart, MelodyPart, Part];
    // C for a bar, then a bar's rest, then G
    const withRest = (plays?: { [id: string]: boolean }): Harmony => ({
        ...song, chords: [chord(0, 4, 0), { start: 4 * S, len: 4 * S, rest: true, ...(plays && { plays }) }, chord(8, 4, 4)],
    });

    it('silences the chords and bass, and lets melody and drums play on, unless told otherwise', () => {
        const h = withRest();
        expect(chordPartNotes(keys, h).map(n => [n.start / S, n.len / S])).toEqual([[0, 4], [8, 4]]);
        expect(bassNotes({ ...bass, style: 'pulse' }, h, { beatTicks: S }).some(n => n.start >= 4 * S && n.start < 8 * S)).toBe(false);
        const melody: MelodyPart = { ...mel, notes: [{ start: 5 * S, len: S, step: 0 }] };
        expect(melodyNotes(melody, h)).toHaveLength(1);
        expect(restSpans(h.chords, drums)).toEqual([]);
    });

    it('lets a chord part play through, holding the chord before it', () => {
        const h = withRest({ [keys.id]: true });
        expect(chordPartNotes(keys, h).map(n => [n.start / S, n.len / S])).toEqual([[0, 8], [8, 4]]);
        const arp: ChordPart = { ...keys, playMode: 'Arp', arpRate: '4n' };
        expect(chordPartNotes(arp, h).filter(n => n.start >= 4 * S && n.start < 8 * S)).toHaveLength(4);
    });

    it('lets the bass keep its pattern going on the chord before it', () => {
        const notes = bassNotes({ ...bass, style: 'pulse' }, withRest({ [bass.id]: true }), { beatTicks: S });
        expect(notes.filter(n => n.start >= 4 * S && n.start < 8 * S).map(n => named(n.midi[0]))).toEqual(['C2', 'C2', 'C2', 'C2']);
    });

    it('can silence the melody: notes inside are dropped, a note running in is cut short', () => {
        const melody: MelodyPart = { ...mel, notes: [{ start: 2 * S, len: 4 * S, step: 0 }, { start: 5 * S, len: S, step: 2 }, { start: 9 * S, len: S, step: 4 }] };
        expect(melodyNotes(melody, withRest({ [mel.id]: false })).map(n => [n.start / S, n.len / S])).toEqual([[2, 2], [9, 1]]);
    });

    it('can silence the drums', () => {
        const spans = restSpans(withRest({ [drums.id]: false }).chords, drums);
        expect(spans).toEqual([[4 * S, 8 * S]]);
        expect([0, 4 * S, 7 * S, 8 * S].map(t => outsideRests(spans, t))).toEqual([true, false, false, true]);
    });
});
