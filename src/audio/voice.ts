import * as Tone from 'tone';
import type { Adsr } from '../sound';
import { SYNTH_ENVELOPES } from '../sound';
import type { VoiceRange, VoiceSettings, Vowel } from '../parts';
import type { Glide, Instrument } from './instruments';
import { FORMANTS, SINGERS, VOWEL_TRIM } from './voiceData';

/**
 * The Voice part's singers. Each note is sung by one singer (Solo) or five (Choir): a wave with the
 * singer's own colour (voiceData SINGERS), slightly detuned, with its own vibrato and slow drift.
 * Each singer sings through their own mouth: four resonant filters at the vowel's formants
 * (voiceData FORMANTS), so changing the vowel glides those filters while the notes go on, and high
 * notes keep their vowel instead of turning chipmunky. Breath is filtered noise through the first
 * singer's mouth. Choir singers sit across the stereo field.
 */

/** Output level in dB, matched with `npm run levels`. */
export const VOICE_VOLUME = 9;

const CHOIR = 5;
/** Where each singer stands (pan) and how far off pitch they sing (cents); the first is the solo voice. */
const PLACES: { pan: number; cents: number; vibHz: number; driftHz: number }[] = [
    { pan: 0, cents: 0, vibHz: 5.4, driftHz: 0.21 },
    { pan: -0.55, cents: -11, vibHz: 5.0, driftHz: 0.17 },
    { pan: 0.55, cents: 9, vibHz: 5.8, driftHz: 0.13 },
    { pan: -0.25, cents: 5, vibHz: 4.7, driftHz: 0.26 },
    { pan: 0.25, cents: -6, vibHz: 6.1, driftHz: 0.19 },
];
/** Full vibrato depth, in cents either way. */
const VIBRATO_CENTS = 45;
/** How far a choir singer drifts, in cents either way (a solo voice holds steadier). */
const DRIFT_CENTS = 7;
/** How quickly the mouth moves to a new vowel, in seconds. */
export const VOWEL_GLIDE = 0.08;
const MAX_NOTES = 10;

interface Mouth {
    input: Tone.Gain;
    filters: Tone.Filter[];
    levels: Tone.Gain[];
    pan: Tone.Panner;
    vibrato: Tone.LFO;
    drift: Tone.LFO;
}

