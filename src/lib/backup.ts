import type {
  Character,
  Chat,
  ChatMessage,
  ChatOverrides,
  WorldBook,
  WorldBookEntry,
} from '../types';
import { normalizeOverrides } from './chatSettings';
import { uid } from './util';

/**
 * Backup / restore format shared by the Windows and Android builds.
 *
 * A backup is plain JSON so it can be moved between platforms (and inspected by
 * hand). It deliberately does not contain settings or the API key.
 */

export const BACKUP_FORMAT = 'lite-tavern-backup';
export const BACKUP_VERSION = 1;

export interface BackupSelection {
  /** Export every card (and the world books it uses). */
  characters: boolean;
  /** Export every conversation (and the cards they belong to). */
  chats: boolean;
}

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  appVersion?: string;
  characters: Character[];
  worldBooks: WorldBook[];
  chats: Chat[];
}

export interface BackupSource {
  characters: Character[];
  chats: Chat[];
  worldBooks: WorldBook[];
}

export interface ImportStats {
  charactersAdded: number;
  charactersSkipped: number;
  booksAdded: number;
  booksSkipped: number;
  chatsAdded: number;
  chatsSkipped: number;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Picks the cards / books / chats to export.
 * Chats always carry their cards and world books, otherwise a restored
 * conversation would have no title, avatar or lore.
 */
export function buildBackup(
  source: BackupSource,
  selection: BackupSelection,
  options: { appVersion?: string; now?: number } = {},
): BackupPayload {
  const characterIds = new Set<string>();
  const chatList: Chat[] = [];

  if (selection.characters) {
    for (const character of source.characters) characterIds.add(character.id);
  }
  if (selection.chats) {
    for (const chat of source.chats) {
      chatList.push(chat);
      characterIds.add(chat.characterId);
    }
  }

  const characters = source.characters.filter((character) => characterIds.has(character.id));
  const bookIds = new Set<string>();
  for (const character of characters) {
    for (const bookId of character.worldBookIds ?? []) bookIds.add(bookId);
  }
  const worldBooks = source.worldBooks.filter((book) => bookIds.has(book.id));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: options.now ?? Date.now(),
    appVersion: options.appVersion,
    characters,
    worldBooks,
    chats: chatList,
  };
}

/** `LiteTavern-backup-2026-11-17-1030.json` (local time). */
export function backupFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
  return `LiteTavern-backup-${stamp}.json`;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeEntry(raw: unknown): WorldBookEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  if (!asString(entry.content).trim()) return null;
  return {
    id: asString(entry.id) || uid(),
    keys: asStringArray(entry.keys),
    secondaryKeys: asStringArray(entry.secondaryKeys),
    content: asString(entry.content),
    comment: asString(entry.comment),
    constant: Boolean(entry.constant),
    selective: Boolean(entry.selective),
    selectiveLogic: Number(entry.selectiveLogic) || 0,
    order: Number(entry.order) || 0,
    position: Number(entry.position) || 0,
    depth: Number(entry.depth) || 4,
    role: Number(entry.role) || 0,
    disable: Boolean(entry.disable),
    probability: Number(entry.probability) || 100,
    useProbability: Boolean(entry.useProbability),
    caseSensitive: Boolean(entry.caseSensitive),
    matchWholeWords: Boolean(entry.matchWholeWords),
    scanDepth: Number(entry.scanDepth) || 0,
    excludeRecursion: Boolean(entry.excludeRecursion),
    preventRecursion: Boolean(entry.preventRecursion),
    sticky: Number(entry.sticky) || 0,
    cooldown: Number(entry.cooldown) || 0,
    group: asString(entry.group),
    groupWeight: Number(entry.groupWeight) || 100,
    matchCharacterDescription: Boolean(entry.matchCharacterDescription),
    matchCharacterPersonality: Boolean(entry.matchCharacterPersonality),
    matchScenario: Boolean(entry.matchScenario),
    matchPersonaDescription: Boolean(entry.matchPersonaDescription),
  };
}

