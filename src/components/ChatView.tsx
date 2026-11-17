import { useEffect, useMemo, useRef, useState } from 'react';
import type { Character, Chat, ChatMessage, WorldBook } from '../types';
import { useStore, messageVariants, activeSwipeIndex } from '../store';
import { useChat } from '../hooks/useChat';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { ChatSettingsModal } from './ChatSettingsModal';
import {
  IconBook,
  IconCheck,
  IconCompress,
  IconCopy,
  IconEdit,
  IconMenu,
  IconPlus,
  IconRefresh,
  IconSend,
  IconSettings,
  IconSliders,
  IconStop,
  IconTrash,
} from './Icons';
import { copyText } from '../lib/format';
import { formatTime } from '../lib/util';
import { formatLimit, formatTokenCount } from '../lib/tokens';
import { contextUsage, AUTO_COMPACT_RATIO } from '../lib/compact';
import { settingsForChat } from '../lib/chatSettings';
import { MessageContent } from './MessageContent';
import { ScriptButtonBar, ScriptHost } from './ScriptHost';
import { displayText } from '../lib/tavern/display';
import { chatActions } from '../lib/tavern/bus';
import { eventBus, tavern_events } from '../lib/tavern/events';
import { ensureChatScope } from '../lib/tavern/variables';

interface ChatViewProps {
  chat: Chat;
  character: Character;
  books: WorldBook[];
  onOpenChats: () => void;
  onOpenCards: () => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onDeleteChat: () => void;
  /** A newer release was found and the settings have not been opened since. */
  updateReady?: boolean;
}

function AssistantAvatar({ character, size = 34 }: { character: Character; size?: number }) {
  return <Avatar src={character.avatar} name={character.name} size={size} />;
}

function SwipeControls({
  message,
  onSelect,
}: {
  message: ChatMessage;
  onSelect: (index: number) => void;
}) {
  const variants = messageVariants(message);
  if (variants.length <= 1) return null;
  const index = activeSwipeIndex(message);
  return (
    <span className="swipe-controls" title={`第 ${index + 1} / ${variants.length} 版`}>
      <button
        className="swipe-btn"
        onClick={() => onSelect(index - 1)}
        disabled={index <= 0}
        aria-label="上一版"
      >
        ‹
      </button>
      <span className="swipe-count">
        {index + 1}/{variants.length}
      </span>
      <button
        className="swipe-btn"
        onClick={() => onSelect(index + 1)}
        disabled={index >= variants.length - 1}
        aria-label="下一版"
      >
        ›
      </button>
    </span>
  );
}

