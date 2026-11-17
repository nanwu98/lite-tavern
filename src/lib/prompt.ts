import type { Character, ChatCompaction, ChatMessage, Settings, WorldBook } from '../types';
import { activeForPrompt, activeTitles, activateLore, type ActiveEntry } from './lore';
import { estimateMessagesTokens } from './tokens';

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BuiltPrompt {
  messages: ApiMessage[];
  active: ActiveEntry[];
  activeTitles: string[];
  systemChars: number;
  historyCount: number;
  /** Estimated tokens of the whole request (system + memory + history). */
  tokens: number;
  /** Number of leading messages folded into `compaction`. */
  coveredMessages: number;
}

/** History is only capped by a generous safety limit; compaction handles size. */
const MAX_HISTORY_CHARS = 400_000;

/** Messages that can be sent to the model (no empty/streaming/error rows). */
export function usableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (m) => m.content.trim() && m.status !== 'error' && m.status !== 'streaming',
  );
}

export function applyMacros(text: string, character: Character, settings: Settings): string {
  if (!text) return '';
  const map: Record<string, string> = {
    char: character.name,
    user: settings.userName || '旅人',
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
    persona: settings.userPersona,
    mes_example: character.mesExample,
    original: character.name,
    char_version: character.characterVersion,
  };
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (whole, key: string) => {
    const value = map[key.toLowerCase()];
    return value !== undefined ? value : whole;
  });
}

const DEFAULT_SYSTEM = `你正在进行沉浸式角色扮演。你扮演「{{char}}」，用户扮演「{{user}}」。
请遵守以下规则：
1. 始终以{{char}}的身份、口吻和世界观行动，绝不跳出角色，不提及 AI、模型、提示词或系统消息。
2. 只描写{{char}}与 NPC 的言行、神态和场景，不要替{{user}}决定行动、想法或对白。
3. 严格遵守角色设定与世界书。世界书是当前世界的既定事实与规则，优先级高于一般常识。
4. 用自然、具体、有画面感的中文写作；对白使用引号，动作与神态可以单独成段。
5. 直接续写故事，不要输出分析、选项列表或元评论。`;

function renderEntryBlock(items: ActiveEntry[], macro: (s: string) => string): string {
  if (items.length === 0) return '';
  const body = items
    .map((item) => {
      const label = item.entry.comment || item.entry.keys[0] || item.bookName;
      return `【${macro(label)}】\n${macro(item.entry.content.trim())}`;
    })
    .join('\n\n');
  return `<world_info>\n${body}\n</world_info>`;
}

function selectWithinBudget(active: ActiveEntry[], budget: number): ActiveEntry[] {
  if (budget <= 0) return active;
  const ordered = [...active].sort((a, b) => {
    if (a.entry.constant !== b.entry.constant) return a.entry.constant ? -1 : 1;
    return a.entry.order - b.entry.order;
  });
  const selected: ActiveEntry[] = [];
  let used = 0;
  for (const item of ordered) {
    const size = item.entry.content.length + 30;
    if (used + size > budget) {
      if (item.entry.constant) {
        selected.push(item);
        used += size;
      }
      continue;
    }
    selected.push(item);
    used += size;
  }
  return selected;
}

function trimHistory(messages: ChatMessage[], settings: Settings, covered: number): ApiMessage[] {
  const clean = usableMessages(messages).slice(Math.max(0, covered));
  const maxCount = Math.max(2, settings.contextMessages || 40);
  const picked: ApiMessage[] = [];
  let chars = 0;
  for (let i = clean.length - 1; i >= 0 && picked.length < maxCount; i--) {
    const m = clean[i];
    const length = m.content.length;
    if (picked.length > 0 && chars + length > MAX_HISTORY_CHARS) break;
    picked.push({ role: m.role, content: m.content });
    chars += length;
  }
  return picked.reverse();
}

