# Metju.Chord

A chord instrument and song sketchpad in the browser, modelled on pocket chord machines like the HiChord: seven chord pads, an 8-way stick that changes the chord type, and a screen that shows what you're playing. Underneath is a sequencer where one chord row drives keys, bass, melody and drums, with per-part effects. Built with React 19, TypeScript and Tone.js, no backend.

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
- **Notes mode** (switch on the device, **N**, or select a Melody lane): the pads play single scale notes on the Melody part instead of chords; stick up = octave above.

### Song: one chord row, played by parts

- **One chord row** holds the song's chords; the pads record into it (**R**, pick a step, play pads; the cursor moves on). Key and scale belong to the song, so changing them moves every part (undoable).
- **Parts** (up to six, added with **+ Part**) play that chord row, each in its own way, each with instrument, volume, mute and solo:
  - **Chords** (Keys, Pad…): block chords, or arpeggiated (up, down, up-down, random; 1/4 to 1/32 with triplets). The pads play through the chord part selected last.
  - **Bass**: follows the chord roots. Ten styles shown as pattern cards: Hold, Beats, 8ths, Octaves, Off-beat, Root–5th, Arpeggio, 3-3-2, Walk (steps into the next chord) and Follow kick (a note on every kick of the drum parts). Octave C1–C3.
  - **Melody**: a scale-locked grid, two octaves of the key, one column per 1/16, one note at a time, 1/16 to 1/2 long. The chord under each column is shaded (root darker). Or record from the pads in Notes mode: when stopped, each note goes at the cursor; while playing, notes land where you play them, snapped to 1/16.
  - **Drums**: a synthesised 808/909-style kit (kick, snare, clap, closed/open hat, two toms, rim) on a 1/16 grid of 1, 2 or 4 bars that loops under the song, with starter beats per time signature.
