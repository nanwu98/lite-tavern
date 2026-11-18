import type { Chat } from '../types';

/**
 * Conversation ordering shared by the list, the fallback after a delete and
 * the tests.
 *
 * - pinned chats always come first, newest pin first;
 * - the rest sort by real activity (`updatedAt`), newest first;
 * - archived chats never appear in the main list and only exist in the
 *   "查看归档" section, newest archive first.
 */
export function isArchived(chat: Chat): boolean {
  return typeof chat.archivedAt === 'number' && chat.archivedAt > 0;
}

export function isPinned(chat: Chat): boolean {
  return !isArchived(chat) && typeof chat.pinnedAt === 'number' && chat.pinnedAt > 0;
}

/** Visible chats: pinned group first, then the normal activity order. */
export function sortVisibleChats(chats: readonly Chat[]): Chat[] {
  const pinned = chats
    .filter(isPinned)
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || b.updatedAt - a.updatedAt);
  const normal = chats
    .filter((chat) => !isArchived(chat) && !isPinned(chat))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return [...pinned, ...normal];
}

/** Archived chats, newest archive first. */
export function sortArchivedChats(chats: readonly Chat[]): Chat[] {
  return chats
    .filter(isArchived)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0) || b.updatedAt - a.updatedAt);
}

/** Newest visible chat, optionally for one character. Used for safe fallbacks. */
export function latestVisibleChat(chats: readonly Chat[], characterId?: string): Chat | undefined {
  return chats
    .filter((chat) => !isArchived(chat))
    .filter((chat) => (characterId ? chat.characterId === characterId : true))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
