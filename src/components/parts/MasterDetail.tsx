import React, { useState } from 'react';
import FxMatrix, { SpaceControls } from '../FxMatrix';
import { FX_KEYS, Part, PartFx } from '../../parts';
import { Space } from '../../song';

export const MasterDetail: React.FC<{
    parts: Part[];
    space: Space;
    onSpace: (space: Space) => void;
    onDryAll: () => void;
    onFx: (partId: string, key: keyof PartFx, value: number) => void;
    onSelect: (id: string) => void;
}> = ({ parts, space, onSpace, onDryAll, onFx, onSelect }) => {
    const [overview, setOverview] = useState(false);
    const anyWet = parts.some(p => FX_KEYS.some(k => p.fx[k] > 0));
    return (
        <section className="part-detail panel master-detail" aria-label="Master: shared reverb, delay and output">
            <div className="pd-head">
                <span className="pd-dot master" aria-hidden="true" />
                <h2 className="pd-name">Master</h2>
                <span className="pd-kind">Shared</span>
                <span className="pd-space" />
                <button className="chip-button small-chip" aria-pressed={overview} onClick={() => setOverview(o => !o)}>Mix overview</button>
                <button className="chip-button small-chip" disabled={!anyWet} onClick={onDryAll} title="Turn every part's effects off (undoable)">All dry</button>
            </div>
            <p className="section-note master-note">Every part can send into one reverb and one delay; their returns and the output level are set here.</p>
            <SpaceControls space={space} onSpace={onSpace} />
            {overview && (
                <div className="pd-block">
                    <span className="pd-label">Every part's effects</span>
                    <FxMatrix parts={parts} onSelectPart={onSelect} onFx={onFx} />
                </div>
            )}
        </section>
    );
};
