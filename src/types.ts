export type WorldBookSource = 'embedded' | 'imported' | 'auto' | 'manual';

export interface WorldBookEntry {
  id: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  comment: string;
  constant: boolean;
  selective: boolean;
  selectiveLogic: number;
  order: number;
  position: number;
  depth: number;
  role: number;
  disable: boolean;
  probability: number;
  useProbability: boolean;
  caseSensitive: boolean;
  matchWholeWords: boolean;
  scanDepth: number;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  sticky: number;
  cooldown: number;
  group: string;
  groupWeight: number;
  matchCharacterDescription: boolean;
  matchCharacterPersonality: boolean;
  matchScenario: boolean;
  matchPersonaDescription: boolean;
}

export interface WorldBook {
  id: string;
  name: string;
  fileName?: string;
  source: WorldBookSource;
  entries: WorldBookEntry[];
  createdAt: number;
}

import type { CardCode } from './lib/tavern/types';

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  mesExample: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  alternateGreetings: string[];
  avatar?: string;
  tags: string[];
  creator: string;
  characterVersion: string;
  worldBookIds: string[];
  /** Free-form note shown in the card list (not sent to the model). */
  notes?: string;
  /** World book name referenced by data.extensions.world / world, used for auto-binding. */
  worldName?: string;
  sourceFileName?: string;
  /** Executable content shipped inside the card (Tavern Helper scripts + regex). */
  code?: CardCode;
  createdAt: number;
  updatedAt: number;
}

/** Fields the in-app card editor can create or update. */
export interface CharacterDraft {
  name: string;
  notes?: string;
  avatar?: string;
  systemPrompt?: string;
  firstMes?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  mesExample?: string;
  postHistoryInstructions?: string;
  alternateGreetings?: string[];
  tags?: string[];
  creator?: string;
  characterVersion?: string;
  worldName?: string;
  sourceFileName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  greeting?: boolean;
  status?: 'streaming' | 'error' | 'stopped';
  /** Why the request failed; `context` gets the one-click compaction button. */
  errorKind?: 'context' | 'other';
  loreTitles?: string[];
  /** All variants of this message (酒馆的 swipe)；content === swipes[swipeId]. */
  swipes?: string[];
  swipeId?: number;
  /** True once the user edited the active variant by hand. */
  edited?: boolean;
}

/**
 * A rolling summary of the oldest messages (上下文压缩 / 长期记忆).
 * `throughIndex` counts usable messages folded into the summary, so the prompt
 * only sends `messages.slice(throughIndex)` plus the summary itself.
 */
export interface ChatCompaction {
  summary: string;
  throughIndex: number;
  updatedAt: number;
  /** Estimated tokens saved by this compaction (old text − summary). */
  savedTokens?: number;
}

export interface Chat {
  id: string;
  characterId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** Present once the chat has been compacted at least once. */
  compaction?: ChatCompaction;
}

export type ThemeMode = 'system' | 'dark' | 'light';

export interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  userName: string;
  userPersona: string;
  contextMessages: number;
  /** Model context window in tokens; used by the 80% auto-compact trigger. */
  contextLimit: number;
  /** Summarize old history to a memory when the context window fills up. */
  autoCompact: boolean;
  loreBudget: number;
  stream: boolean;
  enterToSend: boolean;
  /** Runs HTML/JS shipped inside character cards (Tavern Helper scripts + pages). */
  cardScripts: boolean;
  /** Dark / light / follow the operating system. */
  theme: ThemeMode;
  /** Desktop only: global shortcut that hides or restores the window. */
  bossKeyEnabled: boolean;
  bossKey: string;
}

export interface ImportedCard {
  character: Omit<Character, 'createdAt' | 'updatedAt'>;
  books: Array<Pick<WorldBook, 'name' | 'entries' | 'source' | 'fileName'>>;
}
