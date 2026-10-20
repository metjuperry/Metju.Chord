import React, { Component } from 'react';
import './App.css';
import NoteButton from './NoteButton';
import ChordGrid from './ChordGrid';
import { MusicalKey } from './ScalePicker';
import ChordDisplay from './ChordDisplay';
import SettingsPanel from './SettingsPanel';
import Sequencer, { SequencerSlot, SlotCell, REST_SLOT, sameChord } from './Sequencer';
import Metronome from './Metronome';
import FeatureMenu from './FeatureMenu';
import EffectsPanel from './EffectsPanel';
import ScaleVisualizer from './ScaleVisualizer';
import HelpPanel from './HelpPanel';
import { ArpPattern, ChordParams, ChordType, maxInversion, resolveChord } from './theory';
import { engine, ArpRate } from './audio/engine';
import { InstrumentId } from './audio/instruments';
import * as Tone from 'tone';

type PlayMode = 'Chord' | 'Arp';

// ChordGrid joystick positions -> chord types
const POSITION_TYPE: { [position: string]: ChordType } = {
    'neutral': 'root',
    'maj/min': 'triad',
    'dim': 'dim',
    'aug': 'aug',
    '7': 'dom7',
    'maj/min7': 'diatonic7',
    'maj/min9': 'diatonic9',
    'sus4': 'sus4',
    'sus2/maj6': 'sus2',
};

// Number keys 1-7 -> scale degrees
const KEY_DEGREE: { [key: string]: number } = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6 };

const EMPTY_ROW = (): SlotCell[] => Array(8).fill(null);

interface AppState {
    selectedKey: MusicalKey;
    octave: number;
    synthType: InstrumentId;
    playMode: PlayMode;
    inversion: number;
    joystickPosition: string;
    lastPlayedChord: string;
    lastPlayedNotes: string[];
    sequencerSlots: SlotCell[];
    recordingIndex: number | null;
    playingIndex: number | null;
    isSequencerPlaying: boolean;
    loopMode: boolean;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    noteLength: number;
    bpm: number;
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
    /** Chords currently sounding from a pad or key, keyed by source, so release always matches the press. */
    private holds = new Map<string, () => void>();
    private seqLoop: Tone.Loop | null = null;
    private seqCursor: number | null = null;