- Each part's lane shows a miniature of what it plays; selecting a lane opens that part's editor below.
- Sequencer: grows a row at a time (SEQ-8, SEQ-16…), one step per beat; held chords show strike dot and sustain; lengthen with the grip or **[ ]**, split **/**, rest **.** (each rest picks which parts it silences; by default chords and bass stop, melody and drums play on), copy/paste, loop. Time signatures 2/4–12/8; the click accents the downbeat (and every third beat in compound meters).
- Playback never touches the screen or stick: they only follow what you play live.

### Sound and effects

- Fourteen level-matched instruments. **Sampled** (recorded instruments, bundled with the app): Piano, E-Piano, Strings, Organ (pipe), Brass, Marimba, Celesta. **Synths**, where the synth is the point: Pad, Warm Pad, Drawbar, Lead, Bass, Chiptune, Pluck.
- **Tone per part** (Sound panel, for the selected part): Attack, Release, Brightness and Pan knobs. 12 o'clock is the instrument as designed; Attack runs from snappy (1 ms) to a 2 s swell, Release from a dry stop (20 ms) to 5 s, Brightness darkens with a low-pass to the left and lifts the top with a high shelf to the right. They work the same on synths and samples, and are saved, undoable and in share links.
- Samples load in the background once the app starts (only for instruments a part uses); until they arrive a synth version of the instrument plays, so the first chord never waits.
- **Effects per part**, in a matrix under the sequencer (FX mode on phones): **Drive** and **Chorus** colour one part (drive is level-compensated); **→ Reverb** and **→ Delay** send the part into one shared reverb and delay, whose size, time, feedback, return and the output level sit underneath. Drums get the sends only. Knobs: drag, scroll, arrow keys, double-tap for off.
- The intro: tap the start key and a random chord (any key, pad and stick direction) rings out while the app fades in.

### Saving

- Song and settings autosave in the browser; undo/redo every song edit (Ctrl/⌘ Z, Shift+Ctrl/⌘ Z, Ctrl Y).
- Song menu: new song, open/save a JSON file, copy a share link that carries the whole song in the URL.

### On a phone

One mode at a time, from the top bar: **Play** (the instrument, no scrolling; sideways = stick left, pads right), **Seq** (chord row, parts, editors), **Sound** (instrument, chord/arp, voicing, click, theme, help) and **FX** (the effects matrix).

---

## Getting started

Node 20+.

```bash
npm install
npm start          # dev server with HMR at http://localhost:3000
npm test           # vitest: theory, song format, parts, drums
npm run build      # production bundle in dist/
npm run levels     # renders every instrument offline in headless Chromium and checks levels
```

Deployment: every push to `master` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).

---

## For developers and agents

### Map of the code

```text
src/
  index.tsx              entry
  App.tsx                owns all state: song (with undo), live settings, selection, playback, recording; wires everything
  theory.ts              pure music theory: keys, scales, chord building (MIDI), inversions, naming, stick→chord type, voice leading
  progression.ts         the chord row: clips in ticks (PPQ 96) and editing ops (place, setLength, split, fitTo)
  parts.ts               parts (chords, bass, melody, drums), what each plays (partNotes, bassNotes…), melody editing, song length
  drums.ts               drum patterns, presets per time signature, pattern ops
  song.ts                Song/Settings types, time signatures, defaults, reading untrusted saves (readSong), share-link encoding
  useHistory.ts          undo/redo with merge keys (one knob turn or slider drag = one step)
  useMedia.ts            matchMedia hook (compact layout switch)
  audio/
    engine.ts            every audio node: per-part channels, shared reverb/delay, master, limiter, transport helpers, intro sound
    instruments.ts       the 14 instruments: synth presets (a voice pool), sample players, matched volumes
    samples.json         which notes each sample set has, and its loop points (written by scripts/samples/prepare.py)
    drumkit.ts           the synthesised drum kit
    sequencer.ts         lookahead scheduler on the Tone Transport (reads the song fresh every 1/16)
  components/
    TopBar, CompactBar   desktop header / phone bar with modes (Play, Seq, Sound, FX)
    Device               screen, scale-key strip, stick (segmented ring), pads, Chords/Notes switch, voicing
    Progression          sequencer: transport, part strips, chord lane + part lanes, chord toolbar, + Part menu
    PartEditors          chord part style, bass style cards; MelodyEditor; DrumEditor
    SoundPanel           instrument grid + chord/arp style for the selected part
    FxMatrix, Knob       effects matrix and the knob control
    SongMenu, HelpDialog, IntroScreen
scripts/levels*.ts       the level-matching check (npm run levels)
scripts/samples/         prepare.py: builds public/samples/ from the original sample libraries
public/samples/          the bundled samples, <instrument>/<midi>.mp3 (copied into dist/ by webpack)
```

### Data model (`song.ts`, `parts.ts`)

- `Song = { key, scale, chords: Clip[], parts: Part[], steps, bpm, timeSignature, space }`. Everything in `Song` is undoable and saved; `Settings` (voiceLeading, octave, inversion, loop, theme) is saved but not undoable.
- Time is in **ticks, 96 per quarter note** (`PPQ`). A sequencer step is one beat of the time signature (`ticksPerStep(ts)`: 96 in x/4, 48 in x/8). Melody and drums work in 1/16s (`TICKS_PER_SIXTEENTH` = 24).
- A chord clip stores only `{ degree, type, inversion, octave }`; key and scale come from the song, so `resolveClip(harmony, clip)` turns it into notes.
- A rest clip may carry `plays: { [partId]: boolean }`, saying whether each part keeps playing through it; parts not listed use `REST_PLAYS` for their kind (chords and bass stop, melody and drums play on). A chord or bass part that plays through holds the chord before the rest (`chordsFor`); melody notes and drum hits under a silencing rest are dropped (`restSpans`, `silence`, `outsideRests`).
- `Part = ChordPart | BassPart | MelodyPart | DrumPart`, all with `{ id, name, color, volume, mute, solo, fx }`; instrument parts also have `tone = { attack, release, brightness, pan }` (0–1, 0.5 = as designed; `shapeAttack`, `shapeRelease`, `shapeBrightness`, `shapePan` in `parts.ts` turn them into seconds, Hz/dB and pan). Melody notes store a **scale step** (0–14 from the key's root in the part's octave), not a MIDI note, so they follow key and scale changes.
- `fx = { drive, chorus, reverb, delay }` (0–1, 0 = off); drums only use reverb/delay. `space = { reverb: { size, ret }, delay: { time, feedback, ret }, out: { level } }`.
- Saves: `SavedState { version: 2, song, settings }` in localStorage key `metju.chord.v2`, JSON files, and `#song=` share links (deflate-raw + base64url). `readSong` repairs anything malformed (clamps, drops overlaps, fills defaults) so new fields must get a default there. No migration from v1 (there were no v1 users).

### Audio (`audio/engine.ts`, `audio/sequencer.ts`)

- Per part: `instrument → tone (low-pass) → shelf → drive → makeup → chorus → pan → volume → master`, plus `volume → reverb send / delay send` into one shared `Reverb` and `FeedbackDelay`, whose returns go to `master → limiter (-1 dB) → destination`. Drum channels skip tone, shelf, drive and chorus. Attack and release reach the instrument through `Voice.shape`.
- `driveMakeupDb(a)` is fitted to measured loudness; `MASTER_GAIN` (0.8) is the level at `out.level = 1` and leaves headroom for full sends. `npm run levels` must stay green (sustaining RMS spread ≤ 6 dB, triad peaks -10…-3 dBFS, all-effects limiter output ≤ -0.5 dBFS). It measures sampled instruments with their samples (`SAMPLE_VOLUMES`) and again as their stand-in synth (`~synth` rows, `VOLUMES`), so the switch from one to the other doesn't jump in level.
- App keeps the engine in step: `syncParts` on every parts change, `setSpace` on space change, `selectTrack(padPart)` for the pads. Live pads use `engine.attack(midi, time, track)`.
- Playback: `SequencerPlayer` asks `schedule()` for events every 1/16 on the Transport, so edits while playing are heard immediately. `schedule()` expands every audible part with `partNotes()` (and drum patterns with `expandPattern`). Loop length = end of the music rounded up to a bar, capped at the sequencer length.
- The audio context only starts after the intro tap (`startAudio`); nothing audio is mounted before.
- Instruments (`instruments.ts`) all implement `Voice`: `attack(midi[], time, velocity, glide?)`, `release(midi[], time)`, `releaseAll(time)`, plus `output`, `ready` and `dispose`. Synths are a `SynthPool` of monophonic Tone voices handed out by audio time (unlike `Tone.PolySynth`, so notes scheduled ahead never steal a voice that's still sounding). Sampled instruments are a `SamplePlayer` (one `ToneBufferSource` + gain envelope per note, pitched from the nearest recording; sustained sets loop a baked crossfade loop) behind their synth stand-in until `loadBank` has decoded the samples. Velocity is still scaled by 1/sqrt(voices).
- Samples are fetched relative to the page (`samples/<id>/<midi>.mp3`), so they work under the Pages subpath. Webpack's `publicPath` is `''` for the same reason, and everything in `public/` besides `index.html` is copied into `dist/`.

### UI conventions (keep these when changing anything visible)

- **Yellow means "on/active"** (`--accent`/`--cap`): selected options in toggle groups, the pushed stick wedge, a held pad. A locked/selected item gets a yellow *edge*. Parts never use yellow; their colours are `PART_COLORS` and they colour lanes, sliders and effect cells.
- Flat dark tiles with a thin edge (`--panel-2`, `--line`); only the instrument's own keys (pads, knob, intro key) get the keycap lip. No dashed outlines.
- Phones: `compact = (max-width: 1023px), (max-height: 560px)`. Play mode must fit without scrolling (check 844×390, 667×375, 932×430, 390×844). Landscape is the main phone layout: stick left, pads right.
- Light theme is driven by tokens in `index.css`; check new UI in both (`data-theme="light"` on `<html>`).
- Everything has a keyboard path and an aria label; global shortcuts live in App's keydown handler, which ignores inputs, selects and `role="slider"`.

### How changes have been verified

- `npm test` and `npm run build` before every commit; `npm run levels` after any change to instruments, drums or the engine.
- Browser checks with Playwright against the built app: `npx http-server dist -p 8124 -s`, then a script using `playwright-core` with Chromium (`executablePath: '/opt/pw-browsers/chromium'` in the cloud sandbox). The intro must be dismissed first (`click('.intro-key')`, then wait ~2.1 s). A saved song can be injected with `localStorage.setItem('metju.chord.v2', json)` before reload. Multi-touch (stick + pad) was tested through CDP `Input.dispatchTouchEvent`.
- Audio behaviour (routing, levels) was checked offline with `Tone.Offline` in headless Chromium, the same way `scripts/levels-page.ts` does.
- Not verifiable in the sandbox: how things sound on real speakers, and real-phone feel (touch latency, live-recording timing).

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
- **Sequencer declutter**, mocked up but on hold: transport down to Play/Loop/Record; one "4 bars · 4/4 ▾" button plus a "+ row" strip; part strips as name + M/S only with instrument/volume/remove moved into the part editor; chord tools as a small bar on the selected chord; "Clear all" into the Song menu. Header sections (dividers) and the single + Part menu are done.
- **Melody and bass generator** (Generate / Re-roll writing ordinary notes): designed, not built; the owner put it on hold. Bass would need its own note grid ("Custom" style) for that.
- **Per-chord style overrides** (e.g. Keys arpeggiates only one chord): designed, the owner decided it isn't needed for now.
- **Samples**: one velocity layer each, no round-robins, so fast repeated notes sound alike. More layers would mean more megabytes. The tonejs-instruments set (CC BY 3.0) has guitar, harp and other instruments if more are wanted.
- Desktop header shows section dividers only at ≥1360px; narrower windows wrap without them.
- Live recording timing on real phones is untested.
