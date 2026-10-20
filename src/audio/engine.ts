import * as Tone from 'tone';
import { ArpPattern, arpOrder } from '../theory';
import { Instrument, InstrumentId, createInstrument } from './instruments';

export type FxName = 'reverb' | 'delay' | 'chorus' | 'distortion';

export interface FxState {
    reverb: { enabled: boolean; wet: number; decay: number };
    delay: { enabled: boolean; wet: number; time: string; feedback: number };
    chorus: { enabled: boolean; wet: number; depth: number; frequency: number };
    distortion: { enabled: boolean; amount: number };
}

export type ArpRate = '4n' | '8n' | '8t' | '16n' | '16t' | '32n';

export interface ArpOptions {
    pattern: ArpPattern;
    rate: ArpRate;
    /** Gate length of each arp note, in seconds. */
    noteLength: number;
}

const velocityFor = (voices: number) => 1 / Math.sqrt(Math.max(1, voices));

/**
 * Owns every audio node. Signal path:
 *   instrument -> fxIn -> distortion -> chorus -> delay -> reverb -> fxOut -> master -> limiter -> destination
 * The effects chain is created once and never rewired; "disabled" just means wet = 0.
 */
export class Engine {
    readonly master = new Tone.Gain(0.8);
    readonly limiter = new Tone.Limiter(-1);
    readonly meter = new Tone.Meter();
    readonly fxIn = new Tone.Gain(1);
    readonly fxOut = new Tone.Gain(1);

    private distortion = new Tone.Distortion(0.4);
    private chorus = new Tone.Chorus(4, 2.5, 0.5);
    private delay = new Tone.FeedbackDelay('8n', 0.3);
    private reverb = new Tone.Reverb(1.5);

    private fxState: FxState = {
        reverb: { enabled: false, wet: 0.3, decay: 1.5 },
        delay: { enabled: false, wet: 0.3, time: '8n', feedback: 0.3 },
        chorus: { enabled: false, wet: 0.5, depth: 0.5, frequency: 4 },
        distortion: { enabled: false, amount: 0.4 },
    };

    /** Every instrument used so far stays connected, so recorded chords can play on theirs while you play on another. */
    private voices = new Map<InstrumentId, Instrument>();
    private current: InstrumentId = 'epiano';
    private transportUsers = new Set<string>();

    constructor() {
        this.fxIn.chain(this.distortion, this.chorus, this.delay, this.reverb, this.fxOut, this.master, this.limiter, Tone.getDestination());
        this.limiter.connect(this.meter);
        this.chorus.start();
        this.applyFx('reverb');
        this.applyFx('delay');
        this.applyFx('chorus');
        this.applyFx('distortion');
    }

    /** Resolves once the reverb impulse response is rendered. */
    ready(): Promise<void> {
        return this.reverb.ready;
    }

    // ---- instruments -------------------------------------------------------

    /** The instrument the pads and keyboard play. */
    setInstrument(id: InstrumentId) {
        this.current = id;
        this.voice(id);
    }

    private voice(id: InstrumentId = this.current): Instrument {
        let v = this.voices.get(id);
        if (!v) {
            v = createInstrument(id);
            v.output.connect(this.fxIn);
            this.voices.set(id, v);
        }
        return v;
    }

    // ---- playing -----------------------------------------------------------

    /** Play a chord for `duration` (seconds or Tone time) at an audio-clock `time`, on `instrument` (default: the live one). */
    playChord(midi: number[], opts: { duration: Tone.Unit.Time; time?: number; instrument?: InstrumentId }) {
        this.voice(opts.instrument).synth.triggerAttackRelease(
            this.toFreqs(midi), opts.duration, opts.time ?? Tone.now(), velocityFor(midi.length));
    }

    /** Start a chord on the live instrument; returns how to release it (on that same instrument, even if the live one changes). */
    attack(midi: number[], time?: number): () => void {
        const synth = this.voice().synth;
        const freqs = this.toFreqs(midi);
        synth.triggerAttack(freqs, time ?? Tone.now(), velocityFor(midi.length));
        return () => synth.triggerRelease(freqs, Tone.now());
    }

    releaseAll() {
        this.voices.forEach(v => v.synth.releaseAll());
    }

    private toFreqs(midi: number[]): number[] {
        return midi.map(m => Tone.Frequency(m, 'midi').toFrequency());
    }

    // ---- transport ---------------------------------------------------------

    /** One shared bpm for the metronome, arpeggiator, sequencer and tempo-synced delay. */
    setBpm(bpm: number) {
        Tone.getTransport().bpm.value = bpm;
        this.applyFx('delay');
    }

