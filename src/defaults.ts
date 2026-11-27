import type { Settings } from './types';

/** First-run defaults: the DeepSeek preset, empty keys, no card scripts state loss. */
export const DEFAULT_SETTINGS: Settings = {
  provider: 'deepseek',
  apiKey: '',
  apiKeys: {},
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  temperature: 1.1,
  maxTokens: 2048,
  userName: '旅人',
  userAvatar: '',
  userPersona: '',
  contextMessages: 40,
  contextLimit: 1_000_000,
  autoCompact: true,
  loreBudget: 16000,
  stream: true,
  thinking: false,
  enterToSend: true,
  cardScripts: true,
  theme: 'system',
  bossKeyEnabled: false,
  bossKey: 'CommandOrControl+Shift+H',
};
