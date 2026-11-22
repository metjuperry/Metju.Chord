import React, { useEffect, useState } from 'react';
import { FX_HINTS, FX_LABELS, fxText } from '../FxMatrix';
import { INSTRUMENTS } from '../../audio/instruments';
import { BASS_STYLES, Part, PartFx, PartTone, TONE_KEYS, fxAvailable, hasInstrument } from '../../parts';
import { PartsTab, ShapeView } from '../../song';
import { ShapeOverrides } from '../../sound';
import { WaveSource } from '../Scope';
import { AddEffectMenu } from './AddEffectMenu';
import { ChordStyleRow } from './ChordStyleRow';
import { KnobCell } from './KnobCell';
import { Own } from './Own';
import { PartTabs } from './PartTabs';
import { ShapeBlock } from './ShapeBlock';
import { StylePreview } from './StylePreview';
import { VoiceBlock } from './VoiceBlock';
import { useScrollToPressed } from './useScrollToPressed';
import { EFFECT_KEYS, FX_START, KIND_TAG, TONE_HINTS, TONE_LABELS, WAVES, toneText } from './labels';

interface PartDetailProps {
    part: Part;
    isPadPart: boolean;
    canRemove: boolean;
    onPadPart: () => void;
    onRemove: () => void;
    onUpdate: (patch: Partial<Part>) => void;
    onTone: (key: keyof PartTone, value: number) => void;
    onShape: (patch: ShapeOverrides, key: string) => void;
    onShapeReset: () => void;
    shapeView: ShapeView;
    onShapeView: (v: ShapeView) => void;
    scope: () => WaveSource | null;
    onFx: (key: keyof PartFx, value: number) => void;
    /** Drums: jump to Song with this part's beat open. */
    onOpenBeat: () => void;
    /** Phones: the detail is split into Sound · Shape · Effects, one at a time. */
    compact: boolean;
    tab: PartsTab;
    onTab: (tab: PartsTab) => void;
    /** With a section open and this part sounding its own way there: back to the song's sound. */
    onUseSongSound?: () => void;
}

