# Metju.Chord - React TypeScript Application

A pure React TypeScript application built with Webpack (no Create React App, no Vite).

## Prerequisites

- Node.js (version 20.9.0 or higher recommended)
- npm or yarn

## Getting Started

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

## Project Structure

```text
Metju.Chord/
├── src/
│   ├── index.tsx         # Application entry point
│   ├── App.tsx           # Main App component
│   ├── App.css           # App styles
│   └── index.css         # Global styles
├── public/
│   └── index.html        # HTML template
├── webpack.config.js     # Webpack configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```

## Available Scripts

- **`npm start`** - Starts the development server with hot reloading
- **`npm run build`** - Creates an optimized production build

## Tech Stack

- **React 19** - UI library
- **TypeScript 5** - Type safety and better developer experience
- **Webpack 5** - Module bundler
- **ts-loader** - TypeScript loader for Webpack

## Features

- ✅ Pure React and TypeScript setup
- ✅ Webpack configuration from scratch
- ✅ Hot Module Replacement (HMR)
- ✅ TypeScript strict mode enabled
- ✅ CSS support with style-loader and css-loader
- ✅ Development server with auto-reload

## Configuration Files

### `webpack.config.js`

Custom Webpack configuration handling:

- TypeScript compilation with ts-loader
- CSS loading and injection
- Development server with hot reload
- HTML template generation

### `tsconfig.json`

TypeScript compiler options with:

- Strict type checking
- Modern ES2020 target
- React JSX support
- Module resolution for npm packages

## Development Tips

- Edit files in the `src/` directory
- Changes will automatically reload in the browser
- TypeScript will provide type checking in your editor
- Check the console for any build errors or warnings

## License

ISC
