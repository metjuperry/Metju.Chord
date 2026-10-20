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
import {
    ArpPattern, ChordParams, MusicalKey, ResolvedChord, StickDir,
    STICK_DIRS, ScaleId, buildChordMidi, keyPitchClass, resolveChord, romanNumeral, scaleLabel, scalePitchClasses,
    stickChordType, triadQuality, voiceLead,
} from './theory';
import { ArpRate, getEngine } from './audio/engine';
import { INSTRUMENTS, InstrumentId } from './audio/instruments';
import { ARP_RATES } from './components/SoundPanel';
import { useHistory } from './useHistory';
import SongMenu from './components/SongMenu';
import {
    STORAGE_KEY, SAVE_VERSION, SavedState, Song, TimeSignature, changeTimeSignature, decodeShare, defaultSettings, encodeShare,
    isCompound, newSong, readSaved, stepsPerRow, ticksPerBar, ticksPerStep, transportBpm,
} from './song';
import {
    ChordClip, Clip, ClipSound, PlayMode, Track,
    audibleTracks, clipAt, fitTo, isChordClip, newTrack, place, remove, setLength, songEnd, songLoopEnd, split,
} from './progression';
import { SeqEvent, SeqOptions, SequencerPlayer, ticksToSeconds } from './audio/sequencer';
import {
    DrumPattern, DrumVoice, PatternBars, TICKS_PER_SIXTEENTH, emptyPattern, expandPattern, hasHit, presetsFor, setBars,
    sixteenthsPerBar, sixteenthsPerStep, toggleHit,
} from './drums';

const DEGREE_KEYS: { [code: string]: number } = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6 };
const STICK_KEYS: { [code: string]: StickDir } = {
    KeyQ: 'UL', KeyW: 'U', KeyE: 'UR', KeyA: 'L', KeyS: 'C', KeyD: 'R', KeyZ: 'DL', KeyX: 'D', KeyC: 'DR',
};
const INVERSION_LABELS = ['ROOT POS', '1ST INV', '2ND INV', '3RD INV'];
const ARP_PATTERN_LABELS: { [p in ArpPattern]: string } = { up: 'up', down: 'down', upDown: 'up-down', random: 'random' };
const MAX_INVERSION = 3;
/** Instruments offered to new tracks, in order. */
const NEW_TRACK_INSTRUMENTS: InstrumentId[] = ['lead', 'strings', 'bells', 'brass', 'organ', 'pluck', 'epiano', 'warmpad'];

/** What the sequencer schedules: a chord or a drum hit, and the track it plays on. */
type Scheduled =
    | { clip: ChordClip; track: string; drum?: undefined }
    | { drum: DrumVoice; track: string };

/** Keep the engine's strips in step with the tracks: an instrument per chord track, a kit per drum track. */
function syncTracks(engine: ReturnType<typeof getEngine>, tracks: Track[]) {
    tracks.forEach(t => (t.drums
        ? engine.setDrumTrack(t.id, { volume: t.volume })
        : engine.setTrack(t.id, { instrument: t.instrument, volume: t.volume })));
}

