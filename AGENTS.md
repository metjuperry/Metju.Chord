# Agent instructions

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** first: it has the code map, data model, audio graph, UI conventions, recipes and how to check changes. The [README](README.md) describes what the app does for its users.

The essentials:

- React 19 + TypeScript + Tone.js, plain Webpack 5. Node 22.12+.
- `npm test`, `npm run lint` and `npm run build` before every commit; `npm run levels` after touching instruments, drums or the audio engine; `npm run e2e` (needs a build) before a PR that touches the UI. CI runs all of them.
- Branch per topic, PR into `master` (never stacked on another PR's branch). `master` deploys to GitHub Pages at chords.metju.cz.
- Song is *what* plays, Parts is *how* it sounds; transport only in the top bar; yellow means active; short button labels.
- Saves and share links are untrusted input: every new field needs a default in the readers in `song.ts`, and old saves must keep loading.
- When behaviour changes, update the README feature list, `HelpDialog.tsx` where it covers the feature, and CONTRIBUTING.md for architecture or convention changes.
