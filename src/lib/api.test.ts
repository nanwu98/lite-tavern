import { describe, expect, it } from 'vitest';
import {
  ApiError,
  chatEndpoint,
  contextErrorMessage,
  detectContextOverflow,
  normalizeBaseUrl,
} from './api';

describe('context overflow detection', () => {
  it('recognises the provider wording and extracts the window size', () => {
    const message =
      "This model's maximum context length is 65536 tokens. However, you requested 70000 tokens.";
    expect(detectContextOverflow(400, message)).toEqual({ context: true, limit: 65536 });
    expect(detectContextOverflow(413, 'request exceeds the maximum token limit')).toEqual({
      context: true,
      limit: undefined,
    });
    expect(detectContextOverflow(422, '上下文长度超出限制')).toEqual({
      context: true,
      limit: undefined,
    });
  });

  it('ignores unrelated errors and non-request statuses', () => {
    expect(detectContextOverflow(401, 'invalid api key').context).toBe(false);
    expect(detectContextOverflow(429, 'rate limit reached').context).toBe(false);
    expect(detectContextOverflow(500, 'internal error').context).toBe(false);
    expect(detectContextOverflow(404, 'maximum context length is 8192 tokens').context).toBe(false);
  });

  it('explains the fix in the user-facing message', () => {
    expect(contextErrorMessage(65536)).toContain('65,536');
    expect(contextErrorMessage()).toContain('上下文上限');
    expect(contextErrorMessage()).toContain('压缩');
  });

  it('keeps the error kind on ApiError instances', () => {
    const error = new ApiError('too long', 400, 'context', 8192);
    expect(error.kind).toBe('context');
    expect(error.limitTokens).toBe(8192);
    expect(new ApiError('boom').kind).toBe('other');
  });
});

describe('endpoint helpers', () => {
  it('accepts a base URL with or without the chat path', () => {
    expect(chatEndpoint('https://api.example.com')).toBe(
      'https://api.example.com/chat/completions',
    );
    expect(chatEndpoint('https://api.example.com/chat/completions')).toBe(
      'https://api.example.com/chat/completions',
    );
    expect(chatEndpoint('api.example.com/v1/')).toBe('https://api.example.com/v1/chat/completions');
  });

  it('rejects an empty base URL instead of silently calling one vendor', () => {
    expect(() => normalizeBaseUrl('')).toThrow(/Base URL/);
    expect(() => chatEndpoint('  ')).toThrow(/Base URL/);
  });
});