export const PartDetail: React.FC<PartDetailProps> = ({ part, isPadPart, canRemove, onPadPart, onRemove, onUpdate, onTone, onShape, onShapeReset, shapeView, onShapeView, scope, onFx, onOpenBeat, compact, tab: tabSetting, onTab, onUseSongSound }) => {
    // Effects stay on screen while you turn them (even down to 0) and after "+ Effect"; double-tap (0) takes one away
    const [pinned, setPinned] = useState<(keyof PartFx)[]>([]);
    useEffect(() => {
        setPinned([]);
    }, [part.id]);
    const instRow = useScrollToPressed(`${part.id}:${hasInstrument(part) ? part.instrument : ''}`);
    const styleRow = useScrollToPressed(`${part.id}:${part.kind === 'bass' ? part.style : ''}`);

    const effects = EFFECT_KEYS.filter(k => fxAvailable(part.kind, k));
    const shown = effects.filter(k => part.fx[k] > 0 || pinned.includes(k));
    const off = effects.filter(k => !shown.includes(k));
    const setFx = (k: keyof PartFx, v: number) => {
        // a jump to 0 (double-tap, Delete) takes the effect off the screen; a drag down to 0 leaves it there
        if (v <= 0 && part.fx[k] > 0.05) setPinned(ps => ps.filter(x => x !== k));
        onFx(k, v);
    };
    // drums have no shape: their Shape tab isn't there, and a remembered Shape shows Sound
    const tabs: PartsTab[] = hasInstrument(part) ? ['sound', 'shape', 'effects'] : ['sound', 'effects'];
    const tab = tabs.includes(tabSetting) ? tabSetting : 'sound';
    const showing = (t: PartsTab) => !compact || tab === t;

    return (
        <section className={`part-detail panel ${compact ? `tabbed tab-${tab}` : ''}`} aria-label={`${part.name}: sound`} style={{ '--track': part.color } as React.CSSProperties}>
            <div className="pd-head">
                <span className="pd-dot" aria-hidden="true" />
                <h2 className="pd-name">{part.name}</h2>
                {compact ? <PartTabs id={part.id} tabs={tabs} tab={tab} onTab={onTab} /> : <span className="pd-kind">{KIND_TAG[part.kind]}</span>}
                <span className="pd-space" />
                {onUseSongSound && (
                    <button
                        className="chip-button pd-song-sound"
                        title="Take back what this section sets its own way for this part (undoable)"
                        aria-label={compact ? "Use the song's sound" : undefined}
                        onClick={onUseSongSound}
                    >
                        {compact ? '↺ Song' : "Use the song's sound"}
                    </button>
                )}
                {part.kind === 'chords' && (
                    <button
                        className="chip-button pd-pads"
                        aria-pressed={isPadPart}
                        title={isPadPart ? 'The pads play through this part' : 'Make the pads play through this part'}
                        aria-label={compact ? 'Pads play this part' : undefined}
                        onClick={onPadPart}
                    >
                        {compact ? 'Pads' : 'Pads play this part'}
                    </button>
                )}
                {canRemove && (
                    <button className="pd-remove" aria-label={`Remove ${part.name}`} title="Remove part (undoable)" onClick={onRemove}>×</button>
                )}
            </div>

            <div
                className="pd-body"
                {...(compact ? { role: 'tabpanel', id: `pp-${part.id}`, 'aria-labelledby': `pt-${part.id}-${tab}` } : {})}
            >
            {showing('sound') && (<>
            {part.kind === 'voice' ? (
                <VoiceBlock part={part} onUpdate={patch => onUpdate(patch as Partial<Part>)} />
            ) : hasInstrument(part) ? (
                <div className="pd-block">
                    <span className="pd-label" id={`inst-${part.id}`}>Instrument</span>
                    <div className="inst-row" role="group" aria-labelledby={`inst-${part.id}`} ref={instRow}>
                        {INSTRUMENTS.map(({ id, label }) => (
                            <button key={id} className="inst-tile" aria-pressed={part.instrument === id} onClick={() => onUpdate({ instrument: id } as Partial<Part>)}>
                                <svg width="26" height="12" viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={WAVES[id]} /></svg>
                                <span>{label}</span>
                                <Own k="instrument" when={part.instrument === id} />
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="pd-block">
                    <span className="pd-label">Kit</span>
                    <div className="kit-row">
                        <span className="kit-tile">808 / 909 synth kit</span>
                        <span className="section-note">The beat is written in Song.</span>
                        <button className="chip-button small-chip" onClick={onOpenBeat}>Open the beat</button>
                    </div>
                </div>
            )}

            {part.kind === 'chords' && <ChordStyleRow style={part} onChange={patch => onUpdate(patch as Partial<Part>)} />}

            {part.kind === 'bass' && (
                <div className="pd-block">
                    <span className="pd-label">Style</span>
                    <div className="pd-style">
                        <div className="bass-row" role="radiogroup" aria-label="Bass style" ref={styleRow}>
                            {BASS_STYLES.map(s => (
                                <button key={s.id} role="radio" aria-checked={part.style === s.id} className="bass-tile" title={s.hint} onClick={() => onUpdate({ style: s.id } as Partial<Part>)}>
                                    <StylePreview style={s.id} />
                                    <span>{s.label}</span>
                                    <Own k="style" when={part.style === s.id} />
                                </button>
                            ))}
                        </div>
                        <div className="segmented small-seg" role="group" aria-label="Bass octave">
                            {[1, 2, 3].map(o => (
                                <button key={o} aria-pressed={part.octave === o} onClick={() => onUpdate({ octave: o } as Partial<Part>)}>C{o}<Own k="octave" when={part.octave === o} /></button>
                            ))}
                        </div>
                    </div>
                    <p className="section-note pd-hint">{BASS_STYLES.find(s => s.id === part.style)?.label}: {BASS_STYLES.find(s => s.id === part.style)?.hint}.</p>
                </div>
            )}

            {part.kind === 'melody' && (
                <div className="pd-block">
                    <span className="pd-label">Range</span>
                    <div className="pd-style">
                        <div className="segmented small-seg" role="group" aria-label="Melody octave">
                            {[3, 4, 5].map(o => (
                                <button key={o} aria-pressed={part.octave === o} onClick={() => onUpdate({ octave: o } as Partial<Part>)}>C{o}<Own k="octave" when={part.octave === o} /></button>
                            ))}
                        </div>
                        <span className="section-note">two octaves of the key from C{part.octave} up · the notes are written in Song</span>
                    </div>
                </div>
            )}

            </>)}

            {showing('shape') && hasInstrument(part) && (
                <ShapeBlock part={part} view={shapeView} onView={onShapeView} onShape={onShape} onReset={onShapeReset} scope={scope} graphs={!compact || shapeView === 'advanced'} />
            )}

            {(showing('shape') || showing('effects')) && (
            <div className="pd-knobs">
                {showing('shape') && hasInstrument(part) && (
                    <div className="knob-group" role="group" aria-label={`${part.name} tone`}>
                        <span className="pd-label">Tone</span>
                        <div className="knob-row">
                            {TONE_KEYS.map(k => (
                                <KnobCell
                                    key={k}
                                    label={TONE_LABELS[k]}
                                    aria={`${part.name} ${TONE_LABELS[k]}`}
                                    title={TONE_HINTS[k]}
                                    value={part.tone[k]}
                                    display={toneText(k, part.tone[k])}
                                    color={part.color}
                                    on={Math.abs(part.tone[k] - 0.5) > 0.01}
                                    resetTo={0.5}
                                    own={`tone.${k}`}
                                    onChange={v => onTone(k, v)}
                                />
                            ))}
                            <KnobCell
                                label="Glide"
                                aria={`${part.name} Glide`}
                                title={FX_HINTS.glide}
                                value={part.fx.glide}
                                display={fxText('glide', part.fx.glide)}
                                color={part.color}
                                on={part.fx.glide > 0}
                                offAtZero
                                own="fx.glide"
                                onChange={v => onFx('glide', v)}
                            />
                        </div>
                    </div>
                )}
                {showing('effects') && (
                <div className="knob-group" role="group" aria-label={`${part.name} effects`}>
                    <span className="pd-label">Effects{part.kind === 'drums' ? ' · sends' : ''}</span>
                    <div className="knob-row">
                        {shown.map(k => (
                            <KnobCell
                                key={k}
                                label={FX_LABELS[k]}
                                aria={`${part.name} ${FX_LABELS[k].replace('→ ', '')}`}
                                title={`${FX_HINTS[k]} · double-tap to remove`}
                                value={part.fx[k]}
                                display={fxText(k, part.fx[k])}
                                color={part.color}
                                on={part.fx[k] > 0}
                                offAtZero
                                own={`fx.${k}`}
                                onPointerDown={() => setPinned(ps => (ps.includes(k) ? ps : [...ps, k]))}
                                onChange={v => setFx(k, v)}
                            />
                        ))}
                        <AddEffectMenu
                            off={off}
                            onAdd={k => {
                                setPinned(ps => [...ps, k]);
                                onFx(k, FX_START[k]);
                            }}
                        />
                        {shown.length === 0 && off.length === 0 && <span className="section-note">—</span>}
                    </div>
                </div>
                )}
            </div>
            )}
            </div>
        </section>
    );
};