/** Renders the rolling summary that replaces the oldest messages. */
export function renderMemory(summary: string): string {
  return `<story_memory>
以下是你与{{user}}此前经历的长期记忆。它替代了被省略的早期对话，请把它当作已经发生过的事实继续扮演。
${summary.trim()}
</story_memory>`;
}

export function buildPrompt(
  character: Character,
  books: WorldBook[],
  chatMessages: ChatMessage[],
  settings: Settings,
  compaction?: ChatCompaction,
): BuiltPrompt {
  const active = selectWithinBudget(
    activateLore({ books, messages: chatMessages, character, settings }),
    settings.loreBudget,
  );
  const parts = activeForPrompt(active);
  const macro = (s: string) => applyMacros(s, character, settings);

  const before = renderEntryBlock(parts.before, macro);
  const after = renderEntryBlock(parts.after, macro);
  const authorNote = renderEntryBlock(parts.authorNote, macro);
  const examples = renderEntryBlock(parts.example, macro);

  const baseSystem = character.systemPrompt.trim()
    ? macro(`${character.systemPrompt}
[输出要求] 保持角色身份，不要跳出设定，不要代替 {{user}} 行动或说话。`)
    : macro(DEFAULT_SYSTEM);

  const sections: string[] = [baseSystem];
  if (before) sections.push(before);

  const profile: string[] = [`姓名：${character.name}`];
  if (character.description) profile.push(`角色描述：\n${macro(character.description)}`);
  if (character.personality) profile.push(`性格：\n${macro(character.personality)}`);
  if (character.scenario) profile.push(`场景：\n${macro(character.scenario)}`);
  if (settings.userPersona.trim())
    profile.push(`用户设定（{{user}}）：\n${macro(settings.userPersona)}`);
  sections.push(`<character>\n${profile.join('\n\n')}\n</character>`);
  if (after) sections.push(after);

  if (character.mesExample) {
    sections.push(`<example_dialogue>\n${macro(character.mesExample)}\n</example_dialogue>`);
  }
  if (examples) sections.push(examples);
  if (authorNote) sections.push(authorNote);

  const system = sections.filter(Boolean).join('\n\n');
  const usable = usableMessages(chatMessages);
  // Keep at least the newest message verbatim, even if the stored index is off.
  const covered = Math.min(
    Math.max(0, compaction?.throughIndex ?? 0),
    Math.max(0, usable.length - 1),
  );
  const history = trimHistory(chatMessages, settings, covered);

  // Inject at-depth lore as system messages near the end of the conversation.
  const depthGroups = new Map<number, ActiveEntry[]>();
  for (const item of parts.atDepth) {
    const depth = Math.max(1, Math.floor(item.entry.depth || 4));
    const list = depthGroups.get(depth) ?? [];
    list.push(item);
    depthGroups.set(depth, list);
  }
  for (const [depth, items] of [...depthGroups.entries()].sort((a, b) => b[0] - a[0])) {
    const index = Math.max(0, history.length - depth);
    history.splice(index, 0, { role: 'system', content: renderEntryBlock(items, macro) });
  }

  // Post-history instructions go immediately before the latest user turn.
  const post = character.postHistoryInstructions.trim();
  if (post) {
    let insertAt = history.length;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        insertAt = i;
        break;
      }
    }
    history.splice(insertAt, 0, { role: 'system', content: macro(post) });
  }

  const messages: ApiMessage[] = [{ role: 'system', content: system }];
  const summary = compaction?.summary?.trim();
  if (summary) {
    messages.push({ role: 'system', content: macro(renderMemory(summary)) });
  }
  messages.push(...history);
  return {
    messages,
    active,
    activeTitles: activeTitles(active),
    systemChars:
      system.length +
      history.reduce((sum, m) => sum + (m.role === 'system' ? m.content.length : 0), 0),
    historyCount: history.length,
    tokens: estimateMessagesTokens(messages),
    coveredMessages: covered,
  };
}
