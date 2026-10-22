import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import './App.css';
import TopBar, { BPM_MAX, BPM_MIN, OCTAVE_MAX, OCTAVE_MIN } from './components/TopBar';
import Device, { PadView, ScreenView, VoicingControls } from './components/Device';
import CompactBar, { AppMode } from './components/CompactBar';
import { useMedia } from './useMedia';
import SoundPanel from './components/SoundPanel';
import Progression from './components/Progression';
import HelpDialog from './components/HelpDialog';
import DrumEditor from './components/DrumEditor';
import IntroScreen, { IntroPhase } from './components/IntroScreen';
import MelodyEditor from './components/MelodyEditor';
import { BassEditor, ChordPartEditor } from './components/PartEditors';
import {
    ChordParams, ResolvedChord, StickDir,
    STICK_DIRS, ScaleId, buildChordMidi, keyPitchClass, resolveChord, romanNumeral, scaleLabel, scalePitchClasses,
    stickChordType, triadQuality, voiceLead,
} from './theory';
import { getEngine } from './audio/engine';
import { INSTRUMENTS, InstrumentId } from './audio/instruments';
import { useHistory } from './useHistory';
import SongMenu from './components/SongMenu';
import {
    STORAGE_KEY, SAVE_VERSION, SavedState, Song, TimeSignature, changeTimeSignature, decodeShare, defaultSettings, encodeShare,
    isCompound, newSong, readSaved, stepsPerRow, ticksPerBar, ticksPerStep, transportBpm,
} from './song';
import { Clip, clipAt, fitTo, isChordClip, place, remove, setLength, split } from './progression';
import {
    BassPart, ChordPart, Harmony, InstrumentPart, MAX_PARTS, Part, PartKind,
    audibleParts, fitNotes, hasInstrument, melodyMidi, musicEnd, musicLoopEnd, newPart, noteAt, partNotes, placeNote, removeNote, resolveClip,
} from './parts';
import { SeqEvent, SeqOptions, SequencerPlayer, ticksToSeconds } from './audio/sequencer';
import {
    DrumPattern, DrumVoice, PatternBars, TICKS_PER_SIXTEENTH, emptyPattern, expandPattern, hasHit, presetsFor, setBars,
    sixteenthsPerBar, sixteenthsPerStep, toggleHit,
} from './drums';
import { CHORD_LANE, MiniNote, PartPatch } from './components/Progression';
import type { ChordStyle } from './components/SoundPanel';

const DEGREE_KEYS: { [code: string]: number } = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6 };
const STICK_KEYS: { [code: string]: StickDir } = {
    KeyQ: 'UL', KeyW: 'U', KeyE: 'UR', KeyA: 'L', KeyS: 'C', KeyD: 'R', KeyZ: 'DL', KeyX: 'D', KeyC: 'DR',
};
const INVERSION_LABELS = ['ROOT POS', '1ST INV', '2ND INV', '3RD INV'];
const MAX_INVERSION = 3;

/** What the sequencer schedules: some notes or a drum hit, and the part that plays them. */
type Scheduled =
    | { midi: number[]; gate?: number; legato: number; part: string; drum?: undefined }
    | { drum: DrumVoice; part: string };

/** How much of each note's length it actually sounds, so repeated notes are struck rather than smeared. */
const LEGATO: { [k in Exclude<PartKind, 'drums'>]: number } = { chords: 0.98, bass: 0.85, melody: 0.95 };

/** Keep the engine's strips in step with the parts: an instrument per instrument part, a kit per drum part. */
function syncParts(engine: ReturnType<typeof getEngine>, parts: Part[]) {
    parts.forEach(p => (hasInstrument(p)
        ? engine.setTrack(p.id, { instrument: p.instrument, volume: p.volume })
        : engine.setDrumTrack(p.id, { volume: p.volume })));
}

interface PlayState { chords: Clip[]; parts: Part[]; barTicks: number; stepTicks: number; total: number; loop: boolean }
/** Where looping playback wraps: the end of the music, rounded up to a bar, but never past the sequencer's length. */
const loopLength = (s: PlayState) => Math.min(musicLoopEnd(s.chords, s.parts, s.barTicks), s.total * s.stepTicks);
/** How far playback goes before it wraps or stops. */
const playLength = (s: PlayState) => (s.loop ? loopLength(s) : musicEnd(s.chords, s.parts, s.barTicks));

/**
 * A chord for the intro, from the song's key: the I, IV, V or vi chord as a 9th (whatever the
 * scale makes of those degrees), with its root doubled two octaves down.
 */
function introChord(key: Song['key'], scale: ScaleId): { name: string; midi: number[] } {
    const degree = [0, 3, 4, 5][Math.floor(Math.random() * 4)];
    const chord = resolveChord(key, { degree, type: 'diatonic9', inversion: 0, octave: 4, scale });
    return { name: chord.name.symbol, midi: [36 + chord.rootPc, ...chord.midi] };
}

