import type { ProviderId, Settings } from '../types';

/**
 * Model providers the app ships presets for.
 *
 * Every entry is an OpenAI-compatible endpoint, so a single client covers all of
 * them; the preset only fills in the Base URL, a few current model names and the
 * page where the key is created. Model ids change often, so the model field
 * stays editable and the list is a convenience, not a whitelist.
 */

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  /** Short note shown in the picker, e.g. "阿里云百炼". */
  hint?: string;
  baseUrl: string;
  models: ProviderModel[];
  /** Where to create an API key. Empty for `custom`. */
  keyUrl?: string;
  /** Provider documentation for OpenAI-compatible access. */
  docsUrl?: string;
  /** Sensible context window to pre-fill when this provider is selected. */
  contextLimit?: number;
  /** Extra explanation shown under the fields. */
  note?: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-chat', label: 'deepseek-chat · 通用对话' },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner · 推理' },
    ],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/zh-cn/',
    contextLimit: 65_536,
  },
  {
    id: 'qwen',
    label: '通义千问',
    hint: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-plus', label: 'qwen-plus · 均衡' },
      { id: 'qwen-max', label: 'qwen-max · 最强' },
      { id: 'qwen-turbo', label: 'qwen-turbo · 快速' },
      { id: 'qwen-long', label: 'qwen-long · 长文本' },
    ],
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    docsUrl:
      'https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope',
    contextLimit: 131_072,
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    hint: '开放平台',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4.6', label: 'glm-4.6 · 通用' },
      { id: 'glm-4.5', label: 'glm-4.5' },
      { id: 'glm-4-plus', label: 'glm-4-plus' },
      { id: 'glm-4-flash', label: 'glm-4-flash · 免费' },
    ],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
    contextLimit: 131_072,
  },
  {
    id: 'moonshot',
    label: 'Kimi',
    hint: '月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-k2-0905-preview', label: 'kimi-k2 · 长上下文' },
      { id: 'kimi-latest', label: 'kimi-latest' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
      { id: 'moonshot-v1-128k', label: 'moonshot-v1-128k' },
    ],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    docsUrl: 'https://platform.moonshot.cn/docs/api/chat',
    contextLimit: 131_072,
  },
  {
    id: 'qianfan',
    label: '文心一言',
    hint: '百度千帆',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    models: [
      { id: 'ernie-4.5-turbo-128k', label: 'ernie-4.5-turbo-128k' },
      { id: 'ernie-4.5-8k-preview', label: 'ernie-4.5-8k' },
      { id: 'ernie-speed-128k', label: 'ernie-speed-128k · 快速' },
    ],
    keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list',
    docsUrl: 'https://cloud.baidu.com/doc/qianfan-api/index.html',
    contextLimit: 131_072,
    note: '千帆 v2 使用「API Key（bce-v3/…）」，不是旧版 AK/SK。',
  },
  {
    id: 'hunyuan',
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: [
      { id: 'hunyuan-turbos-latest', label: 'hunyuan-turbos · 快速' },
      { id: 'hunyuan-t1-latest', label: 'hunyuan-t1 · 推理' },
      { id: 'hunyuan-a13b', label: 'hunyuan-a13b' },
    ],
    keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
    docsUrl: 'https://cloud.tencent.com/document/product/1729',
    contextLimit: 131_072,
  },
  {
    id: 'ark',
    label: '豆包',
    hint: '火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'doubao-seed-1-6-250615', label: 'doubao-seed-1.6' },
      { id: 'doubao-seed-1-6-flash-250615', label: 'doubao-seed-1.6-flash · 快速' },
    ],
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    docsUrl: 'https://www.volcengine.com/docs/82379',
    contextLimit: 131_072,
    note: '模型一栏既可以填模型 ID，也可以填方舟里创建的推理接入点（ep-…）。',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    hint: '聚合多种开源模型',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5-72B' },
      { id: 'THUDM/glm-4-9b-chat', label: 'glm-4-9b-chat' },
    ],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    docsUrl: 'https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions',
    contextLimit: 65_536,
  },
  {
    id: 'custom',
    label: '自定义',
    hint: '任意 OpenAI 兼容接口',
    baseUrl: '',
    models: [],
    note: '填写服务商或中转站给出的 Base URL（通常以 /v1 结尾）与模型名。',
  },
];

const CUSTOM = PROVIDERS[PROVIDERS.length - 1];

export function getProvider(id: ProviderId | string | undefined): ProviderPreset {
  return PROVIDERS.find((provider) => provider.id === id) ?? CUSTOM;
}

/** Short label for a settings link, e.g. "platform.deepseek.com/api_keys". */
export function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

export function isCustomProvider(id: ProviderId | string | undefined): boolean {
  return getProvider(id).id === 'custom';
}

/** Model suggestions for the picker; empty for the custom provider. */
export function providerModels(id: ProviderId | string | undefined): ProviderModel[] {
  return getProvider(id).models;
}

/**
 * Applies a provider choice to a settings draft.
 *
 * Switching to a preset fills in its Base URL, first model and context window,
 * and restores the key that was last used with it. Switching to `custom` keeps
 * the current values so they can be edited instead of retyped.
 */
export function applyProviderSelection(draft: Settings, id: ProviderId): Settings {
  const preset = getProvider(id);
  if (preset.id === 'custom') {
    return { ...draft, provider: 'custom', apiKey: draft.apiKeys?.custom ?? '' };
  }
  return {
    ...draft,
    provider: preset.id,
    baseUrl: preset.baseUrl,
    model: preset.models[0]?.id ?? draft.model,
    contextLimit: preset.contextLimit ?? draft.contextLimit,
    apiKey: draft.apiKeys?.[preset.id] ?? '',
  };
}

/** Infers which preset a stored Base URL belongs to (used when migrating). */
export function providerForBaseUrl(baseUrl: string): ProviderId {
  const value = (baseUrl ?? '').trim().toLowerCase().replace(/\/+$/, '');
  if (!value) return 'deepseek';
  const match = PROVIDERS.find(
    (provider) =>
      provider.baseUrl &&
      (value === provider.baseUrl.toLowerCase() ||
        value.startsWith(`${provider.baseUrl.toLowerCase()}/`)),
  );
  return match?.id ?? 'custom';
}

/**
 * Repairs settings loaded from an older store: `provider`/`apiKeys` did not
 * exist before 1.6, so they are derived from the Base URL and the single key.
 */
export function normalizeSettings(raw: Partial<Settings> | undefined): Partial<Settings> {
  if (!raw) return {};
  const provider: ProviderId =
    raw.provider && PROVIDERS.some((item) => item.id === raw.provider)
      ? raw.provider
      : providerForBaseUrl(raw.baseUrl ?? '');
  const stored = raw.apiKeys && typeof raw.apiKeys === 'object' ? raw.apiKeys : {};
  const apiKeys: Record<string, string> = { ...stored };
  if (typeof raw.apiKey === 'string' && raw.apiKey && !apiKeys[provider]) {
    apiKeys[provider] = raw.apiKey;
  }
  return { ...raw, provider, apiKeys };
}
