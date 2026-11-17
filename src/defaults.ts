import type { Settings } from './types';

/** First-run defaults: the DeepSeek preset, empty keys, no card scripts state loss. */
export const DEFAULT_SETTINGS: Settings = {
  provider: 'deepseek',
  apiKey: '',
  apiKeys: {},
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 1.1,
  maxTokens: 2048,
  userName: '旅人',
  userPersona: '',
  contextMessages: 40,
  contextLimit: 65536,
  autoCompact: true,
  loreBudget: 16000,
  stream: true,
  enterToSend: true,
  cardScripts: true,
  theme: 'system',
  bossKeyEnabled: false,
  bossKey: 'CommandOrControl+Shift+H',
};
