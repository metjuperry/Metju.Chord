# Metju.Chord

A chord instrument and song sketchpad in the browser, modelled on pocket chord machines like the HiChord: seven chord pads, an 8-way stick that changes the chord type, and the chord you're playing written on the instrument. Underneath is a sequencer where one chord row drives keys, bass, melody and drums, with per-part sound and effects. Built with React 19, TypeScript and Tone.js, no backend.

Three modes, one rule: **Play** is the instrument; **Song** is *what* plays (chords, melody notes, drum hits, in sections chained into a song); **Parts** is *how* it sounds (instrument, style, tone, effects). **⚙** holds the app settings.

Live at <https://metjuperry.github.io/Metju.Chord/> (deployed from `master`).

- [Features](#features)
- [Getting started](#getting-started)
- [For developers and agents](#for-developers-and-agents): architecture, conventions, how to verify, where things stand

---

## Features

### Pads and stick

- Seven pads play the diatonic chords of the song's key: **1** = I, **2** = ii … **7** = vii°. They sit like piano keys, HiChord style: 1 3 5 7 are long keys along the bottom, 2 4 6 short keys over the gaps.
- Each pad shows the chord it will play with the stick where it is now.
- The stick is a ring of eight wedges around a knob. Centre = triad, ↑ flip 3rd, ↗ dominant 7, → 7th, ↘ 9th, ↓ sus4, ↙ 6 (major) / sus2 (minor), ← diminished, ↖ augmented. Each wedge shows the chord it gives on the current pad.
- Press and slide (thumb-stick), tap a direction to lock it, or hold **Q W E / A D / Z X C** while playing **1–7**. Moving the stick while holding a pad re-voices the held chord.
- All 12 keys in eight scales: major, minor, harmonic and melodic minor, Dorian, Phrygian, Lydian, Mixolydian. Note names use flats in flat keys.
- Inversions (root to 3rd), octave C2–C6, or **voice leading**: each chord takes the inversion that moves least from the last one, and that voicing is what gets recorded.
- **Register-aware voicing**: low chords are spread so they don't turn to mud. Below C4 a triad opens up (C2 E2 G2 plays C2 G2 E3), a 7th or 9th drops its root an octave, a 9th keeps the 9th on top, and close semitones (B–C in a maj7 inversion) are pulled apart. From C4 up chords stay in close position. The bass note, the chord and its name never change.
- **The chord on the instrument** (no LCD screen): above the stick and pads, in the app's own type, the chord just played (large), its numeral and chord type ("i · 7th", plus the inversion when it isn't root position), and its notes stacked from the root as small tags: the root dark, the notes the stick **added** beyond the plain triad (7th, 9th, sus note, flipped 3rd…) yellow, the triad's own notes outlined. Before the first chord it says "Hold a pad · push the stick"; after you let go the last chord stays, a little calmer. While recording, a small REC tag says where the next chord or note goes.
- **What comes next**: next to it, "OFTEN NEXT" and the chords that often follow in this key as small cards (numeral + name), e.g. IV F · V G · vi Am after C in C major, spelled for the key (B♭ in F) and with each scale's own moves (minor VI → VII, Dorian IV, Phrygian ♭II, Mixolydian ♭VII…). It never lights the pads and follows live playing only. Toggle it in ⚙ ("Next chords on the screen", on by default).
- **The play strip** under the chord: octave (C2–C6), inversion (Root/1st/2nd/3rd), the voice-leading switch, and **Pads → ● Keys · Piano ▾**, which says which chord part the pads play through and lets you pick another (also in Parts: "Pads play this part"). The choice is saved with the settings. The Chords / Notes switch sits at the right of the chord row.
- **Notes mode** (switch on the device, **N**, or select a Melody lane in Song): the pads play single scale notes on a Melody part instead of chords; stick up = octave above. The chord info shows the note, its scale degree and the scale with the note marked; the strip's picker becomes **Notes → ● Melody** (which melody part they play and record into) and its octave buttons move that part's range (C3–C5).

### Song: sections and the chain

- A song is made of **sections** (verse, chorus…), each with its own chord row, length, melody notes and drum patterns, and a **chain**, the running order (a repeat is the same section twice in a row). Key, scale, tempo, time signature, the shared effects and the parts' sound are song-wide.
- **The song view** (Song mode's top level): "SONG", a summary ("6 sections · chain of 11 · 36 bars"), **Chain | Loop**, and the Song menu.
  - **Sections** as a scrolling row of tiles: a letter badge and the name, the chords as chips (as many as fit, then "+N"), small bars in the part colours for the parts that play there (muted ones grey), and the length. The open section has a yellow edge. Tap a tile to open it; long-press, right-click or ⋯ for Rename, Duplicate, Add to chain, Delete (undoable). "+ New" adds an empty one-row section.
  - **The chain** as blocks as wide as they are long (24 px a bar, at least 58), each with its start bar and name; every block of the open section has a yellow edge. Tap a block to make its section the open one (while the chain plays, the playhead jumps there); long-press for Move ←, Move →, Duplicate, Remove; "+" appends the open section.
  - **Chain** plays the sections in order (drum patterns start again at each section; notes and held chords stop at its end; per-section mutes apply), looping back to the top when Loop (the sequencer's loop button) is on. While it plays, the playing block is yellow with an orange playhead, played blocks dim, the chain scrolls along, the header says "bar 10 / 36 · Chorus · next Verse", and the tiles show "▶ PLAYING" and "NEXT".
  - **Loop** loops the open section (as before sections). Picking another section while it plays switches at the next bar line; until then it shows NEXT.
  - **Record** works in Loop mode on the open section; pressing it in Chain mode switches to Loop first (on the section playing, or the open one) and says so.
- **Inside a section** (tap a tile): the sequencer as below, with "‹ Song" back to the song view and a section switcher ‹ [V · Verse · 2/6 ▾] › (the list shows each section's length and how often it's in the chain). Each lane's **M** mutes that part in this section only (the lane says "muted in Verse"); mute and solo for the whole song are in Parts. When the section repeats in the chain, the chord toolbar says "×2 in the chain: edits change both". A new section starts at one row and grows a row at a time like the sequencer always did.
- **One chord row per section** holds its chords; the pads record into it (**R**, pick a step, play pads; the cursor moves on). Key and scale belong to the song, so changing them moves every part (undoable).
- **Parts** (up to six, added with **+ Part**) play that chord row, each in its own way, each with instrument, volume, mute and solo:
  - **Chords** (Keys, Pad…): block chords, **strummed** (notes rolled 12, 25, 40 or 60 ms from first to last; down = low note first, up, or alternating down/up with every chord hit), or arpeggiated (up, down, up-down, random; 1/4 to 1/32 with triplets). Strums work the same from the pads and in playback. The pads play through the chord part chosen in the play strip (or in Parts); by default the first.
  - **Bass**: follows the chord roots. Ten styles, each a small tile with a piano roll of its pattern: Hold, Beats, 8ths, Octaves, Off-beat, Root–5th, Arpeggio, 3-3-2, Walk (steps into the next chord) and Follow kick (a note on every kick of the drum parts). Octave C1–C3.
  - **Melody**: a scale-locked grid, two octaves of the key, one column per 1/16, one note at a time, 1/16 to 1/2 long. The chord under each column is shaded (root darker). Or record from the pads in Notes mode: when stopped, each note goes at the cursor; while playing, notes land where you play them, snapped to 1/16.
  - **Drums**: a synthesised 808/909-style kit (kick, snare, clap, closed/open hat, two toms, rim) on a 1/16 grid of 1, 2 or 4 bars that loops under the song, with starter beats per time signature.
- Each part's lane shows a miniature of what it plays; its label carries the part's dot, name and **M** / **S** (mute, solo). Tapping a lane's name opens that part's editor below (the melody grid, the drum grid; a chord or bass lane points to Parts, since it has nothing to write).
- Sequencer: grows a row at a time (SEQ-8, SEQ-16…), one step per beat; held chords show strike dot and sustain; lengthen with the grip or **[ ]**, split **/**, rest **.** (each rest picks which parts it silences; by default chords and bass stop, melody and drums play on), copy/paste, loop. The selected chord's tools (name and steps, Length − n +, Split, Copy, Paste, Rest, Delete, and which parts play through a rest) are **docked at the bottom of the screen**, so they stay in reach however far you've scrolled. Time signatures 2/4–12/8; the click accents the downbeat (and every third beat in compound meters) unless "Accent the downbeat" is off in ⚙.
- The header holds the cursor (⏮ ◀ ▶), loop, undo/redo, the length and time signature, and the **Song menu**. Play/Pause and Record are only in the top bar.
- Playback never touches the chord info or stick: they only follow what you play live.

### Parts: how it sounds

- **Parts mode**: on the left every part as a mixer row (colour dot, name, instrument, **M**, **S**, and a thin volume bar in its colour: drag it, arrow keys, double-tap for 0 dB), **+ Part** at the top and a **Master** row at the bottom. On the right everything about the selected part: its name and kind, "Pads play this part" (chord parts), remove ×, then **Instrument** (a scrolling row of tiles), **Play as / Style** (chord parts: Chord/Strum/Arp with the strum spread and direction or the arp pattern, rate and note length inline; bass: the ten styles and octave; melody: its octave), **Tone** knobs and **Effects**. Drums show the kit and a button to open their beat in Song.
- Fourteen level-matched instruments. **Sampled** (recorded instruments, bundled with the app): Piano, E-Piano, Strings, Organ (pipe), Brass, Marimba, Celesta. **Synths**, where the synth is the point: Pad, Warm Pad, Drawbar, Lead, Bass, Chiptune, Pluck.
- **Tone per part**: Attack, Release, Brightness and Pan knobs, plus **Glide** (it's how notes connect, so it sits with the tone). 12 o'clock is the instrument as designed; Attack runs from snappy (1 ms) to a 2 s swell, Release from a dry stop (20 ms) to 5 s, Brightness darkens with a low-pass to the left and lifts the top with a high shelf to the right. They work the same on synths and samples, and are saved, undoable and in share links.
- Samples load in the background once the app starts (only for instruments a part uses); until they arrive a synth version of the instrument plays, so the first chord never waits.
- **Effects per part**: only the effects that are on show as knobs; **+ Effect** lists the ones that are off, and a double-tap (to 0) takes one away again. **Drive**, **Chorus** and **Tremolo** (a volume wobble in 1/8 notes of the tempo) colour one part (drive is level-compensated); **Glide** makes single notes slide into the next one (up to 0.5 s, never longer than 80% of the note), for bass, melody and arpeggios. Block chords never glide: there's no telling which note should slide where, so glide on a chord part only affects its arpeggios; **→ Reverb** and **→ Delay** send the part into one shared reverb and delay, whose size, time, feedback, return and the output level are under **Master** (with **All dry**, and a **Mix overview**: the old matrix of every part's effects at a glance). Drums get the sends only (no drive, chorus, tremolo or glide). Knobs: drag, scroll, arrow keys, double-tap for off (or, on tone knobs, as designed).

### ⚙ Settings

- A sheet from the right (close with ×, Esc or a tap outside): **Theme** Light / Dark / **Auto** (follows the system), **Click**, **Accent the downbeat**, **Next chords on the screen**, **How to play** (the help) and **Credits** (the sample libraries' licences).
- The intro: tap the start key and a random chord (any key, pad and stick direction) rings out while the app fades in.

### Saving

- Song and settings autosave in the browser; undo/redo every song edit (Ctrl/⌘ Z, Shift+Ctrl/⌘ Z, Ctrl Y).
- Song menu (in the song view and inside a section): new song, open/save a JSON file, copy a share link that carries the whole song in the URL, Paste from Hooktheory (into the open section), Clear all (empties every section; undoable). Undo covers sections and the chain too; which section is open and Chain/Loop are settings.
- **Paste from Hooktheory** (Song menu): select notes and chords in Hookpad / TheoryTab, copy, and paste them into the box (or tap *Paste from clipboard* where the browser allows it). A preview shows what it adds before anything changes, and the whole import is one undo step.
  - Notes become Melody parts (the song's empty Melody part is filled first, then "Melody 2"…). One Hooktheory beat is a quarter note (or a half note with *Half time*), snapped to the 1/16 grid. A melody wider than a Melody part's two octaves is split into parts at different octaves, cut at the longest rest. Overlapping notes keep the highest. Notes outside the scale go to the nearest scale note (the lower one when it's halfway) and are listed.
  - Chords go into the chord row as the nearest chord the pads can play (degree, chord type, inversion): borrowed, applied, suspended and 7th/9th chords are worked out from their notes; add11/add13, ♯9 and the like that the pads can't play are dropped and listed. They start on whole beats and replace the chords in the stretch they cover; the rest of the row stays. Rests become rests.
  - Key: use the paste's key (the song changes key, everything moves with it) or keep the song's key (each note keeps its scale degree; relative keys like A minor in C major keep their pitches). Scales the app doesn't have (Locrian, Phrygian dominant) use the closest one it has.
  - It goes in at the start of the song, or at the selected beat when one is selected.

### On a phone

- **Install it**: in Safari, Share → Add to Home Screen. It then opens full screen as its own app (no browser bars, the notch and home indicator kept clear), works **offline** (everything, samples included, is stored on the phone on first visit), and keeps the screen awake while you play. A new version is picked up the next time it's opened with a connection: straight away if you haven't played yet, otherwise when you next switch away and back, so a jam is never cut off.

One mode at a time, from the top bar (key, scale, tempo, the one Play/Pause and Record, Play · Song · Parts, ⚙): **Play** (the instrument, no scrolling; sideways = stick left, pads right), **Song** (chord row, lanes, editors) and **Parts** (mixer and the selected part's sound).

---

## Getting started

Node 20+.

```bash
npm install
npm start          # dev server with HMR at http://localhost:3000
npm test           # vitest: theory, song format, parts, drums, Hooktheory import
npm run build      # production bundle in dist/
npm run levels     # renders every instrument offline in headless Chromium and checks levels
```

Deployment: every push to `master` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).

---

## For developers and agents

### Map of the code

```text
src/
  index.tsx              entry; registers the service worker
  pwa.ts                 service-worker registration and update reload, screen wake lock
  sw.js                  the service worker (plain JS; webpack fills in the build's file list and version)
  App.tsx                owns all state: song (with undo), live settings, selection, playback, recording; wires everything
  theory.ts              pure music theory: keys, scales, chord building (MIDI), inversions, naming, stick→chord type, voice leading,
                         register-aware spreading, strum timing, the "what comes next" table (NEXT_DEGREES, nextChords)
  progression.ts         the chord row: clips in ticks (PPQ 96) and editing ops (place, setLength, split, fitTo)
  parts.ts               parts (chords, bass, melody, drums), what each plays (partNotes, bassNotes…), melody editing, song length
  drums.ts               drum patterns, presets per time signature, pattern ops
  song.ts                FullSong (sections + chain), Song (one section's view), Settings, time signatures, defaults,
                         reading untrusted saves (readSaved → readFullSong, or readSong + fromSingleSection for v2), share links
  sections.ts            the section projection (sectionView / applySectionEdit), section and chain edits, chain layout
  playback.ts            what plays: sectionEvents (one section), chainEvents (the whole chain), loop lengths
  hooktheory.ts          Paste from Hooktheory: parses the clipboard JSON (untrusted, never throws), maps notes into Melody parts
                         (octave windows, chromatic snapping, monophony) and chords onto pad chords (chordTones → matchChord)
  useHistory.ts          undo/redo with merge keys (one knob turn or slider drag = one step)
  useMedia.ts            matchMedia hook (compact layout switch)
  audio/
    engine.ts            every audio node: per-part channels, shared reverb/delay, master, limiter, transport helpers, intro sound
    instruments.ts       the 14 instruments: synth presets (a voice pool), sample players, matched volumes
    samples.json         which notes each sample set has, and its loop points (written by scripts/samples/prepare.py)
    drumkit.ts           the synthesised drum kit
    sequencer.ts         lookahead scheduler on the Tone Transport (reads the song fresh every 1/16)
  components/
    TopBar               the one header (phones and desktop): key, scale, tempo, Play/Pause, Record, modes, ⚙
    Device               chord info (ChordInfo), play strip (PlayStrip: octave, inversion, voice leading, Pads → picker),
                         scale-key strip (desktop), stick (segmented ring), pads, Chords/Notes switch
    SongView             Song mode's top level: section tiles (ChipLine measures the chord chips), the chain, Chain | Loop
    SectionSwitcher      "‹ Song" and ‹ [section ▾] › in a section's header
    PopMenu              long-press / right-click menus (useLongPress)
    Progression          sequencer: header (section switcher, cursor, loop, undo/redo, length, Song menu), chord lane +
                         part lanes (per-section M), docked chord toolbar
    MelodyEditor, DrumEditor   the selected lane's content editor under the sequencer
    PartsView            Parts mode: part list / mixer (VolumeBar), the selected part (instrument, play-as/style, tone,
                         effects), Master
    FxMatrix, Knob       SpaceControls (shared reverb/delay/out), the effects matrix (Mix overview), the knob control
    SettingsSheet        ⚙ sheet and the Credits dialog; useDialog.ts gives dialogs their focus trap and Esc
    SongMenu, HelpDialog, IntroScreen
    HooktheoryDialog     the Paste from Hooktheory dialog: paste box, options, preview
scripts/levels*.ts       the level-matching check (npm run levels)
scripts/samples/         prepare.py: builds public/samples/ from the original sample libraries
public/samples/          the bundled samples, <instrument>/<midi>.mp3 (copied into dist/ by webpack)
public/icons/, manifest.webmanifest   app icons (scripts/icons.cjs renders them from the favicon design) and the web app manifest
```

### Data model (`song.ts`, `parts.ts`)

- `FullSong = { key, scale, bpm, timeSignature, space, parts: Part[], sections: Section[], chain: { sectionId }[] }` is the song: everything in it is undoable and saved. `Section = { id, name, letter, steps, chords: Clip[], content: { [partId]: { notes?: Note[] } | { drums?: DrumPattern } }, mutes: { [partId]: true } }`. Melody notes and drum patterns live in sections; chord and bass parts need nothing per section (they follow its chords). In a FullSong the parts carry no content (a Melody part's `notes` is `[]`, a Drums part's `drums` an empty pattern).
- **The projection**: `sectionView(fullSong, id)` returns an ordinary single-section `Song = { key, scale, chords, parts (with that section's notes/drums), steps, bpm, timeSignature, space }`, the shape the whole song had before sections. The sequencer, melody and drum editors, recording, `partNotes`, rests and Hooktheory paste all work on it unchanged. App's `editSong(fn)` runs `fn` on the open section's view and `applySectionEdit` writes the result back (chords, length and content into the section; key, tempo, parts' sound song-wide; unchanged parts and sections keep their objects). Whole-song edits (sections, chain, time signature, Clear all) go through `editFull`.
- `Settings` (voiceLeading, octave, inversion, loop, theme `light | dark | auto`, nextHint, padPart = the chord part the pads play through, clickAccent, openSection, playMode `loop | chain`) is saved but not undoable. `readSettings` fills a default for anything missing and ignores fields it doesn't know, so older saves load.
- Time is in **ticks, 96 per quarter note** (`PPQ`). A sequencer step is one beat of the time signature (`ticksPerStep(ts)`: 96 in x/4, 48 in x/8). Melody and drums work in 1/16s (`TICKS_PER_SIXTEENTH` = 24).
- A chord part's style: `playMode` ('Chord' | 'Strum' | 'Arp'), arp settings, and `strumSpread` (s) / `strumDirection`. `strumOffsets(midi, spread, direction, hit)` (theory.ts) gives each note's delay; `chordPartNotes` counts hits along the row so alternating strums don't depend on where playback starts, and the pads keep their own counter.
- A chord clip stores only `{ degree, type, inversion, octave }`; key and scale come from the song, so `resolveClip(harmony, clip)` turns it into notes.
- A rest clip may carry `plays: { [partId]: boolean }`, saying whether each part keeps playing through it; parts not listed use `REST_PLAYS` for their kind (chords and bass stop, melody and drums play on). A chord or bass part that plays through holds the chord before the rest (`chordsFor`); melody notes and drum hits under a silencing rest are dropped (`restSpans`, `silence`, `outsideRests`).
- `Part = ChordPart | BassPart | MelodyPart | DrumPart`, all with `{ id, name, color, volume, mute, solo, fx }`; instrument parts also have `tone = { attack, release, brightness, pan }` (0–1, 0.5 = as designed; `shapeAttack`, `shapeRelease`, `shapeBrightness`, `shapePan` in `parts.ts` turn them into seconds, Hz/dB and pan). Melody notes store a **scale step** (0–14 from the key's root in the part's octave), not a MIDI note, so they follow key and scale changes.
- `fx = { drive, chorus, tremolo, glide, reverb, delay }` (0–1, 0 = off); drums only use reverb/delay. `glideSeconds(v)` = 0.5·v² s; `glides(fx, notes)` says a note event glides only when it's a single note. `space = { reverb: { size, ret }, delay: { time, feedback, ret }, out: { level } }`.
- Saves: `SavedState { version: 3, song: FullSong, settings }` in localStorage key `metju.chord.v3`, JSON files, and `#song=` share links (deflate-raw + base64url). `readSaved` reads version 3 with `readFullSong` and **version 2** with `readSong` + `fromSingleSection`: the old song becomes one section "A" (letter A) holding its chords, notes and drums, and a one-entry chain. If `metju.chord.v3` is empty the app reads the old `metju.chord.v2` key (and leaves it there). Both readers repair anything malformed (clamps, drops overlaps, fills defaults; for v3 also: unknown parts' content and mutes dropped, chain entries naming no section dropped, at least one section, the chain never empty), so new fields must get a default there. No migration from v1 (there were no v1 users).

### Audio (`audio/engine.ts`, `audio/sequencer.ts`)

- Per part: `instrument → tone (low-pass) → shelf → drive → makeup → chorus → tremolo → pan → volume → master`, plus `volume → reverb send / delay send` into one shared `Reverb` and `FeedbackDelay`, whose returns go to `master → limiter (-1 dB) → destination`. Drum channels skip tone, shelf, drive and chorus. Attack and release reach the instrument through `Voice.shape`. Glide is done per note: the engine remembers each strip's last single note and passes `{ from, time }` to `Voice.attack` when the next one starts within 2 s (synths ramp their frequency, samples their playback rate).
- `driveMakeupDb(a)` is fitted to measured loudness; `MASTER_GAIN` (0.8) is the level at `out.level = 1` and leaves headroom for full sends. `npm run levels` must stay green (sustaining RMS spread ≤ 6 dB, triad peaks -10…-3 dBFS, all-effects limiter output ≤ -0.5 dBFS). It measures sampled instruments with their samples (`SAMPLE_VOLUMES`) and again as their stand-in synth (`~synth` rows, `VOLUMES`), so the switch from one to the other doesn't jump in level.
- App keeps the engine in step: `syncParts` on every parts change, `setSpace` on space change, `selectTrack(padPart)` for the pads. Live pads use `engine.attack(midi, time, track)`.
- Playback: `SequencerPlayer` asks `schedule()` for events every 1/16 on the Transport, so edits while playing are heard immediately (App caches the events per song edit). In **Loop** mode `schedule()` is `sectionEvents` of the section being looped: every audible part not muted in it, with `partNotes()` and `expandPattern`; loop length = end of its music rounded up to a bar, capped at its length. In **Chain** mode it's `chainEvents`: each chain slot's section from the slot's start for the section's full length, drum patterns restarting, notes cut at the section end; the loop (or the stop) is at the end of the chain.
- Switching while playing uses `SequencerPlayer.queueJump(at, to, run)`: when playback reaches song tick `at` it calls `run` (which changes what `schedule()` returns: App keeps the mode and looped section in a `transport` ref for this) and carries on from `to`. Loop mode uses it to switch section at the next bar line, Chain mode to jump to a tapped block, and a Chain ↔ Loop change to carry on seamlessly. `position()` is in the current mode's ticks; the draw loop maps a chain tick to its slot and shows the playhead only in the section that's playing.
- The audio context only starts after the intro tap (`startAudio`); nothing audio is mounted before.
- Instruments (`instruments.ts`) all implement `Voice`: `attack(midi[], time, velocity, glide?)`, `release(midi[], time)`, `releaseAll(time)`, plus `output`, `ready` and `dispose`. Synths are a `SynthPool` of monophonic Tone voices handed out by audio time (unlike `Tone.PolySynth`, so notes scheduled ahead never steal a voice that's still sounding). Sampled instruments are a `SamplePlayer` (one `ToneBufferSource` + gain envelope per note, pitched from the nearest recording; sustained sets loop a baked crossfade loop) behind their synth stand-in until `loadBank` has decoded the samples. Velocity is still scaled by 1/sqrt(voices).
- Samples are fetched relative to the page (`samples/<id>/<midi>.mp3`), so they work under the Pages subpath. Webpack's `publicPath` is `''` for the same reason, and everything in `public/` besides `index.html` is copied into `dist/`.

### PWA (`pwa.ts`, `sw.js`, `webpack.config.js`)

- Webpack copies `public/` into `dist/` (`PublicFilesPlugin`), hashes the bundle (`bundle.[contenthash].js`) and writes `sw.js` from `src/sw.js` with the list of every built file and a version hashed from their contents (`ServiceWorkerPlugin`). All URLs are relative, so it works at `/` and under `/Metju.Chord/`.
- The worker precaches the build on install (page, code, icons, manifest must succeed; samples are best-effort and also cached the first time they're fetched), deletes older caches on activate, and serves pages network-first (offline: the cached page) and everything else cache-first. It only registers in production builds.
- Updates: a new deploy = a new `sw.js` = a new worker that takes over at once (`skipWaiting` + `clients.claim`). `registerServiceWorker` reloads the page on `controllerchange` if no pad or stick has been touched yet, otherwise on the next time the page is hidden. It also checks for updates whenever the app comes back to the front.
- Wake lock: `keepScreenOn()` (from the intro tap on) asks for a screen lock on interaction and again on `visibilitychange`; it's a no-op where `navigator.wakeLock` doesn't exist and ignores refusals.
- iOS: `apple-mobile-web-app-capable`, `black-translucent` status bar, `viewport-fit=cover`; the compact layout pads itself with `env(safe-area-inset-*)`. `theme-color` follows the app's theme. Orientation isn't locked (portrait Seq mode still works).

### UI conventions (keep these when changing anything visible)

- **Yellow means "on/active"** (`--accent`/`--cap`): selected options in toggle groups, the pushed stick wedge, a held pad. A locked/selected item gets a yellow *edge*. Parts never use yellow; their colours are `PART_COLORS` and they colour lanes, sliders and effect cells.
- Flat dark tiles with a thin edge (`--panel-2`, `--line`); only the instrument's own keys (pads, knob, intro key) get the keycap lip. No dashed outlines.
- Phones: `compact = (max-width: 1023px), (max-height: 560px)`. Play mode must fit without scrolling (check 844×390, 667×375, 932×430, 390×844), also with safe-area insets (installed: notch 47–59 px on the side, home indicator 21 px landscape / 34 px portrait, status bar 47 px portrait). Landscape is the main phone layout: stick left, pads right.
- Light theme is driven by tokens in `index.css`; check new UI in both (`data-theme="light"` on `<html>`). "Auto" resolves to one of the two from `prefers-color-scheme`, so CSS only ever sees `light` or `dark`. The device body has its own tokens (`--device-*`, `--cap`); the chord info and play strip use them.
- **Song is what plays, Parts is how it sounds**: a control belongs in Song if it changes notes, chords or hits, in Parts if it changes instrument, style, tone, effects or level. Transport (Play/Pause, Record) lives only in the top bar.
- Dialogs (`role="dialog"`, `aria-modal`) use `useDialog` for focus in, Tab trapped, Esc to close (top one first) and focus back.
- Everything has a keyboard path and an aria label; global shortcuts live in App's keydown handler, which ignores inputs, selects and `role="slider"`.

### How changes have been verified

- `npm test` and `npm run build` before every commit; `npm run levels` after any change to instruments, drums or the engine.
- Browser checks with Playwright against the built app: `npx http-server dist -p 8124 -s`, then a script using `playwright-core` with Chromium (`executablePath: '/opt/pw-browsers/chromium'` in the cloud sandbox). The intro must be dismissed first (`click('.intro-key')`, then wait ~2.1 s). A saved song can be injected with `localStorage.setItem('metju.chord.v2', json)` before reload. Multi-touch (stick + pad) was tested through CDP `Input.dispatchTouchEvent`.
- Audio behaviour (routing, levels) was checked offline with `Tone.Offline` in headless Chromium, the same way `scripts/levels-page.ts` does.
- PWA checks in Playwright (Chromium): worker registers under `/Metju.Chord/`, the cache holds the whole build, an offline reload starts the app and plays cached samples, and a changed build is picked up and reloads. Standalone layout was checked by replacing `env(safe-area-inset-*)` with iPhone values.
- Not verifiable in the sandbox: how things sound on real speakers, and real-phone feel (touch latency, live-recording timing); iOS Add to Home Screen, its offline cache and wake lock on a real iPhone (Chromium behaves the same per spec, but iOS has its own storage limits and quirks).

### Samples: sources and licences

All bundled samples are freely licensed; `scripts/samples/prepare.py` rebuilds `public/samples/` from the originals (it maps every file by its measured pitch, since several VSCO files are named an octave off; trims, level-matches, bakes loops for sustained sets; encodes 64 kb/s mono mp3, the safest format for iOS Safari). About 3.6 MB in total, 108 files.

| Instrument | Source | Licence |
| --- | --- | --- |
| Piano | Salamander Grand Piano V3 by Alexander Holm, as published in [Tonejs/audio](https://github.com/Tonejs/audio/tree/master/salamander) (minor thirds, one velocity) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| E-Piano | FluidR3_GM "Electric Piano 1" by Frank Wen, as rendered by [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (major thirds) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/us/) |
| Celesta | FluidR3_GM "Celesta", same source | CC BY 3.0 |
| Strings | [VSCO-2 Community Edition](https://github.com/sgossner/VSCO-2-CE) (Versilian Studios): cello section below B3, violin section above, sustain with vibrato | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Organ | VSCO-2 CE pipe organ (Simon Dalzell / Ivy Audio), quiet manual | CC0 1.0 |
| Brass | VSCO-2 CE French horn (low) and trumpet, sustain | CC0 1.0 |
| Marimba | VSCO-2 CE marimba | CC0 1.0 |

CC BY requires credit: the piano is by Alexander Holm (Salamander Grand Piano), the e-piano and celesta are from Frank Wen's FluidR3 GM soundfont. VSCO-2 CE asks for (but doesn't require) credit to Versilian Studios.

### Working on the repo

- GitHub: `metjuperry/Metju.Chord`, default branch `master`. Work on `claude/<topic>` branches and open PRs; stacked work uses the previous branch as the PR base.
- In the cloud sandbox `gh api` (REST) works; GraphQL commands don't. The clone may be shallow: add `+refs/heads/<branch>:refs/remotes/origin/<branch>` to `remote.origin.fetch` so a new branch tracks its remote.

### Where things stand / ideas not done yet

- **Haptics were tried and removed**: iOS Safari no longer lets web pages trigger the Taptic Engine (the hidden-switch trick was closed in iOS 26.5), and the owner only has iPhones. A native wrapper (e.g. Capacitor) would be the way back.
- **UI overhaul (Play · Song · Parts)**: done as approved: the LCD gave way to chord info on the body, Sound and FX became Parts, transport only in the top bar, part strips gone (instrument and volume in Parts, mute on the lane labels), chord tools docked, Clear all in the Song menu, ⚙ sheet. Still one mode at a time on desktop too (a desktop layout with the instrument always visible is the next step).
- **Sections and the chain**: done. Chain blocks are reordered with Move ← / Move → in their long-press menu; real drag-to-reorder was left out (it's hard to make feel right with touch scrolling on iOS). Open questions for the owner: whether the sequencer should follow the playing section while the chain plays (now it stays on the open one and shows the playhead only there), and whether Record in Chain mode should be disabled instead of switching to Loop.
- **Melody and bass generator** (Generate / Re-roll writing ordinary notes): designed, not built; the owner put it on hold. Bass would need its own note grid ("Custom" style) for that.
- **Per-chord style overrides** (e.g. Keys arpeggiates only one chord): designed, the owner decided it isn't needed for now.
- **Samples**: one velocity layer each, no round-robins, so fast repeated notes sound alike. More layers would mean more megabytes. The tonejs-instruments set (CC BY 3.0) has guitar, harp and other instruments if more are wanted.
- Live recording timing on real phones is untested.
- **Paste from Hooktheory** was built from one observed clipboard shape plus the TheoryTab JSON fields (as read by CMU's pyquist); tests use invented and public-domain tunes. Untested: other Hookpad clipboard variants (meters, tempo and swing changes are ignored), the exact meaning of `applied` beyond V/x and vii°/x, and the clipboard button on iOS Safari (the paste box is the reliable path there).
- **PWA on iOS** is untested on a device: if iOS evicts the cache (it can after weeks without opening the app), samples come back from the network next time, and until then the synth stand-ins play.
