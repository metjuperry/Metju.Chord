import * as Tone from 'tone';
import { ArpPattern, arpOrder } from '../theory';
import { Instrument, InstrumentId, createInstrument } from './instruments';
import { DrumKit } from './drumkit';
import type { DrumVoice } from '../drums';

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

interface Strip {
    instrument: InstrumentId;
    voice: Instrument;
    level: Tone.Volume;
}

/**
 * Owns every audio node. Signal path:
 *   track instrument -> track volume -> fxIn -> distortion -> chorus -> delay -> reverb -> fxOut -> master -> limiter -> destination
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

    /** One strip per sequencer track: its instrument into its own volume, then into the shared effects. */
    private strips = new Map<string, Strip>();
    /** Drum tracks: a kit into its own volume, straight to the master (dry, so the chord effects don't smear the beat). */
    private kits = new Map<string, { kit: DrumKit; level: Tone.Volume }>();
    /** The track the pads and keyboard play through. */
    private current = 'main';
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

    /** Create or update a track's strip. Changing its instrument swaps the synth with a short fade. */
    setTrack(id: string, opts: { instrument: InstrumentId; volume: number }) {
        let strip = this.strips.get(id);
        if (!strip) {
            const level = new Tone.Volume(opts.volume).connect(this.fxIn);
            const voice = createInstrument(opts.instrument);
            voice.output.connect(level);
            strip = { instrument: opts.instrument, voice, level };
            this.strips.set(id, strip);
            return;
        }
        strip.level.volume.rampTo(opts.volume, 0.05);
        if (strip.instrument !== opts.instrument) {
            const previous = strip.voice;
            strip.voice = createInstrument(opts.instrument);
            strip.voice.output.connect(strip.level);
            strip.instrument = opts.instrument;
            this.fadeOut(previous);
        }
    }

    /** Fade a voice out over 50 ms (still through the effects and limiter) and dispose it, so swapping instruments mid-note doesn't click. */
    private fadeOut(voice: Instrument, then?: () => void) {
        const fade = new Tone.Gain(1).connect(this.fxIn);
        voice.output.disconnect();
        voice.output.connect(fade);
        voice.synth.releaseAll();
        fade.gain.rampTo(0, 0.05);
        setTimeout(() => {
            voice.nodes.forEach(n => n.dispose());
            fade.dispose();
            then?.();
        }, 150);
    }

    /** Create or update a drum track's kit and level. */
    setDrumTrack(id: string, opts: { volume: number }) {
        const existing = this.kits.get(id);
        if (existing) {
            existing.level.volume.rampTo(opts.volume, 0.05);
            return;
        }
        const level = new Tone.Volume(opts.volume).connect(this.master);
        const kit = new DrumKit();
        kit.output.connect(level);
        this.kits.set(id, { kit, level });
    }

    /** Play one drum hit on a drum track at an audio-clock `time`. */
    playDrum(track: string, voice: DrumVoice, time?: number, velocity = 1) {
        const strip = this.kits.get(track);
        if (!strip) return;
        try {
            strip.kit.trigger(voice, time ?? Tone.now(), velocity);
        } catch {
            // two hits on one monophonic voice at the same instant: the second is dropped
        }
    }

    removeTrack(id: string) {
        const kit = this.kits.get(id);
        if (kit) {
            this.kits.delete(id);
            kit.level.volume.rampTo(-80, 0.05);
            setTimeout(() => {
                kit.kit.dispose();
                kit.level.dispose();
            }, 600);
        }
        const strip = this.strips.get(id);
        if (!strip) return;
        this.strips.delete(id);
        this.fadeOut(strip.voice, () => strip.level.dispose());
    }

    /** The track the pads and keyboard play through. */
    selectTrack(id: string) {
        this.current = id;
    }

    /** Pads and keyboard play this instrument (on the selected track). Used by the level check too. */
    setInstrument(id: InstrumentId) {
        const strip = this.strips.get(this.current);
        this.setTrack(this.current, { instrument: id, volume: strip ? strip.level.volume.value : 0 });
    }

    private voice(track: string = this.current): Instrument {
        if (!this.strips.has(track)) this.setTrack(track, { instrument: 'epiano', volume: 0 });
        return this.strips.get(track)!.voice;
    }

    // ---- playing -----------------------------------------------------------

    /** Play a chord for `duration` (seconds or Tone time) at an audio-clock `time`, on `track` (default: the selected one). */
    playChord(midi: number[], opts: { duration: Tone.Unit.Time; time?: number; track?: string }) {
        this.voice(opts.track).synth.triggerAttackRelease(
            this.toFreqs(midi), opts.duration, opts.time ?? Tone.now(), velocityFor(midi.length));
    }

    /** Start a chord on the selected track; returns how to release it (on that same synth, even if the selection changes). */
    attack(midi: number[], time?: number): () => void {
        const synth = this.voice().synth;
        const freqs = this.toFreqs(midi);
        synth.triggerAttack(freqs, time ?? Tone.now(), velocityFor(midi.length));
        return () => synth.triggerRelease(freqs, Tone.now());
    }

    /**
     * The intro's "bwooong": the notes rolled upwards a few ms apart on a bell-ish FM voice, while a
     * low-pass opens wide and settles back, through its own long reverb. Everything is thrown away
     * once it has rung out.
     */
    playIntro(midi: number[]) {
        const reverb = new Tone.Reverb({ decay: 4.5, wet: 0.4 }).connect(this.master);
        const filter = new Tone.Filter({ type: 'lowpass', frequency: 500, Q: 2 }).connect(reverb);
        const synth = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 2,
            modulationIndex: 5,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.006, decay: 2.8, sustain: 0.12, release: 2.4 },
            modulation: { type: 'triangle' },
            modulationEnvelope: { attack: 0.01, decay: 1.4, sustain: 0.1, release: 1.5 },
        } as Partial<Tone.FMSynthOptions>).connect(filter);
        synth.volume.value = 0;
        const at = Tone.now() + 0.05;
        filter.frequency.setValueAtTime(500, at);
        filter.frequency.exponentialRampToValueAtTime(6000, at + 0.4);
        filter.frequency.exponentialRampToValueAtTime(1400, at + 3);
        midi.forEach((m, i) =>
            synth.triggerAttackRelease(Tone.Frequency(m, 'midi').toFrequency(), 1.8, at + i * 0.045, i === 0 ? 0.9 : 0.6));
        setTimeout(() => {
            synth.dispose();
            filter.dispose();
            reverb.dispose();
        }, 8000);
    }

    releaseAll() {
        this.strips.forEach(s => s.voice.synth.releaseAll());
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
    scheduleArp(midi: number[], opts: ArpOptions, time: number, seconds: number, track?: string) {
        const synth = this.voice(track).synth;
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
