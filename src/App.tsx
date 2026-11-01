import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import './App.css';
import TopBar, { AppMode, BPM_MAX, BPM_MIN, OCTAVE_MAX, OCTAVE_MIN } from './components/TopBar';
import Device, { ChordInfoView, PadTarget, PadView } from './components/Device';
import { useMedia } from './useMedia';
import Progression from './components/Progression';
import HelpDialog from './components/HelpDialog';
import DrumEditor from './components/DrumEditor';
import IntroScreen, { IntroPhase } from './components/IntroScreen';
import MelodyEditor from './components/MelodyEditor';
import PartsView, { MASTER, instrumentLabel } from './components/PartsView';
import SettingsSheet, { CreditsDialog } from './components/SettingsSheet';
import {
    ChordParams, ChordType, KEYS, ResolvedChord, StickDir,
    STICK_DIRS, ScaleId, buildChordMidi, chordTags, keyPitchClass, resolveChord, romanNumeral, scalePitchClasses,
    nextChords, noteNames, stickChordType, strumOffsets, triadQuality, voiceLead,
} from './theory';
import { getEngine } from './audio/engine';
import { useHistory } from './useHistory';
import { keepScreenOn } from './pwa';
import SongMenu, { UndoRedo } from './components/SongMenu';
import HooktheoryDialog from './components/HooktheoryDialog';
import { HtClip, ImportOptions, ImportSummary, importHooktheory } from './hooktheory';
import {
    FullSong, LEGACY_STORAGE_KEY, PlaybackMode, STORAGE_KEY, SAVE_VERSION, SavedState, Song, ThemeSetting, decodeShare, defaultSettings, encodeShare,
    isCompound, newFullSong, readSaved, stepsPerRow, ticksPerBar, ticksPerStep, transportBpm,
} from './song';
import {
    ChainSlot, addSection, appendToChain, applySectionEdit, chainCount, chainLayout, changeSongTimeSignature, clearSections, deleteSection,
    duplicateEntry, duplicateSection, findSection, moveEntry, removeEntry, renameSection, sectionView, sectionsHaveContent, setSectionMute, slotAt,
} from './sections';
import { Scheduled, chainEvents, kickTicks, sectionEvents, sectionLoopLength, sectionMusicEnd } from './playback';
import SongView from './components/SongView';
import SectionSwitcher from './components/SectionSwitcher';
import { Clip, clipAt, fitTo, isChordClip, place, remove, setLength, split } from './progression';
import {
    ChordPart, Harmony, MAX_PARTS, MelodyPart, Part, PartFx, PartKind, PartTone, noFx,
    fitNotes, hasInstrument, melodyMidi, newPart, noteAt, partNotes, placeNote, removeNote, resolveClip,
} from './parts';
import { SeqEvent, SeqOptions, SequencerPlayer, ticksToSeconds } from './audio/sequencer';
import {
    DrumPattern, DrumVoice, PatternBars, TICKS_PER_SIXTEENTH, emptyPattern, hasHit, presetsFor, setBars,
    sixteenthsPerBar, sixteenthsPerStep, toggleHit,
} from './drums';
import { CHORD_LANE, MiniNote, PartPatch } from './components/Progression';

const DEGREE_KEYS: { [code: string]: number } = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6 };
const STICK_KEYS: { [code: string]: StickDir } = {
    KeyQ: 'UL', KeyW: 'U', KeyE: 'UR', KeyA: 'L', KeyS: 'C', KeyD: 'R', KeyZ: 'DL', KeyX: 'D', KeyC: 'DR',
};
const INVERSION_LABELS = ['', '1st inv', '2nd inv', '3rd inv'];
/** What the chord info calls the chord type the stick chose ("i · 7th"). */
const TYPE_LABELS: { [t in ChordType]: string } = {
    root: 'root', triad: 'triad', flip: 'flip 3rd', minor: 'minor', dim: 'dim', aug: 'aug', six: '6th',
    dom7: 'dom 7', diatonic7: '7th', diatonic9: '9th', sus2: 'sus2', sus4: 'sus4',
};
/** Melody part octaves (Notes mode's octave buttons). */
const MELODY_OCT_MIN = 3;
const MELODY_OCT_MAX = 5;
const MAX_INVERSION = 3;

/** Keep the engine's strips in step with the parts: an instrument per instrument part, a kit per drum part. */
function syncParts(engine: ReturnType<typeof getEngine>, parts: Part[]) {
    parts.forEach(p => (hasInstrument(p)
        ? engine.setTrack(p.id, { instrument: p.instrument, volume: p.volume, fx: p.fx, tone: p.tone })
        : engine.setDrumTrack(p.id, { volume: p.volume, fx: p.fx })));
}

/** How far a section plays on its own (Loop mode) before it wraps, or stops when loop is off. */
const playLength = (view: Song, loop: boolean) => (loop ? sectionLoopLength(view) : sectionMusicEnd(view));

/**
 * A chord for the intro: a random press on the instrument itself. Any key, any of the 7 pads,
 * any of the 9 stick positions (in the song's scale), with the root doubled two octaves down.
 */
function introChord(scale: ScaleId): { name: string; midi: number[] } {
    const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
    const key = pick(KEYS);
    const degree = Math.floor(Math.random() * 7);
    const dir = pick(STICK_DIRS);
    const chord = resolveChord(key, { degree, type: stickChordType(dir, triadQuality(degree, scale)), inversion: 0, octave: 4, scale });
    return { name: chord.name.symbol, midi: [36 + chord.rootPc, ...chord.midi] };
}

