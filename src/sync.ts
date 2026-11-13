/**
 * Sync out for Pocket Operators (and anything else that follows an audio click on the left channel):
 * while it's on, the app's sound goes out on the right channel only and the left channel carries a
 * pulse 2 times per quarter note (PO sync, SY4 on the PO). These settings belong to the device,
 * not the song: they're kept under their own key, so an opened file or share link never turns them on.
 */

export interface SyncOut {
    on: boolean;
    /** Moves the pulses earlier (negative) or later, in ms, if the PO feels ahead of or behind the music. */
    offset: number;
    /** Negative pulses instead of positive ones, for gear that wants the other polarity. */
    invert: boolean;
    /** How long each pulse is high, in ms (one of PULSE_LENGTHS): some POs (the PO-33) miss short ones. */
    length: number;
}

export const SYNC_KEY = 'metju.chord.sync';
/** Pocket Operators (like Volcas) sync at 2 pulses per quarter note. */
export const SYNC_PPQN = 2;
export const SYNC_OFFSET_MAX = 50;
export const SYNC_OFFSET_STEP = 5;
/** The pulse lengths to pick from, in ms. */
export const PULSE_LENGTHS = [5, 10, 20] as const;

export const defaultSync = (): SyncOut => ({ on: false, offset: 0, invert: false, length: 20 });

/** Sync settings from untrusted storage: anything missing or odd falls back to the default. */
export function readSync(v: unknown): SyncOut {
    const d = defaultSync();
    if (typeof v !== 'object' || v === null) return d;
    const o = v as Record<string, unknown>;
    const offset = typeof o.offset === 'number' && Number.isFinite(o.offset)
        ? Math.max(-SYNC_OFFSET_MAX, Math.min(SYNC_OFFSET_MAX, Math.round(o.offset)))
        : d.offset;
    return {
        on: typeof o.on === 'boolean' ? o.on : d.on,
        offset,
        invert: typeof o.invert === 'boolean' ? o.invert : d.invert,
        length: (PULSE_LENGTHS as readonly unknown[]).includes(o.length) ? (o.length as number) : d.length,
    };
}

export function loadSync(): SyncOut {
    try {
        const raw = localStorage.getItem(SYNC_KEY);
        return raw ? readSync(JSON.parse(raw)) : defaultSync();
    } catch {
        return defaultSync();
    }
}

export function saveSync(s: SyncOut) {
    try {
        localStorage.setItem(SYNC_KEY, JSON.stringify(s));
    } catch {
        // private mode or full storage: the setting just isn't remembered
    }
}

/**
 * Whether the scheduler window with this index (counted from the start of playback, one window per
 * 1/16 note) starts with a sync pulse. Windows are 1/16 notes, so 2 pulses per quarter = every 2nd.
 */
export const windowPulses = (index: number, windowsPerQuarter = 4) => index % (windowsPerQuarter / SYNC_PPQN) === 0;

/** When a pulse due at audio time `time` actually plays: shifted by the offset, never in the past. */
export const pulseTime = (time: number, offsetMs: number, now: number) => Math.max(now, time + offsetMs / 1000);
