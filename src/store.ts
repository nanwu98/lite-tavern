import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import type {
  Character,
  Chat,
  ChatCompaction,
  ChatMessage,
  Settings,
  WorldBook,
  WorldBookEntry,
} from './types';
import type { CharacterDraft } from './types';
import type { ParsedCard } from './lib/card';
import {
  buildBackup,
  mergeBackup,
  type BackupPayload,
  type BackupSelection,
  type ImportStats,
} from './lib/backup';
import { DEFAULT_SETTINGS } from './defaults';
import { normalizeSettings } from './lib/providers';
import { latestVisibleChat, sortVisibleChats } from './lib/chatOrder';
import { truncate, uid } from './lib/util';
import { applyMacros } from './lib/prompt';
import {
  clearSnapshot,
  markSnapshotRestored,
  readSnapshot,
  storeHasData,
  writeSnapshot,
} from './lib/snapshot';

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'error';
  message: string;
}

export interface ImportBookInput {
  name: string;
  entries: WorldBookEntry[];
  source?: WorldBook['source'];
  fileName?: string;
}

/** Result of the silent update check that runs when the app opens. */
export interface UpdateSummary {
  status: 'available' | 'up-to-date' | 'error';
  current: string;
  latest?: string;
  notes?: string;
  publishedAt?: string;
  asset?: { file: string; size: number; sha256: string };
  error?: string;
  checkedAt: number;
}

interface AppState {
  characters: Character[];
  chats: Chat[];
  worldBooks: WorldBook[];
  settings: Settings;
  activeChatId: string | null;
  hydrated: boolean;
  busyChatId: string | null;
  streamingMessageId: string | null;
  toasts: Toast[];
  /** Latest background update check, shown in 设置 → 关于与更新 without re-checking. */
  updateInfo: UpdateSummary | null;
  updateChecking: boolean;
  /** Newest version the user already opened the settings for (silences the red dot). */
  updateSeenVersion: string | null;

  setUpdateInfo: (info: UpdateSummary | null) => void;
  setUpdateChecking: (checking: boolean) => void;
  markUpdateSeen: (version: string) => void;

