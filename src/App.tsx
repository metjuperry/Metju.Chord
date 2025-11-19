import React, { Component } from 'react';
import './App.css';
import NoteButton from './NoteButton';
import ChordGrid from './ChordGrid';
import { MusicalKey } from './ScalePicker';
import ChordDisplay from './ChordDisplay';
import SettingsPanel from './SettingsPanel';
import Sequencer, { SequencerSlot } from './Sequencer';
import Metronome from './Metronome';
import FeatureMenu from './FeatureMenu';
import EffectsPanel from './EffectsPanel';
import ScaleVisualizer from './ScaleVisualizer';
import HelpPanel from './HelpPanel';
import { buildChord, getNoteInKey } from './chordUtils';
import * as Tone from 'tone';

type SynthType = 'Synth' | 'AMSynth' | 'FMSynth' | 'MonoSynth' | 'MembraneSynth';

type PlayMode = 'Chord' | 'Arp';

type ArpPattern = 'up' | 'down' | 'upDown' | 'random';

interface AppState {
    selectedKey: MusicalKey;
    octave: number;
    synthType: SynthType;
    playMode: PlayMode;
    inversion: number;
    joystickPosition: string;
    lastPlayedChord: string;
    lastPlayedNotes: string[];
    sequencerSlots: SequencerSlot[];
    recordingIndex: number | null;
    playingIndex: number | null;
    arpPattern: ArpPattern;
    arpSpeed: number;
    noteLength: number;
    bpm: number;
    sequencerBpm: number;
    menuOpen: boolean;
    showMetronome: boolean;
    showSequencer: boolean;
    showArpSettings: boolean;
    showEffects: boolean;
    showScaleViz: boolean;
    showHelp: boolean;
    theme: 'dark' | 'light';
    isLoading: boolean;
    audioReady: boolean;
}

class App extends Component<{}, AppState> {
    private synth: Tone.PolySynth | null = null;

    constructor(props: {}) {
        super(props);
        this.state = {
            selectedKey: 'C',
            octave: 4,
            synthType: 'Synth',
            playMode: 'Chord',
            inversion: 0,
            joystickPosition: 'neutral',
            lastPlayedChord: '',
            lastPlayedNotes: [],
            sequencerSlots: Array(8).fill({ chordName: '', notes: [] }),
            recordingIndex: null,
            playingIndex: null,
            arpPattern: 'up',
            arpSpeed: 0.15,
            noteLength: 0.5,
            bpm: 120,
            sequencerBpm: 120,
            menuOpen: false,
            showMetronome: false,
            showSequencer: false,
            showArpSettings: false,
            showEffects: false,
            showScaleViz: false,
            showHelp: false,
            theme: 'dark',
            isLoading: true,
            audioReady: false,
        };
    }

    async componentDidMount() {
        this.applyTheme(this.state.theme);
        window.addEventListener('keydown', this.handleKeyPress);

        // Initialize synth without starting AudioContext
        try {
            await this.initializeSynth(this.state.synthType, false);
            this.setState({ isLoading: false });
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            this.setState({ isLoading: false });
        }
    }

    componentWillUnmount() {
        if (this.synth) {
            this.synth.dispose();
        }
        window.removeEventListener('keydown', this.handleKeyPress);
    }

    applyTheme = (theme: 'dark' | 'light') => {
        document.documentElement.setAttribute('data-theme', theme);
    };

    handleThemeToggle = () => {
        this.setState(prevState => {
            const newTheme = prevState.theme === 'dark' ? 'light' : 'dark';
            this.applyTheme(newTheme);
            return { theme: newTheme };
        });
    };

    handleKeyPress = (event: KeyboardEvent) => {
        // Ignore if typing in an input or select element
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
            return;
        }

        // Map number keys 1-7 to scale degrees (0-6 array indices)
        const keyMap: { [key: string]: number } = {
            '1': 0, // I
            '2': 1, // ii
            '3': 2, // iii
            '4': 3, // IV
            '5': 4, // V
            '6': 5, // vi
            '7': 6, // vii
        };

        const scaleDegree = keyMap[event.key];