function normalizeCharacter(raw: unknown): Character | null {
  if (!raw || typeof raw !== 'object') return null;
  const character = raw as Record<string, unknown>;
  const name = asString(character.name).trim();
  if (!name) return null;
  const now = Date.now();
  return {
    id: asString(character.id) || uid(),
    name,
    description: asString(character.description),
    personality: asString(character.personality),
    scenario: asString(character.scenario),
    firstMes: asString(character.firstMes),
    mesExample: asString(character.mesExample),
    systemPrompt: asString(character.systemPrompt),
    postHistoryInstructions: asString(character.postHistoryInstructions),
    alternateGreetings: asStringArray(character.alternateGreetings),
    avatar: typeof character.avatar === 'string' ? character.avatar : undefined,
    tags: asStringArray(character.tags),
    creator: asString(character.creator),
    characterVersion: asString(character.characterVersion),
    worldBookIds: asStringArray(character.worldBookIds),
    notes: asString(character.notes) || undefined,
    worldName: asString(character.worldName) || undefined,
    sourceFileName: asString(character.sourceFileName) || undefined,
    code:
      character.code && typeof character.code === 'object'
        ? (character.code as Character['code'])
        : undefined,
    createdAt: Number(character.createdAt) || now,
    updatedAt: Number(character.updatedAt) || now,
  };
}

function normalizeBook(raw: unknown): WorldBook | null {
  if (!raw || typeof raw !== 'object') return null;
  const book = raw as Record<string, unknown>;
  const name = asString(book.name).trim();
  if (!name) return null;
  const entries = Array.isArray(book.entries)
    ? book.entries.map(normalizeEntry).filter((entry): entry is WorldBookEntry => Boolean(entry))
    : [];
  return {
    id: asString(book.id) || uid(),
    name,
    fileName: asString(book.fileName) || undefined,
    source: (['embedded', 'imported', 'auto', 'manual'] as const).includes(book.source as never)
      ? (book.source as WorldBook['source'])
      : 'imported',
    entries,
    createdAt: Number(book.createdAt) || Date.now(),
  };
}

function normalizeMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  const role = message.role === 'user' ? 'user' : 'assistant';
  const content = asString(message.content);
  if (!content) return null;
  const swipes = asStringArray(message.swipes);
  return {
    id: asString(message.id) || uid(),
    role,
    content,
    createdAt: Number(message.createdAt) || Date.now(),
    greeting: Boolean(message.greeting),
    status: message.status === 'error' || message.status === 'stopped' ? message.status : undefined,
    errorKind:
      message.errorKind === 'context'
        ? 'context'
        : message.errorKind === 'other'
          ? 'other'
          : undefined,
    loreTitles: asStringArray(message.loreTitles),
    swipes: swipes.length ? swipes : undefined,
    swipeId: message.swipeId === undefined ? undefined : Number(message.swipeId) || 0,
    edited: Boolean(message.edited),
  };
}

function normalizeChat(raw: unknown): Chat | null {
  if (!raw || typeof raw !== 'object') return null;
  const chat = raw as Record<string, unknown>;
  const messages = Array.isArray(chat.messages)
    ? chat.messages
        .map(normalizeMessage)
        .filter((message): message is ChatMessage => Boolean(message))
    : [];
  const characterId = asString(chat.characterId);
  if (!characterId) return null;
  const compaction = chat.compaction as Record<string, unknown> | undefined;
  const overrides = normalizeOverrides(chat.overrides as ChatOverrides | undefined);
  const background = asString(chat.background);
  return {
    id: asString(chat.id) || uid(),
    characterId,
    title: asString(chat.title) || '对话',
    messages,
    createdAt: Number(chat.createdAt) || Date.now(),
    updatedAt: Number(chat.updatedAt) || Date.now(),
    overrides,
    // Only inline images are portable: an http URL would silently break on
    // another device (and is a privacy leak), so it is dropped on import.
    background: background.startsWith('data:image/') ? background : undefined,
    backgroundCard: chat.backgroundCard === true ? true : undefined,
    compaction:
      compaction && typeof compaction === 'object' && asString(compaction.summary).trim()
        ? {
            summary: asString(compaction.summary),
            throughIndex: Number(compaction.throughIndex) || 0,
            updatedAt: Number(compaction.updatedAt) || Date.now(),
            savedTokens: Number(compaction.savedTokens) || undefined,
          }
        : undefined,
  };
}