  setHydrated: (v: boolean) => void;
  toast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  importCard: (card: ParsedCard, extraBooks?: ImportBookInput[]) => Character;
  /** Creates a card by hand (name / note / prompt / greeting / avatar). */
  createCharacter: (draft: CharacterDraft) => Character;
  /** Updates an existing card, keeping chats and untouched fields. */
  updateCharacter: (characterId: string, patch: Partial<Character>) => void;
  /** Creates a world book (or replaces the entries of an existing same-name book). */
  createWorldBook: (input: { name: string; entries?: WorldBookEntry[] }) => WorldBook;
  updateWorldBook: (bookId: string, patch: Partial<Pick<WorldBook, 'name' | 'entries'>>) => void;
  deleteWorldBook: (bookId: string) => void;
  attachWorldBook: (characterId: string, book: ImportBookInput) => void;
  detachWorldBook: (characterId: string, bookId: string) => void;
  deleteCharacter: (characterId: string) => void;
  createChat: (characterId: string, greetingIndex?: number) => Chat | null;
  openCharacter: (characterId: string) => void;
  selectChat: (chatId: string | null) => void;
  /** Renames a chat or changes its per-chat settings / background. */
  updateChat: (
    chatId: string,
    patch: Partial<
      Pick<
        Chat,
        'title' | 'overrides' | 'background' | 'backgroundCard' | 'pinnedAt' | 'archivedAt'
      >
    >,
  ) => void;
  /** Pins a chat to the top of the list (or removes the pin). */
  pinChat: (chatId: string, pinned: boolean) => void;
  /** Hides a chat from the list; archived chats can only be deleted or restored. */
  archiveChat: (chatId: string, archived: boolean) => void;
  deleteChat: (chatId: string) => void;
  beginExchange: (chatId: string, text: string) => { assistantId: string } | null;
  beginAssistant: (chatId: string) => string | null;
  /** Switches to another variant (swipe) of an existing message. */
  selectSwipe: (chatId: string, messageId: string, index: number) => void;
  /** Replaces the active variant with hand-written text. */
  editMessage: (chatId: string, messageId: string, content: string) => void;
  /** Appends a fresh variant to an assistant message and starts streaming into it. */
  startAssistantSwipe: (chatId: string, messageId: string) => boolean;
  /** Appends a message without starting a generation (card scripts use this). */
  pushMessage: (chatId: string, role: ChatMessage['role'], content: string) => string | null;
  /** Patches a single message (content/status/…) without touching the rest. */
  patchMessage: (chatId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  setMessageLore: (chatId: string, messageId: string, titles: string[]) => void;
  appendDelta: (chatId: string, messageId: string, delta: string) => void;
  /** Streams the model's chain of thought into the message's thinking block. */
  appendReasoning: (chatId: string, messageId: string, delta: string) => void;
  finishMessage: (chatId: string, messageId: string, status?: ChatMessage['status']) => void;
  failMessage: (
    chatId: string,
    messageId: string,
    message: string,
    errorKind?: ChatMessage['errorKind'],
  ) => void;
  /** Stores (or clears) the rolling summary that replaces old messages. */
  setCompaction: (chatId: string, compaction: ChatCompaction | null) => void;
  /** Builds a portable JSON backup of the selected data. */
  exportBackup: (selection: BackupSelection, appVersion?: string) => BackupPayload;
  /** Merges a parsed backup into the local data and reports what changed. */
  importBackup: (payload: BackupPayload) => ImportStats;
  setBusy: (chatId: string | null, messageId?: string | null) => void;
}

/** The persisted subset of the store (see `partialize` below). */
type PersistedState = Pick<
  AppState,
  'characters' | 'chats' | 'worldBooks' | 'settings' | 'activeChatId' | 'updateSeenVersion'
>;

/**
 * Values are kept as objects until the debounced writer runs. Serialising the
 * whole library (avatars are base64) on every store update was a large part of
 * the streaming stutter: persist stringified the entire state for each token.
 */
type PendingValue = string | StorageValue<PersistedState>;
let pendingWrite: { name: string; value: PendingValue } | null = null;

function serializePending(value: PendingValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotPending: string | null = null;
const BACKUP_KEY = 'lite-tavern-backup-v1';
/** Snapshots are throttled: they serialize the whole library to disk. */
const SNAPSHOT_DELAY = 15_000;

function scheduleSnapshot(value: string) {
  if (!storeHasData(value)) return;
  snapshotPending = value;
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    const latest = snapshotPending;
    snapshotPending = null;
    if (latest) void writeSnapshot(latest);
  }, SNAPSHOT_DELAY);
}

/** Writes the newest state to the recovery snapshot right away (page close). */
export function snapshotNow() {
  const latest = pendingWrite ? serializePending(pendingWrite.value) : snapshotPending;
  if (latest && storeHasData(latest)) void writeSnapshot(latest);
}

function commitWrite() {
  if (!pendingWrite) return;
  const item = pendingWrite;
  pendingWrite = null;
  // Serialised here, once, instead of on every state update.
  const value = serializePending(item.value);
  writeChain = writeChain
    .then(async () => {
      await set(item.name, value);
      try {
        if (localStorage.getItem(BACKUP_KEY) === value) localStorage.removeItem(BACKUP_KEY);
      } catch {
        // localStorage can be unavailable in private modes; IndexedDB is the primary store.
      }
      scheduleSnapshot(value);
    })
    .catch(() => undefined);
}

function scheduleWrite(name: string, value: PendingValue) {
  pendingWrite = { name, value };
  // While a reply streams this timer keeps being pushed back, so the expensive
  // serialisation only happens once the burst is over (or when flushed).
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(commitWrite, 500);
}

/**
 * Flushes the newest state. The synchronous localStorage snapshot is a safety net
 * for reloads/closes that happen before the async IndexedDB write completes.
 */
export function flushPersist() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (pendingWrite) {
    const value = serializePending(pendingWrite.value);
    try {
      localStorage.setItem(BACKUP_KEY, value);
    } catch {
      // Ignore quota/privacy failures.
    }
    scheduleSnapshot(value);
  }
  commitWrite();
}

