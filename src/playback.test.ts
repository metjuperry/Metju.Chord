import { describe, expect, it, vi } from 'vitest';

// eventsIn is pure, but its module imports Tone (and the engine) for the player
vi.mock('tone', () => ({}));
vi.mock('./audio/engine', () => ({}));

import { SeqEvent, SeqSlot, eventsIn } from './audio/sequencer';
import { chainEvents, chainTimeline, sectionEvents, sectionEventsOf } from './playback';
import { addSection, appendToChain, applySectionEdit, chainLayout, sectionView } from './sections';
import { FullSong, fromSingleSection, newSong } from './song';

const S = 96;

/** Two sections in the chain, A and B, each with chords, a melody and drums. */
function twoSections(): FullSong {
    let song = fromSingleSection({ ...newSong(), steps: 16 });
    const b = addSection(song);
    song = appendToChain(b.song, b.id);
    for (const id of ['s1', b.id]) {
        const view = sectionView(song, id);
        song = applySectionEdit(song, id, {
            ...view,
            steps: 16,
            chords: [0, 1, 2, 3].map(i => ({ start: i * 4 * S, len: 4 * S, chord: { degree: i, type: 'triad' as const, inversion: 0, octave: 4 } })),
            parts: view.parts.map(p => (p.kind === 'melody' ? { ...p, notes: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ start: i * 2 * S, len: S, step: i })) } : p)),
        });
    }
    return song;
}

/** The same events as `eventsIn`, by looking at every one. */
const scan = <T,>(events: SeqEvent<T>[], lo: number, hi: number) =>
    events.filter(e => e.tick >= lo && e.tick < hi).sort((a, b) => a.tick - b.tick);

describe('finding a window’s events', () => {
    it('finds what a scan of every event finds, in tick order, for plain lists and slots', () => {
        let seed = 7;
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let round = 0; round < 20; round++) {
            // slots of random lengths, each with random events inside it (some on the same tick)
            const slots: SeqSlot<number>[] = [];
            let start = 0;
            for (let i = 0; i < 1 + Math.floor(rand() * 6); i++) {
                const len = 24 + Math.floor(rand() * 400);
                const events = Array.from({ length: Math.floor(rand() * 40) }, () => ({ tick: Math.floor(rand() * len), duration: 1, data: 0 }))
                    .sort((a, b) => a.tick - b.tick);
                slots.push({ start, events });
                start += len;
            }
            const flat = slots.flatMap(s => s.events.map(e => ({ ...e, tick: e.tick + s.start })));
            const shuffled = [...flat].sort(() => rand() - 0.5);
            for (let lo = 0; lo < start + 30; lo += 24) {
                const want = scan(flat, lo, lo + 24).map(e => e.tick);
                const got = (events: Parameters<typeof eventsIn<number>>[0]) => {
                    const out: number[] = [];
                    eventsIn(events, lo, lo + 24, e => out.push(e.tick));
                    return out;
                };
                expect(got({ slots })).toEqual(want);
                expect(got(shuffled)).toEqual(want);
            }
        }
    });
});

describe('cached section events', () => {
    it('an edit to section B leaves section A’s events as they were, and rebuilds B’s', () => {
        const song = twoSections();
        const [a, b] = song.sections;
        const aEvents = sectionEventsOf(song, a, 16 * S, true);
        const bEvents = sectionEventsOf(song, b, 16 * S, true);
        // a melody note moved in B
        const view = sectionView(song, b.id);
        const edited = applySectionEdit(song, b.id, {
            ...view,
            parts: view.parts.map(p => (p.kind === 'melody' ? { ...p, notes: [{ start: S, len: S, step: 4 }] } : p)),
        });
        expect(edited.sections[0]).toBe(a);
        expect(edited.parts).toBe(song.parts);
        expect(sectionEventsOf(edited, edited.sections[0], 16 * S, true)).toBe(aEvents);
        const bAfter = sectionEventsOf(edited, edited.sections[1], 16 * S, true);
        expect(bAfter).not.toBe(bEvents);
        expect(bAfter.filter(e => e.data.midi && e.data.legato === 0.95).map(e => e.tick)).toEqual([S]);
        // the chain built after the edit reuses A's list as it is
        expect(chainTimeline(edited).slots[0].events).toBe(aEvents);
    });

    it('is built again when what every section shares changes', () => {
        const song = twoSections();
        const a = song.sections[0];
        const before = sectionEventsOf(song, a, 16 * S, true);
        expect(sectionEventsOf(song, a, 16 * S, true)).toBe(before);
        expect(sectionEventsOf({ ...song, key: 'D' }, a, 16 * S, true)).not.toBe(before);
        expect(sectionEventsOf({ ...song, parts: [...song.parts] }, a, 16 * S, true)).not.toBe(before);
        // another length is another list
        expect(sectionEventsOf(song, a, 8 * S, true)).not.toBe(sectionEventsOf(song, a, 16 * S, true));
    });

    it('holds the same events as sectionEvents, in tick order', () => {
        const song = twoSections();
        const a = song.sections[0];
        const plain = sectionEvents(sectionView(song, a.id), a, 16 * S, 0, true);
        const cached = sectionEventsOf(song, a, 16 * S, true);
        expect(cached.length).toBe(plain.length);
        expect(cached.every((e, i) => i === 0 || cached[i - 1].tick <= e.tick)).toBe(true);
        const key = (e: { tick: number; data: object }) => `${e.tick}:${JSON.stringify(e.data)}`;
        expect(cached.map(key).sort()).toEqual(plain.map(key).sort());
    });

    it('the chain as one list and as slots play the same', () => {
        const song = twoSections();
        const layout = chainLayout(song);
        const { slots, length } = chainTimeline(song, layout);
        const flat = chainEvents(song, layout);
        expect(flat.length).toBe(length);
        for (let lo = 0; lo < length; lo += 24) {
            const fromSlots: number[] = [];
            eventsIn({ slots }, lo, lo + 24, e => fromSlots.push(e.tick));
            expect(fromSlots).toEqual(scan(flat.events, lo, lo + 24).map(e => e.tick));
        }
    });
});
