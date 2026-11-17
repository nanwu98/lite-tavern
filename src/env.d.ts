export {};

declare global {
  /** Injected by Vite from package.json. */
  const __APP_VERSION__: string;
  /** `owner/repo` from package.json `repository`, injected by Vite. */
  const __REPO_SLUG__: string;
  interface Window {
    liteTavern?: {
      isDesktop: boolean;
      platform: string;
      getPathForFile(file: File): string;
      readSiblingWorldBook(
        cardPath: string,
        worldName: string,
      ): Promise<{ name: string; content: string } | null>;
      pickCards(): Promise<string[]>;
      readFile(filePath: string): Promise<{ name: string; mime: string; base64: string } | null>;
      /** Native save dialog for backup files. */
      saveTextFile(
        name: string,
        content: string,
      ): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
      /** Native open dialog that returns the chosen backup file. */
      pickBackup(): Promise<{ name: string; content: string } | null>;
      /** Automatic recovery snapshot (desktop). */
      writeSnapshot(json: string): Promise<{ ok: boolean; error?: string }>;
      readSnapshot(): Promise<string | null>;
      clearSnapshot(): Promise<{ ok: boolean }>;
      getVersion(): Promise<string>;
      /** Version, data directory and whether data lives next to the executable. */
      getAppInfo(): Promise<{
        version: string;
        userData: string;
        portable: boolean;
        packaged: boolean;
      }>;
      /** Opens the folder that holds cards, chats and settings. */
      openDataDir(): Promise<{ ok: boolean; error?: string }>;
      /** Desktop only: register the global shortcut that hides/restores the window. */
      setBossKey(accelerator: string | null): Promise<{ ok: boolean; error?: string }>;
      /** Desktop only: keep native window colours in sync with the app theme. */
      setTheme(theme: 'dark' | 'light'): void;
      /** Compares the running version with the manifest published by the latest release. */
      checkUpdate(): Promise<{
        status: 'available' | 'up-to-date' | 'error';
        current: string;
        latest?: string;
        notes?: string;
        publishedAt?: string;
        asset?: { file: string; size: number; sha256: string };
        error?: string;
      }>;
      /** Downloads and SHA-256 verifies the installer; resolves with the local path. */
      downloadUpdate(): Promise<{ ok: boolean; path?: string; size?: number; error?: string }>;
      /** Replaces the launcher and restarts the app. */
      installUpdate(): Promise<{
        ok: boolean;
        restarted?: boolean;
        manual?: boolean;
        path?: string;
        error?: string;
      }>;
      /** Byte-level download progress for the desktop updater. */
      onUpdateProgress(
        callback: (progress: { received: number; total: number }) => void,
      ): () => void;
    };
  }
}
