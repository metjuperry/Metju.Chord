/**
 * How a part sounds, beyond which instrument it is: its "shape". Standard synth controls, under their
 * standard names, so what's learnt here carries over to any synth:
 *
 * - Envelope (ADSR): Attack, Decay, Sustain, Release: how each note's volume rises and falls.
 * - Filter: Cutoff and Resonance, a type (low-pass, high-pass, band-pass), an Envelope Amount (the
 *   filter opens or closes with each note, following the envelope's attack and decay) and an LFO
 *   (Rate in note values of the tempo, Depth in octaves) that sweeps the cutoff.
 * - Drive: Warm (soft saturation), Crunch (hard distortion), Bitcrush (lo-fi steps).
 *
 * A part stores only what it changes (`ShapeOverrides`); everything else is the instrument's own
 * preset, so an untouched part sounds exactly as designed and Reset just clears the overrides.
 * Pure: no Tone.js here, the engine turns this into audio nodes.
 */

export type InstrumentId =
    | 'piano' | 'pad' | 'epiano' | 'organ' | 'pluck' | 'lead'
    | 'strings' | 'warmpad' | 'brass' | 'drawbar' | 'bells' | 'mallets' | 'chip' | 'bass';

/** Instruments played from recorded samples (with a synth stand-in until they load). */
export const SAMPLED_IDS = ['piano', 'epiano', 'strings', 'organ', 'brass', 'mallets', 'bells'] as const;
export type SampledId = (typeof SAMPLED_IDS)[number];
export const isSampledId = (id: InstrumentId): id is SampledId => (SAMPLED_IDS as readonly string[]).includes(id);

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';
export type DriveType = 'warm' | 'crunch' | 'bitcrush';
/** LFO rate as a note value of the tempo: one sweep per whole note … per 1/16, or per 1/8 triplet. */
export type LfoRate = '1n' | '2n' | '4n' | '8n' | '16n' | '8t';

export const FILTER_TYPES: FilterType[] = ['lowpass', 'highpass', 'bandpass'];
export const DRIVE_TYPES: DriveType[] = ['warm', 'crunch', 'bitcrush'];
export const LFO_RATES: LfoRate[] = ['1n', '2n', '4n', '8n', '16n', '8t'];

/** An amplitude envelope: times in seconds, sustain 0–1. */
export interface Adsr {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
}

export interface PartShape extends Adsr {
    filterType: FilterType;
    /** Hz. */
    cutoff: number;
    /** 0–1. */
    resonance: number;
    /** −1–1: how far each note opens (+) or closes (−) the filter, up to ±ENV_OCTAVES. */
    envAmount: number;
    lfoRate: LfoRate;
    /** 0–1: how far the LFO sweeps the cutoff, up to ±LFO_OCTAVES. */
    lfoDepth: number;
    driveType: DriveType;
    /** 0–1. */
    drive: number;
}

export type ShapeOverrides = Partial<PartShape>;
export type ShapeKey = keyof PartShape;
/** The shape's controls that are numbers (knobs), as opposed to pickers. */
export type ShapeKnob = 'attack' | 'decay' | 'sustain' | 'release' | 'cutoff' | 'resonance' | 'envAmount' | 'lfoDepth' | 'drive';

export const ENV_OCTAVES = 5;
export const LFO_OCTAVES = 3;
export const CUTOFF_MAX = 20000;

/** Each synth preset's own envelope (the voices in audio/instruments.ts are built with these). */
export const SYNTH_ENVELOPES: { [id in InstrumentId]: Adsr } = {
    pad: { attack: 0.08, decay: 0.3, sustain: 0.7, release: 1.5 },
    piano: { attack: 0.005, decay: 1.2, sustain: 0.2, release: 1 },
    epiano: { attack: 0.005, decay: 1.2, sustain: 0.2, release: 1 },
    organ: { attack: 0.01, decay: 0, sustain: 1, release: 0.08 },
    pluck: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.4 },
    strings: { attack: 0.35, decay: 0.2, sustain: 0.9, release: 1.6 },
    warmpad: { attack: 0.5, decay: 0.3, sustain: 0.9, release: 2.5 },
    brass: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 },
    drawbar: { attack: 0.005, decay: 0, sustain: 1, release: 0.06 },
    bells: { attack: 0.001, decay: 2.5, sustain: 0, release: 2.5 },
    mallets: { attack: 0.001, decay: 0.7, sustain: 0, release: 0.6 },
    chip: { attack: 0.002, decay: 0.1, sustain: 0.6, release: 0.08 },
    bass: { attack: 0.004, decay: 0.25, sustain: 0.8, release: 0.12 },
    lead: { attack: 0.005, decay: 0.1, sustain: 0.9, release: 1 },
};

