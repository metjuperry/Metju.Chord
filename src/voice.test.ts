import { describe, expect, it } from 'vitest';
import { Harmony, Part, VoicePart, VowelClip, hasNotes, newPart, noteWriter, partNotes, restSpans, vowelAt, vowelClipsFromSteps, vowelPerChord, vowelSteps, writesNotes } from './parts';
import { sectionEvents } from './playback';
import { Clip, TICKS_PER_STEP as S } from './progression';
import { fromSingleSection, readFullSong, readSong } from './song';
import { applySectionEdit, engineStrips, sectionView } from './sections';
import { FORMANTS, SINGERS, VOWEL_TRIM } from './audio/voiceData';

const chord = (start: number, len: number, degree: number): Clip => ({
    start: start * S, len: len * S, chord: { degree, type: 'triad', inversion: 0, octave: 4 },
});
const song: Harmony = { key: 'C', scale: 'major', chords: [chord(0, 4, 0), chord(4, 4, 5)] };
const named = (m: number) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12] + (Math.floor(m / 12) - 1);
const groove = { beatTicks: S };

const voice = (patch: Partial<VoicePart> = {}, others: Part[] = []): VoicePart => ({ ...(newPart('voice', others) as VoicePart), ...patch });

describe('a Voice part', () => {
    it('starts as a low choir on "ooh", singing the chords with some reverb', () => {
        expect(voice()).toMatchObject({ kind: 'voice', name: 'Voice', instrument: 'voice', singers: 'choir', range: 'low', vowel: 'u', sings: 'chords', octave: 3, notes: [] });
        expect(voice().fx.reverb).toBeGreaterThan(0);
    });

    it('sings the chord row moved into its range', () => {
        const notes = partNotes(voice(), song, groove);
        expect(notes.map(n => [n.start / S, n.len / S])).toEqual([[0, 4], [4, 4]]);
        expect(notes[0].midi.map(named)).toEqual(['C3', 'E3', 'G3']);
        expect(partNotes(voice({ octave: 4 }), song, groove)[1].midi.map(named)).toEqual(['A4', 'C5', 'E5']);
    });

    it('sings its own notes when set to, from its octave', () => {
        const v = voice({ sings: 'notes', octave: 4, notes: [{ start: 0, len: S, step: 0 }, { start: S, len: S, step: 2, acc: 1 }] });
        expect(partNotes(v, song, groove).map(n => named(n.midi[0]))).toEqual(['C4', 'F4']);
        // its notes are kept while it sings the chords, ready for when it goes back
        expect(partNotes({ ...v, sings: 'chords' }, song, groove)).toHaveLength(2);
    });

    it('stops at rests singing the chords, and sings on through them singing notes', () => {
        const h: Harmony = { ...song, chords: [chord(0, 4, 0), { start: 4 * S, len: 4 * S, rest: true }] };
        expect(restSpans(h.chords, voice())).toEqual([[4 * S, 8 * S]]);
        expect(restSpans(h.chords, voice({ sings: 'notes' }))).toEqual([]);
    });

    it('is written and played from the keys like a melody only while it sings notes', () => {
        expect(hasNotes(voice())).toBe(true);
        expect(writesNotes(voice())).toBe(false);
        expect(noteWriter(voice())).toBeNull();
        expect(noteWriter(voice({ sings: 'notes' }))?.kind).toBe('voice');
    });
});

describe('a Voice part in a song', () => {
    const withVoice = () => {
        const one = fromSingleSection(readSong({ chords: [], parts: [{ kind: 'chords' }] })!);
        return { ...one, parts: [...one.parts, voice({ sings: 'notes' }, one.parts)] };
    };

    it('keeps its notes per section, like a melody', () => {
        const full = withVoice();
        const view = sectionView(full, 's1');
        const id = view.parts[1].id;
        const next = applySectionEdit(full, 's1', { ...view, parts: view.parts.map(p => (p.id === id ? { ...p, notes: [{ start: 0, len: S, step: 3 }] } as Part : p)) });
        expect(next.sections[0].content[id]).toEqual({ notes: [{ start: 0, len: S, step: 3 }] });
        expect((next.parts[1] as VoicePart).notes).toEqual([]);
        expect((sectionView(next, 's1').parts[1] as VoicePart).notes).toHaveLength(1);
    });

    it('can sing another vowel in one section, through its own strip', () => {
        const full = withVoice();
        const view = sectionView(full, 's1');
        const id = view.parts[1].id;
        const next = applySectionEdit(full, 's1', { ...view, parts: view.parts.map(p => (p.id === id ? { ...p, vowel: 'a' } as Part : p)) });
        expect(next.sections[0].sound).toEqual({ [id]: { vowel: 'a' } });
        expect(engineStrips(next).find(x => x.id === `${id}@s1`)?.part).toMatchObject({ vowel: 'a' });
    });

    it('survives a save and repairs junk', () => {
        const full = withVoice();
        const raw = JSON.parse(JSON.stringify({ ...full, parts: full.parts.map(p => (p.kind === 'voice' ? { ...p, vowel: 'y', singers: 'band', range: 'mid', vibrato: 7, breath: -1, sings: 'lyrics', octave: 9, instrument: 'piano' } : p)) }));
        const back = readFullSong(raw)!;
        expect(back.parts[1]).toMatchObject({ kind: 'voice', instrument: 'voice', vowel: 'u', singers: 'choir', range: 'low', vibrato: 1, breath: 0, sings: 'chords', octave: 5 });
        expect(readFullSong(JSON.parse(JSON.stringify(full)))!.parts[1]).toEqual(full.parts[1]);
    });
});