/** The song and settings saved in this browser, if any. */
function loadSaved(): SavedState | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? readSaved(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

/** What the screen shows: the last chord struck, by a pad or by the progression. */
interface Shown {
    chord: ResolvedChord;
    degree: number;
    scale: ScaleId;
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
    const [intro, setIntro] = useState<IntroPhase>('idle');
    const [introName, setIntroName] = useState('');
    const [saved] = useState(loadSaved);
    const initial = saved?.settings ?? defaultSettings();
    const [theme, setTheme] = useState<'dark' | 'light'>(initial.theme);
    const [voiceLeading, setVoiceLeading] = useState(initial.voiceLeading);
    const [octave, setOctave] = useState(initial.octave);
    const [inversion, setInversion] = useState(initial.inversion);
    const [notice, setNotice] = useState<string | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);

    // ---- stick: a latched direction (mouse) and momentary ones (held keys) --------
    const [latchedDir, setLatchedDir] = useState<StickDir>('C');
    const [keyDirs, setKeyDirs] = useState<StickDir[]>([]);
    // Touch/mouse hold on the stick; keys win over touch, both win over a latched direction
    const [touchDir, setTouchDir] = useState<StickDir | null>(null);
    const stickDir: StickDir = keyDirs.length ? keyDirs[keyDirs.length - 1] : touchDir ?? latchedDir;

    // Phones and small windows get one mode at a time: Play, Sequencer or Sound
    const compact = useMedia('(max-width: 1023px), (max-height: 560px)');
    const [mode, setMode] = useState<AppMode>('play');

    // ---- playing ------------------------------------------------------------------
    const holds = useRef(new Map<string, Hold>());
    const [held, setHeld] = useState<number[]>([]);
    const [shown, setShown] = useState<Shown | null>(null);

    // ---- progression ----------------------------------------------------------------
    // The song is everything undo/redo and saving cover: tracks, length, tempo, time signature
    const history = useHistory<Song>(() => saved?.song ?? newSong());
    const song = history.state;
    const editSong = history.commit;
    const { chords, parts, steps: total, bpm, timeSignature: ts, key: selectedKey, scale } = song;
    const harmony: Harmony = useMemo(() => ({ chords, key: selectedKey, scale }), [chords, selectedKey, scale]);
    // One step is one beat of the time signature; rows hold whole bars
    const T = ticksPerStep(ts);
    const rowSteps = stepsPerRow(ts);
    const barTicks = ticksPerBar(ts);
    const setChords = (next: Clip[]) => editSong(sg => ({ ...sg, chords: next }));
    const setParts = (update: (ps: Part[]) => Part[], mergeKey?: string) =>
        editSong(sg => ({ ...sg, parts: update(sg.parts) }), mergeKey);
    const setBpm = (b: number) => editSong(sg => ({ ...sg, bpm: b }), 'bpm');
    // Key and scale belong to the song: changing them moves every part with it (and can be undone)
    const setSelectedKey = (k: Song['key']) => editSong(sg => ({ ...sg, key: k }));
    const setScale = (sc: ScaleId) => editSong(sg => ({ ...sg, scale: sc }));

    /** The lane being edited: the chord row, or a part. */
    const [selectedLane, setSelectedLane] = useState(CHORD_LANE);
    const [padPartId, setPadPartId] = useState('');
    const selPart = parts.find(p => p.id === selectedLane);
    const chordParts = parts.filter((p): p is ChordPart => p.kind === 'chords');
    // The chord part the pads play through: the selected one, else the one picked last, else the first
    const padPart: ChordPart = (selPart?.kind === 'chords' ? selPart : undefined)
        ?? chordParts.find(p => p.id === padPartId)
        ?? chordParts[0];
    // The Sound panel edits the selected part's instrument, or the pads' part while the chords or drums are selected
    const soundPart: InstrumentPart = selPart && hasInstrument(selPart) ? selPart : padPart;
    const pickLane = (lane: string) => {
        setSelectedLane(lane);
        if (parts.find(p => p.id === lane)?.kind === 'chords') setPadPartId(lane);
    };
    const updatePart = (id: string, patch: PartPatch | Partial<Part>) =>
        // dragging a volume slider is one undo step, not one per pixel
        setParts(ps => ps.map(p => (p.id === id ? { ...p, ...patch } as Part : p)), 'volume' in patch ? `vol:${id}` : undefined);
    const setInstrument = (id: InstrumentId) => updatePart(soundPart.id, { instrument: id });
    const setChordStyle = (id: string, patch: Partial<ChordStyle>) => updatePart(id, patch as Partial<Part>);
    const clips = chords;
    const [selected, setSelected] = useState(0);
    const [playhead, setPlayhead] = useState(0);
    /** The playhead in 1/16 steps from the top of the song, for the drum grid. */
    const [playSixteenth, setPlaySixteenth] = useState(-1);
    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(initial.loop);
    const [recording, setRecording] = useState(false);
    const [clipboard, setClipboard] = useState<Clip | null>(null);
    const player = useRef<SequencerPlayer<Scheduled> | null>(null);

    // ---- metronome ------------------------------------------------------------------
    const [metronomeOn, setMetronomeOn] = useState(false);
    const [metBeat, setMetBeat] = useState<number | null>(null);

    // Latest state for Transport callbacks and the global key handler
    const liveState = { ts, stepTicks: T, barTicks, selectedKey, scale, voiceLeading, octave, inversion, stickDir, padPart, chords, parts, total, selected, loop, recording };
    const live = useRef(liveState);
    live.current = liveState;

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // ---- audio start --------------------------------------------------------------

    const startAudio = async () => {
        if (audioReady) return;
        await Tone.start();
        const engine = getEngine(); // built on first use, after the user gesture
        engine.setBpm(transportBpm(bpm, ts));
        syncParts(engine, parts);
        engine.selectTrack(padPart.id);
        setAudioReady(true);
    };

    useEffect(() => {
        if (audioReady) getEngine().setBpm(transportBpm(bpm, ts));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bpm, ts.unit, audioReady]);

    // Keep the engine's per-part strips (instrument, volume) in step with the parts
    const engineParts = useRef(new Set<string>());
    useEffect(() => {
        if (!audioReady) return;
        const engine = getEngine();
        syncParts(engine, parts);
        engineParts.current.forEach(id => {
            if (!parts.some(p => p.id === id)) engine.removeTrack(id);
        });
        engineParts.current = new Set(parts.map(p => p.id));
    }, [parts, audioReady]);

    useEffect(() => {
        if (audioReady) getEngine().selectTrack(padPart.id);
    }, [padPart.id, audioReady]);

    // ---- chords -------------------------------------------------------------------

    const paramsFor = (degree: number, dir: StickDir, s = live.current): ChordParams => ({
        degree,
        type: stickChordType(dir, triadQuality(degree, s.scale)),
        inversion: s.inversion,
        octave: s.octave,
        scale: s.scale,
    });

    /** The last chord played live, which voice leading moves from. */
    const lastVoicing = useRef<number[] | null>(null);

    /** Start a chord sounding; returns how to stop it. */
    const sound = (degree: number) => {
        const s = live.current;
        let params = paramsFor(degree, s.stickDir, s);
        if (s.voiceLeading) {
            // choose the inversion and octave that move least from the last chord, and record exactly that
            const base = buildChordMidi(keyPitchClass(s.selectedKey), degree, params.type, params.octave, params.scale);
            const v = voiceLead(base, lastVoicing.current);
            params = { ...params, inversion: v.inversion, octave: params.octave + v.octaveShift };
        }
        const chord = resolveChord(s.selectedKey, params);
        lastVoicing.current = chord.midi;
        const engine = getEngine();
        const style = s.padPart;
        let stop: () => void;
        if (style.playMode === 'Arp') {
            stop = engine.startArp(chord.midi, { pattern: style.arpPattern, rate: style.arpRate, noteLength: style.noteLength });
        } else {
            stop = engine.attack(chord.midi);
        }
        setShown({ chord, degree, scale: s.scale, dir: s.stickDir, inversion: params.inversion });
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
            const { scale: _scale, ...chord } = params;
            setChords(place(s.chords, { start: s.selected * s.stepTicks, len: s.stepTicks, chord }));
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
    }, [stickDir, inversion, octave, selectedKey, scale, voiceLeading, padPart.instrument, padPart.playMode, padPart.arpPattern, padPart.arpRate]);

    // ---- progression playback (Transport) --------------------------------------------

    /** The song as timed events, and how it loops (the grid is in steps, the events in ticks). */
    const schedule = (s = live.current): { events: SeqEvent<Scheduled>[]; opts: SeqOptions } => {
        const h: Harmony = { chords: s.chords, key: s.selectedKey, scale: s.scale };
        return {
            // Mute and solo only affect playback, so a muted part can still be played live from the pads
            events: audibleParts(s.parts).flatMap((p): SeqEvent<Scheduled>[] => (p.kind === 'drums'
                // a drum pattern repeats from the top until the loop (or the song) ends
                ? expandPattern(p.drums, s.ts, playLength(s)).map(hit => ({ tick: hit.tick, duration: TICKS_PER_SIXTEENTH, data: { drum: hit.voice, part: p.id } }))
                : partNotes(p, h, s.stepTicks).map(n => ({
                    tick: n.start, duration: n.len, data: { midi: n.midi, gate: n.gate, legato: LEGATO[p.kind], part: p.id },
                })))),
            opts: { loop: s.loop, loopEnd: loopLength(s), end: musicEnd(s.chords, s.parts, s.barTicks) },
        };
    };

    // Every part plays the chord row its own way; the screen, stick and keyboard strip belong to live
    // playing only, so nothing here touches them.
    const playEvent = (event: SeqEvent<Scheduled>, time: number) => {
        const data = event.data;
        const engine = getEngine();
        if (data.drum) {
            engine.playDrum(data.part, data.drum, time);
            return;
        }
        const seconds = ticksToSeconds(event.duration);
        const duration = data.gate !== undefined ? Math.min(data.gate, seconds) : seconds * data.legato;
        engine.playChord(data.midi, { duration, time, track: data.part });
    };
    const playEventRef = useRef(playEvent);
    playEventRef.current = playEvent;

    const stopPlayback = useCallback(() => {
        player.current?.stop();
        setPlaying(false);
    }, []);

    const startPlayback = async () => {
        await startAudio();
        if (player.current?.playing) return;
        const { opts } = schedule();
        if (!opts.loop && opts.end === 0) return;
        const limit = opts.loop ? opts.loopEnd : opts.end;
        const from = playhead * T < limit ? playhead * T : 0;
        // The player reads the latest clips on every pass, so edits while playing need no extra wiring
        player.current = new SequencerPlayer<Scheduled>(() => schedule(), (e, t) => playEventRef.current(e, t), stopPlayback);
        player.current.start(from);
        setPlaying(true);
    };

    const togglePlay = () => (playing ? stopPlayback() : startPlayback());

    // The playhead follows the Transport position, read once per frame
    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        let last = -1;
        let lastSixteenth = -1;
        const draw = () => {
            const pos = player.current?.position();
            if (pos !== null && pos !== undefined) {
                const step = Math.floor(pos / live.current.stepTicks);
                if (step !== last) {
                    last = step;
                    setPlayhead(step);
                }
                const sixteenth = Math.floor(pos / TICKS_PER_SIXTEENTH);
                if (sixteenth !== lastSixteenth) {
                    lastSixteenth = sixteenth;
                    setPlaySixteenth(sixteenth);
                }
            }
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(frame);
            setPlaySixteenth(-1);
        };
    }, [playing]);

    useEffect(() => () => player.current?.stop(), []);

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
        const beatNote = `${ts.unit}n`;
        const beatTicks = Tone.Time(beatNote).toTicks();
        const compound = isCompound(ts);
        const metLoop = new Tone.Loop(time => {
            // Count beats from the Transport so the accent lands on the progression's bar lines
            const beat = Math.round(Tone.getTransport().getTicksAtTime(time) / beatTicks) % ts.beats;
            // Downbeat high; in 6/8, 9/8 and 12/8 every third beat gets a middle accent
            const note = beat === 0 ? 'C5' : compound && beat % 3 === 0 ? 'G4' : 'C4';
            click.triggerAttackRelease(note, '32n', time);
            Tone.getDraw().schedule(() => setMetBeat(beat), time);
        }, beatNote);
        const startAt = engine.quantizedStart(beatNote);
        engine.acquireTransport('metronome');
        metLoop.start(startAt);
        return () => {
            metLoop.stop();
            metLoop.dispose();
            engine.releaseTransport('metronome');
            click.dispose();
            setMetBeat(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [metronomeOn, audioReady, ts.beats, ts.unit]);

    // ---- progression editing -----------------------------------------------------------

    const totalTicks = total * T;
    const selTick = selected * T;
    const selClip = clipAt(clips, selTick);
    const select = (step: number, lane?: string) => {
        setSelected(step);
        if (lane) pickLane(lane);
        if (!playing) setPlayhead(step);
    };
    const onChordLane = selectedLane === CHORD_LANE || !selPart;
    const partActions = {
        add: (kind: PartKind) => {
            if (parts.length >= MAX_PARTS) return;
            // a drum part starts with the first starter beat for the time signature, so Play just works
            const part = newPart(kind, parts, kind === 'drums' ? presetsFor(ts)[0].make(ts) : undefined);
            setParts(ps => [...ps, part]);
            pickLane(part.id);
        },
        /** The pads need a chord part to play through, so the last one stays. */
        canRemove: (id: string) => {
            const part = parts.find(p => p.id === id);
            return !!part && (part.kind !== 'chords' || chordParts.length > 1);
        },
        remove: (id: string) => {
            if (!partActions.canRemove(id)) return;
            setParts(ps => ps.filter(p => p.id !== id));
            if (id === selectedLane) setSelectedLane(CHORD_LANE);
        },
    };

    // ---- drum pattern editing (the selected drum part) ---------------------------------------
    const drumPart = selPart?.kind === 'drums' ? selPart : null;
    const setPattern = (update: (p: DrumPattern) => DrumPattern, mergeKey?: string) => {
        if (!drumPart) return;
        const id = drumPart.id;
        editSong(sg => {
            const parts = sg.parts.map(p => (p.id === id && p.kind === 'drums' ? { ...p, drums: update(p.drums) } : p));
            // a pattern longer than the sequencer grows it by whole rows, so all of it plays
            const bars = Math.max(0, ...parts.map(p => (p.kind === 'drums' ? p.drums.bars : 0)));
            const row = stepsPerRow(sg.timeSignature);
            const steps = Math.max(sg.steps, Math.ceil((bars * sg.timeSignature.beats) / row) * row);
            return { ...sg, parts, steps };
        }, mergeKey);
    };
    /** Hear a drum on the selected drum part (when tapping it on in the grid, or its name). */
    const auditionDrum = async (voice: DrumVoice) => {
        if (!drumPart) return;
        await startAudio();
        getEngine().playDrum(drumPart.id, voice);
    };
    const drumActions = {
        toggle: (voice: DrumVoice, i: number) => {
            if (!drumPart) return;
            // while stopped, hear what you just turned on
            if (!playing && !hasHit(drumPart.drums, voice, i)) auditionDrum(voice);
            setPattern(p => toggleHit(p, voice, i));
        },
        bars: (bars: PatternBars) => setPattern(p => setBars(p, bars, ts)),
        preset: (id: string) => {
            const preset = presetsFor(ts).find(p => p.id === id);
            if (preset) setPattern(() => preset.make(ts));
        },
        clear: () => setPattern(p => emptyPattern(p.bars)),
    };

    // ---- melody editing (the selected melody part) --------------------------------------------
    const melodyPart = selPart?.kind === 'melody' ? selPart : null;
    const melodyActions = {
        tap: (step: number, sixteenth: number, len: number) => {
            if (!melodyPart) return;
            const tick = sixteenth * TICKS_PER_SIXTEENTH;
            const hit = noteAt(melodyPart.notes, tick, step);
            if (hit) {
                updatePart(melodyPart.id, { notes: removeNote(melodyPart.notes, hit) });
                return;
            }
            const note = { start: tick, len: Math.min(len * TICKS_PER_SIXTEENTH, totalTicks - tick), step };
            // while stopped, hear the note you just placed
            if (!playing) getEngine().playChord([melodyMidi(melodyPart, harmony, step)], { duration: Math.min(0.4, ticksToSeconds(note.len)), track: melodyPart.id });
            updatePart(melodyPart.id, { notes: placeNote(melodyPart.notes, note) });
        },
        octave: (octave: number) => melodyPart && updatePart(melodyPart.id, { octave }),
        clear: () => melodyPart && updatePart(melodyPart.id, { notes: [] }),
    };

    const starts = clips.map(c => c.start / T);
    /** Chord edits apply to the chord row; with a part selected (say, typing in its grid) they do nothing. */
    const chordEdit = <A extends unknown[]>(fn: (...args: A) => unknown) => (...args: A) => {
        if (onChordLane) fn(...args);
    };
    const edit = {
        longer: chordEdit(() => selClip && setChords(setLength(clips, selClip, selClip.len + T, totalTicks))),
        shorter: chordEdit(() => selClip && setChords(setLength(clips, selClip, selClip.len - T, totalTicks))),
        split: chordEdit(() => selClip && setChords(split(clips, selClip, selTick))),
        copy: chordEdit(() => selClip && setClipboard(selClip)),
        paste: chordEdit(() => clipboard && setChords(place(clips, { ...clipboard, start: selTick, len: Math.min(clipboard.len, totalTicks - selTick) }))),
        rest: chordEdit(() => {
            const base = selClip ?? { start: selTick, len: T };
            setChords(place(selClip ? remove(clips, selClip) : clips, { start: base.start, len: base.len, rest: true }));
        }),
        del: chordEdit(() => selClip && setChords(remove(clips, selClip))),
        clearAll: () => {
            stopPlayback();
            editSong(sg => ({
                ...sg,
                chords: [],
                parts: sg.parts.map(p => (p.kind === 'melody' ? { ...p, notes: [] } : p.kind === 'drums' ? { ...p, drums: emptyPattern(p.drums.bars) } : p)),
            }));
            setSelected(0);
            setPlayhead(0);
        },
        addRow: () => editSong(sg => ({ ...sg, steps: sg.steps + rowSteps })),
        removeRow: () => {
            if (total <= rowSteps) return;
            const next = total - rowSteps;
            editSong(sg => ({
                ...sg,
                steps: next,
                chords: fitTo(sg.chords, next * T),
                parts: sg.parts.map(p => (p.kind === 'melody' ? { ...p, notes: fitNotes(p.notes, next * T) } : p)),
            }));
            setSelected(Math.min(selected, next - 1));
            setPlayhead(Math.min(playhead, next - 1));
        },
        timeSignature: (next: TimeSignature) => {
            const changed = changeTimeSignature(song, next);
            editSong(() => changed);
            setSelected(sel => Math.min(sel, changed.steps - 1));
            setPlayhead(ph => Math.min(ph, changed.steps - 1));
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

    // ---- saving, files, share links -----------------------------------------------------

    const flash = (text: string) => setNotice(text);
    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(null), 2600);
        return () => clearTimeout(t);
    }, [notice]);

    const snapshot = (): SavedState => ({
        version: SAVE_VERSION,
        song,
        settings: { voiceLeading, octave, inversion, loop, theme },
    });

    // Autosave a moment after any change
    useEffect(() => {
        const t = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
            } catch {
                // storage full or blocked (private window): the song still works, it just isn't kept
            }
        }, 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [song, voiceLeading, octave, inversion, loop, theme]);

    /** Replace the song (undoable) and take over its saved settings. */
    const loadState = (state: SavedState, message: string) => {
        stopPlayback();
        editSong(() => state.song);
        const st = state.settings;
        setVoiceLeading(st.voiceLeading);
        setOctave(st.octave);
        setInversion(st.inversion);
        setLoop(st.loop);
        setSelectedLane(CHORD_LANE);
        setSelected(0);
        setPlayhead(0);
        flash(message);
    };

    // Open a song shared as a link (#song=...), then tidy the address bar
    useEffect(() => {
        const match = window.location.hash.match(/^#song=([zp][A-Za-z0-9_-]+)$/);
        if (!match) return;
        decodeShare(match[1])
            .then(data => {
                const state = readSaved(data);
                if (state) loadState(state, 'Opened the shared song. Undo to go back to yours.');
                else flash('That link doesn’t contain a song this version can open.');
            })
            .catch(() => flash('That link is damaged and couldn’t be opened.'))
            .finally(() => window.history.replaceState(null, '', window.location.pathname + window.location.search));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const songActions = {
        new: () => {
            stopPlayback();
            editSong(() => newSong());
            setSelectedLane(CHORD_LANE);
            setSelected(0);
            setPlayhead(0);
            flash('New song. Undo to get the old one back.');
        },
        save: () => {
            const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'metju-chord-song.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        open: async (file: File) => {
            try {
                const state = readSaved(JSON.parse(await file.text()));
                if (state) loadState(state, `Opened ${file.name}.`);
                else flash('That file isn’t a Metju.Chord song.');
            } catch {
                flash('That file couldn’t be read.');
            }
        },
        share: async () => {
            const url = `${window.location.origin}${window.location.pathname}#song=${await encodeShare(snapshot())}`;
            try {
                await navigator.clipboard.writeText(url);
                flash('Share link copied.');
            } catch {
                window.prompt('Copy this link:', url);
            }
        },
    };

    // ---- keyboard -----------------------------------------------------------------------

    const keyActions = useRef({ pressPad, releasePad, releaseAll, togglePlay, edit, helpOpen, undo: history.undo, redo: history.redo });
    keyActions.current = { pressPad, releasePad, releaseAll, togglePlay, edit, helpOpen, undo: history.undo, redo: history.redo };

    useEffect(() => {
        const isTyping = (t: EventTarget | null) =>
            t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

        const down = (e: KeyboardEvent) => {
            const a = keyActions.current;
            // Undo / redo: Ctrl or Cmd + Z, Shift + Ctrl/Cmd + Z, Ctrl + Y
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !a.helpOpen && (e.code === 'KeyZ' || e.code === 'KeyY')) {
                e.preventDefault();
                if (e.code === 'KeyY' || e.shiftKey) a.redo();
                else a.undo();
                return;
            }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
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
        numeral: romanNumeral(degree, scale),
        symbol: resolveChord(selectedKey, { degree, type: stickChordType(stickDir, triadQuality(degree, scale)), inversion, octave, scale }).name.symbol,
        held: held.includes(degree),
    })), [selectedKey, scale, stickDir, inversion, octave, held]);

    // The stick labels follow the pad you're using: a held pad, else the last chord played, else 1
    const refDegree = held.length ? held[held.length - 1] : shown ? shown.degree : 0;
    const stickChords = Object.fromEntries(STICK_DIRS.map(d => [d,
        resolveChord(selectedKey, { degree: refDegree, type: stickChordType(d, triadQuality(refDegree, scale)), inversion, octave, scale }).name.symbol,
    ])) as { [d in StickDir]: string };

    // While recording, the screen says where the next chord goes, so you can record from Play mode.
    // (Nothing about playback goes on the screen: it only follows what you play.)
    const screenFlag = recording ? `● REC · CHORDS STEP ${selected + 1}` : undefined;
    const instrumentLabel = INSTRUMENTS.find(i => i.id === padPart.instrument)?.label ?? '';
    const status = [`${selectedKey} ${scaleLabel(scale).toUpperCase()}`, `OCT ${octave}`, `${bpm} BPM`, `${padPart.playMode} · ${instrumentLabel}`];
    const screen: ScreenView = shown
        ? {
            idle: false,
            symbol: shown.chord.name.symbol,
            long: shown.chord.name.long,
            numeral: romanNumeral(shown.degree, shown.scale),
            notes: shown.chord.notes,
            stick: shown.dir,
            inversionLabel: INVERSION_LABELS[Math.min(shown.inversion, shown.chord.midi.length - 1)],
            status,
            flag: screenFlag,
        }
        : { idle: true, symbol: '', long: '', numeral: '', notes: [], stick: 'C', inversionLabel: '', status, flag: screenFlag };

    const sounding = shown && held.length > 0 ? shown.chord.midi : [];
    const maxInv = Math.min(MAX_INVERSION, Math.max(...pads.map(p =>
        resolveChord(selectedKey, paramsFor(p.degree, stickDir)).midi.length - 1)));

    const describe = (clip: Clip) =>
        isChordClip(clip)
            ? { symbol: resolveClip(harmony, clip).name.symbol, numeral: romanNumeral(clip.chord.degree, scale) }
            : { symbol: 'Rest', numeral: '' };

    // Each part lane's miniature: what it plays, in steps, with pitch squeezed into 0..1 per part
    const minis = useMemo(() => {
        const out: { [id: string]: MiniNote[] } = {};
        for (const p of parts) {
            if (!hasInstrument(p)) continue;
            const notes = partNotes(p, harmony, T);
            const all = notes.flatMap(n => n.midi);
            const lo = Math.min(...all);
            const span = Math.max(12, Math.max(...all) - lo);
            out[p.id] = notes.flatMap(n => n.midi.map(m => ({ start: n.start / T, len: n.len / T, y: (m - lo) / span })));
        }
        return out;
    }, [parts, harmony, T]);

    const beatDot = metronomeOn ? metBeat : playing ? playhead % ts.beats : null;

    /** The start tap: ring a chord from the song's key and fade from the intro into the app. */
    const begin = async () => {
        if (intro !== 'idle') return;
        const chord = introChord(selectedKey, scale);
        setIntroName(chord.name);
        setIntro('leaving');
        await startAudio();
        getEngine().playIntro(chord.midi);
        setTimeout(() => setIntro('done'), 1900);
    };
    const introEl = intro !== 'done' ? <IntroScreen phase={intro} chord={introName} onStart={begin} /> : null;
    // Until the first tap there is no audio, so nothing but the intro is mounted
    if (!audioReady) return <>{null}{introEl}</>;

    const deviceEl = (
        <Device
                screen={screen}
                sounding={sounding}
                scalePcs={scalePitchClasses(selectedKey, scale)}
                octave={octave}
                pads={pads}
                stickDir={stickDir}
                latchedDir={latchedDir}
                stickChords={stickChords}
                stickFor={`${refDegree + 1} · ${romanNumeral(refDegree, scale)}`}
                voiceLeading={voiceLeading}
                onVoiceLeading={setVoiceLeading}
                inversion={inversion}
                maxInversion={maxInv}
                recording={recording}
                onPadDown={d => pressPad(`pad:${d}`, d)}
                onPadUp={d => releasePad(`pad:${d}`)}
                onStick={setLatchedDir}
                onStickHold={setTouchDir}
                compact={compact}
                onInversion={setInversion}
            />
    );
    const soundEl = (
        <SoundPanel
            partName={soundPart.name}
            partColor={soundPart.color}
            instrument={soundPart.instrument}
            onInstrument={setInstrument}
            chordStyle={soundPart.kind === 'chords' ? soundPart : undefined}
            onChordStyle={patch => setChordStyle(soundPart.id, patch)}
        />
    );

    const partEditor = !selPart ? null
        : selPart.kind === 'drums' ? (
            <DrumEditor
                name={selPart.name}
                color={selPart.color}
                pattern={selPart.drums}
                perBar={sixteenthsPerBar(ts)}
                perBeat={sixteenthsPerStep(ts)}
                playSixteenth={playSixteenth}
                presets={presetsFor(ts)}
                padTrack={padPart.name}
                onToggle={drumActions.toggle}
                onBars={drumActions.bars}
                onPreset={drumActions.preset}
                onClear={drumActions.clear}
                onAudition={auditionDrum}
            />
        ) : selPart.kind === 'melody' ? (
            <MelodyEditor
                part={selPart}
                harmony={harmony}
                totalSteps={total}
                stepsPerRow={rowSteps}
                beatsPerBar={ts.beats}
                perBeat={sixteenthsPerStep(ts)}
                playSixteenth={playSixteenth}
                onTap={melodyActions.tap}
                onOctave={melodyActions.octave}
                onClear={melodyActions.clear}
            />
        ) : selPart.kind === 'bass' ? (
            <BassEditor part={selPart} onChange={patch => updatePart(selPart.id, patch as Partial<BassPart>)} />
        ) : (
            <ChordPartEditor part={selPart} onChange={patch => setChordStyle(selPart.id, patch)} />
        );

    const progressionEl = (
        <Progression
            total={total}
            stepsPerRow={rowSteps}
            timeSignature={ts}
            onTimeSignature={edit.timeSignature}
            chords={chords.map(c => ({ ...c, start: c.start / T, len: c.len / T }))}
            parts={parts}
            minis={minis}
            selectedLane={selPart ? selPart.id : CHORD_LANE}
            onSelectLane={pickLane}
            onUpdatePart={updatePart}
            onAddPart={partActions.add}
            onRemovePart={partActions.remove}
            canRemovePart={partActions.canRemove}
            sixteenthsPerStep={sixteenthsPerStep(ts)}
            sixteenthsPerBar={sixteenthsPerBar(ts)}
            loopSteps={loop ? loopLength({ chords, parts, barTicks, stepTicks: T, total, loop }) / T : total}
            padPart={padPart.name}
            partEditor={partEditor}
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
            onClearAll={edit.clearAll}
            canClearAll={chords.length > 0 || parts.some(p => (p.kind === 'melody' && p.notes.length > 0) || (p.kind === 'drums' && Object.values(p.drums.hits).some(h => h?.length)))}
            songMenu={(
                <SongMenu
                    canUndo={history.canUndo}
                    canRedo={history.canRedo}
                    onUndo={history.undo}
                    onRedo={history.redo}
                    onNew={songActions.new}
                    onOpenFile={songActions.open}
                    onSaveFile={songActions.save}
                    onShare={songActions.share}
                />
            )}
        />
    );
    const voicingEl = (
        <VoicingControls inversion={inversion} maxInversion={maxInv} voiceLeading={voiceLeading} onInversion={setInversion} onVoiceLeading={setVoiceLeading} />
    );

    // Phones and small windows: one mode at a time under a compact bar, so playing never needs scrolling
    const entering = intro === 'leaving' ? 'app-entering' : '';
    if (compact) {
        return (<>
            <div className={`app compact mode-${mode} ${entering}`}>
                <CompactBar
                    mode={mode}
                    selectedKey={selectedKey}
                    scale={scale}
                    octave={octave}
                    bpm={bpm}
                    playing={playing}
                    recording={recording}
                    onMode={setMode}
                    onKeyChange={setSelectedKey}
                    onScaleChange={setScale}
                    onOctaveChange={o => setOctave(Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, o)))}
                    onBpmChange={b => setBpm(Math.max(BPM_MIN, Math.min(BPM_MAX, b)))}
                    onTogglePlay={togglePlay}
                    onToggleRecord={() => setRecording(r => !r)}
                />
                {mode === 'play' && deviceEl}
                {mode === 'seq' && progressionEl}
                {mode === 'sound' && (
                    <div className="sound-mode">
                        <section className="panel sound-section voicing-card" aria-label="Voicing">
                            <h2 className="eyebrow">Voicing</h2>
                            {voicingEl}
                        </section>
                        {soundEl}
                        <section className="panel sound-section app-card" aria-label="App">
                            <h2 className="eyebrow">App</h2>
                            <div className="app-card-row">
                                <button className="chip-button" aria-pressed={metronomeOn} onClick={() => setMetronomeOn(m => !m)}>
                                    Click {metronomeOn ? 'on' : 'off'} · {ts.beats}/{ts.unit}
                                </button>
                                <button className="chip-button" onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>
                                    {theme === 'dark' ? 'Light' : 'Dark'} theme
                                </button>
                                <button className="chip-button" onClick={() => setHelpOpen(true)}>How to play</button>
                            </div>
                        </section>
                    </div>
                )}
                <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
            {notice && <div className="toast" role="status">{notice}</div>}
            </div>
            {introEl}
        </>);
    }

    return (<>
        <div className={`app ${entering}`}>
            <TopBar
                selectedKey={selectedKey}
                octave={octave}
                bpm={bpm}
                metronomeOn={metronomeOn}
                beat={beatDot}
                beats={ts.beats}
                theme={theme}
                onKeyChange={setSelectedKey}
                scale={scale}
                onScaleChange={setScale}
                onOctaveChange={o => setOctave(Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, o)))}
                onBpmChange={b => setBpm(Math.max(BPM_MIN, Math.min(BPM_MAX, b)))}
                onToggleMetronome={() => setMetronomeOn(m => !m)}
                onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
                onOpenHelp={() => setHelpOpen(true)}
            />

            <main className="main-row">
                {deviceEl}
                {soundEl}
            </main>

            {progressionEl}

            <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
            {notice && <div className="toast" role="status">{notice}</div>}
        </div>
        {introEl}
    </>);
};

export default App;
