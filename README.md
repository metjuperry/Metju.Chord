# Metju.Chord

An interactive musical chord and scale visualization tool built with React, TypeScript, and Tone.js. Play chords, create sequences, visualize scales, and explore music theory in your browser.

## Features

### 🎹 Interactive Chord Grid

- 12-note chromatic grid with customizable key and octave
- Visual chord display showing chord names and intervals
- Support for major, minor, diminished, and augmented chords
- Chord inversions (up to one fewer than the number of notes in the chord)

### 🎵 Synthesis & Playback

- Multiple synthesizer types:
  - Pad, E-Piano, Organ, Pluck, Lead/Bass
- Two play modes: Chord and Arpeggiator
- Arpeggiator patterns: Up, Down, Up-Down, Random
- Tempo-synced arpeggiator rate (1/4 to 1/32, triplets) and adjustable note length

### 🎚️ Audio Effects

- Reverb with adjustable decay time
- Delay with feedback and delay time controls
- Real-time effect parameter adjustment

### 📊 Scale Visualization

- Visual representation of musical scales on the note grid
- Highlights scale degrees and tonic notes
- Helps understand scale patterns and relationships

### 🎼 Sequencer

- Record and playback chord sequences
- 8+ programmable slots
- Loop playback functionality
- Visual sequence editing

### ⏱️ Metronome

- Adjustable BPM (30-240)
- Visual and audio tempo guide
- Start/stop controls

### 🎨 Customization

- Dark and light theme support
- Adjustable octave range
- Key selection (all 12 keys with major/minor modes)

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
