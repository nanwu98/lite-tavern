/**
 * In-app updater for the portable Windows build.
 *
 * Releases (not the REST API) are the source of truth: `version.json` is
 * published as a release asset next to the installers, and every request goes
 * through `releases/latest/download/...`, which redirects to the newest tag
 * without spending any API quota. GitHub is unreliable from mainland China, so
 * a failed request retries the public mirrors; the download is still verified
 * against the SHA-256 from the manifest, which is what actually protects the
 * user from a mirror that rewrites the binary.
 *
 * The running app is `<home>/<version>/LiteTavern.exe`; the file the user
 * double-clicks is the self-extracting launcher, which tells us where it lives
 * through `LITE_TAVERN_LAUNCHER`. Updating therefore means "replace the
 * launcher next to itself, then restart it": it unpacks the new version into a
 * new folder and the existing `UserData` (cards, chats, settings) is untouched.
 */
const { app } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MANIFEST_TIMEOUT_MS = 10_000;
const STALL_TIMEOUT_MS = 60_000;
const FALLBACK_REPOSITORY = 'nanwu98/lite-tavern';

function repositorySlug() {
  try {
    const pkg = require('../package.json');
    const url = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '');
    const match = /github\.com[/:]([^/]+)\/([^/.]+)/i.exec(url);
    if (match) return `${match[1]}/${match[2]}`;
  } catch {
    // fall through to the default below
  }
  return FALLBACK_REPOSITORY;
}

function manifestSources() {
  const slug = repositorySlug();
  const latest = `https://github.com/${slug}/releases/latest/download/version.json`;
  return [latest, `https://ghfast.top/${latest}`, `https://ghproxy.net/${latest}`];
}

function assetSources(file) {
  const latest = `https://github.com/${repositorySlug()}/releases/latest/download/${encodeURIComponent(file)}`;
  return [latest, `https://ghfast.top/${latest}`, `https://ghproxy.net/${latest}`];
}

/** Numeric comparison; `1.5.0` is newer than `1.5.0-beta.1`. */
function compareVersions(a, b) {
  const parse = (value) => {
    const [core, pre = ''] = String(value).trim().replace(/^v/i, '').split('-', 2);
    const numbers = core.split('.').map((part) => Number.parseInt(part, 10) || 0);
    while (numbers.length < 3) numbers.push(0);
    return { numbers, pre };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] > right.numbers[i] ? 1 : -1;
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre > right.pre ? 1 : -1;
}

function normalizeAsset(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  if (typeof raw.file !== 'string' || !raw.file) return undefined;
  return {
    file: path.basename(raw.file),
    size: Number.isFinite(raw.size) ? raw.size : 0,
    sha256: typeof raw.sha256 === 'string' ? raw.sha256.toLowerCase() : '',
  };
}

function normalizeManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('更新清单格式无效');
  if (typeof raw.version !== 'string' || !/^\d+\.\d+\.\d+/.test(raw.version)) {
    throw new Error('更新清单缺少版本号');
  }
  return {
    version: raw.version,
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 4000) : undefined,
    publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : undefined,
    windows: normalizeAsset(raw.windows),
    android: normalizeAsset(raw.android),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
    cache: 'no-store',
    headers: { accept: 'application/json', 'user-agent': `LiteTavern/${app.getVersion()}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return normalizeManifest(await response.json());
}

/**
 * Compares the running version with the manifest. Never throws.
 *
 * Sources are tried in order, skipping a mirror whose cached manifest has no
 * Windows installer (a mirror that cached `version.json` before the installer
 * was re-uploaded would otherwise offer a download with nothing behind it).
 */
async function checkForUpdates() {
  const current = app.getVersion();
  const errors = [];
  let fallback = null;
  for (const url of manifestSources()) {
    let manifest;
    try {
      manifest = await fetchJson(url);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (compareVersions(manifest.version, current) <= 0) {
      return { status: 'up-to-date', current, latest: manifest.version };
    }
    if (manifest.windows?.file) {
      return {
        status: 'available',
        current,
        latest: manifest.version,
        notes: manifest.notes,
        publishedAt: manifest.publishedAt,
        asset: manifest.windows,
      };
    }
    fallback ??= {
      status: 'available',
      current,
      latest: manifest.version,
      notes: manifest.notes,
      publishedAt: manifest.publishedAt,
    };
  }
  if (fallback) return fallback;
  return { status: 'error', current, error: errors[0] || '无法连接更新服务器' };
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadTo(url, destination, expectedSize, onProgress) {
  const controller = new AbortController();
  let stallTimer = setTimeout(
    () => controller.abort(new Error('下载超时，已停止')),
    STALL_TIMEOUT_MS,
  );
  const response = await fetch(url, {
    signal: controller.signal,
    redirect: 'follow',
    headers: { 'user-agent': `LiteTavern/${app.getVersion()}` },
  });
  if (!response.ok || !response.body) {
    clearTimeout(stallTimer);
    throw new Error(`HTTP ${response.status}`);
  }
  const total = Number(response.headers.get('content-length') ?? 0) || expectedSize || 0;
  let received = 0;
  let lastReport = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      clearTimeout(stallTimer);
      stallTimer = setTimeout(
        () => controller.abort(new Error('下载超时，已停止')),
        STALL_TIMEOUT_MS,
      );
      const now = Date.now();
      if (now - lastReport > 200) {
        lastReport = now;
        onProgress?.({ received, total });
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(destination));
  } finally {
    clearTimeout(stallTimer);
  }
  onProgress?.({ received, total: total || received });
  return { received, total: total || received };
}

/**
 * Downloads the installer described by `asset`, trying mirrors in order, and
 * verifies the SHA-256 before returning the path of the finished file.
 */
async function downloadUpdate(asset, onProgress) {
  if (!asset) throw new Error('这个版本没有提供 Windows 安装包');
  const directory = path.join(app.getPath('userData'), 'updates');
  await fs.promises.mkdir(directory, { recursive: true });
  const target = path.join(directory, asset.file);
  const partial = `${target}.part`;
  const errors = [];
  for (const url of assetSources(asset.file)) {
    try {
      await downloadTo(url, partial, asset.size, onProgress);
      if (asset.sha256) {
        const digest = await sha256File(partial);
        if (digest !== asset.sha256) throw new Error('SHA-256 校验失败，已丢弃下载');
      }
      await fs.promises.rm(target, { force: true });
      await fs.promises.rename(partial, target);
      const stat = await fs.promises.stat(target);
      return { path: target, size: stat.size };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      await fs.promises.rm(partial, { force: true });
    }
  }
  throw new Error(errors[0] || '下载失败');
}

/** Runs the new launcher once this process has exited. */
function scheduleRestart(target) {
  const script = path.join(app.getPath('temp'), `litetavtavern-restart-${Date.now()}.cmd`);
  const content = [
    '@echo off',
    'timeout /t 2 /nobreak >nul',
    `start "" "${target}"`,
    'del "%~f0"',
    '',
  ].join('\r\n');
  fs.writeFileSync(script, content, 'utf8');
  spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

/**
 * Swaps the launcher in place and restarts it.
 *
 * The launcher spawned us and already exited, so the file is not locked. When
 * the app was started from the unpacked directory there is no launcher to
 * replace: the new installer is dropped next to the data folder instead and the
 * caller shows the user where it went.
 */
function installUpdate(downloadedPath) {
  if (process.platform !== 'win32') {
    return { ok: false, error: '当前平台暂不支持自动更新，请到 Releases 页面下载' };
  }
  if (!downloadedPath || !fs.existsSync(downloadedPath)) {
    return { ok: false, error: '安装包不存在，请重新下载' };
  }
  const launcher = process.env.LITE_TAVERN_LAUNCHER;
  const home = process.env.LITE_TAVERN_HOME || path.dirname(app.getPath('userData'));
  const launcherPath = launcher && fs.existsSync(launcher) ? launcher : '';

  try {
    if (launcherPath) {
      const backup = `${launcherPath}.old`;
      fs.rmSync(backup, { force: true });
      fs.renameSync(launcherPath, backup);
      try {
        fs.copyFileSync(downloadedPath, launcherPath);
      } catch (error) {
        fs.renameSync(backup, launcherPath);
        throw error;
      }
      scheduleRestart(launcherPath);
      return { ok: true, restarted: true, path: launcherPath };
    }

    const fallback = path.join(home, path.basename(downloadedPath));
    fs.copyFileSync(downloadedPath, fallback);
    return { ok: true, manual: true, path: fallback };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `无法替换启动器（${message}）。新版本已下载到 ${downloadedPath}，退出后手动运行它即可。`,
      path: downloadedPath,
    };
  }
}

module.exports = {
  assetSources,
  checkForUpdates,
  compareVersions,
  downloadUpdate,
  installUpdate,
  manifestSources,
  repositorySlug,
};
