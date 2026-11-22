import React, { useRef } from 'react';
import './SettingsSheet.css';
import { GearIcon } from './TopBar';
import { useDialog } from './useDialog';
import { CHORD_LENGTHS, ChordLength, ThemeSetting } from '../song';
import { PULSE_LENGTHS, SYNC_OFFSET_MAX, SYNC_OFFSET_STEP, SyncOut } from '../sync';

interface SettingsSheetProps {
    open: boolean;
    onClose: () => void;
    theme: ThemeSetting;
    onTheme: (theme: ThemeSetting) => void;
    click: boolean;
    onClick: (on: boolean) => void;
    clickAccent: boolean;
    onClickAccent: (on: boolean) => void;
    /** e.g. "4/4", for the click's description. */
    meter: string;
    nextHint: boolean;
    onNextHint: (on: boolean) => void;
    chordMood: boolean;
    onChordMood: (on: boolean) => void;
    soundPreview: boolean;
    onSoundPreview: (on: boolean) => void;
    chordLength: ChordLength;
    onChordLength: (length: ChordLength) => void;
    sync: SyncOut;
    onSync: (patch: Partial<SyncOut>) => void;
    /** The tempo the PO should be set to (quarter notes per minute, as the PO counts). */
    syncBpm: number;
    /** 4/4: a PO pattern (16 steps) is exactly one bar. */
    syncMeterFits: boolean;
    onHelp: () => void;
    onCredits: () => void;
}

const THEME_LABELS: { id: ThemeSetting; label: string }[] = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'auto', label: 'Auto' },
];

const Toggle: React.FC<{ label: string; desc: string; on: boolean; onChange: (on: boolean) => void }> = ({ label, desc, on, onChange }) => (
    <div className="ss-row">
        <span className="ss-text">
            <span className="ss-title">{label}</span>
            <span className="section-note">{desc}</span>
        </span>
        <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
            <span />
        </button>
    </div>
);

/** ⚙: app settings in a sheet from the right, over whatever mode is showing. */
const SettingsSheet: React.FC<SettingsSheetProps> = p => {
    const sheet = useRef<HTMLDivElement>(null);
    useDialog(sheet, p.open, p.onClose);
    if (!p.open) return null;
    return (
        <div className="ss-backdrop" onClick={p.onClose}>
            <aside
                ref={sheet}
                className="ss-sheet panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ss-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="ss-head">
                    <GearIcon />
                    <h2 id="ss-title">Settings</h2>
                    <span className="ss-space" />
                    <button className="ss-close" aria-label="Close settings" onClick={p.onClose}>×</button>
                </div>

                <div className="ss-row">
                    <span className="ss-title" id="ss-theme">Theme</span>
                    <div className="segmented" role="group" aria-labelledby="ss-theme">
                        {THEME_LABELS.map(t => (
                            <button key={t.id} aria-pressed={p.theme === t.id} title={t.id === 'auto' ? 'Follow the system (light by day, dark at night if it switches)' : undefined} onClick={() => p.onTheme(t.id)}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <Toggle label="Click" desc={`a metronome on every beat · ${p.meter}`} on={p.click} onChange={p.onClick} />
                <Toggle label="Accent the downbeat" desc="the first beat of the bar clicks higher" on={p.clickAccent} onChange={p.onClickAccent} />
                <Toggle label="Next chords on the screen" desc="after each chord, the ones that often follow it in this key" on={p.nextHint} onChange={p.onNextHint} />
                <Toggle label="Chord mood in Play mode" desc="a word for how the chord tends to feel, next to its type (i · 9th · bittersweet)" on={p.chordMood} onChange={p.onChordMood} />
                <Toggle label="Hear sound changes" desc="while the song is stopped, changing a part in Parts plays the key's root on it, on the beat" on={p.soundPreview} onChange={p.onSoundPreview} />

                <div className="ss-row">
                    <span className="ss-text">
                        <span className="ss-title" id="ss-chord-length">Chord length</span>
                        <span className="section-note">how long a chord is when you record it or place it from the chord toolbar</span>
                    </span>
                    <div className="segmented" role="group" aria-labelledby="ss-chord-length">
                        {CHORD_LENGTHS.map(l => (
                            <button key={l.id} aria-pressed={p.chordLength === l.id} onClick={() => p.onChordLength(l.id)}>{l.label}</button>
                        ))}
                    </div>
                </div>

                <div className="ss-rule" />

                <Toggle
                    label="Pocket Operator sync"
                    desc="the left channel becomes a clock for the PO, the sound plays on the right. For a cable into the PO's line in"
                    on={p.sync.on}
                    onChange={on => p.onSync({ on })}
                />
                {p.sync.on && (
                    <div className="ss-sync">
                        <ol className="ss-steps">
                            <li>Headphone out → PO line in. Listen from the PO's output, not from here: the left channel is clicks.</li>
                            <li>On the PO, set <b>SY4</b> (hold the button below knob B, press BPM until it shows SY4).</li>
                            <li>Set the PO's tempo to <b>{p.syncBpm} BPM</b>, press play on the PO, then ▶ here. ■ stops both.</li>
                        </ol>
                        {!p.syncMeterFits && <p className="section-note ss-warn">The song isn't in 4/4, so the PO's 16-step patterns won't line up with its bars.</p>}
                        <div className="ss-row">
                            <span className="ss-text">
                                <span className="ss-title" id="ss-sync-length">Pulse length</span>
                                <span className="section-note">if the PO passes the sound through but its pattern doesn't run, try another (the PO-33 wants long ones)</span>
                            </span>
                            <div className="segmented" role="group" aria-labelledby="ss-sync-length">
                                {PULSE_LENGTHS.map(ms => (
                                    <button key={ms} aria-pressed={p.sync.length === ms} onClick={() => p.onSync({ length: ms })}>{ms} ms</button>
                                ))}
                            </div>
                        </div>
                        <div className="ss-row">
                            <span className="ss-text">
                                <span className="ss-title" id="ss-sync-offset">Pulse timing</span>
                                <span className="section-note">if the PO sounds early or late against the chords</span>
                            </span>
                            <div className="ss-stepper" role="group" aria-labelledby="ss-sync-offset">
                                <button className="tb-step" aria-label="Pulses earlier" disabled={p.sync.offset <= -SYNC_OFFSET_MAX} onClick={() => p.onSync({ offset: p.sync.offset - SYNC_OFFSET_STEP })}>−</button>
                                <span className="ss-offset" aria-live="polite">{p.sync.offset > 0 ? '+' : ''}{p.sync.offset} ms</span>
                                <button className="tb-step" aria-label="Pulses later" disabled={p.sync.offset >= SYNC_OFFSET_MAX} onClick={() => p.onSync({ offset: p.sync.offset + SYNC_OFFSET_STEP })}>+</button>
                            </div>
                        </div>
                        <Toggle label="Flip the pulses" desc="try this if the PO doesn't follow at all" on={p.sync.invert} onChange={invert => p.onSync({ invert })} />
                    </div>
                )}

                <div className="ss-rule" />

                <div className="ss-buttons">
                    <button className="chip-button" onClick={p.onHelp}>How to play</button>
                    <button className="chip-button" onClick={p.onCredits}>Credits</button>
                </div>
                <p className="section-note ss-foot">Saved on this device. Songs (new, open, save, share) live in the Song menu.</p>
            </aside>
        </div>
    );
};

export default SettingsSheet;
