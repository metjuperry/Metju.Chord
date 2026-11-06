# Metju.Chord

A chord instrument and song sketchpad in the browser, modelled on pocket chord machines like the HiChord: seven chord pads, an 8-way stick that changes the chord type, and the chord you're playing written on the instrument. Underneath is a song editor where one chord row drives keys, bass, melody and drums, in sections chained into a song, with per-part sound and effects. React 19, TypeScript and Tone.js; no backend, installable as an offline app.

**Live at <https://chords.metju.cz>** (deployed from `master`).

Three modes, one rule: **Play** is the instrument; **Song** is *what* plays (chords, melody notes, drum hits, in sections chained into a song); **Parts** is *how* it sounds (instrument, style, tone, effects). **⚙** holds the app settings and **📖 Learn** is a reference for when you're facing a blank song.

- [Features](#features)
- [Getting started](#getting-started)
- [Contributing](#contributing)
- [Samples and licences](#samples-and-licences)

---

## Features

### Pads and stick

- Seven pads play the diatonic chords of the song's key: **1** = I, **2** = ii … **7** = vii°. They sit like piano keys: 1 3 5 7 long along the bottom, 2 4 6 short over the gaps. Each pad shows the chord it will play with the stick where it is now.
- The stick is a ring of eight wedges around a knob. Centre = triad, **↑** flip 3rd, **↗** dominant 7, **→** 7th, **↘** 9th, **↓** sus4, **↙** 6 (major) / sus2 (minor), **←** diminished, **↖** augmented. Each wedge shows the chord it gives on the current pad. Press and slide (thumb-stick), tap a direction to lock it, or hold **Q W E / A D / Z X C** while playing **1–7** (number row or numpad). On a computer **H U J I K O L** play the pads too, laid out like them (H J K L = 1 3 5 7, U I O = 2 4 6), so the left hand holds the stick and the right plays. Moving the stick while holding a pad re-voices the held chord.
- All 12 keys in eight scales: major, minor, harmonic and melodic minor, Dorian, Phrygian, Lydian, Mixolydian. Flat keys are spelled with flats.
- Inversions (root to 3rd), octave C2–C6, or **voice leading** (each chord takes the inversion that moves least from the last one; that voicing is what gets recorded).
- **Register-aware voicing**: below C4 chords are spread so they don't turn to mud (open triads, the root of a 7th or 9th dropped an octave, close semitones pulled apart). The chord and its name never change.
- **The chord on the instrument** (no LCD): the chord just played, large; its numeral and type ("i · 7th", plus the inversion); and its notes as tags, the root dark, the notes the stick **added** yellow. While recording, a REC tag says where the next chord or note goes.
- **Often next**: the chords that often follow in this key, as small cards, with each scale's own moves (minor VI → VII, Dorian IV, Mixolydian ♭VII…). It follows live playing only and never lights the pads. Toggle in ⚙.
- **The play strip**: octave, inversion, voice leading, and **Pads → ● Keys · Piano ▾** (which chord part the pads play through).
- **Notes mode** (switch on the device, **N**, or select a Melody lane): the pads play single scale notes on a Melody part. The stick changes the note: **↑** octave up, **→** sharp, **←** flat, **↗ / ↖** both. So F♯ in A minor is pad 6 with the stick right, no chromatic grid needed.

### Song: sections and the chain

- A song is made of **sections** (verse, chorus…), each with its own chord row, length, melody notes and drum patterns, and a **chain**, the running order. Key, scale, tempo, time signature, effects and the parts' sound are song-wide.
- **The song view**: section tiles (chords as chips, which parts play there, length; tap to open, long-press / right-click / ⋯ for Rename, Duplicate, Add to chain, Delete) and the chain as blocks as wide as they are long (long-press for Move ← / →, Duplicate, Remove).
- **Transport** (top bar): **■ Stop** (**Home**) stops and goes back to the start (of the open section; in Chain mode, of the chain), **▶ / ⏸** plays and pauses (Play carries on from where it paused), **●** records.
- **Chain | Loop**: Chain plays the sections in order, each for as long as its music lasts (rounded up to a bar, the same length Loop mode loops it at, never more than the section's length) with a playhead, "bar 10 / 36 · Chorus · next Verse" and NEXT on the tiles; Loop loops the open section, and picking another while it plays switches at the next bar line. Record works in Loop (in Chain it switches to Loop first).
- **Inside a section**: the sequencer, "‹ Song" back, and a section switcher ‹ [V · Verse · 2/6 ▾] ›. Each lane's **M** mutes that part in this section only. When a section repeats in the chain, the toolbar says "×2 in the chain: edits change both".
- **The chord row**: the pads record into it (**R**, pick a step, play). It grows a row at a time (SEQ-8, SEQ-16…), one step per beat; lengthen with the grip or **[ ]**, split **/**, rest **.** (each rest picks which parts it silences), copy/paste, loop. The selected chord's tools are docked at the bottom of the screen. Time signatures 2/4–12/8.
- **Parts** (up to six, **+ Part**), each with instrument, volume, mute and solo:
  - **Chords**: block chords, **strummed** or arpeggiated (up, down, up-down, random; 1/4 to 1/32 with triplets). As block chords, a chord sounds once and holds for its length.
  - **Strum** plays like a guitarist: a pattern of down and up strokes through each chord, lined up to the bar. **Once** (one stroke, then it rings), **Beats** ↓ ↓ ↓ ↓, **Pop** ↓ · ↓↑ · ↑↓↑, **Ballad** ↓ · · · ↓ · ↓↑, **8ths** ↓↑↓↑↓↑↓↑, **Off-beats** · ↑ · ↑ · ↑ · ↑, each tile showing its strokes. A chord change always gets a down stroke. Down strokes sweep a wider 5-note voicing low to high (the bar's first one a little accented); up strokes are lighter, quicker and catch the top three notes; each stroke damps the one before. Speed Tight / Medium / Loose / Lazy (20–80 ms per stroke). The pads play one stroke per press, down, up or alternating.
  - **Bass**: follows the chord roots in ten styles (Hold, Beats, 8ths, Octaves, Off-beat, Root–5th, Arpeggio, 3-3-2, Walk, Follow kick), each shown as a tiny piano roll. Octave C1–C3.
  - **Melody**: a scale-locked grid, two octaves of the key, 1/16 columns, one note at a time. Each row's letter on the left is its own shade of the part's colour, and every note shows its name (C, F♯…). The chord under each column is shaded. Tap to add, tap to select, tap again to remove. A selected note gets **♭ ♮ ♯** (also **Shift+↑ / Shift+↓**) and stays a scale step, so it follows key changes. Or record from the pads in Notes mode: at the cursor when stopped, where you play them while playing.
  - **Drums**: a synthesised 808/909-style kit (kick, snare, clap, closed/open hat, two toms, rim) on a 1/16 grid of 1, 2 or 4 bars, with starter beats per time signature.
- **Copy and paste melody and drums**: the melody and drum editors have **Copy** and **Paste** next to Clear. Copy a lane, open another section (or another part of the same kind), Paste. A melody keeps its pitches across part octaves, and a shorter section grows to fit. In the melody grid each row's **⋯** has **Copy, Cut, Paste, Clear** for just that row, so moving a phrase from row 3 to row 1 is Cut on row 3, Paste on row 1.
- Playback never moves the chord info or stick: they only follow what you play live.

### Parts: how it sounds

- **Parts mode**: every part as a mixer row (dot, name, instrument, **M**, **S**, volume bar), **+ Part**, and a **Master** row. The selected part shows **Instrument**, **Play as / Style**, **Tone** and **Effects**.
- **Hear what you change**: while the song is stopped, changing a part's sound (instrument, style, tone, effects, volume, or the master's reverb and delay) plays the key's root on that part on every beat, so you hear the change at once: the tonic chord for a chord part (block, strummed or arpeggiated, as set), the root note for bass and melody, kick and snare for drums. It stops two beats after your last change, and stays quiet while the song plays (you hear it in the song). Off in ⚙ → Hear sound changes.
- **Fourteen level-matched instruments.** Sampled (bundled with the app): Piano, E-Piano, Strings, Organ, Brass, Marimba, Celesta. Synths: Pad, Warm Pad, Drawbar, Lead, Bass, Chiptune, Pluck. Samples load in the background; until they arrive a synth version plays, so the first chord never waits.
- **Shape per part**, with the standard synth names, so what you learn here works on any synth: **Attack** and **Release** (how a note comes in and rings out), **Cutoff** and **Resonance** (a 24 dB/octave filter: darker, and a sharper, squelchier peak), **Env Amount** (each note opens or closes the filter, then it settles) and **Drive** (warm saturation). Two small read-only graphs above the knobs draw the envelope and the filter as you turn them, and every knob changes the sound across its whole range. **Reset** puts the part back to its instrument as designed; double-tap a knob to put just that one back. Underneath there's also Decay, Sustain, a filter type, an LFO and Crunch / Bitcrush drive, which an Advanced view will open up.
- **Tone per part**: Pan and Glide.
- **Effects per part**: Chorus, Tremolo (in 1/8 notes of the tempo), and sends to a shared **Reverb** and **Delay** set up under Master (with All dry and a Mix overview). Only the effects that are on show as knobs; **+ Effect** adds one, double-tap removes it. Drums get the sends only.

### 📖 Learn

A reference to read while writing, never a generator. On a phone it opens full screen; on a computer it takes the right column so the instrument stays playable. Everything is shown and played in the song's key and scale, and every **▶** plays once.

- **Progressions**: twelve cards (pop anthem, doo-wop, sad pop, Pachelbel-style, ii–V–I, 12-bar blues, Andalusian, epic minor, royal road, Mixolydian rock, dreamy minor, calm minor loop), each with the chords in your key, the pad and stick that play them, a feel, where you hear it and why it works. **Use in song** writes it into the open section (one undo step); if it needs another scale, it asks whether to switch or use the closest in-scale version.
- **Chords**: what each stick direction and each pad tends to sound like, and worked combinations (Am9 = minor, sad + 9th, air → bittersweet).
- **Melody**: eight short rules, each with a tiny example grid, ▶ and a "try this", plus a note on using ♭ and ♯ sparingly.

### ⚙ Settings

Theme (Light / Dark / Auto), Click, Accent the downbeat, Next chords on the screen, Chord mood in Play mode, **Hear sound changes** (on by default), **Pocket Operator sync**, How to play, and Credits. The intro: tap the start key and a random chord rings out while the app fades in.

### 🔌 Pocket Operator sync

Metju.Chord can be the clock for a Teenage Engineering Pocket Operator (or anything that follows a PO-style audio click).

- Turn on ⚙ → **Pocket Operator sync**. The left channel of the headphone out becomes a clock (2 short pulses per beat) and the app's sound, mixed to mono, plays on the right. A dot on ⚙ reminds you it's on.
- Cable: headphone out (an adapter on iPhones) → the PO's line in. Listen from the PO's output: it plays the app's sound together with its own.
- On the PO, set **SY4** (hold the button below knob B, press BPM until it shows SY4), set its tempo to the one the settings show, and press play on the PO. Then ▶ here starts both, and ■ stops both. Use ■ rather than ⏸ to start again from the top, so the PO's pattern and the song's bars stay lined up.
- **Pulse timing** (±50 ms) moves the clock earlier or later if the PO feels ahead of or behind the chords; **Flip the pulses** is for gear that wants the other polarity.
- Keep the song in 4/4: a PO pattern is 16 steps, one bar. Use a cable: Bluetooth adds too much delay for sync.
- Sync is a setting of this device, not of the song: songs you open or share never turn it on.

### Saving and sharing

- Song and settings autosave in the browser; undo/redo every song edit (Ctrl/⌘ Z, Shift+Ctrl/⌘ Z, Ctrl Y), sections and the chain included.
- Song menu: new song, open / save a JSON file, copy a **share link** that carries the whole song in the URL, **Paste from Hooktheory**, and **Clear all**: after a confirmation, a clean slate (one empty section, the chain reset, only the chord part, no effects on it or the master; key, scale and tempo stay). It's undoable. **New song** goes further and resets key, tempo and parts to the defaults (Keys, Bass, Melody).
- **Paste from Hooktheory**: copy notes and chords in Hookpad / TheoryTab and paste them in. A preview shows what it adds first. Notes become Melody parts (wide melodies split across parts at different octaves; notes off the scale keep their ♯ / ♭), chords become the nearest chord the pads can play, and you choose whether to take the paste's key or keep the song's. It goes in at the start or at the selected beat, as one undo step.

### On a computer and on a phone

- **Computer**: the instrument stays on the left and in view; the right side has **Song | Parts** tabs. Below ~1280 px the pads go under the stick. Everything has a keyboard shortcut (see How to play in ⚙).
- **Phone**: one mode at a time from the top bar. Play mode fits without scrolling (landscape: stick left, pads right). Quick repeated taps never select text.
- **Install it**: in Safari, Share → Add to Home Screen. It opens full screen, works **offline** (samples included) and keeps the screen awake while you play. A new version is picked up the next time it opens with a connection, never in the middle of a jam.

---

## Getting started

Node **22.12+** (Vitest needs it).

```bash
npm install
npm start          # dev server with hot reload at http://localhost:3000
npm test           # unit tests (Vitest)
npm run build      # production bundle in dist/ (also type-checks)
npm run levels     # renders every instrument offline in headless Chromium and checks loudness
```

The start screen shows the version in its corner: `1.<highest merged pull request>.0`, so 1.37.0 has everything up to #37. Every push to `master` runs the tests, builds and publishes to GitHub Pages at chords.metju.cz (`.github/workflows/deploy.yml`). Pull requests run the tests and the build (`.github/workflows/ci.yml`).

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)**: how the code is laid out, the data model, the audio graph, UI conventions, how changes are checked, and what's planned or deliberately left out. Coding agents start there too (`AGENTS.md`, `CLAUDE.md` and `.github/copilot-instructions.md` point to it).

## Samples and licences

All bundled samples are freely licensed. `scripts/samples/prepare.py` rebuilds `public/samples/` from the original libraries (about 3.6 MB, 108 files, 64 kb/s mono mp3).

| Instrument | Source | Licence |
| --- | --- | --- |
| Piano | Salamander Grand Piano V3 by Alexander Holm, as published in [Tonejs/audio](https://github.com/Tonejs/audio/tree/master/salamander) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| E-Piano | FluidR3_GM "Electric Piano 1" by Frank Wen, as rendered by [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/us/) |
| Celesta | FluidR3_GM "Celesta", same source | CC BY 3.0 |
| Strings | [VSCO-2 Community Edition](https://github.com/sgossner/VSCO-2-CE) (Versilian Studios): cello and violin sections | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Organ | VSCO-2 CE pipe organ (Simon Dalzell / Ivy Audio) | CC0 1.0 |
| Brass | VSCO-2 CE French horn and trumpet | CC0 1.0 |
| Marimba | VSCO-2 CE marimba | CC0 1.0 |

CC BY requires credit: the piano is by Alexander Holm (Salamander Grand Piano); the e-piano and celesta are from Frank Wen's FluidR3 GM soundfont. VSCO-2 CE asks for (but doesn't require) credit to Versilian Studios. The same credits are in the app under ⚙ → Credits.
