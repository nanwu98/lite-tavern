import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  backupFileName,
  buildBackup,
  mergeBackup,
  parseBackup,
  statsSummary,
  type BackupPayload,
} from './backup';
import type { Character, Chat, WorldBook } from '../types';

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    name: '临渊',
    description: '',
    personality: '',
    scenario: '',
    firstMes: '「跟紧我。」',
    mesExample: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    alternateGreetings: [],
    tags: [],
    creator: '',
    characterVersion: '',
    worldBookIds: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function book(id: string, name: string): WorldBook {
  return { id, name, source: 'manual', entries: [], createdAt: 1000 };
}

function chat(id: string, characterId: string, overrides: Partial<Chat> = {}): Chat {
  return {
    id,
    characterId,
    title: '对话',
    messages: [{ id: 'm1', role: 'assistant', content: '开场', createdAt: 1000 }],
    createdAt: 2000,
    updatedAt: 2000,
    ...overrides,
  };
}

function payload(overrides: Partial<BackupPayload> = {}): BackupPayload {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: 5000,
    characters: [],
    worldBooks: [],
    chats: [],
    ...overrides,
  };
}

describe('backup selection', () => {
  const cards = [
    character({ id: 'c1', worldBookIds: ['b1'] }),
    character({ id: 'c2', name: '雾岚', worldBookIds: ['b2'] }),
  ];
  const books = [book('b1', '雾港设定集'), book('b2', '船只')];
  const chats = [chat('ch1', 'c1')];

  it('exports only cards and the books they use', () => {
    const result = buildBackup(
      { characters: cards, chats, worldBooks: books },
      { characters: true, chats: false },
      { now: 42 },
    );
    expect(result.characters.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(result.worldBooks.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(result.chats).toEqual([]);
    expect(result.exportedAt).toBe(42);
    expect(result.format).toBe(BACKUP_FORMAT);
  });

  it('drag-along cards for exported chats', () => {
    const result = buildBackup(
      { characters: cards, chats, worldBooks: books },
      { characters: false, chats: true },
      { now: 42 },
    );
    expect(result.chats.map((c) => c.id)).toEqual(['ch1']);
    expect(result.characters.map((c) => c.id)).toEqual(['c1']);
    expect(result.worldBooks.map((b) => b.id)).toEqual(['b1']);
  });

  it('can be empty when nothing is selected', () => {
    const result = buildBackup(
      { characters: cards, chats, worldBooks: books },
      { characters: false, chats: false },
    );
    expect(result.characters).toHaveLength(0);
    expect(result.chats).toHaveLength(0);
  });
});

describe('backup file name', () => {
  it('embeds the local date and time', () => {
    const name = backupFileName(new Date(2026, 10, 17, 10, 30, 5));
    expect(name).toBe('LiteTavern-backup-2026-11-17-1030.json');
  });
});

describe('backup parsing', () => {
  it('round-trips a generated payload', () => {
    const original = buildBackup(
      { characters: [character()], chats: [chat('ch1', 'c1')], worldBooks: [book('b1', '书')] },
      { characters: true, chats: true },
    );
    const parsed = parseBackup(JSON.stringify(original));
    expect(parsed.characters[0].name).toBe('临渊');
    expect(parsed.chats[0].characterId).toBe('c1');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(/JSON/);
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/不是轻语酒馆/);
    expect(() =>
      parseBackup(
        JSON.stringify({ format: BACKUP_FORMAT, version: 99, characters: [], chats: [] }),
      ),
    ).toThrow(/更新版本/);
    expect(() =>
      parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, characters: [], chats: [] })),
    ).toThrow(/没有角色卡/);
  });

  it('drops malformed entries and fills defaults', () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        characters: [{ name: '临渊' }, { name: '' }, 42, null],
        worldBooks: [{ name: '书', entries: [{ content: '设定' }, { content: '' }] }],
        chats: [
          {
            characterId: 'c1',
            messages: [
              { role: 'user', content: '你好' },
              { role: 'user', content: '' },
            ],
          },
        ],
      }),
    );
    expect(parsed.characters).toHaveLength(1);
    expect(parsed.characters[0].firstMes).toBe('');
    expect(parsed.worldBooks[0].entries).toHaveLength(1);
    expect(parsed.chats[0].messages).toHaveLength(1);
    expect(parsed.chats[0].messages[0].role).toBe('user');
  });
});

describe('merging a backup', () => {
  it('adds new data and reports the counts', () => {
    const current = { characters: [], chats: [], worldBooks: [] };
    const incoming = payload({
      characters: [character({ id: 'c1', worldBookIds: ['b1'] })],
      worldBooks: [book('b1', '雾港设定集')],
      chats: [chat('ch1', 'c1')],
    });
    const result = mergeBackup(current, incoming);
    expect(result.characters).toHaveLength(1);
    expect(result.worldBooks).toHaveLength(1);
    expect(result.chats).toHaveLength(1);
    expect(result.stats).toMatchObject({ charactersAdded: 1, booksAdded: 1, chatsAdded: 1 });
  });

  it('skips anything that is already there', () => {
    const current = {
      characters: [character({ id: 'c1', worldBookIds: ['b1'] })],
      chats: [chat('ch1', 'c1')],
      worldBooks: [book('b1', '雾港设定集')],
    };
    const result = mergeBackup(current, {
      ...payload(),
      characters: [character({ id: 'c1', worldBookIds: ['b1'] })],
      worldBooks: [book('b1', '雾港设定集')],
      chats: [chat('ch1', 'c1')],
    });
    expect(result.characters).toHaveLength(1);
    expect(result.chats).toHaveLength(1);
    expect(result.stats).toEqual({
      charactersAdded: 0,
      charactersSkipped: 1,
      booksAdded: 0,
      booksSkipped: 1,
      chatsAdded: 0,
      chatsSkipped: 1,
    });
  });

  it('remaps world books that already exist under another id', () => {
    const current = {
      characters: [],
      chats: [],
      worldBooks: [book('local-book', '雾港设定集')],
    };
    const result = mergeBackup(current, {
      ...payload(),
      characters: [character({ id: 'c1', worldBookIds: ['remote-book'] })],
      worldBooks: [book('remote-book', '雾港设定集')],
    });
    expect(result.worldBooks).toHaveLength(1);
    expect(result.characters[0].worldBookIds).toEqual(['local-book']);
  });

  it('does not add a chat whose card is missing', () => {
    const result = mergeBackup(
      { characters: [], chats: [], worldBooks: [] },
      { ...payload(), chats: [chat('ch1', 'ghost')] },
    );
    expect(result.chats).toHaveLength(0);
    expect(result.stats.chatsSkipped).toBe(1);
  });

  it('summarizes the result for the toast', () => {
    expect(
      statsSummary({
        charactersAdded: 2,
        charactersSkipped: 0,
        booksAdded: 1,
        booksSkipped: 0,
        chatsAdded: 3,
        chatsSkipped: 0,
      }),
    ).toBe('已导入 2 张角色卡、1 本世界书、3 段对话');
    expect(
      statsSummary({
        charactersAdded: 0,
        charactersSkipped: 1,
        booksAdded: 0,
        booksSkipped: 0,
        chatsAdded: 0,
        chatsSkipped: 0,
      }),
    ).toBe('没有新增内容（1 项已存在，已跳过）');
  });
});
