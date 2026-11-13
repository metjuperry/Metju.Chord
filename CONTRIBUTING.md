# Contributing to Metju.Chord

This guide is for anyone changing the code, people and coding agents alike. Read the first section, then skim the rest; it's written so you can find the part you need. What the app does for its users is in the [README](README.md).

## In five minutes

- **What it is**: a chord instrument (7 pads + an 8-way stick) on top of a small song editor (sections, a chain, parts for chords / bass / melody / drums). React 19 + TypeScript + Tone.js, bundled with plain Webpack 5 (no Vite, no CRA, no router, no state library). No backend: everything lives in the browser and in share links.
- **Where state lives**: `src/App.tsx` owns all state and wires everything. Music logic is in pure, tested modules (`theory.ts`, `progression.ts`, `parts.ts`, `drums.ts`, `song.ts`, `sections.ts`, `playback.ts`, `learn.ts`, `hooktheory.ts`, `shades.ts`). Audio is in `src/audio/`. Components are in `src/components/`.
- **The one rule of the UI**: **Song is what plays** (notes, chords, hits), **Parts is how it sounds** (instrument, style, tone, effects, level). Transport (Play/Pause, Stop, Record) lives only in the top bar.
- **Before every commit**: `npm test` and `npm run build`. After touching instruments, drums or the engine: `npm run levels` too.
- **Branches**: work on `claude/<topic>` (or any topic branch) and open a PR **into `master`**. `master` deploys to GitHub Pages (<https://chords.metju.cz>) on every push.
- **When you change behaviour**: update the README's feature list, the in-app help (`HelpDialog.tsx`) when it describes that feature, and this guide when you change architecture, conventions or the save format.

## Setup and commands

Node **22.12+** (Vitest 5 requires it; CI uses Node 22).

| Command | What it does |
| --- | --- |
| `npm install` | dependencies |
| `npm start` | dev server with HMR at <http://localhost:3000> |
| `npm test` | Vitest, all `src/**/*.test.ts` (pure logic; no DOM tests. `sequencer.test.ts` runs `SequencerPlayer` on a mocked Transport, `untrusted.test.ts` fuzzes the save readers) |
| `npm run build` | production bundle in `dist/`; `ts-loader` type-checks, so a type error fails the build |
| `npm run levels` | bundles `scripts/levels-page.ts`, renders every instrument offline in headless Chromium, prints peak/RMS per instrument and checks the targets below. Set `CHROMIUM_PATH` if Chromium isn't at `/opt/pw-browsers/chromium` |
| `node scripts/version.cjs` | prints the version the build will show |
| `node scripts/icons.cjs` | re-renders `public/icons/` from the favicon design (needs Chromium) |
| `python3 scripts/samples/prepare.py …` | rebuilds `public/samples/` and `src/audio/samples.json` from the original sample libraries (see its docstring) |
| `python3 scripts/voices/vocalset.py selftest \| fetch DIR \| analyse DIR OUT \| make ANALYSIS OUT` | the Voice part's singers and vowel formants from VocalSet (CC BY 4.0), in two stages: `analyse` keeps every note of every long tone as numbers (`scripts/voices/analysis/vocalset-analysis.json`), `make` turns that into `src/audio/vocalset.json` and never fails (it lists warnings). Run through the **Voice data** GitHub Action (Actions → Voice data → Run workflow), which pushes a branch with both; redo `make` locally from the analysis instead of running the Action again |

CI: `.github/workflows/ci.yml` runs tests and build on every pull request; `.github/workflows/deploy.yml` runs tests, builds and publishes on every push to `master`.

## Workflow

- One topic per branch, one PR per topic, **based on `master`**. Don't stack PRs on each other's branches: when the bottom one merges, GitHub merges the upper ones into the old branch, not into `master` (this happened with #20–#23 and needed a catch-up PR, #24). If work depends on an unmerged PR, say so in the description and rebase once it's in.
- Keep the README out of feature PRs that are likely to be open at the same time, or keep README edits to the lines of your feature, so parallel PRs don't conflict.
- **Versions** are automatic: `1.<highest merged PR number>.0`, read from git history by `scripts/version.cjs` at build time and shown on the start screen (1.37.0 = everything up to #37). PRs don't bump anything; don't edit a version by hand. The deploy checks out the full history for it; `APP_VERSION=… npm run build` overrides it.
- Commit messages: a short summary line ("Melody grid: note letters in shades of the part colour"), then what and why.
- PR descriptions: what changed for the user, how it was checked (tests, which screen sizes, which browser checks), and anything not verifiable in a sandbox (real-phone feel, sound on real speakers).
- Cloud sandbox notes: `gh api` (REST) works and GraphQL doesn't, so use `gh api repos/metjuperry/Metju.Chord/pulls …` instead of `gh pr …`. A shallow clone may not track new branches: add `+refs/heads/claude/*:refs/remotes/origin/claude/*` to `remote.origin.fetch`.

## Map of the code

```text
src/
  index.tsx              entry; registers the service worker
  pwa.ts                 service-worker registration and update reload, screen wake lock
  sw.js                  the service worker (plain JS; webpack fills in the build's file list and version)
  App.tsx                owns all state: song (with undo), live settings, selection, playback, recording, the clipboard
                         for chords / melody / drums; global keyboard shortcuts; lays out phones (one mode at a time)
                         and desktop (instrument left, Song | Parts tabs right)
  theory.ts              pure music theory: keys, scales, chord building (MIDI), inversions, naming and spelling,
                         stick→chord type, voice leading, register-aware spreading, strum timing, "what comes next"
  progression.ts         the chord row: clips in ticks and editing ops (place, setLength, split, fitTo)
  parts.ts               parts (chords, bass, melody, voice, drums), what each plays (partNotes, bassNotes…), pan and effects,
                         melody editing incl. copy/paste (notesIn, replaceRange, pasteNotes), song length
  drums.ts               drum patterns, presets per time signature, pattern ops
  song.ts                FullSong (sections + chain), Song (one section's view), Settings, time signatures, defaults,
                         reading untrusted saves (readSaved → readFullSong, or readSong + fromSingleSection for v2), share links
  sections.ts            the section projection (sectionView / applySectionEdit), section and chain edits, chain layout
  playback.ts            what plays: sectionEvents (one section), chainEvents (the whole chain), loop lengths
  learn.ts               the Learn page's content as pure data (PROGRESSIONS, STICK_SOUNDS, PAD_ROLES, COMBOS, MELODY_RULES),
                         fitProgression (exact / relative / "needs" + closest in-scale), progressionClips, insertProgression
  hooktheory.ts          Paste from Hooktheory: parses clipboard JSON (untrusted, never throws), notes → Melody parts,
                         chords → pad chords (chordTones → matchChord)
  strum.ts               strum patterns (down/up strokes through each chord), the wider strum voicing, stroke notes and velocities
  sound.ts               a part's shape: ADSR, filter (cutoff, resonance, env amount, LFO), drive; instrument default envelopes, knob mappings, older songs
  sync.ts                Pocket Operator sync out: its device-only settings (own localStorage key), pulse rate and timing
  shades.ts              a part colour's seven shades for the melody grid's note letters, per theme
  useHistory.ts          undo/redo with merge keys (one knob turn or slider drag = one step)
  tempo.ts               tap tempo: the last few taps and the tempo they were at
  touch.css              compact only: 44 px hit areas for every control (see UI conventions)
  useMedia.ts            matchMedia hook (the compact layout switch)
  motion.ts              animation helpers: section zoom, slide and fade, segmented thumbs, the Reset morph; reduced-motion check
  preview.ts             sound preview: what a part plays on each beat while its sound is being changed in Parts
  audio/
    engine.ts            every audio node: per-part channels, shared reverb/delay, master, limiter, transport helpers, intro chord
    instruments.ts       the 14 instruments (INSTRUMENTS): synth presets (a voice pool), sample players, matched volumes
    voice.ts             the Voice part's singers (VoiceInstrument): per-singer waves and formant-filter mouths, vowel glides
    voiceData.ts         singer colours (harmonics) and vowel formants per range from vocalset.json (VocalSet, measured by scripts/voices/vocalset.py), textbook stand-ins where it has none, vowel loudness trims
    samples.json         which notes each sample set has, and its loop points (written by prepare.py)
    drumkit.ts           the synthesised drum kit
    sequencer.ts         lookahead scheduler on the Tone Transport (reads the song fresh every 1/16)
  components/
    TopBar               the one header: key, scale, tempo (Tempo: hold-repeat, typed, tap), Play/Pause, Stop, Record, undo/redo,
                         modes, 📖 Learn, ⚙; on compact one fixed row with the key · tempo chip and its sheet (KeySheet)
    Device               chord info (ChordInfo), play strip (PlayStrip), scale-key strip (desktop), stick, pads, Chords/Notes switch
    SongView             Song mode's top level: section tiles, the chain, Chain | Loop
    SectionSwitcher      "‹ Song" and ‹ [section ▾] › in a section's header
    PopMenu              long-press / right-click menus (useLongPress)
    Progression          sequencer: header, chord lane + part lanes (per-section M), docked chord toolbar
    MelodyEditor, DrumEditor   the selected lane's editor under the sequencer (Copy / Paste / Clear; melody row ⋯ menus)
    PartsView            Parts mode: mixer (VolumeBar), the selected part (instrument, play-as/style, shape, tone, effects), Master;
                         on compact the part is in sub-tabs Sound · Shape · Effects (PartTabs, `partsTab` setting)
    ShapeGraphs          the envelope and filter pictures: read-only in Simple, draggable in Advanced (EnvelopeGraph, FilterGraph)
    Scope                the Advanced live waveform of a part (a canvas fed by Engine.analyser)
    FxMatrix, Knob       SpaceControls (shared reverb/delay/out), the Mix overview, the knob control
    SettingsSheet        ⚙ sheet and Credits; useDialog.ts gives dialogs focus trap and Esc
    LearnPanel           📖 Learn: tabs, progression cards, chord cards, melody rules with MiniGrid
    SongMenu, HelpDialog, IntroScreen, HooktheoryDialog
scripts/levels*.ts       the level-matching check (npm run levels)
scripts/icons.cjs        renders public/icons/
scripts/samples/         prepare.py: builds public/samples/ from the original sample libraries
public/                  index.html, manifest.webmanifest, icons/, samples/<instrument>/<midi>.mp3 (copied into dist/)
```

Tests sit next to their module (`theory.test.ts`, `parts.test.ts`…). Pure logic gets a test; components don't have tests and are checked in a browser (see [Checking changes](#checking-changes)).

## Data model (`song.ts`, `parts.ts`, `sections.ts`)

- `FullSong = { key, scale, bpm, timeSignature, space, parts: Part[], sections: Section[], chain: { sectionId }[] }` is the song. Everything in it is undoable and saved.
- `Section = { id, name, letter, steps, chords: Clip[], content: { [partId]: { notes?: Note[] } | { drums?: DrumPattern } }, mutes: { [partId]: true }, sound?: { [partId]: {…} } }`. `sound` holds only what a section sets differently from the song's part (anything but id, kind, name, colour, mute, solo and content); `readSectionSound` repairs it by reading it laid over the part and keeping what still differs. Melody notes and drum patterns live in sections; chord and bass parts follow the section's chords. In a FullSong the parts carry no content (a Melody part's `notes` is `[]`, a Drums part's `drums` empty). Up to `MAX_SECTIONS` (26) sections and `MAX_CHAIN` (128) chain entries.
- **The projection**: `sectionView(fullSong, id)` returns a single-section `Song = { key, scale, chords, parts (with that section's notes/drums), steps, bpm, timeSignature, space }`. The sequencer, editors, recording, `partNotes`, rests and Hooktheory paste all work on it. App's `editSong(fn)` runs `fn` on the open section's view and `applySectionEdit` writes it back (chords, length and content into the section; key and tempo song-wide; unchanged objects keep their identity). Parts' sound follows `soundScope`: with Song zoomed into a section the view carries that section's sound (`sectionView(f, id, true)`) and edits go into `section.sound` ('section'); with the whole song open the view has the song's parts and an edit goes to the part and clears that setting (or, in fx/tone/shape, that entry) from every section ('song'). A section whose own sound touches instrument, volume, fx, tone or shape plays through its own engine strip `${partId}@${sectionId}` (`stripId`, `engineStrips`); playback events and live playing (`trackOf` in App) use it. Parts shows the scope in a chip at the top of its list (`ScopeChip`: "Chorus only" / "Whole song"; a tap flips `songZoom`, so Song follows). With a section open, `ownSoundKeys(song, sectionId, partId)` lists what that section sets its own way ('instrument', 'playMode', 'fx.reverb', 'shape.cutoff'…) and Parts puts a dot on each (`<Own k=… when=… />` reads them from `OwnContext`; give a new part setting its key), `clearSectionSound` is "Use the song's sound", and `hasOwnSound` marks a section tile in Song. Whole-song edits (sections, chain, time signature, Clear all = `cleanSlate`) go through `editFull`. Big ones ask first with `ConfirmDialog` (Cancel has the focus).
- **Time** is in ticks, **96 per quarter note** (`PPQ`). A sequencer step is one beat (`ticksPerStep(ts)`: 96 in x/4, 48 in x/8). Melody and drums work in 1/16s (`TICKS_PER_SIXTEENTH` = 24).
- **Chord clips** store only `{ degree, type, inversion, octave }`; key and scale come from the song, and `resolveClip(harmony, clip)` turns a clip into notes. A chord sounds once and holds for the clip's length. A rest clip may carry `plays: { [partId]: boolean }`; unlisted parts use `REST_PLAYS` (chords and bass stop, melody and drums play on).
- **Parts**: `Part = ChordPart | BassPart | MelodyPart | DrumPart`, all with `{ id, name, color, volume, mute, solo, fx }`; up to six (`MAX_PARTS`, one per `PART_COLORS`). Instrument parts have `tone = { pan }` and `shape: ShapeOverrides`: only what the part changes of its instrument's envelope, filter and drive (`sound.ts`). `effectiveShape(instrument, shape)` fills in the instrument's own (`defaultShape`: the synth preset's ADSR, or the samples' for sampled instruments, with the filter open and no drive), so an untouched part sounds as designed and Reset is `shape: {}`. Knobs map through `KNOBS` / `toKnob` / `fromKnob` (log for times and frequency) and read via `shapeText`. Songs saved before the shape had relative `tone.attack/release/brightness` and `fx.drive`: `legacyShape` turns them into the same sound (a brightness above the middle, a treble lift, is dropped). A chord part's style is `playMode` (`'Chord' | 'Strum' | 'Arp'`), arp settings, `strumSpread`, `strumDirection`, `strumPattern`. Strumming lives in `strum.ts` (pure): `STRUM_PATTERNS` (8th-note strings of D / U / - over a 4/4 bar), `strumStrokes` (the strokes through a chord, lined up to the bar, a down at every chord start), `strumVoicing` (the chord plus its lowest note, and for a triad its second, an octave up), `strokeNotes` (down: all notes low→high; up: top 3 high→low at 0.55× the spread, lighter) and `liveStroke` for the pads. `chordPartNotes` turns each stroke into a `NoteEvent` lasting until the next stroke, with a `velocity` the engine multiplies in. Saved spreads snap to the offered ones (`nearestSpread`).
- **Melody notes** are `Note = { start, len, step, acc? }`: a **scale step** (0–14 from the key's root in the part's octave), not a MIDI note, so they follow key and scale changes. `acc: -1 | 1` makes a note a semitone flat or sharp and is left out when natural. Pitch: `noteMidi(part, h, note)`. Display spelling: `spellNote` / `spellNoteOctave` (accidental on the scale note's letter; no double sharps or flats).
- **Effects**: `fx = { chorus, tremolo, glide, reverb, delay }` (0–1, 0 = off); drums use reverb/delay only. Glide applies to single notes only (`glides`), never block chords. `space = { reverb: { size, ret }, delay: { time, feedback, ret }, out: { level } }`.
- **Settings** (voiceLeading, octave, inversion, loop, theme `light | dark | auto`, nextHint, padPart, clickAccent, openSection, playMode `loop | chain`, learnTab, chordMood, soundPreview, shapeView, partsTab) are saved but not undoable. `readSettings` fills defaults and ignores unknown fields.

### Saves (keep them loading)

- `SavedState { version: 3, song: FullSong, settings }` is stored in localStorage under `metju.chord.v3` (`STORAGE_KEY`), in JSON files, and in `#song=` share links (deflate-raw + base64url).
- `readSaved` reads version 3 with `readFullSong` and version 2 with `readSong` + `fromSingleSection` (the old song becomes one section "A"). If `metju.chord.v3` is empty, the app reads `metju.chord.v2` and leaves it alone.
- A share link never costs the user their song: before one loads, the saved song is copied to `metju.chord.v3.before-share` (`BEFORE_SHARE_KEY`; one already there stays) and the Song menu offers **Back to my song** while it exists. A link is refused past `MAX_SHARE_CHARS` or `MAX_SHARE_BYTES` unpacked.
- **Ids** of parts and sections are short and made of letters, digits, `-` and `_` (`isId` in `song.ts`); anything else gets a fresh id on reading. They are keys of plain records and part of strip names (`part@section`), so keep new ids in that shape.
- **All saves are untrusted input.** The readers repair rather than reject: clamp numbers, drop overlaps, drop content for unknown parts and chain entries for unknown sections, keep at least one section and a non-empty chain. **Every new field needs a default in the reader**, so old saves and old share links keep loading. Prefer optional fields that are left out when they have their default (as `acc` is), so existing saves stay byte-for-byte the same and the save version doesn't need to change. Bump `SAVE_VERSION` only for a change the readers can't absorb, and add a reader for the previous version.

## Audio (`src/audio/`)

- Per part: `instrument → filter → drive → makeup → chorus → tremolo → pan → volume → master`, plus `volume → reverb send / delay send` into one shared `Reverb` and `FeedbackDelay`; returns go to `master → limiter (-1 dB) → destination`. Drum channels skip filter, drive, chorus and tremolo.
- **Shape in the engine** (`Engine.applyShape`, `filterEnv`): the voice gets only the part's envelope overrides (`Voice.shape(Partial<Adsr>)`; `SynthPool` sets all four on its Tone envelopes, `SamplePlayer` adds decay/sustain to its gain envelope). The filter is a `Tone.Filter` at -24 dB/octave whose frequency is driven by a `Tone.LFO` (min = max = cutoff at depth 0, `lfoRange` otherwise; rate in note values, re-read on tempo changes) and whose `detune` carries the filter envelope (`filterEnvelope`: 0 → Env Amount over the attack, → amount × sustain over the decay), retriggered on every note or strum stroke. `Engine.analyser(id)` taps a part's level with a `Tone.Analyser` on first ask (disposed with the channel), for the scope. Drive is a `WaveShaper` with `driveCurve` (crunch is exactly the old `Tone.Distortion` curve) and a makeup gain (`driveMakeupDb`) fitted so turning it up keeps the loudness.
- App keeps the engine in step: `syncParts` on every parts change, `setSpace` on space changes, `selectTrack(padPart)` for the pads. Live pads use `engine.attack(midi, time, track)`.
- **Playback**: `SequencerPlayer` asks `schedule()` for events every 1/16 on the Transport, so edits while playing are heard at once (App caches events per song edit). Loop mode schedules `sectionEvents` of the looped section; Chain mode schedules `chainEvents` (each slot's section from its start, for `playedTicks`: where its music ends rounded up to a bar, capped at its length, the same as Loop's `sectionLoopLength`, drum patterns restarting, notes cut at the section end). Switching while playing uses `queueJump(at, to, run)` (section switch at the next bar, jump to a tapped chain block, Chain ↔ Loop). A jump at or past the loop end lands in the window that reaches the end.
- **Instruments** implement `Voice`: `attack(midi[], time, velocity, glide?)`, `release`, `releaseAll`, `output`, `ready`, `dispose`. Synths are a `SynthPool` of monophonic voices handed out by audio time (unlike `Tone.PolySynth`, notes scheduled ahead never steal a sounding voice). Sampled instruments are a `SamplePlayer` behind their synth stand-in until `loadBank` has decoded the samples.
- **Voice** (`voice.ts`, instrument id `'voice'`, not in `INSTRUMENTS` so other parts can't pick it): each note is one oscillator per singer (1 solo, 5 choir) with a `PeriodicWave` of that singer's harmonics (`SINGERS`), detuned per singer, with that singer's vibrato and drift LFOs summed into its `detune`. Each singer has a "mouth", in a row: F1 and F2 as resonances (low-pass biquads, Q = centre / bandwidth: the vowel, with a vocal tract's valleys), F3 and F4 as peaks (peaking biquads, `peakDb`), an air shelf (+18 dB above 2.5 kHz: four resonances alone fall away far too fast, which sounds muffled and far off), the vowel's loudness trim and a panner; each choir singer's formants are scaled by their own `tract` size, so five mouths don't comb into a hollow sound. A gentle compressor (`even`) evens the level from chord to chord. Only F1 and F2 change with the vowel; F3 and F4 are the singer's, the same on every vowel (`oneVoice` in voiceData.ts). `scripts/voices/vocalset.py` `mouth()` mirrors this chain exactly (`biquad_mag`), since the singers' colours are their harmonics with it divided out; change one, change both, remake the data and refit `VOWEL_TRIM`. `sing(settings)` sets solo/choir, range, vowel, vibrato and breath (`setTrack(..., { voice })`); `vowel(v, time, glide)` ramps the filters, so vowel changes can be scheduled like notes. `VOWEL_TRIM` evens out each vowel's loudness as heard (A-weighted, a choir on three chords per vowel; refit it whenever the formants, singers or mouth change). Breath is pink noise, high-passed, through the first singer's mouth, quietly (`BREATH_LEVEL`). A Voice part is a `NotesPart` (`hasNotes`); `writesNotes` is true only while it sings notes, and `voiceChordNotes` plays the chord row moved by octaves into its range. Its singers' settings are in `STRIP_KEYS`, so a section can sing its own vowel through its own strip. The **vowel lane** (`VoicePart.vowels`, `VowelClip[]`) is section content like `notes` (`PartContent.vowels`, a content key, not a sound key): `sectionEvents` adds `{ vowel, glide, part }` events where a stretch starts and ends, and each voice note carries the vowel at its start, so playback started midway is right at once; App sends both to `engine.setVowel`, and Stop calls `engine.resetVowels()`. `VowelLane.tsx` paints it a beat at a time (`vowelClipsFromSteps` / `vowelSteps`); `vowelPerChord` fills it from the chord row; `vowelGlideSeconds` maps the Vowel glide knob.
- **Sync out** (`sync.ts`, `Engine.setSync` / `syncPulse`): when on, `limiter → mono sum (1 channel, speakers downmix) → Merge input 1` (right) and pulse sources `→ pulses gain (±1 for polarity) → Merge input 0` (left) → destination; when off, `limiter → destination` as before. A pulse is a 5 ms buffer of ones at full scale. `SequencerPlayer` calls `onWindow(time, index)` at every 1/16 window, counted from start (also windows with nothing to play, so the index follows real time); App pulses on every 2nd (`windowPulses`, 2 PPQN), at the window's audio time plus the offset (`pulseTime`, never in the past; windows are scheduled ~50 ms ahead). Only playback pulses: pads alone don't. The settings live under `metju.chord.sync`, outside `SavedState`, so files and share links never carry them.
- **Levels** (`npm run levels` must stay green): sustaining RMS spread ≤ 6 dB, triad peaks -10…-3 dBFS, all-effects limiter output ≤ -0.5 dBFS. Sampled instruments are measured with their samples (`SAMPLE_VOLUMES`) and as their stand-in synth (`~synth` rows, `VOLUMES`), so the switch doesn't jump in level. `MASTER_GAIN` (0.8) leaves headroom for full sends; `driveMakeupDb` (sound.ts, per drive type) is fitted to measured loudness.
- The audio context starts only after the intro tap (`startAudio`); nothing audio is created before.
- Samples are fetched relative to the page (`samples/<id>/<midi>.mp3`) and Webpack's `publicPath` is `''`, so the app works at the domain root (chords.metju.cz) and under a subpath (metjuperry.github.io/Metju.Chord/) alike. Keep every URL relative.

## PWA (`pwa.ts`, `sw.js`, `webpack.config.js`)

- Webpack copies `public/` into `dist/` (`PublicFilesPlugin`), hashes the bundle, and writes `sw.js` from `src/sw.js` with every built file and a content-hash version (`ServiceWorkerPlugin`). All URLs are relative.
- The worker precaches the build (page, code, icons and manifest must succeed; samples are best-effort and cached on first fetch), deletes old caches on activate, serves pages network-first and everything else cache-first. It registers only in production builds, so the dev server is never cached.
- Updates: a new deploy means a new worker that takes over at once. `registerServiceWorker` reloads on `controllerchange` only if no pad or stick has been touched yet, otherwise the next time the page is hidden, so a jam is never cut off.
- Wake lock: `keepScreenOn()` asks for a screen lock after the intro tap and again on `visibilitychange`; it's a no-op where unsupported.

## UI conventions

Keep these when changing anything visible.

- **Yellow means on/active** (`--accent` / `--cap`): selected options, the pushed stick wedge, a held pad, the open section. A selected item gets a yellow *edge*. Parts never use yellow; their colours are `PART_COLORS`.
- Flat dark tiles with a thin edge (`--panel-2`, `--line`); only the instrument's own keys (pads, knob, intro key) get the keycap lip. No dashed outlines. The chord info is part of the instrument body, not a screen: no LCD look.
- **Short labels.** "Copy", "Paste", "Clear", not "Paste A · Melody". Explanations go in the help, Learn or a short notice, not on buttons. Notices only when something unexpected happened (e.g. notes left out).
- **Themes**: tokens in `index.css`; check new UI in both (`data-theme="light"` on `<html>`). "Auto" resolves to light or dark from `prefers-color-scheme`, so CSS only sees those two. The device body has its own tokens (`--device-*`, `--cap`).
- **Phones**: `compact = (max-width: 1023px), (max-height: 560px)`. **The phone layout is landscape only**: design and check at 844×390, 667×375 and 932×430 (stick left, pads right). Play mode must fit without scrolling at those sizes, also with installed safe-area insets (notch 47–59 px on the sides, home indicator 21 px). Portrait (390×844) is not a design target; the code keeps working there (the top bar and a section's header may wrap), so don't break it, but don't spend layout on it.
- **The compact top bar is fixed and one row** (`.top-bar.compact`: sticky, edge to edge, takes the notch and status-bar insets itself; `.app.compact` has no top padding). It must stay one row at 667 px with everything in it 44 px tall, which is why key, scale and tempo fold into one chip that opens a sheet (`KeySheet`, a `useDialog`; App owns `keyOpen` so shortcuts rest while it's open). Anything new in the bar has to fit that row. A section's header is one row on compact as well: length, time signature, ± Row and the Song menu's entries are in its "⋯" `PopMenu` (`songItems` in App mirrors `SongMenu`'s list: change both).
- **Parts on compact is one screen per view**: the selected part's detail is split into Sound · Shape · Effects (a `role="tablist"` in its header; the last tab is the `partsTab` setting), the instruments are a wrapping grid, and the envelope/filter graphs show only in Advanced. New part settings go in one of the three tabs; keep each tab inside 844×390 under the top bar (Strum, Voice at 667 px and Advanced still scroll inside the panel). Desktop shows everything in one column as before.
- **44 px to hit on compact**: every button, select, switch, knob and slider has a hit area of at least 44 × 44 CSS px. `src/touch.css` (imported last, everything under `.app.compact`, so desktop sizes don't move) does it two ways: toolbars and menus get really taller controls, and small controls in dense places keep their look and get an invisible `::after` grown to 44 px (add the selector to the list at the top of the file). Hit areas must not overlap, so such neighbours sit at least 44 px apart. Exceptions, waiting for their own redesign: the melody and drum grid cells and the drum row names. Check with a script that probes `elementFromPoint` around each control (see [Checking changes](#checking-changes)), not by reading sizes: clipping (`overflow`) and neighbours eat hit areas.
- **Desktop**: a two-column grid, the device sticky on the left, Song | Parts tabs (`role="tablist"`) on the right. Check 1024, 1280, 1440 and 1600 px.
- **No text selection**: `body` has `user-select: none` and no iOS touch callout, because quick repeated pad taps would otherwise select text. Inputs and reading text (help, credits, Learn) opt back in; add new reading areas to that list in `index.css`.
- **Accessibility**: everything has a keyboard path and an aria label. Dialogs (`role="dialog"`, `aria-modal`) use `useDialog` (focus in, Tab trapped, Esc closes the top one, focus back). Global shortcuts live in App's keydown handler, which ignores inputs, selects and `role="slider"`.
- **Effects return nothing or a cleanup**: write `useEffect(() => { … })` with a block body. An expression body returns its value as the cleanup, and React calling a non-function on unmount blanks the whole app (newer browsers return a Promise from `scrollTo`, which did exactly that to Learn). `effects.test.ts` enforces it.
- **Motion: calm, never in the way** (`motion.ts`, tokens `--motion-fast` 140 ms, `--motion` 200 ms, `--ease` in `index.css`). What moves: the sequencer playhead glides (App writes `--pp` on `.playhead` every frame while playing); a section tile grows into the editor and back (`zoomSection`, View Transitions, `data-section` on the tile); ‹ › slides the sequencer in from that side; every `.segmented` group has a sliding thumb (`useSegmentThumbs` writes `--seg-x/-y/-w/-h`; a variant with another pressed colour sets `--seg-thumb`); the part detail fades up on a switch; Record pulses while on; Reset swings the shape back (`useMorph`). Nothing delays a pad or a sound. Every animation stops with `prefers-reduced-motion`, and anything without browser support simply jumps. Keep new motion to that: few things, short, on purpose.
- **Undo**: every edit to the song is one undo step (use merge keys in `useHistory` for drags and knob turns). Settings are not undoable. Undo and redo live in the top bar (`UndoRedo`), on every screen, and nowhere else. A notice about an undoable edit is `flash(text, { undo: true })`: the toast gets an Undo button, so the text doesn't need to say "undo to…".
- **Playback never moves the chord info or stick**: those only follow live playing.
- **Learn is a reference, not a generator**: it never writes notes on its own. "Use in song" is explicit and undoable.

## Recipes

- **New setting**: add it to `Settings` and the default in `song.ts`, read it in `readSettings` (with a default), add a test in `song.test.ts`, put the control in `SettingsSheet`.
- **New field on the song or a part**: add the type, a default, and repair logic in `readFullSong` / `readSong`; make sure `applySectionEdit` writes it back to the right place (song-wide vs per section); add round-trip tests (save → read, and an old save without the field).
- **New instrument**: add its id and envelope to `sound.ts` (`InstrumentId`, `SYNTH_ENVELOPES`, and `SAMPLE_ENVELOPES` if sampled), then `INSTRUMENTS` and the synth preset (with `envelope: SYNTH_ENVELOPES.<id>`) or sample bank in `instruments.ts`, level-match it in `VOLUMES` / `SAMPLE_VOLUMES`, run `npm run levels`, credit samples in the README table and the Credits dialog.
- **New Learn content**: add data to `learn.ts` (`PROGRESSIONS`, `COMBOS`, `MELODY_RULES`…); `learn.test.ts` checks that every progression resolves to valid chords and fits, in every key and scale. Keep moods phrased as common associations, not rules.
- **Changing a shape knob's range or the drive**: `levels-page.ts` also has `runAudible(base, instrument)` (each Simple knob at five positions: brightness, crest factor, loudness, attack and tail) and `runDrive(base)` (each drive type's loudness rise, to refit `driveMakeupDb`); call them from a copy of `scripts/levels.ts`. Every position of a knob should change the sound.
- **New keyboard shortcut**: add it to App's keydown handler and to `HelpDialog.tsx`.

## Checking changes

- `npm test` and `npm run build` before every commit; `npm run levels` after any change to instruments, drums or the engine.
- **Browser checks** with Playwright against the built app: `npx http-server dist -p 8124 -s`, then a script using `playwright-core` (Chromium at `/opt/pw-browsers/chromium` in the cloud sandbox, or `CHROMIUM_PATH`). Dismiss the intro first: `click('.intro-key')`, then wait ~2.1 s. To load a song, set `localStorage.setItem('metju.chord.v3', JSON.stringify({ version: 3, song, settings }))` before reload. Multi-touch (stick + pad) works through CDP `Input.dispatchTouchEvent`.
- **What playback plays** can be checked without touching the app: an init script wraps `AudioParam.prototype.setValueAtTime` and records values that are exact note frequencies (Tone's synth `frequency`), turned back into MIDI numbers. Use a synth instrument for this; sampled instruments set `playbackRate` instead.
- **Touch sizes** (phone sizes, `hasTouch: true, isMobile: true`): for every visible `button, select, input, [role=slider], [role=switch]` on every screen and in every open menu or dialog, scroll it into view and walk `document.elementFromPoint` outwards from its centre; it must still be that control (or its `label`) 21.5 px left, right, up and down. Also check `documentElement.scrollWidth <= clientWidth` and that menus and sheets end inside the window.
- **Safe areas**: CDP `Emulation.setSafeAreaInsetsOverride` (e.g. `{ top: 0, right: 47, bottom: 21, left: 47 }` for a landscape iPhone).
- **Audio routing and levels**: offline with `Tone.Offline` in headless Chromium, as `scripts/levels-page.ts` does.
- **PWA**: register under a subpath (e.g. serve `dist/` as `/Metju.Chord/`) as well as at the root, check the cache holds the whole build, reload offline, and check a changed build is picked up.
- **Not verifiable in a sandbox**: sound on real speakers, real-phone feel (touch latency, live-recording timing), and iOS specifics (Add to Home Screen, its offline cache and eviction, wake lock). Say so in the PR.

## Where things stand

Done and shipped: pads and stick, register-aware voicing, Notes mode with ♯/♭, the Play · Song · Parts structure, sections and the chain, fourteen instruments (seven sampled), per-part tone and effects, strum and arp, Paste from Hooktheory, the Learn page, the PWA, copy/paste of chords, melody and drums.

Decided against, or on hold (ask the owner before building):

- **Haptics**: tried and removed. iOS Safari no longer lets web pages trigger the Taptic Engine. A native wrapper (e.g. Capacitor) would be the way back; for now the app stays in the browser.
- **Melody and bass generator**: designed, on hold. Bass would need its own note grid ("Custom" style) first.
- **Per-chord style overrides** (e.g. one chord arpeggiated): not needed for now.
- **Drag-to-reorder chain blocks**: left out (hard to make feel right with touch scrolling on iOS); Move ← / → instead.
- **Count-in and hold/latch**: not wanted.

Open ideas and questions:

- A **chord rhythm** option for chord parts (hold / every 2 beats / every beat / off-beats), so re-striking a chord doesn't need splitting it.
- Whether the sequencer should follow the playing section while the chain plays (now it stays on the open one), and whether Record in Chain mode should be disabled instead of switching to Loop.
- Step recording when the stick moves *after* the pad keeps the pressed pitch (live recording takes the final one).
- Samples have one velocity layer and no round-robins, so fast repeats sound alike. The tonejs-instruments set (CC BY 3.0) has guitar, harp and more if wanted.
- Hooktheory paste was built from one observed clipboard shape plus TheoryTab's JSON fields; other Hookpad variants (meter, tempo, swing changes) are ignored, and the clipboard button on iOS Safari is untested (the paste box is the reliable path).
- **Pocket Operator sync** is untested on a real PO: pulse length (20 ms by default, 5 and 10 to pick from: the PO-33 is reported to miss 5 ms pulses), level (full scale) and polarity were chosen from TE's notes (2 PPQN, sync on the left, at most 5 Vpp); the offset and Flip settings are there to fix it in the field. PO as the clock (the app following its click through the mic or line input) isn't built.
- If iOS evicts the offline cache after weeks unused, samples come back from the network and the synth stand-ins play until then.
