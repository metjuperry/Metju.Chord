import { describe, it, expect, vi, afterEach } from 'vitest';
import { haptic, setHapticsEnabled, hapticsSupported } from './haptics';

afterEach(() => {
    vi.unstubAllGlobals();
    setHapticsEnabled(true);
});

describe('haptics', () => {
    it('uses the Vibration API with a distinct pattern per action (Android)', () => {
        const vibrate = vi.fn((_pattern: number | number[]) => true);
        vi.stubGlobal('navigator', { vibrate, userAgent: 'Android', platform: 'Linux', maxTouchPoints: 5 });
        haptic('press'); haptic('tick'); haptic('release'); haptic('lock');
        expect(vibrate.mock.calls.map(c => c[0])).toEqual([14, 8, 5, [10, 45, 14]]);
        expect(hapticsSupported()).toBe(true);
    });

    it('does nothing when switched off', () => {
        const vibrate = vi.fn((_pattern: number | number[]) => true);
        vi.stubGlobal('navigator', { vibrate, userAgent: 'Android', platform: 'Linux', maxTouchPoints: 5 });
        setHapticsEnabled(false);
        haptic('press');
        expect(vibrate).not.toHaveBeenCalled();
    });

    it('is a silent no-op where nothing is supported (desktop Safari, Firefox)', () => {
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 });
        expect(hapticsSupported()).toBe(false);
        expect(() => haptic('press')).not.toThrow();
    });

    it('never lets a failing vibrate call break playing', () => {
        vi.stubGlobal('navigator', { vibrate: () => { throw new Error('blocked'); }, userAgent: 'Android', platform: 'Linux', maxTouchPoints: 5 });
        expect(() => haptic('tick')).not.toThrow();
    });
});
