import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaults';
import type { Character, ChatMessage, WorldBook } from '../types';
import { activateLore } from './lore';
import { normalizeEntryArray } from './worldbook';

const character: Character = {
  id: 'char-1',
  name: '阿绫',
  description: '守夜人',
  personality: '温柔',
  scenario: '旧城',
  firstMes: '你好',
  mesExample: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  alternateGreetings: [],
  tags: [],
  creator: '',
  characterVersion: '',
  worldBookIds: [],
  createdAt: 0,
  updatedAt: 0,
};

function bookOf(entries: unknown[], name = '测试书'): WorldBook {
  return {
    id: `book-${name}`,
    name,
    source: 'embedded',
    entries: normalizeEntryArray({ entries }),
    createdAt: 0,
  };
}

function msg(role: ChatMessage['role'], content: string): ChatMessage {
  return { id: `${role}-${Math.random()}`, role, content, createdAt: 0 };
}

describe('world book activation', () => {
  it('always activates constant entries and keyword entries', () => {
    const book = bookOf([
      { keys: [], content: '常驻世界', comment: '核心', constant: true },
      { keys: ['钟楼'], content: '钟楼档案室', comment: '钟楼' },
      { keys: ['码头'], content: '码头', comment: '码头' },
    ]);
    const active = activateLore({
      books: [book],
      messages: [msg('assistant', '晚上好。'), msg('user', '带我去钟楼。')],
      character,
      settings: DEFAULT_SETTINGS,
    });
    expect(active.map((a) => a.entry.comment)).toEqual(['核心', '钟楼']);
  });

  it('honours secondary-key AND logic', () => {
    const book = bookOf([
      {
        keys: ['钥匙'],
        keysecondary: ['档案室', '钟楼'],
        selective: true,
        selectiveLogic: 0,
        content: '钥匙内容',
        comment: '钥匙',
      },
    ]);
    const hit = activateLore({
      books: [book],
      messages: [msg('user', '钥匙在钟楼里吗？')],
      character,
      settings: DEFAULT_SETTINGS,
    });
    expect(hit).toHaveLength(1);
    const miss = activateLore({
      books: [book],
      messages: [msg('user', '钥匙在口袋里。')],
      character,
      settings: DEFAULT_SETTINGS,
    });
    expect(miss).toHaveLength(0);
  });

  it('only scans the entry scanDepth', () => {
    const book = bookOf([{ keys: ['钟楼'], content: '钟楼', comment: '钟楼', scanDepth: 1 }]);
    const active = activateLore({
      books: [book],
      messages: [msg('user', '去钟楼'), msg('assistant', '好啊。')],
      character,
      settings: DEFAULT_SETTINGS,
    });
    expect(active).toHaveLength(0);
  });

  it('recursively activates entries mentioned inside active lore', () => {
    const book = bookOf([
      { keys: ['钟楼'], content: '钟楼下方有一条地道。', comment: '钟楼' },
      { keys: ['地道'], content: '地道通向海边。', comment: '地道' },
    ]);
    const active = activateLore({
      books: [book],
      messages: [msg('user', '钟楼怎么走？')],
      character,
      settings: DEFAULT_SETTINGS,
    });
    expect(active.map((a) => a.entry.comment).sort()).toEqual(['地道', '钟楼']);
  });

  it('supports regex, case sensitivity and whole words', () => {
    const book = bookOf([
      { keys: ['/钟.*楼/'], content: '正则命中', comment: '正则' },
      { keys: ['Abyss'], content: '区分大小写', comment: '大小写', caseSensitive: true },
      { keys: ['cat'], content: '整词', comment: '整词', matchWholeWords: true },
    ]);
    const active = activateLore({
      books: [book],
      messages: [msg('user', '钟楼 abyss concatenate')],
      character,
      settings: DEFAULT_SETTINGS,
    });
    expect(active.map((a) => a.entry.comment)).toEqual(['正则']);
  });

  it('skips entries with probability 0', () => {
    const book = bookOf([
      {
        keys: ['钟楼'],
        content: '低概率',
        comment: '低概率',
        probability: 0,
        useProbability: true,
      },
    ]);
    const active = activateLore({
      books: [book],
      messages: [msg('user', '钟楼')],
      character,
      settings: DEFAULT_SETTINGS,
    });
    expect(active).toHaveLength(0);
  });
});