describe('voice data', () => {
    it('has four formants for every vowel of both ranges, low to high, inside the hearing range', () => {
        for (const range of ['low', 'high'] as const) {
            for (const v of ['a', 'e', 'i', 'o', 'u'] as const) {
                const f = FORMANTS[range][v];
                expect(f).toHaveLength(4);
                f.forEach(([hz, bw], i) => {
                    expect(hz).toBeGreaterThan(200);
                    expect(hz).toBeLessThan(5000);
                    expect(bw).toBeGreaterThan(0);
                    if (i) expect(hz).toBeGreaterThan(f[i - 1][0]);
                });
                expect(Math.abs(VOWEL_TRIM[range][v])).toBeLessThan(20);
            }
        }
    });

    it('has five singers per range, each a wave of positive harmonics', () => {
        for (const range of ['low', 'high'] as const) {
            expect(SINGERS[range]).toHaveLength(5);
            SINGERS[range].forEach(s => expect(s.every(a => a > 0 && Number.isFinite(a))).toBe(true));
        }
    });
});

describe('the vowel lane', () => {
    const Sx = S;

    it('paints beats into stretches, and back', () => {
        const clips = vowelClipsFromSteps(['a', 'a', null, 'o', 'o', 'o', 'a'], Sx);
        expect(clips).toEqual([{ start: 0, len: 2 * Sx, vowel: 'a' }, { start: 3 * Sx, len: 3 * Sx, vowel: 'o' }, { start: 6 * Sx, len: Sx, vowel: 'a' }]);
        expect(vowelSteps(clips, 8, Sx)).toEqual(['a', 'a', null, 'o', 'o', 'o', 'a', null]);
    });

    it('sings the lane where it says, and the part\'s own vowel elsewhere', () => {
        const v = voice({ vowel: 'u', vowels: [{ start: 4 * Sx, len: 4 * Sx, vowel: 'a' }] });
        expect(vowelAt(v, 0)).toBe('u');
        expect(vowelAt(v, 5 * Sx)).toBe('a');
        expect(vowelAt(v, 8 * Sx)).toBe('u');
    });

    it('gives each chord a vowel, leaving rests be', () => {
        expect(vowelPerChord([chord(0, 4, 0), { start: 4 * Sx, len: 2 * Sx, rest: true }, chord(6, 2, 4), chord(8, 4, 5)]))
            .toEqual([{ start: 0, len: 4 * Sx, vowel: 'a' }, { start: 6 * Sx, len: 2 * Sx, vowel: 'o' }, { start: 8 * Sx, len: 4 * Sx, vowel: 'u' }]);
    });

    it('is played: notes start on their vowel, and the lane changes vowel between them', () => {
        const one = fromSingleSection(readSong({ chords: [chord(0, 8, 0)], steps: 16, parts: [{ kind: 'chords' }] })!);
        const id = 'v';
        const full = { ...one, parts: [...one.parts, { ...voice({ vowel: 'u', vowelGlide: 0 }, one.parts), id }] };
        const view = sectionView(full, 's1');
        const lane: VowelClip[] = [{ start: 2 * Sx, len: 2 * Sx, vowel: 'a' }, { start: 4 * Sx, len: 2 * Sx, vowel: 'i' }];
        const next = applySectionEdit(full, 's1', { ...view, parts: view.parts.map(p => (p.id === id ? { ...p, vowels: lane } as Part : p)) });
        expect(next.sections[0].content[id]).toEqual({ vowels: lane });
        const events = sectionEvents(sectionView(next, 's1'), next.sections[0], 16 * Sx).filter(e => e.data.part === id);
        const changes = events.filter(e => !e.data.midi).map(e => [e.tick / Sx, (e.data as { vowel?: string }).vowel]);
        expect(changes).toEqual([[2, 'a'], [4, 'i'], [6, 'u']]);
        // the chord at 0 starts on the part's own vowel
        expect((events.find(e => e.data.midi)?.data as { vowel?: string } | undefined)?.vowel).toBe('u');
    });

    it('is kept in saves, and junk in it is dropped', () => {
        const one = fromSingleSection(readSong({ chords: [], parts: [{ kind: 'chords' }] })!);
        const full = { ...one, parts: [...one.parts, voice({}, one.parts)] };
        const id = full.parts[1].id;
        const raw = JSON.parse(JSON.stringify(full));
        raw.sections[0].content[id] = { vowels: [{ start: 0, len: Sx, vowel: 'a' }, { start: 0, len: Sx, vowel: 'o' }, { start: Sx, len: Sx, vowel: 'y' }, { start: -1, len: 2, vowel: 'e' }, 'x'] };
        raw.parts[1].vowelGlide = 5;
        const back = readFullSong(raw)!;
        expect(back.sections[0].content[id]).toEqual({ vowels: [{ start: 0, len: Sx, vowel: 'a' }] });
        expect((back.parts[1] as VoicePart).vowelGlide).toBe(1);
    });
});

describe('the vowel lane in a section', () => {
    it('takes every edit, not just the first', () => {
        const one = fromSingleSection(readSong({ chords: [], parts: [{ kind: 'chords' }] })!);
        let full = { ...one, parts: [...one.parts, voice({}, one.parts)] };
        const id = full.parts[1].id;
        for (const lane of [[{ start: 0, len: S, vowel: 'a' }], [{ start: 0, len: S, vowel: 'a' }, { start: 2 * S, len: S, vowel: 'o' }]] as VowelClip[][]) {
            const view = sectionView(full, 's1');
            full = applySectionEdit(full, 's1', { ...view, parts: view.parts.map(p => (p.id === id ? { ...p, vowels: lane } as Part : p)) });
            expect(full.sections[0].content[id]).toEqual({ vowels: lane });
        }
    });
});