interface Sung {
    midi: number;
    start: number;
    released: boolean;
    oscs: OscillatorNode[];
    gains: GainNode[];
    breath?: GainNode;
    peak: number;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class VoiceInstrument implements Instrument {
    readonly output = new Tone.Volume(VOICE_VOLUME);
    readonly ready = Promise.resolve();
    private readonly ctx = Tone.getContext().rawContext as AudioContext;
    private readonly mouths: Mouth[];
    private readonly noise = new Tone.Noise('pink').start();
    private readonly breathTone = new Tone.Filter({ type: 'highpass', frequency: 1400, Q: 0.4 });
    private settings: VoiceSettings = { singers: 'choir', range: 'low', vowel: 'u', vibrato: 0.35, breath: 0.15 };
    private waves = new Map<string, PeriodicWave>();
    private notes: Sung[] = [];
    private readonly preset: Adsr = SYNTH_ENVELOPES.voice;
    private env: Adsr = { ...SYNTH_ENVELOPES.voice };

    constructor() {
        this.noise.connect(this.breathTone);
        this.mouths = PLACES.map(place => {
            const input = new Tone.Gain(1);
            const pan = new Tone.Panner(place.pan).connect(this.output);
            const filters: Tone.Filter[] = [];
            const levels: Tone.Gain[] = [];
            for (let k = 0; k < 4; k++) {
                const f = new Tone.Filter({ type: 'bandpass', frequency: 500, Q: 5 });
                const g = new Tone.Gain(1);
                input.chain(f, g, pan);
                filters.push(f);
                levels.push(g);
            }
            const vibrato = new Tone.LFO({ frequency: place.vibHz, min: 0, max: 0 }).start();
            const drift = new Tone.LFO({ frequency: place.driftHz, type: 'triangle', min: 0, max: 0 }).start();
            return { input, filters, levels, pan, vibrato, drift };
        });
        this.sing(this.settings);
    }

    /** How the singers sing: solo or choir, low or high, the vowel, vibrato and breath. */
    sing(next: VoiceSettings) {
        this.settings = { ...next };
        const v = next.vibrato * VIBRATO_CENTS;
        this.mouths.forEach((m, i) => {
            m.vibrato.min = -v;
            m.vibrato.max = v;
            const d = next.singers === 'choir' && i > 0 ? DRIFT_CENTS : DRIFT_CENTS / 3;
            m.drift.min = -d;
            m.drift.max = d;
        });
        this.vowel(next.vowel, Tone.now(), VOWEL_GLIDE);
    }

    /** Move every singer's mouth to `vowel`, arriving at `time + glide`. */
    vowel(vowel: Vowel, time: number, glide = VOWEL_GLIDE) {
        const shape = FORMANTS[this.settings.range][vowel];
        const trim = Tone.dbToGain(VOWEL_TRIM[this.settings.range][vowel]);
        this.mouths.forEach(m => {
            shape.forEach(([freq, bw, db], k) => {
                const f = m.filters[k];
                f.frequency.cancelScheduledValues(time);
                f.frequency.setValueAtTime(f.frequency.getValueAtTime(time), time);
                f.frequency.exponentialRampToValueAtTime(freq, time + Math.max(0.005, glide));
                f.Q.setValueAtTime(freq / bw, time);
                // a narrow band passes little: make up for it so each formant is as loud as its level says
                m.levels[k].gain.setTargetAtTime(Tone.dbToGain(db) * Math.sqrt(freq / bw) * 0.6 * trim, time, glide / 3 + 0.001);
            });
        });
    }

    shape(over: Partial<Adsr>) {
        this.env = { ...this.preset, ...over };
    }

    /** One singer's wave (cached): their colour as harmonics. */
    private wave(range: VoiceRange, singer: number): PeriodicWave {
        const key = `${range}:${singer}`;
        let w = this.waves.get(key);
        if (!w) {
            const amps = SINGERS[range][singer];
            const real = new Float32Array(amps.length + 1);
            const imag = new Float32Array(amps.length + 1);
            amps.forEach((a, i) => (imag[i + 1] = a));
            w = this.ctx.createPeriodicWave(real, imag);
            this.waves.set(key, w);
        }
        return w;
    }

    attack(midi: number[], time: number, velocity: number, glide?: Glide) {
        const singers = this.settings.singers === 'choir' ? CHOIR : 1;
        // a choir is as loud as a solo voice; a chord shares the room between its notes
        const peak = (velocity * 0.5) / Math.sqrt(singers);
        for (const m of midi) {
            this.makeRoom(time);
            const to = mtof(m);
            const oscs: OscillatorNode[] = [];
            const gains: GainNode[] = [];
            for (let i = 0; i < singers; i++) {
                const osc = this.ctx.createOscillator();
                osc.setPeriodicWave(this.wave(this.settings.range, i));
                osc.frequency.setValueAtTime(glide ? mtof(glide.from) : to, time);
                if (glide && glide.time > 0) osc.frequency.exponentialRampToValueAtTime(to, time + glide.time);
                osc.detune.value = singers > 1 ? PLACES[i].cents : 0;
                Tone.connect(this.mouths[i].vibrato, osc.detune);
                Tone.connect(this.mouths[i].drift, osc.detune);
                const g = this.ctx.createGain();
                g.gain.value = 0;
                osc.connect(g);
                Tone.connect(g, this.mouths[i].input);
                this.envelope(g.gain, time, peak);
                osc.start(time);
                oscs.push(osc);
                gains.push(g);
            }
            let breath: GainNode | undefined;
            if (this.settings.breath > 0) {
                breath = this.ctx.createGain();
                breath.gain.value = 0;
                Tone.connect(this.breathTone, breath);
                Tone.connect(breath, this.mouths[0].input);
                this.envelope(breath.gain, time, peak * this.settings.breath * 0.9);
            }
            this.notes.push({ midi: m, start: time, released: false, oscs, gains, breath, peak });
        }
    }

    /** Attack to the peak, then decay to the sustain level. */
    private envelope(p: AudioParam, time: number, peak: number) {
        const { attack, decay, sustain } = this.env;
        p.cancelScheduledValues(time);
        p.setValueAtTime(0, time);
        p.linearRampToValueAtTime(peak, time + Math.max(0.005, attack));
        p.setTargetAtTime(peak * sustain, time + Math.max(0.005, attack), Math.max(0.005, decay) / 3);
    }

    /** Too many notes sounding: let the oldest go quickly. */
    private makeRoom(time: number) {
        const live = this.notes.filter(n => !n.released);
        if (live.length >= MAX_NOTES) this.end(live[0], time, 0.05);
    }

    private end(n: Sung, time: number, release = this.env.release) {
        const at = Math.max(time, n.start);
        const fade = (p: AudioParam) => {
            p.cancelScheduledValues(at);
            p.setValueAtTime(p.value, at);
            p.setTargetAtTime(0, at, Math.max(0.01, release) / 4);
        };
        n.gains.forEach(g => fade(g.gain));
        if (n.breath) fade(n.breath.gain);
        n.released = true;
        const stop = at + Math.max(0.01, release) * 1.6 + 0.05;
        n.oscs.forEach(o => o.stop(stop));
        const wait = Math.max(0, stop - this.ctx.currentTime) * 1000 + 100;
        setTimeout(() => {
            n.oscs.forEach(o => o.disconnect());
            n.gains.forEach(g => g.disconnect());
            n.breath?.disconnect();
            this.notes = this.notes.filter(x => x !== n);
        }, wait);
    }

    release(midi: number[], time: number) {
        for (const m of midi) {
            const n = this.notes.filter(x => x.midi === m && !x.released).sort((a, b) => a.start - b.start)[0];
            if (n) this.end(n, time);
        }
    }

    releaseAll(time: number) {
        this.notes.filter(n => !n.released).forEach(n => this.end(n, time));
    }

    dispose() {
        this.releaseAll(Tone.now());
        setTimeout(() => {
            this.notes.forEach(n => n.oscs.forEach(o => o.disconnect()));
            this.mouths.forEach(m => {
                [m.input, m.pan, m.vibrato, m.drift, ...m.filters, ...m.levels].forEach(x => x.dispose());
            });
            this.noise.dispose();
            this.breathTone.dispose();
            this.output.dispose();
        }, 50);
    }
}
