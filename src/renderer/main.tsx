import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { config } from 'zod';

import { App } from './App';
import { updateDocumentTheme } from './components/theme-provider';

// JIT triggers CSP violations. Disable it.
config({ jitless: true });

// Main restores the saved theme before the window opens, and prefers-color-scheme follows it. Set
// the class before the first render so a dark launch never paints the light background.
updateDocumentTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
