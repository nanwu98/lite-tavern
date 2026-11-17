import type { ProviderId, Settings } from '../types';

/**
 * Model providers the app ships presets for.
 *
 * Every entry is an OpenAI-compatible endpoint, so a single client covers all of
 * them; the preset only fills in the Base URL, a few current model names and the
 * page where the key is created. Model ids change often — DeepSeek retired
 * `deepseek-chat` / `deepseek-reasoner` in July 2026 — so the list stays a
 * convenience, not a whitelist: the model field is editable and the settings page
 * can fetch the live list from the provider's `/models` endpoint.
 *
 * Snapshot date of the built-in lists: 2026-11-17.
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
  /** Extra absolute URLs to try if `{baseUrl}/models` does not exist. */
  modelsUrls?: string[];
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
      { id: 'deepseek-flash', label: 'V4.1 Flash · 通用，支持图像' },
      { id: 'deepseek-v4-pro', label: 'V4 Pro · 旗舰推理' },
    ],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/zh-cn/',
    contextLimit: 1_000_000,
    note:
      '旧的 deepseek-chat / deepseek-reasoner 已于 2026-07-24 停用，现在请用 deepseek-flash 或 deepseek-v4-pro（上下文 1M）。' +
      'V4 默认开启思考模式，回复会比以前慢一些，也更贵一点。',
  },
  {
    id: 'qwen',
    label: '通义千问',
    hint: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen4-max', label: 'Qwen4 Max · 效果优先' },
      { id: 'qwen3.7-plus', label: 'Qwen3.7 Plus · 均衡之选' },
      { id: 'qwen3.8-flash', label: 'Qwen3.8 Flash · 成本优先' },
      { id: 'qwen-plus', label: 'Qwen Plus · 经典通用' },
      { id: 'qwen-plus-character', label: 'Qwen Character · 角色扮演专用' },
    ],
    // 百炼官方文档只公开了 /api/v1/models（不是 compatible-mode 下的路径）。
    modelsUrls: ['https://dashscope.aliyuncs.com/api/v1/models'],
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    docsUrl:
      'https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope',
    contextLimit: 1_000_000,
    note: 'qwen-plus-character 是专门为角色扮演调过的模型（32k 上下文，不支持工具调用），写故事时可以试试。',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    hint: '开放平台',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5.3', label: 'GLM-5.3 · 旗舰' },
      { id: 'glm-5.3-flash', label: 'GLM-5.3 Flash · 多模态，价格低' },
      { id: 'glm-5.3-flashx', label: 'GLM-5.3 FlashX · 更快' },
    ],
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
    contextLimit: 1_000_000,
    note: 'GLM-5.3 系列上下文 1M、最大输出 128K，思考模式常开。',
  },
  {
    id: 'moonshot',
    label: 'Kimi',
    hint: '月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-k3.1-pro', label: 'K3.1 Pro · 旗舰，原生视觉' },
      { id: 'kimi-k3.1-pro-highspeed', label: 'K3.1 Pro 高速版' },
      { id: 'kimi-k3', label: 'K3 · 长程推理' },
    ],
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    docsUrl: 'https://platform.moonshot.cn/docs/api/chat',
    contextLimit: 1_048_576,
    note: 'K2 系列（kimi-k2-…）已停止向新用户开放、并于 2026 年底下线，这里只保留 K3 系列。',
  },
  {
    id: 'qianfan',
    label: '文心一言',
    hint: '百度千帆',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    models: [
      { id: 'ernie-5.1', label: 'ERNIE 5.1 · 旗舰' },
      { id: 'ernie-5.0', label: 'ERNIE 5.0 · 全模态' },
      { id: 'ernie-x1.1', label: 'ERNIE X1.1 · 深度思考' },
      { id: 'ernie-4.5-turbo-128k', label: 'ERNIE 4.5 Turbo · 长上下文' },
    ],
    keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list',
    docsUrl: 'https://cloud.baidu.com/doc/qianfan-api/index.html',
    contextLimit: 131_072,
    note: '千帆 v2 使用「API Key（bce-v3/…）」，不是旧版 AK/SK；该平台未提供公开的模型列表接口。',
  },
  {
    id: 'hunyuan',
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: [
      { id: 'hunyuan-a13b', label: '混元 A13B · 混合推理' },
      { id: 'hunyuan-role-latest', label: '混元 Role · 角色扮演专用' },
      { id: 'hunyuan-turbos-latest', label: '混元 TurboS · 快速' },
    ],
    keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
    docsUrl: 'https://cloud.tencent.com/document/product/1729',
    contextLimit: 131_072,
    note: '混元正在向 TokenHub 迁移，老接口的长期可用性请以腾讯公告为准。hunyuan-role-latest 是角色扮演专用模型（28k 上下文）。',
  },
  {
    id: 'ark',
    label: '豆包',
    hint: '火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'doubao-seed-evolving', label: 'Seed Evolving · 滚动升级旗舰' },
      { id: 'doubao-seed-2-1-pro-260915', label: 'Seed 2.1 Pro' },
      { id: 'doubao-seed-2-1-lite-260915', label: 'Seed 2.1 Lite · 低价' },
      { id: 'doubao-seed-character-260628', label: 'Seed Character · 角色扮演专用' },
    ],
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    docsUrl: 'https://www.volcengine.com/docs/82379',
    contextLimit: 1_048_576,
    note: '模型一栏既可以填模型 ID，也可以填方舟里创建的推理接入点（ep-…）。方舟没有公开的模型列表接口。',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    hint: '聚合多种开源模型',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      { id: 'deepseek-ai/DeepSeek-V4-Pro', label: 'DeepSeek V4 Pro' },
      { id: 'deepseek-ai/DeepSeek-V4.1-Flash', label: 'DeepSeek V4.1 Flash · 多模态' },
      { id: 'zai-org/GLM-5.3', label: 'GLM-5.3' },
      { id: 'Qwen/Qwen3.6-27B', label: 'Qwen3.6 27B' },
    ],
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    docsUrl: 'https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions',
    contextLimit: 1_048_576,
    note: '模型很多，点「获取最新模型」拉全量列表再搜索最快。',
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
 *
 * It also migrates model ids the provider has retired since. Someone coming from
 * 1.6.x has `deepseek-chat` saved, and DeepSeek rejects it since 2026-07-24 with
 * a bare 400 that reads like a broken key.
 */
const RETIRED_MODELS: Record<string, string> = {
  'deepseek-chat': 'deepseek-flash',
  'deepseek-reasoner': 'deepseek-flash',
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
};

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
  const model = typeof raw.model === 'string' ? raw.model : '';
  const migrated = RETIRED_MODELS[model.trim().toLowerCase()];
  return { ...raw, provider, apiKeys, model: migrated ?? raw.model };
}

/** Rewrites a model id the provider has retired (used when a chat fails on it). */
export function replaceRetiredModel(settings: Settings): Settings {
  const replacement = RETIRED_MODELS[settings.model?.trim().toLowerCase() ?? ''];
  if (!replacement) return settings;
  return { ...settings, model: replacement };
}
