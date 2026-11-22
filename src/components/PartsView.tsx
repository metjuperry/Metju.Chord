import React, { useCallback } from 'react';
import './PartsView.css';
import './FxMatrix.css';
import { MAX_PARTS, InstrumentPart, Part, PartFx, PartKind, PartTone, hasInstrument } from '../parts';
import { PartsTab, ShapeView, Space } from '../song';
import { ShapeOverrides } from '../sound';
import { WaveSource } from './Scope';
import { AddPartMenu } from './parts/AddPartMenu';
import { MasterDetail } from './parts/MasterDetail';
import { OwnContext, ScopeChip } from './parts/Own';
import { PartDetail } from './parts/PartDetail';
import { VolumeBar } from './parts/VolumeBar';
import { KIND_TAG, MASTER, instrumentLabel } from './parts/labels';

// what App and others import from here
export { ARP_RATES, MASTER, instrumentLabel } from './parts/labels';
export type { ChordStyle } from './parts/labels';

interface PartsViewProps {
    parts: Part[];
    space: Space;
    /** A part id or `MASTER`. */
    selected: string;
    onSelect: (id: string) => void;
    padPartId: string;
    onPadPart: (id: string) => void;
    onUpdate: (id: string, patch: Partial<Part>) => void;
    onTone: (id: string, key: keyof PartTone, value: number) => void;
    onShape: (id: string, patch: ShapeOverrides, key: string) => void;
    onShapeReset: (id: string) => void;
    shapeView: ShapeView;
    onShapeView: (v: ShapeView) => void;
    /** Phones: the part's detail in sub-tabs, the last one remembered. */
    compact: boolean;
    tab: PartsTab;
    onTab: (tab: PartsTab) => void;
    /** The selected part's live waveform, for the Advanced scope. */
    scope: (id: string) => WaveSource | null;
    onFx: (id: string, key: keyof PartFx, value: number) => void;
    onSpace: (space: Space) => void;
    onDryAll: () => void;
    onAdd: (kind: PartKind) => void;
    onRemove: (id: string) => void;
    canRemove: (id: string) => boolean;
    onOpenBeat: (id: string) => void;
    /** Where Parts' edits go: the open section's name, and whether they go there only (else the whole song). */
    scopeName: string;
    sectionOnly: boolean;
    onScope: () => void;
    /** With a section open: per part, what that section sets its own way (`ownSoundKeys`); null for the whole song. */
    own: { [partId: string]: Set<string> } | null;
    /** "Use the song's sound": the part's own sound in the open section goes. */
    onUseSongSound: (id: string) => void;
}

/** What a part sounds like, in a word: its instrument, "Ooh" for a voice, the kit for drums. */
export const subLabel = (p: Part) => (p.kind === 'voice' ? 'Ooh' : hasInstrument(p) ? instrumentLabel((p as InstrumentPart).instrument) : '808/909');

/**
 * Parts mode: how the song sounds. On the left every part as a mixer row (volume, mute, solo) plus
 * the Master; on the right everything about the selected one: instrument, how it plays, tone, effects.
 */
const PartsView: React.FC<PartsViewProps> = p => {
    const part = p.parts.find(x => x.id === p.selected);
    const anySolo = p.parts.some(x => x.solo);
    // one function per selected part, so the scope keeps drawing across re-renders
    const scopeOf = p.scope;
    const partId = part?.id ?? '';
    const scopeFor = useCallback(() => scopeOf(partId), [scopeOf, partId]);
    const ownKeys = p.own?.[partId];
    const ownHere = ownKeys?.size ? { section: p.scopeName, keys: ownKeys } : null;
    return (
        <div className="parts-view">
            <aside className="parts-list panel" aria-label="Parts and mixer">
                <div className="pl-head">
                    <ScopeChip name={p.scopeName} only={p.sectionOnly} onToggle={p.onScope} />
                    <AddPartMenu full={p.parts.length >= MAX_PARTS} onAdd={p.onAdd} short={p.compact} />
                </div>
                <div className="pl-rows">
                    {p.parts.map(x => {
                        const sel = x.id === p.selected;
                        const silenced = anySolo ? !x.solo : x.mute;
                        return (
                            <div key={x.id} className={`pl-row ${sel ? 'selected' : ''} ${silenced ? 'silenced' : ''}`} style={{ '--track': x.color } as React.CSSProperties}>
                                <div className="pl-main">
                                    <button className="pl-pick" aria-pressed={sel} aria-label={`${x.name}, ${KIND_TAG[x.kind]}, ${subLabel(x)}`} onClick={() => p.onSelect(x.id)}>
                                        <span className="track-dot" aria-hidden="true" />
                                        <span className="pl-name">{x.name}</span>
                                        <span className="pl-sub">{subLabel(x)}</span>
                                        {!!p.own?.[x.id]?.size && (
                                            <span className="own-dot pl-own" title={`Sounds its own way in ${p.scopeName}`}>
                                                <span className="visually-hidden"> (own sound in {p.scopeName})</span>
                                            </span>
                                        )}
                                    </button>
                                    <VolumeBar value={x.volume} color={x.color} name={x.name} onChange={v => p.onUpdate(x.id, { volume: v })} />
                                </div>
                                <button className="ms-button" aria-pressed={x.mute} aria-label={`Mute ${x.name}`} title="Mute in playback" onClick={() => p.onUpdate(x.id, { mute: !x.mute })}>M</button>
                                <button className="ms-button solo" aria-pressed={x.solo} aria-label={`Solo ${x.name}`} title="Solo in playback" onClick={() => p.onUpdate(x.id, { solo: !x.solo })}>S</button>
                            </div>
                        );
                    })}
                </div>
                <button className={`pl-row pl-master ${p.selected === MASTER ? 'selected' : ''}`} aria-pressed={p.selected === MASTER} onClick={() => p.onSelect(MASTER)}>
                    <span className="pd-dot master" aria-hidden="true" />
                    <span className="pl-name">Master</span>
                    <span className="pl-sub">reverb · delay · out</span>
                </button>
            </aside>

            {part ? (
                <OwnContext.Provider value={ownHere}>
                <PartDetail
                    key={part.id}
                    part={part}
                    isPadPart={part.id === p.padPartId}
                    canRemove={p.canRemove(part.id)}
                    onPadPart={() => p.onPadPart(part.id)}
                    onRemove={() => p.onRemove(part.id)}
                    onUpdate={patch => p.onUpdate(part.id, patch)}
                    onTone={(k, v) => p.onTone(part.id, k, v)}
                    onShape={(patch, key) => p.onShape(part.id, patch, key)}
                    onShapeReset={() => p.onShapeReset(part.id)}
                    shapeView={p.shapeView}
                    onShapeView={p.onShapeView}
                    scope={scopeFor}
                    onFx={(k, v) => p.onFx(part.id, k, v)}
                    onOpenBeat={() => p.onOpenBeat(part.id)}
                    compact={p.compact}
                    tab={p.tab}
                    onTab={p.onTab}
                    onUseSongSound={ownHere ? () => p.onUseSongSound(part.id) : undefined}
                />
                </OwnContext.Provider>
            ) : (
                <MasterDetail parts={p.parts} space={p.space} onSpace={p.onSpace} onDryAll={p.onDryAll} onFx={p.onFx} onSelect={p.onSelect} />
            )}
        </div>
    );
};

export default PartsView;
