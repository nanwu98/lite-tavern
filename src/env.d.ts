export {};

declare global {
  /** Injected by Vite from package.json. */
  const __APP_VERSION__: string;
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
    };
  }
}
