import { describe, expect, it } from 'vitest';
import {
  PROVIDERS,
  applyProviderSelection,
  getProvider,
  isCustomProvider,
  linkLabel,
  normalizeSettings,
  providerForBaseUrl,
  providerModels,
} from './providers';
import { DEFAULT_SETTINGS } from '../defaults';
import type { Settings } from '../types';

function draft(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, apiKey: '', apiKeys: {}, ...overrides };
}

describe('provider presets', () => {
  it('offers several domestic providers plus a custom option', () => {
    const ids = PROVIDERS.map((provider) => provider.id);
    expect(ids).toContain('deepseek');
    expect(ids).toContain('qwen');
    expect(ids).toContain('zhipu');
    expect(ids).toContain('moonshot');
    expect(ids).toContain('qianfan');
    expect(ids).toContain('hunyuan');
    expect(ids).toContain('ark');
    expect(ids).toContain('siliconflow');
    expect(ids.at(-1)).toBe('custom');
  });

  it('gives every preset a URL and every preset but custom a key page', () => {
    for (const provider of PROVIDERS) {
      if (provider.id === 'custom') {
        // Custom is a blank form: no URL, no key page, no suggested models.
        expect(provider.baseUrl).toBe('');
        expect(provider.keyUrl).toBeUndefined();
        continue;
      }
      expect(provider.baseUrl).toMatch(/^https:\/\//);
      expect(provider.keyUrl).toMatch(/^https:\/\//);
      expect(provider.models.length).toBeGreaterThan(0);
    }
  });

  it('falls back to the custom preset for unknown ids', () => {
    expect(getProvider('nope').id).toBe('custom');
    expect(getProvider(undefined).id).toBe('custom');
    expect(isCustomProvider('custom')).toBe(true);
    expect(providerModels('deepseek').length).toBeGreaterThan(0);
  });

  it('formats link labels without the scheme', () => {
    expect(linkLabel('https://platform.deepseek.com/api_keys')).toBe(
      'platform.deepseek.com/api_keys',
    );
    expect(linkLabel('https://open.bigmodel.cn/')).toBe('open.bigmodel.cn');
    expect(linkLabel('not a url')).toBe('not a url');
  });
});

describe('switching providers', () => {
  it('fills the URL, model, context window and the key remembered for that provider', () => {
    const settings = draft({ apiKeys: { zhipu: 'zhipu-key' } });
    const next = applyProviderSelection(settings, 'zhipu');
    expect(next.provider).toBe('zhipu');
    expect(next.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(next.model).toBe('glm-4.6');
    expect(next.contextLimit).toBe(131_072);
    expect(next.apiKey).toBe('zhipu-key');
  });

  it('clears the key when that provider has never been used', () => {
    const next = applyProviderSelection(draft({ apiKey: 'deepseek-key' }), 'qwen');
    expect(next.apiKey).toBe('');
    expect(next.apiKeys.deepseek).toBeUndefined();
  });

  it('keeps the current URL and model when switching to custom', () => {
    const settings = draft({ baseUrl: 'https://gateway.example.com/v1', model: 'my-model' });
    const next = applyProviderSelection(settings, 'custom');
    expect(next.provider).toBe('custom');
    expect(next.baseUrl).toBe('https://gateway.example.com/v1');
    expect(next.model).toBe('my-model');
  });
});

describe('migrating stored settings', () => {
  it('recognises the provider from an existing Base URL', () => {
    expect(providerForBaseUrl('https://api.deepseek.com')).toBe('deepseek');
    expect(providerForBaseUrl('https://api.deepseek.com/')).toBe('deepseek');
    expect(providerForBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe('qwen');
    expect(providerForBaseUrl('https://custom.example.com/v1')).toBe('custom');
    expect(providerForBaseUrl('')).toBe('deepseek');
  });

  it('turns a 1.5 settings object into one with provider and per-provider keys', () => {
    const legacy = {
      ...DEFAULT_SETTINGS,
      provider: undefined,
      apiKeys: undefined,
      apiKey: 'sk-legacy',
      baseUrl: 'https://api.moonshot.cn/v1',
    } as unknown as Partial<Settings>;
    const normalized = normalizeSettings(legacy);
    expect(normalized.provider).toBe('moonshot');
    expect(normalized.apiKeys).toEqual({ moonshot: 'sk-legacy' });
    expect(normalized.apiKey).toBe('sk-legacy');
  });

  it('keeps existing per-provider keys when normalising again', () => {
    const stored = draft({
      provider: 'qwen',
      apiKey: 'qwen-key',
      apiKeys: { deepseek: 'deepseek-key', qwen: 'qwen-key' },
    });
    const normalized = normalizeSettings(stored);
    expect(normalized.provider).toBe('qwen');
    expect(normalized.apiKeys).toEqual({ deepseek: 'deepseek-key', qwen: 'qwen-key' });
  });

  it('does not invent a provider when nothing is stored', () => {
    expect(normalizeSettings(undefined)).toEqual({});
    expect(normalizeSettings({}).provider).toBe('deepseek');
  });
});