/**
 * Each sample set's own envelope. A recording decays by itself, so sustain is 1 (the sample plays as
 * recorded while held) and decay only matters once sustain is turned down.
 */
export const SAMPLE_ENVELOPES: { [id in SampledId]: Adsr } = {
    piano: { attack: 0.002, decay: 0.8, sustain: 1, release: 0.5 },
    epiano: { attack: 0.002, decay: 0.8, sustain: 1, release: 0.6 },
    strings: { attack: 0.18, decay: 0.5, sustain: 1, release: 0.9 },
    organ: { attack: 0.03, decay: 0.5, sustain: 1, release: 0.3 },
    brass: { attack: 0.05, decay: 0.5, sustain: 1, release: 0.35 },
    mallets: { attack: 0.002, decay: 0.8, sustain: 1, release: 2 },
    bells: { attack: 0.002, decay: 0.8, sustain: 1, release: 2.5 },
};

/** The filter and drive as every instrument starts: wide open, no resonance, no movement, clean. */
const NEUTRAL: Omit<PartShape, keyof Adsr> = {
    filterType: 'lowpass', cutoff: CUTOFF_MAX, resonance: 0, envAmount: 0, lfoRate: '4n', lfoDepth: 0, driveType: 'warm', drive: 0,
};

/** The instrument's own shape: what an untouched part sounds like (the samples' envelope for sampled instruments). */
export const defaultShape = (id: InstrumentId): PartShape => ({ ...(isSampledId(id) ? SAMPLE_ENVELOPES[id] : SYNTH_ENVELOPES[id]), ...NEUTRAL });

/** A part's shape: its instrument's, with the part's own changes on top. */
export const effectiveShape = (id: InstrumentId, over: ShapeOverrides | undefined): PartShape => ({ ...defaultShape(id), ...over });

// ---- knobs: every control audible across its whole range ------------------------------------

interface KnobSpec {
    label: string;
    min: number;
    max: number;
    /** 'log': equal knob turns multiply the value (how ears hear time and pitch). */
    curve: 'log' | 'lin';
}

