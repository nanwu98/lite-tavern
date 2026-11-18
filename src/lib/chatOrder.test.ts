import { describe, expect, it } from 'vitest';
import type { Chat } from '../types';
import {
  isArchived,
  isPinned,
  latestVisibleChat,
  sortArchivedChats,
  sortVisibleChats,
} from './chatOrder';

function chat(id: string, updatedAt: number, extra: Partial<Chat> = {}): Chat {
  return {
    id,
    characterId: 'c1',
    title: id,
    messages: [],
    createdAt: 1,
    updatedAt,
    ...extra,
  };
}

describe('chat ordering', () => {
  it('puts pinned chats first, newest pin first, then the rest by activity', () => {
    const chats = [
      chat('old', 10),
      chat('new', 30),
      chat('pinned-old', 1, { pinnedAt: 100 }),
      chat('pinned-new', 2, { pinnedAt: 200 }),
      chat('middle', 20),
    ];
    expect(sortVisibleChats(chats).map((item) => item.id)).toEqual([
      'pinned-new',
      'pinned-old',
      'new',
      'middle',
      'old',
    ]);
  });

  it('hides archived chats from the visible order and lists them instead', () => {
    const chats = [
      chat('live', 30),
      chat('archived-old', 20, { archivedAt: 100 }),
      chat('archived-new', 10, { archivedAt: 200 }),
      chat('pinned-and-archived', 40, { pinnedAt: 50, archivedAt: 300 }),
    ];
    expect(sortVisibleChats(chats).map((item) => item.id)).toEqual(['live']);
    expect(sortArchivedChats(chats).map((item) => item.id)).toEqual([
      'pinned-and-archived',
      'archived-new',
      'archived-old',
    ]);
    expect(chats.filter(isArchived)).toHaveLength(3);
    expect(chats.filter(isPinned)).toHaveLength(0);
  });

  it('never falls back to an archived chat', () => {
    const chats = [
      chat('archived', 100, { archivedAt: 1 }),
      chat('other-character', 90, { characterId: 'c2' }),
      chat('visible', 80),
    ];
    expect(latestVisibleChat(chats)?.id).toBe('other-character');
    expect(latestVisibleChat(chats, 'c1')?.id).toBe('visible');
    expect(latestVisibleChat([chat('archived', 1, { archivedAt: 2 })])).toBeUndefined();
  });

  it('treats a zero timestamp as not pinned or archived', () => {
    const item = chat('zero', 5, { pinnedAt: 0, archivedAt: 0 });
    expect(isPinned(item)).toBe(false);
    expect(isArchived(item)).toBe(false);
    expect(sortVisibleChats([item]).map((entry) => entry.id)).toEqual(['zero']);
  });
});
