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
import { useHistory } from './useHistory';
import SongMenu from './components/SongMenu';
import {
    STORAGE_KEY, SAVE_VERSION, SavedState, Song, decodeShare, defaultSettings, encodeShare, newSong, readSaved,
} from './song';
import {
    BEATS_PER_BAR, STEPS_PER_ROW, TICKS_PER_STEP as T, ChordClip, Clip, ClipSound, PlayMode, Track,
    audibleTracks, clipAt, fitTo, isChordClip, newTrack, place, remove, setLength, songEnd, songLoopEnd, split,
} from './progression';
import { SeqEvent, SeqOptions, SequencerPlayer, ticksToSeconds } from './audio/sequencer';

const DEGREE_KEYS: { [code: string]: number } = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6 };
const STICK_KEYS: { [code: string]: StickDir } = {
    KeyQ: 'UL', KeyW: 'U', KeyE: 'UR', KeyA: 'L', KeyS: 'C', KeyD: 'R', KeyZ: 'DL', KeyX: 'D', KeyC: 'DR',
};
const INVERSION_LABELS = ['ROOT POS', '1ST INV', '2ND INV', '3RD INV'];
const ARP_PATTERN_LABELS: { [p in ArpPattern]: string } = { up: 'up', down: 'down', upDown: 'up-down', random: 'random' };
const MAX_INVERSION = 3;
/** Instruments offered to new tracks, in order. */
const NEW_TRACK_INSTRUMENTS: InstrumentId[] = ['lead', 'strings', 'bells', 'brass', 'organ', 'pluck', 'epiano', 'warmpad'];

/** What the sequencer schedules: a chord and the track it plays on. */
interface Scheduled {
    clip: ChordClip;
    track: string;
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
    const stickDir: StickDir = keyDirs.length ? keyDirs[keyDirs.length - 1] : latchedDir;

    // ---- playing ------------------------------------------------------------------
    const holds = useRef(new Map<string, Hold>());
    const [held, setHeld] = useState<number[]>([]);
    const [shown, setShown] = useState<Shown | null>(null);

