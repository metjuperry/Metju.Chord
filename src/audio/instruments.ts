import * as Tone from 'tone';

export type InstrumentId =
    | 'pad' | 'epiano' | 'organ' | 'pluck' | 'lead'
    | 'strings' | 'warmpad' | 'brass' | 'drawbar' | 'bells' | 'mallets' | 'chip' | 'bass';

/** `sustains`: the note holds while the key is down (used for level matching; plucked/struck sounds decay). */
export const INSTRUMENTS: { id: InstrumentId; label: string; sustains: boolean }[] = [
    { id: 'epiano', label: 'E-Piano', sustains: true },
    { id: 'pad', label: 'Pad', sustains: true },
    { id: 'warmpad', label: 'Warm Pad', sustains: true },
    { id: 'strings', label: 'Strings', sustains: true },
    { id: 'organ', label: 'Organ', sustains: true },
    { id: 'drawbar', label: 'Drawbar', sustains: true },
    { id: 'brass', label: 'Brass', sustains: true },
    { id: 'lead', label: 'Lead', sustains: true },
    { id: 'bass', label: 'Bass', sustains: true },
    { id: 'chip', label: 'Chiptune', sustains: true },
    { id: 'pluck', label: 'Pluck', sustains: false },
    { id: 'mallets', label: 'Mallets', sustains: false },
    { id: 'bells', label: 'Bells', sustains: false },
];

/** Output level per instrument in dB, matched with `npm run levels`. */
const VOLUMES: { [id in InstrumentId]: number } = {
    pad: -6, epiano: 3.5, organ: 3.5, pluck: -7, lead: -14,
    strings: -8, warmpad: 11, brass: -10, drawbar: -6, bells: 0, mallets: 0, chip: -12, bass: -4,
};

export interface Instrument {
    synth: Tone.PolySynth;
    /** Last node of the instrument's own signal path; connect this to the effects bus. */
    output: Tone.ToneAudioNode;
    /** Everything to dispose with the synth. */
    nodes: Tone.ToneAudioNode[];
}

/**
 * Builds a voice (synth plus any per-instrument filter/chorus). `volume` leaves
 * headroom for chords: velocity is additionally scaled by 1/sqrt(voices) at trigger time.
 */
