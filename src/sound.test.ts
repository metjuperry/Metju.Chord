import { describe, it, expect } from 'vitest';
import {
    KNOBS, ShapeKnob, defaultShape, driveCurve, driveMakeupDb, driveShape, effectiveShape, filterEnvelope, filterResponseDb,
    fromKnob, legacyShape, lfoRange, readShape, resonanceQ, shapeText, toKnob, SYNTH_ENVELOPES, SAMPLE_ENVELOPES,
} from './sound';

describe('a part\'s shape', () => {
    it('is the instrument\'s own when untouched: its envelope, an open filter, no drive', () => {
        expect(defaultShape('pluck')).toMatchObject({ ...SYNTH_ENVELOPES.pluck, cutoff: 20000, resonance: 0, envAmount: 0, lfoDepth: 0, drive: 0 });
        // sampled instruments: the samples' envelope (what's heard once they load)
        expect(defaultShape('piano')).toMatchObject(SAMPLE_ENVELOPES.piano);
    });

    it('puts the part\'s changes on top of the instrument\'s own', () => {
        const s = effectiveShape('lead', { cutoff: 800, attack: 0.5 });
        expect([s.cutoff, s.attack, s.release]).toEqual([800, 0.5, SYNTH_ENVELOPES.lead.release]);
    });
});

describe('knobs', () => {
    const keys = Object.keys(KNOBS) as ShapeKnob[];

    it('map 0–1 to the whole range and back', () => {
        for (const k of keys) {
            expect(fromKnob(k, 0)).toBeCloseTo(KNOBS[k].min);
            expect(fromKnob(k, 1)).toBeCloseTo(KNOBS[k].max);
            for (const p of [0.1, 0.37, 0.5, 0.8]) expect(toKnob(k, fromKnob(k, p))).toBeCloseTo(p);
        }
    });

    it('spread time and frequency so every part of the knob moves the sound', () => {
        // a quarter turn of Attack is ~8 ms, the middle ~60 ms, three quarters ~0.5 s: each audibly different
        expect(fromKnob('attack', 0.25)).toBeGreaterThan(0.005);
        expect(fromKnob('attack', 0.25)).toBeLessThan(0.02);
        expect(fromKnob('attack', 0.5)).toBeGreaterThan(0.04);
        expect(fromKnob('attack', 0.75)).toBeGreaterThan(0.3);
        // Cutoff: the middle is ~630 Hz, three quarters ~2.5 kHz, where instruments' sound actually is
        expect(fromKnob('cutoff', 0.5)).toBeGreaterThan(550);
        expect(fromKnob('cutoff', 0.5)).toBeLessThan(700);
        expect(fromKnob('cutoff', 0.75)).toBeGreaterThan(2000);
        expect(toKnob('cutoff', 20000)).toBe(1);
    });

    it('read as times, frequencies, octaves and percentages', () => {
        expect(shapeText('attack', 0.012)).toBe('12 ms');
        expect(shapeText('release', 2.34)).toBe('2.3 s');
        expect(shapeText('cutoff', 20000)).toBe('open');
        expect(shapeText('cutoff', 2400)).toBe('2.4 kHz');
        expect(shapeText('cutoff', 350)).toBe('350 Hz');
        expect(shapeText('envAmount', 0)).toBe('off');
        expect(shapeText('envAmount', 0.4)).toBe('+2 oct');
        expect(shapeText('envAmount', -0.2)).toBe('-1 oct');
        expect(shapeText('drive', 0)).toBe('off');
        expect(shapeText('resonance', 0.5)).toBe('50%');
    });
});

