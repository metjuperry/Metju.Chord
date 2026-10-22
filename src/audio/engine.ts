import * as Tone from 'tone';
import { ArpPattern, arpOrder } from '../theory';
import { Instrument, InstrumentId, createInstrument } from './instruments';
import { DrumKit } from './drumkit';
import type { DrumVoice } from '../drums';
import { PartFx, PartTone, neutralTone, shapeBrightness, shapePan } from '../parts';
import type { Space } from '../song';

export type ArpRate = '4n' | '8n' | '8t' | '16n' | '16t' | '32n';

export interface ArpOptions {
    pattern: ArpPattern;
    rate: ArpRate;
    /** Gate length of each arp note, in seconds. */
    noteLength: number;
}

const velocityFor = (voices: number) => 1 / Math.sqrt(Math.max(1, voices));

/**
 * A part's channel: instrument -> drive -> makeup -> chorus -> level -> master, with the level also
 * feeding two sends into the shared reverb and delay. Drum parts skip drive and chorus.
 */
interface Channel {
    input: Tone.Gain;
    /** Brightness: a low-pass that closes to darken, and a high shelf that lifts to brighten. */
    tone?: Tone.Filter;
    shelf?: Tone.Filter;
    pan: Tone.Panner;
    drive?: Tone.Distortion;
    makeup?: Tone.Gain;
    chorus?: Tone.Chorus;
    level: Tone.Volume;
    sendReverb: Tone.Gain;
    sendDelay: Tone.Gain;
    nodes: Tone.ToneAudioNode[];
}

interface Strip extends Channel {
    instrument: InstrumentId;
    voice: Instrument;
    shaped: PartTone;
}

/**
 * Drive gets louder as it squashes; this pulls it back so turning drive up adds grit, not volume.
 * Fitted to the average loudness rise measured on E-Piano, Bass, Lead and Strings (about +3.5 dB at
 * 25% up to +6.5 dB at 100%), in dB at drive amount `a`.
 */
export const driveMakeupDb = (a: number) => (a <= 0 ? 0 : -(1.5 + 5.2 * Math.pow(a, 0.6)));

/** Master gain at full output level. */
const MASTER_GAIN = 0.8;

const NO_FX: PartFx = { drive: 0, chorus: 0, reverb: 0, delay: 0 };

/**
 * Owns every audio node. Each part has its own channel (see Channel); the parts share one reverb
 * and one delay, which they send into, and everything ends in master -> limiter -> destination.
 */
export class Engine {
    readonly master = new Tone.Gain(MASTER_GAIN);
    readonly limiter = new Tone.Limiter(-1);
    readonly meter = new Tone.Meter();

