import { describe, expect, it } from 'vitest';
import {
    HtChord, ImportOptions, MAX_NOTES, chordTones, closestScale, fitWindows, importHooktheory, keyChoice, matchChord, monophonic,
    parseHooktheory, parseSd, parseTonic, snapToScale,
} from './hooktheory';
import { MelodyPart, Part, melodyMidi, newPart } from './parts';
import { Song, newSong, readSong } from './song';
import { SCALES, ScaleId, keyPitchClass } from './theory';
import { ChordClip, Clip } from './progression';

// ---- fixtures: small invented lines and public-domain tunes only -----------------------------

type N = [beat: number, duration: number, sd: string, octave?: number];
type C = [beat: number, duration: number, chord: Partial<Record<string, unknown>>];

/** A clipboard in both shapes, as Hookpad writes it. */
function clipboard(notes: N[], key = { tonic: 'C', scale: 'major' }, chords: C[] = []) {
    const chordFields = (c: Partial<Record<string, unknown>>) => ({
        root: 1, type: 5, inversion: 0, applied: 0, adds: [], omits: [], alterations: [], suspensions: [], borrowed: '', pedal: null, substitutions: [], isRest: false, ...c,
    });
    return JSON.stringify({
        notes: notes.map(([beat, duration, sd, octave = 0]) => ({ beat, duration, sd, octave, isRest: false })),
        chords: chords.map(([beat, duration, c]) => ({ beat, duration, ...chordFields(c) })),
        keys: [{ beat: 1, ...key }],
        modern: {
            version: 'hooktheory-clipboard-v1',
            fp: 'x',
            payload: {
                notes: notes.map(([beat, duration, sd, octave = 0], i) => ({ id: `n${i}`, sd, octave, startTick: (beat - 1) * 480, durationTicks: duration * 480, isRest: false, voice: 1 })),
                chords: chords.map(([beat, duration, c], i) => ({ id: `c${i}`, startTick: (beat - 1) * 480, durationTicks: duration * 480, ...chordFields(c) })),
                keys: [{ id: 'k', startTick: 0, ...key }],
                meters: [], tempos: [], swings: [], sections: [], breaks: [], audioClips: [], baseTick: 0,
            },
        },
        fp: 'x',
    });
}

/** Twinkle Twinkle, first line, in C major (public domain). */
const TWINKLE: N[] = [[1, 1, '1'], [2, 1, '1'], [3, 1, '5'], [4, 1, '5'], [5, 1, '6'], [6, 1, '6'], [7, 2, '5']];
/** Ode to Joy, first phrase (public domain). */
const ODE: N[] = [[1, 1, '3'], [2, 1, '3'], [3, 1, '4'], [4, 1, '5'], [5, 1, '5'], [6, 1, '4'], [7, 1, '3'], [8, 1, '2'],
    [9, 1, '1'], [10, 1, '1'], [11, 1, '2'], [12, 1, '3'], [13, 1.5, '3'], [14.5, 0.5, '2'], [15, 2, '2']];

const opts = (o: Partial<ImportOptions> = {}): ImportOptions => ({ keyMode: 'paste', at: 0, halfTime: false, notes: true, chords: true, chordOctave: 4, ...o });
const parse = (text: string) => {
    const r = parseHooktheory(text);
    if (!r.ok) throw new Error(r.error);
    return r.clip;
};
const run = (song: Song, text: string, o: Partial<ImportOptions> = {}) => importHooktheory(song, parse(text), opts(o));
const melodies = (s: Song) => s.parts.filter((p): p is MelodyPart => p.kind === 'melody');
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const named = (m: number) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
/** The melody of a part as note names, in time order. */
const sung = (s: Song, p: MelodyPart) => p.notes.map(n => named(melodyMidi(p, s, n.step)));
const pcsOf = (tones: { pc: number }[]) => tones.map(t => NAMES[t.pc]).sort();
const chord = (c: Partial<HtChord>): HtChord => ({
    start: 0, len: 4, rest: false, root: 0, type: 5, inversion: 0, applied: 0, adds: [], omits: [], alterations: [], suspensions: [], borrowed: null, ignored: [], ...c,
});
const steps = (id: ScaleId) => SCALES.find(s => s.id === id)!.steps;

