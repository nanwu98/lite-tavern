const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('liteTavern', {
  isDesktop: true,
  platform: process.platform,
  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  readSiblingWorldBook(cardPath, worldName) {
    return ipcRenderer.invoke('lite:read-sibling-world', cardPath, worldName);
  },
  pickCards() {
    return ipcRenderer.invoke('lite:pick-cards');
  },
  readFile(filePath) {
    return ipcRenderer.invoke('lite:read-file', filePath);
  },
  /** Native save dialog for backup files. */
  saveTextFile(name, content) {
    return ipcRenderer.invoke('lite:save-text', { name, content });
  },
  /** Native open dialog that returns the chosen backup file. */
  pickBackup() {
    return ipcRenderer.invoke('lite:pick-backup');
  },
  /** Automatic recovery snapshot (desktop). */
  writeSnapshot(json) {
    return ipcRenderer.invoke('lite:write-snapshot', json);
  },
  readSnapshot() {
    return ipcRenderer.invoke('lite:read-snapshot');
  },
  clearSnapshot() {
    return ipcRenderer.invoke('lite:clear-snapshot');
  },
  getVersion() {
    return ipcRenderer.invoke('lite:app-version');
  },
  /** Version, data directory and whether data lives next to the executable. */
  getAppInfo() {
    return ipcRenderer.invoke('lite:app-info');
  },
  /** Opens the folder that holds cards, chats and settings. */
  openDataDir() {
    return ipcRenderer.invoke('lite:open-data-dir');
  },
  /** Pass null to disable the boss key. */
  setBossKey(accelerator) {
    return ipcRenderer.invoke('lite:set-boss-key', accelerator);
  },
  /** Keep the native window chrome in sync with the app theme. */
  setTheme(theme) {
    ipcRenderer.send('lite:set-theme', theme === 'light' ? 'light' : 'dark');
  },
});
