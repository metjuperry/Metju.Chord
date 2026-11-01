import { describe, it, expect } from 'vitest';
import {
    ACCIDENTAL_TIPS, COMBOS, MELODY_RULES, PAD_ROLES, PROGRESSIONS, STICK_SOUNDS, chordMood, chordNames, chordNumeral, comboDegree,
    exampleChordClips, fitProgression, insertProgression, keyLabel, progressionClips, progressionNumerals, showcaseDegree, squeeze, stickFor,
} from './learn';
import { KEYS, SCALE_IDS, buildChordMidi, keyPitchClass, nameChord, resolveChord, stickChordType, triadQuality } from './theory';
import { newSong } from './song';
import { TICKS_PER_SIXTEENTH } from './drums';
import { isChordClip } from './progression';

const prog = (id: string) => PROGRESSIONS.find(p => p.id === id)!;

describe('progressions', () => {
    it('has about a dozen, with every field filled in', () => {
        expect(PROGRESSIONS.length).toBe(12);
        expect(new Set(PROGRESSIONS.map(p => p.id)).size).toBe(12);
        for (const p of PROGRESSIONS) {
            for (const f of [p.name, p.feel, p.where, p.why]) expect(f.length).toBeGreaterThan(5);
            expect(p.chords.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('every chord resolves to a valid, named chord in its scale, in every key', () => {
        for (const p of PROGRESSIONS) {
            for (const ch of p.chords) {
                expect(ch.degree).toBeGreaterThanOrEqual(0);
                expect(ch.degree).toBeLessThan(7);
                expect(ch.beats).toBeGreaterThan(0);
                // the type is one the stick can reach on that pad
                expect(stickFor(ch.type, triadQuality(ch.degree, p.scale))).not.toBeNull();
                for (const key of KEYS) {
                    const chord = resolveChord(key, { degree: ch.degree, type: ch.type, inversion: 0, octave: 4, scale: p.scale });
                    expect(chord.name.symbol).not.toContain('?');
                }
            }
        }
    });

    it('every progression fits its own scale exactly, in every key', () => {
        for (const p of PROGRESSIONS) {
            for (const key of KEYS) {
                const fit = fitProgression(p, key, p.scale);
                expect(fit.kind).toBe('fits');
                expect(fit.chords.map(c => c.degree)).toEqual(p.chords.map(c => c.degree));
            }
        }
    });

    it('writes the numerals the way they are usually written', () => {
        const want: { [id: string]: string } = {
            pop: 'I–V–vi–IV',
            doowop: 'I–vi–IV–V',
            sadpop: 'vi–IV–I–V',
            pachelbel: 'I–V–vi–iii–IV–I–IV–V',
            iiVI: 'ii7–V7–Imaj7',
            blues: 'I7 ×4–IV7 ×2–I7 ×2–V7–IV7–I7–V7',
            andalusian: 'i–VII–VI–V',
            epic: 'i–VI–III–VII',
            royal: 'IVmaj7–V7–iii7–vi',
            mixo: 'I–♭VII–IV',
            dreamy: 'i7–iv7–VImaj7–v7',
            calm: 'VI–v–i–IV',
        };
        for (const p of PROGRESSIONS) expect(progressionNumerals(p), p.id).toBe(want[p.id]);
    });

    it('names the chords in the song’s key, with flats in flat keys', () => {
        const names = (id: string, key: typeof KEYS[number], scale: Parameters<typeof fitProgression>[2]) =>
            chordNames(key, scale, fitProgression(prog(id), key, scale).chords);
        expect(names('pop', 'C', 'major')).toEqual(['C', 'G', 'Am', 'F']);
        expect(names('pop', 'F', 'major')).toEqual(['F', 'C', 'Dm', 'B♭']);
        expect(names('iiVI', 'A#', 'major')).toEqual(['Cm7', 'F7', 'B♭maj7']);
        expect(names('andalusian', 'A', 'minor')).toEqual(['Am', 'G', 'F', 'E']);
        expect(names('blues', 'E', 'major').slice(0, 5)).toEqual(['E7', 'E7', 'E7', 'E7', 'A7']);
        expect(names('calm', 'D', 'minor')).toEqual(['B♭', 'Am', 'Dm', 'G']);
    });

    it('puts a minor progression on the relative minor of a major song, and the other way round', () => {
        const epic = fitProgression(prog('epic'), 'C', 'major');
        expect(epic.kind).toBe('relative');
        if (epic.kind === 'needs') return;
        expect(epic.tonic).toBe(9);
        expect(chordNames('C', 'major', epic.chords)).toEqual(['Am', 'F', 'C', 'G']);
        // the Andalusian cadence's major V is a flipped iii in the relative major
        const anda = fitProgression(prog('andalusian'), 'C', 'major');
        expect(anda.kind).toBe('relative');
        expect(chordNames('C', 'major', anda.chords)).toEqual(['Am', 'G', 'F', 'E']);
        const pop = fitProgression(prog('pop'), 'C', 'minor');
        expect(pop.kind).toBe('relative');
        expect(chordNames('C', 'minor', pop.chords)).toEqual(['E♭', 'B♭', 'Cm', 'A♭']);
        const ii = fitProgression(prog('iiVI'), 'A', 'minor');
        expect(chordNames('A', 'minor', ii.chords)).toEqual(['Dm7', 'G7', 'Cmaj7']);
    });

    it('says when a progression needs another scale, and offers the closest in-scale version', () => {
        const mixo = fitProgression(prog('mixo'), 'C', 'major');
        expect(mixo.kind).toBe('needs');
        if (mixo.kind !== 'needs') return;
        expect(mixo.needs).toBe('mixolydian');
        expect(chordNames('C', 'mixolydian', mixo.chords)).toEqual(['C', 'B♭', 'F']);
        // C and F are in C major as they are; B♭ isn't, and the note says what stands in
        const closest = chordNames('C', 'major', mixo.closest);
        expect(closest[0]).toBe('C');
        expect(closest[2]).toBe('F');
        expect(mixo.changes.map(x => x.wanted)).toEqual(['B♭']);
        expect(mixo.changes[0].got).toBe('Dm (ii)'); // shares D and F; only the scale's own chords stand in
        // in C Mixolydian it just fits
        expect(fitProgression(prog('mixo'), 'C', 'mixolydian').kind).toBe('fits');
    });

    it('every fit in every key and scale is made of valid chords of the song’s scale', () => {
        for (const p of PROGRESSIONS) {
            for (const scale of SCALE_IDS) {
                for (const key of ['C', 'F#', 'A#'] as const) {
                    const fit = fitProgression(p, key, scale);
                    const chords = fit.kind === 'needs' ? fit.closest : fit.chords;
                    expect(chords.length).toBe(p.chords.length);
                    for (const ch of chords) expect(resolveChord(key, { ...ch, inversion: 0, octave: 4, scale }).name.symbol).not.toContain('?');
                    if (fit.kind !== 'needs') {
                        // exact: the same notes as the progression in its own scale, on the tonic it names
                        const t = (fit.tonic - keyPitchClass(key) + 12) % 12;
                        fit.chords.forEach((ch, i) => {
                            const got = new Set(buildChordMidi(keyPitchClass(key), ch.degree, ch.type, 4, scale).map(m => m % 12));
                            const want = new Set(buildChordMidi((keyPitchClass(key) + t) % 12, p.chords[i].degree, p.chords[i].type, 4, p.scale).map(m => m % 12));
                            expect([...got].sort()).toEqual([...want].sort());
                        });
                    } else {
                        expect(fit.changes.length).toBeGreaterThan(0);
                        // the closest version only uses the scale's own chords (no flipped 3rds or dom 7s)
                        fit.closest.forEach((ch, i) => {
                            if (fit.chords[i].type !== 'dim' && fit.chords[i].type !== 'aug') expect(['triad', 'diatonic7', 'flip', 'dom7', 'diatonic9', 'six', 'sus4', 'sus2', 'minor']).toContain(ch.type);
                        });
                    }
                }
            }
        }
    });

    it('labels keys like people say them', () => {
        expect(keyLabel(9, 'C', 'major')).toBe('A major');
        expect(keyLabel(0, 'C', 'mixolydian')).toBe('C Mixolydian');
        expect(keyLabel(10, 'F', 'major')).toBe('B♭ major');
        expect(keyLabel(9, 'C', 'major', 'minor')).toBe('A minor');
        expect(keyLabel(3, 'C', 'minor', 'major')).toBe('E♭ major');
    });
});

describe('progression clips and inserting them', () => {
    const pop = prog('pop');

    it('makes one bar per 4-beat chord in 4/4 and in 3/4, and keeps the total in 3/4 for half-bar chords', () => {
        const four = progressionClips(pop.chords, 'C', 'major', { beats: 4, unit: 4 }, 4, false);
        expect(four.map(x => [x.start, x.len])).toEqual([[0, 384], [384, 384], [768, 384], [1152, 384]]);
        const three = progressionClips(pop.chords, 'C', 'major', { beats: 3, unit: 4 }, 4, false);
        expect(three.map(x => x.len)).toEqual([288, 288, 288, 288]);
        const pach = progressionClips(prog('pachelbel').chords, 'C', 'major', { beats: 3, unit: 4 }, 4, false);
        expect(pach.reduce((s, x) => s + x.len, 0)).toBe(4 * 288);
        for (const x of pach) expect(x.len % 96).toBe(0);
        const six = progressionClips(pop.chords, 'C', 'major', { beats: 6, unit: 8 }, 4, false);
        expect(six.map(x => x.len)).toEqual([288, 288, 288, 288]);
    });

    it('voice-leads by default, inside an octave of the pads', () => {
        const led = progressionClips(pop.chords, 'C', 'major', { beats: 4, unit: 4 }, 4);
        expect(led[0].chord).toEqual({ degree: 0, type: 'triad', inversion: 0, octave: 4 });
        for (const x of led) expect(Math.abs(x.chord.octave - 4)).toBeLessThanOrEqual(1);
        expect(led.some(x => x.chord.inversion > 0)).toBe(true);
    });

    it('writes into the chord row at a beat, replacing that stretch and growing the section by whole rows', () => {
        const song = newSong(); // 8 steps of 4/4
        const before = { start: 0, len: 96, chord: { degree: 1, type: 'triad' as const, inversion: 0, octave: 4 } };
        const after = { start: 7 * 96, len: 96, chord: { degree: 2, type: 'triad' as const, inversion: 0, octave: 4 } };
        const s0 = { ...song, chords: [before, after] };
        const clips = progressionClips(pop.chords, 'C', 'major', s0.timeSignature, 4, false);
        const { song: out, replaced } = insertProgression(s0, clips, 96);
        expect(replaced).toBe(1);
        expect(out.key).toBe(s0.key);
        expect(out.scale).toBe(s0.scale);
        expect(out.steps).toBe(24); // 17 steps of chords → three rows of 8
        const chords = out.chords.filter(isChordClip);
        expect(chords[0]).toEqual(before);
        expect(chords.slice(1).map(x => [x.start, x.len, x.chord.degree])).toEqual([[96, 384, 0], [480, 384, 4], [864, 384, 5], [1248, 384, 3]]);
        expect(s0.chords).toEqual([before, after]); // pure
    });
});

describe('chords', () => {
    it('describes every stick direction once', () => {
        expect(STICK_SOUNDS.map(x => x.dir).sort()).toEqual(['C', 'D', 'DL', 'DR', 'L', 'R', 'U', 'UL', 'UR']);
    });

    it('finds a pad to show each direction on, in every scale', () => {
        for (const scale of SCALE_IDS) {
            for (const s of STICK_SOUNDS) {
                for (const on of s.on) {
                    const d = showcaseDegree(on, scale);
                    expect(d, `${scale} ${s.dir} ${on}`).not.toBeNull();
                }
            }
        }
        expect(showcaseDegree('minor', 'major')).toBe(5);
        expect(showcaseDegree('minor', 'minor')).toBe(0);
        expect(showcaseDegree('major', 'minor')).toBe(2);
    });

    it('has a role for every pad, major and minor', () => {
        expect(PAD_ROLES.major.length).toBe(7);
        expect(PAD_ROLES.minor.length).toBe(7);
    });

    it('works the owner’s example: a minor pad + the 9th is Am9 in C major', () => {
        const combo = COMBOS[0];
        const degree = comboDegree(combo.pad, 'major');
        const type = stickChordType(combo.dir, triadQuality(degree, 'major'));
        expect(resolveChord('C', { degree, type, inversion: 0, octave: 4, scale: 'major' }).name.symbol).toBe('Am9');
        expect(combo.result).toContain('bittersweet');
    });

    it('gives a mood word for every chord type a pad can play', () => {
        for (const scale of SCALE_IDS) {
            for (let d = 0; d < 7; d++) {
                const q = triadQuality(d, scale);
                for (const s of STICK_SOUNDS) expect(chordMood(stickChordType(s.dir, q), q).length).toBeGreaterThan(2);
            }
        }
        expect(chordMood('diatonic9', 'minor')).toBe('bittersweet');
        expect(chordMood('dom7', 'major')).toBe('tension');
    });
});

describe('melody rules', () => {
    const all = [...MELODY_RULES, ...ACCIDENTAL_TIPS];
    const rule = (id: string) => all.find(r => r.id === id)!;
    /** Pitch classes (relative to C) of the chord under 1/16 `at` in C major. */
    const chordUnder = (ex: typeof MELODY_RULES[number]['example'], at16: number) => {
        const tick = at16 * TICKS_PER_SIXTEENTH;
        const ch = exampleChordClips(ex).find(x => tick >= x.start && tick < x.start + x.len)!;
        return new Set(buildChordMidi(0, ch.degree, ch.type, 4, 'major').map(m => m % 12));
    };
    const pcOf = (step: number, acc = 0) => ([0, 2, 4, 5, 7, 9, 11][step % 7] + acc + 12) % 12;

    it('has eight rules, each with a short invented example, monophonic and inside its bars and the 2-octave grid', () => {
        expect(MELODY_RULES.length).toBe(8);
        for (const r of all) {
            expect(r.tryThis.length).toBeGreaterThan(5);
            const { notes, bars } = r.example;
            expect(bars).toBeLessThanOrEqual(2);
            const end = bars * 16 * TICKS_PER_SIXTEENTH;
            expect(exampleChordClips(r.example).reduce((s, x) => s + x.len, 0), r.id).toBe(end);
            notes.forEach((x, i) => {
                expect(x.step).toBeGreaterThanOrEqual(0);
                expect(x.step).toBeLessThan(15);
                expect(x.start + x.len).toBeLessThanOrEqual(end);
                if (i > 0) expect(x.start).toBeGreaterThanOrEqual(notes[i - 1].start + notes[i - 1].len);
            });
        }
    });

    it('chord tones on strong beats: the example lands on chord tones on beats 1 and 3', () => {
        const ex = rule('chord-tones').example;
        const strong = ex.notes.filter(x => (x.start / TICKS_PER_SIXTEENTH) % 8 === 0);
        expect(strong.length).toBe(4);
        for (const x of strong) expect(chordUnder(ex, x.start / TICKS_PER_SIXTEENTH).has(pcOf(x.step))).toBe(true);
    });

    it('after a leap, the example steps back the other way', () => {
        const ns = rule('steps').example.notes;
        let leaps = 0;
        for (let i = 1; i < ns.length - 1; i++) {
            const jump = ns[i].step - ns[i - 1].step;
            if (Math.abs(jump) < 3) continue;
            leaps++;
            const back = ns[i + 1].step - ns[i].step;
            expect(Math.sign(back)).toBe(-Math.sign(jump));
            expect(Math.abs(back)).toBe(1);
        }
        expect(leaps).toBeGreaterThan(0);
    });

    it('the endings example ends on the root over I; the question ends elsewhere and the answer on the root', () => {
        const end = rule('endings').example;
        expect(end.notes[end.notes.length - 1].step % 7).toBe(0);
        const qa = rule('qa').example.notes;
        const firstHalf = qa.filter(x => x.start < 16 * TICKS_PER_SIXTEENTH);
        expect(firstHalf[firstHalf.length - 1].step % 7).not.toBe(0);
        expect(qa[qa.length - 1].step % 7).toBe(0);
    });

    it('the high-point example has exactly one highest note', () => {
        const ns = rule('peak').example.notes;
        const top = Math.max(...ns.map(x => x.step));
        expect(ns.filter(x => x.step === top).length).toBe(1);
    });

    it('the space example is at least half rests', () => {
        const ex = rule('space').example;
        const sounding = ex.notes.reduce((s, x) => s + x.len, 0);
        expect(sounding).toBeLessThanOrEqual(ex.bars * 16 * TICKS_PER_SIXTEENTH / 2);
    });

    it('the accidental examples use exactly one ♭ or ♯ each, and it is a chord tone of a minor iv where it says so', () => {
        for (const r of ACCIDENTAL_TIPS) expect(r.example.notes.filter(x => x.acc).length).toBe(1);
        const ex = rule('borrowed').example;
        const flat = ex.notes.find(x => x.acc)!;
        expect(chordUnder(ex, flat.start / TICKS_PER_SIXTEENTH).has(pcOf(flat.step, flat.acc))).toBe(true);
    });
});

describe('helpers', () => {
    it('squeezes runs', () => {
        expect(squeeze(['a', 'a', 'b', 'a']).map(x => [x.item, x.count])).toEqual([['a', 2], ['b', 1], ['a', 1]]);
    });

    it('numbers chords against major or natural minor', () => {
        expect(chordNumeral('minor', { degree: 4, type: 'flip' })).toBe('V');
        expect(chordNumeral('minor', { degree: 1, type: 'triad' })).toBe('ii°');
        expect(chordNumeral('mixolydian', { degree: 6, type: 'triad' })).toBe('♭VII');
        expect(chordNumeral('major', { degree: 6, type: 'diatonic7' })).toBe('viiø7');
        expect(nameChord([60, 64, 67], 0).symbol).toBe('C');
    });
});