function MessageRow({
  message,
  character,
  chatId,
  index,
  totalMessages,
  isLastAssistant,
  busy,
  compacting,
  onRegenerate,
  onCompactContinue,
  onShowLore,
  onSelectSwipe,
  onEdit,
}: {
  message: ChatMessage;
  character: Character;
  chatId: string;
  index: number;
  totalMessages: number;
  isLastAssistant: boolean;
  busy: boolean;
  compacting: boolean;
  onRegenerate: () => void;
  onCompactContinue: () => void;
  onShowLore: (titles: string[]) => void;
  onSelectSwipe: (index: number) => void;
  onEdit: (text: string) => void;
}) {
  const toast = useStore((s) => s.toast);
  const settings = useStore((s) => s.settings);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const editRef = useRef<HTMLTextAreaElement | null>(null);
  const depth = Math.max(0, totalMessages - 1 - index);
  const displayed = useMemo(
    () => displayText(message.content, character, settings, depth, message.role),
    [message.role, message.content, character, settings, depth],
  );

  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    el.style.height = 'auto';
    el.style.height = `${Math.min(420, el.scrollHeight)}px`;
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const copy = async () => {
    const ok = await copyText(message.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } else {
      toast('复制失败，请手动选中文本', 'error');
    }
  };

  const startEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const saveEdit = () => {
    const text = draft.trim();
    if (!text) {
      toast('内容不能为空', 'error');
      return;
    }
    onEdit(text);
    setEditing(false);
  };

  const editor = (
    <div className="msg-editor">
      <textarea
        ref={editRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${Math.min(420, el.scrollHeight)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveEdit();
          }
        }}
        rows={4}
        aria-label="编辑消息"
      />
      <div className="msg-editor-actions">
        <span className="muted msg-editor-hint">Ctrl + Enter 保存 · Esc 取消</span>
        <button className="btn btn-small btn-ghost" onClick={() => setEditing(false)}>
          取消
        </button>
        <button className="btn btn-small btn-accent" onClick={saveEdit}>
          保存
        </button>
      </div>
    </div>
  );

  if (message.role === 'user') {
    return (
      <div className="msg-row msg-user">
        <div className="msg-body">
          {editing ? (
            editor
          ) : (
            <div className="bubble bubble-user" onDoubleClick={startEdit}>
              {message.content}
            </div>
          )}
          <div className="msg-meta meta-right">
            <SwipeControls message={message} onSelect={onSelectSwipe} />
            <span>{formatTime(message.createdAt)}</span>
            {!editing && (
              <button className="meta-btn" onClick={startEdit} title="编辑这条消息">
                <IconEdit width={13} height={13} />
              </button>
            )}
            <button className="meta-btn" onClick={copy} title="复制">
              {copied ? <IconCheck width={13} height={13} /> : <IconCopy width={13} height={13} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showActions = !busy || !isLastAssistant;
  const isStreaming = message.status === 'streaming';
  return (
    <div className="msg-row msg-assistant">
      <AssistantAvatar character={character} />
      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-author">{character.name}</span>
          <span>{formatTime(message.createdAt)}</span>
          {message.greeting && <span className="tag tag-ghost">开场白</span>}
          {message.edited && <span className="tag tag-ghost">已编辑</span>}
          {!isStreaming && <SwipeControls message={message} onSelect={onSelectSwipe} />}
          {message.loreTitles && message.loreTitles.length > 0 && (
            <button
              className="lore-badge"
              onClick={() => onShowLore(message.loreTitles ?? [])}
              title={message.loreTitles.join('、')}
            >
              <IconBook width={12} height={12} /> 世界书 {message.loreTitles.length}
            </button>
          )}
        </div>
        {editing ? (
          editor
        ) : message.status === 'error' ? (
          <div className={`message-error ${message.errorKind === 'context' ? 'is-context' : ''}`}>
            <div className="message-error-title">
              {message.errorKind === 'context' ? '上下文超出上限' : '回复失败'}
            </div>
            <div className="message-error-text">{message.content}</div>
            <div className="message-error-actions">
              {message.errorKind === 'context' && (
                <button
                  className="btn btn-small btn-accent"
                  onClick={onCompactContinue}
                  disabled={compacting}
                  title="把较早的对话压缩成一段记忆，然后继续生成"
                >
                  <IconCompress width={14} height={14} />
                  {compacting ? '压缩中…' : '一键压缩上下文并继续对话'}
                </button>
              )}
              <button
                className="btn btn-small btn-ghost"
                onClick={onRegenerate}
                disabled={compacting}
              >
                <IconRefresh width={14} height={14} /> 重试
              </button>
            </div>
          </div>
        ) : (
          <div className={`bubble bubble-assistant ${isStreaming ? 'is-streaming' : ''}`}>
            {message.content ? (
              <MessageContent
                content={displayed}
                chatId={chatId}
                messageIndex={index}
                allowFrames={!isStreaming && settings.cardScripts}
              />
            ) : isStreaming ? (
              <span className="typing-dots">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <span className="muted">（空回复）</span>
            )}
            {isStreaming && message.content && <span className="stream-caret" />}
          </div>
        )}
        <div className="msg-meta">
          {message.status === 'stopped' && <span className="muted">已停止</span>}
          {showActions && !editing && message.content && message.status !== 'error' && (
            <>
              <button className="meta-btn" onClick={startEdit} title="编辑这条消息">
                <IconEdit width={13} height={13} />
              </button>
              <button className="meta-btn" onClick={copy} title="复制">
                {copied ? (
                  <IconCheck width={13} height={13} />
                ) : (
                  <IconCopy width={13} height={13} />
                )}
              </button>
              {isLastAssistant && (
                <button
                  className="meta-btn"
                  onClick={onRegenerate}
                  title="重新生成（保留当前版本）"
                >
                  <IconRefresh width={13} height={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatView({
  chat,
  character,
  books,
  onOpenChats,
  onOpenCards,
  onOpenSettings,
  onNewChat,
  onDeleteChat,
  updateReady,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const [loreTitles, setLoreTitles] = useState<string[] | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [confirmClearMemory, setConfirmClearMemory] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    send,
    regenerate,
    generateReply,
    stop,
    busyChatId,
    compacting,
    compactNow,
    compactAndContinue,
  } = useChat(onOpenSettings);
  const busy = busyChatId === chat.id;
  const toast = useStore((s) => s.toast);
  const settings = useStore((s) => s.settings);
  const model = settings.model;
  const cardScriptsEnabled = settings.cardScripts;
  const streamingMessageId = useStore((s) => s.streamingMessageId);
  const selectSwipe = useStore((s) => s.selectSwipe);
  const editMessage = useStore((s) => s.editMessage);
  const setCompaction = useStore((s) => s.setCompaction);

  const usage = useMemo(
    () => contextUsage(character, books, chat, settingsForChat(settings, chat)),
    [character, books, chat, settings],
  );
  const usagePercent = Math.min(999, Math.round(usage.ratio * 100));
  const nearLimit = usage.ratio >= AUTO_COMPACT_RATIO;
  const memory = chat.compaction;
  /** The card's own picture can stand in as the background (JSON cards have none). */
  const backgroundImage =
    chat.backgroundCard && character.avatar ? character.avatar : chat.background;

  const hasScripts = Boolean(
    cardScriptsEnabled && character.code?.scripts?.some((s) => s.enabled && s.content.trim()),
  );

  useEffect(() => {
    chatActions.trigger = () => void generateReply();
    chatActions.send = (text: string) => void send(text);
    chatActions.setInput = (text: string) => setInput(text);
    return () => {
      chatActions.trigger = undefined;
      chatActions.send = undefined;
      chatActions.setInput = undefined;
    };
  }, [generateReply, send]);

  useEffect(() => {
    void ensureChatScope(chat.id).then(() => {
      void eventBus.emit(tavern_events.CHAT_CHANGED, chat.id);
      void eventBus.emit(tavern_events.APP_READY);
    });
  }, [chat.id]);

  const lastAssistantId = [...chat.messages].reverse().find((m) => m.role === 'assistant')?.id;

  useEffect(() => {
    setInput('');
    stickRef.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [chat.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.id]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  }, [input]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await send(text);
    requestAnimationFrame(() => {
      stickRef.current = true;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const enterToSend = useStore.getState().settings.enterToSend;
    if (!enterToSend) return;
    e.preventDefault();
    void submit();
  };

  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant');

  return (
    <main className={`chat-view ${backgroundImage ? 'has-bg' : ''}`}>
      {backgroundImage && (
        <div
          className="chat-bg"
          style={{ backgroundImage: `url("${backgroundImage}")` }}
          aria-hidden="true"
        />
      )}
      {hasScripts && <ScriptHost character={character} chatId={chat.id} />}
      <header className="chat-head">
        <button className="icon-btn mobile-only" onClick={onOpenChats} aria-label="对话列表">
          <IconMenu />
        </button>
        <Avatar src={character.avatar} name={character.name} size={38} />
        <div className="chat-title">
          <div className="chat-name-row">
            <h2>{character.name}</h2>
            {/* The conversation title is what the list shows; the header keeps
                the character's identity and only adds the title when it differs. */}
            {chat.title !== character.name && (
              <span className="chat-name-title" title="对话标题">
                {chat.title}
              </span>
            )}
            {books.length > 0 && (
              <span className="badge">
                <IconBook width={12} height={12} />{' '}
                {books.reduce((n, b) => n + b.entries.length, 0)} 词条
              </span>
            )}
          </div>
          <p>
            {model}
            {chat.messages.some((m) => m.role === 'user') ? '' : ' · 等待你的第一句话'}
          </p>
        </div>
        <div className="chat-actions">
          <button
            className={`ctx-chip ${nearLimit ? 'near' : ''} ${memory ? 'has-memory' : ''}`}
            onClick={() => setContextOpen(true)}
            title={`上下文约 ${formatTokenCount(usage.tokens)} / ${formatLimit(usage.limit)} tokens，点击查看或压缩`}
          >
            <IconCompress width={13} height={13} />
            <span className="ctx-chip-pct">{usagePercent}%</span>
            {memory && <span className="ctx-chip-mem">记忆</span>}
          </button>
          <ScriptButtonBar />
          <button className="icon-btn" onClick={onNewChat} title="新对话">
            <IconPlus />
          </button>
          <button
            className="icon-btn"
            onClick={() => setChatSettingsOpen(true)}
            title="对话设置（标题、上下文、背景图）"
            aria-label="对话设置"
          >
            <IconSliders />
          </button>
          <button className="icon-btn" onClick={onOpenSettings} title="设置">
            <IconSettings />
            {updateReady && <span className="update-dot" title="有新版本可用" />}
          </button>
          <button className="icon-btn mobile-only" onClick={onOpenCards} title="角色卡">
            <IconBook />
          </button>
        </div>
      </header>

      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        <div className="messages-inner">
          {chat.messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-avatar">
                <Avatar src={character.avatar} name={character.name} size={72} />
              </div>
              <h3>{character.name}</h3>
              <p>这张卡没有开场白。直接说点什么，故事就开始了。</p>
            </div>
          )}
          {chat.messages.map((message, index) => (
            <MessageRow
              key={message.id}
              message={message}
              character={character}
              chatId={chat.id}
              index={index}
              totalMessages={chat.messages.length}
              isLastAssistant={message.id === lastAssistantId && message.role === 'assistant'}
              busy={busy}
              compacting={compacting}
              onRegenerate={() => void regenerate()}
              onCompactContinue={() => void compactAndContinue(chat.id, message.id)}
              onShowLore={setLoreTitles}
              onSelectSwipe={(swipeIndex) => selectSwipe(chat.id, message.id, swipeIndex)}
              onEdit={(text) => {
                editMessage(chat.id, message.id, text);
                toast('已保存，修改会作为历史对话发给模型', 'success');
              }}
            />
          ))}
          {busy && !chat.messages.some((m) => m.id === streamingMessageId) && (
            <div className="streaming-hint">正在思考…</div>
          )}
        </div>
      </div>

      <footer className="composer-wrap">
        <div className="composer">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={busy ? '正在回复…' : `对 ${character.name} 说点什么…`}
            rows={1}
            disabled={busy}
            aria-label="输入消息"
          />
          {busy ? (
            <button className="send-btn stop" onClick={stop} title="停止生成" aria-label="停止生成">
              <IconStop />
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={() => void submit()}
              disabled={!input.trim()}
              title="发送"
              aria-label="发送"
            >
              <IconSend />
            </button>
          )}
        </div>
        <div className="composer-hint">
          <span>
            Enter 发送 · Shift + Enter 换行
            {books.length > 0 ? ` · 已挂载 ${books.length} 本世界书` : ' · 未挂载世界书'}
          </span>
          <button className="link-btn" onClick={onDeleteChat}>
            <IconTrash width={13} height={13} /> 删除对话
          </button>
        </div>
        {input.length > 1800 && <div className="composer-count">{input.length} 字</div>}
      </footer>

      <ChatSettingsModal
        open={chatSettingsOpen}
        chat={chat}
        characterName={character.name}
        characterAvatar={character.avatar}
        onClose={() => setChatSettingsOpen(false)}
      />

      <Modal
        open={Boolean(loreTitles)}
        title="本轮触发的世界书"
        subtitle="这些词条已注入本轮对话"
        onClose={() => setLoreTitles(null)}
      >
        {' '}
        <div className="lore-list">
          {loreTitles?.map((title, i) => (
            <div className="lore-item" key={`${title}-${i}`}>
              <span className="lore-index">{i + 1}</span>
              <span>{title}</span>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={contextOpen}
        title="上下文与记忆"
        subtitle="把较早的对话压缩成一段长期记忆，让长对话也能继续说下去"
        onClose={() => setContextOpen(false)}
        width={560}
        className="ctx-modal"
      >
        <div className="ctx-usage">
          <div className="ctx-usage-head">
            <span>本轮请求约</span>
            <strong>
              {formatTokenCount(usage.tokens)} / {formatLimit(usage.limit)} tokens
            </strong>
            <span className={`ctx-usage-pct ${nearLimit ? 'near' : ''}`}>{usagePercent}%</span>
          </div>
          <div className="ctx-bar">
            <span
              className={`ctx-bar-fill ${nearLimit ? 'near' : ''}`}
              style={{ width: `${Math.min(100, Math.max(1, usagePercent))}%` }}
            />
            <span className="ctx-bar-mark" title="自动压缩阈值 80%" style={{ left: '80%' }} />
          </div>
          <p className="settings-hint">
            Token 数是估算值（中文按约 1 字 1 token）。自动压缩开启时，达到上限的 80%
            会在发送前自动摘要旧对话。
          </p>
        </div>

        {memory ? (
          <div className="ctx-memory">
            <div className="ctx-memory-head">
              <span className="tag tag-book">
                <IconBook width={11} height={11} /> 已压缩 {memory.throughIndex} 条
              </span>
              <span className="muted">
                {formatTime(memory.updatedAt)}
                {memory.savedTokens
                  ? ` · 省下约 ${formatTokenCount(memory.savedTokens)} tokens`
                  : ''}
              </span>
            </div>
            <div className="ctx-memory-body">{memory.summary}</div>
            <button className="link-btn danger-link" onClick={() => setConfirmClearMemory(true)}>
              <IconTrash width={13} height={13} /> 清除记忆（恢复发送全部原文）
            </button>
          </div>
        ) : (
          <p className="modal-text">
            还没有压缩过。压缩会把最早的一部分消息交给模型总结成长期记忆，之后只发送「记忆 +
            最近几条消息」， 省下大量上下文，同时保留剧情要点。
          </p>
        )}

        <div className="ctx-actions">
          <button
            className="btn btn-accent"
            onClick={async () => {
              const ok = await compactNow();
              if (ok) setContextOpen(false);
            }}
            disabled={compacting || busy}
          >
            <IconCompress width={15} height={15} />{' '}
            {compacting ? '压缩中…' : memory ? '继续压缩' : '立即压缩上下文'}
          </button>
          <button className="btn btn-ghost" onClick={() => setContextOpen(false)}>
            关闭
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmClearMemory}
        title="清除这段记忆？"
        subtitle="旧对话会重新作为原文发送，可能再次超出上下文上限。"
        onClose={() => setConfirmClearMemory(false)}
        width={430}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmClearMemory(false)}>
              取消
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                setCompaction(chat.id, null);
                setConfirmClearMemory(false);
                setContextOpen(false);
                toast('已清除记忆', 'success');
              }}
            >
              清除
            </button>
          </>
        }
      >
        <p className="modal-text">
          当前记忆覆盖了 {memory?.throughIndex ?? 0} 条消息。清除后它们会重新进入提示词。
        </p>
      </Modal>
    </main>
  );
}
