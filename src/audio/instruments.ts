import * as Tone from 'tone';

export type InstrumentId = 'pad' | 'epiano' | 'organ' | 'pluck' | 'lead';

export const INSTRUMENTS: { id: InstrumentId; label: string }[] = [
    { id: 'pad', label: 'Pad' },
    { id: 'epiano', label: 'E-Piano' },
    { id: 'organ', label: 'Organ' },
    { id: 'pluck', label: 'Pluck' },
    { id: 'lead', label: 'Lead/Bass' },
];

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
            synth.volume.value = -15;
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
            synth.volume.value = -13;
            return { synth, output: synth, nodes: [synth] };
        }
        case 'organ': {
            const synth = new Tone.PolySynth(Tone.AMSynth, {
                harmonicity: 2,
                oscillator: { type: 'sine' },
                modulation: { type: 'square' },
                envelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.08 },
            } as Partial<Tone.AMSynthOptions>);
            synth.volume.value = -15;
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
            synth.volume.value = -12;
            const filter = new Tone.Filter(3500, 'lowpass');
            synth.connect(filter);
            return { synth, output: filter, nodes: [synth, filter] };
        }
        case 'lead':
        default: {
            const synth = new Tone.PolySynth(Tone.MonoSynth, {
                oscillator: { type: 'square' },
                filter: { Q: 2 },
                filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, baseFrequency: 200, octaves: 3 },
            } as Partial<Tone.MonoSynthOptions>);
            synth.volume.value = -16;
            return { synth, output: synth, nodes: [synth] };
        }
    }
}