describe('reading the clipboard', () => {
    it('reads the modern payload and the legacy lists alike', () => {
        const text = JSON.parse(clipboard(TWINKLE));
        const modern = parse(JSON.stringify(text));
        const { modern: _, ...legacyOnly } = text;
        const legacy = parse(JSON.stringify(legacyOnly));
        expect(modern.source).toBe('modern');
        expect(legacy.source).toBe('legacy');
        expect(legacy.notes).toEqual(modern.notes);
        expect(modern.notes.map(n => n.start)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(modern.notes[6].len).toBe(2);
    });

    it('prefers the modern payload when both are there', () => {
        const text = JSON.parse(clipboard(TWINKLE));
        text.notes = [{ beat: 1, duration: 1, sd: '7', octave: 0, isRest: false }];
        expect(parse(JSON.stringify(text)).notes).toHaveLength(7);
    });

    it('starts the paste at its first event, rests included, and skips rests', () => {
        const text = JSON.parse(clipboard([[5, 1, '1'], [6, 1, '2']]));
        text.modern.payload.notes.unshift({ id: 'r', sd: '1', octave: 0, startTick: 3 * 480, durationTicks: 480, isRest: true });
        const clip = parse(JSON.stringify(text));
        expect(clip.rests).toBe(1);
        expect(clip.notes.map(n => n.start)).toEqual([1, 2]);
    });

    it('reads scale degrees with accidentals and tonics with ♯/♭', () => {
        expect(parseSd('3')).toEqual({ degree: 2, shift: 0 });
        expect(parseSd('b7')).toEqual({ degree: 6, shift: -1 });
        expect(parseSd('#4')).toEqual({ degree: 3, shift: 1 });
        expect(parseSd('♭2')).toEqual({ degree: 1, shift: -1 });
        expect(parseSd(5)).toEqual({ degree: 4, shift: 0 });
        expect(parseSd('8')).toBeNull();
        expect(parseSd('x3')).toBeNull();
        expect(parseTonic('A')).toBe(9);
        expect(parseTonic('Bb')).toBe(10);
        expect(parseTonic('F#')).toBe(6);
        expect(parseTonic('E♭')).toBe(3);
        expect(parseTonic('Cb')).toBe(11);
        expect(parseTonic('H')).toBeNull();
    });

    it('maps Hooktheory scales onto the app’s eight, closest when it has no match', () => {
        const key = (scale: string) => parse(clipboard(TWINKLE, { tonic: 'D', scale })).keys[0];
        expect(key('minor')).toMatchObject({ scale: 'minor', exact: true });
        expect(key('harmonicMinor')).toMatchObject({ scale: 'harmonicMinor', exact: true });
        expect(key('mixolydian')).toMatchObject({ scale: 'mixolydian', exact: true });
        expect(key('locrian')).toMatchObject({ scale: 'phrygian', exact: false });
        expect(key('phrygianDominant')).toMatchObject({ scale: 'phrygian', exact: false });
        expect(key('aeolian')).toMatchObject({ scale: 'minor', exact: true });
        expect(key('wholeTone')).toMatchObject({ scale: 'major', known: false });
        expect(closestScale([0, 2, 4, 5, 7, 9, 10])).toBe('mixolydian');
    });

    it('turns garbage into a friendly error, never an exception', () => {
        const bad = ['', '   ', 'hello', '[]', '{}', 'null', '42', '{"notes":"x"}', '{"notes":[]}', '{"notes":[1,2,3]}',
            '{"notes":[{"beat":"1","duration":1,"sd":"1"}]}', '{"notes":[{"beat":1,"duration":-1,"sd":"1"}]}',
            '{"notes":[{"beat":1,"duration":1,"sd":"9"}]}', '{"modern":{"payload":"x"}}', '{"notes":[{"beat":1e308,"duration":1,"sd":"1"}]}'];
        for (const text of bad) {
            const r = parseHooktheory(text);
            expect(r.ok, text).toBe(false);
            if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
        }
    });

    it('survives random junk in every field', () => {
        const junk = [null, undefined, true, -1, 0, 1.5, 1e9, NaN, 'b', '#9', '1', [], {}, [1, 2], { a: 1 }, 'Bb', 'minor'];
        const pick = (i: number) => junk[(i * 7919) % junk.length];
        for (let i = 0; i < 400; i++) {
            const entry = { beat: pick(i), duration: pick(i + 1), sd: pick(i + 2), octave: pick(i + 3), isRest: pick(i + 4), root: pick(i + 5), type: pick(i + 6), inversion: pick(i + 7), adds: pick(i + 8), alterations: pick(i + 9), borrowed: pick(i + 10), applied: pick(i + 11), suspensions: pick(i + 12) };
            const text = JSON.stringify({ notes: [entry, { beat: 1, duration: 1, sd: '1' }], chords: [entry], keys: [{ beat: pick(i), tonic: pick(i + 13), scale: pick(i + 14) }] });
            const r = parseHooktheory(text);
            expect(r.ok).toBe(true);
            if (r.ok) expect(() => importHooktheory(newSong(), r.clip, opts())).not.toThrow();
        }
    });

    it('counts unreadable entries and caps the size', () => {
        const clip = parse(JSON.stringify({ notes: [{ beat: 1, duration: 1, sd: '1' }, { beat: 2, duration: 1, sd: 'zz' }, 'x'], keys: [] }));
        expect(clip.skipped).toBe(2);
        expect(clip.noKey).toBe(true);
        const many = Array.from({ length: MAX_NOTES + 1 }, (_, i) => ({ beat: i + 1, duration: 1, sd: '1' }));
        const r = parseHooktheory(JSON.stringify({ notes: many }));
        expect(r.ok).toBe(false);
    });
});

describe('pitch', () => {
    it('reads scale degrees in the key’s mode: in A minor sd 1 is A, sd 3 is C', () => {
        const { song, summary } = run(newSong(), clipboard([[1, 1, '1'], [2, 1, '3'], [3, 1, '5'], [4, 1, '1', 1]], { tonic: 'A', scale: 'minor' }));
        expect(song.key).toBe('A');
        expect(song.scale).toBe('minor');
        expect(summary.keyChanged).toBe(true);
        const [m] = melodies(song);
        expect(sung(song, m)).toEqual(['A4', 'C5', 'E5', 'A5']);
        expect(m.octave).toBe(4);
    });

    it('places octave −1 below the tonic, keeping one part when it fits', () => {
        const { song } = run(newSong(), clipboard([[1, 1, '5', -1], [2, 1, '7', -1], [3, 1, '1'], [4, 1, '3']]));
        const ms = melodies(song);
        expect(ms.filter(m => m.notes.length)).toHaveLength(1);
        expect(sung(song, ms[0])).toEqual(['G3', 'B3', 'C4', 'E4']);
        expect(ms[0].octave).toBe(3);
    });

    it('keeps the song’s key by moving each note to the same scale degree', () => {
        const song = { ...newSong(), key: 'C' as const, scale: 'major' as ScaleId };
        const text = clipboard([[1, 1, '1'], [2, 1, '3'], [3, 1, '5']], { tonic: 'D', scale: 'major' });
        const { song: out, summary } = run(song, text, { keyMode: 'song' });
        expect(out.key).toBe('C');
        expect(summary.keyChanged).toBe(false);
        expect(sung(out, melodies(out)[0])).toEqual(['C4', 'E4', 'G4']);
        // and the other way, the paste's key: D F♯ A
        const { song: own } = run(song, text, { keyMode: 'paste' });
        expect(own.key).toBe('D');
        expect(sung(own, melodies(own)[0])).toEqual(['D4', 'F#4', 'A4']);
    });

    it('keeps the pitches when the keys share their notes (A minor into C major)', () => {
        const song = newSong();
        const text = clipboard([[1, 1, '1'], [2, 1, '3'], [3, 1, '5']], { tonic: 'A', scale: 'minor' });
        const clip = parse(text);
        expect(keyChoice(clip, song).sharesNotes).toBe(true);
        const { song: out, summary } = importHooktheory(song, clip, opts({ keyMode: 'song' }));
        expect(out.key).toBe('C');
        expect(summary.warnings.some(w => /outside/.test(w.text))).toBe(false);
        // A C E: A3 is the A nearest below C4, so the line sits in octave 3
        expect(sung(out, melodies(out)[0])).toEqual(['A3', 'C4', 'E4']);
    });

    it('moves notes outside the scale to the nearest scale note, the lower one on a tie, and lists them', () => {
        expect(snapToScale(6, steps('major'))).toEqual({ index: 3, exact: false }); // F♯ → F
        expect(snapToScale(1, steps('major'))).toEqual({ index: 0, exact: false }); // C♯ → C
        expect(snapToScale(-1, steps('major'))).toEqual({ index: -1, exact: true }); // B below
        expect(snapToScale(9, steps('harmonicMinor'))).toEqual({ index: 5, exact: false }); // A in C harm. minor: A♭ (8) wins over B (11)
        expect(snapToScale(10, steps('harmonicMinor'))).toEqual({ index: 6, exact: false }); // B♭: B (11) is nearer than A♭
        expect(snapToScale(-5, steps('major'))).toEqual({ index: -3, exact: true });

        const { song, summary } = run(newSong(), clipboard([[1, 1, '5'], [2, 1, '#6'], [3, 1, '#7'], [4, 1, '1', 1]], { tonic: 'A', scale: 'minor' }));
        expect(sung(song, melodies(song)[0])).toEqual(['E5', 'F5', 'G5', 'A5']);
        const w = summary.warnings.find(x => /outside A minor/.test(x.text))!;
        expect(w.text).toMatch(/^2 notes/);
        expect(w.details).toEqual(['F♯ → F at bar 1', 'G♯ → G at bar 1']);
    });

    it('reads a scale the app lacks in its own notes, then fits it into the closest one', () => {
        // D locrian 1 ♭2 ♭3 4 ♭5: everything but the ♭5 is in D phrygian
        const { song, summary } = run(newSong(), clipboard([[1, 1, '1'], [2, 1, '2'], [3, 1, '3'], [4, 1, '5']], { tonic: 'D', scale: 'locrian' }));
        expect(song.scale).toBe('phrygian');
        expect(sung(song, melodies(song)[0])).toEqual(['D4', 'D#4', 'F4', 'G4']);
        expect(summary.warnings.map(w => w.text).join(' ')).toMatch(/no locrian scale; the closest it has is phrygian/);
        expect(summary.warnings.find(w => /outside/.test(w.text))?.details).toEqual(['A♭ → G at bar 1']);
    });
});

describe('time', () => {
    it('puts one beat on a quarter note (96 ticks) and grows the song', () => {
        const { song, summary } = run(newSong(), clipboard(ODE));
        const [m] = melodies(song);
        expect(m.notes.map(n => n.start)).toEqual([0, 96, 192, 288, 384, 480, 576, 672, 768, 864, 960, 1056, 1152, 1296, 1344]);
        expect(m.notes[12].len).toBe(144);
        expect(song.steps).toBe(16);
        expect(summary.bars).toBe(4);
        expect(sung(song, m).slice(0, 4)).toEqual(['E4', 'E4', 'F4', 'G4']);
    });

    it('snaps notes onto the 1/16 grid and counts them', () => {
        const { song, summary } = run(newSong(), clipboard([[1, 1, '1'], [2.3, 0.7, '2'], [3, 1 / 3, '3']]));
        const [m] = melodies(song);
        expect(m.notes.map(n => [n.start, n.len])).toEqual([[0, 96], [120, 72], [192, 24]]);
        expect(summary.warnings.find(w => /1\/16 grid/.test(w.text))?.text).toMatch(/^2 notes/);
    });

    it('half time doubles every length', () => {
        const { song } = run(newSong(), clipboard(TWINKLE), { halfTime: true });
        expect(melodies(song)[0].notes.map(n => n.start)).toEqual([0, 192, 384, 576, 768, 960, 1152]);
    });

    it('goes in at the chosen step', () => {
        const { song, summary } = run(newSong(), clipboard(TWINKLE), { at: 8 * 96 });
        expect(melodies(song)[0].notes[0].start).toBe(768);
        expect(summary.startBar).toBe(3);
        expect(song.steps).toBe(16);
    });

    it('keeps one note at a time: the highest of overlapping notes', () => {
        const { song, summary } = run(newSong(), clipboard([[1, 2, '1'], [1, 1, '3'], [2, 1, '5'], [3, 1, '2'], [3.5, 1, '1']]));
        // C and E start together: E wins and C is dropped; the C starting under the D is lower, so it's dropped too
        expect(sung(song, melodies(song)[0])).toEqual(['E4', 'G4', 'D4']);
        expect(summary.warnings.find(w => /overlapping/.test(w.text))?.text).toMatch(/^2 overlapping notes/);
        const mono = monophonic([{ start: 0, len: 96, index: 0, semis: 0 }, { start: 48, len: 96, index: 2, semis: 4 }]);
        expect(mono.kept.map(n => [n.start, n.len])).toEqual([[0, 48], [48, 96]]);
        expect(mono.dropped).toBe(0);
    });

    it('leaves out what runs past the longest song', () => {
        const { song, summary } = run(newSong(), clipboard([[1, 1, '1'], [600, 4, '2']]));
        expect(melodies(song)[0].notes).toHaveLength(1);
        expect(song.steps).toBe(8);
        expect(summary.warnings.some(w => /past the longest song/.test(w.text))).toBe(true);
    });
});

describe('fitting into Melody parts', () => {
    it('fills the song’s empty Melody part instead of adding one', () => {
        const before = newSong();
        const { song, summary } = run(before, clipboard(TWINKLE));
        expect(song.parts).toHaveLength(before.parts.length);
        expect(summary.parts).toEqual([expect.objectContaining({ name: 'Melody', reused: true, notes: 7, octave: 4 })]);
    });

    it('adds “Melody 2” when the song’s Melody part already has notes', () => {
        const before = newSong();
        before.parts = before.parts.map(p => (p.kind === 'melody' ? { ...p, notes: [{ start: 0, len: 96, step: 0 }] } : p));
        const { song } = run(before, clipboard(TWINKLE));
        expect(melodies(song).map(m => m.name)).toEqual(['Melody', 'Melody 2']);
        expect(melodies(song)[1].instrument).toBe('lead');
    });

    it('splits a melody wider than two octaves into parts, cutting at the longest rest', () => {
        // a low phrase (G3–C4, a short gap inside), a rest, then a high phrase (C5–C6)
        const line: N[] = [[1, 1, '5', -1], [2, 1, '6', -1], [3.5, 0.5, '7', -1], [4, 1, '1'],
            [7, 1, '1', 1], [8, 1, '3', 1], [9, 1, '5', 1], [10, 1, '1', 2]];
        const { song, summary } = run(newSong(), clipboard(line));
        const ms = melodies(song).filter(m => m.notes.length);
        expect(ms.map(m => m.octave)).toEqual([3, 4]);
        expect(sung(song, ms[0])).toEqual(['G3', 'A3', 'B3', 'C4']);
        expect(sung(song, ms[1])).toEqual(['C5', 'E5', 'G5', 'C6']);
        expect(summary.parts.map(p => p.name)).toEqual(['Melody', 'Melody 2']);
        // every note still has a step on the grid
        for (const m of ms) for (const n of m.notes) expect(n.step).toBeGreaterThanOrEqual(0);
        for (const m of ms) for (const n of m.notes) expect(n.step).toBeLessThan(15);
        // and the saved song reads back unchanged
        expect(readSong(JSON.parse(JSON.stringify(song)))).toEqual(song);
    });

    it('reuses a window when a later phrase fits it', () => {
        const at = (start: number, index: number) => ({ start, len: 96, index, semis: 0 });
        expect(fitWindows([at(0, 0), at(96, 14), at(192, 20), at(288, 2)])).toEqual([0, 0, 1, 0]);
    });

    it('says so when there’s no room for the parts it needs', () => {
        const before = newSong();
        const parts: Part[] = [...before.parts.filter(p => p.kind !== 'melody')];
        while (parts.length < 6) parts.push(newPart('chords', parts));
        const full = { ...before, parts };
        const { song, summary } = run(full, clipboard(TWINKLE, undefined, [[1, 4, { root: 1 }]]));
        expect(summary.problem).toMatch(/Melody part/);
        expect(summary.problem).toMatch(/chords only/);
        expect(song).toBe(full);
        // chords alone still go in
        const chordsOnly = run(full, clipboard(TWINKLE, undefined, [[1, 4, { root: 1 }]]), { notes: false });
        expect(chordsOnly.summary.problem).toBeUndefined();
        expect(chordsOnly.song.chords).toHaveLength(1);
    });
});

describe('chords', () => {
    const A = keyPitchClass('A');
    const C = 0;
    const match = (c: Partial<HtChord>, tonic: number, scale: ScaleId) => {
        const t = chordTones(chord(c), tonic, steps(scale));
        return { ...t, ...matchChord(t.tones, t.rootPc, t.bass, tonic, scale) };
    };

    it('stacks thirds from the root up to the type', () => {
        expect(pcsOf(chordTones(chord({ root: 5 }), A, steps('minor')).tones)).toEqual(['A', 'C', 'F']);
        expect(pcsOf(chordTones(chord({ root: 4, type: 7 }), C, steps('major')).tones)).toEqual(['B', 'D', 'F', 'G']);
        expect(pcsOf(chordTones(chord({ root: 1, type: 9 }), C, steps('major')).tones)).toEqual(['A', 'C', 'D', 'E', 'F']);
    });

    it('VI△7(add13) in A minor is Fmaj7 with the add13 dropped', () => {
        const m = match({ root: 5, type: 7, adds: [6] }, A, 'minor');
        expect(pcsOf(m.tones)).toEqual(['A', 'C', 'D', 'E', 'F']);
        expect(m).toMatchObject({ degree: 5, type: 'diatonic7', inversion: 0, dropped: ['add13'], extra: [], rootMoved: false });
    });

    it('v7(add11) in A minor is Em7 with the add11 dropped', () => {
        expect(match({ root: 4, type: 7, adds: [4] }, A, 'minor')).toMatchObject({ degree: 4, type: 'diatonic7', dropped: ['add11'] });
    });

    it('IV6/5 borrowed from dorian in A minor is D7 over F♯: degree 3, dom7, first inversion', () => {
        const m = match({ root: 3, type: 7, inversion: 1, borrowed: 'dorian' }, A, 'minor');
        expect(pcsOf(m.tones)).toEqual(['A', 'C', 'D', 'F#']);
        expect(m).toMatchObject({ degree: 3, type: 'dom7', inversion: 1, dropped: [], extra: [] });
    });

    it('builds from a custom borrowed scale', () => {
        const m = match({ root: 0, borrowed: [0, 1, 3, 5, 6, 9, 10] }, A, 'minor');
        expect(pcsOf(m.tones)).toEqual(['A', 'C', 'D#']);
        expect(m).toMatchObject({ degree: 0, type: 'dim' });
    });

    it('reads applied chords as that chord of the root’s major key: V/V in C is D major', () => {
        const m = match({ root: 4, applied: 5 }, C, 'major');
        expect(pcsOf(m.tones)).toEqual(['A', 'D', 'F#']);
        expect(m).toMatchObject({ degree: 1, type: 'flip', dropped: [] });
        // vii°7/V in C: F♯ A C E♭
        expect(pcsOf(match({ root: 4, applied: 7, type: 7 }, C, 'major').tones)).toEqual(['A', 'C', 'E', 'F#']);
    });

    it('suspensions replace the 3rd', () => {
        expect(match({ root: 0, suspensions: [4] }, C, 'major')).toMatchObject({ degree: 0, type: 'sus4', dropped: [] });
        expect(match({ root: 0, suspensions: [2] }, C, 'major')).toMatchObject({ degree: 0, type: 'sus2', dropped: [] });
        expect(pcsOf(chordTones(chord({ suspensions: [4, 2] }), C, steps('major')).tones)).toEqual(['C', 'D', 'F', 'G']);
    });

    it('alterations change a member, or add it, and are dropped when the pads can’t play them', () => {
        const g7s9 = match({ root: 4, type: 7, alterations: [{ degree: 9, shift: 1, label: '♯9' }] }, C, 'major');
        expect(pcsOf(g7s9.tones)).toEqual(['A#', 'B', 'D', 'F', 'G']);
        expect(g7s9).toMatchObject({ degree: 4, type: 'diatonic7', dropped: ['♯9'] });
        const aug = match({ root: 0, alterations: [{ degree: 5, shift: 1, label: '♯5' }] }, C, 'major');
        expect(pcsOf(aug.tones)).toEqual(['C', 'E', 'G#']);
        expect(aug).toMatchObject({ degree: 0, type: 'aug', dropped: [] });
    });

    it('omits take out the 3rd or 5th', () => {
        expect(pcsOf(chordTones(chord({ type: 7, omits: [5] }), C, steps('major')).tones)).toEqual(['B', 'C', 'E']);
    });

    it('inversions count chord members from the bottom: 3 on a 7th is the 7th in the bass', () => {
        expect(match({ root: 4, type: 7, inversion: 3 }, C, 'major')).toMatchObject({ degree: 4, type: 'diatonic7', inversion: 3 });
        expect(match({ root: 0, inversion: 2 }, C, 'major')).toMatchObject({ type: 'triad', inversion: 2 });
    });

    it('fits 11ths and 13ths into a 9th, listing what is dropped', () => {
        expect(match({ root: 4, type: 13 }, C, 'major')).toMatchObject({ degree: 4, type: 'diatonic9', dropped: ['11th', '13th'] });
    });

    it('a chord whose root isn’t in the key gets the nearest one and says the root moved', () => {
        // ♭VII in C major borrowed from mixolydian is B♭: C major has no B♭ chord
        const m = match({ root: 6, borrowed: 'mixolydian' }, C, 'major');
        expect(m.rootMoved).toBe(true);
    });

    it('go into the chord row at the insertion point, with rests, replacing only the stretch they cover', () => {
        const before = newSong();
        before.steps = 32;
        const old = (start: number, degree: number): Clip => ({ start: start * 96, len: 4 * 96, chord: { degree, type: 'triad', inversion: 0, octave: 4 } });
        before.chords = [old(0, 0), old(4, 3), old(8, 4), old(12, 0), old(16, 5)];
        // I | rest | V, at bar 2 (step 4)
        const text = clipboard([], { tonic: 'C', scale: 'major' }, [[1, 4, { root: 1 }], [5, 2, { isRest: true }], [7, 2, { root: 5, type: 7 }]]);
        const { song, summary } = run(before, text, { at: 4 * 96 });
        expect(song.chords.map(c => [c.start / 96, c.len / 96, c.rest ? 'rest' : (c as ChordClip).chord.degree])).toEqual([
            [0, 4, 0], [4, 4, 0], [8, 2, 'rest'], [10, 2, 4], [12, 4, 0], [16, 4, 5],
        ]);
        expect(summary.replaced).toBe(2);
        expect(summary.chords).toBe(2);
        expect((song.chords[3] as ChordClip).chord.type).toBe('diatonic7');
    });

    it('move chords that don’t start on a beat to the nearest one and report them', () => {
        const text = clipboard([], undefined, [[1, 1.5, { root: 1 }], [2.5, 1.5, { root: 4 }]]);
        const { song, summary } = run(newSong(), text);
        expect(song.chords.map(c => [c.start, c.len])).toEqual([[0, 192], [192, 192]]);
        expect(summary.warnings.find(w => /on a beat/.test(w.text))?.text).toMatch(/^2 chords/);
    });

    it('list dropped tones and ignored fields by bar, and use the pads’ octave', () => {
        const text = clipboard([], { tonic: 'A', scale: 'minor' }, [[1, 4, { root: 6, type: 7, adds: [6] }], [5, 4, { root: 1, pedal: 1 }]]);
        const { song, summary } = run(newSong(), text, { chordOctave: 3 });
        const w = summary.warnings.find(x => /nearest chord/.test(x.text))!;
        expect(w.details).toEqual(['Fmaj7 at bar 1: add13 dropped']);
        expect(summary.warnings.find(x => /Ignored/.test(x.text))?.details).toEqual(['pedal on Am at bar 2']);
        expect((song.chords[0] as ChordClip).chord.octave).toBe(3);
    });

    it('can be left out', () => {
        const text = clipboard(TWINKLE, undefined, [[1, 4, { root: 1 }]]);
        const { song } = run(newSong(), text, { chords: false });
        expect(song.chords).toEqual([]);
        expect(melodies(song)[0].notes).toHaveLength(7);
    });

    it('with notes, chords and a key change make one valid song', () => {
        const text = clipboard(ODE, { tonic: 'G', scale: 'major' }, [[1, 4, { root: 1 }], [5, 4, { root: 5 }], [9, 4, { root: 1 }], [13, 4, { root: 5, type: 7 }]]);
        const { song } = run(newSong(), text);
        expect(song.key).toBe('G');
        expect(song.chords).toHaveLength(4);
        expect(sung(song, melodies(song)[0]).slice(0, 3)).toEqual(['B4', 'B4', 'C5']);
        expect(readSong(JSON.parse(JSON.stringify(song)))).toEqual(song);
    });
});
