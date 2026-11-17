import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installRuntime } from './lib/tavern/runtime';
import { loadGlobalScope } from './lib/tavern/variables';
import { installPolyfills } from './lib/tavern/polyfills';
import { applyTheme } from './lib/theme';
import { initSystemBars } from './lib/systemBars';

installPolyfills();
installRuntime();
applyTheme('system');
void initSystemBars();
void loadGlobalScope();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
