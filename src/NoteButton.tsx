import React, { Component } from 'react';
import './NoteButton.css';

interface NoteButtonProps {
    label: string;
    degree: number;
    onPress: (degree: number) => void;
    onRelease: (degree: number) => void;
}

interface NoteButtonState {
    isPlaying: boolean;
}

/** A pad. Sound is owned by App so pads and the keyboard share one code path. */
class NoteButton extends Component<NoteButtonProps, NoteButtonState> {
    private holding = false;
    private releaseTimeout: ReturnType<typeof setTimeout> | null = null;

    state: NoteButtonState = { isPlaying: false };

    componentWillUnmount() {
        if (this.releaseTimeout) clearTimeout(this.releaseTimeout);
        this.release();
    }

    handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (this.holding || e.button > 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        this.holding = true;
        if (this.releaseTimeout) clearTimeout(this.releaseTimeout);
        this.setState({ isPlaying: true });
        this.props.onPress(this.props.degree);
    };

    release = () => {
        if (!this.holding) return;
        this.holding = false;
        this.props.onRelease(this.props.degree);
        // Delay resetting isPlaying for visual feedback
        this.releaseTimeout = setTimeout(() => this.setState({ isPlaying: false }), 100);
    };

    render() {
        const { label } = this.props;
        const { isPlaying } = this.state;

        return (
            <button
                className={`note-button ${isPlaying ? 'playing' : ''}`}
                onPointerDown={this.handlePointerDown}
                onPointerUp={this.release}
                onPointerCancel={this.release}
                onPointerLeave={this.release}
            >
                {label}
            </button>
        );
    }
}

export default NoteButton;
