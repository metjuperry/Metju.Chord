import React, { Component } from 'react';
import './Sequencer.css';

import { ChordType } from './theory';

/** What a slot stores is chord parameters, never note strings: MIDI is computed at play time. */
export interface SequencerSlot {
    degree: number;
    type: ChordType;
    inversion: number;
    octave: number;
    playMode: 'Chord' | 'Arp';
    isRest?: boolean;
    isTied?: boolean;
}

export type SlotCell = SequencerSlot | null;

export const REST_SLOT: SequencerSlot = { degree: 0, type: 'root', inversion: 0, octave: 4, playMode: 'Chord', isRest: true };

export const sameChord = (a: SequencerSlot, b: SequencerSlot) =>
    a.degree === b.degree && a.type === b.type && a.inversion === b.inversion &&
    a.octave === b.octave && a.playMode === b.playMode;

interface SequencerProps {
    slots: SlotCell[];
    recordingIndex: number | null;
    playingIndex: number | null;
    isPlaying: boolean;
    loopMode: boolean;
    bpm: number;
    describeSlot: (slot: SequencerSlot) => { name: string; notes: string[] };
    onSlotClick: (index: number) => void;
    onClear: () => void;
    onStepFirst: () => void;
    onStepPrev: () => void;
    onStepNext: () => void;
    onTogglePlay: () => void;
    onToggleLoop: () => void;
    onAddRow: () => void;
    onRemoveRow: () => void;
    onCopySlot: (targetIndex: number, copiedSlot: SequencerSlot) => void;
    onDeleteSlot: (index: number) => void;
    onSetRest: (index: number) => void;
    onToggleTie: (index: number) => void;
    onBpmChange: (bpm: number) => void;
}

interface SequencerState {
    copiedSlot: SequencerSlot | null;
}

class Sequencer extends Component<SequencerProps, SequencerState> {
    constructor(props: SequencerProps) {
        super(props);
        this.state = {
            copiedSlot: null,
        };
    }

    adjustTempo = (delta: number) => {
        const { bpm, onBpmChange } = this.props;
        onBpmChange(Math.max(40, Math.min(240, bpm + delta)));
    };

    handleCopySlot = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const { slots } = this.props;
        const slot = slots[index];

