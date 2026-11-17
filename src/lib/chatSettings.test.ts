import { describe, expect, it } from 'vitest';
import {
  MAX_CONTEXT_LIMIT,
  MIN_CONTEXT_LIMIT,
  contextLimitFor,
  hasOverrides,
  normalizeOverrides,
  settingsForChat,
} from './chatSettings';
import { DEFAULT_SETTINGS } from '../defaults';
import type { Chat } from '../types';

function chat(overrides?: Chat['overrides']): Chat {
  return {
    id: 'c1',
    characterId: 'k1',
    title: '临渊',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    overrides,
  };
}

describe('per-chat context window', () => {
  it('falls back to the global setting when the chat has no override', () => {
    const settings = { ...DEFAULT_SETTINGS, contextLimit: 131_072 };
    expect(contextLimitFor(settings, chat())).toBe(131_072);
    expect(contextLimitFor(settings, undefined)).toBe(131_072);
    expect(hasOverrides(chat())).toBe(false);
  });

  it('uses the chat override when there is one', () => {
    const settings = { ...DEFAULT_SETTINGS, contextLimit: 131_072 };
    const target = chat({ contextLimit: 1_048_576 });
    expect(contextLimitFor(settings, target)).toBe(1_048_576);
    expect(settingsForChat(settings, target).contextLimit).toBe(1_048_576);
    expect(hasOverrides(target)).toBe(true);
  });

  it('leaves everything else global', () => {
    const settings = { ...DEFAULT_SETTINGS, model: 'deepseek-flash', temperature: 1.3 };
    const next = settingsForChat(settings, chat({ contextLimit: 32_768 }));
    expect(next.model).toBe('deepseek-flash');
    expect(next.temperature).toBe(1.3);
  });

  it('returns the same object when the override matches the global value', () => {
    const settings = { ...DEFAULT_SETTINGS, contextLimit: 262_144 };
    expect(settingsForChat(settings, chat({ contextLimit: 262_144 }))).toBe(settings);
  });

  it('clamps nonsense values instead of trusting the stored number', () => {
    expect(normalizeOverrides({ contextLimit: 10 })).toEqual({ contextLimit: MIN_CONTEXT_LIMIT });
    expect(normalizeOverrides({ contextLimit: 99_000_000 })).toEqual({
      contextLimit: MAX_CONTEXT_LIMIT,
    });
    expect(normalizeOverrides({ contextLimit: 0 })).toBeUndefined();
    expect(normalizeOverrides(undefined)).toBeUndefined();
    expect(normalizeOverrides({})).toBeUndefined();
  });

  it('ignores an out-of-range override when computing the limit', () => {
    const settings = { ...DEFAULT_SETTINGS, contextLimit: 65_536 };
    expect(contextLimitFor(settings, chat({ contextLimit: 1 }))).toBe(MIN_CONTEXT_LIMIT);
  });
});