interface PlayState { tracks: Track[]; barTicks: number; stepTicks: number; total: number; loop: boolean }
/** Where looping playback wraps: the end of the music, rounded up to a bar, but never past the sequencer's length. */
const loopLength = (s: PlayState) => Math.min(songLoopEnd(s.tracks, s.barTicks), s.total * s.stepTicks);
/** How far playback goes before it wraps or stops. */
const playLength = (s: PlayState) => (s.loop ? loopLength(s) : songEnd(s.tracks, s.barTicks));

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
    const [saved] = useState(loadSaved);
    const initial = saved?.settings ?? defaultSettings();
    const [theme, setTheme] = useState<'dark' | 'light'>(initial.theme);
    const [selectedKey, setSelectedKey] = useState<MusicalKey>(initial.key);
    const [scale, setScale] = useState<ScaleId>(initial.scale);
    const [voiceLeading, setVoiceLeading] = useState(initial.voiceLeading);
    const [octave, setOctave] = useState(initial.octave);
    const [playMode, setPlayMode] = useState<PlayMode>(initial.playMode);
    const [arpPattern, setArpPattern] = useState<ArpPattern>(initial.arpPattern);
    const [arpRate, setArpRate] = useState<ArpRate>(initial.arpRate);
    const [noteLength, setNoteLength] = useState(initial.noteLength);
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
    const { tracks, steps: total, bpm, timeSignature: ts } = song;
    // One step is one beat of the time signature; rows hold whole bars
    const T = ticksPerStep(ts);
    const rowSteps = stepsPerRow(ts);
    const barTicks = ticksPerBar(ts);
    const setTracks = (update: (ts: Track[]) => Track[], mergeKey?: string) =>
        editSong(sg => ({ ...sg, tracks: update(sg.tracks) }), mergeKey);
    const setBpm = (b: number) => editSong(sg => ({ ...sg, bpm: b }), 'bpm');
    const [selectedTrack, setSelectedTrack] = useState('');
    const [chordTrack, setChordTrack] = useState('');
    /** The track selected in the sequencer: a chord track or a drum track. */
    const selTrack = tracks.find(t => t.id === selectedTrack) ?? tracks[0];
    // The chord track the pads play through and recordings land on: the selected one, or with a
    // drum track selected, the chord track that was selected before it
    const current = (!selTrack.drums ? selTrack : undefined)
        ?? tracks.find(t => t.id === chordTrack && !t.drums)
        ?? tracks.find(t => !t.drums)
        ?? tracks[0];
    const drumTrack = selTrack.drums ? selTrack : null;
    const pickTrack = (id: string) => {
        setSelectedTrack(id);
        if (!tracks.find(t => t.id === id)?.drums) setChordTrack(id);
    };
    const clips = current.clips;
    const instrument = current.instrument;
    const updateTrack = (id: string, patch: Partial<Track>) =>
        // dragging a volume slider is one undo step, not one per pixel
        setTracks(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)), 'volume' in patch ? `vol:${id}` : undefined);
    const setClips = (next: Clip[]) => updateTrack(current.id, { clips: next });
    const setInstrument = (id: InstrumentId) => updateTrack(current.id, { instrument: id });
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
    const live = useRef({ ts, stepTicks: T, barTicks, selectedKey, scale, voiceLeading, octave, inversion, stickDir, instrument, playMode, arpPattern, arpRate, noteLength, clips, tracks, total, selected, loop, recording });
    live.current = { ts, stepTicks: T, barTicks, selectedKey, scale, voiceLeading, octave, inversion, stickDir, instrument, playMode, arpPattern, arpRate, noteLength, clips, tracks, total, selected, loop, recording };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // ---- audio start --------------------------------------------------------------

    const startAudio = async () => {
        if (audioReady) return;
        await Tone.start();
        const engine = getEngine(); // built on first use, after the user gesture
        engine.setBpm(transportBpm(bpm, ts));
        syncTracks(engine, tracks);
        engine.selectTrack(current.id);
        setAudioReady(true);
    };

    useEffect(() => {
        if (audioReady) getEngine().setBpm(transportBpm(bpm, ts));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bpm, ts.unit, audioReady]);

    // Keep the engine's per-track strips (instrument, volume) in step with the tracks
    const engineTracks = useRef(new Set<string>());
    useEffect(() => {
        if (!audioReady) return;
        const engine = getEngine();
        syncTracks(engine, tracks);
        engineTracks.current.forEach(id => {
            if (!tracks.some(t => t.id === id)) engine.removeTrack(id);
        });
        engineTracks.current = new Set(tracks.map(t => t.id));
    }, [tracks, audioReady]);

    useEffect(() => {
        if (audioReady) getEngine().selectTrack(current.id);
    }, [current.id, audioReady]);

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

    /** The sound settings a chord recorded right now would be baked with. */
    const currentSound = (s = live.current): ClipSound => ({
        key: s.selectedKey,
        playMode: s.playMode,
        arpPattern: s.arpPattern,
        arpRate: s.arpRate,
        noteLength: s.noteLength,
    });

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
        let stop: () => void;
        if (s.playMode === 'Arp') {
            stop = engine.startArp(chord.midi, { pattern: s.arpPattern, rate: s.arpRate, noteLength: s.noteLength });
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
            setClips(place(s.clips, { start: s.selected * s.stepTicks, len: s.stepTicks, chord: { ...params, ...currentSound(s) } }));
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
    }, [stickDir, inversion, octave, selectedKey, scale, voiceLeading, instrument, playMode, arpPattern, arpRate]);

    // ---- progression playback (Transport) --------------------------------------------

    /** The progression as timed events, and how it loops (the grid is in steps, the events in ticks). */
    const schedule = (s = live.current): { events: SeqEvent<Scheduled>[]; opts: SeqOptions } => ({
        // Mute and solo only affect playback, so a muted track can still be played live from the pads
        events: audibleTracks(s.tracks).flatMap((t): SeqEvent<Scheduled>[] => (t.drums
            // a drum pattern repeats from the top until the loop (or the song) ends
            ? expandPattern(t.drums, s.ts, playLength(s)).map(h => ({ tick: h.tick, duration: TICKS_PER_SIXTEENTH, data: { drum: h.voice, track: t.id } }))
            : t.clips.filter(isChordClip).map(clip => ({ tick: clip.start, duration: clip.len, data: { clip, track: t.id } })))),
        opts: { loop: s.loop, loopEnd: loopLength(s), end: songEnd(s.tracks, s.barTicks) },
    });

    // Each chord plays on its track's instrument, with the key and chord/arp settings it was recorded with.
    // The screen, stick and keyboard strip belong to live playing only, so nothing here touches them.
    const playEvent = (event: SeqEvent<Scheduled>, time: number) => {
        const data = event.data;
        if (data.drum) {
            getEngine().playDrum(data.track, data.drum, time);
            return;
        }
        const { clip, track } = data;
        const c = clip.chord;
        const chord = resolveChord(c.key, c);
        const seconds = ticksToSeconds(event.duration);
        const engine = getEngine();
        if (c.playMode === 'Arp') {
            engine.scheduleArp(chord.midi, { pattern: c.arpPattern, rate: c.arpRate, noteLength: c.noteLength }, time, seconds, track);
        } else {
            engine.playChord(chord.midi, { duration: seconds * 0.98, time, track });
        }
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
    const select = (step: number, track?: string) => {
        setSelected(step);
        if (track) pickTrack(track);
        if (!playing) setPlayhead(step);
    };
    const trackActions = {
        add: () => {
            const used = new Set(tracks.map(t => t.instrument));
            const inst = NEW_TRACK_INSTRUMENTS.find(i => !used.has(i)) ?? 'epiano';
            const track = newTrack(tracks, inst);
            setTracks(ts => [...ts, track]);
            pickTrack(track.id);
        },
        /** A drum track that starts with the first starter beat for the time signature, so Play just works. */
        addDrums: () => {
            const track: Track = { ...newTrack(tracks, 'epiano', tracks.some(t => t.drums) ? 'Drums 2' : 'Drums'), drums: presetsFor(ts)[0].make(ts) };
            setTracks(all => [...all, track]);
            setSelectedTrack(track.id);
        },
        remove: (id: string) => {
            const target = tracks.find(t => t.id === id);
            // the pads need a chord track to play through, so the last one stays
            if (!target || (!target.drums && tracks.filter(t => !t.drums).length < 2)) return;
            const rest = tracks.filter(t => t.id !== id);
            setTracks(ts => ts.filter(t => t.id !== id));
            if (id === selTrack.id) pickTrack(current.id !== id ? current.id : rest.find(t => !t.drums)!.id);
        },
    };

    // ---- drum pattern editing (the selected drum track) ---------------------------------------
    const setPattern = (update: (p: DrumPattern) => DrumPattern, mergeKey?: string) => {
        if (!drumTrack) return;
        const id = drumTrack.id;
        editSong(sg => {
            const tracks = sg.tracks.map(t => (t.id === id && t.drums ? { ...t, drums: update(t.drums) } : t));
            // a pattern longer than the sequencer grows it by whole rows, so all of it plays
            const bars = Math.max(...tracks.map(t => t.drums?.bars ?? 0));
            const row = stepsPerRow(sg.timeSignature);
            const steps = Math.max(sg.steps, Math.ceil((bars * sg.timeSignature.beats) / row) * row);
            return { ...sg, tracks, steps };
        }, mergeKey);
    };
    /** Hear a drum on the selected drum track (when tapping it on in the grid, or its name). */
    const auditionDrum = async (voice: DrumVoice) => {
        if (!drumTrack) return;
        await startAudio();
        getEngine().playDrum(drumTrack.id, voice);
    };
    const drumActions = {
        toggle: (voice: DrumVoice, i: number) => {
            if (!drumTrack?.drums) return;
            // while stopped, hear what you just turned on
            if (!playing && !hasHit(drumTrack.drums, voice, i)) auditionDrum(voice);
            setPattern(p => toggleHit(p, voice, i));
        },
        bars: (bars: PatternBars) => setPattern(p => setBars(p, bars, ts)),
        preset: (id: string) => {
            const preset = presetsFor(ts).find(p => p.id === id);
            if (preset) setPattern(() => preset.make(ts));
        },
        clear: () => setPattern(p => emptyPattern(p.bars)),
    };
    const starts = clips.map(c => c.start / T);
    /** Chord edits apply to the selected chord track; with a drum track selected they do nothing. */
    const chordEdit = <A extends unknown[]>(fn: (...args: A) => unknown) => (...args: A) => {
        if (!drumTrack) fn(...args);
    };
    const edit = {
        longer: chordEdit(() => selClip && setClips(setLength(clips, selClip, selClip.len + T, totalTicks))),
        shorter: chordEdit(() => selClip && setClips(setLength(clips, selClip, selClip.len - T, totalTicks))),
        split: chordEdit(() => selClip && setClips(split(clips, selClip, selTick))),
        copy: chordEdit(() => selClip && setClipboard(selClip)),
        paste: chordEdit(() => clipboard && setClips(place(clips, { ...clipboard, start: selTick, len: Math.min(clipboard.len, totalTicks - selTick) }))),
        rest: chordEdit(() => {
            const base = selClip ?? { start: selTick, len: T };
            setClips(place(selClip ? remove(clips, selClip) : clips, { start: base.start, len: base.len, rest: true }));
        }),
        del: chordEdit(() => selClip && setClips(remove(clips, selClip))),
        restamp: chordEdit(() => isChordClip(selClip) && setClips(place(remove(clips, selClip), { ...selClip, chord: { ...selClip.chord, ...currentSound() } }))),
        clearAll: () => {
            stopPlayback();
            setTracks(ts => ts.map(t => ({ ...t, clips: [], ...(t.drums ? { drums: emptyPattern(t.drums.bars) } : {}) })));
            setSelected(0);
            setPlayhead(0);
        },
        addRow: () => editSong(sg => ({ ...sg, steps: sg.steps + rowSteps })),
        removeRow: () => {
            if (total <= rowSteps) return;
            const next = total - rowSteps;
            editSong(sg => ({ ...sg, steps: next, tracks: sg.tracks.map(t => ({ ...t, clips: fitTo(t.clips, next * T) })) }));
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
        settings: { key: selectedKey, scale, voiceLeading, octave, inversion, playMode, arpPattern, arpRate, noteLength, loop, theme },
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
    }, [song, selectedKey, scale, voiceLeading, octave, inversion, playMode, arpPattern, arpRate, noteLength, loop, theme]);

    /** Replace the song (undoable) and take over its saved settings. */
    const loadState = (state: SavedState, message: string) => {
        stopPlayback();
        editSong(() => state.song);
        const st = state.settings;
        setSelectedKey(st.key);
        setScale(st.scale);
        setVoiceLeading(st.voiceLeading);
        setOctave(st.octave);
        setInversion(st.inversion);
        setPlayMode(st.playMode);
        setArpPattern(st.arpPattern);
        setArpRate(st.arpRate);
        setNoteLength(st.noteLength);
        setLoop(st.loop);
        setSelectedTrack('');
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
            setSelectedTrack('');
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
    const screenFlag = recording ? `● REC · ${current.name.toUpperCase()} STEP ${selected + 1}` : undefined;
    const instrumentLabel = INSTRUMENTS.find(i => i.id === instrument)?.label ?? '';
    const screen: ScreenView = shown
        ? {
            idle: false,
            symbol: shown.chord.name.symbol,
            long: shown.chord.name.long,
            numeral: romanNumeral(shown.degree, shown.scale),
            notes: shown.chord.notes,
            stick: shown.dir,
            inversionLabel: INVERSION_LABELS[Math.min(shown.inversion, shown.chord.midi.length - 1)],
            status: [`${selectedKey} ${scaleLabel(scale).toUpperCase()}`, `OCT ${octave}`, `${bpm} BPM`, `${playMode} · ${instrumentLabel}`],
            flag: screenFlag,
        }
        : {
            idle: true, symbol: '', long: '', numeral: '', notes: [], stick: 'C', inversionLabel: '',
            status: [`${selectedKey} ${scaleLabel(scale).toUpperCase()}`, `OCT ${octave}`, `${bpm} BPM`, `${playMode} · ${instrumentLabel}`],
            flag: screenFlag,
        };

    const sounding = shown && held.length > 0 ? shown.chord.midi : [];
    const maxInv = Math.min(MAX_INVERSION, Math.max(...pads.map(p =>
        resolveChord(selectedKey, paramsFor(p.degree, stickDir)).midi.length - 1)));

    const labelOf = (id: InstrumentId) => INSTRUMENTS.find(i => i.id === id)?.label ?? id;
    const soundText = (c: ClipSound & { scale?: ScaleId }) =>
        [c.playMode === 'Arp' ? `Arp ${ARP_PATTERN_LABELS[c.arpPattern]} ${ARP_RATES.find(r => r.rate === c.arpRate)?.label ?? ''}` : null,
            c.key !== selectedKey || (c.scale ?? 'major') !== scale ? `${c.key} ${scaleLabel(c.scale).toLowerCase()}` : null].filter(Boolean).join(' · ');
    const describe = (clip: Clip) =>
        isChordClip(clip)
            ? { symbol: resolveChord(clip.chord.key, clip.chord).name.symbol, numeral: romanNumeral(clip.chord.degree, clip.chord.scale), sound: soundText(clip.chord) }
            : { symbol: 'Rest', numeral: '', sound: '' };

    const beatDot = metronomeOn ? metBeat : playing ? playhead % ts.beats : null;

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
                trackName={current.name}
                trackColor={current.color}
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
    );
    const progressionEl = (
            <Progression
                total={total}
                stepsPerRow={rowSteps}
                timeSignature={ts}
                onTimeSignature={edit.timeSignature}
                tracks={tracks.map(t => ({ ...t, clips: t.clips.map(c => ({ ...c, start: c.start / T, len: c.len / T })) }))}
                selectedTrack={selTrack.id}
                onSelectTrack={pickTrack}
                onUpdateTrack={updateTrack}
                onAddTrack={trackActions.add}
                onAddDrums={trackActions.addDrums}
                sixteenthsPerStep={sixteenthsPerStep(ts)}
                sixteenthsPerBar={sixteenthsPerBar(ts)}
                loopSteps={loop ? loopLength({ tracks, barTicks, stepTicks: T, total, loop }) / T : total}
                padTrack={current.name}
                drumEditor={drumTrack?.drums && (
                    <DrumEditor
                        name={drumTrack.name}
                        color={drumTrack.color}
                        pattern={drumTrack.drums}
                        perBar={sixteenthsPerBar(ts)}
                        perBeat={sixteenthsPerStep(ts)}
                        playSixteenth={playSixteenth}
                        presets={presetsFor(ts)}
                        padTrack={current.name}
                        onToggle={drumActions.toggle}
                        onBars={drumActions.bars}
                        onPreset={drumActions.preset}
                        onClear={drumActions.clear}
                        onAudition={auditionDrum}
                    />
                )}
                onRemoveTrack={trackActions.remove}
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
    if (compact) {
        return (
            <div className={`app compact mode-${mode}`}>
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
    );
};

export default App;
