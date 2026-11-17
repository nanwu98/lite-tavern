import { Capacitor } from '@capacitor/core';

/**
 * Automatic local snapshot.
 *
 * The manual backup (settings → 备份与恢复) is exported by the user. This module
 * keeps a private, unattended copy of the newest non-empty store, so a corrupted
 * or partially-reset IndexedDB does not silently turn into an empty library.
 * It lives next to the app data: `autosave.json` on desktop, the app's data
 * directory on Android, `localStorage` in a browser.
 */

const WEB_KEY = 'lite-tavern-autosave-v1';
const FILE_NAME = 'lite-tavern-autosave.json';

export interface SnapshotInfo {
  available: boolean;
  savedAt?: number;
  characters?: number;
  chats?: number;
}

interface SnapshotBridge {
  writeSnapshot?(json: string): Promise<{ ok: boolean; error?: string }>;
  readSnapshot?(): Promise<string | null>;
  clearSnapshot?(): Promise<{ ok: boolean }>;
  snapshotInfo?(): Promise<SnapshotInfo>;
}

function bridge(): SnapshotBridge | undefined {
  return window.liteTavern as unknown as SnapshotBridge | undefined;
}

/** Removes credentials before a state snapshot is written to disk. */
export function redactSecrets(json: string): string {
  return json.replace(/("apiKey"\s*:\s*")[^"]*(")/g, '$1$2');
}

export async function writeSnapshot(json: string): Promise<void> {
  const safe = redactSecrets(json);
  const native = bridge();
  try {
    if (native?.writeSnapshot) {
      await native.writeSnapshot(safe);
      return;
    }
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      await Filesystem.writeFile({
        path: FILE_NAME,
        data: safe,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return;
    }
    localStorage.setItem(WEB_KEY, safe);
  } catch {
    // Snapshots are best-effort: never break persistence because of one.
  }
}

export async function readSnapshot(): Promise<string | null> {
  const native = bridge();
  try {
    if (native?.readSnapshot) return await native.readSnapshot();
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      const result = await Filesystem.readFile({
        path: FILE_NAME,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return typeof result.data === 'string' ? result.data : null;
    }
    return localStorage.getItem(WEB_KEY);
  } catch {
    return null;
  }
}

export async function clearSnapshot(): Promise<void> {
  const native = bridge();
  try {
    if (native?.clearSnapshot) {
      await native.clearSnapshot();
      return;
    }
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      await Filesystem.deleteFile({ path: FILE_NAME, directory: Directory.Data });
      return;
    }
    localStorage.removeItem(WEB_KEY);
  } catch {
    // Missing file is fine.
  }
}

/** Parses a persisted store and reports whether it holds any user data. */
export function storeHasData(json: string | null | undefined): boolean {
  if (!json) return false;
  // Cheap check: a populated store serializes `"characters":[{…` / `"chats":[{…`.
  if (json.includes('"characters":[') || json.includes('"chats":[')) {
    return !(json.includes('"characters":[]') && json.includes('"chats":[]'));
  }
  return false;
}

const RESTORED_FLAG = 'lite-tavern-autosave-restored';

/** Marks that this session started from the automatic snapshot. */
export function markSnapshotRestored(): void {
  try {
    sessionStorage.setItem(RESTORED_FLAG, '1');
  } catch {
    // Ignore private-mode failures.
  }
}

export function snapshotWasRestored(): boolean {
  try {
    return sessionStorage.getItem(RESTORED_FLAG) === '1';
  } catch {
    return false;
  }
}

export function clearRestoredFlag(): void {
  try {
    sessionStorage.removeItem(RESTORED_FLAG);
  } catch {
    // Ignore.
  }
}
