import { get, set } from 'idb-keyval';
import { useStore } from '../../store';

/** Tavern Helper compatible variable option. */
export type VariableOption =
  | { type: 'chat' | 'character' | 'preset' | 'global' }
  | { type: 'message'; message_id?: number | 'latest' }
  | { type: 'script'; script_id?: string }
  | { type: 'extension'; extension_id: string };

export interface ChatScope {
  chat: Record<string, unknown>;
  messages: Record<string, Record<string, unknown>>;
  scripts: Record<string, Record<string, unknown>>;
}

interface GlobalScope {
  global: Record<string, unknown>;
  characters: Record<string, Record<string, unknown>>;
}

function bumpGlobalVersion() {
  version += 1;
}

const CHAT_PREFIX = 'lite-tavern-vars-v1-';
const GLOBAL_KEY = 'lite-tavern-vars-global-v1';

const scopes = new Map<string, ChatScope>();
const loading = new Map<string, Promise<ChatScope>>();
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

let globalScope: GlobalScope = { global: {}, characters: {} };
let globalLoaded: Promise<void> | null = null;
let version = 0;

/** Bumped on every write so views can cheaply detect variable changes. */
export function variablesVersion(): number {
  return version;
}

function emptyScope(): ChatScope {
  return { chat: {}, messages: {}, scripts: {} };
}

function clone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function scheduleSave(chatId: string) {
  version += 1;
  if (saveTimers.has(chatId)) clearTimeout(saveTimers.get(chatId));
  saveTimers.set(
    chatId,
    setTimeout(() => {
      saveTimers.delete(chatId);
      const scope = scopes.get(chatId);
      if (!scope) return;
      void set(CHAT_PREFIX + chatId, clone(scope)).catch(() => undefined);
    }, 400),
  );
}

export function loadGlobalScope(): Promise<void> {
  if (globalLoaded) return globalLoaded;
  globalLoaded = get<GlobalScope>(GLOBAL_KEY)
    .then((value) => {
      if (value && typeof value === 'object') {
        globalScope = {
          global: (value.global ?? {}) as Record<string, unknown>,
          characters: (value.characters ?? {}) as Record<string, Record<string, unknown>>,
        };
      }
    })
    .catch(() => undefined);
  return globalLoaded;
}

function saveGlobal() {
  bumpGlobalVersion();
  void set(GLOBAL_KEY, clone(globalScope)).catch(() => undefined);
}

export function ensureChatScope(chatId: string): Promise<ChatScope> {
  const cached = scopes.get(chatId);
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(chatId);
  if (pending) return pending;
  const task = get<ChatScope>(CHAT_PREFIX + chatId)
    .then((value) => {
      const scope: ChatScope = emptyScope();
      if (value && typeof value === 'object') {
        if (value.chat && typeof value.chat === 'object') scope.chat = value.chat;
        if (value.messages && typeof value.messages === 'object') scope.messages = value.messages;
        if (value.scripts && typeof value.scripts === 'object') scope.scripts = value.scripts;
      }
      scopes.set(chatId, scope);
      loading.delete(chatId);
      return scope;
    })
    .catch(() => {
      const scope = emptyScope();
      scopes.set(chatId, scope);
      loading.delete(chatId);
      return scope;
    });
  loading.set(chatId, task);
  return task;
}

export function peekChatScope(chatId: string): ChatScope {
  let scope = scopes.get(chatId);
  if (!scope) {
    scope = emptyScope();
    scopes.set(chatId, scope);
  }
  return scope;
}

export function forgetChatScope(chatId: string) {
  scopes.delete(chatId);
  const timer = saveTimers.get(chatId);
  if (timer) clearTimeout(timer);
  saveTimers.delete(chatId);
}

function messagesOf(chatId: string) {
  const chat = useStore.getState().chats.find((c) => c.id === chatId);
  return chat?.messages ?? [];
}

function messageIdAt(chatId: string, index: number): string | undefined {
  const messages = messagesOf(chatId);
  if (!messages.length) return undefined;
  const normalized = index < 0 ? messages.length + index : index;
  return messages[normalized]?.id;
}

function latestMessageId(chatId: string): string | undefined {
  const messages = messagesOf(chatId);
  return messages[messages.length - 1]?.id;
}

interface Resolved {
  read: () => Record<string, unknown>;
  write: (value: Record<string, unknown>) => void;
}