        if (slot) {
            this.setState({ copiedSlot: { ...slot } });
        }
    };

    handlePasteSlot = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const { copiedSlot } = this.state;

        if (copiedSlot) {
            this.props.onCopySlot(index, copiedSlot);
            // Clear the copied slot after pasting so paste buttons disappear
            this.setState({ copiedSlot: null });
        }
    };

    handleDeleteSlot = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        this.props.onDeleteSlot(index);
    };

    handleSetRest = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        this.props.onSetRest(index);
    };

    handleToggleTie = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        this.props.onToggleTie(index);
    };

    // Group slots into rows of 8
    getSlotRows = (): SlotCell[][] => {
        const { slots } = this.props;
        const rows: SlotCell[][] = [];

        for (let i = 0; i < slots.length; i += 8) {
            rows.push(slots.slice(i, i + 8));
        }

        return rows;
    };

    render() {
        const { slots, recordingIndex, playingIndex, isPlaying, loopMode, describeSlot, onSlotClick, onClear, onStepFirst, onStepPrev, onStepNext, onTogglePlay, onToggleLoop, onAddRow, onRemoveRow } = this.props;
        const { copiedSlot } = this.state;
        const { bpm } = this.props;
        const slotRows = this.getSlotRows();

        return (
            <div className="sequencer">
                <div className="sequencer-header">
                    <h3>SEQ-{slots.length}</h3>
                    <div className="sequencer-info">
                        <div className="tempo-control">
                            <button className="tempo-button" onClick={() => this.adjustTempo(-10)}>-</button>
                            <div className="tempo-display">
                                <span className="tempo-value">{bpm}</span>
                                <span className="tempo-label">BPM</span>
                            </div>
                            <button className="tempo-button" onClick={() => this.adjustTempo(10)}>+</button>
                        </div>
                    </div>
                </div>

                <div className="sequencer-grid">
                    {slotRows.map((row, rowIndex) => (
                        <div key={rowIndex} className="sequencer-row">
                            <div className="sequencer-slots">
                                {row.map((slot, colIndex) => {
                                    const index = rowIndex * 8 + colIndex;
                                    const nextSlot = slots[index + 1];
                                    // Can tie only if next slot exists and has same chord
                                    const canTie = slot && !slot.isRest &&
                                        nextSlot && !nextSlot.isRest && sameChord(slot, nextSlot);
                                    const info = slot && !slot.isRest ? describeSlot(slot) : null;
                                    return (
                                        <div
                                            key={index}
                                            className={`sequencer-slot ${recordingIndex === index ? 'recording' : ''} ${playingIndex === index ? 'playing' : ''} ${slot ? 'filled' : ''} ${slot?.isRest ? 'rest' : ''} ${slot?.isTied ? 'tied' : ''}`}
                                            onClick={() => onSlotClick(index)}
                                        >
                                            <div className="slot-number">{index + 1}</div>
                                            {recordingIndex === index && (
                                                <div className="recording-indicator">●</div>
                                            )}
                                            {slot?.isRest ? (
                                                <>
                                                    <div className="rest-indicator">𝄽</div>
                                                    <div className="slot-actions">
                                                        <button
                                                            className="slot-action-btn delete-btn"
                                                            onClick={(e) => this.handleDeleteSlot(index, e)}
                                                            title="Delete"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                </>
                                            ) : slot && info ? (
                                                <>
                                                    <div className="slot-content">
                                                        <div className="slot-chord">{info.name}</div>
                                                        <div className="slot-notes">{info.notes.join(' ')}</div>
                                                    </div>
                                                    {slot.isTied && <div className="tie-line"></div>}
                                                    <div className="slot-actions">
                                                        {canTie && (
                                                            <button
                                                                className={`slot-action-btn tie-btn ${slot.isTied ? 'active' : ''}`}
                                                                onClick={(e) => this.handleToggleTie(index, e)}
                                                                title={slot.isTied ? "Remove Tie" : "Tie to Next"}
                                                            >
                                                                🔗
                                                            </button>
                                                        )}
                                                        <button
                                                            className="slot-action-btn copy-btn"
                                                            onClick={(e) => this.handleCopySlot(index, e)}
                                                            title="Copy"
                                                        >
                                                            ⧉
                                                        </button>
                                                        <button
                                                            className="slot-action-btn delete-btn"
                                                            onClick={(e) => this.handleDeleteSlot(index, e)}
                                                            title="Delete"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="empty-slot-actions">
                                                    {copiedSlot && (
                                                        <button
                                                            className="paste-btn"
                                                            onClick={(e) => this.handlePasteSlot(index, e)}
                                                            title="Paste"
                                                        >
                                                            ⧉
                                                        </button>
                                                    )}
                                                    <button
                                                        className="record-btn"
                                                        onClick={(e) => { e.stopPropagation(); onSlotClick(index); }}
                                                        title="Start Recording"
                                                    >
                                                        ●
                                                    </button>
                                                    <button
                                                        className="rest-btn"
                                                        onClick={(e) => this.handleSetRest(index, e)}
                                                        title="Add Rest"
                                                    >
                                                        𝄽
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="sequencer-row-controls">
                    <button className="row-control-btn" onClick={onAddRow}>+ ADD ROW</button>
                    {slotRows.length > 1 && (
                        <button className="row-control-btn remove" onClick={onRemoveRow}>- REMOVE ROW</button>
                    )}
                </div>

                <div className="sequencer-controls">
                    <div className="transport-controls">
                        <button className="control-button" onClick={onStepFirst} title="First">|◀</button>
                        <button className="control-button" onClick={onStepPrev} title="Previous">◀</button>
                        <button
                            className={`control-button play-button ${isPlaying ? 'active' : ''}`}
                            onClick={onTogglePlay}
                        >
                            {isPlaying ? '■' : '▶'}
                        </button>
                        <button className="control-button" onClick={onStepNext} title="Next">▶</button>
                        <button
                            className={`control-button loop-button ${loopMode ? 'active' : ''}`}
                            onClick={onToggleLoop}
                            title="Loop Mode"
                        >
                            ↻
                        </button>
                    </div>
                    <button className="clear-button" onClick={onClear}>CLEAR</button>
                </div>
            </div>
        );
    }
}

export default Sequencer;
