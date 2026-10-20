import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import './App.css';
import TopBar, { BPM_MAX, BPM_MIN, OCTAVE_MAX, OCTAVE_MIN } from './components/TopBar';
import Device, { PadView, ScreenView } from './components/Device';
import SoundPanel from './components/SoundPanel';
import Progression from './components/Progression';
import HelpDialog from './components/HelpDialog';
import {
    ArpPattern, ChordParams, MusicalKey, ResolvedChord, StickDir,
    STICK_DIRS, resolveChord, romanNumeral, scalePitchClasses, stickChordType, triadQuality,
} from './theory';
import { ArpRate, getEngine } from './audio/engine';
import { INSTRUMENTS, InstrumentId } from './audio/instruments';
import { ARP_RATES } from './components/SoundPanel';
import {
    BEATS_PER_BAR, STEPS_PER_ROW, Clip, ClipSound, PlayMode, clipAt, clipEnd, fitTo, isChordClip, loopEnd, place, remove, setLength, split,
} from './progression';

const DEGREE_KEYS: { [code: string]: number } = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6 };
const STICK_KEYS: { [code: string]: StickDir } = {
    KeyQ: 'UL', KeyW: 'U', KeyE: 'UR', KeyA: 'L', KeyS: 'C', KeyD: 'R', KeyZ: 'DL', KeyX: 'D', KeyC: 'DR',
};
const INVERSION_LABELS = ['ROOT POS', '1ST INV', '2ND INV', '3RD INV'];
const ARP_PATTERN_LABELS: { [p in ArpPattern]: string } = { up: 'up', down: 'down', upDown: 'up-down', random: 'random' };
const MAX_INVERSION = 3;

/** What the screen shows: the last chord struck, by a pad or by the progression. */
interface Shown {
    chord: ResolvedChord;
    degree: number;
    dir: StickDir;
    inversion: number;
}

interface Hold {
    degree: number;
    stop: () => void;
}

