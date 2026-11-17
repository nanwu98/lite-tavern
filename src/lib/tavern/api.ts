/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStore } from '../../store';
import type { Character, Chat, ChatMessage, Settings } from '../../types';
import { eventBus, iframe_events, tavern_events } from './events';
import { applyRegexScripts } from './regex';
import { substitudeMacros, type MacroContext } from './macros';
import { chatActions, scriptBus } from './bus';
import { POPUP_RESULT, POPUP_TYPE, showPopup } from './popup';
import {
  deleteVariable,
  getVariables,
  insertOrAssignVariables,
  insertVariables,
  replaceVariables,
  updateVariablesWith,
  variablesVersion,
  type VariableOption,
} from './variables';
import { streamChat } from '../api';
import { renderMarkdown } from '../format';

export interface IframeConfig {
  kind: 'script' | 'message';
  chatId: string;
  scriptId?: string;
  scriptName?: string;
  messageIndex?: number;
  iframeId: string;
}

const HELPERS_VERSION = '4.9.1';
const TAVERN_VERSION = '1.13.4';

let injectedPrompts: { id: string; content: string }[] = [];
const macroLikes = new Map<string, (text: string) => string>();

const extensionSettings: Record<string, any> = loadExtensionSettings();

function loadExtensionSettings(): Record<string, any> {
  const holder = window as unknown as Record<string, any>;
  if (holder.__LITE_TAVERN_EXTENSION_SETTINGS__) return holder.__LITE_TAVERN_EXTENSION_SETTINGS__;
  let parsed: Record<string, any> = {};
  try {
    const raw = localStorage.getItem('lite-tavern-extension-settings');
    if (raw) parsed = JSON.parse(raw) as Record<string, any>;
  } catch {
    parsed = {};
  }
  if (!parsed.variables || typeof parsed.variables !== 'object') parsed.variables = { global: {} };
  const settings = parsed;
  try {
    Object.defineProperty(holder, '__LITE_TAVERN_EXTENSION_SETTINGS__', {
      value: settings,
      writable: true,
    });
  } catch {
    holder.__LITE_TAVERN_EXTENSION_SETTINGS__ = settings;
  }
  return settings;
}

export function saveExtensionSettings() {
  try {
    localStorage.setItem('lite-tavern-extension-settings', JSON.stringify(extensionSettings));
  } catch {
    // ignore quota errors
  }
}

function state() {
  return useStore.getState();
}

function settings(): Settings {
  return state().settings;
}

function chatOf(chatId: string): Chat | undefined {
  return state().chats.find((c) => c.id === chatId);
}

function characterOf(chatId: string): Character | undefined {
  const chat = chatOf(chatId);
  return chat ? state().characters.find((c) => c.id === chat.characterId) : undefined;
}

function messagesOf(chatId: string): ChatMessage[] {
  return chatOf(chatId)?.messages ?? [];
}

function macroContext(chatId: string, input?: string): MacroContext {
  const chat = chatOf(chatId);
  const character = characterOf(chatId);
  const messages = chat?.messages ?? [];
  return {
    character,
    settings: settings(),
    input,
    lastMessage: messages[messages.length - 1]?.content,
    lastMessageId: messages.length - 1,
    getVar: (path: string) => {
      const parts = path.split('.');
      if (parts[0] === 'global') {
        return (getVariables(chatId, { type: 'global' }) as Record<string, any>)[
          parts.slice(1).join('.')
        ];
      }
      const vars = getVariables(chatId, { type: 'chat' }) as Record<string, any>;
      return parts.reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), vars);
    },
  };
}

function substitute(chatId: string, text: string): string {
  let out = substitudeMacros(text, macroContext(chatId));
  for (const [pattern, replacer] of macroLikes) {
    try {
      const regex = new RegExp(pattern, 'g');
      out = out.replace(regex, (...args) => {
        try {
          return String(replacer(String(args[0] ?? '')) ?? '');
        } catch {
          return String(args[0] ?? '');
        }
      });
    } catch {
      // ignore broken macro-like registrations
    }
  }
  return out;
}

let chatArrayCache: { key: string; value: any[] } = { key: '', value: [] };

function chatKey(chatId: string): string {
  const chat = chatOf(chatId);
  return `${chatId}:${chat?.messages.length ?? 0}:${chat?.updatedAt ?? 0}:${variablesVersion()}`;
}

function chatArray(chatId: string): any[] {
  const key = chatKey(chatId);
  if (chatArrayCache.key === key) return chatArrayCache.value;
  const chat = chatOf(chatId);
  const character = characterOf(chatId);
  const userName = settings().userName || '旅人';
  const list = (chat?.messages ?? []).map((message, index) => {
    const vars = getVariables(chatId, { type: 'message', message_id: index });
    const swipes = message.swipes?.length ? message.swipes : [message.content];
    const rawSwipe = Number(message.swipeId ?? 0);
    const swipeId = Number.isFinite(rawSwipe)
      ? Math.min(Math.max(Math.trunc(rawSwipe), 0), Math.max(swipes.length - 1, 0))
      : 0;
    return {
      name: message.role === 'user' ? userName : (character?.name ?? ''),
      is_user: message.role === 'user',
      is_system: false,
      send_date: new Date(message.createdAt).toISOString(),
      mes: message.content,
      original_avatar: '',
      extra: {},
      variables: [vars],
      swipe_id: swipeId,
      swipes,
      swipe_info: swipes.map(() => ({})),
      message_id: index,
      is_hidden: false,
    };
  });
  chatArrayCache = { key, value: list };
  return list;
}

