import React, { Component } from 'react';
import './Sequencer.css';

export interface SequencerSlot {
    chordName: string;
    notes: string[];
    octave?: number;
    playMode?: 'Chord' | 'Arp';
    isRest?: boolean;
    isTied?: boolean;
}

interface SequencerProps {
    slots: SequencerSlot[];
    recordingIndex: number | null;
    playingIndex: number | null;
    bpm: number;
    onSlotClick: (index: number) => void;
    onClear: () => void;
    onStepFirst: () => void;
    onStepPrev: () => void;
    onStepNext: () => void;
    onAddRow: () => void;
    onRemoveRow: () => void;
    onCopySlot: (targetIndex: number, copiedSlot: SequencerSlot) => void;
    onDeleteSlot: (index: number) => void;
    onSetRest: (index: number) => void;
    onToggleTie: (index: number) => void;
    onBpmChange: (bpm: number) => void;
}

interface SequencerState {
    isPlaying: boolean;
    loopMode: boolean;
    copiedSlot: SequencerSlot | null;
}

class Sequencer extends Component<SequencerProps, SequencerState> {
    private playInterval: NodeJS.Timeout | null = null;

    constructor(props: SequencerProps) {
        super(props);
        this.state = {
            isPlaying: false,
            loopMode: false,
            copiedSlot: null,
        };
    }

    componentWillUnmount() {
        this.stopPlayback();
    }

    startPlayback = () => {
        const { onStepNext, bpm } = this.props;

        this.setState({ isPlaying: true });

        // Start from first slot or current position
        if (this.props.playingIndex === null) {
            // Start from beginning - play first slot immediately
            onStepNext();
        }

        // Set up interval based on tempo (BPM to milliseconds)
        const interval = (60 / bpm) * 1000;
        this.playInterval = setInterval(() => {
            const { loopMode } = this.state;
            const { playingIndex, slots } = this.props;

            // Check if we should continue
            if (playingIndex !== null) {
                const hasNextSlot = slots.slice(playingIndex + 1).some(s => s.chordName);
                const hasAnySlot = slots.some(s => s.chordName);

                if (hasNextSlot || (loopMode && hasAnySlot)) {
                    onStepNext();
                } else if (!loopMode) {
                    this.stopPlayback();
                }
            }
        }, interval);
    };

    stopPlayback = () => {
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        this.setState({ isPlaying: false });
    };

    togglePlayback = () => {
        if (this.state.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
        }
    };

    toggleLoop = () => {
        this.setState(prev => ({ loopMode: !prev.loopMode }));
    };

    adjustTempo = (delta: number) => {
        const { bpm, onBpmChange } = this.props;
        const newTempo = Math.max(40, Math.min(240, bpm + delta));
        onBpmChange(newTempo);

        this.setState(prev => {

            // Restart playback with new tempo if currently playing
            if (prev.isPlaying) {
                if (this.playInterval) {
                    clearInterval(this.playInterval);
                }
                const interval = (60 / newTempo) * 1000;
                this.playInterval = setInterval(() => {
                    const { loopMode } = this.state;
                    const { playingIndex, slots, onStepNext } = this.props;

                    if (playingIndex !== null) {
                        const hasNextSlot = slots.slice(playingIndex + 1).some(s => s.chordName);
                        const hasAnySlot = slots.some(s => s.chordName);

                        if (hasNextSlot || (loopMode && hasAnySlot)) {
                            onStepNext();
                        } else if (!loopMode) {
                            this.stopPlayback();
                        }
                    }
                }, interval);
            }

            return prev;
        });
    };

    handleCopySlot = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const { slots } = this.props;
        const slot = slots[index];

        if (slot.chordName) {
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
    getSlotRows = (): SequencerSlot[][] => {
        const { slots } = this.props;
        const rows: SequencerSlot[][] = [];

        for (let i = 0; i < slots.length; i += 8) {
            rows.push(slots.slice(i, i + 8));
        }

        return rows;
    };

    render() {
        const { slots, recordingIndex, playingIndex, onSlotClick, onClear, onStepFirst, onStepPrev, onStepNext, onAddRow, onRemoveRow } = this.props;
        const { isPlaying, loopMode, copiedSlot } = this.state;
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
                                    const canTie = slot.chordName && !slot.isRest &&
                                        nextSlot && nextSlot.chordName === slot.chordName && !nextSlot.isRest;
                                    return (
                                        <div
                                            key={index}
                                            className={`sequencer-slot ${recordingIndex === index ? 'recording' : ''} ${playingIndex === index ? 'playing' : ''} ${slot.chordName ? 'filled' : ''} ${slot.isRest ? 'rest' : ''} ${slot.isTied ? 'tied' : ''}`}
                                            onClick={() => onSlotClick(index)}
                                        >
                                            <div className="slot-number">{index + 1}</div>
                                            {recordingIndex === index && (
                                                <div className="recording-indicator">●</div>
                                            )}
                                            {slot.isRest ? (
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
                                            ) : slot.chordName ? (
                                                <>
                                                    <div className="slot-content">
                                                        <div className="slot-chord">{slot.chordName}</div>
                                                        <div className="slot-notes">{slot.notes.join(' ')}</div>
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
                            onClick={this.togglePlayback}
                        >
                            {isPlaying ? '■' : '▶'}
                        </button>
                        <button className="control-button" onClick={onStepNext} title="Next">▶</button>
                        <button
                            className={`control-button loop-button ${loopMode ? 'active' : ''}`}
                            onClick={this.toggleLoop}
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