const App: React.FC = () => {
    // ---- settings ---------------------------------------------------------------
    const [audioReady, setAudioReady] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [selectedKey, setSelectedKey] = useState<MusicalKey>('C');
    const [octave, setOctave] = useState(4);
    const [bpm, setBpm] = useState(100);
    const [instrument, setInstrument] = useState<InstrumentId>('epiano');
    const [playMode, setPlayMode] = useState<PlayMode>('Chord');
    const [arpPattern, setArpPattern] = useState<ArpPattern>('up');
    const [arpRate, setArpRate] = useState<ArpRate>('8n');
    const [noteLength, setNoteLength] = useState(0.3);
    const [inversion, setInversion] = useState(0);
    const [helpOpen, setHelpOpen] = useState(false);

    // ---- stick: a latched direction (mouse) and momentary ones (held keys) --------
    const [latchedDir, setLatchedDir] = useState<StickDir>('C');
    const [keyDirs, setKeyDirs] = useState<StickDir[]>([]);
    const stickDir: StickDir = keyDirs.length ? keyDirs[keyDirs.length - 1] : latchedDir;

    // ---- playing ------------------------------------------------------------------
    const holds = useRef(new Map<string, Hold>());
    const [held, setHeld] = useState<number[]>([]);
    const [shown, setShown] = useState<Shown | null>(null);

    // ---- progression ----------------------------------------------------------------
    const [total, setTotal] = useState(STEPS_PER_ROW);
    const [clips, setClips] = useState<Clip[]>([]);
    const [selected, setSelected] = useState(0);
    const [playhead, setPlayhead] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(true);
    const [recording, setRecording] = useState(false);
    const [clipboard, setClipboard] = useState<Clip | null>(null);
    const seqLoop = useRef<Tone.Loop | null>(null);
    const seqBeat = useRef(0);

    // ---- metronome ------------------------------------------------------------------
    const [metronomeOn, setMetronomeOn] = useState(false);
    const [metBeat, setMetBeat] = useState<number | null>(null);

    // Latest state for Transport callbacks and the global key handler
    const live = useRef({ selectedKey, octave, inversion, stickDir, instrument, playMode, arpPattern, arpRate, noteLength, clips, total, selected, loop, recording });
    live.current = { selectedKey, octave, inversion, stickDir, instrument, playMode, arpPattern, arpRate, noteLength, clips, total, selected, loop, recording };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // ---- audio start --------------------------------------------------------------

    const startAudio = async () => {
        if (audioReady) return;
        await Tone.start();
        const engine = getEngine(); // built on first use, after the user gesture
        engine.setBpm(bpm);
        engine.setInstrument(instrument);
        setAudioReady(true);
    };

    useEffect(() => {
        if (audioReady) getEngine().setBpm(bpm);
    }, [bpm, audioReady]);

    useEffect(() => {
        if (audioReady) getEngine().setInstrument(instrument);
    }, [instrument, audioReady]);

    // ---- chords -------------------------------------------------------------------

    const paramsFor = (degree: number, dir: StickDir, s = live.current): ChordParams => ({
        degree,
        type: stickChordType(dir, triadQuality(degree)),
        inversion: s.inversion,
        octave: s.octave,
    });

    /** The sound settings a chord recorded right now would be baked with. */
    const currentSound = (s = live.current): ClipSound => ({
        key: s.selectedKey,
        instrument: s.instrument,
        playMode: s.playMode,
        arpPattern: s.arpPattern,
        arpRate: s.arpRate,
        noteLength: s.noteLength,
    });

    /** Start a chord sounding; returns how to stop it. */
    const sound = (degree: number) => {
        const s = live.current;
        const params = paramsFor(degree, s.stickDir, s);
        const chord = resolveChord(s.selectedKey, params);
        const engine = getEngine();
        let stop: () => void;
        if (s.playMode === 'Arp') {
            stop = engine.startArp(chord.midi, { pattern: s.arpPattern, rate: s.arpRate, noteLength: s.noteLength });
        } else {
            stop = engine.attack(chord.midi);
        }
        setShown({ chord, degree, dir: s.stickDir, inversion: s.inversion });
        return { params, stop };
    };

    const syncHeld = () => setHeld(Array.from(holds.current.values()).map(h => h.degree));

    const pressPad = (id: string, degree: number) => {
        if (!audioReady || holds.current.has(id)) return;
        const { params, stop } = sound(degree);
        holds.current.set(id, { degree, stop });
        syncHeld();

        const s = live.current;
        if (s.recording) {
            setClips(place(s.clips, { start: s.selected, len: 1, chord: { ...params, ...currentSound(s) } }));
            setSelected(Math.min(s.selected + 1, s.total - 1));
            setPlayhead(Math.min(s.selected + 1, s.total - 1));
        }
    };

    const releasePad = (id: string) => {
        const hold = holds.current.get(id);
        if (!hold) return;
        holds.current.delete(id);
        hold.stop();
        syncHeld();
    };

    const releaseAll = () => {
        Array.from(holds.current.keys()).forEach(releasePad);
        setKeyDirs([]);
    };

    // Moving the stick (or changing voicing) while a pad is held re-voices the held chord, like the hardware
    useEffect(() => {
        if (!audioReady || holds.current.size === 0) return;
        holds.current.forEach((hold, id) => {
            hold.stop();
            holds.current.set(id, { degree: hold.degree, stop: sound(hold.degree).stop });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stickDir, inversion, octave, selectedKey, instrument, playMode, arpPattern, arpRate]);

    // ---- progression playback (Transport) --------------------------------------------

    const stopPlayback = useCallback(() => {
        if (seqLoop.current) {
            seqLoop.current.stop();
            seqLoop.current.dispose();
            seqLoop.current = null;
            getEngine().releaseTransport('sequencer');
        }
        setPlaying(false);
    }, []);

    const tick = (time: number) => {
        const s = live.current;
        const lastEnd = s.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
        const end = s.loop ? Math.min(loopEnd(s.clips), s.total) : lastEnd;
        let beat = seqBeat.current;
        if (beat >= end) {
            if (!s.loop || lastEnd === 0) {
                Tone.getDraw().schedule(stopPlayback, time);
                return;
            }
            beat = 0;
        }
        seqBeat.current = beat + 1;

        // Each clip plays with the key, instrument and settings it was recorded with.
        // The screen, stick and keyboard strip belong to live playing only, so nothing here touches them.
        const clip = s.clips.find(c => c.start === beat);
        if (isChordClip(clip)) {
            const c = clip.chord;
            const chord = resolveChord(c.key, c);
            const seconds = clip.len * Tone.Time('4n').toSeconds();
            const engine = getEngine();
            if (c.playMode === 'Arp') {
                engine.scheduleArp(chord.midi, { pattern: c.arpPattern, rate: c.arpRate, noteLength: c.noteLength }, time, seconds, c.instrument);
            } else {
                engine.playChord(chord.midi, { duration: seconds * 0.98, time, instrument: c.instrument });
            }
        }
        Tone.getDraw().schedule(() => setPlayhead(beat), time);
    };

    const startPlayback = async () => {
        await startAudio();
        if (seqLoop.current) return;
        const s = live.current;
        seqBeat.current = playhead >= (s.loop ? loopEnd(s.clips) : s.total) ? 0 : playhead;
        const engine = getEngine();
        seqLoop.current = new Tone.Loop(t => tickRef.current(t), '4n');
        const startAt = engine.quantizedStart('4n');
        engine.acquireTransport('sequencer');
        seqLoop.current.start(startAt);
        setPlaying(true);
    };
    const tickRef = useRef(tick);
    tickRef.current = tick;

    const togglePlay = () => (playing ? stopPlayback() : startPlayback());

    useEffect(() => () => stopPlayback(), [stopPlayback]);

    // ---- metronome ------------------------------------------------------------------

    useEffect(() => {
        if (!metronomeOn || !audioReady) return;
        const engine = getEngine();
        const click = new Tone.MembraneSynth({
            pitchDecay: 0.008,
            octaves: 2,
            envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
        }).connect(engine.master);
        click.volume.value = -8;
        const quarter = Tone.Time('4n').toTicks();
        const metLoop = new Tone.Loop(time => {
            // Count beats from the Transport so the accent lands on the progression's bar lines
            const beat = Math.round(Tone.getTransport().getTicksAtTime(time) / quarter) % BEATS_PER_BAR;
            click.triggerAttackRelease(beat === 0 ? 'C5' : 'C4', '32n', time);
            Tone.getDraw().schedule(() => setMetBeat(beat), time);
        }, '4n');
        const startAt = engine.quantizedStart('4n');
        engine.acquireTransport('metronome');
        metLoop.start(startAt);
        return () => {
            metLoop.stop();
            metLoop.dispose();
            engine.releaseTransport('metronome');
            click.dispose();
            setMetBeat(null);
        };
    }, [metronomeOn, audioReady]);

    // ---- progression editing -----------------------------------------------------------

    const selClip = clipAt(clips, selected);
    const select = (beat: number) => {
        setSelected(beat);
        if (!playing) setPlayhead(beat);
    };
    const starts = clips.map(c => c.start);
    const edit = {
        longer: () => selClip && setClips(setLength(clips, selClip, selClip.len + 1, total)),
        shorter: () => selClip && setClips(setLength(clips, selClip, selClip.len - 1, total)),
        split: () => selClip && setClips(split(clips, selClip, selected)),
        copy: () => selClip && setClipboard(selClip),
        paste: () => clipboard && setClips(place(clips, { ...clipboard, start: selected, len: Math.min(clipboard.len, total - selected) })),
        rest: () => {
            const base = selClip ?? { start: selected, len: 1 };
            setClips(place(selClip ? remove(clips, selClip) : clips, { start: base.start, len: base.len, rest: true }));
        },
        del: () => selClip && setClips(remove(clips, selClip)),
        restamp: () => isChordClip(selClip) && setClips(place(remove(clips, selClip), { ...selClip, chord: { ...selClip.chord, ...currentSound() } })),
        clearAll: () => {
            stopPlayback();
            setClips([]);
            setSelected(0);
            setPlayhead(0);
        },
        addRow: () => setTotal(total + STEPS_PER_ROW),
        removeRow: () => {
            if (total <= STEPS_PER_ROW) return;
            const next = total - STEPS_PER_ROW;
            setTotal(next);
            setClips(fitTo(clips, next));
            setSelected(Math.min(selected, next - 1));
            setPlayhead(Math.min(playhead, next - 1));
        },
        first: () => select(0),
        prev: () => {
            const t = starts.filter(x => x < selected).pop();
            select(t ?? 0);
        },
        next: () => {
            const t = starts.find(x => x > selected);
            if (t !== undefined) select(t);
        },
    };

    // ---- keyboard -----------------------------------------------------------------------

    const keyActions = useRef({ pressPad, releasePad, releaseAll, togglePlay, edit, helpOpen });
    keyActions.current = { pressPad, releasePad, releaseAll, togglePlay, edit, helpOpen };

    useEffect(() => {
        const isTyping = (t: EventTarget | null) =>
            t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

        const down = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const a = keyActions.current;
            if (e.code === 'Escape') {
                setHelpOpen(false);
                setLatchedDir('C');
                return;
            }
            if (a.helpOpen || isTyping(e.target)) return;

            if (e.code in DEGREE_KEYS) {
                if (!e.repeat) a.pressPad(`key:${e.code}`, DEGREE_KEYS[e.code]);
                return;
            }
            if (e.code in STICK_KEYS) {
                if (!e.repeat) {
                    const dir = STICK_KEYS[e.code];
                    setKeyDirs(d => [...d.filter(x => x !== dir), dir]);
                }
                return;
            }
            const handled = () => e.preventDefault();
            switch (e.code) {
                case 'ArrowLeft': handled(); setInversion(i => Math.max(0, i - 1)); break;
                case 'ArrowRight': handled(); setInversion(i => Math.min(MAX_INVERSION, i + 1)); break;
                case 'ArrowUp': handled(); setOctave(o => Math.min(OCTAVE_MAX, o + 1)); break;
                case 'ArrowDown': handled(); setOctave(o => Math.max(OCTAVE_MIN, o - 1)); break;
                case 'Space': handled(); if (!e.repeat) a.togglePlay(); break;
                case 'KeyR': if (!e.repeat) setRecording(r => !r); break;
                case 'BracketLeft': a.edit.shorter(); break;
                case 'BracketRight': a.edit.longer(); break;
                case 'Slash': handled(); a.edit.split(); break;
                case 'Period': a.edit.rest(); break;
                case 'Backspace':
                case 'Delete': handled(); a.edit.del(); break;
            }
        };
        const up = (e: KeyboardEvent) => {
            if (e.code in DEGREE_KEYS) keyActions.current.releasePad(`key:${e.code}`);
            if (e.code in STICK_KEYS) {
                const dir = STICK_KEYS[e.code];
                setKeyDirs(d => d.filter(x => x !== dir));
            }
        };
        const blur = () => keyActions.current.releaseAll();
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
        };
    }, []);

    // ---- views ------------------------------------------------------------------------

    const pads: PadView[] = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(degree => ({
        degree,
        numeral: romanNumeral(degree),
        symbol: resolveChord(selectedKey, { degree, type: stickChordType(stickDir, triadQuality(degree)), inversion, octave }).name.symbol,
        held: held.includes(degree),
    })), [selectedKey, stickDir, inversion, octave, held]);

    // The stick labels follow the pad you're using: a held pad, else the last chord played, else 1
    const refDegree = held.length ? held[held.length - 1] : shown ? shown.degree : 0;
    const stickChords = Object.fromEntries(STICK_DIRS.map(d => [d,
        resolveChord(selectedKey, { degree: refDegree, type: stickChordType(d, triadQuality(refDegree)), inversion, octave }).name.symbol,
    ])) as { [d in StickDir]: string };

    const instrumentLabel = INSTRUMENTS.find(i => i.id === instrument)?.label ?? '';
    const screen: ScreenView = shown
        ? {
            idle: false,
            symbol: shown.chord.name.symbol,
            long: shown.chord.name.long,
            numeral: romanNumeral(shown.degree),
            notes: shown.chord.notes,
            stick: shown.dir,
            inversionLabel: INVERSION_LABELS[Math.min(shown.inversion, shown.chord.midi.length - 1)],
            status: [`${selectedKey} MAJOR`, `OCT ${octave}`, `${bpm} BPM`, `${playMode} · ${instrumentLabel}`],
        }
        : {
            idle: true, symbol: '', long: '', numeral: '', notes: [], stick: 'C', inversionLabel: '',
            status: [`${selectedKey} MAJOR`, `OCT ${octave}`, `${bpm} BPM`, `${playMode} · ${instrumentLabel}`],
        };

    const sounding = shown && held.length > 0 ? shown.chord.midi : [];
    const maxInv = Math.min(MAX_INVERSION, Math.max(...pads.map(p =>
        resolveChord(selectedKey, paramsFor(p.degree, stickDir)).midi.length - 1)));

    const labelOf = (id: InstrumentId) => INSTRUMENTS.find(i => i.id === id)?.label ?? id;
    const soundText = (c: ClipSound) =>
        [labelOf(c.instrument), c.playMode === 'Arp' ? `Arp ${ARP_PATTERN_LABELS[c.arpPattern]} ${ARP_RATES.find(r => r.rate === c.arpRate)?.label ?? ''}` : null,
            c.key !== selectedKey ? `${c.key} major` : null].filter(Boolean).join(' · ');
    const describe = (clip: Clip) =>
        isChordClip(clip)
            ? { symbol: resolveChord(clip.chord.key, clip.chord).name.symbol, numeral: romanNumeral(clip.chord.degree), sound: soundText(clip.chord) }
            : { symbol: 'Rest', numeral: '', sound: '' };

    const beatDot = metronomeOn ? metBeat : playing ? playhead % BEATS_PER_BAR : null;

    if (!audioReady) {
        return (
            <div className="start-screen">
                <button className="start-card" onClick={startAudio}>
                    <span className="start-logo">metju<span>.</span>chord</span>
                    <span className="start-cta">Click to start</span>
                    <span className="start-note">Your browser needs a click before it can play sound.</span>
                </button>
            </div>
        );
    }

    return (
        <div className="app">
            <TopBar
                selectedKey={selectedKey}
                octave={octave}
                bpm={bpm}
                metronomeOn={metronomeOn}
                beat={beatDot}
                theme={theme}
                onKeyChange={setSelectedKey}
                onOctaveChange={o => setOctave(Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, o)))}
                onBpmChange={b => setBpm(Math.max(BPM_MIN, Math.min(BPM_MAX, b)))}
                onToggleMetronome={() => setMetronomeOn(m => !m)}
                onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
                onOpenHelp={() => setHelpOpen(true)}
            />

            <main className="main-row">
                <Device
                    screen={screen}
                    sounding={sounding}
                    scalePcs={scalePitchClasses(selectedKey)}
                    octave={octave}
                    pads={pads}
                    stickDir={stickDir}
                    latchedDir={latchedDir}
                    stickChords={stickChords}
                    stickFor={`${refDegree + 1} · ${romanNumeral(refDegree)}`}
                    inversion={inversion}
                    maxInversion={maxInv}
                    recording={recording}
                    onPadDown={d => pressPad(`pad:${d}`, d)}
                    onPadUp={d => releasePad(`pad:${d}`)}
                    onStick={setLatchedDir}
                    onInversion={setInversion}
                />
                <SoundPanel
                    instrument={instrument}
                    playMode={playMode}
                    arpPattern={arpPattern}
                    arpRate={arpRate}
                    noteLength={noteLength}
                    onInstrument={setInstrument}
                    onPlayMode={setPlayMode}
                    onArpPattern={setArpPattern}
                    onArpRate={setArpRate}
                    onNoteLength={setNoteLength}
                />
            </main>

            <Progression
                total={total}
                clips={clips}
                selected={selected}
                playhead={playhead}
                playing={playing}
                loop={loop}
                recording={recording}
                canPaste={!!clipboard}
                describe={describe}
                onSelect={select}
                onTogglePlay={togglePlay}
                onFirst={edit.first}
                onPrev={edit.prev}
                onNext={edit.next}
                onToggleLoop={() => setLoop(l => !l)}
                onToggleRecord={() => setRecording(r => !r)}
                onAddRow={edit.addRow}
                onRemoveRow={edit.removeRow}
                onLonger={edit.longer}
                onShorter={edit.shorter}
                onSplit={edit.split}
                onCopy={edit.copy}
                onPaste={edit.paste}
                onRest={edit.rest}
                onDelete={edit.del}
                onRestamp={edit.restamp}
                currentSound={soundText(currentSound())}
                onClearAll={edit.clearAll}
            />

            <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
    );
};

export default App;
