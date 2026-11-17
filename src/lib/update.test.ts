import { describe, expect, it } from 'vitest';
import {
  assetSources,
  compareVersions,
  formatDownloadSize,
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