/** Validates a backup file; throws a user-facing error when it is not one. */
export function parseBackup(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('这个文件不是有效的 JSON，可能已损坏。');
  }
  if (!raw || typeof raw !== 'object') throw new Error('备份文件内容为空。');
  const payload = raw as Record<string, unknown>;
  if (payload.format !== BACKUP_FORMAT) {
    throw new Error('这不是轻语酒馆的备份文件。');
  }
  const version = Number(payload.version) || 0;
  if (version > BACKUP_VERSION) {
    throw new Error('备份来自更新版本的应用，请先升级后再导入。');
  }
  const characters = Array.isArray(payload.characters)
    ? payload.characters.map(normalizeCharacter).filter((item): item is Character => Boolean(item))
    : [];
  const worldBooks = Array.isArray(payload.worldBooks)
    ? payload.worldBooks.map(normalizeBook).filter((item): item is WorldBook => Boolean(item))
    : [];
  const chats = Array.isArray(payload.chats)
    ? payload.chats.map(normalizeChat).filter((item): item is Chat => Boolean(item))
    : [];
  if (!characters.length && !chats.length) {
    throw new Error('备份里没有角色卡或聊天记录。');
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Number(payload.exportedAt) || Date.now(),
    appVersion: asString(payload.appVersion) || undefined,
    characters,
    worldBooks,
    chats,
  };
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * Merges a backup into the current data.
 *
 * Existing ids win, so re-importing the same file is a no-op instead of a
 * duplicate. World-book references and chat ownership are remapped when a book
 * was already present under another id.
 */
export function mergeBackup(
  current: BackupSource,
  payload: BackupPayload,
): { characters: Character[]; chats: Chat[]; worldBooks: WorldBook[]; stats: ImportStats } {
  const stats: ImportStats = {
    charactersAdded: 0,
    charactersSkipped: 0,
    booksAdded: 0,
    booksSkipped: 0,
    chatsAdded: 0,
    chatsSkipped: 0,
  };
  const characters = [...current.characters];
  const chats = [...current.chats];
  const worldBooks = [...current.worldBooks];
  const characterIds = new Set(characters.map((c) => c.id));
  const chatIds = new Set(chats.map((c) => c.id));
  const bookIds = new Set(worldBooks.map((b) => b.id));
  const bookIdMap = new Map<string, string>();

  for (const book of payload.worldBooks) {
    const sameId = bookIds.has(book.id) ? worldBooks.find((b) => b.id === book.id) : undefined;
    if (sameId) {
      bookIdMap.set(book.id, sameId.id);
      stats.booksSkipped += 1;
      continue;
    }
    const sameNamed = worldBooks.find((b) => sameName(b.name, book.name));
    if (sameNamed) {
      bookIdMap.set(book.id, sameNamed.id);
      stats.booksSkipped += 1;
      continue;
    }
    worldBooks.push(book);
    bookIds.add(book.id);
    bookIdMap.set(book.id, book.id);
    stats.booksAdded += 1;
  }

  const characterIdMap = new Map<string, string>();
  for (const character of payload.characters) {
    if (characterIds.has(character.id)) {
      characterIdMap.set(character.id, character.id);
      stats.charactersSkipped += 1;
      continue;
    }
    const duplicate = characters.find(
      (c) => sameName(c.name, character.name) && c.createdAt === character.createdAt,
    );
    if (duplicate) {
      characterIdMap.set(character.id, duplicate.id);
      stats.charactersSkipped += 1;
      continue;
    }
    const next: Character = {
      ...character,
      worldBookIds: unique(
        (character.worldBookIds ?? [])
          .map((id) => bookIdMap.get(id) ?? id)
          .filter((id) => bookIds.has(id)),
      ),
    };
    characters.push(next);
    characterIds.add(next.id);
    characterIdMap.set(character.id, next.id);
    stats.charactersAdded += 1;
  }

  for (const chat of payload.chats) {
    if (chatIds.has(chat.id)) {
      stats.chatsSkipped += 1;
      continue;
    }
    const duplicate = chats.find(
      (c) =>
        c.characterId === chat.characterId &&
        c.createdAt === chat.createdAt &&
        c.title === chat.title,
    );
    if (duplicate) {
      stats.chatsSkipped += 1;
      continue;
    }
    const characterId = characterIdMap.get(chat.characterId) ?? chat.characterId;
    if (!characterIds.has(characterId)) {
      // The card was not part of the backup and does not exist here.
      stats.chatsSkipped += 1;
      continue;
    }
    chats.push({ ...chat, characterId });
    chatIds.add(chat.id);
    stats.chatsAdded += 1;
  }

  return { characters, chats, worldBooks, stats };
}

export function statsSummary(stats: ImportStats): string {
  const parts: string[] = [];
  if (stats.charactersAdded) parts.push(`${stats.charactersAdded} 张角色卡`);
  if (stats.booksAdded) parts.push(`${stats.booksAdded} 本世界书`);
  if (stats.chatsAdded) parts.push(`${stats.chatsAdded} 段对话`);
  const skipped = stats.charactersSkipped + stats.booksSkipped + stats.chatsSkipped;
  const head = parts.length ? `已导入 ${parts.join('、')}` : '没有新增内容';
  return skipped ? `${head}（${skipped} 项已存在，已跳过）` : head;
}
