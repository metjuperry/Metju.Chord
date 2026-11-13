import { beforeEach, describe, expect, it, vi } from 'vitest';

// A Transport that only remembers the repeating callback, so a test can run scheduler passes by hand.
const fake = vi.hoisted(() => ({ pass: null as ((time: number) => void) | null, ticks: 0, ticksAt: null as ((time: number) => number) | null }));
vi.mock('tone', () => ({
    getTransport: () => ({
        PPQ: 96,
        get ticks() { return fake.ticks; },
        scheduleRepeat: (cb: (time: number) => void) => { fake.pass = cb; return 1; },
        clear: () => { fake.pass = null; },
        getTicksAtTime: (time: number) => (fake.ticksAt ? fake.ticksAt(time) : fake.ticks),
    }),
    getDraw: () => ({ schedule: (cb: () => void) => cb() }),
    Time: (v: string) => ({ toSeconds: () => parseInt(v, 10) / 192 }),
}));
vi.mock('./audio/engine', () => ({
    getEngine: () => ({ quantizedStart: () => 0, acquireTransport: () => undefined, releaseTransport: () => undefined }),
}));

import { SeqEvent, SeqOptions, SequencerPlayer } from './audio/sequencer';

const WINDOW = 24;
const BAR = 384;
/** One event per beat, named after its section and beat. */
const beats = (name: string, bars: number): SeqEvent<string>[] =>
    Array.from({ length: bars * 4 }, (_, i) => ({ tick: i * 96, duration: 96, data: `${name}${i}` }));

/** A player looping `first`; `run(n)` runs n passes and returns what played. */
function setup(first: { events: SeqEvent<string>[]; opts: SeqOptions }) {
    const state = { now: first };
    const played: string[] = [];
    const player = new SequencerPlayer<string>(() => state.now, e => played.push(e.data), () => played.push('END'));
    player.start(0);
    const run = (passes: number) => {
        for (let i = 0; i < passes; i++) {
            fake.pass?.(0);
            fake.ticks += WINDOW;
        }
        return played.splice(0);
    };
    return { player, state, run };
}
const looping = (name: string, bars: number) => ({ events: beats(name, bars), opts: { loop: true, loopEnd: bars * BAR, end: bars * BAR } });

describe('SequencerPlayer', () => {
    beforeEach(() => {
        fake.pass = null;
        fake.ticks = 0;
        fake.ticksAt = null;
    });

    it('loops: after the last beat comes the first again', () => {
        const { run } = setup(looping('a', 1));
        expect(run(32)).toEqual(['a0', 'a1', 'a2', 'a3', 'a0', 'a1', 'a2', 'a3']);
    });

    it('stops at the end when not looping', () => {
        const { run } = setup({ events: beats('a', 1), opts: { loop: false, loopEnd: BAR, end: BAR } });
        expect(run(18)).toEqual(['a0', 'a1', 'a2', 'a3', 'END', 'END']);
    });

    it('a jump queued for the end of a one-bar loop lands there', () => {
        const { player, state, run } = setup(looping('a', 1));
        expect(run(6)).toEqual(['a0', 'a1']);
        // "switch section at the next bar line": that line is the loop end
        player.queueJump(BAR, 0, () => { state.now = looping('b', 1); });
        expect(run(26)).toEqual(['a2', 'a3', 'b0', 'b1', 'b2', 'b3']);
        expect(player.jumpPending).toBe(false);
    });

    it('a jump queued in the last bar of a longer loop lands at its end', () => {
        const { player, state, run } = setup(looping('a', 2));
        run(20); // into bar 2
        player.queueJump(2 * BAR, 0, () => { state.now = looping('b', 1); });
        expect(run(16)).toEqual(['a5', 'a6', 'a7', 'b0']);
    });

    it('a jump past the loop end counts as the loop end', () => {
        const { player, state, run } = setup(looping('a', 1));
        player.queueJump(5 * BAR, 0, () => { state.now = looping('b', 1); });
        expect(run(20)).toEqual(['a0', 'a1', 'a2', 'a3', 'b0']);
    });

    it('a jump at a bar line inside the loop lands on it', () => {
        const { player, state, run } = setup(looping('a', 2));
        run(2);
        player.queueJump(BAR, 0, () => { state.now = looping('b', 1); });
        expect(run(18)).toEqual(['a1', 'a2', 'a3', 'b0']);
    });

    it('a jump to a later place carries on from there', () => {
        const { player, run } = setup(looping('a', 4));
        run(2);
        player.queueJump(player.cursorTick, 2 * BAR);
        expect(run(8)).toEqual(['a8', 'a9']);
    });

    it('live recording: the position at the audio time a live note sounds is the tick heard then', () => {
        // a Transport running since audio time 0 at 192 ticks a second (Time() above is 192 ticks/s);
        // Tone calls each pass `LOOK` seconds before its time, so the Transport's own `ticks` are ahead
        const LOOK = 0.1;
        fake.ticksAt = t => t * 192;
        const state = { now: looping('a', 1) };
        const heard: { tick: number; time: number }[] = [];
        const player = new SequencerPlayer<string>(() => state.now, (e, time) => heard.push({ tick: e.tick, time }), () => undefined);
        player.start(0);
        for (let k = 0; k < 40; k++) {
            const time = (k * WINDOW) / 192;
            fake.ticks = (time - LOOK) * 192 + WINDOW; // the next window is due
            fake.pass?.(time);
            if (k === 20) player.queueJump(player.cursorTick, 2 * 96); // a jump, like a section switch
        }
        // every beat heard in the last 40 windows (past a loop wrap and the jump): a pad pressed on it records it
        const recent = heard.filter(h => h.time >= (40 - 60) * WINDOW / 192);
        expect(recent.length).toBeGreaterThan(8);
        for (const h of recent) expect(player.position(h.time)).toBeCloseTo(h.tick, 6);
        // and halfway through a beat, half a beat on
        const mid = recent[recent.length - 2];
        expect(player.position(mid.time + 0.25)).toBeCloseTo(mid.tick + 48, 6);
    });
});

