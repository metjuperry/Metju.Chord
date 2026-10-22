# Metju.Chord

An interactive musical chord and scale visualization tool built with React, TypeScript, and Tone.js. Play chords, create sequences, visualize scales, and explore music theory in your browser.

## Features

A chord instrument modelled on pocket chord machines like the HiChord: seven chord pads, an 8-way stick that changes the chord type, and a screen that shows what you're playing.

### Pads and stick

- Seven pads play the diatonic chords of the selected major key: **1** = I, **2** = ii … **7** = vii°. They are laid out like the hardware: 2 4 6 above, 1 3 5 7 below.
- Each pad shows the chord it will play with the stick where it is now.
- The stick changes the chord type: centre = triad, ↑ flip 3rd, ↗ dominant 7, → 7th, ↘ 9th, ↓ sus4, ↙ 6 (major) / sus2 (minor), ← diminished, ↖ augmented.
- Click a stick direction to latch it, or hold **Q W E / A D / Z X C** while playing **1–7**. Moving the stick while holding a pad re-voices the held chord.
- All 12 keys in eight scales: major, minor, harmonic and melodic minor, Dorian, Phrygian, Lydian, Mixolydian. Note names use flats in flat keys.
- Inversions (root to 3rd), octave C2–C6, or **voice leading**: each chord takes the inversion that moves least from the last one, and that voicing is what gets recorded.

### Sound

- Thirteen instruments built from Tone.js synths: E-Piano, Pad, Warm Pad, Strings, Organ, Drawbar, Brass, Lead, Bass, Chiptune, Pluck, Mallets, Bells. They are level-matched (`npm run levels`).
- The Sound panel sets the instrument of the selected part. A chord part plays chords held, or arpeggiated (up, down, up-down, random; 1/4 to 1/32 with triplets); the pads play the same way.
- Effects in signal order: distortion → chorus → delay → reverb, then a master limiter.

### Progression

- A step sequencer that grows a row of 8 steps at a time (SEQ-8, SEQ-16, …), one step per beat in 4/4. A chord held across several steps is one block with a strike dot and a sustain bar, and it carries on into the next row when it crosses a row break.
- **One chord row** holds the song's chords. The pads record into it. Key and scale belong to the song, so changing them moves every part with it (and can be undone).
- **Parts** play the chord row, each in its own way, up to six of them, each with its own instrument, volume, mute and solo:
  - **Chords** (Keys, Pad, ...): the chords held as block chords, or arpeggiated. The pads play through the chord part you selected last.
  - **Bass**: follows the chord roots. Ten styles, each shown as a little pattern: Hold, Beats, 8ths, Octaves, Off-beat, Root–5th, Arpeggio, 3-3-2, Walk (steps into the next chord on the last beat) and Follow kick (a note on every kick of the drum parts). Octave C1–C3.
  - **Melody**: notes you write on a scale-locked grid, two octaves of the key, one column per 1/16. The notes of the chord under each column are shaded (the root darker), so you can see where a note will sit before you hear it. One note at a time; new notes are 1/16 to 1/2 long.
  - **Notes mode**: switch the pads from Chords to Notes (or press **N**; selecting a Melody lane does it too) and they play single notes of the key on the Melody part, 1–7 up the scale, with the stick pushed up for the octave above. With Record on, a stopped song writes each note at the cursor (length from the Melody editor) and moves on; a playing song records notes where you play them, snapped to 1/16.
  - **Drums**: a synthesised 808/909-style kit (kick, snare, clap, closed and open hat, two toms, rim) on a 1/16 grid of 1, 2 or 4 bars that loops under the whole song, with starter beats that fit the time signature (Rock, Four on the floor, Half-time, Boom bap, Bossa nova, Disco in 4/4; Waltz in 3/4; a 6/8 groove; a basic beat for any meter). Drums play dry, without the effects.
