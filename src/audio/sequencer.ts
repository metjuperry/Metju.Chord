import * as Tone from 'tone';
import { getEngine } from './engine';
import { PPQ } from '../progression';

/** Something to play at `tick` for `duration` ticks. */
export interface SeqEvent<T = unknown> {
    tick: number;
    duration: number;
    data: T;
}

export interface SeqOptions {
    /** Loop between 0 and `loopEnd` ticks; otherwise stop after `end`. */
    loop: boolean;
    loopEnd: number;
    end: number;
}

export type SeqSource<T> = () => { events: SeqEvent<T>[]; opts: SeqOptions };

/** How much song time each scheduler pass covers: a 1/16 note. */
const WINDOW = PPQ / 4;

const ratio = () => Tone.getTransport().PPQ / PPQ;
/** Our ticks (PPQ 96) as a Tone time string in the Transport's own ticks. */
const toneTicks = (ticks: number) => `${Math.round(ticks * ratio())}i`;
export const ticksToSeconds = (ticks: number) => Tone.Time(toneTicks(ticks)).toSeconds();

/**
 * Lookahead scheduler on the shared Transport. Every 1/16 note (Tone calls back ahead of time,
 * with the exact audio time of that 1/16), it asks `source` for the current events and schedules
 * those that start inside the next 1/16, each at its exact time. Because it reads the events
 * fresh on every pass, edits made while playing are heard as soon as playback reaches them.
 * Events can sit anywhere in tick time, not only on grid steps.
 */
export class SequencerPlayer<T> {
    private repeatId: number | null = null;
    /** Song position (ticks, wrapped at the loop) at the start of the next window to schedule. */
    private cursor = 0;
    /** Recent windows as [Transport tick, song tick] pairs, for drawing the playhead. */
    private marks: [number, number][] = [];
    private wrapAt = Infinity;

    constructor(
        private readonly source: SeqSource<T>,
        private readonly onEvent: (event: SeqEvent<T>, time: number) => void,
        private readonly onEnd: () => void,
    ) {}

    get playing() {
        return this.repeatId !== null;
    }

    start(fromTick: number) {
        if (this.repeatId !== null) return;
        const engine = getEngine();
        const startAt = engine.quantizedStart('4n');
        engine.acquireTransport('sequencer');
        const startToneTick = typeof startAt === 'string' ? parseInt(startAt, 10) : Tone.getTransport().ticks;
        this.cursor = fromTick;
        this.marks = [[startToneTick, fromTick]];
        this.repeatId = Tone.getTransport().scheduleRepeat(time => this.pass(time), toneTicks(WINDOW), `${startToneTick}i`);
    }

    stop() {
        if (this.repeatId === null) return;
        Tone.getTransport().clear(this.repeatId);
        this.repeatId = null;
        this.marks = [];
        getEngine().releaseTransport('sequencer');
    }

    /** Where playback is now, in ticks, or null when stopped. */
    position(): number | null {
        if (this.repeatId === null) return null;
        const now = Tone.getTransport().ticks;
        let mark = this.marks[0];
        for (const m of this.marks) if (m[0] <= now) mark = m;
        const pos = mark[1] + Math.max(0, now - mark[0]) / ratio();
        return pos >= this.wrapAt ? pos - this.wrapAt : pos;
    }

    private pass(time: number) {
        const { events, opts } = this.source();
        let from = this.cursor;
        this.wrapAt = opts.loop ? opts.loopEnd : Infinity;

        if (opts.loop) {
            if (opts.loopEnd <= 0) return;
            if (from >= opts.loopEnd) from = 0; // the loop got shorter than where we were
        } else if (from >= opts.end) {
            Tone.getDraw().schedule(this.onEnd, time);
            return;
        }

        const toneTick = Math.round(Tone.getTransport().getTicksAtTime(time));
        this.marks.push([toneTick, from]);
        if (this.marks.length > 64) this.marks.splice(0, this.marks.length - 64);

        const to = from + WINDOW;
        const fire = (lo: number, hi: number, offset: number) => {
            for (const e of events) {
                if (e.tick >= lo && e.tick < hi) this.onEvent(e, time + ticksToSeconds(e.tick - lo + offset));
            }
        };
        if (opts.loop && to > opts.loopEnd) {
            // This window runs over the loop end: finish the pass, then continue from the top
            fire(from, opts.loopEnd, 0);
            fire(0, to - opts.loopEnd, opts.loopEnd - from);
            this.cursor = to - opts.loopEnd;
        } else {
            fire(from, to, 0);
            this.cursor = to;
        }
    }
}
