import { Capacitor } from '@capacitor/core';

export interface SaveFileResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  /** The file was handed to the system share sheet (Android). */
  shared?: boolean;
  error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Writes `text` to a user-chosen location.
 *
 * - Windows / Electron: native save dialog (`lite:save-text`).
 * - Android: writes into the app cache and opens the system share sheet, so the
 *   file can be saved to Downloads, Drive, WeChat, …
 * - Browser (dev): a regular download.
 */
export async function saveTextFile(fileName: string, text: string): Promise<SaveFileResult> {
  const bridge = window.liteTavern;
  if (bridge?.saveTextFile) {
    try {
      return await bridge.saveTextFile(fileName, text);
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      const written = await Filesystem.writeFile({
        path: fileName,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share({
          title: fileName,
          text: '轻语酒馆备份文件',
          files: [written.uri],
          dialogTitle: '保存或分享备份',
        });
        return { ok: true, shared: true, path: written.uri };
      }
      return { ok: true, path: written.uri };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** Opens a file picker and returns the file text (desktop uses a native dialog). */
export async function pickTextFile(): Promise<{ name: string; content: string } | null> {
  const bridge = window.liteTavern;
  if (bridge?.pickBackup) {
    try {
      return await bridge.pickBackup();
    } catch {
      return null;
    }
  }
  return null;
}