function resolve(chatId: string, option: VariableOption): Resolved {
  const scope = peekChatScope(chatId);
  switch (option.type) {
    case 'message': {
      const raw = option.message_id;
      const id =
        raw === undefined || raw === 'latest'
          ? latestMessageId(chatId)
          : messageIdAt(chatId, Number(raw));
      const key = id ?? '__none__';
      return {
        read: () => (scope.messages[key] ?? {}) as Record<string, unknown>,
        write: (value) => {
          scope.messages[key] = clone(value);
          scheduleSave(chatId);
        },
      };
    }
    case 'script': {
      const key = option.script_id ?? 'default';
      return {
        read: () => (scope.scripts[key] ?? {}) as Record<string, unknown>,
        write: (value) => {
          scope.scripts[key] = clone(value);
          scheduleSave(chatId);
        },
      };
    }
    case 'character': {
      const chat = useStore.getState().chats.find((c) => c.id === chatId);
      const key = chat?.characterId ?? '__none__';
      return {
        read: () => (globalScope.characters[key] ?? {}) as Record<string, unknown>,
        write: (value) => {
          globalScope.characters[key] = clone(value);
          saveGlobal();
        },
      };
    }
    case 'global':
      return {
        read: () => globalScope.global,
        write: (value) => {
          globalScope.global = clone(value);
          saveGlobal();
        },
      };
    case 'extension':
      return {
        read: () => ({}),
        write: () => undefined,
      };
    case 'preset':
    case 'chat':
    default:
      return {
        read: () => scope.chat,
        write: (value) => {
          scope.chat = clone(value);
          scheduleSave(chatId);
        },
      };
  }
}

export function getVariables(
  chatId: string,
  option: VariableOption = { type: 'chat' },
): Record<string, unknown> {
  return clone(resolve(chatId, option).read()) as Record<string, unknown>;
}

export function replaceVariables(
  chatId: string,
  variables: Record<string, unknown>,
  option: VariableOption = { type: 'chat' },
): void {
  if (variables === null || variables === undefined) return;
  resolve(chatId, option).write(variables);
}

export function updateVariablesWith(
  chatId: string,
  updater: (variables: Record<string, unknown>) => unknown,
  option: VariableOption = { type: 'chat' },
): Record<string, unknown> {
  const current = getVariables(chatId, option);
  const result = updater(current);
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    // Card scripts occasionally pass async updaters; fall back to the mutated copy.
    void (result as Promise<unknown>).then((value) => {
      const next =
        value && typeof value === 'object' ? (value as Record<string, unknown>) : current;
      replaceVariables(chatId, next, option);
    });
    return current;
  }
  const next = result && typeof result === 'object' ? (result as Record<string, unknown>) : current;
  replaceVariables(chatId, next, option);
  return next;
}

export function insertVariables(
  chatId: string,
  variables: Record<string, unknown>,
  option?: VariableOption,
): Record<string, unknown> {
  const merged = { ...getVariables(chatId, option), ...clone(variables) };
  replaceVariables(chatId, merged, option);
  return merged;
}

export function insertOrAssignVariables(
  chatId: string,
  variables: Record<string, unknown>,
  option?: VariableOption,
): Record<string, unknown> {
  const target = getVariables(chatId, option);
  for (const [key, value] of Object.entries(variables ?? {})) {
    setDeep(target, key, clone(value));
  }
  replaceVariables(chatId, target, option);
  return target;
}

export function deleteVariable(chatId: string, path: string, option?: VariableOption): void {
  const target = getVariables(chatId, option);
  if (!path) {
    replaceVariables(chatId, {}, option);
    return;
  }
  const parts = path.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cursor[parts[i]];
    if (!next || typeof next !== 'object') return;
    cursor = next as Record<string, unknown>;
  }
  delete cursor[parts[parts.length - 1]];
  replaceVariables(chatId, target, option);
}

export function setDeep(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = String(path).split('.').filter(Boolean);
  if (!parts.length) return;
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

export function getDeep(source: unknown, path: string): unknown {
  const parts = String(path).split('.').filter(Boolean);
  let cursor: unknown = source;
  for (const part of parts) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

/** Flushes pending writes (used before switching chats / closing the app). */
export function flushVariables() {
  for (const [chatId, timer] of saveTimers) {
    clearTimeout(timer);
    const scope = scopes.get(chatId);
    if (scope) void set(CHAT_PREFIX + chatId, clone(scope)).catch(() => undefined);
  }
  saveTimers.clear();
}
