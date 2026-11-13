import { describe, it, expect } from 'vitest';
import { SYNC_OFFSET_MAX, defaultSync, pulseTime, readSync, windowPulses } from './sync';

describe('sync out settings', () => {
    it('is off by default', () => {
        expect(defaultSync()).toEqual({ on: false, offset: 0, invert: false, length: 20 });
    });

    it('reads untrusted storage, falling back field by field', () => {
        expect(readSync(null)).toEqual(defaultSync());
        expect(readSync('on')).toEqual(defaultSync());
        expect(readSync({ on: true, offset: 12.4, invert: true })).toEqual({ on: true, offset: 12, invert: true, length: 20 });
        expect(readSync({ length: 5 }).length).toBe(5);
        expect(readSync({ length: 7 }).length).toBe(20);
        expect(readSync({ on: 'yes', offset: 'late', invert: 1 })).toEqual(defaultSync());
        expect(readSync({ on: true, offset: 999 }).offset).toBe(SYNC_OFFSET_MAX);
        expect(readSync({ on: true, offset: -999 }).offset).toBe(-SYNC_OFFSET_MAX);
        expect(readSync({ offset: NaN }).offset).toBe(0);
    });
});

describe('sync pulses', () => {
    it('pulses 2 times per quarter note: every other 1/16 window, from the first', () => {
        const pulses = Array.from({ length: 16 }, (_, i) => i).filter(i => windowPulses(i));
        expect(pulses).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    });

    it('shifts a pulse by the offset but never into the past', () => {
        expect(pulseTime(10, 20, 9.9)).toBeCloseTo(10.02);
        expect(pulseTime(10, -20, 9.9)).toBeCloseTo(9.98);
        expect(pulseTime(10, -50, 9.97)).toBe(9.97);
    });
});
