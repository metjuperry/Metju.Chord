import { describe, expect, it } from 'vitest';
import { PART_COLORS } from './parts';
import { PANEL, ShadeTheme, labelShade, labelShades } from './shades';

const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lightness = (hex: string) => { const c = rgb(hex); return (Math.max(...c) + Math.min(...c)) / 2 / 255; };
const lum = (hex: string) => {
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = rgb(hex).map(c => lin(c / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
const THEMES: ShadeTheme[] = ['light', 'dark'];

describe('labelShades', () => {
    it('gives seven distinct shades per part colour and theme, deepest on the root, lighter up the scale', () => {
        for (const theme of THEMES) {
            for (const color of PART_COLORS) {
                const shades = labelShades(color, theme);
                expect(shades).toHaveLength(7);
                expect(new Set(shades).size).toBe(7);
                const ls = shades.map(lightness);
                for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1]);
            }
        }
    });

    it('keeps every label readable on its theme’s panel (at least 4.5:1)', () => {
        for (const theme of THEMES) {
            for (const color of PART_COLORS) {
                for (const shade of labelShades(color, theme)) {
                    expect(contrast(shade, PANEL[theme])).toBeGreaterThanOrEqual(4.5);
                }
            }
        }
    });

    it('keeps the part hue (a green melody stays green)', () => {
        const [r, g, b] = rgb(labelShade('#c8e06e', 3, 'light'));
        expect(g).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b);
    });

    it('wraps every octave and accepts negative degrees', () => {
        expect(labelShade('#7fb4ff', 7, 'dark')).toBe(labelShade('#7fb4ff', 0, 'dark'));
        expect(labelShade('#7fb4ff', -1, 'light')).toBe(labelShade('#7fb4ff', 6, 'light'));
    });

    it('survives a malformed colour', () => {
        expect(labelShade('nonsense', 2, 'light')).toMatch(/^#[0-9a-f]{6}$/);
    });
});
