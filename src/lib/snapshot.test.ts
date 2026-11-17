import { describe, expect, it } from 'vitest';
import { redactSecrets, storeHasData } from './snapshot';

function serialized(characters: number, chats: number): string {
  return JSON.stringify({
    state: {
      characters: Array.from({ length: characters }, (_, i) => ({ id: `c${i}` })),
      chats: Array.from({ length: chats }, (_, i) => ({ id: `h${i}` })),
    },
    version: 1,
  });
}

describe('recovery snapshot detection', () => {
  it('accepts stores that hold cards or chats', () => {
    expect(storeHasData(serialized(1, 0))).toBe(true);
    expect(storeHasData(serialized(0, 2))).toBe(true);
    expect(storeHasData(serialized(2, 3))).toBe(true);
  });

  it('rejects empty, missing and malformed values', () => {
    expect(storeHasData(serialized(0, 0))).toBe(false);
    expect(storeHasData('')).toBe(false);
    expect(storeHasData(null)).toBe(false);
    expect(storeHasData('not json')).toBe(false);
  });
});

describe('snapshot redaction', () => {
  it('drops the API key but keeps the rest of the state', () => {
    const json = JSON.stringify({
      state: {
        characters: [{ id: 'c1', name: '临渊' }],
        settings: { apiKey: 'sk-secret-value', model: 'deepseek-flash' },
      },
      version: 1,
    });
    const redacted = redactSecrets(json);
    expect(redacted).not.toContain('sk-secret-value');
    expect(redacted).toContain('"apiKey":""');
    expect(redacted).toContain('deepseek-flash');
    expect(redacted).toContain('临渊');
  });
});