- Each part's lane shows a miniature of what it plays. Select a lane to edit that part underneath.
- Mute and solo only affect playback, so you can still play live through a muted part.
- Chords are stored in ticks (96 per beat) and played by a lookahead scheduler on the audio clock, so edits made while playing are heard straight away and tempo changes apply immediately.
- Playback doesn't touch the screen or the stick; they only follow what you play live.
- Press **R** (or Record), pick a step, and play pads to write chords into the chord row; the cursor moves on.
- Lengthen with the edge grip or **[ ]**, split with **/**, rest with **.**, copy and paste, add or remove rows, loop.
- Time signatures 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 9/8, 12/8. One step is one beat, BPM counts beats of the signature, rows hold whole bars, and the click accents the downbeat (plus every third beat in 6/8, 9/8, 12/8).
- Metronome click in the top bar, on the same clock as the progression.

### Saving

- The song and settings autosave in your browser.
- Undo/redo every song edit (Ctrl/⌘ Z, Shift Ctrl/⌘ Z or Ctrl Y).
- Song menu: new song, open/save a song file (JSON), and copy a share link that carries the whole song in the URL.

Press the keyboard icon in the app for the full shortcut list.

### On a phone

Small screens (phones, narrow windows) show one mode at a time, switched from the top bar:

- **Play**: the instrument fills the screen with nothing to scroll. Turn the phone sideways for the HiChord layout, stick on the left and pads on the right, so one thumb works the stick while the other plays. The bar has play and record, and the screen shows the step you're recording to.
- **Seq**: the chord row, the parts and their editors.
- **Sound**: the selected part's instrument, chord/arp, effects, inversion and voice leading, click, theme and help.

The stick is a thumb-stick: press and slide toward a direction, and let go to spring back to the centre. A quick tap locks a direction instead.

## Getting Started

### Prerequisites

- Node.js (version 20.9.0 or higher recommended)
- npm or yarn

### Installation

Install dependencies:

```bash
npm install
```

### Development

Start the development server:

```bash
npm start
```

The application will open automatically at `http://localhost:3000`.

### Production Build

Build for production:

```bash
npm run build
```

The production-ready files will be in the `dist/` folder.

## Deployment

This project is configured for automatic deployment to GitHub Pages using GitHub Actions.

### Setup GitHub Pages

1. Go to your repository settings on GitHub
2. Navigate to **Pages** (under Code and automation)
3. Under **Source**, select **GitHub Actions**

### Automatic Deployment

Every push to the `master` branch will automatically:

- Install dependencies
- Build the production bundle
- Deploy to GitHub Pages at `https://metjuperry.github.io/Metju.Chord/`

You can also manually trigger deployment from the **Actions** tab.

### Local Production Build

Build for production locally:

```bash
npm run build
```

## Project Structure

```text
Metju.Chord/
├── src/
│   ├── index.tsx           # Application entry point
│   ├── App.tsx             # Main App component with audio engine
│   ├── App.css             # App styles
│   ├── ChordDisplay.tsx    # Chord name and interval display
│   ├── ChordGrid.tsx       # Interactive note grid
│   ├── NoteButton.tsx      # Individual note button component
│   ├── SettingsPanel.tsx   # Synth and playback settings
│   ├── EffectsPanel.tsx    # Audio effects controls
│   ├── Sequencer.tsx       # Chord sequencer component
│   ├── Metronome.tsx       # Metronome component
│   ├── ScaleVisualizer.tsx # Scale visualization overlay
│   ├── ScalePicker.tsx     # Key and scale selection
│   ├── FeatureMenu.tsx     # Feature toggle menu
│   ├── theory.ts           # Chord voicing (MIDI), naming, arp ordering
│   ├── audio/engine.ts     # Master bus, limiter, effects chain, Transport helpers
│   ├── audio/instruments.ts # Instrument presets
│   └── index.css           # Global styles
├── public/
│   └── index.html          # HTML template
├── webpack.config.js       # Webpack configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies and scripts
```

## Tech Stack

- **React 19** - UI library
- **TypeScript 5** - Type safety and better developer experience
- **Webpack 5** - Module bundler from scratch (no CRA/Vite)
- **Tone.js 15** - Web Audio framework for synthesis and effects
- **ts-loader** - TypeScript compilation

## Usage

1. **Select a Key**: Choose your desired musical key and mode (major/minor)
2. **Play Notes**: Click any note in the grid to play it
3. **Build Chords**: Click multiple notes to create chords
4. **Adjust Settings**:
   - Change synthesizer type
   - Switch between chord and arpeggiator modes
   - Adjust arpeggiator pattern and speed
5. **Add Effects**: Toggle reverb and delay with custom parameters
6. **Visualize Scales**: Enable scale visualization to see note relationships
7. **Record Sequences**: Use the sequencer to record and loop chord progressions
8. **Keep Time**: Enable the metronome for rhythm practice

## Development

This project uses a custom Webpack configuration without any framework scaffolding tools. Key aspects:

- **Hot Module Replacement (HMR)** for instant updates during development
- **TypeScript strict mode** for maximum type safety
- **CSS modules** support with style-loader and css-loader
- **Custom webpack.config.js** handling all build processes

### Development Tips

- Edit files in the `src/` directory - changes reload automatically
- TypeScript provides real-time type checking in your editor
- Check the browser console for audio context warnings (click to start audio)
- Use browser DevTools to inspect Tone.js audio graph

## License

ISC
