import React, { useMemo } from 'react';
import { InstrumentPart } from '../../parts';
import { ShapeView } from '../../song';
import { DRIVE_TYPES, FILTER_TYPES, KNOBS, LFO_RATES, PartShape, ShapeKnob, ShapeOverrides, defaultShape, effectiveShape, fromKnob, shapeText, toKnob } from '../../sound';
import ShapeGraphs, { EnvelopeGraph, FilterGraph } from '../ShapeGraphs';
import Scope, { WaveSource } from '../Scope';
import { useMorph } from '../../motion';
import { KnobCell } from './KnobCell';
import { Own } from './Own';
import { DRIVE_LABELS, FILTER_LABELS, LFO_LABELS, SHAPE_HINTS, SIMPLE_KNOBS, instrumentLabel } from './labels';

interface ShapeBlockProps {
    part: InstrumentPart;
    view: ShapeView;
    onView: (v: ShapeView) => void;
    onShape: (patch: ShapeOverrides, key: string) => void;
    onReset: () => void;
    scope: () => WaveSource | null;
    /** The envelope and filter pictures (on a phone only in Advanced, where they're draggable). */
    graphs: boolean;
}

/**
 * Shape: Simple shows the envelope and filter read-only over six knobs; Advanced makes the graphs
 * draggable and adds Decay, Sustain, the filter type, the LFO and the drive type, plus a live scope.
 * Both edit the same shape. Reset goes back to the instrument's own sound; a knob's double-tap puts
 * just that one back.
 */
/** Two shapes mixed `t` of the way, knob by knob (in knob travel, so a log knob swings evenly); switches flip at once. */
function lerpShape(a: PartShape, b: PartShape, t: number): PartShape {
    const out = { ...b };
    for (const k of Object.keys(KNOBS) as ShapeKnob[]) {
        out[k] = fromKnob(k, toKnob(k, a[k] as number) + (toKnob(k, b[k] as number) - toKnob(k, a[k] as number)) * t);
    }
    return out;
}

export const ShapeBlock: React.FC<ShapeBlockProps> = ({ part, view, onView, onShape, onReset: reset, scope, graphs }) => {
    const own = defaultShape(part.instrument);
    const target = useMemo(() => effectiveShape(part.instrument, part.shape), [part.instrument, part.shape]);
    // Reset swings the knobs and graphs back to the instrument's own sound; everything else follows at once
    const [shape, armMorph] = useMorph(target, lerpShape);
    const onReset = () => {
        armMorph();
        reset();
    };
    const changed = Object.keys(part.shape).length > 0;
    const knob = (k: ShapeKnob) => (
        <KnobCell
            key={k}
            label={KNOBS[k].label}
            aria={`${part.name} ${KNOBS[k].label}`}
            title={`${SHAPE_HINTS[k]} · double-tap: back to ${instrumentLabel(part.instrument)}'s own`}
            value={toKnob(k, shape[k] as number)}
            display={shapeText(k, shape[k] as number)}
            color={part.color}
            on={part.shape[k] !== undefined && Math.abs(toKnob(k, part.shape[k] as number) - toKnob(k, own[k] as number)) > 0.005}
            resetTo={toKnob(k, own[k] as number)}
            bipolar={k === 'envAmount'}
            own={`shape.${k}`}
            onChange={v => onShape({ [k]: fromKnob(k, v) }, k)}
        />
    );
    return (
        <div className="pd-block shape-block" role="group" aria-label={`${part.name} shape`}>
            <div className="shape-head">
                <span className="pd-label">Shape</span>
                <span className="section-note shape-note">how each note rises, falls and is filtered</span>
                <span className="shape-space" />
                <div className="segmented small-seg" role="group" aria-label="Shape view">
                    <button aria-pressed={view === 'simple'} title="six knobs" onClick={() => onView('simple')}>Simple</button>
                    <button aria-pressed={view === 'advanced'} title="every control, draggable graphs and a scope" onClick={() => onView('advanced')}>Advanced</button>
                </div>
                <button className="chip-button shape-reset" disabled={!changed} title={`Back to ${instrumentLabel(part.instrument)} as designed`} onClick={onReset}>Reset</button>
            </div>
            {view === 'simple' ? (
                <>
                    {graphs && <ShapeGraphs shape={shape} color={part.color} />}
                    <div className="knob-row shape-knobs">{SIMPLE_KNOBS.map(knob)}</div>
                </>
            ) : (
                <>
                    <div className="shape-graphs advanced">
                        <EnvelopeGraph shape={shape} color={part.color} height={64} onChange={onShape} />
                        <FilterGraph shape={shape} color={part.color} height={64} onChange={onShape} />
                    </div>
                    <div className="shape-sections">
                        <div className="shape-section" role="group" aria-label="Envelope">
                            <span className="shape-sub">Envelope</span>
                            <div className="knob-row shape-knobs">{(['attack', 'decay', 'sustain', 'release'] as ShapeKnob[]).map(knob)}</div>
                        </div>
                        <div className="shape-section" role="group" aria-label="Filter">
                            <span className="shape-sub">Filter</span>
                            <div className="segmented small-seg" role="group" aria-label="Filter type">
                                {FILTER_TYPES.map(t => (
                                    <button key={t} aria-pressed={shape.filterType === t} title={FILTER_LABELS[t][1]} onClick={() => onShape({ filterType: t }, 'filterType')}>{FILTER_LABELS[t][0]}<Own k="shape.filterType" when={shape.filterType === t} /></button>
                                ))}
                            </div>
                            <div className="knob-row shape-knobs">{(['cutoff', 'resonance', 'envAmount'] as ShapeKnob[]).map(knob)}</div>
                        </div>
                        <div className="shape-section" role="group" aria-label="LFO">
                            <span className="shape-sub" title="LFO: a slow wave that sweeps the cutoff up and down, in time with the song">LFO</span>
                            <div className="segmented small-seg" role="group" aria-label="LFO rate">
                                {LFO_RATES.map(r => (
                                    <button key={r} aria-pressed={shape.lfoRate === r} title={`LFO Rate: one sweep per ${LFO_LABELS[r]} note`} onClick={() => onShape({ lfoRate: r }, 'lfoRate')}>{LFO_LABELS[r]}<Own k="shape.lfoRate" when={shape.lfoRate === r} /></button>
                                ))}
                            </div>
                            <div className="knob-row shape-knobs">{knob('lfoDepth')}</div>
                        </div>
                        <div className="shape-section" role="group" aria-label="Drive">
                            <span className="shape-sub">Drive</span>
                            <div className="segmented small-seg" role="group" aria-label="Drive type">
                                {DRIVE_TYPES.map(t => (
                                    <button key={t} aria-pressed={shape.driveType === t} title={DRIVE_LABELS[t][1]} onClick={() => onShape({ driveType: t }, 'driveType')}>{DRIVE_LABELS[t][0]}<Own k="shape.driveType" when={shape.driveType === t} /></button>
                                ))}
                            </div>
                            <div className="knob-row shape-knobs">{knob('drive')}</div>
                        </div>
                    </div>
                    <Scope source={scope} color={part.color} label={part.name} />
                </>
            )}
        </div>
    );
};
