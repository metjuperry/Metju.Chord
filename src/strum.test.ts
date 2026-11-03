import { describe, it, expect } from 'vitest';
import { PPQ } from './progression';
import { STRUM_PATTERNS, STRUM_SLOT, liveStroke, nearestSpread, strokeNotes, strumStrokes, strumVoicing } from './strum';

const BAR = 4 * PPQ;
const asText = (pattern: Parameters<typeof strumStrokes>[0], start = 0, end = BAR, bar = BAR) => {
    const slots = Array.from({ length: Math.round((end - start) / STRUM_SLOT) }, () => '-');
    strumStrokes(pattern, start, end, bar).forEach(k => (slots[Math.round((k.at - start) / STRUM_SLOT)] = k.down ? 'D' : 'U'));
    return slots.join('');
};

describe('strum patterns', () => {
    it('play their strokes through a 4/4 bar', () => {
        for (const p of STRUM_PATTERNS) {
            if (p.id === 'once') continue;
            // a chord always starts with a down stroke, whatever the pattern has there
            expect(asText(p.id)).toBe('D' + p.strokes.slice(1));
        }
        expect(asText('once')).toBe('D-------');
    });

    it('line up to the bar, not the chord, and always strike where a chord starts', () => {
        // a chord on beat 3 of a Pop bar: a down where it starts, then the bar's second half
        expect(asText('pop', 2 * PPQ, BAR)).toBe('D' + 'UDU');
        // two bars long: the pattern starts again at the bar line, accented there
        const two = strumStrokes('beats', 0, 2 * BAR, BAR);
        expect(two.map(k => k.at / PPQ)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(two.filter(k => k.accent).map(k => k.at / PPQ)).toEqual([0, 4]);
    });

    it('cut the pattern at the bar line in 3/4', () => {
        expect(asText('pop', 0, 3 * PPQ, 3 * PPQ)).toBe('D-DU-U');
    });

    it('give a chord shorter than a slot just its first stroke', () => {
        expect(strumStrokes('eighths', 0, STRUM_SLOT / 2, BAR)).toHaveLength(1);
    });
});

describe('strum voicing and strokes', () => {
    it('widens a triad to 5 notes and a 7th chord to 5, keeping the chord', () => {
        expect(strumVoicing([60, 64, 67])).toEqual([60, 64, 67, 72, 76]);
        expect(strumVoicing([60, 64, 67, 71])).toEqual([60, 64, 67, 71, 72]);
        expect(strumVoicing([60])).toEqual([60]);
    });

    it('down strokes play everything low to high; up strokes the top three, high to low, faster and lighter', () => {
        const v = strumVoicing([60, 64, 67]);
        const down = strokeNotes(v, 0.05, true, true);
        expect(down.midi).toEqual(v);
        expect(down.offsets[0]).toBe(0);
        expect(down.offsets[4]).toBeCloseTo(0.05);
        const up = strokeNotes(v, 0.05, false);
        expect(up.midi).toEqual([67, 72, 76]);
        expect(up.offsets[2]).toBe(0);
        expect(up.offsets[0]).toBeCloseTo(0.05 * 0.55);
        expect(up.velocity).toBeLessThan(strokeNotes(v, 0.05, true).velocity);
        expect(strokeNotes(v, 0.05, true).velocity).toBeLessThan(down.velocity);
    });

    it('live strokes from the pads follow the direction, alternating per press', () => {
        const c = [60, 64, 67];
        expect(liveStroke(c, 0.035, 'down', 1).midi).toHaveLength(5);
        expect(liveStroke(c, 0.035, 'up', 0).midi).toHaveLength(3);
        expect([0, 1, 2].map(i => liveStroke(c, 0.035, 'alternate', i).midi.length)).toEqual([5, 3, 5]);
    });

    it('snaps old spreads to the nearest speed offered', () => {
        expect([0.012, 0.025, 0.04, 0.06, 0.1].map(nearestSpread)).toEqual([0.02, 0.02, 0.035, 0.05, 0.08]);
    });
});
