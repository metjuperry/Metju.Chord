import { describe, expect, it } from 'vitest';
import { TAP_KEEP, TAP_RESET_MS, addTap, tapBpm } from './tempo';

const taps = (...at: number[]) => at.reduce<number[]>((t, now) => addTap(t, now), []);

describe('tap tempo', () => {
    it('needs two taps', () => {
        expect(tapBpm([])).toBeNull();
        expect(tapBpm(taps(1000))).toBeNull();
        expect(tapBpm(taps(1000, 1500))).toBe(120);
    });

    it('averages the gaps between the taps', () => {
        // 480, 520, 500 ms: 500 on average
        expect(tapBpm(taps(0, 480, 1000, 1500))).toBe(120);
        expect(tapBpm(taps(0, 600, 1200, 1800))).toBe(100);
    });

    it('keeps only the last few taps, so it follows a change of pace', () => {
        const t = taps(0, 1000, 2000, 3000, 3500, 4000, 4500, 5000);
        expect(t).toHaveLength(TAP_KEEP);
        expect(tapBpm(t)).toBe(120);
    });

    it('starts over after a pause', () => {
        const t = taps(0, 500, 1000, 1000 + TAP_RESET_MS + 1);
        expect(t).toHaveLength(1);
        expect(tapBpm(t)).toBeNull();
        expect(tapBpm(addTap(t, t[0] + 400))).toBe(150);
    });

    it('ignores a clock that went backwards', () => {
        expect(taps(1000, 900)).toEqual([900]);
    });
});
