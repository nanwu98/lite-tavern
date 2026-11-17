import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Update support.
 *
 * Releases are the only source of truth: every GitHub release carries a small
 * `version.json` next to the installers, so "check for updates" is one request
 * and costs no API quota (unauthenticated `api.github.com` allows 60 requests
 * per hour per IP, which a shared network would burn through quickly).
 *
 * Requests go through `releases/latest/download/...`, which answers with a 302
 * to the newest release. GitHub itself is unreliable from mainland China, so a
 * failing request falls back to the public mirrors before giving up. The
 * mirror is only trusted for transport: the downloaded file must still match
 * the SHA-256 published in the manifest, which also protects against a mirror
 * that rewrites the binary.
 */

export interface UpdateAsset {
  file: string;
  size: number;
  sha256: string;
}

export interface UpdateManifest {
  version: string;
  notes?: string;
  publishedAt?: string;
  releaseUrl?: string;
  windows?: UpdateAsset;
  android?: UpdateAsset;
}

export interface UpdateCheck {
  status: 'available' | 'up-to-date' | 'error';
  current: string;
  latest?: string;
  notes?: string;
  publishedAt?: string;
  asset?: UpdateAsset;
  error?: string;
}

const FALLBACK_REPOSITORY = 'nanwu98/lite-tavern';
const MANIFEST_TIMEOUT_MS = 8000;
const MAX_NOTES_LENGTH = 4000;

/** `owner/repo`, derived from package.json at build time. */
export function repositorySlug(): string {
  const slug = typeof __REPO_SLUG__ === 'string' ? __REPO_SLUG__ : '';
  return slug || FALLBACK_REPOSITORY;
}

export function releasePageUrl(slug = repositorySlug()): string {
  return `https://github.com/${slug}/releases/latest`;
}

/** Manifest candidates, most direct first. */
export function manifestSources(slug = repositorySlug()): string[] {
  const latest = `https://github.com/${slug}/releases/latest/download/version.json`;
  return [latest, `https://ghfast.top/${latest}`, `https://ghproxy.net/${latest}`];
}

/** Installer candidates for a file published by the latest release. */
export function assetSources(file: string, slug = repositorySlug()): string[] {
  const latest = `https://github.com/${slug}/releases/latest/download/${encodeURIComponent(file)}`;
  return [latest, `https://ghfast.top/${latest}`, `https://ghproxy.net/${latest}`];
}

/** Numeric SemVer comparison; pre-release looks newer than nothing but older than its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
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

function normalizeManifest(raw: unknown): UpdateManifest {
  if (!raw || typeof raw !== 'object') throw new Error('更新清单格式无效');
  const value = raw as Partial<UpdateManifest>;
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+/.test(value.version)) {
    throw new Error('更新清单缺少版本号');
  }
  return {
    version: value.version,
    notes: typeof value.notes === 'string' ? value.notes.slice(0, MAX_NOTES_LENGTH) : undefined,
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : undefined,
    releaseUrl: typeof value.releaseUrl === 'string' ? value.releaseUrl : undefined,
    windows: normalizeAsset(value.windows),
    android: normalizeAsset(value.android),
  };
}

function normalizeAsset(raw: unknown): UpdateAsset | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<UpdateAsset>;
  if (typeof value.file !== 'string' || !value.file) return undefined;
  return {
    file: value.file,
    size: typeof value.size === 'number' ? value.size : 0,
    sha256: typeof value.sha256 === 'string' ? value.sha256.toLowerCase() : '',
  };
}

async function fetchJson(url: string): Promise<UpdateManifest> {
  // Inside the Android WebView a plain fetch is blocked by CORS: GitHub
  // redirects release assets to objects.githubusercontent.com, which does not
  // allow cross-origin reads. The native layer fetches the manifest instead.
  if (isAndroidApp()) {
    const { status, body } = await LiteUpdater.fetchText({ url });
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    return normalizeManifest(JSON.parse(body));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return normalizeManifest(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches the manifest, trying every source before reporting the last error. */
export async function fetchManifest(slug = repositorySlug()): Promise<UpdateManifest> {
  const errors: string[] = [];
  for (const url of manifestSources(slug)) {
    try {
      return await fetchJson(url);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(errors[0] || '无法连接更新服务器');
}

export function platformKey(platform: string): 'android' | 'windows' {
  return platform === 'android' ? 'android' : 'windows';
}

/** Compares the manifest with `current` and picks the installer for `platform`. */
export async function checkForUpdates(
  current: string,
  platform: string,
  slug = repositorySlug(),
): Promise<UpdateCheck> {
  try {
    const manifest = await fetchManifest(slug);
    const latest = manifest.version;
    if (compareVersions(latest, current) > 0) {
      return {
        status: 'available',
        current,
        latest,
        notes: manifest.notes,
        publishedAt: manifest.publishedAt,
        asset: manifest[platformKey(platform)],
      };
    }
    return { status: 'up-to-date', current, latest };
  } catch (error) {
    return {
      status: 'error',
      current,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Android: download + install through the LiteUpdater native plugin          */
/* -------------------------------------------------------------------------- */

interface LiteUpdaterPlugin {
  download(options: {
    url: string;
    fileName: string;
    sha256?: string;
  }): Promise<{ path: string; size: number }>;
  install(options: { path: string }): Promise<void>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  fetchText(options: { url: string }): Promise<{ status: number; body: string }>;
  addListener(
    eventName: 'progress',
    listener: (event: { received: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const LiteUpdater = registerPlugin<LiteUpdaterPlugin>('LiteUpdater');

export function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function isDesktopApp(): boolean {
  return Boolean(window.liteTavern?.isDesktop);
}

/**
 * Android can only install an APK after the user granted "install unknown apps"
 * for LiteTavern. Returns true when installation may start right away.
 */
export async function ensureAndroidInstallAllowed(): Promise<boolean> {
  const { allowed } = await LiteUpdater.canInstall();
  if (!allowed) await LiteUpdater.openInstallSettings();
  return allowed;
}

/**
 * Downloads the APK through the native layer (no CORS, no WebView memory spike)
 * and verifies its SHA-256 before returning the local path.
 */
export async function downloadAndroidUpdate(
  asset: UpdateAsset,
  onProgress?: (received: number, total: number) => void,
): Promise<string> {
  const handle = await LiteUpdater.addListener(
    'progress',
    (event: { received: number; total: number }) => {
      onProgress?.(event.received, event.total);
    },
  );
  const errors: string[] = [];
  try {
    for (const url of assetSources(asset.file)) {
      try {
        const result = await LiteUpdater.download({
          url,
          fileName: asset.file,
          sha256: asset.sha256,
        });
        return result.path;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    await handle.remove();
  }
  throw new Error(errors[0] || '下载失败');
}

export async function installAndroidUpdate(apkPath: string): Promise<void> {
  await LiteUpdater.install({ path: apkPath });
}

/** Human readable size, e.g. "108 MB". */
export function formatDownloadSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
