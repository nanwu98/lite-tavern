import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaults';
import { parseCardObject } from './card';
import { parseWorldBook } from './worldbook';
import { buildPrompt } from './prompt';
import type { ChatMessage } from '../types';

const cardJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/card.json'), 'utf8'),
);
const parsed = parseCardObject(cardJson);
const card = {
  ...parsed,
  character: { ...parsed.character, createdAt: 0, updatedAt: 0 },
};
const book = parseWorldBook(cardJson.data.character_book, '测试世界书', 'embedded');

function msg(role: ChatMessage['role'], content: string, id = String(Math.random())): ChatMessage {
  return { id, role, content, createdAt: 0 };
}

describe('prompt building', () => {
  it('injects constant and keyword lore, renders macros, and keeps at-depth lore near the end', () => {
    const messages = [
      msg('assistant', card.character.firstMes, 'greeting'),
      msg('user', '带我去钟楼，我想看看那把钥匙。', 'u1'),
    ];
    const prompt = buildPrompt(card.character, [book], messages, {
      ...DEFAULT_SETTINGS,
      userName: '旅人',
    });
    const system = prompt.messages[0].content;
    expect(system).toContain('海边的旧城');
    expect(system).toContain('钟楼地下有一间上锁的档案室');
    expect(system).toContain('阿绫');
    expect(system).not.toContain('{{char}}');
    expect(system).toContain('旅人');
    expect(prompt.activeTitles).toEqual(
      expect.arrayContaining(['世界核心', '钟楼与档案室', '黄铜钥匙']),
    );

    const lastUser = prompt.messages.map((m) => m.role).lastIndexOf('user');
    const depthIndex = prompt.messages.findIndex((m) => m.content.includes('黄铜钥匙'));
    expect(depthIndex).toBeGreaterThanOrEqual(0);
    expect(depthIndex).toBeLessThan(lastUser);
  });

  it('puts post-history instructions immediately before the latest user turn', () => {
    const character = { ...card.character, postHistoryInstructions: '记住：{{user}} 是客人。' };
    const messages = [msg('assistant', '开场', 'g'), msg('user', '你好', 'u1')];
    const prompt = buildPrompt(character, [], messages, DEFAULT_SETTINGS);
    const lastUser = prompt.messages.map((m) => m.role).lastIndexOf('user');
    const postIndex = prompt.messages.findIndex((m) => m.content.includes('是客人'));
    expect(postIndex).toBe(lastUser - 1);
    expect(prompt.messages[postIndex].content).toContain('旅人');
  });

  it('trims old history by contextMessages but keeps the latest user turn', () => {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 12; i++) {
      messages.push(msg('user', `问题 ${i}`, `u${i}`));
      messages.push(msg('assistant', `回答 ${i}`, `a${i}`));
    }
    const prompt = buildPrompt(card.character, [], messages, {
      ...DEFAULT_SETTINGS,
      contextMessages: 4,
    });
    expect(prompt.messages.filter((m) => m.role !== 'system')).toHaveLength(4);
    expect(prompt.messages.at(-2)).toMatchObject({ role: 'user', content: '问题 11' });
    expect(prompt.messages.at(-1)).toMatchObject({ role: 'assistant', content: '回答 11' });
  });

  it('uses the card system prompt when present', () => {
    const character = { ...card.character, systemPrompt: '你是{{char}}，只以{{char}}的身份说话。' };
    const prompt = buildPrompt(character, [], [], DEFAULT_SETTINGS);
    expect(prompt.messages[0].content).toContain('你是测试角色·阿绫');
    expect(prompt.messages[0].content).not.toContain('{{user}}');
  });

  it('renders macros inside world book content', () => {
    const macroBook = parseWorldBook(
      {
        entries: [
          { keys: ['钟楼'], content: '{{char}} 会在钟楼等 {{user}}。', comment: '{{char}} 的约定' },
        ],
      },
      '宏测试',
      'embedded',
    );
    const prompt = buildPrompt(card.character, [macroBook], [msg('user', '钟楼')], {
      ...DEFAULT_SETTINGS,
      userName: '旅人',
    });
    expect(prompt.messages[0].content).toContain('测试角色·阿绫 会在钟楼等 旅人');
    expect(prompt.messages[0].content).toContain('测试角色·阿绫 的约定');
  });
});
