/**
 * Shades of a part's colour for the melody grid's note labels: one per scale degree, so each
 * row's letter has its own tint of the part (a green melody's labels are seven greens).
 *
 * Brightness follows pitch within an octave (the key's root is the deepest shade, each step up
 * the scale is lighter) and repeats in every octave. The range differs per theme so the letters
 * always stay readable on the panel behind them (the range is fitted per colour).
 */

export type ShadeTheme = 'light' | 'dark';

const DEGREES = 7;

/** How far the seven shades spread in lightness (HSL), and the contrast every shade keeps with the panel. */
const SPREAD: Record<ShadeTheme, number> = { light: 0.24, dark: 0.28 };
const MIN_CONTRAST = 4.6;

/** The panel colour each theme's labels sit on (index.css `--panel`). */
export const PANEL: Record<ShadeTheme, string> = { light: '#ffffff', dark: '#161613' };

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

const toHex = (rgb: [number, number, number]) => '#' + rgb.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');

/** WCAG relative luminance (channels 0–1). */
function luminance([r, g, b]: [number, number, number]): number {
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastWith(rgb: [number, number, number], panel: string): number {
    const n = parseInt(panel.slice(1), 16);
    const p = luminance([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
    const c = luminance(rgb);
    return (Math.max(p, c) + 0.05) / (Math.min(p, c) + 0.05);
}

/**
 * The lightness range for a hue and theme: yellows and teals are bright at any lightness and
 * purples dark, so the range is found per colour. On the light panel the lightest shade is the
 * lightest that still reads; on the dark panel the deepest shade is the darkest that still reads.
 */
function rangeFor(h: number, s: number, theme: ShadeTheme): [number, number] {
    const reads = (l: number) => contrastWith(hslToRgb(h, s, l), PANEL[theme]) >= MIN_CONTRAST;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        // light theme: find the largest readable lightness; dark theme: the smallest
        if (theme === 'light' ? reads(mid) : !reads(mid)) lo = mid; else hi = mid;
    }
    const edge = theme === 'light' ? lo : hi;
    return theme === 'light'
        ? [Math.max(0.08, edge - SPREAD.light), edge]
        : [edge, Math.min(0.92, edge + SPREAD.dark)];
}

/** The label colour for scale degree `degree` (any integer; wraps every 7) of `partColor` (#rrggbb). */
export function labelShade(partColor: string, degree: number, theme: ShadeTheme): string {
    const [h, s0] = hexToHsl(partColor);
    // keep the hue; keep enough saturation that the shades still read as the part's colour
    const s = Math.min(Math.max(s0, 0.5), 0.9);
    const d = ((degree % DEGREES) + DEGREES) % DEGREES;
    const [lo, hi] = rangeFor(h, s, theme);
    return toHex(hslToRgb(h, s, lo + ((hi - lo) * d) / (DEGREES - 1)));
}

/** All seven label shades of a part colour for a theme, degree 0 first. */
export const labelShades = (partColor: string, theme: ShadeTheme): string[] =>
    Array.from({ length: DEGREES }, (_, d) => labelShade(partColor, d, theme));