export function createInstrument(id: InstrumentId): Instrument {
    switch (id) {
        case 'pad': {
            const synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
                envelope: { attack: 0.08, decay: 0.3, sustain: 0.7, release: 1.5 },
            } as Partial<Tone.SynthOptions>);
            synth.volume.value = VOLUMES.pad;
            const filter = new Tone.Filter(2200, 'lowpass');
            synth.connect(filter);
            return { synth, output: filter, nodes: [synth, filter] };
        }
        case 'epiano': {
            const synth = new Tone.PolySynth(Tone.FMSynth, {
                harmonicity: 3,
                modulationIndex: 10,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.005, decay: 1.2, sustain: 0.2, release: 1 },
                modulation: { type: 'sine' },
                modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.1, release: 0.5 },
            } as Partial<Tone.FMSynthOptions>);
            synth.volume.value = VOLUMES.epiano;
            return { synth, output: synth, nodes: [synth] };
        }
        case 'organ': {
            const synth = new Tone.PolySynth(Tone.AMSynth, {
                harmonicity: 2,
                oscillator: { type: 'sine' },
                modulation: { type: 'square' },
                envelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.08 },
            } as Partial<Tone.AMSynthOptions>);
            synth.volume.value = VOLUMES.organ;
            const chorus = new Tone.Chorus(4, 2.5, 0.3).start();
            chorus.wet.value = 0.35;
            synth.connect(chorus);
            return { synth, output: chorus, nodes: [synth, chorus] };
        }
        case 'pluck': {
            const synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.4 },
            } as Partial<Tone.SynthOptions>);
            synth.volume.value = VOLUMES.pluck;
            const filter = new Tone.Filter(3500, 'lowpass');
            synth.connect(filter);
            return { synth, output: filter, nodes: [synth, filter] };
        }
        case 'strings': {
            // Detuned saws with a slow bow-like attack, darkened and given a gentle vibrato
            const synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'fatsawtooth', count: 5, spread: 30 },
                envelope: { attack: 0.35, decay: 0.2, sustain: 0.9, release: 1.6 },
            } as Partial<Tone.SynthOptions>);
            synth.volume.value = VOLUMES.strings;
            const filter = new Tone.Filter(1800, 'lowpass');
            const vibrato = new Tone.Vibrato(5, 0.06);
            synth.chain(filter, vibrato);
            return { synth, output: vibrato, nodes: [synth, filter, vibrato] };
        }
        case 'warmpad': {
            const synth = new Tone.PolySynth(Tone.AMSynth, {
                harmonicity: 1.5,
                oscillator: { type: 'fattriangle', count: 3, spread: 15 },
                modulation: { type: 'sine' },
                envelope: { attack: 0.5, decay: 0.3, sustain: 0.9, release: 2.5 },
                modulationEnvelope: { attack: 0.8, decay: 0.2, sustain: 1, release: 2 },
            } as unknown as Partial<Tone.AMSynthOptions>);
            synth.volume.value = VOLUMES.warmpad;
            const filter = new Tone.Filter(1400, 'lowpass');
            synth.connect(filter);
            return { synth, output: filter, nodes: [synth, filter] };
        }
        case 'brass': {
            // The filter opens on the attack and settles back, like a brass swell
            const synth = new Tone.PolySynth(Tone.MonoSynth, {
                oscillator: { type: 'sawtooth' },
                filter: { Q: 1, type: 'lowpass', rolloff: -24 },
                envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 0.3 },
                filterEnvelope: { attack: 0.08, decay: 0.4, sustain: 0.55, release: 0.3, baseFrequency: 300, octaves: 2.6 },
            } as Partial<Tone.MonoSynthOptions>);
            synth.volume.value = VOLUMES.brass;
            return { synth, output: synth, nodes: [synth] };
        }
        case 'drawbar': {
            // Additive "drawbar" mix of harmonics with a rotary-speaker style wobble
            const synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'custom', partials: [1, 0.85, 0.6, 0, 0.45, 0, 0.3, 0.25] },
                envelope: { attack: 0.005, decay: 0, sustain: 1, release: 0.06 },
            } as Partial<Tone.SynthOptions>);
            synth.volume.value = VOLUMES.drawbar;
            const tremolo = new Tone.Tremolo(6.5, 0.25).start();
            const chorus = new Tone.Chorus(6.5, 1.5, 0.25).start();
            chorus.wet.value = 0.4;
            synth.chain(tremolo, chorus);
            return { synth, output: chorus, nodes: [synth, tremolo, chorus] };
        }
        case 'bells': {
            // Inharmonic FM ratio gives a bell/glockenspiel ring
            const synth = new Tone.PolySynth(Tone.FMSynth, {
                harmonicity: 3.01,
                modulationIndex: 14,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 2.5, sustain: 0, release: 2.5 },
                modulation: { type: 'sine' },
                modulationEnvelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1 },
            } as Partial<Tone.FMSynthOptions>);
            synth.volume.value = VOLUMES.bells;
            return { synth, output: synth, nodes: [synth] };
        }
        case 'mallets': {
            // Short woody strike: the modulation dies fast, leaving a soft sine
            const synth = new Tone.PolySynth(Tone.FMSynth, {
                harmonicity: 4,
                modulationIndex: 3,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.001, decay: 0.7, sustain: 0, release: 0.6 },
                modulation: { type: 'sine' },
                modulationEnvelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
            } as Partial<Tone.FMSynthOptions>);
            synth.volume.value = VOLUMES.mallets;
            const filter = new Tone.Filter(4000, 'lowpass');
            synth.connect(filter);
            return { synth, output: filter, nodes: [synth, filter] };
        }
        case 'chip': {
            // 25% pulse wave, like an 8-bit console
            const synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'pulse', width: 0.25 },
                envelope: { attack: 0.002, decay: 0.1, sustain: 0.6, release: 0.08 },
            } as unknown as Partial<Tone.SynthOptions>);
            synth.volume.value = VOLUMES.chip;
            // A 25% pulse carries a DC offset; the high-pass removes it so it can't stack up in the effects
            const dcBlock = new Tone.Filter(40, 'highpass');
            const filter = new Tone.Filter(6000, 'lowpass');
            synth.chain(dcBlock, filter);
            return { synth, output: filter, nodes: [synth, dcBlock, filter] };
        }
        case 'bass': {
            // a round saw bass: the filter opens on each note and settles low, so lines stay punchy but warm
            const synth = new Tone.PolySynth(Tone.MonoSynth, {
                oscillator: { type: 'fatsawtooth', count: 2, spread: 12 },
                envelope: { attack: 0.004, decay: 0.25, sustain: 0.8, release: 0.12 },
                filter: { Q: 1, rolloff: -24 },
                filterEnvelope: { attack: 0.004, decay: 0.2, sustain: 0.35, release: 0.2, baseFrequency: 260, octaves: 2.6 },
            } as unknown as Partial<Tone.MonoSynthOptions>);
            synth.volume.value = VOLUMES.bass;
            const dcBlock = new Tone.Filter(30, 'highpass');
            synth.connect(dcBlock);
            return { synth, output: dcBlock, nodes: [synth, dcBlock] };
        }
        case 'lead':
        default: {
            const synth = new Tone.PolySynth(Tone.MonoSynth, {
                oscillator: { type: 'square' },
                filter: { Q: 2 },
                filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, baseFrequency: 200, octaves: 3 },
            } as Partial<Tone.MonoSynthOptions>);
            synth.volume.value = VOLUMES.lead;
            return { synth, output: synth, nodes: [synth] };
        }
    }
}
