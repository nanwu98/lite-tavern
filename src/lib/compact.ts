import type { ApiMessage } from './prompt';
import { buildPrompt, usableMessages } from './prompt';
import type { Character, Chat, ChatMessage, Settings, WorldBook } from '../types';
import { streamChat } from './api';
import { useStore } from '../store';
import { estimateTokens } from './tokens';

/**
 * Context compaction.
 *
 * Strategy (same idea as SillyTavern's memory/summarize extension and the
 * "compact" step used by coding agents): when the prompt approaches the model
 * window, the oldest part of the transcript is summarized by the model into a
 * rolling memory block, and only that memory plus the recent messages are sent
 * from then on. The summary is incremental: a later compaction merges the
 * previous summary with the newly aged-out messages, so nothing is lost when a
 * long chat is compacted several times.
 */

/** Messages kept verbatim after a compaction. */
export const COMPACT_KEEP_RECENT = 8;

/** Fraction of the context window that triggers automatic compaction. */
export const AUTO_COMPACT_RATIO = 0.8;

export const COMPACT_SYSTEM_PROMPT = `你是角色扮演对话的「记忆压缩器」。请把给出的对话压缩成一份可以直接交给角色继续扮演的长期记忆。

要求：
1. 只输出记忆正文。不要任何开场白、解释、代码块、标题层级或元评论。
2. 用第三人称、条列式短句书写，分成四段小标题：【已发生的事件】【人物与关系】【物品・地点・状态】【约定与伏笔】。
3. 必须保留：角色与用户的称呼、身份设定、已经发生的关键事件及其先后顺序、时间推进、地点、物品、承诺与约定、未解决的冲突、重要的情绪转折。
4. 舍弃：环境铺陈、重复的描写、寒暄、可以被推断的细节、纯心理活动的细枝末节。
5. 如果给出了「已有记忆」，请把它和新增对话合并成一份新的记忆：旧事实不能丢，新事实按顺序补充，不要重复叙述同一件事。
6. 全文控制在 {{words}} 字以内，宁可精炼也不要写成流水账。`;

export interface CompactionPlan {
  /** Index in the usable-message list where the summarized range starts. */
  from: number;
  /** Index (exclusive) where the verbatim tail starts. */
  to: number;
  count: number;
}

/**
 * Decides which messages can be folded into the summary.
 * At least two messages must age out, otherwise compaction cannot save space.
 */
export function planCompaction(
  usableCount: number,
  covered: number,
  keepRecent = COMPACT_KEEP_RECENT,
): CompactionPlan | null {
  const from = Math.min(Math.max(0, covered), usableCount);
  const to = Math.max(0, usableCount - Math.max(1, keepRecent));
  if (to - from < 2) return null;
  return { from, to, count: to - from };
}