/** Newest stored copy of the library, as raw JSON, or null when there is none. */
async function readStoredRaw(name: string): Promise<string | null> {
  let localBackup: string | null = null;
  try {
    localBackup = localStorage.getItem(BACKUP_KEY);
  } catch {
    localBackup = null;
  }
  const stored = await get<string>(name);
  // The crash backup only wins when it actually contains a library; a stale
  // empty copy must never hide real data.
  if (storeHasData(localBackup)) return localBackup;
  if (stored && storeHasData(stored)) return stored;
  // The main copy looks empty: fall back to the unattended snapshot, which
  // lives outside IndexedDB and survives a damaged/partially-reset database.
  const snapshot = await readSnapshot();
  if (storeHasData(snapshot)) {
    markSnapshotRestored();
    return snapshot;
  }
  return stored ?? null;
}

/**
 * Persist storage that hands `setItem` the live object instead of a string.
 *
 * `createJSONStorage` serialises on every `set`, which during a streamed reply
 * meant `JSON.stringify` of the whole library twenty times a second. The write
 * is debounced anyway, so the string is built in `commitWrite` instead.
 */
const idbStorage: PersistStorage<PersistedState> = {
  getItem: async (name) => {
    const raw = await readStoredRaw(name);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StorageValue<PersistedState>;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    scheduleWrite(name, value);
    return Promise.resolve();
  },
  removeItem: async (name) => {
    await del(name);
    try {
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      // Ignore.
    }
  },
};

function normalizeBookName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function makeTitle(userText: string, characterName: string): string {
  const text = userText.replace(/\s+/g, ' ').trim();
  return text ? truncate(text, 24) : characterName;
}

/** All variants of a message (older messages only have `content`). */
export function messageVariants(message: ChatMessage): string[] {
  if (message.swipes && message.swipes.length > 0) return message.swipes;
  return [message.content ?? ''];
}

export function activeSwipeIndex(message: ChatMessage): number {
  const list = messageVariants(message);
  const raw = Number(message.swipeId ?? 0);
  const index = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  return Math.min(Math.max(index, 0), list.length - 1);
}

function withSwipe(message: ChatMessage, variants: string[], index: number): ChatMessage {
  const safe = Math.min(Math.max(index, 0), Math.max(variants.length - 1, 0));
  return { ...message, swipes: variants, swipeId: safe, content: variants[safe] ?? '' };
}

/** Writes text into the active variant while keeping every other variant. */
function patchActiveVariant(message: ChatMessage, updater: (text: string) => string): ChatMessage {
  const variants = [...messageVariants(message)];
  const index = activeSwipeIndex(message);
  variants[index] = updater(variants[index] ?? '');
  return withSwipe(message, variants, index);
}

function greetingVariants(character: Character): string[] {
  const list = [character.firstMes, ...character.alternateGreetings]
    .map((text) => (text ?? '').trim())
    .filter(Boolean);
  return [...new Set(list)];
}