    constructor(props: {}) {
        super(props);
        this.state = {
            selectedKey: 'C',
            octave: 4,
            synthType: 'epiano',
            playMode: 'Chord',
            inversion: 0,
            joystickPosition: 'neutral',
            lastPlayedChord: '',
            lastPlayedNotes: [],
            sequencerSlots: EMPTY_ROW(),
            recordingIndex: null,
            playingIndex: null,
            isSequencerPlaying: false,
            loopMode: false,
            arpPattern: 'up',
            arpRate: '8n',
            noteLength: 0.5,
            bpm: 120,
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

    componentDidMount() {
        this.applyTheme(this.state.theme);
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('blur', this.releaseAllHolds);

        // Building nodes does not start the AudioContext; that waits for a user gesture.
        engine.setBpm(this.state.bpm);
        engine.setInstrument(this.state.synthType);
        this.setState({ isLoading: false });
    }

    componentWillUnmount() {
        this.stopSequencer();
        this.releaseAllHolds();
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('blur', this.releaseAllHolds);
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

    // ---- chord resolution ----------------------------------------------------

    chordType = (): ChordType => POSITION_TYPE[this.state.joystickPosition] ?? 'root';

    maxInversion = (): number => maxInversion(this.chordType());

    chordParams = (degree: number): ChordParams => ({
        degree,
        type: this.chordType(),
        inversion: Math.min(this.state.inversion, this.maxInversion()),
        octave: this.state.octave,
    });

    describeSlot = (slot: SequencerSlot) => {
        const chord = resolveChord(this.state.selectedKey, slot);
        return { name: chord.name.symbol, notes: chord.notes };
    };

    // ---- pads and keyboard: one path ------------------------------------------

    handleKeyDown = (event: KeyboardEvent) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

        const degree = KEY_DEGREE[event.key];
        if (degree !== undefined) {
            this.pressChord(`key:${event.key}`, degree);
        }
    };

    handleKeyUp = (event: KeyboardEvent) => {
        this.releaseChord(`key:${event.key}`);
    };

    pressChord = (id: string, degree: number) => {
        if (!this.state.audioReady || this.holds.has(id)) return;

        const { selectedKey, playMode, arpPattern, arpRate, noteLength, recordingIndex, sequencerSlots } = this.state;
        const params = this.chordParams(degree);
        const chord = resolveChord(selectedKey, params);

        const update: Partial<AppState> = {
            lastPlayedChord: chord.name.long,
            lastPlayedNotes: chord.notes,
        };
        if (recordingIndex !== null) {
            const newSlots = [...sequencerSlots];
            newSlots[recordingIndex] = { ...params, playMode };
            update.sequencerSlots = newSlots;
            update.recordingIndex = null; // Stop recording after capturing one chord
        }
        this.setState(update as AppState);

        if (playMode === 'Arp') {
            this.holds.set(id, engine.startArp(chord.midi, { pattern: arpPattern, rate: arpRate, noteLength }));
        } else {
            engine.attack(chord.midi);
            this.holds.set(id, () => engine.release(chord.midi));
        }
    };

    releaseChord = (id: string) => {
        const stop = this.holds.get(id);
        if (stop) {
            this.holds.delete(id);
            stop();
        }
    };

    releaseAllHolds = () => {
        Array.from(this.holds.keys()).forEach(this.releaseChord);
    };

    handlePadPress = (degree: number) => this.pressChord(`pad:${degree}`, degree);
    handlePadRelease = (degree: number) => this.releaseChord(`pad:${degree}`);

    ensureAudioReady = async () => {
        if (!this.state.audioReady) {
            await Tone.start();
            this.setState({ audioReady: true });
        }
    };

    // ---- settings ---------------------------------------------------------------

    handleKeyChange = (key: MusicalKey) => {
        this.setState({ selectedKey: key });
    };

    handleOctaveChange = (octave: number) => {
        this.setState({ octave });
    };

    handleSynthChange = (synthType: InstrumentId) => {
        this.setState({ synthType });
        engine.setInstrument(synthType);
    };

    handlePlayModeChange = (playMode: PlayMode) => {
        this.setState({ playMode });
    };

    handleInversionChange = (change: number) => {
        this.setState((prevState) => ({
            inversion: Math.max(0, Math.min(this.maxInversion(), prevState.inversion + change))
        }));
    };

    handleArpPatternChange = (arpPattern: ArpPattern) => {
        this.setState({ arpPattern });
    };

    handleArpRateChange = (arpRate: ArpRate) => {
        this.setState({ arpRate });
    };

    handleNoteLengthChange = (noteLength: number) => {
        this.setState({ noteLength });
    };

    handleBpmChange = (bpm: number) => {
        engine.setBpm(bpm);
        this.setState({ bpm });
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
        const max = maxInversion(POSITION_TYPE[position] ?? 'root');
        this.setState(prev => ({ joystickPosition: position, inversion: Math.min(prev.inversion, max) }));
    };

    // ---- sequencer editing --------------------------------------------------------

    handleSequencerSlotClick = (index: number) => {
        this.setState((prevState) => ({
            // If clicking on the currently recording slot, cancel recording
            recordingIndex: prevState.recordingIndex === index ? null : index
        }));
    };

    handleClearSequencer = () => {
        this.stopSequencer();
        this.setState({
            sequencerSlots: EMPTY_ROW(),
            recordingIndex: null,
            playingIndex: null,
        });
    };

    handleAddRow = () => {
        this.setState(prev => ({ sequencerSlots: [...prev.sequencerSlots, ...EMPTY_ROW()] }));
    };

    handleRemoveRow = () => {
        const { sequencerSlots } = this.state;
        if (sequencerSlots.length > 8) {
            this.setState({
                sequencerSlots: sequencerSlots.slice(0, -8),
                recordingIndex: null,
                playingIndex: null,
            });
        }
    };

    private setSlot = (index: number, slot: SlotCell) => {
        const newSlots = [...this.state.sequencerSlots];
        newSlots[index] = slot;
        this.setState({ sequencerSlots: newSlots });
    };

    handleCopySlot = (targetIndex: number, copiedSlot: SequencerSlot) => {
        this.setSlot(targetIndex, { ...copiedSlot });
    };

    handleDeleteSlot = (index: number) => {
        this.setSlot(index, null);
    };

    handleSetRest = (index: number) => {
        this.setSlot(index, { ...REST_SLOT });
    };

    handleToggleTie = (index: number) => {
        const slot = this.state.sequencerSlots[index];
        if (slot) this.setSlot(index, { ...slot, isTied: !slot.isTied });
    };

    // ---- sequencer playback (Tone.Transport) --------------------------------------

    /** Plays one slot. With `time` (from a Transport callback) audio is scheduled on the audio clock and the UI follows via Draw. */
    playSequencerSlot = (index: number, time?: number) => {
        const { sequencerSlots, selectedKey, arpPattern, arpRate, noteLength } = this.state;
        const slot = sequencerSlots[index];
        if (!slot) return;

        const chord = slot.isRest ? null : resolveChord(selectedKey, slot);
        const showSlot = () => this.setState({
            lastPlayedChord: chord ? chord.name.long : 'REST',
            lastPlayedNotes: chord ? chord.notes : [],
            playingIndex: index,
        });
        if (time === undefined) {
            showSlot();
        } else {
            Tone.getDraw().schedule(showSlot, time);
        }

        if (!chord) return;

        // A tied slot sustains the previous chord instead of retriggering
        const prev = index > 0 ? sequencerSlots[index - 1] : null;
        if (prev && prev.isTied && sameChord(prev, slot)) return;

        // Length of the tie chain starting here, in steps
        let steps = 1;
        for (let i = index; sequencerSlots[i]?.isTied && sequencerSlots[i + 1] && sameChord(sequencerSlots[i]!, sequencerSlots[i + 1]!); i++) {
            steps++;
        }
        const seconds = steps * Tone.Time('4n').toSeconds();
        const when = time ?? Tone.now();

        if (slot.playMode === 'Arp') {
            engine.scheduleArp(chord.midi, { pattern: arpPattern, rate: arpRate, noteLength }, when, seconds);
        } else {
            engine.playChord(chord.midi, { duration: seconds, time: when });
        }
    };

    /** Next filled slot after `from`, wrapping to the start when looping. */
    private nextFilledSlot = (from: number | null, wrap: boolean): number | null => {
        const { sequencerSlots } = this.state;
        for (let i = (from ?? -1) + 1; i < sequencerSlots.length; i++) {
            if (sequencerSlots[i]) return i;
        }
        return wrap ? sequencerSlots.findIndex(slot => slot) : null;
    };

    toggleSequencer = () => {
        if (this.state.isSequencerPlaying) {
            this.stopSequencer();
        } else {
            this.startSequencer();
        }
    };

    startSequencer = async () => {
        await this.ensureAudioReady();
        if (this.seqLoop) return;

        this.seqCursor = this.state.playingIndex;
        this.seqLoop = new Tone.Loop(time => this.sequencerTick(time), '4n');

        const startAt = engine.quantizedStart('4n');
        engine.acquireTransport('sequencer');
        this.seqLoop.start(startAt);
        this.setState({ isSequencerPlaying: true });
    };

    private sequencerTick = (time: number) => {
        const next = this.nextFilledSlot(this.seqCursor, this.state.loopMode);
        if (next === null || next < 0) {
            Tone.getDraw().schedule(this.stopSequencer, time);
            return;
        }
        this.seqCursor = next;
        this.playSequencerSlot(next, time);
    };

    stopSequencer = () => {
        if (this.seqLoop) {
            this.seqLoop.stop();
            this.seqLoop.dispose();
            this.seqLoop = null;
            engine.releaseTransport('sequencer');
        }
        if (this.state.isSequencerPlaying) {
            this.setState({ isSequencerPlaying: false });
        }
    };

    handleLoopToggle = () => {
        this.setState(prev => ({ loopMode: !prev.loopMode }));
    };

    handleStepFirst = () => {
        // Reset cursor to beginning (no slot selected)
        this.setState({ playingIndex: null });
    };

    handleStepPrev = () => {
        const { playingIndex, sequencerSlots } = this.state;
        const from = playingIndex === null ? sequencerSlots.length : playingIndex;

        // Previous filled slot, wrapping to the last one
        for (let step = 1; step <= sequencerSlots.length; step++) {
            const i = (((from - step) % sequencerSlots.length) + sequencerSlots.length) % sequencerSlots.length;
            if (sequencerSlots[i]) {
                this.playSequencerSlot(i);
                return;
            }
        }
    };

    handleStepNext = () => {
        const { playingIndex } = this.state;
        const next = this.nextFilledSlot(playingIndex, true);
        if (next !== null && next >= 0) {
            this.playSequencerSlot(next);
        }
    };

    renderPad = (degree: number, label: string) => (
        <NoteButton label={label} degree={degree} onPress={this.handlePadPress} onRelease={this.handlePadRelease} />
    );

    handleStartAudio = async () => {
        await this.ensureAudioReady();
    };

    render() {
        const { selectedKey, octave, synthType, playMode, inversion, joystickPosition, lastPlayedChord, lastPlayedNotes, sequencerSlots, recordingIndex, playingIndex, arpPattern, arpRate, noteLength, bpm, isSequencerPlaying, loopMode, menuOpen, showMetronome, showSequencer, showArpSettings, showEffects, showScaleViz, showHelp, isLoading, audioReady } = this.state;

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
                            maxInversion={this.maxInversion()}
                            arpPattern={arpPattern}
                            arpRate={arpRate}
                            noteLength={noteLength}
                            showArpSettings={showArpSettings}
                            onKeyChange={this.handleKeyChange}
                            onOctaveChange={this.handleOctaveChange}
                            onSynthChange={this.handleSynthChange}
                            onPlayModeChange={this.handlePlayModeChange}
                            onInversionChange={this.handleInversionChange}
                            onArpPatternChange={this.handleArpPatternChange}
                            onArpRateChange={this.handleArpRateChange}
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
                                {this.renderPad(1, 'ii')}
                                {this.renderPad(3, 'IV')}
                                {this.renderPad(5, 'vi')}
                            </div>
                            <div className="button-row button-row-bottom">
                                {this.renderPad(0, 'I')}
                                {this.renderPad(2, 'iii')}
                                {this.renderPad(4, 'V')}
                                {this.renderPad(6, 'vii')}
                            </div>
                        </div>
                    </div>

                    <div className="bottom-row">
                        {showSequencer && (
                            <Sequencer
                                slots={sequencerSlots}
                                recordingIndex={recordingIndex}
                                playingIndex={playingIndex}
                                isPlaying={isSequencerPlaying}
                                loopMode={loopMode}
                                bpm={bpm}
                                describeSlot={this.describeSlot}
                                onSlotClick={this.handleSequencerSlotClick}
                                onClear={this.handleClearSequencer}
                                onStepFirst={this.handleStepFirst}
                                onStepPrev={this.handleStepPrev}
                                onStepNext={this.handleStepNext}
                                onTogglePlay={this.toggleSequencer}
                                onToggleLoop={this.handleLoopToggle}
                                onAddRow={this.handleAddRow}
                                onRemoveRow={this.handleRemoveRow}
                                onCopySlot={this.handleCopySlot}
                                onDeleteSlot={this.handleDeleteSlot}
                                onSetRest={this.handleSetRest}
                                onToggleTie={this.handleToggleTie}
                                onBpmChange={this.handleBpmChange}
                            />
                        )}

                        {(showMetronome || showEffects) && (
                            <div className={`side-panel-column ${showSequencer && showMetronome && showEffects ? 'stacked' : ''}`}>
                                {showMetronome && (
                                    <Metronome bpm={bpm} onBpmChange={this.handleBpmChange} />
                                )}

                                {showEffects && (
                                    <EffectsPanel />
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
