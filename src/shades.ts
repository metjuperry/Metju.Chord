/**
 * Shades of a part's colour, one per scale degree, so every row of the melody grid has its own
 * tint of the part (a green melody gets seven greens). Degree 0 (the key's root) is the darkest
 * and each step up the scale is lighter, so brightness follows pitch within an octave and the
 * jump from the lightest back to the darkest marks each new octave.
 */

export interface Shade {
    /** CSS colour of the row. */
    fill: string;
    /** Text colour that reads on `fill` (black or white). */
    ink: string;
}

const DEGREES = 7;
const L_DARK = 0.34;
const L_LIGHT = 0.8;

function hexToHsl(hex: string): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    const n = m ? parseInt(m[1], 16) : 0x888888;
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
}

/** WCAG relative luminance of an sRGB colour (channels 0–1). */
function luminance([r, g, b]: [number, number, number]): number {
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Black or white, whichever contrasts more with the colour. */
function inkFor(rgb: [number, number, number]): string {
    const y = luminance(rgb);
    return (1.05) / (y + 0.05) > (y + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

/** The shade for scale degree `degree` (any integer; wraps every 7) of `partColor` (#rrggbb). */
export function degreeShade(partColor: string, degree: number): Shade {
    const [h, s] = hexToHsl(partColor);
    const d = ((degree % DEGREES) + DEGREES) % DEGREES;
    const l = L_DARK + ((L_LIGHT - L_DARK) * d) / (DEGREES - 1);
    // keep the hue; cap saturation so the darkest shades don't turn muddy-neon
    const sat = Math.min(Math.max(s, 0.45), 0.85);
    const rgb = hslToRgb(h, sat, l);
    const hex = '#' + rgb.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
    return { fill: hex, ink: inkFor(rgb) };
}

/** All seven shades of a part colour, degree 0 first. */
export const degreeShades = (partColor: string): Shade[] =>
    Array.from({ length: DEGREES }, (_, d) => degreeShade(partColor, d));