describe('filter', () => {
    it('has no peak at zero resonance and a strong one at full', () => {
        expect(resonanceQ('lowpass', 0)).toBe(0.5);
        expect(resonanceQ('lowpass', 1)).toBe(11);
        expect(filterResponseDb('lowpass', 1000, 0, 1000)).toBeLessThan(1.5);
        expect(filterResponseDb('lowpass', 1000, 1, 1000)).toBeGreaterThan(18);
    });

    it('passes lows (low-pass), highs (high-pass) or a band', () => {
        expect(filterResponseDb('lowpass', 1000, 0, 100)).toBeGreaterThan(-1);
        expect(filterResponseDb('lowpass', 1000, 0, 10000)).toBeLessThan(-70);
        expect(filterResponseDb('highpass', 1000, 0, 100)).toBeLessThan(-30);
        expect(filterResponseDb('highpass', 1000, 0, 10000)).toBeGreaterThan(-1);
        expect(filterResponseDb('bandpass', 1000, 0.5, 1000)).toBeGreaterThan(filterResponseDb('bandpass', 1000, 0.5, 4000) + 10);
    });

    it('moves with the envelope (up to ±5 octaves) and the LFO (up to ±3)', () => {
        expect(filterEnvelope({ attack: 0, decay: 0.2, sustain: 0.5, envAmount: 1 })).toEqual({ peakCents: 6000, sustainCents: 3000 });
        expect(filterEnvelope({ attack: 0, decay: 0.2, sustain: 0.5, envAmount: -0.5 }).peakCents).toBe(-3000);
        expect(lfoRange({ cutoff: 1000, lfoDepth: 0 })).toEqual({ min: 1000, max: 1000 });
        expect(lfoRange({ cutoff: 1000, lfoDepth: 1 })).toEqual({ min: 125, max: 8000 });
        expect(lfoRange({ cutoff: 15000, lfoDepth: 1 }).max).toBe(20000);
    });
});

describe('drive', () => {
    it('is clean at 0 and stays within −1…1', () => {
        for (const t of ['warm', 'crunch', 'bitcrush'] as const) {
            expect(driveShape(t, 0, 0.3)).toBe(0.3);
            const c = driveCurve(t, 1, 513);
            expect(Math.max(...c)).toBeLessThanOrEqual(1.0001);
            expect(Math.min(...c)).toBeGreaterThanOrEqual(-1.0001);
        }
    });

    it('warm rounds, crunch squashes hard, bitcrush steps', () => {
        expect(driveShape('warm', 1, 0.3)).toBeGreaterThan(0.6);
        // crunch squashes flatter: a quiet signal comes out nearly as loud as a full one
        const flat = (t: 'warm' | 'crunch') => driveShape(t, 1, 0.1) / driveShape(t, 1, 1);
        expect(flat('crunch')).toBeGreaterThan(flat('warm'));
        const steps = new Set(Array.from(driveCurve('bitcrush', 1, 2049)));
        expect(steps.size).toBeLessThan(10);
        expect(driveMakeupDb('crunch', 0)).toBe(0);
        expect(driveMakeupDb('crunch', 1)).toBeCloseTo(-3.8);
        expect(driveMakeupDb('warm', 1)).toBeCloseTo(-11.4);
    });
});

describe('older songs', () => {
    it('keep their sound: relative knobs become times, low brightness a cutoff, drive becomes crunch', () => {
        expect(legacyShape('pluck', { attack: 0.5, release: 0.5, brightness: 0.5 }, 0)).toEqual({});
        const s = legacyShape('pluck', { attack: 1, release: 0, brightness: 0 }, 0.4);
        expect(s.attack).toBeCloseTo(2);
        expect(s.release).toBeCloseTo(0.02);
        expect(s.cutoff).toBeCloseTo(300);
        expect([s.driveType, s.drive]).toEqual(['crunch', 0.4]);
        // a treble lift (brightness above the middle) has no filter equivalent: left as designed
        expect(legacyShape('pluck', { brightness: 0.9 }, 0)).toEqual({});
    });

    it('read untrusted shapes: unknown keys dropped, numbers clamped', () => {
        expect(readShape({ cutoff: 99999, attack: -1, resonance: 'loud', filterType: 'comb', driveType: 'bitcrush', lfoRate: '8t', evil: 1 }))
            .toEqual({ cutoff: 10000, attack: 0.001, driveType: 'bitcrush', lfoRate: '8t' });
        expect(readShape(null)).toEqual({});
    });
});
