import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  chatEndpoint,
  contextErrorMessage,
  detectContextOverflow,
  looksLikeChatModel,
  modelListUrls,
  modelsEndpoint,
  normalizeBaseUrl,
  parseModelList,
  streamChat,
} from './api';
import { DEFAULT_SETTINGS } from '../defaults';

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

  it('builds the model-list endpoint from the chat endpoint', () => {
    expect(modelsEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/models');
    expect(modelsEndpoint('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/models',
    );
  });
});

describe('model list parsing', () => {
  it('reads the OpenAI shape, string arrays and bare arrays', () => {
    expect(parseModelList({ object: 'list', data: [{ id: 'a' }, { id: 'b' }] })).toEqual([
      'a',
      'b',
    ]);
    expect(parseModelList({ models: ['x', 'y'] })).toEqual(['x', 'y']);
    expect(parseModelList(['p', { id: 'q' }])).toEqual(['p', 'q']);
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList({ data: [{ name: 'n' }, { model: 'm' }] })).toEqual(['n', 'm']);
  });

  it('deduplicates and trims ids', () => {
    expect(parseModelList({ data: [{ id: ' a ' }, { id: 'a' }] })).toEqual(['a']);
  });

  it('drops embeddings, rerankers and image models', () => {
    const ids = [
      'qwen-plus',
      'text-embedding-v3',
      'BAAI/bge-m3',
      'bge-reranker-v2',
      'flux-schnell',
      'whisper-1',
      'doubao-seed-1-6',
    ];
    expect(ids.filter(looksLikeChatModel)).toEqual(['qwen-plus', 'doubao-seed-1-6']);
  });

  it('offers the conventional endpoint first and the preset fallback after it', () => {
    const deepseek = modelListUrls({ ...DEFAULT_SETTINGS, provider: 'deepseek' });
    expect(deepseek).toEqual(['https://api.deepseek.com/models']);

    // Bailian documents its list under /api/v1/models, not under compatible-mode.
    const qwen = modelListUrls({
      ...DEFAULT_SETTINGS,
      provider: 'qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    expect(qwen[0]).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/models');
    expect(qwen).toContain('https://dashscope.aliyuncs.com/api/v1/models');
  });
});

describe('thinking mode', () => {
  const sse = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });

  it('streams the chain of thought before the answer and asks for thinking', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          sse([
            'data: {"choices":[{"delta":{"reasoning_content":"先想"}}]}\n\n',
            'data: {"choices":[{"delta":{"reasoning_content":"一下"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
            'data: [DONE]\n\n',
          ]),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const reasoning: string[] = [];
      const deltas: string[] = [];
      const text = await streamChat({
        settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key', thinking: true },
        messages: [{ role: 'user', content: 'hi' }],
        onDelta: (chunk) => deltas.push(chunk),
        onReasoning: (chunk) => reasoning.push(chunk),
      });
      expect(text).toBe('你好');
      expect(reasoning.join('')).toBe('先想一下');
      expect(deltas.join('')).toBe('你好');
      const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
      expect(sent.thinking).toEqual({ type: 'enabled' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaves thinking out of the request unless the user turned it on', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '答', reasoning_content: '想' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const reasoning: string[] = [];
      const text = await streamChat({
        settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key', stream: false },
        messages: [{ role: 'user', content: 'hi' }],
        onReasoning: (chunk) => reasoning.push(chunk),
      });
      expect(text).toBe('答');
      expect(reasoning).toEqual(['想']);
      const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
      expect(sent).not.toHaveProperty('thinking');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
