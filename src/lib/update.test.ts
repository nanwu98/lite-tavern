import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assetSources,
  checkForUpdates,
  compareVersions,
  formatDownloadSize,
  hasAssetFor,
  manifestSources,
  platformKey,
  releasePageUrl,
} from './update';

describe('compareVersions', () => {
  it('orders plain releases', () => {
    expect(compareVersions('1.5.0', '1.4.9')).toBe(1);
    expect(compareVersions('1.4.0', '1.4.0')).toBe(0);
    expect(compareVersions('1.4.0', '1.5.0')).toBe(-1);
  });

  it('compares numerically, not lexicographically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
  });

  it('treats a pre-release as older than its release', () => {
    expect(compareVersions('1.5.0-beta.1', '1.5.0')).toBe(-1);
    expect(compareVersions('1.5.0', '1.5.0-beta.1')).toBe(1);
  });

  it('accepts a leading v and pads short versions', () => {
    expect(compareVersions('v1.5', '1.4.9')).toBe(1);
    expect(compareVersions('1.5', '1.5.0')).toBe(0);
  });
});

describe('release URLs', () => {
  it('points at the latest release manifest and its mirrors', () => {
    const sources = manifestSources('someone/lite-tavern');
    expect(sources[0]).toBe(
      'https://github.com/someone/lite-tavern/releases/latest/download/version.json',
    );
    expect(sources).toHaveLength(3);
    expect(sources[1]).toContain('ghfast.top');
  });

  it('encodes asset names in download URLs', () => {
    const sources = assetSources('LiteTavern-1.5.0-win-x64.exe', 'someone/lite-tavern');
    expect(sources[0]).toBe(
      'https://github.com/someone/lite-tavern/releases/latest/download/LiteTavern-1.5.0-win-x64.exe',
    );
  });

  it('links to the releases page', () => {
    expect(releasePageUrl('someone/lite-tavern')).toBe(
      'https://github.com/someone/lite-tavern/releases/latest',
    );
  });
});

describe('helpers', () => {
  it('maps platforms to manifest keys', () => {
    expect(platformKey('android')).toBe('android');
    expect(platformKey('win32')).toBe('windows');
    expect(platformKey('web')).toBe('windows');
  });

  it('formats download sizes', () => {
    expect(formatDownloadSize(0)).toBe('');
    expect(formatDownloadSize(110 * 1024 * 1024)).toBe('110 MB');
    expect(formatDownloadSize(512 * 1024)).toBe('512 KB');
  });
});

describe('manifest selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stale = { version: '9.9.9', windows: { file: 'x.exe', size: 1, sha256: 'a' } };
  const fresh = {
    version: '9.9.9',
    windows: { file: 'x.exe', size: 1, sha256: 'a' },
    android: { file: 'x.apk', size: 1, sha256: 'b' },
  };

  function mockFetch(byUrl: (url: string) => unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => byUrl(String(url)),
      })),
    );
  }

  it('skips mirrors whose cached manifest has no installer for this platform', async () => {
    // GitHub and the first mirror still carry the pre-upload manifest.
    mockFetch((url) => (url.includes('ghproxy.net') ? fresh : stale));
    const result = await checkForUpdates('1.0.0', 'android', 'someone/lite-tavern');
    expect(result.status).toBe('available');
    expect(result.asset?.file).toBe('x.apk');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it('still reports the update when no source has the installer', async () => {
    mockFetch(() => stale);
    const result = await checkForUpdates('1.0.0', 'android', 'someone/lite-tavern');
    expect(result.status).toBe('available');
    expect(result.asset).toBeUndefined();
    expect(result.latest).toBe('9.9.9');
  });

  it('reports up-to-date without asking the remaining mirrors', async () => {
    mockFetch(() => fresh);
    const result = await checkForUpdates('9.9.9', 'android', 'someone/lite-tavern');
    expect(result.status).toBe('up-to-date');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('reports an error when every source fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })),
    );
    const result = await checkForUpdates('1.0.0', 'android', 'someone/lite-tavern');
    expect(result.status).toBe('error');
    expect(result.error).toContain('502');
  });

  it('knows whether a manifest carries this platform', () => {
    expect(hasAssetFor(fresh, 'android')).toBe(true);
    expect(hasAssetFor(fresh, 'win32')).toBe(true);
    expect(hasAssetFor(stale, 'android')).toBe(false);
  });
});