        if (scaleDegree !== undefined) {
            const notes = this.getNotesForButton(scaleDegree);
            const chordName = this.getChordNameForButton(scaleDegree);

            if (this.synth) {
                this.playChord(notes, chordName);
            }
        }
    };

    playChord = async (notes: string[], chordName: string) => {
        const { octave, playMode, arpPattern, arpSpeed, noteLength, recordingIndex, sequencerSlots } = this.state;

        await this.ensureAudioReady();

        // Update display
        this.setState({
            lastPlayedChord: chordName,
            lastPlayedNotes: notes,
        });

        // Record to sequencer if recording
        if (recordingIndex !== null && this.synth) {
            const newSlots = [...sequencerSlots];
            newSlots[recordingIndex] = {
                chordName,
                notes,
                octave,
                playMode,
            };
            this.setState({
                sequencerSlots: newSlots,
                recordingIndex: null,
            });
        }

        // Play the notes
        const notesToPlay = notes.map(note => `${note}${octave}`);

        if (playMode === 'Arp') {
            // Simple arpeggio for keyboard - use NoteButton logic for consistency
            const arpNotes = this.getArpeggiatedNotes(notesToPlay, arpPattern);
            arpNotes.forEach((note, i) => {
                setTimeout(() => {
                    this.synth?.triggerAttackRelease(note, noteLength);
                }, i * arpSpeed * 1000);
            });
        } else {
            // Chord mode
            this.synth?.triggerAttackRelease(notesToPlay, noteLength);
        }
    };

    getArpeggiatedNotes = (notes: string[], pattern: ArpPattern): string[] => {
        const sorted = [...notes].sort();
        switch (pattern) {
            case 'down':
                return sorted.reverse();
            case 'upDown':
                return [...sorted, ...sorted.slice(0, -1).reverse()];
            case 'random':
                return [...notes].sort(() => Math.random() - 0.5);
            case 'up':
            default:
                return sorted;
        }
    };

    ensureAudioReady = async () => {
        if (!this.state.audioReady) {
            await Tone.start();
            this.setState({ audioReady: true });
        }
    };

    initializeSynth = async (type: SynthType, startAudio: boolean = true) => {
        // Dispose of old synth if it exists
        if (this.synth) {
            this.synth.dispose();
        }

        // Create new synth based on type
        switch (type) {
            case 'AMSynth':
                this.synth = new Tone.PolySynth(Tone.AMSynth).toDestination();
                break;
            case 'FMSynth':
                this.synth = new Tone.PolySynth(Tone.FMSynth).toDestination();
                break;
            case 'MonoSynth':
                this.synth = new Tone.PolySynth(Tone.MonoSynth).toDestination();
                break;
            case 'MembraneSynth':
                this.synth = new Tone.PolySynth(Tone.MembraneSynth).toDestination();
                break;
            case 'Synth':
            default:
                this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
                break;
        }

        // Only start audio if requested (for user gesture requirement)
        if (startAudio) {
            await this.ensureAudioReady();
        }
    };

    handleKeyChange = (key: MusicalKey) => {
        this.setState({ selectedKey: key });
        console.log('Selected key:', key);
    };

    handleOctaveChange = (octave: number) => {
        this.setState({ octave });
        console.log('Selected octave:', octave);
    };

    handleSynthChange = (synthType: SynthType) => {
        this.setState({ synthType });
        this.initializeSynth(synthType);
        console.log('Selected synth:', synthType);
    };

    handlePlayModeChange = (playMode: PlayMode) => {
        this.setState({ playMode });
        console.log('Play mode:', playMode);
    };

    handleInversionChange = (change: number) => {
        this.setState((prevState) => ({
            inversion: Math.max(0, Math.min(2, prevState.inversion + change))
        }));
    };

    handleArpPatternChange = (arpPattern: ArpPattern) => {
        this.setState({ arpPattern });
        console.log('Arp pattern:', arpPattern);
    };

    handleArpSpeedChange = (arpSpeed: number) => {
        this.setState({ arpSpeed });
    };

    handleNoteLengthChange = (noteLength: number) => {
        this.setState({ noteLength });
    };

    handleBpmChange = (bpm: number) => {
        this.setState({ bpm });
    };

    handleSequencerBpmChange = (bpm: number) => {
        this.setState({ sequencerBpm: bpm });
    };

    handleMenuToggle = () => {
        this.setState((prevState) => ({ menuOpen: !prevState.menuOpen }));
    };

    handleMetronomeToggle = (show: boolean) => {
        this.setState({ showMetronome: show });
    };

    handleSequencerToggle = (show: boolean) => {
        this.setState({ showSequencer: show });
    };

    handleArpSettingsToggle = (show: boolean) => {
        this.setState({ showArpSettings: show });
    };

    handleEffectsToggle = (show: boolean) => {
        this.setState({ showEffects: show });
    };

    handleScaleVizToggle = (show: boolean) => {
        this.setState({ showScaleViz: show });
    };

    handleHelpToggle = () => {
        this.setState(prevState => ({ showHelp: !prevState.showHelp }));
    };

    handleJoystickChange = (position: string) => {
        this.setState({ joystickPosition: position });
        console.log('Joystick position:', position);
    };

    handleSequencerSlotClick = (index: number) => {
        this.setState((prevState) => ({
            // If clicking on the currently recording slot, cancel recording
            recordingIndex: prevState.recordingIndex === index ? null : index
        }));
    };

    handleClearSequencer = () => {
        this.setState({
            sequencerSlots: Array(8).fill({ chordName: '', notes: [] }),
            recordingIndex: null,
            playingIndex: null,
        });
    };

    handleAddRow = () => {
        const { sequencerSlots } = this.state;
        const newSlots = [...sequencerSlots, ...Array(8).fill({ chordName: '', notes: [] })];
        this.setState({ sequencerSlots: newSlots });
    };

    handleRemoveRow = () => {
        const { sequencerSlots } = this.state;
        if (sequencerSlots.length > 8) {
            const newSlots = sequencerSlots.slice(0, -8);
            this.setState({
                sequencerSlots: newSlots,
                recordingIndex: null,
                playingIndex: null,
            });
        }
    };

    handleCopySlot = (targetIndex: number, copiedSlot: SequencerSlot) => {
        // Paste the copied slot to target index
        const { sequencerSlots } = this.state;
        const newSlots = [...sequencerSlots];
        newSlots[targetIndex] = { ...copiedSlot };
        this.setState({ sequencerSlots: newSlots });
    };

    handleDeleteSlot = (index: number) => {
        const { sequencerSlots } = this.state;
        const newSlots = [...sequencerSlots];
        newSlots[index] = { chordName: '', notes: [] };
        this.setState({ sequencerSlots: newSlots });
    };

    handleSetRest = (index: number) => {
        const { sequencerSlots } = this.state;
        const newSlots = [...sequencerSlots];
        newSlots[index] = { chordName: 'REST', notes: [], isRest: true };
        this.setState({ sequencerSlots: newSlots });
    };

    handleToggleTie = (index: number) => {
        const { sequencerSlots } = this.state;
        const newSlots = [...sequencerSlots];
        newSlots[index] = { ...newSlots[index], isTied: !newSlots[index].isTied };
        this.setState({ sequencerSlots: newSlots });
    };

    playSequencerSlot = async (index: number) => {
        const { sequencerSlots } = this.state;
        const slot = sequencerSlots[index];

        if (!slot.chordName || !this.synth) return;

        // Check if previous slot is tied to this one (sustain instead of retrigger)
        const prevSlot = index > 0 ? sequencerSlots[index - 1] : null;
        const isTiedFromPrevious = prevSlot && prevSlot.isTied && prevSlot.chordName === slot.chordName;

        // Set playing state immediately
        this.setState({
            lastPlayedChord: slot.chordName,
            lastPlayedNotes: slot.notes,
            playingIndex: index
        });

        // If it's a rest, don't play any sound
        if (slot.isRest) {
            return;
        }

        // If tied from previous slot, don't retrigger (just sustain)
        if (isTiedFromPrevious) {
            return;
        }

        await this.ensureAudioReady();

        // Calculate note duration based on BPM and tied chain length
        const { sequencerBpm } = this.state;
        const beatDuration = 60 / sequencerBpm; // Duration of one beat in seconds

        // Count how many slots are in the tie chain (including this one if tied)
        let tieCount = 1;
        if (slot.isTied) {
            let nextIndex = index + 1;
            while (nextIndex < sequencerSlots.length) {
                const nextSlot = sequencerSlots[nextIndex];
                if (nextSlot.chordName === slot.chordName && sequencerSlots[nextIndex - 1].isTied) {
                    tieCount++;
                    nextIndex++;
                } else {
                    break;
                }
            }
        }

        const duration = beatDuration * tieCount;

        // Add octave numbers back for playback using saved octave and playMode
        const octave = slot.octave ?? 4;
        const slotPlayMode = slot.playMode ?? 'Chord';
        const notesToPlay = slot.notes.map(note => `${note}${octave}`);

        if (slotPlayMode === 'Arp') {
            // Arpeggiate: play notes one after another
            const arpDelay = 0.1;
            notesToPlay.forEach((note, i) => {
                setTimeout(() => {
                    this.synth?.triggerAttackRelease(note, duration);
                }, i * arpDelay * 1000);
            });
        } else {
            // Chord: play all notes at once
            this.synth.triggerAttackRelease(notesToPlay, duration);
        }
    };

    handleStepFirst = () => {
        // Reset cursor to beginning (no slot selected)
        this.setState({ playingIndex: null });
    };

    handleStepPrev = () => {
        const { playingIndex, sequencerSlots } = this.state;

        if (playingIndex === null) {
            // If nothing playing, go to last filled slot
            for (let i = sequencerSlots.length - 1; i >= 0; i--) {
                if (sequencerSlots[i].chordName) {
                    this.playSequencerSlot(i);
                    return;
                }
            }
        } else {
            // Go to previous filled slot
            for (let i = playingIndex - 1; i >= 0; i--) {
                if (sequencerSlots[i].chordName) {
                    this.playSequencerSlot(i);
                    return;
                }
            }
            // Wrap to last filled slot
            for (let i = sequencerSlots.length - 1; i > playingIndex; i--) {
                if (sequencerSlots[i].chordName) {
                    this.playSequencerSlot(i);
                    return;
                }
            }
        }
    };

    handleStepNext = () => {
        const { playingIndex, sequencerSlots } = this.state;

        if (playingIndex === null) {
            // If nothing playing, go to first filled slot
            const firstFilledIndex = sequencerSlots.findIndex(slot => slot.chordName);
            if (firstFilledIndex !== -1) {
                this.playSequencerSlot(firstFilledIndex);
            }
        } else {
            // Go to next filled slot
            for (let i = playingIndex + 1; i < sequencerSlots.length; i++) {
                if (sequencerSlots[i].chordName) {
                    this.playSequencerSlot(i);
                    return;
                }
            }
            // Wrap to first filled slot
            for (let i = 0; i < playingIndex; i++) {
                if (sequencerSlots[i].chordName) {
                    this.playSequencerSlot(i);
                    return;
                }
            }
        }
    };

    handleChordPlayed = (label: string) => {
        const { selectedKey, octave, playMode, joystickPosition, recordingIndex, sequencerSlots } = this.state;

        // Map Roman numerals to scale positions (0-indexed)
        // Support both uppercase and lowercase
        const romanToPosition: { [key: string]: number } = {
            'I': 0,
            'II': 1, 'ii': 1,
            'III': 2, 'iii': 2,
            'IV': 3,
            'V': 4,
            'VI': 5, 'vi': 5,
            'VII': 6, 'vii': 6
        };

        const scalePosition = romanToPosition[label] ?? 0;
        const rootNote = getNoteInKey(selectedKey, scalePosition);

        // Check if the chord is minor (lowercase roman numeral)
        const isMinor = label === label.toLowerCase();

        // Get the actual notes being played
        const notes = this.getNotesForButton(scalePosition);
        // Remove octave numbers for display
        const displayNotes = notes.map(note => note.replace(/\d+$/, ''));

        let chordName = '';
        if (joystickPosition === 'neutral') {
            chordName = `${rootNote}`;
        } else if (joystickPosition === 'maj/min') {
            chordName = isMinor ? `${rootNote} Minor` : `${rootNote} Major`;
        } else if (joystickPosition === 'dim') {
            chordName = `${rootNote} Diminished`;
        } else if (joystickPosition === 'aug') {
            chordName = `${rootNote} Augmented`;
        } else if (joystickPosition === '7') {
            chordName = `${rootNote} Dominant 7th`;
        } else if (joystickPosition === 'maj/min7') {
            chordName = isMinor ? `${rootNote} Minor 7th` : `${rootNote} Major 7th`;
        } else if (joystickPosition === 'maj/min9') {
            chordName = isMinor ? `${rootNote} Minor 9th` : `${rootNote} Major 9th`;
        } else if (joystickPosition === 'sus4') {
            chordName = `${rootNote} Sus4`;
        } else if (joystickPosition === 'sus2/maj6') {
            chordName = `${rootNote} Sus2`;
        }

        this.setState({ lastPlayedChord: chordName, lastPlayedNotes: displayNotes });

        // If recording, save to the sequencer slot
        if (recordingIndex !== null) {
            const newSlots = [...sequencerSlots];
            newSlots[recordingIndex] = { chordName, notes: displayNotes, octave, playMode };
            this.setState({
                sequencerSlots: newSlots,
                recordingIndex: null // Stop recording after capturing one chord
            });
        }
    };

    getNotesForButton = (scalePosition: number): string[] => {
        const { selectedKey, octave, inversion, joystickPosition } = this.state;

        const position = joystickPosition;

        // Build a chord based on the joystick position
        const chordNotes = buildChord(selectedKey, scalePosition, position, octave);

        // Apply inversion
        return this.applyInversion(chordNotes, inversion);
    };

    applyInversion = (notes: string[], inversion: number): string[] => {
        if (inversion === 0 || notes.length === 0) {
            return notes;
        }

        const result = [...notes];
        const inversions = inversion % notes.length;

        for (let i = 0; i < inversions; i++) {
            // Move the lowest note up an octave
            const bottomNote = result.shift()!;
            const noteName = bottomNote.replace(/\d+$/, '');
            const noteOctave = parseInt(bottomNote.match(/\d+$/)?.[0] || '4');
            result.push(`${noteName}${noteOctave + 1}`);
        }

        return result;
    };

    getChordNameForButton = (scaleDegree: number): string => {
        const { selectedKey, joystickPosition } = this.state;
        const romanNumerals = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii'];
        let chordName = romanNumerals[scaleDegree];

        // Add joystick modifiers
        if (joystickPosition === 'up') {
            chordName += '7';
        } else if (joystickPosition === 'down') {
            chordName += 'sus4';
        } else if (joystickPosition === 'left') {
            chordName += 'add9';
        } else if (joystickPosition === 'right') {
            chordName += '6';
        }

        return `${selectedKey} ${chordName}`;
    };

    handleStartAudio = async () => {
        await this.ensureAudioReady();
    };

    render() {
        const { selectedKey, octave, synthType, playMode, inversion, joystickPosition, lastPlayedChord, lastPlayedNotes, sequencerSlots, recordingIndex, playingIndex, arpPattern, arpSpeed, noteLength, bpm, menuOpen, showMetronome, showSequencer, showArpSettings, showEffects, showScaleViz, showHelp, isLoading, audioReady } = this.state;

        if (isLoading) {
            return (
                <div className="App loading">
                    <div className="loading-screen">
                        <div className="loading-spinner"></div>
                        <h2>Loading Audio Engine...</h2>
                        <p>Initializing Tone.js</p>
                    </div>
                </div>
            );
        }

        if (!audioReady) {
            return (
                <div className="App">
                    <div className="audio-start-overlay" onClick={this.handleStartAudio}>
                        <div className="audio-start-content">
                            <h1>Metju.Chord</h1>
                            <button className="audio-start-button">
                                Click to Start
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="App">
                <FeatureMenu
                    isOpen={menuOpen}
                    onToggle={this.handleMenuToggle}
                    showMetronome={showMetronome}
                    showSequencer={showSequencer}
                    showArpSettings={showArpSettings}
                    showEffects={showEffects}
                    showScaleViz={showScaleViz}
                    theme={this.state.theme}
                    onMetronomeToggle={this.handleMetronomeToggle}
                    onSequencerToggle={this.handleSequencerToggle}
                    onArpSettingsToggle={this.handleArpSettingsToggle}
                    onEffectsToggle={this.handleEffectsToggle}
                    onScaleVizToggle={this.handleScaleVizToggle}
                    onThemeToggle={this.handleThemeToggle}
                    onHelpToggle={this.handleHelpToggle}
                />

                <HelpPanel
                    isOpen={showHelp}
                    onClose={this.handleHelpToggle}
                />

                <header className="App-header">
                    <h1>Metju.Chord</h1>

                    <div className="top-row">
                        <SettingsPanel
                            selectedKey={selectedKey}
                            octave={octave}
                            synthType={synthType}
                            playMode={playMode}
                            inversion={inversion}
                            arpPattern={arpPattern}
                            arpSpeed={arpSpeed}
                            noteLength={noteLength}
                            showArpSettings={showArpSettings}
                            onKeyChange={this.handleKeyChange}
                            onOctaveChange={this.handleOctaveChange}
                            onSynthChange={this.handleSynthChange}
                            onPlayModeChange={this.handlePlayModeChange}
                            onInversionChange={this.handleInversionChange}
                            onArpPatternChange={this.handleArpPatternChange}
                            onArpSpeedChange={this.handleArpSpeedChange}
                            onNoteLengthChange={this.handleNoteLengthChange}
                        />
                        <ChordDisplay chordName={lastPlayedChord} notes={lastPlayedNotes} />
                    </div>

                    {showScaleViz && (
                        <ScaleVisualizer
                            selectedKey={selectedKey}
                            lastPlayedNotes={lastPlayedNotes}
                        />
                    )}

                    <div className="middle-row">
                        <ChordGrid onChordChange={this.handleJoystickChange} />
                        <div className="button-container">
                            <h3 className="button-container-title">SCALE DEGREES</h3>
                            <div className="button-row button-row-top">
                                <NoteButton notes={this.getNotesForButton(1)} label="ii" synth={this.synth} playMode={playMode} onPlay={this.handleChordPlayed} arpPattern={arpPattern} arpSpeed={arpSpeed} noteLength={noteLength} />
                                <NoteButton notes={this.getNotesForButton(3)} label="IV" synth={this.synth} playMode={playMode} onPlay={this.handleChordPlayed} arpPattern={arpPattern} arpSpeed={arpSpeed} noteLength={noteLength} />
                                <NoteButton notes={this.getNotesForButton(5)} label="vi" synth={this.synth} playMode={playMode} onPlay={this.handleChordPlayed} arpPattern={arpPattern} arpSpeed={arpSpeed} noteLength={noteLength} />
                            </div>
                            <div className="button-row button-row-bottom">
                                <NoteButton notes={this.getNotesForButton(0)} label="I" synth={this.synth} playMode={playMode} onPlay={this.handleChordPlayed} arpPattern={arpPattern} arpSpeed={arpSpeed} noteLength={noteLength} />
                                <NoteButton notes={this.getNotesForButton(2)} label="iii" synth={this.synth} playMode={playMode} onPlay={this.handleChordPlayed} arpPattern={arpPattern} arpSpeed={arpSpeed} noteLength={noteLength} />
                                <NoteButton notes={this.getNotesForButton(4)} label="V" synth={this.synth} playMode={playMode} onPlay={this.handleChordPlayed} arpPattern={arpPattern} arpSpeed={arpSpeed} noteLength={noteLength} />
                                <NoteButton notes={this.getNotesForButton(6)} label="vii" synth={this.synth} playMode={playMode} onPlay={this.handleChordPlayed} arpPattern={arpPattern} arpSpeed={arpSpeed} noteLength={noteLength} />
                            </div>
                        </div>
                    </div>

                    <div className="bottom-row">
                        {showSequencer && (
                            <Sequencer
                                slots={sequencerSlots}
                                recordingIndex={recordingIndex}
                                playingIndex={playingIndex}
                                bpm={this.state.sequencerBpm}
                                onSlotClick={this.handleSequencerSlotClick}
                                onClear={this.handleClearSequencer}
                                onStepFirst={this.handleStepFirst}
                                onStepPrev={this.handleStepPrev}
                                onStepNext={this.handleStepNext}
                                onAddRow={this.handleAddRow}
                                onRemoveRow={this.handleRemoveRow}
                                onCopySlot={this.handleCopySlot}
                                onDeleteSlot={this.handleDeleteSlot}
                                onSetRest={this.handleSetRest}
                                onToggleTie={this.handleToggleTie}
                                onBpmChange={this.handleSequencerBpmChange}
                            />
                        )}

                        {(showMetronome || showEffects) && (
                            <div className={`side-panel-column ${showSequencer && showMetronome && showEffects ? 'stacked' : ''}`}>
                                {showMetronome && (
                                    <Metronome bpm={bpm} onBpmChange={this.handleBpmChange} />
                                )}

                                {showEffects && (
                                    <EffectsPanel synth={this.synth} />
                                )}
                            </div>
                        )}
                    </div>
                </header>
            </div>
        );
    }
}

export default App;