export const useStore = create<AppState>()(
  persist(
    (set, getState) => ({
      characters: [],
      chats: [],
      worldBooks: [],
      settings: { ...DEFAULT_SETTINGS },
      activeChatId: null,
      hydrated: false,
      busyChatId: null,
      streamingMessageId: null,
      toasts: [],
      updateInfo: null,
      updateChecking: false,
      updateSeenVersion: null,

      setUpdateInfo: (info) => set({ updateInfo: info }),
      setUpdateChecking: (checking) => set({ updateChecking: checking }),
      markUpdateSeen: (version) => {
        set({ updateSeenVersion: version });
        flushPersist();
      },

      setHydrated: (v) => set({ hydrated: v }),

      toast: (message, type = 'info') =>
        set((state) => ({ toasts: [...state.toasts.slice(-3), { id: uid(), type, message }] })),

      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      updateSettings: (patch) => {
        set((state) => ({ settings: { ...state.settings, ...patch } }));
        flushPersist();
      },

      importCard: (card, extraBooks = []) => {
        const state = getState();
        const now = Date.now();
        const bookIds: string[] = [];
        const books = [...card.books, ...extraBooks];
        const nextBooks = [...state.worldBooks];

        for (const input of books) {
          if (!input.entries.length) continue;
          const existing = nextBooks.find(
            (b) => normalizeBookName(b.name) === normalizeBookName(input.name),
          );
          if (existing) {
            if (!bookIds.includes(existing.id)) bookIds.push(existing.id);
            continue;
          }
          const book: WorldBook = {
            id: uid(),
            name: input.name || `${card.character.name} 的世界书`,
            fileName: input.fileName,
            source: input.source ?? 'imported',
            entries: input.entries,
            createdAt: now,
          };
          nextBooks.push(book);
          bookIds.push(book.id);
        }

        if (bookIds.length === 0 && card.character.worldName) {
          const existing = nextBooks.find(
            (b) => normalizeBookName(b.name) === normalizeBookName(card.character.worldName ?? ''),
          );
          if (existing) bookIds.push(existing.id);
        }

        const character: Character = {
          ...card.character,
          worldBookIds: [...new Set(bookIds)],
          createdAt: now,
          updatedAt: now,
        };

        set({
          characters: [...state.characters, character],
          worldBooks: nextBooks,
        });
        flushPersist();
        return character;
      },

      createCharacter: (draft) => {
        const state = getState();
        const now = Date.now();
        const character: Character = {
          id: uid(),
          name: draft.name.trim() || '未命名角色',
          description: draft.description?.trim() ?? '',
          personality: draft.personality?.trim() ?? '',
          scenario: draft.scenario?.trim() ?? '',
          firstMes: draft.firstMes?.trim() ?? '',
          mesExample: draft.mesExample?.trim() ?? '',
          systemPrompt: draft.systemPrompt?.trim() ?? '',
          postHistoryInstructions: draft.postHistoryInstructions?.trim() ?? '',
          alternateGreetings: draft.alternateGreetings ?? [],
          avatar: draft.avatar,
          tags: draft.tags ?? [],
          notes: draft.notes?.trim() ?? '',
          creator: draft.creator ?? '',
          characterVersion: draft.characterVersion ?? '',
          worldBookIds: [],
          worldName: draft.worldName,
          sourceFileName: draft.sourceFileName,
          createdAt: now,
          updatedAt: now,
        };
        set({ characters: [...state.characters, character] });
        flushPersist();
        return character;
      },

      updateCharacter: (characterId, patch) => {
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === characterId ? { ...c, ...patch, updatedAt: Date.now() } : c,
          ),
        }));
        flushPersist();
      },

      createWorldBook: ({ name, entries = [] }) => {
        const state = getState();
        const trimmed = name.trim() || '未命名世界书';
        const existing = state.worldBooks.find(
          (b) => normalizeBookName(b.name) === normalizeBookName(trimmed),
        );
        if (existing) {
          const updated: WorldBook = { ...existing, name: trimmed, entries };
          set({ worldBooks: state.worldBooks.map((b) => (b.id === existing.id ? updated : b)) });
          flushPersist();
          return updated;
        }
        const book: WorldBook = {
          id: uid(),
          name: trimmed,
          source: 'manual',
          entries,
          createdAt: Date.now(),
        };
        set({ worldBooks: [...state.worldBooks, book] });
        flushPersist();
        return book;
      },

      updateWorldBook: (bookId, patch) => {
        set((state) => ({
          worldBooks: state.worldBooks.map((b) => (b.id === bookId ? { ...b, ...patch } : b)),
        }));
        flushPersist();
      },

      deleteWorldBook: (bookId) => {
        set((state) => ({
          worldBooks: state.worldBooks.filter((b) => b.id !== bookId),
          characters: state.characters.map((c) =>
            c.worldBookIds.includes(bookId)
              ? {
                  ...c,
                  worldBookIds: c.worldBookIds.filter((id) => id !== bookId),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        }));
        flushPersist();
      },

      attachWorldBook: (characterId, input) => {
        const state = getState();
        const character = state.characters.find((c) => c.id === characterId);
        if (!character) return;
        const nextBooks = [...state.worldBooks];
        let book = nextBooks.find(
          (b) => normalizeBookName(b.name) === normalizeBookName(input.name),
        );
        if (book) {
          book = { ...book, entries: input.entries, fileName: input.fileName ?? book.fileName };
          const idx = nextBooks.findIndex((b) => b.id === book?.id);
          nextBooks[idx] = book;
        } else {
          book = {
            id: uid(),
            name: input.name || '导入的世界书',
            fileName: input.fileName,
            source: input.source ?? 'imported',
            entries: input.entries,
            createdAt: Date.now(),
          };
          nextBooks.push(book);
        }
        set({
          worldBooks: nextBooks,
          characters: state.characters.map((c) =>
            c.id === characterId
              ? {
                  ...c,
                  worldBookIds: [...new Set([...c.worldBookIds, book.id])],
                  updatedAt: Date.now(),
                }
              : c,
          ),
        });
        flushPersist();
      },

      detachWorldBook: (characterId, bookId) => {
        const state = getState();
        const characters = state.characters.map((c) =>
          c.id === characterId
            ? {
                ...c,
                worldBookIds: c.worldBookIds.filter((id) => id !== bookId),
                updatedAt: Date.now(),
              }
            : c,
        );
        const used = new Set(characters.flatMap((c) => c.worldBookIds));
        set({
          characters,
          worldBooks: state.worldBooks.filter((b) => used.has(b.id) || b.id !== bookId),
        });
        flushPersist();
      },

      deleteCharacter: (characterId) => {
        const state = getState();
        const characters = state.characters.filter((c) => c.id !== characterId);
        const chats = state.chats.filter((c) => c.characterId !== characterId);
        const used = new Set(characters.flatMap((c) => c.worldBookIds));
        const worldBooks = state.worldBooks.filter((b) => used.has(b.id));
        const activeStillExists = chats.some((c) => c.id === state.activeChatId);
        // An empty library is intentional: drop the recovery snapshot so it is
        // not restored on the next launch.
        if (characters.length === 0) void clearSnapshot();
        set({
          characters,
          chats,
          worldBooks,
          activeChatId: activeStillExists ? state.activeChatId : (chats[0]?.id ?? null),
        });
        flushPersist();
      },

      createChat: (characterId, greetingIndex = 0) => {
        const state = getState();
        const character = state.characters.find((c) => c.id === characterId);
        if (!character) return null;
        const now = Date.now();
        // Every opening (first_mes + alternate_greetings) becomes a swipe variant.
        const variants = greetingVariants(character)
          .map((text) => applyMacros(text, character, state.settings).trim())
          .filter(Boolean);
        const safeIndex = Math.min(Math.max(greetingIndex, 0), Math.max(variants.length - 1, 0));
        const messages: ChatMessage[] = variants.length
          ? [
              {
                id: uid(),
                role: 'assistant',
                content: variants[safeIndex] ?? variants[0],
                createdAt: now,
                greeting: true,
                swipes: variants,
                swipeId: safeIndex,
              },
            ]
          : [];
        const chat: Chat = {
          id: uid(),
          characterId,
          title: character.name,
          messages,
          createdAt: now,
          updatedAt: now,
        };
        set({ chats: [chat, ...state.chats], activeChatId: chat.id });
        flushPersist();
        return chat;
      },

      openCharacter: (characterId) => {
        const state = getState();
        const latest = latestVisibleChat(state.chats, characterId);
        if (latest) {
          set({ activeChatId: latest.id });
          return;
        }
        getState().createChat(characterId, 0);
      },

      selectChat: (chatId) => set({ activeChatId: chatId }),

      updateChat: (chatId, patch) => {
        set((state) => ({
          // Renaming or restyling edits metadata only: `updatedAt` is left alone
          // so the conversation list keeps its order by real activity.
          chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...patch } : c)),
        }));
        flushPersist();
      },

      pinChat: (chatId, pinned) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, pinnedAt: pinned ? Date.now() : undefined } : c,
          ),
        }));
        flushPersist();
      },

      archiveChat: (chatId, archived) => {
        const state = getState();
        const now = Date.now();
        const chats = state.chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                archivedAt: archived ? (c.archivedAt ?? now) : undefined,
                // Archiving clears the pin so a hidden chat can never hold the
                // top of the visible list; restoring starts it unpinned.
                pinnedAt: archived ? undefined : c.pinnedAt,
              }
            : c,
        );
        // Archiving the open chat would leave the reader on a hidden
        // conversation: move to the newest visible one (or the start screen).
        const fallback =
          archived && state.activeChatId === chatId
            ? (sortVisibleChats(chats)[0]?.id ?? null)
            : state.activeChatId;
        set({ chats, activeChatId: fallback });
        flushPersist();
      },

      deleteChat: (chatId) => {
        const state = getState();
        const chats = state.chats.filter((c) => c.id !== chatId);
        set({
          chats,
          activeChatId:
            state.activeChatId === chatId
              ? (sortVisibleChats(chats)[0]?.id ?? null)
              : state.activeChatId,
        });
        flushPersist();
      },

      beginExchange: (chatId, text) => {
        const state = getState();
        const chat = state.chats.find((c) => c.id === chatId);
        if (!chat) return null;
        const character = state.characters.find((c) => c.id === chat.characterId);
        const now = Date.now();
        const userId = uid();
        const assistantId = uid();
        const isFirstUser = !chat.messages.some((m) => m.role === 'user');
        const messages: ChatMessage[] = [
          ...chat.messages,
          { id: userId, role: 'user', content: text, createdAt: now },
          { id: assistantId, role: 'assistant', content: '', createdAt: now, status: 'streaming' },
        ];
        set({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages,
                  title: isFirstUser ? makeTitle(text, character?.name ?? c.title) : c.title,
                  updatedAt: now,
                }
              : c,
          ),
          busyChatId: chatId,
          streamingMessageId: assistantId,
        });
        flushPersist();
        return { assistantId };
      },

      beginAssistant: (chatId) => {
        const state = getState();
        const chat = state.chats.find((c) => c.id === chatId);
        if (!chat) return null;
        const assistantId = uid();
        const now = Date.now();
        const message: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: '',
          createdAt: now,
          status: 'streaming',
        };
        set({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, messages: [...c.messages, message], updatedAt: now } : c,
          ),
          busyChatId: chatId,
          streamingMessageId: assistantId,
        });
        flushPersist();
        return assistantId;
      },

      selectSwipe: (chatId, messageId, index) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? {
                          // Thinking belongs to one variant; switching drops it.
                          ...withSwipe(m, messageVariants(m), index),
                          reasoning: undefined,
                          reasoningDone: false,
                        }
                      : m,
                  ),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        }));
        flushPersist();
      },

      editMessage: (chatId, messageId, content) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? { ...patchActiveVariant(m, () => content), edited: true, status: undefined }
                      : m,
                  ),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        }));
        flushPersist();
      },

      startAssistantSwipe: (chatId, messageId) => {
        const state = getState();
        const chat = state.chats.find((c) => c.id === chatId);
        const message = chat?.messages.find((m) => m.id === messageId);
        if (!chat || !message) return false;
        const variants = [...messageVariants(message), ''];
        const next = withSwipe(
          // Every variant streams its own thinking block.
          { ...message, status: 'streaming' as const, reasoning: undefined, reasoningDone: false },
          variants,
          variants.length - 1,
        );
        set({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === messageId ? next : m)),
                  updatedAt: Date.now(),
                }
              : c,
          ),
          busyChatId: chatId,
          streamingMessageId: messageId,
        });
        flushPersist();
        return true;
      },

      pushMessage: (chatId, role, content) => {
        const state = getState();
        const chat = state.chats.find((c) => c.id === chatId);
        if (!chat) return null;
        const id = uid();
        const now = Date.now();
        const message: ChatMessage = { id, role, content, createdAt: now };
        set({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: [...c.messages, message],
                  title: c.messages.some((m) => m.role === 'user')
                    ? c.title
                    : makeTitle(content, c.title),
                  updatedAt: now,
                }
              : c,
          ),
        });
        flushPersist();
        return id;
      },

      patchMessage: (chatId, messageId, patch) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
                  updatedAt: patch.content !== undefined ? Date.now() : c.updatedAt,
                }
              : c,
          ),
        }));
      },

      removeMessage: (chatId, messageId) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.filter((m) => m.id !== messageId),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        }));
        flushPersist();
      },

      setMessageLore: (chatId, messageId, titles) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, loreTitles: titles } : m,
                  ),
                }
              : c,
          ),
        })),

      appendDelta: (chatId, messageId, delta) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...patchActiveVariant(m, (text) => text + delta),
                          // The first word of prose ends the thinking phase, so
                          // the UI can collapse the block above the bubble.
                          ...(m.reasoning && !m.reasoningDone ? { reasoningDone: true } : {}),
                        }
                      : m,
                  ),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        })),

      appendReasoning: (chatId, messageId, delta) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          reasoning: (m.reasoning ?? '') + delta,
                          reasoningDone: false,
                        }
                      : m,
                  ),
                  updatedAt: Date.now(),
                }
              : c,
          ),
        })),

      finishMessage: (chatId, messageId, status) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? { ...m, status, ...(m.reasoning ? { reasoningDone: true } : {}) }
                      : m,
                  ),
                  updatedAt: Date.now(),
                }
              : c,
          ),
          busyChatId: null,
          streamingMessageId: null,
        }));
        flushPersist();
      },

      failMessage: (chatId, messageId, message, errorKind = 'other') => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...patchActiveVariant(m, () => message),
                          status: 'error' as const,
                          errorKind,
                        }
                      : m,
                  ),
                  updatedAt: Date.now(),
                }
              : c,
          ),
          busyChatId: null,
          streamingMessageId: null,
        }));
        flushPersist();
      },

      setCompaction: (chatId, compaction) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? { ...c, compaction: compaction ?? undefined, updatedAt: Date.now() }
              : c,
          ),
        }));
        flushPersist();
      },

      exportBackup: (selection, appVersion) => {
        const state = getState();
        return buildBackup(
          { characters: state.characters, chats: state.chats, worldBooks: state.worldBooks },
          selection,
          { appVersion },
        );
      },

      importBackup: (payload) => {
        const state = getState();
        const result = mergeBackup(
          { characters: state.characters, chats: state.chats, worldBooks: state.worldBooks },
          payload,
        );
        const activeStillExists = result.chats.some((c) => c.id === state.activeChatId);
        set({
          characters: result.characters,
          chats: result.chats,
          worldBooks: result.worldBooks,
          // Never jump into a random restored conversation; the start screen
          // shows the new cards instead.
          activeChatId: activeStillExists ? state.activeChatId : null,
        });
        flushPersist();
        return result.stats;
      },

      setBusy: (chatId, messageId = null) =>
        set({ busyChatId: chatId, streamingMessageId: messageId }),
    }),
    {
      name: 'lite-tavern-store-v1',
      version: 1,
      storage: idbStorage,
      partialize: (state) => ({
        characters: state.characters,
        chats: state.chats,
        worldBooks: state.worldBooks,
        settings: state.settings,
        activeChatId: state.activeChatId,
        updateSeenVersion: state.updateSeenVersion,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const chats = (p.chats ?? []).map((chat) => ({
          ...chat,
          messages: chat.messages.map((m) =>
            m.status === 'streaming' ? { ...m, status: 'stopped' as const } : m,
          ),
        }));
        return {
          ...current,
          ...p,
          chats,
          settings: {
            ...DEFAULT_SETTINGS,
            ...normalizeSettings(p.settings),
          } as Settings,
        };
      },
    },
  ),
);

export function activeChat(state: Pick<AppState, 'chats' | 'activeChatId'>): Chat | undefined {
  return state.chats.find((c) => c.id === state.activeChatId);
}

export function characterForChat(
  state: Pick<AppState, 'characters'>,
  chat: Chat | undefined,
): Character | undefined {
  return chat ? state.characters.find((c) => c.id === chat.characterId) : undefined;
}

export function booksForCharacter(
  state: Pick<AppState, 'worldBooks'>,
  character: Character | undefined,
): WorldBook[] {
  if (!character) return [];
  return character.worldBookIds
    .map((id) => state.worldBooks.find((b) => b.id === id))
    .filter((b): b is WorldBook => Boolean(b));
}
