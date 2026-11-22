import React from 'react';
import Knob from '../Knob';
import { Own } from './Own';

/** A knob with its label and value under it, in a small tile. */
export const KnobCell: React.FC<{
    label: string;
    aria: string;
    value: number;
    display: string;
    color: string;
    on: boolean;
    title?: string;
    resetTo?: number;
    offAtZero?: boolean;
    bipolar?: boolean;
    onChange: (v: number) => void;
    onPointerDown?: () => void;
    /** The open section's key for this setting, to mark it when the section sets it its own way. */
    own?: string;
}> = ({ label, aria, value, display, color, on, title, resetTo, offAtZero, bipolar, onChange, onPointerDown, own }) => (
    <div className={`knob-tile ${on ? 'on' : ''}`} title={title} style={{ '--track': color } as React.CSSProperties} onPointerDownCapture={onPointerDown}>
        {own && <Own k={own} />}
        <Knob value={value} onChange={onChange} color={color} label={aria} display={display} size={36} resetTo={resetTo} offAtZero={offAtZero} bipolar={bipolar} />
        <span className="knob-label">{label}</span>
        <span className="knob-value">{display}</span>
    </div>
);
