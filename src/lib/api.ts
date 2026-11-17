import type { Settings } from '../types';

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ApiErrorKind = 'context' | 'auth' | 'quota' | 'network' | 'other';

export class ApiError extends Error {
  status?: number;
  kind: ApiErrorKind;
  /** Context window reported by the provider, when it says how big it is. */
  limitTokens?: number;
  constructor(
    message: string,
    status?: number,
    kind: ApiErrorKind = 'other',
    limitTokens?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.limitTokens = limitTokens;
  }
}

const CONTEXT_PATTERNS = [
  /maximum context length is (\d+)/i,
  /context length is (\d+)/i,
  /max(?:imum)? context (?:window|length)[^0-9]{0,20}(\d{4,})/i,
  /context (?:window|length)/i,
  /too many tokens/i,
  /prompt is too long/i,
  /reduce the length of the messages/i,
  /exceeds? the (?:maximum )?(?:model )?token limit/i,
  /(?:requested|input).{0,40}tokens.{0,40}(?:maximum|limit)/i,
  /上下文长度|上下文.{0,6}(?:超|上限|限制)/,
  /token\s*(?:数量|长度).{0,10}(?:超|上限)/,
];

/** Recognises provider errors that mean "the prompt no longer fits". */
export function detectContextOverflow(
  status: number,
  detail: string,
): { context: boolean; limit?: number } {
  const text = (detail ?? '').trim();
  if (!text) return { context: false };
  const matched = CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
  if (!matched) return { context: false };
  // 400/413/422 are the usual rejections; a 500 with this text also counts.
  if (![400, 413, 422, 500, 0].includes(status)) return { context: false };
  const explicit = /(?:context length is|context window)[^0-9]{0,20}(\d{4,})/i.exec(text);
  const limit = explicit ? Number(explicit[1]) : undefined;
  return { context: true, limit: Number.isFinite(limit) && limit! > 0 ? limit : undefined };
}

export function contextErrorMessage(limit?: number): string {
  const size = limit ? `（服务端上限 ${limit.toLocaleString('en-US')} tokens）` : '';
  return `这段对话已经超出模型的上下文上限${size}，继续发送会被服务端拒绝。先把它压缩成一段长期记忆，再继续对话即可。`;
}

export function normalizeBaseUrl(input: string): string {
  let base = (input ?? '').trim();
  if (!base) throw new ApiError('还没有填写 Base URL，请打开设置选择服务商或填写接口地址。');
  base = base.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base;
}

export function chatEndpoint(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

export function modelsEndpoint(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/i.test(base)) return base.replace(/\/chat\/completions$/i, '/models');
  return `${base}/models`;
}

function headers(settings: Settings): Record<string, string> {
  if (!settings.apiKey.trim())
    throw new ApiError('还没有填写 API Key，请打开设置填写所选服务商的 Key。');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey.trim()}`,
  };
}

function friendlyStatus(status: number, detail: string): string {
  const suffix = detail ? `（${detail}）` : '';
  switch (status) {
    case 401:
      return 'API Key 无效或已过期，请到服务商控制台重新生成。';
    case 402:
      return '账户余额不足，请到服务商控制台充值后再试。';
    case 403:
      return `没有访问权限${suffix}。`;
    case 404:
      return `接口地址不存在，请检查 Base URL 是否填写正确${suffix}。`;
    case 429:
      return '请求太频繁或额度受限，请稍后再试。';
    default:
      return status >= 500 ? `模型服务暂时不可用${suffix}，请稍后重试。` : `请求失败${suffix}。`;
  }
}

async function readError(res: Response): Promise<ApiError> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const err = json.error;
      if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        detail = String(e.message ?? e.code ?? '').trim();
      } else {
        detail = String(json.message ?? '').trim();
      }
    } catch {
      detail = text.slice(0, 180).trim();
    }
  } catch {
    // Ignore unreadable error bodies.
  }
  const overflow = detectContextOverflow(res.status, detail);
  if (overflow.context) {
    return new ApiError(contextErrorMessage(overflow.limit), res.status, 'context', overflow.limit);
  }
  const kind: ApiErrorKind =
    res.status === 401 || res.status === 403
      ? 'auth'
      : res.status === 402 || res.status === 429
        ? 'quota'
        : 'other';
  return new ApiError(friendlyStatus(res.status, detail), res.status, kind);
}

function extractDelta(json: Record<string, unknown>): string {
  const choices = json.choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const choice = choices[0] as Record<string, unknown>;
  const delta = (choice.delta ?? choice.message) as Record<string, unknown> | undefined;
  if (!delta) return '';
  const content = delta.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          return typeof p.text === 'string' ? p.text : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

export interface StreamOptions {
  settings: Settings;
  messages: ApiMessage[];
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  idleTimeoutMs?: number;
}

export async function streamChat(options: StreamOptions): Promise<string> {
  const { settings, messages, signal, onDelta } = options;
  const url = chatEndpoint(settings.baseUrl);
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.idleTimeoutMs ?? 90_000);
  };

  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });
  resetTimer();

  const model = settings.model.trim();
  if (!model) throw new ApiError('还没有选择模型，请打开设置选择或填写模型名。');
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: Boolean(settings.stream),
    temperature: settings.temperature,
  };
  if (settings.maxTokens > 0) body.max_tokens = Math.floor(settings.maxTokens);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: headers(settings),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw await readError(res);

    const contentType = res.headers.get('content-type') ?? '';
    if (!settings.stream || !res.body || contentType.includes('application/json')) {
      const json = (await res.json()) as Record<string, unknown>;
      const text = extractDelta(json);
      if (!text) throw new ApiError('模型没有返回内容，请重试或更换模型。');
      onDelta?.(text);
      return text;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      resetTimer();
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          done = true;
          break;
        }
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (json.error) {
          const err = json.error as Record<string, unknown>;
          const detail = String(err.message ?? err.code ?? '流式返回错误');
          const overflow = detectContextOverflow(400, detail);
          if (overflow.context) {
            throw new ApiError(contextErrorMessage(overflow.limit), 400, 'context', overflow.limit);
          }
          throw new ApiError(detail);
        }
        const text = extractDelta(json);
        if (text) {
          full += text;
          onDelta?.(text);
        }
      }
    }
    if (!full.trim()) throw new ApiError('模型没有返回内容，请重试或更换模型。');
    return full;
  } catch (error) {
    if (timedOut) throw new ApiError('等待回复超时，请检查网络后重试。');
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(
      `网络连接失败：${error instanceof Error ? error.message : String(error)}。请检查网络、代理或 Base URL。`,
    );
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
  models?: string[];
}

export async function testConnection(settings: Settings): Promise<ConnectionResult> {
  if (!settings.apiKey.trim()) return { ok: false, message: '请先填写 API Key。' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(modelsEndpoint(settings.baseUrl), {
      headers: { Authorization: `Bearer ${settings.apiKey.trim()}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 404) {
        return { ok: true, message: '接口地址可访问（服务未提供 /models，可直接尝试聊天）。' };
      }
      const err = await readError(res);
      return { ok: false, message: err.message };
    }
    const json = (await res.json()) as Record<string, unknown>;
    const data = Array.isArray(json.data) ? json.data : [];
    const models = data
      .map((item) =>
        item && typeof item === 'object' ? String((item as Record<string, unknown>).id ?? '') : '',
      )
      .filter(Boolean);
    return {
      ok: true,
      message: models.length ? `连接成功，可用模型：${models.join('、')}` : '连接成功。',
      models,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, message: '连接超时，请检查网络或 Base URL。' };
    }
    return {
      ok: false,
      message: `连接失败：${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
