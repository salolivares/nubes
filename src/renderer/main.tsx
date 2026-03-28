import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { config } from 'zod';

import { App } from './App';

// JIT triggers CSP violations. Disable it.
config({ jitless: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
