const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
  dialog,
  globalShortcut,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;
let bossKeyAccelerator = null;
const approvedPaths = new Set();
let portableDataDir = null;

const THEME_COLORS = { dark: '#0d0b11', light: '#f3ece3' };

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function clearBossKey() {
  if (bossKeyAccelerator) {
    try {
      globalShortcut.unregister(bossKeyAccelerator);
    } catch {
      // Ignore invalid accelerators left over from an older config.
    }
    bossKeyAccelerator = null;
  }
}

function registerBossKey(accelerator) {
  clearBossKey();
  if (!accelerator) return { ok: true };
  const value = String(accelerator).trim();
  if (!value || value.length > 64) return { ok: false, error: '快捷键不能为空' };
  try {
    if (!globalShortcut.register(value, toggleWindow)) {
      return { ok: false, error: '快捷键已被其他程序占用' };
    }
    bossKeyAccelerator = value;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Sandboxed Chromium can fail to start in locked-down Windows environments.
// The app only renders local content and sanitized model output, so we opt out
// to guarantee startup on Win11.
app.commandLine.appendSwitch('no-sandbox');

/**
 * Where the app keeps cards, chats and settings.
 *
 * The single-file Windows build unpacks to `<base>\<version>\LiteTavern.exe`
 * and runs that copy with `LITE_TAVERN_USER_DATA=<base>\UserData`. Launching
 * the unpacked exe directly used to skip that variable, so Chromium fell back
 * to `%APPDATA%\<productName>` and the app looked empty. Detect the portable
 * layout here as well, so both entry points share one profile.
 */
function resolvePortableUserData() {
  if (isDev) return null;
  const exeDir = path.dirname(process.execPath);
  const baseDir = path.dirname(exeDir);
  const versionDir = /^\d+\.\d+\.\d+$/.test(path.basename(exeDir));
  if (!versionDir) return null;
  const marker = path.join(baseDir, '.lite-tavern-portable');
  const sibling = path.join(baseDir, 'UserData');
  const known = path.basename(baseDir).toLowerCase() === 'litetavendata';
  if (!known && !fs.existsSync(marker) && !fs.existsSync(sibling)) return null;
  return sibling;
}

if (process.env.LITE_TAVERN_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.LITE_TAVERN_USER_DATA));
} else {
  portableDataDir = resolvePortableUserData();
  if (portableDataDir) {
    try {
      fs.mkdirSync(portableDataDir, { recursive: true });
      app.setPath('userData', portableDataDir);
    } catch {
      portableDataDir = null;
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: '轻语酒馆',
    backgroundColor: '#0d0b11',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.lite.tavern');
    nativeTheme.themeSource = 'dark';
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  clearBossKey();
});

ipcMain.handle('lite:app-version', () => app.getVersion());

ipcMain.handle('lite:app-info', () => {
  const userData = app.getPath('userData');
  return {
    version: app.getVersion(),
    userData,
    // Portable mode means "data lives next to the launcher", not in %APPDATA%.
    portable: Boolean(portableDataDir) || Boolean(process.env.LITE_TAVERN_USER_DATA),
    packaged: app.isPackaged,
  };
});

ipcMain.handle('lite:open-data-dir', async () => {
  try {
    const userData = app.getPath('userData');
    fs.mkdirSync(userData, { recursive: true });
    const error = await shell.openPath(userData);
    return { ok: !error, error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('lite:set-boss-key', (_event, accelerator) => {
  if (accelerator !== null && typeof accelerator !== 'string') {
    return { ok: false, error: '快捷键格式无效' };
  }
  return registerBossKey(accelerator);
});

ipcMain.on('lite:set-theme', (_event, theme) => {
  const value = theme === 'light' ? 'light' : 'dark';
  nativeTheme.themeSource = value;
  if (mainWindow) mainWindow.setBackgroundColor(THEME_COLORS[value]);
});

ipcMain.handle('lite:pick-cards', async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const result = await dialog.showOpenDialog(win, {
    title: '导入角色卡',
    buttonLabel: '导入',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '角色卡 (PNG / JSON)', extensions: ['png', 'json'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  const paths = result.filePaths.filter((p) => /\.(png|json)$/i.test(p));
  for (const p of paths) approvedPaths.add(path.resolve(p));
  return paths;
});

ipcMain.handle('lite:read-file', async (_event, filePath) => {
  try {
    if (typeof filePath !== 'string') return null;
    const resolved = path.resolve(filePath);
    if (!approvedPaths.has(resolved)) return null;
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile() || stat.size > 30 * 1024 * 1024) return null;
    const data = await fs.promises.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    return {
      name: path.basename(resolved),
      mime: ext === '.png' ? 'image/png' : 'application/json',
      base64: data.toString('base64'),
    };
  } catch {
    return null;
  }
});

ipcMain.handle('lite:read-sibling-world', async (_event, cardPath, worldName) => {
  try {
    if (typeof cardPath !== 'string' || typeof worldName !== 'string') return null;
    const dir = path.dirname(cardPath);
    const target = path.basename(worldName.trim());
    if (!target || target === '.' || target === '..') return null;
    const candidates = [target, `${target}.json`, `${target}.JSON`];
    const files = await fs.promises.readdir(dir);
    const wanted = new Set(candidates.map((name) => name.toLocaleLowerCase()));
    const found = files.find((name) => wanted.has(name.toLocaleLowerCase()));
    if (!found) return null;
    const full = path.join(dir, found);
    const stat = await fs.promises.stat(full);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) return null;
    const content = await fs.promises.readFile(full, 'utf8');
    return { name: path.basename(found, path.extname(found)), content };
  } catch {
    return null;
  }
});

ipcMain.handle('lite:save-text', async (_event, payload) => {
  try {
    if (!payload || typeof payload.name !== 'string' || typeof payload.content !== 'string') {
      return { ok: false, error: '保存参数无效' };
    }
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = await dialog.showSaveDialog(win, {
      title: '保存备份',
      defaultPath: path.join(app.getPath('downloads'), path.basename(payload.name)),
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
      properties: ['createDirectory'],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await fs.promises.writeFile(result.filePath, payload.content, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('lite:pick-backup', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
    const result = await dialog.showOpenDialog(win, {
      title: '导入轻语酒馆备份',
      buttonLabel: '导入',
      properties: ['openFile'],
      filters: [
        { name: '轻语酒馆备份 (JSON)', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size > 200 * 1024 * 1024) return null;
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { name: path.basename(filePath), content };
  } catch {
    return null;
  }
});

/**
 * Automatic local snapshot of the newest store. Written next to the profile so
 * a damaged IndexedDB can still be recovered on the next launch.
 */
function snapshotPath() {
  return path.join(app.getPath('userData'), 'lite-tavern-autosave.json');
}

ipcMain.handle('lite:write-snapshot', async (_event, json) => {
  try {
    if (typeof json !== 'string' || json.length === 0 || json.length > 200 * 1024 * 1024) {
      return { ok: false, error: '快照内容无效' };
    }
    const target = snapshotPath();
    const tmp = `${target}.tmp`;
    await fs.promises.writeFile(tmp, json, 'utf8');
    await fs.promises.rename(tmp, target);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('lite:read-snapshot', async () => {
  try {
    const target = snapshotPath();
    const stat = await fs.promises.stat(target);
    if (!stat.isFile() || stat.size > 200 * 1024 * 1024) return null;
    return await fs.promises.readFile(target, 'utf8');
  } catch {
    return null;
  }
});

ipcMain.handle('lite:clear-snapshot', async () => {
  try {
    await fs.promises.rm(snapshotPath(), { force: true });
    return { ok: true };
  } catch {
    return { ok: false };
  }
});
