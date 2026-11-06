import React, { useEffect, useRef } from 'react';

/** Anything that hands out the latest waveform (a Tone.Analyser in 'waveform' mode). */
export interface WaveSource {
    getValue(): Float32Array | Float32Array[];
}

/**
 * A live waveform of one part: what it sounds like right now, after its shape and effects. Starts on a
 * rising zero crossing so a held note stands still instead of scrolling, and scales to the recent peak
 * so quiet parts show their shape too (it shows the shape, not the level). Silence is a flat line.
 */
const Scope: React.FC<{ source: () => WaveSource | null; color: string; label: string }> = ({ source, color, label }) => {
    const canvas = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let raf = 0;
        /** The recent peak, falling slowly, for auto-scaling. */
        let level = 0;
        const draw = () => {
            raf = requestAnimationFrame(draw);
            const c = canvas.current;
            const ctx = c?.getContext('2d');
            if (!c || !ctx) return;
            const dpr = window.devicePixelRatio || 1;
            const w = c.clientWidth;
            const h = c.clientHeight;
            if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
                c.width = Math.round(w * dpr);
                c.height = Math.round(h * dpr);
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const styles = getComputedStyle(c);
            ctx.strokeStyle = styles.getPropertyValue('--line').trim() || '#333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();

            const raw = source()?.getValue();
            const data = Array.isArray(raw) ? raw[0] : raw;
            if (!data || data.length === 0) return;
            let start = 0;
            for (let i = 1; i < data.length / 2; i++) {
                if (data[i - 1] < 0 && data[i] >= 0) { start = i; break; }
            }
            const n = Math.min(data.length - start, 512);
            // auto-scale to the recent peak, so a quiet part shows its shape too; silence stays flat
            let peak = 0;
            for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
            level = Math.max(peak, level * 0.97);
            const gain = level < 0.0005 ? 0 : 0.9 / level;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const x = (i / (n - 1)) * w;
                const y = h / 2 - Math.max(-1, Math.min(1, data[start + i] * gain)) * (h / 2 - 3);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [source, color]);

    return (
        <figure className="shape-graph scope">
            <canvas ref={canvas} role="img" aria-label={`${label}: live waveform`} />
            <figcaption>Scope <span>what it sounds like right now · play something</span></figcaption>
        </figure>
    );
};

export default Scope;