export const KNOBS: { [k in ShapeKnob]: KnobSpec } = {
    attack: { label: 'Attack', min: 0.001, max: 4, curve: 'log' },
    decay: { label: 'Decay', min: 0.01, max: 5, curve: 'log' },
    sustain: { label: 'Sustain', min: 0, max: 1, curve: 'lin' },
    release: { label: 'Release', min: 0.01, max: 8, curve: 'log' },
    // instruments carry little above ~5 kHz, so the knob tops out at 10 kHz (the untouched default, fully open, reads 'open')
    cutoff: { label: 'Cutoff', min: 40, max: 10000, curve: 'log' },
    resonance: { label: 'Resonance', min: 0, max: 1, curve: 'lin' },
    envAmount: { label: 'Env Amount', min: -1, max: 1, curve: 'lin' },
    lfoDepth: { label: 'LFO Depth', min: 0, max: 1, curve: 'lin' },
    drive: { label: 'Drive', min: 0, max: 1, curve: 'lin' },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A control's value as a knob position 0–1. */
export function toKnob(k: ShapeKnob, value: number): number {
    const s = KNOBS[k];
    const v = clamp(value, s.min, s.max);
    return s.curve === 'log' ? Math.log(v / s.min) / Math.log(s.max / s.min) : (v - s.min) / (s.max - s.min);
}

/** A knob position 0–1 as the control's value. */
export function fromKnob(k: ShapeKnob, pos: number): number {
    const s = KNOBS[k];
    const p = clamp(pos, 0, 1);
    return s.curve === 'log' ? s.min * Math.pow(s.max / s.min, p) : s.min + p * (s.max - s.min);
}

const secs = (s: number) => (s < 0.995 ? `${Math.round(s * 1000)} ms` : `${Math.round(s * 10) / 10} s`);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** What a control's value reads as under its knob. */
export function shapeText(k: ShapeKnob, v: number): string {
    switch (k) {
        case 'attack': case 'decay': case 'release': return secs(v);
        case 'cutoff': return v >= 9900 ? 'open' : v >= 1000 ? `${Math.round(v / 100) / 10} kHz` : `${Math.round(v)} Hz`;
        case 'envAmount': {
            const oct = Math.round(v * ENV_OCTAVES * 10) / 10;
            return oct === 0 ? 'off' : `${oct > 0 ? '+' : ''}${oct} oct`;
        }
        case 'lfoDepth': return v === 0 ? 'off' : `± ${Math.round(v * LFO_OCTAVES * 10) / 10} oct`;
        case 'drive': return v === 0 ? 'off' : pct(v);
        default: return pct(v);
    }
}

// ---- filter ---------------------------------------------------------------------------------

/** The filter is two stages (24 dB/octave, the classic synth slope), so every Cutoff position bites. */
export const FILTER_STAGES = 2;

/**
 * Each filter stage's Q for a Resonance of `r`: for low- and high-pass the Web Audio Q is the peak's
 * height in dB (0.5 = practically no peak, up to 11 dB a stage, a strong ~22 dB whistle for both);
 * for band-pass it's the band's narrowness.
 */
export const resonanceQ = (type: FilterType, r: number) => (type === 'bandpass' ? 0.6 + clamp(r, 0, 1) * 6 : 0.5 + clamp(r, 0, 1) * 10.5);

/** The LFO's sweep around the cutoff, in Hz (kept inside 20 Hz–20 kHz). */
export function lfoRange(s: Pick<PartShape, 'cutoff' | 'lfoDepth'>): { min: number; max: number } {
    const oct = clamp(s.lfoDepth, 0, 1) * LFO_OCTAVES;
    return { min: clamp(s.cutoff * Math.pow(2, -oct), 20, CUTOFF_MAX), max: clamp(s.cutoff * Math.pow(2, oct), 20, CUTOFF_MAX) };
}

/**
 * The filter envelope over one note, as a cutoff offset in cents: 0 at the start, the full Env Amount at
 * the end of the attack, settling to Env Amount × sustain after the decay. The engine schedules these points.
 */
export function filterEnvelope(s: Pick<PartShape, 'attack' | 'decay' | 'sustain' | 'envAmount'>): { peakCents: number; sustainCents: number } {
    const peak = clamp(s.envAmount, -1, 1) * ENV_OCTAVES * 1200;
    return { peakCents: peak, sustainCents: peak * clamp(s.sustain, 0, 1) };
}

/** The filter's response in dB at frequency `f`, for drawing its curve: FILTER_STAGES second-order stages, as the engine uses. */
export function filterResponseDb(type: FilterType, cutoff: number, resonance: number, f: number): number {
    const r = f / cutoff;
    // the curve's peak height (in amplitude) follows the same Q the engine uses
    const q = type === 'bandpass' ? resonanceQ(type, resonance) : Math.pow(10, resonanceQ(type, resonance) / 20);
    const den = Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
    const mag = type === 'highpass' ? (r * r) / den : type === 'bandpass' ? r / q / den : 1 / den;
    return FILTER_STAGES * 20 * Math.log10(Math.max(1e-6, mag));
}

// ---- drive ----------------------------------------------------------------------------------

/**
 * The drive's transfer curve at amount `a` (0–1), x in −1…1. Crunch is exactly the distortion the
 * old Drive knob used (Tone.Distortion at 0.1 + 0.8 a), so older songs sound the same.
 */
export function driveShape(type: DriveType, a: number, x: number): number {
    if (a <= 0) return x;
    if (type === 'warm') {
        const k = 1 + a * 5;
        return Math.tanh(k * x) / Math.tanh(k);
    }
    if (type === 'bitcrush') {
        // 8 bits down to 3: fewer steps, grainier
        const levels = Math.pow(2, 8 - a * 5) / 2;
        return Math.round(x * levels) / levels;
    }
    const k = (0.1 + 0.8 * a) * 100;
    const deg = Math.PI / 180;
    return x === 0 ? 0 : ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
}

/** The drive's transfer curve sampled for a WaveShaper. */
export function driveCurve(type: DriveType, a: number, n = 4096): Float32Array {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = driveShape(type, a, (i / (n - 1)) * 2 - 1);
    return c;
}

/**
 * Drive gets louder as it squashes; this pulls it back, so turning it up adds character, not volume.
 * Fitted to the average loudness rise measured through the engine on E-Piano, Bass, Lead and Strings
 * at 25%, 50% and 100% (warm +6.3 / +8.8 / +11.4 dB, crunch +2.0 / +2.7 / +3.8 dB, bitcrush ~0 / 0 / +0.7 dB).
 */
export function driveMakeupDb(type: DriveType, a: number): number {
    if (a <= 0) return 0;
    if (type === 'warm') return -11.4 * Math.pow(a, 0.43);
    if (type === 'crunch') return -3.8 * Math.pow(a, 0.46);
    return -0.7 * Math.pow(a, 3);
}

// ---- older songs ----------------------------------------------------------------------------

/** `preset` scaled by knob `v` the way the old Attack and Release knobs did (0.5 = as designed). */
function legacyTime(preset: number, v: number, lo: number, hi: number): number {
    const p = Math.min(hi, Math.max(lo, preset));
    return v <= 0.5 ? lo * Math.pow(p / lo, v / 0.5) : p * Math.pow(hi / p, (v - 0.5) / 0.5);
}

/**
 * A song saved before the shape: its relative Attack, Release and Brightness knobs (0.5 = as designed)
 * and its Drive effect, as shape overrides that sound the same. Brightness above the middle was a
 * treble lift, which the filter can't do; it's dropped (the part plays as designed there).
 */
export function legacyShape(id: InstrumentId, tone: { attack?: number; release?: number; brightness?: number }, drive: number | undefined): ShapeOverrides {
    const own = defaultShape(id);
    const out: ShapeOverrides = {};
    if (tone.attack !== undefined && tone.attack !== 0.5) out.attack = legacyTime(own.attack, tone.attack, 0.001, Math.max(2, own.attack * 4));
    if (tone.release !== undefined && tone.release !== 0.5) out.release = legacyTime(own.release, tone.release, 0.02, Math.max(5, own.release * 4));
    if (tone.brightness !== undefined && tone.brightness < 0.5) out.cutoff = 300 * Math.pow(CUTOFF_MAX / 300, tone.brightness / 0.5);
    if (drive && drive > 0) {
        out.driveType = 'crunch';
        out.drive = clamp(drive, 0, 1);
    }
    return out;
}

/** Shape overrides from untrusted storage: unknown keys dropped, numbers clamped to their range. */
export function readShape(v: unknown): ShapeOverrides {
    if (typeof v !== 'object' || v === null) return {};
    const o = v as Record<string, unknown>;
    const out: ShapeOverrides = {};
    for (const k of Object.keys(KNOBS) as ShapeKnob[]) {
        const x = o[k];
        if (typeof x === 'number' && Number.isFinite(x)) out[k] = clamp(x, KNOBS[k].min, KNOBS[k].max);
    }
    if (FILTER_TYPES.includes(o.filterType as FilterType)) out.filterType = o.filterType as FilterType;
    if (DRIVE_TYPES.includes(o.driveType as DriveType)) out.driveType = o.driveType as DriveType;
    if (LFO_RATES.includes(o.lfoRate as LfoRate)) out.lfoRate = o.lfoRate as LfoRate;
    return out;
}