    // ---- progression ----------------------------------------------------------------
    // The song is everything undo/redo and saving cover: tracks, length, tempo, time signature
    const history = useHistory<Song>(() => saved?.song ?? newSong());
    const song = history.state;
    const editSong = history.commit;
    const { tracks, steps: total, bpm } = song;
    const setTracks = (update: (ts: Track[]) => Track[], mergeKey?: string) =>
        editSong(sg => ({ ...sg, tracks: update(sg.tracks) }), mergeKey);
    const setBpm = (b: number) => editSong(sg => ({ ...sg, bpm: b }), 'bpm');
    const [selectedTrack, setSelectedTrack] = useState('');
    // The selected track: pads play through it and recordings land on it
    const current = tracks.find(t => t.id === selectedTrack) ?? tracks[0];
    const clips = current.clips;
    const instrument = current.instrument;
    const updateTrack = (id: string, patch: Partial<Track>) =>
        // dragging a volume slider is one undo step, not one per pixel
        setTracks(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)), 'volume' in patch ? `vol:${id}` : undefined);
    const setClips = (next: Clip[]) => updateTrack(current.id, { clips: next });
    const setInstrument = (id: InstrumentId) => updateTrack(current.id, { instrument: id });
    const [selected, setSelected] = useState(0);
    const [playhead, setPlayhead] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(initial.loop);
    const [recording, setRecording] = useState(false);
    const [clipboard, setClipboard] = useState<Clip | null>(null);
    const player = useRef<SequencerPlayer<Scheduled> | null>(null);

    // ---- metronome ------------------------------------------------------------------
    const [metronomeOn, setMetronomeOn] = useState(false);
    const [metBeat, setMetBeat] = useState<number | null>(null);

    // Latest state for Transport callbacks and the global key handler
    const live = useRef({ selectedKey, octave, inversion, stickDir, instrument, playMode, arpPattern, arpRate, noteLength, clips, tracks, total, selected, loop, recording });
    live.current = { selectedKey, octave, inversion, stickDir, instrument, playMode, arpPattern, arpRate, noteLength, clips, tracks, total, selected, loop, recording };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // ---- audio start --------------------------------------------------------------

    const startAudio = async () => {
        if (audioReady) return;
        await Tone.start();
        const engine = getEngine(); // built on first use, after the user gesture
        engine.setBpm(bpm);
        tracks.forEach(t => engine.setTrack(t.id, { instrument: t.instrument, volume: t.volume }));
        engine.selectTrack(current.id);
        setAudioReady(true);
    };

    useEffect(() => {
        if (audioReady) getEngine().setBpm(bpm);
    }, [bpm, audioReady]);

    // Keep the engine's per-track strips (instrument, volume) in step with the tracks
    const engineTracks = useRef(new Set<string>());
    useEffect(() => {
        if (!audioReady) return;
        const engine = getEngine();
        tracks.forEach(t => engine.setTrack(t.id, { instrument: t.instrument, volume: t.volume }));
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
        type: stickChordType(dir, triadQuality(degree)),
        inversion: s.inversion,
        octave: s.octave,
    });

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
            setClips(place(s.clips, { start: s.selected * T, len: T, chord: { ...params, ...currentSound(s) } }));
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

    /** The progression as timed events, and how it loops (the grid is in steps, the events in ticks). */
    const schedule = (s = live.current): { events: SeqEvent<Scheduled>[]; opts: SeqOptions } => ({
        // Mute and solo only affect playback, so a muted track can still be played live from the pads
        events: audibleTracks(s.tracks).flatMap(t => t.clips.filter(isChordClip).map(clip => ({
            tick: clip.start, duration: clip.len, data: { clip, track: t.id },
        }))),
        opts: { loop: s.loop, loopEnd: Math.min(songLoopEnd(s.tracks), s.total * T), end: songEnd(s.tracks) },
    });

    // Each chord plays on its track's instrument, with the key and chord/arp settings it was recorded with.
    // The screen, stick and keyboard strip belong to live playing only, so nothing here touches them.
    const playEvent = (event: SeqEvent<Scheduled>, time: number) => {
        const { clip, track } = event.data;
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
        const draw = () => {
            const pos = player.current?.position();
            if (pos !== null && pos !== undefined) {
                const step = Math.floor(pos / T);
                if (step !== last) {
                    last = step;
                    setPlayhead(step);
                }
            }
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
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

    const totalTicks = total * T;
    const selTick = selected * T;
    const selClip = clipAt(clips, selTick);
    const select = (step: number, track?: string) => {
        setSelected(step);
        if (track) setSelectedTrack(track);
        if (!playing) setPlayhead(step);
    };
    const trackActions = {
        add: () => {
            const used = new Set(tracks.map(t => t.instrument));
            const inst = NEW_TRACK_INSTRUMENTS.find(i => !used.has(i)) ?? 'epiano';
            const track = newTrack(tracks, inst);
            setTracks(ts => [...ts, track]);
            setSelectedTrack(track.id);
        },
        remove: (id: string) => {
            if (tracks.length < 2) return;
            const rest = tracks.filter(t => t.id !== id);
            setTracks(ts => ts.filter(t => t.id !== id));
            if (id === current.id) setSelectedTrack(rest[0].id);
        },
    };
    const starts = clips.map(c => c.start / T);
    const edit = {
        longer: () => selClip && setClips(setLength(clips, selClip, selClip.len + T, totalTicks)),
        shorter: () => selClip && setClips(setLength(clips, selClip, selClip.len - T, totalTicks)),
        split: () => selClip && setClips(split(clips, selClip, selTick)),
        copy: () => selClip && setClipboard(selClip),
        paste: () => clipboard && setClips(place(clips, { ...clipboard, start: selTick, len: Math.min(clipboard.len, totalTicks - selTick) })),
        rest: () => {
            const base = selClip ?? { start: selTick, len: T };
            setClips(place(selClip ? remove(clips, selClip) : clips, { start: base.start, len: base.len, rest: true }));
        },
        del: () => selClip && setClips(remove(clips, selClip)),
        restamp: () => isChordClip(selClip) && setClips(place(remove(clips, selClip), { ...selClip, chord: { ...selClip.chord, ...currentSound() } })),
        clearAll: () => {
            stopPlayback();
            setTracks(ts => ts.map(t => ({ ...t, clips: [] })));
            setSelected(0);
            setPlayhead(0);
        },
        addRow: () => editSong(sg => ({ ...sg, steps: sg.steps + STEPS_PER_ROW })),
        removeRow: () => {
            if (total <= STEPS_PER_ROW) return;
            const next = total - STEPS_PER_ROW;
            editSong(sg => ({ ...sg, steps: next, tracks: sg.tracks.map(t => ({ ...t, clips: fitTo(t.clips, next * T) })) }));
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
        settings: { key: selectedKey, octave, inversion, playMode, arpPattern, arpRate, noteLength, loop, theme },
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
    }, [song, selectedKey, octave, inversion, playMode, arpPattern, arpRate, noteLength, loop, theme]);

    /** Replace the song (undoable) and take over its saved settings. */
    const loadState = (state: SavedState, message: string) => {
        stopPlayback();
        editSong(() => state.song);
        const st = state.settings;
        setSelectedKey(st.key);
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
        [c.playMode === 'Arp' ? `Arp ${ARP_PATTERN_LABELS[c.arpPattern]} ${ARP_RATES.find(r => r.rate === c.arpRate)?.label ?? ''}` : null,
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
            </main>

            <Progression
                total={total}
                tracks={tracks.map(t => ({ ...t, clips: t.clips.map(c => ({ ...c, start: c.start / T, len: c.len / T })) }))}
                selectedTrack={current.id}
                onSelectTrack={id => setSelectedTrack(id)}
                onUpdateTrack={updateTrack}
                onAddTrack={trackActions.add}
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

            <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
            {notice && <div className="toast" role="status">{notice}</div>}
        </div>
    );
};

export default App;
