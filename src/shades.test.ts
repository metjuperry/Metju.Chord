import { describe, expect, it } from 'vitest';
import { PART_COLORS } from './parts';
import { degreeShade, degreeShades } from './shades';

const lightness = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
};

describe('degreeShades', () => {
    it('gives seven distinct shades per part colour, darkest on the root, lighter up the scale', () => {
        for (const color of PART_COLORS) {
            const shades = degreeShades(color);
            expect(shades).toHaveLength(7);
            expect(new Set(shades.map(s => s.fill)).size).toBe(7);
            const ls = shades.map(s => lightness(s.fill));
            for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1]);
        }
    });

    it('keeps the part hue (a green melody stays green)', () => {
        const fill = degreeShade('#c8e06e', 3).fill;
        const n = parseInt(fill.slice(1), 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        expect(g).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b);
    });

    it('wraps every octave and accepts negative degrees', () => {
        expect(degreeShade('#7fb4ff', 7)).toEqual(degreeShade('#7fb4ff', 0));
        expect(degreeShade('#7fb4ff', -1)).toEqual(degreeShade('#7fb4ff', 6));
    });

    it('picks the ink (black or white) that reads on every shade', () => {
        const lum = (hex: string) => {
            const n = parseInt(hex.slice(1), 16);
            const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
            return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
        };
        const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        for (const color of PART_COLORS) {
            for (const s of degreeShades(color)) {
                const other = s.ink === '#000000' ? '#ffffff' : '#000000';
                expect(contrast(s.fill, s.ink)).toBeGreaterThanOrEqual(contrast(s.fill, other));
                expect(contrast(s.fill, s.ink)).toBeGreaterThanOrEqual(4.5);
            }
            expect(degreeShades(color)[6].ink).toBe('#000000');
        }
    });

    it('survives a malformed colour', () => {
        expect(degreeShade('nonsense', 2).fill).toMatch(/^#[0-9a-f]{6}$/);
    });
});
