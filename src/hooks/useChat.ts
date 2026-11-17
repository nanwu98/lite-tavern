import { useCallback, useRef, useState } from 'react';
import { useStore, activeChat, booksForCharacter } from '../store';
import { buildPrompt } from '../lib/prompt';
import { streamChat, ApiError } from '../lib/api';
import { compactChat, canCompact, AUTO_COMPACT_RATIO, COMPACT_KEEP_RECENT } from '../lib/compact';
import { formatTokenCount } from '../lib/tokens';
import { eventBus, tavern_events } from '../lib/tavern/events';
import { settingsForChat } from '../lib/chatSettings';
import type { ChatMessage } from '../types';

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function messageIndexOf(chatId: string, messageId: string): number {
  const chat = useStore.getState().chats.find((c) => c.id === chatId);
  return chat ? chat.messages.findIndex((m) => m.id === messageId) : -1;
}

function emitChatEvent(event: string, chatId: string, messageId?: string, ...rest: unknown[]) {
  const index = messageId ? messageIndexOf(chatId, messageId) : -1;
  if (messageId && index < 0) return;
  if (index >= 0) void eventBus.emit(event, index, ...rest);
  else void eventBus.emit(event, ...rest);
}

export function useChat(onNeedSettings: () => void) {
  const abortRef = useRef<AbortController | null>(null);
  const busyChatId = useStore((s) => s.busyChatId);
  const [compacting, setCompacting] = useState(false);

  const run = useCallback(
    async (
      chatId: string,
      assistantId: string,
      messages: ChatMessage[],
      modelSettings = useStore.getState().settings,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      let pending = '';
      let lastFlush = 0;
      const chatState = useStore.getState();
      const chat = chatState.chats.find((c) => c.id === chatId);
      const character = chat
        ? chatState.characters.find((c) => c.id === chat.characterId)
        : undefined;
      if (!chat || !character) {
        useStore.getState().failMessage(chatId, assistantId, '角色卡不存在，无法发送。');
        return;
      }
      // This chat may carry its own context window; fold it in before anything
      // reads `contextLimit` (auto-compaction, the summarizer, the usage meter).
      const chatSettings = settingsForChat(modelSettings, chat);
      const books = booksForCharacter(chatState, character);

      /** Builds the prompt from the newest state (messages change during compaction). */
      const prepare = () => {
        const latest = useStore.getState().chats.find((c) => c.id === chatId);
        return buildPrompt(
          character,
          books,
          latest?.messages ?? messages,
          chatSettings,
          latest?.compaction,
        );
      };

      let prompt;
      try {
        prompt = prepare();
      } catch (error) {
        useStore.getState().failMessage(chatId, assistantId, `构建提示词失败：${errorText(error)}`);
        return;
      }

      // Automatic compaction: once the estimated prompt reaches 80% of the
      // window, fold the oldest messages into the rolling memory first.
      if (chatSettings.autoCompact) {
        const limit = Math.max(1000, Math.round(chatSettings.contextLimit) || 65536);
        if (prompt.tokens >= limit * AUTO_COMPACT_RATIO) {
          const latest = useStore.getState().chats.find((c) => c.id === chatId);
          if (latest && canCompact(latest)) {
            const percent = Math.min(99, Math.round((prompt.tokens / limit) * 100));
            useStore.getState().toast(`上下文已到 ${percent}%，正在自动压缩…`, 'info');
            try {
              await compactChat(chatId, {
                settings: chatSettings,
                character,
                signal: controller.signal,
              });
              prompt = prepare();
            } catch (error) {
              if (!controller.signal.aborted) {
                // Compaction is an optimization: keep the untrimmed prompt and
                // let the provider decide whether it still fits.
                useStore.getState().toast(`自动压缩失败：${errorText(error)}`, 'error');
              }
            }
          }
        }
      }
      useStore.getState().setMessageLore(chatId, assistantId, prompt.activeTitles);

      const flush = (force = false) => {
        if (!pending) return;
        if (!force && Date.now() - lastFlush < 45) return;
        const delta = pending;
        pending = '';
        lastFlush = Date.now();
        useStore.getState().appendDelta(chatId, assistantId, delta);
      };

      void eventBus.emit(tavern_events.GENERATION_STARTED, 'normal', {}, false);

      try {
        const full = await streamChat({
          settings: modelSettings,
          messages: prompt.messages,
          signal: controller.signal,
          onDelta: (text) => {
            pending += text;
            flush();
          },
        });
        flush(true);
        if (!full.trim()) {
          useStore.getState().failMessage(chatId, assistantId, '模型返回了空内容，请重试。');
          return;
        }
        useStore.getState().finishMessage(chatId, assistantId);
        emitChatEvent(tavern_events.MESSAGE_RECEIVED, chatId, assistantId, 'normal');
        emitChatEvent(tavern_events.CHARACTER_MESSAGE_RENDERED, chatId, assistantId);
        void eventBus.emit(tavern_events.GENERATION_ENDED, assistantId);
      } catch (error) {
        flush(true);
        const current = useStore
          .getState()
          .chats.find((c) => c.id === chatId)
          ?.messages.find((m) => m.id === assistantId);
        const partial = current?.content ?? '';
        if (controller.signal.aborted) {
          useStore.getState().finishMessage(chatId, assistantId, 'stopped');
          void eventBus.emit(tavern_events.GENERATION_STOPPED);
          return;
        }
        const message = errorText(error);
        const contextOverflow = error instanceof ApiError && error.kind === 'context';
        if (partial.trim()) {
          useStore.getState().appendDelta(chatId, assistantId, `\n\n> ⚠️ 回复中断：${message}`);
          useStore.getState().finishMessage(chatId, assistantId, 'stopped');
          useStore.getState().toast(message, 'error');
        } else {
          let text = message;
          const detected = error instanceof ApiError ? error.limitTokens : undefined;
          if (contextOverflow && detected) {
            // Learn the real window so the automatic trigger works next time.
            useStore.getState().updateSettings({ contextLimit: detected });
            text += `\n\n已按服务端提示把上下文上限校准为 ${detected.toLocaleString('en-US')} tokens。`;
          }
          useStore
            .getState()
            .failMessage(chatId, assistantId, text, contextOverflow ? 'context' : 'other');
        }
        void eventBus.emit(tavern_events.GENERATION_STOPPED);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [],
  );

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      const state = useStore.getState();
      if (state.busyChatId) return;
      const chat = activeChat(state);
      if (!chat) {
        state.toast('请先从右侧选择一张角色卡', 'info');
        return;
      }
      if (!state.settings.apiKey.trim()) {
        state.toast('请先在设置里填写 API Key', 'error');
        onNeedSettings();
        return;
      }
      // Order matters for card scripts: the user message must exist and be
      // announced before the assistant placeholder is created (MVU derives the
      // message id it will initialize from `getLastMessageId() + 1`).
      const userId = state.pushMessage(chat.id, 'user', text);
      if (!userId) return;
      const afterPush = useStore.getState();
      const pushedChat = afterPush.chats.find((c) => c.id === chat.id);
      if (!pushedChat) return;
      const userIndex = pushedChat.messages.findIndex((m) => m.id === userId);
      void eventBus.emit(tavern_events.MESSAGE_SENT, userIndex);
      void eventBus.emit(tavern_events.USER_MESSAGE_RENDERED, userIndex);

      const assistantId = useStore.getState().beginAssistant(chat.id);
      if (!assistantId) return;
      const updatedChat = useStore.getState().chats.find((c) => c.id === chat.id);
      if (!updatedChat) return;
      await run(chat.id, assistantId, updatedChat.messages);
    },
    [onNeedSettings, run],
  );

  /** Compresses the current chat manually (settings / header button / error card). */
  const compactNow = useCallback(
    async (options?: { keepRecent?: number }): Promise<boolean> => {
      const state = useStore.getState();
      if (state.busyChatId) return false;
      const chat = activeChat(state);
      if (!chat) return false;
      if (!state.settings.apiKey.trim()) {
        state.toast('压缩需要调用模型：请先在设置里填写 API Key', 'error');
        onNeedSettings();
        return false;
      }
      setCompacting(true);
      try {
        const result = await compactChat(chat.id, {
          settings: state.settings,
          keepRecent: options?.keepRecent,
        });
        useStore
          .getState()
          .toast(
            `已压缩 ${result.compactedMessages} 条历史，省下约 ${formatTokenCount(result.savedTokens)} tokens`,
            'success',
          );
        return true;
      } catch (error) {
        useStore.getState().toast(`压缩失败：${errorText(error)}`, 'error');
        return false;
      } finally {
        setCompacting(false);
      }
    },
    [onNeedSettings],
  );

  /**
   * "One-click compact and continue": compresses the chat, drops the failed
   * reply and generates a new one from the compacted context.
   */
  const compactAndContinue = useCallback(
    async (chatId: string, failedMessageId: string) => {
      const state = useStore.getState();
      if (state.busyChatId) return;
      if (!state.settings.apiKey.trim()) {
        state.toast('压缩需要调用模型：请先在设置里填写 API Key', 'error');
        onNeedSettings();
        return;
      }
      setCompacting(true);
      try {
        const result = await compactChat(chatId, {
          settings: state.settings,
          keepRecent: Math.min(4, COMPACT_KEEP_RECENT),
        });
        useStore
          .getState()
          .toast(`已压缩 ${result.compactedMessages} 条历史，继续生成回复…`, 'success');
      } catch (error) {
        useStore.getState().toast(`压缩失败：${errorText(error)}`, 'error');
        setCompacting(false);
        return;
      }
      try {
        useStore.getState().removeMessage(chatId, failedMessageId);
        const assistantId = useStore.getState().beginAssistant(chatId);
        if (!assistantId) return;
        const freshChat = useStore.getState().chats.find((c) => c.id === chatId);
        if (!freshChat) return;
        await run(chatId, assistantId, freshChat.messages);
      } finally {
        setCompacting(false);
      }
    },
    [onNeedSettings, run],
  );

  const regenerate = useCallback(async () => {
    const state = useStore.getState();
    if (state.busyChatId) return;
    const chat = activeChat(state);
    if (!chat) return;
    if (!state.settings.apiKey.trim()) {
      state.toast('请先在设置里填写 API Key', 'error');
      onNeedSettings();
      return;
    }
    const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;
    // Regenerating keeps the previous text as an older swipe variant.
    const started = state.startAssistantSwipe(chat.id, lastAssistant.id);
    if (!started) return;
    const freshChat = useStore.getState().chats.find((c) => c.id === chat.id);
    if (!freshChat) return;
    await run(chat.id, lastAssistant.id, freshChat.messages);
  }, [onNeedSettings, run]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Generates a reply for the current history without adding a user turn. */
  const generateReply = useCallback(async () => {
    const state = useStore.getState();
    if (state.busyChatId) return;
    const chat = activeChat(state);
    if (!chat) return;
    if (!state.settings.apiKey.trim()) {
      state.toast('请先在设置里填写 API Key', 'error');
      onNeedSettings();
      return;
    }
    if (!chat.messages.some((m) => m.role === 'user')) {
      state.toast('还没有可以生成回复的内容', 'info');
      return;
    }
    const assistantId = useStore.getState().beginAssistant(chat.id);
    if (!assistantId) return;
    const freshChat = useStore.getState().chats.find((c) => c.id === chat.id);
    if (!freshChat) return;
    await run(chat.id, assistantId, freshChat.messages);
  }, [onNeedSettings, run]);

  return {
    send,
    regenerate,
    generateReply,
    stop,
    busyChatId,
    compacting,
    compactNow,
    compactAndContinue,
  };
}

export type ChatActions = ReturnType<typeof useChat>;
