import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Android edge-to-edge support.
 *
 * The Android shell draws the web view behind the status and navigation bars and
 * makes both transparent, so the app background reaches the screen edges. It
 * reports the measured bar sizes here; the shell then pads its own layout with
 * them instead of letting the system push the whole window down (which is what
 * leaves a black strip above the app).
 *
 * Firefox/Chrome expose the same numbers as `env(safe-area-inset-*)`, but an
 * Android WebView reports zero there unless the page is displayed in a cutout
 * scenario, so the values are passed explicitly.
 */

export interface SystemInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface LiteShellPlugin {
  getInsets(): Promise<SystemInsets>;
  setAppearance(options: { darkIcons: boolean }): Promise<void>;
  addListener(
    eventName: 'insets',
    listener: (insets: SystemInsets) => void,
  ): Promise<PluginListenerHandle>;
}

const ZERO: SystemInsets = { top: 0, bottom: 0, left: 0, right: 0 };
const LiteShell = registerPlugin<LiteShellPlugin>('LiteShell');

let subscription: PluginListenerHandle | null = null;

/** True only inside the Android app (not the desktop shell or a browser). */
export function isEdgeToEdgeShell(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Publishes the insets as `--safe-*` custom properties for the shell to consume.
 * Values are rounded and clamped, so a broken or negative inset can never push
 * the layout off-screen.
 */
export function applyInsets(insets?: SystemInsets | null): void {
  const value: SystemInsets = { ...ZERO, ...(insets ?? {}) };
  const root = document.documentElement;
  const px = (input: number) => {
    const number = Number(input);
    return `${Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0}px`;
  };
  root.style.setProperty('--safe-top', px(value.top));
  root.style.setProperty('--safe-bottom', px(value.bottom));
  root.style.setProperty('--safe-left', px(value.left));
  root.style.setProperty('--safe-right', px(value.right));
}

/** Keeps the status bar icons readable on the current theme. */
export async function syncSystemBarIcons(): Promise<void> {
  if (!isEdgeToEdgeShell()) return;
  const darkIcons = document.documentElement.dataset.theme === 'light';
  try {
    await LiteShell.setAppearance({ darkIcons });
  } catch {
    // The plugin is Android-only and best effort; the app works without it.
  }
}

/**
 * Reads the current insets and follows later changes (rotation, navigation-mode
 * switches). Returns an unsubscribe function; a failure is not fatal — the app
 * then simply keeps zero padding.
 */
export async function initSystemBars(): Promise<() => void> {
  if (!isEdgeToEdgeShell()) return () => undefined;
  try {
    applyInsets(await LiteShell.getInsets());
    subscription = await LiteShell.addListener('insets', applyInsets);
  } catch {
    // Keep the zero insets from the initial CSS.
  }
  await syncSystemBarIcons();
  return () => {
    void subscription?.remove();
    subscription = null;
  };
}