    private reverbBus = new Tone.Gain(1);
    private reverb = new Tone.Reverb({ decay: 2.5, wet: 1 });
    private reverbReturn = new Tone.Gain(0.8);
    private delayBus = new Tone.Gain(1);
    private delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.35, wet: 1 });
    private delayReturn = new Tone.Gain(0.7);
    private space: Space = {
        reverb: { size: 2.5, ret: 0.8 },
        delay: { time: '8n', feedback: 0.35, ret: 0.7 },
        out: { level: 1 },
    };

    /** One strip per instrument part. */
    private strips = new Map<string, Strip>();
    /** One kit per drum part. */
    private kits = new Map<string, Channel & { kit: DrumKit }>();
    /** The part the pads and keyboard play through. */
    private current = 'main';
    private transportUsers = new Set<string>();

    constructor() {
        this.master.chain(this.limiter, Tone.getDestination());
        this.limiter.connect(this.meter);
        this.reverbBus.chain(this.reverb, this.reverbReturn, this.master);
        this.delayBus.chain(this.delay, this.delayReturn, this.master);
    }

    /** Resolves once the reverb impulse response is rendered. */
    ready(): Promise<void> {
        return this.reverb.ready;
    }

    // ---- channels ------------------------------------------------------------

    /**
     * A channel's nodes, wired up: input -> [tone -> shelf -> drive -> makeup -> chorus] -> pan -> level.
     * `inserts` adds the bracketed part (not for drums).
     */
    private makeChannel(volume: number, inserts: boolean): Channel {
        const input = new Tone.Gain(1);
        const pan = new Tone.Panner(0);
        const level = new Tone.Volume(volume).connect(this.master);
        const sendReverb = new Tone.Gain(0).connect(this.reverbBus);
        const sendDelay = new Tone.Gain(0).connect(this.delayBus);
        pan.connect(level);
        level.connect(sendReverb);
        level.connect(sendDelay);
        if (!inserts) {
            input.connect(pan);
            return { input, pan, level, sendReverb, sendDelay, nodes: [input, pan, level, sendReverb, sendDelay] };
        }
        const tone = new Tone.Filter({ type: 'lowpass', frequency: 20000, rolloff: -12, Q: 0.5 });
        const shelf = new Tone.Filter({ type: 'highshelf', frequency: 2500, gain: 0 });
        const drive = new Tone.Distortion({ distortion: 0, wet: 0, oversample: '2x' });
        const makeup = new Tone.Gain(1);
        const chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, spread: 180, wet: 0 }).start();
        input.chain(tone, shelf, drive, makeup, chorus, pan);
        return {
            input, tone, shelf, drive, makeup, chorus, pan, level, sendReverb, sendDelay,
            nodes: [input, tone, shelf, drive, makeup, chorus, pan, level, sendReverb, sendDelay],
        };
    }

    /** Set a strip's tone: the instrument's envelope, the brightness filters and the pan. */
    private applyTone(strip: Strip, t: PartTone) {
        const { cutoff, shelfDb } = shapeBrightness(t.brightness);
        strip.tone?.frequency.rampTo(cutoff, 0.05);
        strip.shelf?.gain.rampTo(shelfDb, 0.05);
        strip.pan.pan.rampTo(shapePan(t.pan), 0.05);
        strip.voice.shape(t.attack, t.release);
        strip.shaped = { ...t };
    }

    /** Set a channel's effects, smoothly. */
    private applyFx(ch: Channel, fx: PartFx) {
        if (ch.drive && ch.makeup) {
            ch.drive.distortion = 0.1 + 0.8 * fx.drive;
            ch.drive.wet.rampTo(fx.drive > 0 ? 1 : 0, 0.03);
            ch.makeup.gain.rampTo(Tone.dbToGain(driveMakeupDb(fx.drive)), 0.03);
        }
        ch.chorus?.wet.rampTo(fx.chorus, 0.05);
        ch.sendReverb.gain.rampTo(fx.reverb, 0.05);
        ch.sendDelay.gain.rampTo(fx.delay, 0.05);
    }

    private disposeChannel(ch: Channel, after = 600) {
        ch.level.volume.rampTo(-80, 0.05);
        setTimeout(() => ch.nodes.forEach(n => n.dispose()), after);
    }

    /** The shared reverb, delay and output level. */
    setSpace(space: Space) {
        if (space.reverb.size !== this.space.reverb.size) this.reverb.decay = space.reverb.size;
        this.reverbReturn.gain.rampTo(space.reverb.ret, 0.05);
        this.delay.delayTime.rampTo(Tone.Time(space.delay.time).toSeconds(), 0.05);
        this.delay.feedback.rampTo(space.delay.feedback, 0.05);
        this.delayReturn.gain.rampTo(space.delay.ret, 0.05);
        // full level is the master gain the instruments were matched at, leaving headroom for the sends
        this.master.gain.rampTo(MASTER_GAIN * space.out.level, 0.05);
        this.space = JSON.parse(JSON.stringify(space));
    }

    // ---- instruments -------------------------------------------------------

    /** Create or update a part's strip. Changing its instrument swaps the synth with a short fade. */
    setTrack(id: string, opts: { instrument: InstrumentId; volume: number; fx?: PartFx; tone?: PartTone }) {
        let strip = this.strips.get(id);
        if (!strip) {
            const voice = createInstrument(opts.instrument);
            strip = { ...this.makeChannel(opts.volume, true), instrument: opts.instrument, voice, shaped: neutralTone() };
            voice.output.connect(strip.input);
            this.strips.set(id, strip);
        } else {
            strip.level.volume.rampTo(opts.volume, 0.05);
            if (strip.instrument !== opts.instrument) {
                const previous = strip.voice;
                strip.voice = createInstrument(opts.instrument);
                strip.voice.output.connect(strip.input);
                strip.instrument = opts.instrument;
                this.fadeOut(previous, strip.input);
            }
        }
        this.applyFx(strip, opts.fx ?? NO_FX);
        this.applyTone(strip, opts.tone ?? strip.shaped);
    }

    /** Fade a voice out over 50 ms (still through its channel) and dispose it, so swapping instruments mid-note doesn't click. */
    private fadeOut(voice: Instrument, into: Tone.ToneAudioNode, then?: () => void) {
        const fade = new Tone.Gain(1).connect(into);
        voice.output.disconnect();
        voice.output.connect(fade);
        voice.releaseAll(Tone.now());
        fade.gain.rampTo(0, 0.05);
        setTimeout(() => {
            voice.dispose();
            fade.dispose();
            then?.();
        }, 150);
    }

    /** Create or update a drum part's kit, level and sends. */
    setDrumTrack(id: string, opts: { volume: number; fx?: PartFx }) {
        let ch = this.kits.get(id);
        if (!ch) {
            const kit = new DrumKit();
            ch = { ...this.makeChannel(opts.volume, false), kit };
            kit.output.connect(ch.input);
            this.kits.set(id, ch);
        } else {
            ch.level.volume.rampTo(opts.volume, 0.05);
        }
        this.applyFx(ch, { ...(opts.fx ?? NO_FX), drive: 0, chorus: 0 });
    }

    /** Play one drum hit on a drum part at an audio-clock `time`. */
    playDrum(track: string, voice: DrumVoice, time?: number, velocity = 1) {
        const ch = this.kits.get(track);
        if (!ch) return;
        try {
            ch.kit.trigger(voice, time ?? Tone.now(), velocity);
        } catch {
            // two hits on one monophonic voice at the same instant: the second is dropped
        }
    }

    removeTrack(id: string) {
        const kit = this.kits.get(id);
        if (kit) {
            this.kits.delete(id);
            this.disposeChannel(kit);
            setTimeout(() => kit.kit.dispose(), 600);
        }
        const strip = this.strips.get(id);
        if (!strip) return;
        this.strips.delete(id);
        this.fadeOut(strip.voice, strip.input, () => this.disposeChannel(strip, 300));
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
        const voice = this.voice(opts.track);
        const time = opts.time ?? Tone.now();
        voice.attack(midi, time, velocityFor(midi.length));
        voice.release(midi, time + Tone.Time(opts.duration).toSeconds());
    }

    /**
     * Start a chord on `track` (default: the selected one); returns how to release it, on that same
     * synth even if the selection changes.
     */
    attack(midi: number[], time?: number, track?: string): () => void {
        const voice = this.voice(track);
        voice.attack(midi, time ?? Tone.now(), velocityFor(midi.length));
        return () => voice.release(midi, Tone.now());
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
        this.strips.forEach(s => s.voice.releaseAll(Tone.now()));
    }

    /** Resolves when every part's instrument plays its real sound (sampled ones have loaded). */
    instrumentsReady(): Promise<void> {
        return Promise.all([...this.strips.values()].map(s => s.voice.ready)).then(() => undefined);
    }

    // ---- transport ---------------------------------------------------------

    /** One shared bpm for the metronome, arpeggiator, sequencer and tempo-synced delay. */
    setBpm(bpm: number) {
        Tone.getTransport().bpm.value = bpm;
        // the delay is tempo-synced: re-read its note value at the new tempo
        this.delay.delayTime.rampTo(Tone.Time(this.space.delay.time).toSeconds(), 0.05);
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
        const voice = this.voice();
        const owner = `arp:${Math.random().toString(36).slice(2)}`;
        let cycle = arpOrder(midi, opts.pattern);
        let step = 0;
        const velocity = velocityFor(1);

        const loop = new Tone.Loop(time => {
            if (step >= cycle.length) {
                cycle = arpOrder(midi, opts.pattern); // reshuffles for 'random'
                step = 0;
            }
            const note = [cycle[step++]];
            voice.attack(note, time, velocity);
            voice.release(note, time + opts.noteLength);
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
        const voice = this.voice(track);
        const stepSeconds = Tone.Time(opts.rate).toSeconds();
        const steps = Math.max(1, Math.floor((seconds + 1e-6) / stepSeconds));
        let cycle = arpOrder(midi, opts.pattern);
        for (let i = 0, k = 0; i < steps; i++, k++) {
            if (k >= cycle.length) {
                cycle = arpOrder(midi, opts.pattern);
                k = 0;
            }
            const at = time + i * stepSeconds;
            voice.attack([cycle[k]], at, velocityFor(1));
            voice.release([cycle[k]], at + Math.min(opts.noteLength, stepSeconds));
        }
    }
}

let instance: Engine | null = null;

/** The shared engine, built on first use so importing this module creates no audio nodes. */
export function getEngine(): Engine {
    return instance ?? (instance = new Engine());
}