/** Splits messages into chunks that fit the summarizer's own context. */
export function chunkMessages(messages: ChatMessage[], budget: number): ChatMessage[][] {
  const chunks: ChatMessage[][] = [];
  let current: ChatMessage[] = [];
  let used = 0;
  const safeBudget = Math.max(500, budget);
  for (const message of messages) {
    const size = estimateTokens(message.content) + 8;
    if (current.length > 0 && used + size > safeBudget) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(message);
    used += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function renderTranscript(
  messages: ChatMessage[],
  character: Character,
  settings: Settings,
): string {
  const userName = settings.userName.trim() || '旅人';
  return messages
    .map(
      (message) =>
        `${message.role === 'user' ? userName : character.name}：${message.content.trim()}`,
    )
    .join('\n\n');
}

export function summaryWordTarget(transcript: string): number {
  // Roughly an eighth of the source, clamped so short chats stay cheap and long
  // ones do not explode the summary itself.
  return Math.min(1200, Math.max(260, Math.round(transcript.length / 8)));
}

export function buildSummaryMessages(previousSummary: string, transcript: string): ApiMessage[] {
  const words = summaryWordTarget(transcript);
  const system = COMPACT_SYSTEM_PROMPT.replace('{{words}}', String(words));
  const body = previousSummary.trim()
    ? `【已有记忆】\n${previousSummary.trim()}\n\n【需要合并的新增对话】\n${transcript}`
    : `【需要压缩的对话】\n${transcript}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: body },
  ];
}

export interface CompactResult {
  summary: string;
  /** Usable messages now covered by the summary. */
  coveredMessages: number;
  compactedMessages: number;
  beforeTokens: number;
  afterTokens: number;
  savedTokens: number;
}

export interface CompactOptions {
  settings?: Settings;
  character?: Character;
  signal?: AbortSignal;
  keepRecent?: number;
  /** Called after each summarizer round, for progress feedback. */
  onProgress?: (done: number, total: number) => void;
}

function totalTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
}

/**
 * Summarizes the oldest messages of a chat into `chat.compaction`.
 * Throws a user-facing `Error` when there is nothing to compress.
 */
export async function compactChat(
  chatId: string,
  options: CompactOptions = {},
): Promise<CompactResult> {
  const state = useStore.getState();
  const chat = state.chats.find((c) => c.id === chatId);
  if (!chat) throw new Error('对话不存在，无法压缩。');
  const character = options.character ?? state.characters.find((c) => c.id === chat.characterId);
  if (!character) throw new Error('角色卡不存在，无法压缩。');
  const settings = options.settings ?? state.settings;
  if (!settings.apiKey.trim()) throw new Error('压缩需要调用模型：请先在设置里填写 API Key。');

  const usable = usableMessages(chat.messages);
  const previous = chat.compaction;
  const covered = Math.min(previous?.throughIndex ?? 0, usable.length);
  const plan = planCompaction(usable.length, covered, options.keepRecent ?? COMPACT_KEEP_RECENT);
  if (!plan) {
    throw new Error('还没有足够旧的对话可以压缩：先多聊几句，或把「携带历史消息」调小一些。');
  }

  const target = usable.slice(plan.from, plan.to);
  const tail = usable.slice(plan.to);
  const beforeTokens = totalTokens(usable);
  const chunkBudget = Math.round(Math.min(16_000, Math.max(2_500, settings.contextLimit * 0.12)));
  const chunks = chunkMessages(target, chunkBudget);

  let summary = previous?.summary?.trim() ?? '';
  for (let index = 0; index < chunks.length; index++) {
    const transcript = renderTranscript(chunks[index], character, settings);
    const messages = buildSummaryMessages(summary, transcript);
    const text = await streamChat({
      settings: { ...settings, stream: false, temperature: 0.3, maxTokens: 1500 },
      messages,
      signal: options.signal,
    });
    const clean = text.trim();
    if (!clean) throw new Error('模型没有返回摘要内容，请重试。');
    summary = clean;
    options.onProgress?.(index + 1, chunks.length);
  }

  const afterTokens = estimateTokens(summary) + totalTokens(tail);
  const savedTokens = Math.max(0, beforeTokens - afterTokens);
  const compaction = {
    summary,
    throughIndex: plan.to,
    updatedAt: Date.now(),
    savedTokens,
  };
  useStore.getState().setCompaction(chatId, compaction);
  return {
    summary,
    coveredMessages: plan.to,
    compactedMessages: plan.count,
    beforeTokens,
    afterTokens,
    savedTokens,
  };
}

/** Whether `compactChat` would have anything to do right now. */
export function canCompact(chat: Chat, keepRecent = COMPACT_KEEP_RECENT): boolean {
  const usable = usableMessages(chat.messages);
  return planCompaction(usable.length, chat.compaction?.throughIndex ?? 0, keepRecent) !== null;
}

export interface ContextUsage {
  /** Estimated tokens of the next request. */
  tokens: number;
  limit: number;
  ratio: number;
}

/** Estimated size of the prompt that would be sent right now. */
export function contextUsage(
  character: Character,
  books: WorldBook[],
  chat: Chat,
  settings: Settings,
): ContextUsage {
  const limit = Math.max(1000, Math.round(settings.contextLimit) || 65536);
  const prompt = buildPrompt(character, books, chat.messages, settings, chat.compaction);
  return { tokens: prompt.tokens, limit, ratio: prompt.tokens / limit };
}