function rangeOf(input: string | number, length: number): { start: number; end: number } | null {
  const clamp = (value: number) =>
    Math.min(length - 1, Math.max(0, value < 0 ? length + value : value));
  const text = String(input).trim();
  if (/^-?\d+$/.test(text)) {
    const index = clamp(Number(text));
    return { start: index, end: index };
  }
  const m = /^(-?\d+)-(-?\d+)$/.exec(text);
  if (!m) return null;
  const a = clamp(Number(m[1]));
  const b = clamp(Number(m[2]));
  return { start: Math.min(a, b), end: Math.max(a, b) };
}
function messagesBetween(chatId: string, start: number, end: number): any[] {
  const list = chatArray(chatId);
  const out: any[] = [];
  for (let i = start; i <= end; i++) {
    const item = list[i];
    if (item) out.push(item);
  }
  return out;
}

function roleOf(message: any): 'user' | 'assistant' | 'system' {
  if (message.is_system) return 'system';
  return message.is_user ? 'user' : 'assistant';
}

function emit(event: string, ...args: any[]) {
  eventBus.emitNow(event, ...args);
}

export function createApi(cfg: IframeConfig, win: Window): Record<string, any> {
  const chatId = cfg.chatId;

  const iframeName = () => cfg.iframeId;
  const scriptId = () => cfg.scriptId ?? '';
  const currentMessageId = () => (cfg.kind === 'message' ? (cfg.messageIndex ?? -1) : -1);

  const safe = <T extends (...args: any[]) => any>(fn: T): T =>
    ((...args: any[]) => {
      try {
        return fn(...args);
      } catch (error) {
        console.error(`[轻语酒馆] ${fn.name || '脚本接口'} 执行失败`, error);
        return undefined;
      }
    }) as T;

  /* ------------------------------------------------------------------ *
   * Variables
   * ------------------------------------------------------------------ */
  const resolveOption = (option: VariableOption | undefined): VariableOption => {
    if (!option) return { type: 'chat' };
    if (option.type === 'script' && !option.script_id) {
      return { type: 'script', script_id: scriptId() || 'default' };
    }
    return option;
  };

  const apiGetVariables = (option?: VariableOption) => getVariables(chatId, resolveOption(option));

  const apiReplaceVariables = (variables: Record<string, any>, option?: VariableOption) => {
    replaceVariables(chatId, variables ?? {}, resolveOption(option));
    emit('variables_changed');
  };

  const apiUpdateVariablesWith = (updater: any, option?: VariableOption) => {
    const next = updateVariablesWith(chatId, updater, resolveOption(option));
    emit('variables_changed');
    return next;
  };

  const apiInsertOrAssign = (variables: Record<string, any>, option?: VariableOption) => {
    const next = insertOrAssignVariables(chatId, variables ?? {}, resolveOption(option));
    emit('variables_changed');
    return next;
  };

  const apiInsert = (variables: Record<string, any>, option?: VariableOption) => {
    const next = insertVariables(chatId, variables ?? {}, resolveOption(option));
    emit('variables_changed');
    return next;
  };

  const apiDeleteVariable = (path: string, option?: VariableOption) => {
    deleteVariable(chatId, path, resolveOption(option));
    emit('variables_changed');
  };

  /* ------------------------------------------------------------------ *
   * Chat messages
   * ------------------------------------------------------------------ */
  const apiGetChatMessages = (range: string | number, options: any = {}) => {
    const messages = messagesOf(chatId);
    if (!messages.length) return [];
    const rawRange = typeof range === 'string' ? substitute(chatId, range) : range;
    const bounds = rangeOf(rawRange, messages.length);
    if (!bounds) return [];
    const role: string = options.role ?? 'all';
    const includeSwipes = Boolean(options.include_swipes);
    const result: any[] = [];
    for (const item of messagesBetween(chatId, bounds.start, bounds.end)) {
      const itemRole = roleOf(item);
      if (role !== 'all' && role !== itemRole) continue;
      if (options.hide_state === 'hidden' && !item.is_system) continue;
      if (options.hide_state === 'unhidden' && item.is_system) continue;
      if (includeSwipes) {
        result.push({
          message_id: item.message_id,
          name: item.name,
          role: itemRole,
          is_hidden: false,
          swipe_id: item.swipe_id,
          swipes: item.swipes,
          swipes_data: item.variables,
          swipes_info: item.swipe_info,
        });
      } else {
        result.push({
          message_id: item.message_id,
          name: item.name,
          role: itemRole,
          is_hidden: false,
          message: item.mes,
          data: item.variables[0] ?? {},
          extra: {},
        });
      }
    }
    return result;
  };

  const applyMessagePatch = (patch: any) => {
    const messages = messagesOf(chatId);
    const index = Number(patch?.message_id);
    if (!Number.isFinite(index) || !messages[index]) return null;
    const target = messages[index];
    if (typeof patch.message === 'string' && patch.message !== target.content) {
      state().patchMessage(chatId, target.id, { content: patch.message });
      emit(tavern_events.MESSAGE_UPDATED, index);
      emit(tavern_events.MESSAGE_EDITED, index);
    }
    if (patch.data && typeof patch.data === 'object') {
      replaceVariables(chatId, patch.data, { type: 'message', message_id: index });
    }
    // Swipe data is how MVU persists the initialised variables of a message.
    if (Array.isArray(patch.swipes_data) && patch.swipes_data.length > 0) {
      const data = patch.swipes_data[0];
      if (data && typeof data === 'object') {
        replaceVariables(chatId, data as Record<string, unknown>, {
          type: 'message',
          message_id: index,
        });
      }
    }
    if (Array.isArray(patch.swipes) && patch.swipes.length > 0) {
      const variants = patch.swipes.map((text: unknown) => String(text ?? ''));
      const raw = Number(patch.swipe_id ?? target.swipeId ?? 0);
      const nextIndex = Number.isFinite(raw)
        ? Math.min(Math.max(Math.trunc(raw), 0), variants.length - 1)
        : variants.length - 1;
      state().patchMessage(chatId, target.id, {
        swipes: variants,
        swipeId: nextIndex,
        content: variants[nextIndex] ?? '',
      });
      emit(tavern_events.MESSAGE_UPDATED, index);
    }
    return target;
  };

  const apiSetChatMessages = (patches: any[], _options: any = {}) => {
    for (const patch of patches ?? []) applyMessagePatch(patch);
  };

  const apiSetChatMessage = (patch: any, _options: any = {}) => {
    applyMessagePatch(patch);
  };

  const apiCreateChatMessages = (items: any[], options: any = {}) => {
    const list = Array.isArray(items) ? items : [];
    const ids: string[] = [];
    for (const item of list) {
      const role =
        item?.role === 'user' ? 'user' : item?.role === 'system' ? 'assistant' : 'assistant';
      const content = typeof item?.message === 'string' ? item.message : '';
      const id = state().pushMessage(chatId, role, content);
      if (!id) continue;
      ids.push(id);
      if (item?.data && typeof item.data === 'object') {
        const index = messagesOf(chatId).findIndex((m) => m.id === id);
        replaceVariables(chatId, item.data, { type: 'message', message_id: index });
      }
      const index = messagesOf(chatId).findIndex((m) => m.id === id);
      if (role === 'user') {
        emit(tavern_events.MESSAGE_SENT, index);
        emit(tavern_events.USER_MESSAGE_RENDERED, index);
      } else {
        emit(tavern_events.MESSAGE_RECEIVED, index, 'normal');
        emit(tavern_events.CHARACTER_MESSAGE_RENDERED, index);
      }
    }
    void options;
    return ids;
  };

  const apiDeleteChatMessages = (ids: number[], _options: any = {}) => {
    const messages = messagesOf(chatId);
    const targets = (ids ?? [])
      .map((i) => messages[Number(i)])
      .filter(Boolean)
      .map((m) => m.id);
    for (const id of targets) {
      const index = messagesOf(chatId).findIndex((m) => m.id === id);
      state().removeMessage(chatId, id);
      emit(tavern_events.MESSAGE_DELETED, index);
    }
  };

  const getLastMessageId = () => messagesOf(chatId).length - 1;

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */
  const listeners = new Set<{ event: string; listener: (...args: any[]) => any }>();

  const on = (event: string, listener: (...args: any[]) => any) => {
    eventBus.on(event, listener);
    listeners.add({ event, listener });
    return {
      stop: () => {
        eventBus.removeListener(event, listener);
        listeners.delete({ event, listener });
      },
    };
  };

  const once = (event: string, listener: (...args: any[]) => any) => {
    const wrapped = (...args: any[]) => {
      listeners.delete({ event, listener: wrapped });
      return listener(...args);
    };
    eventBus.once(event, wrapped);
    listeners.add({ event, listener: wrapped });
    return { stop: () => eventBus.removeListener(event, wrapped) };
  };

  const removeListener = (event: string, listener: (...args: any[]) => any) => {
    eventBus.removeListener(event, listener);
    for (const item of [...listeners]) {
      if (item.event === event && item.listener === listener) listeners.delete(item);
    }
  };

  const clearAll = () => {
    for (const item of listeners) eventBus.removeListener(item.event, item.listener);
    listeners.clear();
    scriptBus.removeIframe(iframeName());
  };

  /* ------------------------------------------------------------------ *
   * Script buttons
   * ------------------------------------------------------------------ */
  const buttonEvent = (name: string) => `${buttonEventPrefix()}_${String(name)}`;
  const buttonEventPrefix = () => `script_button_${scriptId() || iframeName()}`;
  const currentButtons: string[] = [];

  const publishButtons = (buttons: string[]) => {
    currentButtons.length = 0;
    currentButtons.push(...buttons);
    scriptBus.setButtons(
      iframeName(),
      scriptId(),
      cfg.scriptName ?? '',
      currentButtons.map((label) => ({ label, event: buttonEvent(label) })),
    );
  };

  const apiGetScriptButtons = () => currentButtons.map((name) => ({ name, visible: true }));

  const apiReplaceScriptButtons = (buttons: { name: string; visible?: boolean }[]) => {
    publishButtons(
      (buttons ?? []).filter((b) => b && b.name && b.visible !== false).map((b) => b.name),
    );
  };

  const apiAppendInexistentScriptButtons = (buttons: { name: string; visible?: boolean }[]) => {
    const next = [...currentButtons];
    for (const button of buttons ?? []) {
      if (!button?.name) continue;
      if (!next.includes(button.name)) next.push(button.name);
    }
    publishButtons(next);
  };

  const apiUpdateScriptButtonsWith = (updater: any) => {
    const result = updater(apiGetScriptButtons());
    if (Array.isArray(result)) apiReplaceScriptButtons(result);
    return result;
  };

  /* ------------------------------------------------------------------ *
   * Globals / macros
   * ------------------------------------------------------------------ */
  const parentWindow = win.parent as unknown as Record<string, any>;

  const apiInitializeGlobal = (name: string, value: unknown) => {
    try {
      parentWindow[name] = value;
    } catch {
      // ignore
    }
    emit(`global_${name}_initialized`, value);
  };

  const apiWaitGlobalInitialized = (name: string): Promise<unknown> => {
    if (parentWindow[name] !== undefined) return Promise.resolve(parentWindow[name]);
    return new Promise((resolve) => {
      const handler = (value: unknown) => {
        eventBus.removeListener(`global_${name}_initialized`, handler);
        resolve(value ?? parentWindow[name]);
      };
      eventBus.on(`global_${name}_initialized`, handler);
    });
  };

  const apiRegisterMacroLike = (pattern: string, replacer: (text: string) => string) => {
    const key = String(pattern);
    macroLikes.set(key, replacer);
    return { unregister: () => macroLikes.delete(key) };
  };

  const apiInjectPrompts = (prompts: any[], options: any = {}) => {
    const id = String(options?.id ?? `inject-${Date.now()}`);
    const content = (prompts ?? [])
      .map((p) => (typeof p === 'string' ? p : (p?.content ?? '')))
      .filter(Boolean)
      .join('\n');
    injectedPrompts = injectedPrompts.filter((p) => p.id !== id).concat({ id, content });
  };

  const apiUninjectPrompts = (ids: string[]) => {
    const list = Array.isArray(ids) ? ids.map(String) : [];
    injectedPrompts = injectedPrompts.filter((p) => !list.includes(p.id));
  };

  /* ------------------------------------------------------------------ *
   * Slash commands + generation
   * ------------------------------------------------------------------ */
  const apiTriggerSlash = (command: string): string => {
    const text = String(command ?? '').trim();
    if (!text.startsWith('/')) return '';
    const [name, ...rest] = text.slice(1).split(/\s+/);
    const arg = rest.join(' ');
    switch (name) {
      case 'trigger':
      case 'gen':
      case 'generate':
        chatActions.trigger?.();
        return '';
      case 'send':
        if (arg) chatActions.send?.(arg);
        else chatActions.trigger?.();
        return '';
      case 'setinput':
        chatActions.setInput?.(arg);
        return '';
      case 'echo':
        state().toast(arg || text, 'info');
        return '';
      case 'pass':
      default:
        return '';
    }
  };

  const apiGenerateRaw = async (options: any): Promise<string> => {
    const input =
      typeof options === 'string' ? options : String(options?.user_input ?? options?.prompt ?? '');
    if (!input.trim()) return '';
    const current = settings();
    return streamChat({
      settings: { ...current, stream: false },
      messages: [{ role: 'user', content: input }],
    });
  };

  const apiGenerate = async (options: any): Promise<string> => {
    const input = typeof options === 'string' ? options : String(options?.user_input ?? '');
    return apiGenerateRaw({ user_input: input });
  };

  /* ------------------------------------------------------------------ *
   * Tavern regex
   * ------------------------------------------------------------------ */
  const cardRegex = () => characterOf(chatId)?.code?.regexScripts ?? [];

  const apiFormatAsTavernRegexedString = (
    text: string,
    source: string,
    mode: 'display' | 'prompt' = 'display',
  ) => {
    const depth = 0;
    void source;
    return applyRegexScripts(String(text ?? ''), cardRegex(), {
      macro: (value) => substitute(chatId, value),
      mode,
      depth,
    });
  };

  const apiGetTavernRegexes = () => cardRegex().map((r) => ({ ...r }));

  /* ------------------------------------------------------------------ *
   * World books / characters (read-only conveniences)
   * ------------------------------------------------------------------ */
  const booksOfCharacter = () => {
    const character = characterOf(chatId);
    if (!character) return [];
    return character.worldBookIds
      .map((id) => state().worldBooks.find((b) => b.id === id))
      .filter(Boolean) as any[];
  };

  const lorebookEntries = (name: string) => {
    const book = booksOfCharacter().find((b) => b.name === name) ?? booksOfCharacter()[0];
    if (!book) return [];
    const logic = ['and_any', 'and_all', 'not_all', 'not_any'];
    return book.entries.map((entry: any, index: number) => ({
      uid: index,
      id: index,
      key: entry.keys,
      keys: entry.keys,
      keysecondary: entry.secondaryKeys,
      comment: entry.comment,
      content: entry.content,
      constant: entry.constant,
      selective: entry.selective,
      selectiveLogic: entry.selectiveLogic,
      addMemo: true,
      order: entry.order,
      position: entry.position,
      disable: entry.disable,
      enabled: !entry.disable,
      excludeRecursion: entry.excludeRecursion,
      preventRecursion: entry.preventRecursion,
      probability: entry.probability,
      useProbability: entry.useProbability,
      depth: entry.depth,
      group: entry.group,
      groupWeight: entry.groupWeight,
      scanDepth: entry.scanDepth,
      caseSensitive: entry.caseSensitive,
      matchWholeWords: entry.matchWholeWords,
      role: entry.role,
      sticky: entry.sticky,
      cooldown: entry.cooldown,
      strategy: {
        type: entry.constant ? 'constant' : entry.selective ? 'selective' : 'normal',
        keys: entry.keys,
        keys_secondary: {
          keys: entry.secondaryKeys,
          logic: logic[entry.selectiveLogic] ?? 'and_any',
        },
        scan_depth: 'same_as_global',
      },
    }));
  };

  const worldInfoObject = (name: string) => {
    const entries: any[] = lorebookEntries(name);
    const mapped: Record<string, any> = {};
    entries.forEach((entry: any, index: number) => {
      mapped[index] = entry;
    });
    return { entries: mapped };
  };

  /* ------------------------------------------------------------------ *
   * SillyTavern compatibility object
   * ------------------------------------------------------------------ */
  const buildContext = (): Record<string, any> => {
    const character = characterOf(chatId);
    const current = settings();
    const context: Record<string, any> = {
      name1: current.userName || '旅人',
      name2: character?.name ?? '',
      chat: chatArray(chatId),
      characters: state().characters.map((c) => ({
        name: c.name,
        avatar: `${c.id}.png`,
        description: c.description,
        personality: c.personality,
        scenario: c.scenario,
        first_mes: c.firstMes,
        mes_example: c.mesExample,
        data: { extensions: {} },
      })),
      characterId: character?.id ?? '',
      chatId,
      chatMetadata: { variables: getVariables(chatId, { type: 'chat' }) },
      groups: [],
      groupId: undefined,
      eventSource: eventBus,
      eventTypes: tavern_events,
      extensionSettings,
      chatCompletionSettings: {
        chat_completion_source: 'custom',
        openai_model: current.model,
        custom_model: current.model,
        temperature: current.temperature,
        openai_max_tokens: current.maxTokens,
      },
      textCompletionSettings: {},
      powerUserSettings: {},
      worldInfoSettings: {},
      slashCommandSettings: {},
      activeCharacter: character
        ? {
            name: character.name,
            avatar: `${character.id}.png`,
            description: character.description,
            personality: character.personality,
            scenario: character.scenario,
            first_mes: character.firstMes,
            mes_example: character.mesExample,
          }
        : undefined,
      ToolManager: {
        registerFunctionTool: () => undefined,
        unregisterFunctionTool: () => undefined,
        isToolCallingSupported: () => false,
        canPerformToolCalls: () => false,
        registerFunctionToolAsync: () => Promise.resolve(),
      },
      getCurrentChatId: () => chatId,
      getCurrentChat: () => chatOf(chatId),
      getRequestHeaders: () => ({
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'lite-tavern',
      }),
      saveChat: () => Promise.resolve(),
      saveChatConditional: () => Promise.resolve(),
      saveSettingsDebounced: () => saveExtensionSettings(),
      saveMetadata: () => Promise.resolve(),
      saveMetadataDebounced: () => Promise.resolve(),
      getCharacterCardFields: () => ({
        description: character?.description ?? '',
        personality: character?.personality ?? '',
        scenario: character?.scenario ?? '',
        first_mes: character?.firstMes ?? '',
        mes_example: character?.mesExample ?? '',
        system_prompt: character?.systemPrompt ?? '',
        post_history_instructions: character?.postHistoryInstructions ?? '',
      }),
      getCurrentLocale: () => 'zh-CN',
      getChatCompletionModel: () => current.model,
      getChatCompletionModelList: () => Promise.resolve({ data: [{ id: current.model }] }),
      loadWorldInfo: (name: string) => Promise.resolve(worldInfoObject(name)),
      getWorldInfo: (name: string) => worldInfoObject(name),
      registerMacro: (name: string, fn: any) => macroLikes.set(name, fn),
      unregisterMacro: (name: string) => macroLikes.delete(name),
      callGenericPopup: async (
        content: string,
        type: number = POPUP_TYPE.TEXT,
        input: string = '',
        options: any = {},
      ) => {
        const kind =
          type === POPUP_TYPE.CONFIRM ? 'confirm' : type === POPUP_TYPE.INPUT ? 'input' : 'text';
        const result = await showPopup(String(content ?? ''), kind, input, options ?? {});
        if (kind === 'confirm')
          return result === 1 ? POPUP_RESULT.AFFIRMATIVE : POPUP_RESULT.NEGATIVE;
        return result;
      },
      POPUP_TYPE,
      POPUP_RESULT,
      toastr: makeToastr(),
      substituteParams: (text: string) => substitute(chatId, String(text ?? '')),
      substituteParamsExtended: (text: string) => substitute(chatId, String(text ?? '')),
      messageFormatting: (text: string) => text,
      chat_metadata: { variables: getVariables(chatId, { type: 'chat' }) },
      extensionPrompts: injectedPrompts,
      rawPrompt: [],
    };
    return context;
  };

  /* ------------------------------------------------------------------ *
   * Public API object
   * ------------------------------------------------------------------ */
  const api: Record<string, any> = {
    _th_impl: {
      _init: () => undefined,
      _log: (...args: any[]) => console.log('[tavern_helper]', ...args),
      _clearLog: () => undefined,
      writeExtensionField: (field: string, value: unknown) => {
        const character = characterOf(chatId);
        if (!character) return undefined;
        void field;
        return value;
      },
    },

    // events
    eventOn: safe(on),
    eventOnButton: safe((buttonName: string, listener: any) =>
      on(buttonEvent(buttonName), listener),
    ),
    eventOnce: safe(once),
    eventMakeFirst: safe((event: string, listener: any) => {
      eventBus.makeFirst(event, listener);
      listeners.add({ event, listener });
      return { stop: () => removeListener(event, listener) };
    }),
    eventMakeLast: safe((event: string, listener: any) => {
      eventBus.makeLast(event, listener);
      listeners.add({ event, listener });
      return { stop: () => removeListener(event, listener) };
    }),
    eventEmit: safe((event: string, ...args: any[]) => eventBus.emit(event, ...args)),
    eventEmitAndWait: safe((event: string, ...args: any[]) => eventBus.emit(event, ...args)),
    eventRemoveListener: safe(removeListener),
    eventClearEvent: safe((event: string) => {
      for (const item of [...listeners]) {
        if (item.event === event) {
          eventBus.removeListener(item.event, item.listener);
          listeners.delete(item);
        }
      }
    }),
    eventClearListener: safe((listener: any) => {
      for (const item of [...listeners]) {
        if (item.listener === listener) {
          eventBus.removeListener(item.event, item.listener);
          listeners.delete(item);
        }
      }
    }),
    eventClearAll: safe(clearAll),
    tavern_events,
    iframe_events,

    // variables
    getVariables: safe(apiGetVariables),
    getAllVariables: safe(() => {
      const merged: Record<string, any> = {};
      Object.assign(merged, getVariables(chatId, { type: 'global' }));
      Object.assign(merged, getVariables(chatId, { type: 'character' }));
      Object.assign(merged, getVariables(chatId, { type: 'script', script_id: scriptId() }));
      Object.assign(merged, getVariables(chatId, { type: 'chat' }));
      Object.assign(merged, getVariables(chatId, { type: 'message', message_id: 'latest' }));
      return merged;
    }),
    replaceVariables: safe(apiReplaceVariables),
    updateVariablesWith: safe(apiUpdateVariablesWith),
    insertVariables: safe(apiInsert),
    insertOrAssignVariables: safe(apiInsertOrAssign),
    deleteVariable: safe(apiDeleteVariable),
    registerVariableSchema: () => undefined,

    // messages
    getChatMessages: safe(apiGetChatMessages),
    setChatMessages: safe(apiSetChatMessages),
    setChatMessage: safe(apiSetChatMessage),
    createChatMessages: safe(apiCreateChatMessages),
    deleteChatMessages: safe(apiDeleteChatMessages),
    rotateChatMessages: () => undefined,
    formatAsDisplayedMessage: (text: string) =>
      apiFormatAsTavernRegexedString(text, 'ai_output', 'display'),
    retrieveDisplayedMessage: (text: string) => text,
    refreshOneMessage: () => undefined,

    // script buttons
    getScriptButtons: safe(apiGetScriptButtons),
    replaceScriptButtons: safe(apiReplaceScriptButtons),
    appendInexistentScriptButtons: safe(apiAppendInexistentScriptButtons),
    updateScriptButtonsWith: safe(apiUpdateScriptButtonsWith),
    getButtonEvent: safe(buttonEvent),
    getAllEnabledScriptButtons: safe(() => ({})),
    getScriptTrees: () => [],
    replaceScriptTrees: () => undefined,
    updateScriptTreesWith: (value: any) => value,

    // identity
    getScriptId: safe(scriptId),
    getScriptName: safe(() => cfg.scriptName ?? ''),
    getScriptInfo: () => '',
    replaceScriptInfo: () => undefined,
    getIframeName: safe(iframeName),
    getCurrentMessageId: safe(currentMessageId),
    getLastMessageId: safe(getLastMessageId),
    getMessageId: safe(getLastMessageId),
    errorCatched:
      (fn: any) =>
      (...args: any[]) => {
        try {
          return fn?.(...args);
        } catch (error) {
          console.error('[轻语酒馆] 脚本报错', error);
          return undefined;
        }
      },

    // globals
    initializeGlobal: safe(apiInitializeGlobal),
    waitGlobalInitialized: safe(apiWaitGlobalInitialized),
    registerMacroLike: safe(apiRegisterMacroLike),
    unregisterMacroLike: safe((pattern: string) => macroLikes.delete(pattern)),

    // macros
    substitudeMacros: safe((text: string) => substitute(chatId, String(text ?? ''))),

    // regex
    formatAsTavernRegexedString: safe(apiFormatAsTavernRegexedString),
    getTavernRegexes: safe(apiGetTavernRegexes),
    isCharacterTavernRegexesEnabled: () => true,
    replaceTavernRegexes: () => undefined,
    updateTavernRegexesWith: (value: any) => value,

    // slash + generation
    triggerSlash: safe(apiTriggerSlash),
    triggerSlashWithResult: safe(apiTriggerSlash),
    generate: safe(apiGenerate),
    generateRaw: safe(apiGenerateRaw),
    stopGenerationById: () => undefined,
    stopAllGeneration: () => undefined,
    getModelList: () => Promise.resolve([settings().model]),
    getProxyPresetNames: () => [],

    // prompts
    injectPrompts: safe(apiInjectPrompts),
    uninjectPrompts: safe(apiUninjectPrompts),
    builtin_prompt_default_order: [],

    // world books
    getWorldbookNames: safe(() => booksOfCharacter().map((b) => b.name)),
    getGlobalWorldbookNames: () => [],
    rebindGlobalWorldbooks: () => undefined,
    getCharWorldbookNames: safe(() => {
      const list = booksOfCharacter();
      return { primary: list[0]?.name ?? null, additional: list.slice(1).map((b) => b.name) };
    }),
    rebindCharWorldbooks: () => undefined,
    getChatWorldbookName: () => null,
    rebindChatWorldbook: () => undefined,
    getOrCreateChatWorldbook: () => Promise.resolve(null),
    createWorldbook: () => Promise.resolve(null),
    createOrReplaceWorldbook: () => Promise.resolve(null),
    deleteWorldbook: () => Promise.resolve(),
    getWorldbook: safe((name: string) =>
      lorebookEntries(name).map((entry: any) => ({ ...entry, uid: entry.uid })),
    ),
    replaceWorldbook: () => Promise.resolve(),
    updateWorldbookWith: (value: any) => value,
    createWorldbookEntries: () => Promise.resolve([]),
    deleteWorldbookEntries: () => Promise.resolve([]),
    getLorebooks: safe(() => booksOfCharacter().map((b) => b.name)),
    getLorebookEntries: safe((name: string) => lorebookEntries(name)),
    getLorebookSettings: () =>
      ({
        selected_global_lorebooks: booksOfCharacter().map((b) => b.name),
        scan_depth: 2,
        context_percentage: 100,
        budget_cap: 0,
        min_activations: 0,
        max_depth: 0,
        max_recursion_steps: 0,
        insertion_strategy: 'character_first',
        include_names: false,
        recursive: true,
        case_sensitive: false,
        match_whole_words: false,
        use_group_scoring: false,
        overflow_alert: false,
      }) as any,
    setLorebookSettings: () => undefined,
    getCharLorebooks: safe(() => {
      const list = booksOfCharacter();
      return { primary: list[0]?.name ?? null, additional: list.slice(1).map((b) => b.name) };
    }),
    setCurrentCharLorebooks: () => undefined,
    getCurrentCharPrimaryLorebook: safe(() => booksOfCharacter()[0]?.name ?? null),
    getChatLorebook: () => null,
    setChatLorebook: () => undefined,
    getOrCreateChatLorebook: () => Promise.resolve(null),
    createLorebook: () => Promise.resolve(null),
    deleteLorebook: () => Promise.resolve(),
    createLorebookEntry: () => Promise.resolve(null),
    createLorebookEntries: () => Promise.resolve([]),
    deleteLorebookEntry: () => Promise.resolve(),
    deleteLorebookEntries: () => Promise.resolve(),
    replaceLorebookEntries: () => Promise.resolve(),
    updateLorebookEntriesWith: (value: any) => value,
    setLorebookEntries: () => Promise.resolve(),

    // characters (read-only)
    getCharacterNames: safe(() => state().characters.map((c) => c.name)),
    getCharacterIds: safe(() => state().characters.map((c) => c.id)),
    getCurrentCharacterName: safe(() => characterOf(chatId)?.name ?? ''),
    getCurrentCharacterId: safe(() => characterOf(chatId)?.id ?? ''),
    getCharacter: safe((id: string) => state().characters.find((c) => c.id === id) ?? null),
    createCharacter: () => Promise.resolve(null),
    createOrReplaceCharacter: () => Promise.resolve(null),
    deleteCharacter: () => Promise.resolve(),
    replaceCharacter: () => Promise.resolve(),
    updateCharacterWith: (value: any) => value,
    getCharData: safe(() => {
      const character = characterOf(chatId);
      return character ? { ...character } : null;
    }),
    getCharAvatarPath: safe(() => characterOf(chatId)?.avatar ?? ''),
    getChatHistoryBrief: safe(() =>
      messagesOf(chatId).map((m) => ({ role: m.role, message: m.content })),
    ),
    getChatHistoryDetail: safe(() =>
      messagesOf(chatId).map((m) => ({ role: m.role, message: m.content })),
    ),

    // presets / personas / extensions (stubs)
    getPresetNames: () => [],
    getLoadedPresetName: () => '',
    loadPreset: () => undefined,
    createPreset: () => Promise.resolve(null),
    createOrReplacePreset: () => Promise.resolve(null),
    deletePreset: () => Promise.resolve(),
    renamePreset: () => Promise.resolve(),
    getPreset: () => null,
    replacePreset: () => Promise.resolve(),
    updatePresetWith: (value: any) => value,
    setPreset: () => undefined,
    isPresetNormalPrompt: () => false,
    isPresetSystemPrompt: () => false,
    isPresetPlaceholderPrompt: () => false,
    default_preset: {},
    getPersonaNames: () => [],
    getPersonaIds: () => [],
    getCurrentPersonaName: safe(() => settings().userName),
    getCurrentPersonaId: () => '',
    getPersonaAvatarPath: () => '',
    createPersona: () => Promise.resolve(null),
    createOrReplacePersona: () => Promise.resolve(null),
    deletePersona: () => Promise.resolve(),
    getPersona: () => null,
    replacePersona: () => Promise.resolve(),
    updatePersonaWith: (value: any) => value,

    isAdmin: () => true,
    getTavernHelperExtensionId: () => 'JS-Slash-Runner',
    getExtensionType: () => 'local',
    getExtensionStatus: () => ({ isInstalled: true, isUpToDate: true }),
    isInstalledExtension: () => true,
    installExtension: () => Promise.resolve(),
    uninstallExtension: () => Promise.resolve(),
    reinstallExtension: () => Promise.resolve(),
    updateExtension: () => Promise.resolve(),
    importRawCharacter: () => Promise.resolve(null),
    importRawPreset: () => Promise.resolve(null),
    importRawChat: () => Promise.resolve(null),
    importRawWorldbook: () => Promise.resolve(null),
    importRawTavernRegex: () => [],

    getTavernHelperVersion: () => HELPERS_VERSION,
    getFrontendVersion: () => HELPERS_VERSION,
    getTavernVersion: () => TAVERN_VERSION,
    updateTavernHelper: () => Promise.resolve(),
    updateFrontendVersion: () => Promise.resolve(),

    // audio (stubs)
    audioEnable: () => undefined,
    audioImport: () => Promise.resolve(),
    audioMode: () => 'play',
    audioPlay: () => undefined,
    audioSelect: () => undefined,
    playAudio: () => Promise.resolve(),
    pauseAudio: () => undefined,
    getAudioList: () => [],
    replaceAudioList: () => undefined,
    appendAudioList: () => undefined,
    getAudioSettings: () => ({}) as any,
    setAudioSettings: () => undefined,
    getCurrentAudio: () => null,

    builtin: { prompt: {} },

    // Markdown helpers card scripts occasionally reach for.
    showdown: {
      makeHtml: (text: string) => renderMarkdown(String(text ?? '')),
      Converter: function Converter() {
        return { makeHtml: (text: string) => renderMarkdown(String(text ?? '')) };
      },
    },
  };

  // Bound variants that card scripts call as bare globals.
  const bound: Record<string, any> = {
    ...api,
    getVariables: apiGetVariables,
    replaceVariables: apiReplaceVariables,
    updateVariablesWith: apiUpdateVariablesWith,
    insertVariables: apiInsert,
    insertOrAssignVariables: apiInsertOrAssign,
    deleteVariable: apiDeleteVariable,
    getChatMessages: apiGetChatMessages,
    setChatMessages: apiSetChatMessages,
    createChatMessages: apiCreateChatMessages,
    deleteChatMessages: apiDeleteChatMessages,
    eventOn: on,
    eventOnce: once,
    eventMakeFirst: api.eventMakeFirst,
    eventMakeLast: api.eventMakeLast,
    eventEmit: api.eventEmit,
    eventRemoveListener: removeListener,
    eventClearEvent: api.eventClearEvent,
    eventClearListener: api.eventClearListener,
    eventClearAll: clearAll,
    getScriptButtons: apiGetScriptButtons,
    replaceScriptButtons: apiReplaceScriptButtons,
    appendInexistentScriptButtons: apiAppendInexistentScriptButtons,
    updateScriptButtonsWith: apiUpdateScriptButtonsWith,
    getButtonEvent: buttonEvent,
    getScriptId: scriptId,
    getIframeName: iframeName,
    getCurrentMessageId: currentMessageId,
    getMessageId: getLastMessageId,
    getLastMessageId,
    substitudeMacros: api.substitudeMacros,
    formatAsTavernRegexedString: apiFormatAsTavernRegexedString,
    getTavernRegexes: apiGetTavernRegexes,
    triggerSlash: apiTriggerSlash,
    triggerSlashWithResult: apiTriggerSlash,
    generate: apiGenerate,
    generateRaw: apiGenerateRaw,
    initializeGlobal: apiInitializeGlobal,
    waitGlobalInitialized: apiWaitGlobalInitialized,
    registerMacroLike: apiRegisterMacroLike,
    unregisterMacroLike: api.unregisterMacroLike,
    injectPrompts: apiInjectPrompts,
    uninjectPrompts: apiUninjectPrompts,
    errorCatched: api.errorCatched,
    getTavernHelperVersion: api.getTavernHelperVersion,
    getFrontendVersion: api.getFrontendVersion,
    getTavernVersion: api.getTavernVersion,
    tavern_events,
    iframe_events,
    getCharacterNames: api.getCharacterNames,
    getCurrentCharacterName: api.getCurrentCharacterName,
    getCharData: api.getCharData,
    getLorebookEntries: api.getLorebookEntries,
    getWorldbook: api.getWorldbook,
    getWorldbookNames: api.getWorldbookNames,
    getCharWorldbookNames: api.getCharWorldbookNames,
    getAllEnabledScriptButtons: api.getAllEnabledScriptButtons,
    getScriptTrees: api.getScriptTrees,
    replaceScriptTrees: api.replaceScriptTrees,
    updateScriptTreesWith: api.updateScriptTreesWith,
    _th_impl: api._th_impl,
  };

  // SillyTavern object: a live view over the app.
  const sillyTavern: Record<string, any> = {
    getContext: () => ({
      ...buildContext(),
      writeExtensionField: api._th_impl.writeExtensionField,
    }),
  };
  for (const key of [
    'chat',
    'characters',
    'characterId',
    'name2',
    'chatMetadata',
    'chatId',
    'extensionSettings',
  ]) {
    Object.defineProperty(sillyTavern, key, {
      get: () => buildContext()[key],
      configurable: true,
    });
  }
  for (const key of [
    'getCurrentChatId',
    'getCurrentChat',
    'getRequestHeaders',
    'saveChat',
    'saveChatConditional',
    'saveSettingsDebounced',
    'saveMetadata',
    'saveMetadataDebounced',
    'getCharacterCardFields',
    'getCurrentLocale',
    'getChatCompletionModel',
    'getChatCompletionModelList',
    'loadWorldInfo',
    'getWorldInfo',
    'registerMacro',
    'unregisterMacro',
    'callGenericPopup',
    'substituteParams',
    'substituteParamsExtended',
    'messageFormatting',
  ]) {
    Object.defineProperty(sillyTavern, key, {
      get: () => buildContext()[key],
      configurable: true,
    });
  }
  sillyTavern.POPUP_TYPE = POPUP_TYPE;
  sillyTavern.POPUP_RESULT = POPUP_RESULT;
  sillyTavern.toastr = makeToastr();
  sillyTavern.chat_metadata = { variables: getVariables(chatId, { type: 'chat' }) };

  return {
    ...bound,
    TavernHelper: bound,
    SillyTavern: sillyTavern,
    toastr: makeToastr(),
    _boundApi: bound,
    _dispose: clearAll,
  };
}

function makeToastr() {
  const show = (type: 'info' | 'success' | 'error') => (message: unknown) => {
    try {
      const text = typeof message === 'string' ? message : JSON.stringify(message);
      useStore.getState().toast(String(text ?? ''), type);
    } catch {
      // ignore
    }
  };
  return {
    info: show('info'),
    success: show('success'),
    warning: show('info'),
    error: show('error'),
    clear: () => undefined,
    remove: () => undefined,
  };
}

export function getInjectedPrompts(): { id: string; content: string }[] {
  return injectedPrompts;
}