    /** The Transport runs while anyone holds it; the last one to let go stops it. */
    acquireTransport(owner: string) {
        this.transportUsers.add(owner);
        if (Tone.getTransport().state !== 'started') {
            Tone.getTransport().start();
        }
    }

    releaseTransport(owner: string) {
        this.transportUsers.delete(owner);
        if (this.transportUsers.size === 0) {
            Tone.getTransport().stop();
        }
    }

    /**
     * Where a new Loop/Sequence should start so it lands on the shared grid: 0 when the
     * Transport is idle, otherwise the next `subdivision` boundary past the scheduler's lookahead.
     * Call before acquireTransport.
     */
    quantizedStart(subdivision: Tone.Unit.Time): Tone.Unit.Time {
        const transport = Tone.getTransport();
        if (transport.state !== 'started') return 0;
        const grid = Tone.Time(subdivision).toTicks();
        const margin = Tone.Time(Tone.getContext().lookAhead + 0.02).toTicks();
        return `${Math.ceil((transport.ticks + margin) / grid) * grid}i`;
    }

    /** Arpeggiate while held. Returns the function that stops it. */
    startArp(midi: number[], opts: ArpOptions): () => void {
        const synth = this.voice().synth;
        const owner = `arp:${Math.random().toString(36).slice(2)}`;
        let cycle = arpOrder(midi, opts.pattern);
        let step = 0;
        const velocity = velocityFor(1);

        const loop = new Tone.Loop(time => {
            if (step >= cycle.length) {
                cycle = arpOrder(midi, opts.pattern); // reshuffles for 'random'
                step = 0;
            }
            synth.triggerAttackRelease(
                Tone.Frequency(cycle[step++], 'midi').toFrequency(), opts.noteLength, time, velocity);
        }, opts.rate);

        const startAt = this.quantizedStart(opts.rate);
        this.acquireTransport(owner);
        loop.start(startAt);

        return () => {
            loop.stop();
            loop.dispose();
            this.releaseTransport(owner);
        };
    }

    /** Schedule an arpeggio at an exact audio time, filling `seconds` (used by sequencer steps). */
    scheduleArp(midi: number[], opts: ArpOptions, time: number, seconds: number, instrument?: InstrumentId) {
        const synth = this.voice(instrument).synth;
        const stepSeconds = Tone.Time(opts.rate).toSeconds();
        const steps = Math.max(1, Math.floor((seconds + 1e-6) / stepSeconds));
        let cycle = arpOrder(midi, opts.pattern);
        for (let i = 0, k = 0; i < steps; i++, k++) {
            if (k >= cycle.length) {
                cycle = arpOrder(midi, opts.pattern);
                k = 0;
            }
            synth.triggerAttackRelease(
                Tone.Frequency(cycle[k], 'midi').toFrequency(),
                Math.min(opts.noteLength, stepSeconds), time + i * stepSeconds, velocityFor(1));
        }
    }

    // ---- effects -----------------------------------------------------------

    readonly fx = {
        get: (): FxState => JSON.parse(JSON.stringify(this.fxState)),
        set: <N extends FxName>(name: N, params: Partial<FxState[N]>) => {
            Object.assign(this.fxState[name], params);
            this.applyFx(name);
        },
    };

    private applyFx(name: FxName) {
        const s = this.fxState;
        switch (name) {
            case 'reverb':
                if (this.reverb.decay !== s.reverb.decay) this.reverb.decay = s.reverb.decay;
                this.reverb.wet.value = s.reverb.enabled ? s.reverb.wet : 0;
                break;
            case 'delay':
                this.delay.delayTime.value = Tone.Time(s.delay.time).toSeconds(); // follows current bpm
                this.delay.feedback.value = s.delay.feedback;
                this.delay.wet.value = s.delay.enabled ? s.delay.wet : 0;
                break;
            case 'chorus':
                this.chorus.depth = s.chorus.depth;
                this.chorus.frequency.value = s.chorus.frequency;
                this.chorus.wet.value = s.chorus.enabled ? s.chorus.wet : 0;
                break;
            case 'distortion':
                this.distortion.distortion = s.distortion.amount;
                this.distortion.wet.value = s.distortion.enabled ? 1 : 0;
                break;
        }
    }
}

let instance: Engine | null = null;

/** The shared engine, built on first use so importing this module creates no audio nodes. */
export function getEngine(): Engine {
    return instance ?? (instance = new Engine());
}
