/** Tap tempo: a pause this long starts a new count. */
export const TAP_RESET_MS = 2000;
/** How many taps the average runs over (the last few, so it follows you when you speed up). */
export const TAP_KEEP = 5;

/** The taps so far plus one at `now` (ms): only the last few, and starting over after a pause. */
export function addTap(times: number[], now: number): number[] {
    const last = times[times.length - 1];
    const kept = last !== undefined && (now - last > TAP_RESET_MS || now <= last) ? [] : times;
    return [...kept, now].slice(-TAP_KEEP);
}

/** The tempo the taps were at: 60 s over the average gap between them. Null until there are two. */
export function tapBpm(times: number[]): number | null {
    if (times.length < 2) return null;
    const span = times[times.length - 1] - times[0];
    if (span <= 0) return null;
    return Math.round((60000 * (times.length - 1)) / span);
}