/** The song and settings saved in this browser, if any. */
function loadSaved(): SavedState | null {
    try {
        // version 3; before that the song lived under the v2 key, and is moved into one section
        const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
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
    /** The chord type the stick chose (chords only). */
    type?: ChordType;
    /** A single melody note (Notes mode) rather than a chord. */
    note?: boolean;
}

/** A note being recorded live (while the song plays): where it started, in 1/16s, and what it is. */
interface LiveNote {
    start16: number;
    step: number;
    part: string;
}

interface Hold {
    degree: number;
    stop: () => void;
    rec?: LiveNote;
}

/** What the pads play: chords (with the stick), or single melody notes on the melody part. */
export type PadMode = 'chords' | 'notes';

/** A melody note's name with its octave, e.g. "E4". */
const noteLabel = (midi: number, names: string[]) => `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;

const App: React.FC = () => {
    // ---- settings ---------------------------------------------------------------
    const [audioReady, setAudioReady] = useState(false);
    const [intro, setIntro] = useState<IntroPhase>('idle');
    const [introName, setIntroName] = useState('');
    const [saved] = useState(loadSaved);
    const initial = saved?.settings ?? defaultSettings();
    const [theme, setTheme] = useState<ThemeSetting>(initial.theme);
    const prefersDark = useMedia('(prefers-color-scheme: dark)');
    const shownTheme: 'dark' | 'light' = theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme;
    const [clickAccent, setClickAccent] = useState(initial.clickAccent);
    const [voiceLeading, setVoiceLeading] = useState(initial.voiceLeading);
    const [octave, setOctave] = useState(initial.octave);
    const [inversion, setInversion] = useState(initial.inversion);
    const [nextHint, setNextHint] = useState(initial.nextHint);
    const [notice, setNotice] = useState<string | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [htOpen, setHtOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [creditsOpen, setCreditsOpen] = useState(false);

    // ---- stick: a latched direction (mouse) and momentary ones (held keys) --------
    const [latchedDir, setLatchedDir] = useState<StickDir>('C');
    const [keyDirs, setKeyDirs] = useState<StickDir[]>([]);
    // Touch/mouse hold on the stick; keys win over touch, both win over a latched direction
    const [touchDir, setTouchDir] = useState<StickDir | null>(null);
    const stickDir: StickDir = keyDirs.length ? keyDirs[keyDirs.length - 1] : touchDir ?? latchedDir;

    // One mode at a time: Play (the instrument), Song (what plays), Parts (how it sounds)
    const compact = useMedia('(max-width: 1023px), (max-height: 560px)');
    const [mode, setMode] = useState<AppMode>('play');

    // ---- playing ------------------------------------------------------------------
    const holds = useRef(new Map<string, Hold>());
    const [held, setHeld] = useState<number[]>([]);
    const [shown, setShown] = useState<Shown | null>(null);

    // ---- the song, its sections, and the open section ---------------------------------
    // The song is everything undo/redo and saving cover: parts, sections, chain, tempo, time signature
    const history = useHistory<FullSong>(() => saved?.song ?? newFullSong());
    const full = history.state;
    /** The section open in Song (and looped in Loop mode). Which one it is is a setting, not undoable. */
    const [openId, setOpenId] = useState(initial.openSection);
    const openKey = findSection(full, openId).id;
    const openRef = useRef(openKey);
    openRef.current = openKey;
    /** The open section as an ordinary single-section song: everything below edits and plays this. */
    const song = useMemo(() => sectionView(full, openKey), [full, openKey]);
    /** Edit the open section (and anything song-wide) through its view; the edit is written back into the section. */
    const editSong = useCallback((update: (s: Song) => Song, mergeKey?: string) => history.commit(f => {
        const id = findSection(f, openRef.current).id;
        const view = sectionView(f, id);
        const next = update(view);
        return next === view ? f : applySectionEdit(f, id, next);
    }, mergeKey), [history.commit]);
    /** Edit the whole song: sections, chain, every section at once. */
    const editFull = history.commit;
    const [playMode, setPlayModeState] = useState<PlaybackMode>(initial.playMode);
    /** Song mode shows the whole song (sections and chain) or zooms into the open section. */
    const [songZoom, setSongZoom] = useState<'song' | 'section'>('song');
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
    const [padPartId, setPadPartId] = useState(initial.padPart);
    const selPart = parts.find(p => p.id === selectedLane);
    const chordParts = parts.filter((p): p is ChordPart => p.kind === 'chords');
    // The chord part the pads play through: the one picked (Play strip or Parts), else the first
    const padPart: ChordPart = chordParts.find(p => p.id === padPartId) ?? chordParts[0];
    /** The part Parts mode shows (a part id or the Master). */
    const [partsSel, setPartsSel] = useState('');
    const partsShown = partsSel === MASTER || parts.some(p => p.id === partsSel) ? partsSel : padPart.id;
    // Notes mode: the pads play single scale notes on a melody part and record into it
    const [padModeSetting, setPadMode] = useState<PadMode>('chords');
    const [melodyPartId, setMelodyPartId] = useState('');
    const melodyParts = parts.filter((p): p is MelodyPart => p.kind === 'melody');
    const padMelody: MelodyPart | null = (selPart?.kind === 'melody' ? selPart : undefined)
        ?? melodyParts.find(p => p.id === melodyPartId)
        ?? melodyParts[0]
        ?? null;
    const padMode: PadMode = padModeSetting === 'notes' && padMelody ? 'notes' : 'chords';
    /** Length of new melody notes, in 1/16s (shared by the grid and step recording). */
    const [melodyLen, setMelodyLen] = useState(2);
    /** Where the next step-recorded note goes, in 1/16s from the top. */
    const [melCursor, setMelCursor] = useState(0);
    const pickLane = (lane: string) => {
        setSelectedLane(lane);
        const kind = parts.find(p => p.id === lane)?.kind;
        if (kind) setPartsSel(lane);
        // the pads follow what you're editing: notes for a melody, chords for the chord row or a chord part
        if (kind === 'melody') {
            setMelodyPartId(lane);
            setPadMode('notes');
        } else if (kind === 'chords' || lane === CHORD_LANE) {
            setPadMode('chords');
        }
    };
    const updatePart = (id: string, patch: PartPatch | Partial<Part>) =>
        // dragging a volume slider is one undo step, not one per pixel
        setParts(ps => ps.map(p => (p.id === id ? { ...p, ...patch } as Part : p)), 'volume' in patch ? `vol:${id}` : undefined);
    // turning one tone knob is one undo step
    const setTone = (id: string, key: keyof PartTone, value: number) =>
        setParts(ps => ps.map(p => (p.id === id && hasInstrument(p) ? { ...p, tone: { ...p.tone, [key]: value } } : p)), `tone:${id}:${key}`);
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
    const liveState = {
        ts, stepTicks: T, barTicks, selectedKey, scale, voiceLeading, octave, inversion, stickDir, padPart, chords, parts, total, selected, loop, recording,
        padMode, padMelody, melodyLen, melCursor, playing, clickAccent, full, view: song,
    };
    const live = useRef(liveState);
    live.current = liveState;

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', shownTheme);
        // the browser bar / status bar takes the app's background colour
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', shownTheme === 'light' ? '#f4f2ec' : '#0d0d0b');
    }, [shownTheme]);

    // Keep the screen awake while the app is open and being played (from the first tap on)
    useEffect(() => (audioReady ? keepScreenOn() : undefined), [audioReady]);

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

    // The shared reverb, delay and output level belong to the song
    useEffect(() => {
        if (audioReady) getEngine().setSpace(song.space);
    }, [song.space, audioReady]);

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
    /** Chords strummed live, so an alternating strum goes down, up, down... */
    const strumHits = useRef(0);

    /** The melody row a pad plays in Notes mode: its scale degree, an octave up with the stick pushed up. */
    const noteStep = (degree: number, dir: StickDir) => degree + (dir === 'U' ? 7 : 0);

    /** Start a chord (or, in Notes mode, a melody note) sounding; returns how to stop it. */
    const sound = (degree: number): { params?: ChordParams; step?: number; stop: () => void } => {
        const s = live.current;
        if (s.padMode === 'notes' && s.padMelody) {
            const step = noteStep(degree, s.stickDir);
            const midi = melodyMidi(s.padMelody, { key: s.selectedKey, scale: s.scale }, step);
            const name = noteLabel(midi, noteNames(s.selectedKey, s.scale));
            const stop = getEngine().attack([midi], undefined, s.padMelody.id);
            setShown({
                chord: { midi: [midi], rootPc: midi % 12, notes: [name], name: { symbol: name, long: `Note ${name}` } },
                degree, scale: s.scale, dir: s.stickDir, inversion: 0, note: true,
            });
            return { step, stop };
        }
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
        } else if (style.playMode === 'Strum') {
            stop = engine.attack(chord.midi, undefined, undefined, strumOffsets(chord.midi, style.strumSpread, style.strumDirection, strumHits.current++));
        } else {
            stop = engine.attack(chord.midi);
        }
        setShown({ chord, degree, scale: s.scale, dir: s.stickDir, inversion: params.inversion, type: params.type });
        return { params, stop };
    };

    const syncHeld = () => setHeld(Array.from(holds.current.values()).map(h => h.degree));

    /** Write a melody note into a melody part (newest wins: it trims or replaces what it lands on). */
    const writeNote = (partId: string, start16: number, len16: number, step: number) => {
        const total16 = live.current.total * live.current.stepTicks / TICKS_PER_SIXTEENTH;
        const len = Math.min(len16, total16 - start16);
        if (len <= 0) return;
        const note = { start: start16 * TICKS_PER_SIXTEENTH, len: len * TICKS_PER_SIXTEENTH, step };
        setParts(ps => ps.map(p => (p.id === partId && p.kind === 'melody' ? { ...p, notes: placeNote(p.notes, note) } : p)));
    };

    const pressPad = (id: string, degree: number) => {
        if (!audioReady || holds.current.has(id)) return;
        const { params, step, stop } = sound(degree);
        const hold: Hold = { degree, stop };
        holds.current.set(id, hold);
        syncHeld();

        const s = live.current;
        if (!s.recording) return;
        if (step !== undefined && s.padMelody) {
            const perStep = s.stepTicks / TICKS_PER_SIXTEENTH;
            const total16 = s.total * perStep;
            const pos = s.playing ? player.current?.position() : null;
            if (pos !== null && pos !== undefined) {
                // live: the note starts on the nearest 1/16 and lasts until the pad is let go
                hold.rec = { start16: Math.round(pos / TICKS_PER_SIXTEENTH) % total16, step, part: s.padMelody.id };
            } else {
                // step recording: a note of the chosen length at the cursor, then the cursor moves on
                writeNote(s.padMelody.id, s.melCursor, s.melodyLen, step);
                const next = Math.min(s.melCursor + s.melodyLen, total16 - 1);
                setMelCursor(next);
                setSelected(Math.floor(next / perStep));
                setPlayhead(Math.floor(next / perStep));
            }
        } else if (params) {
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
        if (hold.rec) {
            // a live note ends where the pad was let go, rounded to the 1/16 (at least one 1/16 long)
            const s = live.current;
            const pos = player.current?.position();
            let len16 = s.melodyLen;
            if (pos !== null && pos !== undefined) {
                const loop16 = sectionLoopLength(s.view) / TICKS_PER_SIXTEENTH;
                let end16 = Math.round(pos / TICKS_PER_SIXTEENTH);
                if (end16 < hold.rec.start16) end16 += loop16; // the loop wrapped while the pad was held
                len16 = Math.max(1, end16 - hold.rec.start16);
            }
            writeNote(hold.rec.part, hold.rec.start16, len16, hold.rec.step);
        }
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
    }, [stickDir, inversion, octave, selectedKey, scale, voiceLeading, padPart.instrument, padPart.playMode, padPart.arpPattern, padPart.arpRate, padPart.strumSpread, padPart.strumDirection, padMode, padMelody?.id, padMelody?.octave]);

    // ---- progression playback (Transport) --------------------------------------------

    /**
     * What playback is playing right now: the chain, or one section looping. It follows the UI, except that
     * a section switch in Loop mode waits for the next bar line (and a mode change for the next 1/16).
     */
    const transport = useRef<{ mode: PlaybackMode; section: string }>({ mode: initial.playMode, section: openKey });
    /** Loop mode: the section playing (it can lag the open one until a queued switch lands). */
    const [playingSection, setPlayingSection] = useState<string | null>(null);
    /** Loop mode: the section waiting for the next bar line. */
    const [queued, setQueued] = useState<string | null>(null);
    /** Chain mode: the chain slot playing and the song tick, for the Song view. */
    const [chainPos, setChainPos] = useState<{ index: number; tick: number } | null>(null);
    const scheduleCache = useRef<{ full: FullSong; mode: PlaybackMode; section: string; loop: boolean; result: { events: SeqEvent<Scheduled>[]; opts: SeqOptions } } | null>(null);

    /** The music as timed events, and how it loops: the whole chain, or the section being looped. Cached per song edit. */
    const schedule = (): { events: SeqEvent<Scheduled>[]; opts: SeqOptions } => {
        const s = live.current;
        const t = transport.current;
        const c = scheduleCache.current;
        if (c && c.full === s.full && c.mode === t.mode && c.section === t.section && c.loop === s.loop) return c.result;
        let result;
        if (t.mode === 'chain') {
            // each section from its start for its full length; drum patterns restart, notes are cut at its end
            const { events, length } = chainEvents(s.full);
            result = { events, opts: { loop: s.loop, loopEnd: length, end: length } };
        } else {
            const sec = findSection(s.full, t.section);
            const view = sectionView(s.full, sec.id);
            result = {
                events: sectionEvents(view, sec.mutes, playLength(view, s.loop), 0, false),
                opts: { loop: s.loop, loopEnd: sectionLoopLength(view), end: sectionMusicEnd(view) },
            };
        }
        scheduleCache.current = { full: s.full, mode: t.mode, section: t.section, loop: s.loop, result };
        return result;
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
        engine.playChord(data.midi, { duration, time, track: data.part, strum: data.strum });
    };
    const playEventRef = useRef(playEvent);
    playEventRef.current = playEvent;

    const stopPlayback = useCallback(() => {
        player.current?.stop();
        setPlaying(false);
        setQueued(null);
        setChainPos(null);
        setPlayingSection(null);
    }, []);

    const startPlayback = async () => {
        await startAudio();
        if (player.current?.playing) return;
        const t = transport.current;
        t.mode = playMode;
        t.section = openKey;
        const { opts } = schedule();
        if (!opts.loop && opts.end === 0) return;
        const limit = opts.loop ? opts.loopEnd : opts.end;
        const local = Math.max(0, playhead) * T;
        let from = local < limit ? local : 0;
        if (t.mode === 'chain') {
            // from the cursor in the open section's first place in the chain (or the top, if it isn't in it)
            const slot = chainLayout(full).find(x => x.section.id === openKey);
            from = slot ? slot.start + (local < slot.len ? local : 0) : 0;
            if (from >= limit) from = 0;
        }
        // The player reads the latest song on every pass, so edits while playing need no extra wiring
        player.current = new SequencerPlayer<Scheduled>(() => schedule(), (e, time) => playEventRef.current(e, time), stopPlayback);
        player.current.start(from);
        setPlaying(true);
        setPlayingSection(t.mode === 'loop' ? t.section : null);
    };

    /** The next bar line at or after song tick `tick`. */
    const nextBar = (tick: number) => Math.ceil(tick / barTicks) * barTicks;

    /** Open a section. In Loop mode while playing, playback switches to it at the next bar line (it shows NEXT until then). */
    const openSection = (id: string) => {
        if (id !== openKey) {
            setOpenId(id);
            setSelected(0);
            setMelCursor(0);
            if (!playing) setPlayhead(0);
        }
        const p = player.current;
        if (!p?.playing || transport.current.mode !== 'loop') return;
        if (id === transport.current.section) {
            p.cancelJump();
            setQueued(null);
            return;
        }
        setQueued(id);
        p.queueJump(nextBar(p.cursorTick), 0, time => {
            transport.current.section = id;
            Tone.getDraw().schedule(() => {
                setQueued(null);
                setPlayingSection(id);
            }, time);
        });
    };

    /** Chain mode while playing: carry on from the start of chain slot `slot`. */
    const jumpToSlot = (slot: ChainSlot) => {
        const p = player.current;
        if (p?.playing && transport.current.mode === 'chain') p.queueJump(p.cursorTick, slot.start);
    };

    /** Chain or Loop. While playing the music carries on: into the chain where this section is, or looping the section playing. */
    const setPlayMode = (m: PlaybackMode) => {
        if (m === playMode) return;
        setPlayModeState(m);
        const p = player.current;
        const t = transport.current;
        if (!p?.playing) {
            t.mode = m;
            return;
        }
        const cur = p.cursorTick;
        const layout = chainLayout(live.current.full);
        if (m === 'chain') {
            const slot = layout.find(x => x.section.id === t.section);
            p.queueJump(slot ? cur : nextBar(cur), slot ? slot.start + Math.min(cur, slot.len - 1) : 0, () => {
                t.mode = 'chain';
            });
            setQueued(null);
            setPlayingSection(null);
        } else {
            const slot = slotAt(layout, cur);
            p.queueJump(cur, cur - slot.start, time => {
                t.mode = 'loop';
                t.section = slot.section.id;
                Tone.getDraw().schedule(() => setPlayingSection(slot.section.id), time);
            });
            if (slot.section.id !== openKey) openSection(slot.section.id);
        }
    };

    /** Record works on one section: in Chain mode it switches to Loop on the section playing (or open) first. */
    const toggleRecord = () => {
        if (recording) {
            setRecording(false);
            return;
        }
        if (playMode === 'chain') {
            setPlayMode('loop');
            flash('Recording loops one section, so playback switched to Loop.');
        }
        setRecording(true);
    };

    const togglePlay = () => (playing ? stopPlayback() : startPlayback());

    // The playhead follows the Transport position, read once per frame
    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        let last = -1;
        let lastSixteenth = -1;
        let lastGlobal = -1;
        const draw = () => {
            const pos = player.current?.position();
            if (pos !== null && pos !== undefined) {
                const t = transport.current;
                let local = pos;
                let sec = t.section;
                if (t.mode === 'chain') {
                    // the chain's song tick → which slot, and where in its section
                    const slot = slotAt(chainLayout(live.current.full), pos);
                    local = pos - slot.start;
                    sec = slot.section.id;
                    const g = Math.floor(pos / TICKS_PER_SIXTEENTH);
                    if (g !== lastGlobal) {
                        lastGlobal = g;
                        setChainPos({ index: slot.index, tick: pos });
                    }
                }
                // the sequencer and editors show the playhead only while their section is the one playing
                const here = sec === openRef.current;
                const step = here ? Math.floor(local / live.current.stepTicks) : -1;
                if (step !== last) {
                    last = step;
                    setPlayhead(step);
                }
                const sixteenth = here ? Math.floor(local / TICKS_PER_SIXTEENTH) : -1;
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
            // Downbeat high; in 6/8, 9/8 and 12/8 every third beat gets a middle accent (unless accents are off)
            const note = !live.current.clickAccent ? 'C4' : beat === 0 ? 'C5' : compound && beat % 3 === 0 ? 'G4' : 'C4';
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
        setMelCursor(step * sixteenthsPerStep(ts));
        if (lane) pickLane(lane);
        if (!playing) setPlayhead(step);
    };
    const onChordLane = selectedLane === CHORD_LANE || !selPart;
    const partActions = {
        add: (kind: PartKind): string | undefined => {
            if (parts.length >= MAX_PARTS) return undefined;
            // a drum part starts with the first starter beat for the time signature, so Play just works
            const part = newPart(kind, parts, kind === 'drums' ? presetsFor(ts)[0].make(ts) : undefined);
            editFull(f => {
                const id = findSection(f, openRef.current).id;
                const view = sectionView(f, id);
                const out = applySectionEdit(f, id, { ...view, parts: [...view.parts, part] });
                // a new beat plays in every section, not just the open one
                return part.kind !== 'drums' ? out : {
                    ...out,
                    sections: out.sections.map(sec => (sec.content[part.id] ? sec : { ...sec, content: { ...sec.content, [part.id]: { drums: part.drums } } })),
                };
            });
            // Song opens its lane next time (without switching the pads to it)
            setSelectedLane(part.id);
            return part.id;
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

    // ---- effects: per part (drive, chorus, sends) and the shared space ---------------------------
    const fxActions = {
        // turning one knob is one undo step, not one per pixel
        set: (id: string, key: keyof PartFx, value: number) =>
            setParts(ps => ps.map(p => (p.id === id ? { ...p, fx: { ...p.fx, [key]: value } } : p)), `fx:${id}:${key}`),
        space: (space: Song['space']) => editSong(sg => ({ ...sg, space }), 'space'),
        dryAll: () => setParts(ps => ps.map(p => ({ ...p, fx: noFx() }))),
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
            setMelCursor(sixteenth);
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
            const plays = selClip?.rest ? selClip.plays : undefined;
            setChords(place(selClip ? remove(clips, selClip) : clips, { start: base.start, len: base.len, rest: true, ...(plays && { plays }) }));
        }),
        /** Whether the selected rest lets part `id` play through. */
        restPart: chordEdit((id: string, plays: boolean) => {
            if (!selClip?.rest) return;
            setChords(place(remove(clips, selClip), { ...selClip, plays: { ...selClip.plays, [id]: plays } }));
        }),
        del: chordEdit(() => selClip && setChords(remove(clips, selClip))),
        /** Empty every section (chords, melodies, beats); the sections, chain and parts stay. */
        clearAll: () => {
            stopPlayback();
            editFull(clearSections);
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
        /** The time signature is song-wide: every section moves to it. */
        timeSignature: (next: Song['timeSignature']) => {
            const changed = changeSongTimeSignature(full, next);
            editFull(() => changed);
            const steps = findSection(changed, openKey).steps;
            setSelected(sel => Math.min(sel, steps - 1));
            setPlayhead(ph => Math.min(ph, steps - 1));
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
        song: full,
        settings: { voiceLeading, octave, inversion, loop, theme, nextHint, padPart: padPartId, clickAccent, openSection: openKey, playMode },
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
    }, [full, voiceLeading, octave, inversion, loop, theme, nextHint, padPartId, clickAccent, openKey, playMode]);

    /** Replace the song (undoable) and take over its saved settings. */
    const loadState = (state: SavedState, message: string) => {
        stopPlayback();
        editFull(() => state.song);
        const st = state.settings;
        setOpenId(st.openSection);
        setPlayModeState(st.playMode);
        transport.current.mode = st.playMode;
        setVoiceLeading(st.voiceLeading);
        setOctave(st.octave);
        setInversion(st.inversion);
        setLoop(st.loop);
        setNextHint(st.nextHint);
        setPadPartId(st.padPart);
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

    /** Paste from Hooktheory: notes into Melody parts, chords into the chord row, one undo step. */
    const importPaste = (clip: HtClip, options: ImportOptions, summary: ImportSummary) => {
        editSong(sg => {
            const done = importHooktheory(sg, clip, options);
            return done.summary.problem ? sg : done.song;
        });
        setHtOpen(false);
        setSongZoom('section');
        // open the first Melody part it wrote, so you see what arrived
        const first = summary.parts[0];
        if (first) {
            setSelectedLane(first.id);
            setMelodyPartId(first.id);
        }
        const what = [summary.notes && `${summary.notes} note${summary.notes === 1 ? '' : 's'}`, summary.chords && `${summary.chords} chord${summary.chords === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
        flash(`Pasted ${what}. Undo to take ${summary.notes + summary.chords === 1 ? 'it' : 'them'} out.`);
    };

    const songActions = {
        new: () => {
            stopPlayback();
            const fresh = newFullSong();
            editFull(() => fresh);
            setOpenId(fresh.sections[0].id);
            setSongZoom('song');
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

    // while a dialog is open the instrument's keys are off (typing or tabbing in it mustn't play pads)
    const modalOpen = helpOpen || htOpen || settingsOpen || creditsOpen;
    const keyActions = useRef({ pressPad, releasePad, releaseAll, togglePlay, toggleRecord, edit, helpOpen: modalOpen, undo: history.undo, redo: history.redo });
    keyActions.current = { pressPad, releasePad, releaseAll, togglePlay, toggleRecord, edit, helpOpen: modalOpen, undo: history.undo, redo: history.redo };

    useEffect(() => {
        const isTyping = (t: EventTarget | null) =>
            t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement
            || (t instanceof HTMLElement && t.getAttribute('role') === 'slider');

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
                case 'KeyR': if (!e.repeat) a.toggleRecord(); break;
                case 'KeyN': if (!e.repeat) setPadMode(m => (m === 'notes' ? 'chords' : 'notes')); break;
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

    const names = noteNames(selectedKey, scale);
    const notesOn = padMode === 'notes' && padMelody !== null;
    /** In Notes mode, the note a pad plays with the stick in `dir`. */
    const padNote = (degree: number, dir: StickDir) => noteLabel(melodyMidi(padMelody!, harmony, noteStep(degree, dir)), names);
    const pads: PadView[] = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(degree => (notesOn
        ? { degree, numeral: '', symbol: padNote(degree, stickDir), held: held.includes(degree) }
        : {
            degree,
            numeral: romanNumeral(degree, scale),
            symbol: resolveChord(selectedKey, { degree, type: stickChordType(stickDir, triadQuality(degree, scale)), inversion, octave, scale }).name.symbol,
            held: held.includes(degree),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedKey, scale, stickDir, inversion, octave, held, notesOn, padMelody?.octave]);

    // The stick labels follow the pad you're using: a held pad, else the last chord played, else 1.
    // In Notes mode only up does something: the same note an octave higher.
    const refDegree = held.length ? held[held.length - 1] : shown ? shown.degree : 0;
    const stickChords = Object.fromEntries(STICK_DIRS.map(d => [d, notesOn
        ? (d === 'C' || d === 'U' ? padNote(refDegree, d) : '')
        : resolveChord(selectedKey, { degree: refDegree, type: stickChordType(d, triadQuality(refDegree, scale)), inversion, octave, scale }).name.symbol,
    ])) as { [d in StickDir]: string };
    const stickRules: Partial<Record<StickDir, string>> | undefined = notesOn ? { C: 'Note', U: 'Octave up' } : undefined;

    // While recording, the chord info says where the next chord goes, so you can record from Play mode.
    // (Nothing about playback goes there: it only follows what you play.)
    const perBeat = sixteenthsPerStep(ts);
    const recFlag = !recording ? undefined
        : notesOn ? (playing ? `● REC ${padMelody!.name} · live` : `● REC ${padMelody!.name} · beat ${Math.floor(melCursor / perBeat) + 1}`)
            : `● REC · step ${selected + 1}`;
    const info: ChordInfoView = shown
        ? {
            idle: false,
            live: held.length > 0,
            symbol: shown.chord.name.symbol,
            long: shown.chord.name.long,
            numeral: shown.note ? `${shown.degree + 1}` : romanNumeral(shown.degree, shown.scale),
            typeLabel: shown.note ? (shown.dir === 'U' ? 'octave up' : 'scale note') : TYPE_LABELS[shown.type ?? 'triad'],
            extra: shown.note ? padMelody?.name : INVERSION_LABELS[Math.min(shown.inversion, shown.chord.midi.length - 1)] || undefined,
            // a chord's notes from its root (root dark, what the stick added yellow); a note shown in its scale
            tags: shown.note
                ? scalePitchClasses(selectedKey, shown.scale).map(pc => ({ name: names[pc], role: pc === shown.chord.rootPc ? 'root' : 'triad' }))
                : chordTags(selectedKey, shown.scale, shown.degree, shown.type ?? 'triad'),
            flag: recFlag,
            // what usually follows the chord just played, in the song's key (chords only, live playing only)
            next: nextHint && !shown.note ? nextChords(selectedKey, scale, shown.degree) : undefined,
        }
        : { idle: true, live: false, symbol: '', long: '', numeral: '', typeLabel: '', tags: [], flag: recFlag };

    // The Play strip's "Pads →" picker: chord parts in Chords mode, melody parts (to play and record into) in Notes mode
    const target = (p: Part): PadTarget => ({ id: p.id, name: p.name, color: p.color, instrument: hasInstrument(p) ? instrumentLabel(p.instrument) : '' });
    const padTargets = notesOn ? melodyParts.map(target) : chordParts.map(target);
    const padTargetNow = target(notesOn ? padMelody! : padPart);
    const pickPadTarget = (id: string) => {
        if (notesOn) setMelodyPartId(id);
        else setPadPartId(id);
    };

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
        const groove = { beatTicks: T, kicks: kickTicks(parts, ts, total * T) };
        for (const p of parts) {
            if (!hasInstrument(p)) continue;
            const notes = partNotes(p, harmony, groove);
            const all = notes.flatMap(n => n.midi);
            const lo = Math.min(...all);
            const span = Math.max(12, Math.max(...all) - lo);
            out[p.id] = notes.flatMap(n => n.midi.map(m => ({ start: n.start / T, len: n.len / T, y: (m - lo) / span })));
        }
        return out;
    }, [parts, harmony, T, ts, total]);

    const beatDot = metronomeOn ? metBeat : playing ? playhead % ts.beats : null;

    /** The start tap: ring a chord from the song's key and fade from the intro into the app. */
    const begin = async () => {
        if (intro !== 'idle') return;
        const chord = introChord(scale);
        setIntroName(chord.name);
        setIntro('leaving');
        await startAudio();
        getEngine().playIntro(chord.midi);
        setTimeout(() => setIntro('done'), 1900);
    };
    const introEl = intro !== 'done' ? <IntroScreen phase={intro} chord={introName} onStart={begin} /> : null;
    // Until the first tap there is no audio, so nothing but the intro is mounted
    if (!audioReady) return <>{null}{introEl}</>;

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
                len={melodyLen}
                onLen={setMelodyLen}
                cursor={recording && !playing && notesOn && padMelody?.id === selPart.id ? melCursor : -1}
                onOctave={melodyActions.octave}
                onClear={melodyActions.clear}
            />
        ) : (
            // chord and bass parts have nothing to write: they follow the chord row; how they play is in Parts
            <div className="part-editor follow-note" style={{ '--track': selPart.color } as React.CSSProperties}>
                <div className="part-head">
                    <span className="sel-label">
                        <span className="track-dot" style={{ background: selPart.color }} />
                        {selPart.name}
                        <span className="section-note"> · {selPart.kind === 'bass' ? 'follows the roots of the chord row' : 'plays every chord in the chord row'}</span>
                    </span>
                    <button className="chip-button" onClick={() => { setPartsSel(selPart.id); setMode('parts'); }}>How it plays: Parts →</button>
                </div>
            </div>
        );


    const htDialog = (
        <HooktheoryDialog
            open={htOpen}
            song={song}
            selectedStep={selected}
            chordOctave={octave}
            onClose={() => setHtOpen(false)}
            onImport={importPaste}
        />
    );

    const notesOctave = notesOn ? padMelody!.octave : octave;
    const deviceEl = (
        <Device
            info={info}
            sounding={sounding}
            scalePcs={scalePitchClasses(selectedKey, scale)}
            octave={octave}
            pads={pads}
            stickDir={stickDir}
            latchedDir={latchedDir}
            stickChords={stickChords}
            stickRules={stickRules}
            padMode={notesOn ? 'notes' : 'chords'}
            notesPart={padMelody?.name}
            onPadMode={setPadMode}
            stickFor={notesOn ? `${refDegree + 1}` : `${refDegree + 1} · ${romanNumeral(refDegree, scale)}`}
            recording={recording}
            onPadDown={d => pressPad(`pad:${d}`, d)}
            onPadUp={d => releasePad(`pad:${d}`)}
            onStick={setLatchedDir}
            onStickHold={setTouchDir}
            compact={compact}
            strip={{
                padMode: notesOn ? 'notes' : 'chords',
                // in Notes mode the octave buttons move the melody part (C3–C5), which is part of the song
                octave: notesOctave,
                octaveMin: notesOn ? MELODY_OCT_MIN : OCTAVE_MIN,
                octaveMax: notesOn ? MELODY_OCT_MAX : OCTAVE_MAX,
                onOctave: o => (notesOn
                    ? updatePart(padMelody!.id, { octave: Math.max(MELODY_OCT_MIN, Math.min(MELODY_OCT_MAX, o)) } as Partial<Part>)
                    : setOctave(Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, o)))),
                inversion,
                maxInversion: maxInv,
                onInversion: setInversion,
                voiceLeading,
                onVoiceLeading: setVoiceLeading,
                target: padTargetNow,
                targets: padTargets,
                onTarget: pickPadTarget,
            }}
        />
    );

    const openSec = findSection(full, openKey);
    const repeats = chainCount(full, openKey);
    const songMenuEl = (
        <SongMenu
            onNew={songActions.new}
            onOpenFile={songActions.open}
            onSaveFile={songActions.save}
            onShare={songActions.share}
            onHooktheory={() => setHtOpen(true)}
            onClearAll={edit.clearAll}
            canClearAll={sectionsHaveContent(full)}
        />
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
            sixteenthsPerStep={sixteenthsPerStep(ts)}
            sixteenthsPerBar={sixteenthsPerBar(ts)}
            loopSteps={loop ? sectionLoopLength(song) / T : total}
            recordInto={notesOn ? padMelody!.name : undefined}
            partEditor={partEditor}
            selected={selected}
            playhead={playhead}
            playing={playing}
            loop={loop}
            recording={recording}
            canPaste={!!clipboard}
            describe={describe}
            onSelect={select}
            onFirst={edit.first}
            onPrev={edit.prev}
            onNext={edit.next}
            onToggleLoop={() => setLoop(l => !l)}
            onAddRow={edit.addRow}
            onRemoveRow={edit.removeRow}
            onLonger={edit.longer}
            onShorter={edit.shorter}
            onSplit={edit.split}
            onCopy={edit.copy}
            onPaste={edit.paste}
            onRest={edit.rest}
            onRestPart={edit.restPart}
            onDelete={edit.del}
            undoRedo={<UndoRedo canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} />}
            songMenu={songMenuEl}
            sectionHeader={(
                <SectionSwitcher
                    sections={full.sections}
                    openId={openKey}
                    timeSignature={ts}
                    counts={Object.fromEntries(full.sections.map(sec => [sec.id, chainCount(full, sec.id)]))}
                    queued={queued}
                    onBack={() => setSongZoom('song')}
                    onPick={openSection}
                />
            )}
            sectionName={openSec.name}
            sectionMutes={openSec.mutes}
            onSectionMute={(partId, muted) => editFull(f => setSectionMute(f, openKey, partId, muted))}
            repeatNote={repeats > 1 ? `×${repeats} in the chain: edits change ${repeats === 2 ? 'both' : 'all of them'}` : undefined}
        />
    );

    const songViewEl = (
        <SongView
            song={full}
            openId={openKey}
            playMode={playMode}
            onPlayMode={setPlayMode}
            playing={playing}
            chainPos={chainPos}
            playingSection={playingSection}
            queued={queued}
            onOpen={id => {
                openSection(id);
                setSongZoom('section');
            }}
            onPickSlot={slot => {
                openSection(slot.section.id);
                jumpToSlot(slot);
            }}
            onNew={() => {
                const r = addSection(full);
                if (!r.id) return;
                editFull(() => r.song);
                openSection(r.id);
                setSongZoom('section');
            }}
            onRename={(id, name) => editFull(f => renameSection(f, id, name))}
            onDuplicate={id => {
                const r = duplicateSection(full, id);
                if (r.id) editFull(() => r.song);
            }}
            onDelete={id => {
                const gone = full.sections.find(sec => sec.id === id);
                if (!gone || full.sections.length <= 1) return;
                if (id === openKey) openSection(full.sections.find(sec => sec.id !== id)!.id);
                editFull(f => deleteSection(f, id));
                flash(`Deleted ${gone.name}. Undo to bring it back.`);
            }}
            onAddToChain={id => editFull(f => appendToChain(f, id))}
            onMoveEntry={(i, dir) => editFull(f => moveEntry(f, i, dir))}
            onDuplicateEntry={i => editFull(f => duplicateEntry(f, i))}
            onRemoveEntry={i => editFull(f => removeEntry(f, i))}
            songMenu={songMenuEl}
        />
    );

    const partsEl = (
        <PartsView
            parts={parts}
            space={song.space}
            selected={partsShown}
            onSelect={setPartsSel}
            padPartId={padPart.id}
            onPadPart={setPadPartId}
            onUpdate={updatePart}
            onTone={setTone}
            onFx={fxActions.set}
            onSpace={fxActions.space}
            onDryAll={fxActions.dryAll}
            onAdd={kind => {
                const id = partActions.add(kind);
                if (id) setPartsSel(id);
            }}
            onRemove={partActions.remove}
            canRemove={partActions.canRemove}
            onOpenBeat={id => {
                pickLane(id);
                setSongZoom('section');
                setMode('song');
            }}
        />
    );

    const entering = intro === 'leaving' ? 'app-entering' : '';
    return (<>
        <div className={`app ${compact ? 'compact' : 'wide'} mode-${mode} ${entering}`}>
            <TopBar
                compact={compact}
                mode={mode}
                selectedKey={selectedKey}
                scale={scale}
                bpm={bpm}
                playing={playing}
                recording={recording}
                beat={beatDot}
                beats={ts.beats}
                onMode={setMode}
                onKeyChange={setSelectedKey}
                onScaleChange={setScale}
                onBpmChange={b => setBpm(Math.max(BPM_MIN, Math.min(BPM_MAX, b)))}
                onTogglePlay={togglePlay}
                onToggleRecord={toggleRecord}
                onOpenSettings={() => setSettingsOpen(true)}
            />
            {mode === 'play' && deviceEl}
            {mode === 'song' && (songZoom === 'song' ? songViewEl : progressionEl)}
            {mode === 'parts' && partsEl}
            <SettingsSheet
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                theme={theme}
                onTheme={setTheme}
                click={metronomeOn}
                onClick={setMetronomeOn}
                clickAccent={clickAccent}
                onClickAccent={setClickAccent}
                meter={`${ts.beats}/${ts.unit}`}
                nextHint={nextHint}
                onNextHint={setNextHint}
                onHelp={() => setHelpOpen(true)}
                onCredits={() => setCreditsOpen(true)}
            />
            <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
            <CreditsDialog open={creditsOpen} onClose={() => setCreditsOpen(false)} />
            {htDialog}
            {notice && <div className="toast" role="status">{notice}</div>}
        </div>
        {introEl}
    </>);
};

export default App;
