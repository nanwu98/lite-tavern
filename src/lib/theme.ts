import type { ThemeMode } from '../types';
import { syncSystemBarIcons } from './systemBars';

export type ResolvedTheme = 'dark' | 'light';

export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemTheme() : mode;
}

/** Applies the theme to the document and keeps the desktop shell in sync. */
export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f6f1ea' : '#12100f');
  try {
    window.liteTavern?.setTheme?.(resolved);
  } catch {
    // The desktop bridge is optional (web / Android).
  }
  // Android draws behind the bars, so their icons must follow the theme.
  void syncSystemBarIcons();
  return resolved;
}

/** Notifies when the OS switches between light and dark. */
export function onSystemThemeChange(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => undefined;
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => callback();
  query.addEventListener?.('change', handler);
  return () => query.removeEventListener?.('change', handler);
}
