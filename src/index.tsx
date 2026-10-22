import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { registerServiceWorker } from './pwa';

// a new deploy may reload the page at once, but only until a pad or the stick has been touched (see pwa.ts)
let played = false;
window.addEventListener('pointerdown', e => {
    if ((e.target as Element | null)?.closest?.('.pad, .stick')) played = true;
}, { capture: true, passive: true });
window.addEventListener('keydown', () => (played = true), { capture: true, passive: true });
registerServiceWorker(() => !played);

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
