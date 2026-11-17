import { useMemo, useState } from 'react';
import type { Character, Chat } from '../types';
import { Avatar } from './Avatar';
import {
  IconBook,
  IconChevronLeft,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTrash,
} from './Icons';
import { formatTime, truncate } from '../lib/util';

interface ChatListProps {
  chats: Chat[];
  characters: Character[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRequestDelete: (chat: Chat) => void;
  onOpenSettings: () => void;
  onOpenCards: () => void;
  /** A newer release was found and the settings have not been opened since. */
  updateReady?: boolean;
  /** Desktop only: hides the panel and leaves a restore handle. */
  onCollapse?: () => void;
}

function lastPreview(chat: Chat): string {
  const last = [...chat.messages].reverse().find((m) => m.content.trim());
  if (!last) return '还没有消息';
  const text = last.content
    .replace(/[#*>`_~\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${last.role === 'user' ? '你：' : ''}${truncate(text, 46)}`;
}

export function ChatList({
  chats,
  characters,
  activeChatId,
  onSelect,
  onNew,
  onRequestDelete,
  onOpenSettings,
  onOpenCards,
  updateReady,
  onCollapse,
}: ChatListProps) {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt), [chats]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return sorted;
    return sorted.filter((chat) => {
      const name = characters.find((c) => c.id === chat.characterId)?.name ?? '';
      return chat.title.toLocaleLowerCase().includes(q) || name.toLocaleLowerCase().includes(q);
    });
  }, [sorted, characters, query]);

  return (
    <aside className="panel chat-list-panel">
      <div className="brand">
        <div className="brand-mark">
          <IconSparkles width={20} height={20} />
        </div>
        <div className="brand-text">
          <div className="brand-title">轻语酒馆</div>
          <div className="brand-sub">LiteTavern</div>
        </div>
        {onCollapse && (
          <button
            className="icon-btn collapse-btn desktop-only"
            onClick={onCollapse}
            title="收起对话列表"
            aria-label="收起对话列表"
          >
            <IconChevronLeft width={15} height={15} />
          </button>
        )}
        <button className="icon-btn" onClick={onOpenSettings} title="设置" aria-label="设置">
          <IconSettings />
          {updateReady && <span className="update-dot" title="有新版本可用" />}
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNew}>
        <IconPlus width={17} height={17} />
        新对话
      </button>

      <div className="list-search">
        <span className="search-icon">
          <IconSearch width={14} height={14} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索对话…"
          aria-label="搜索对话"
        />
      </div>

      <div className="list-scroll">
        {filtered.length === 0 ? (
          <div className="panel-empty">
            <IconSparkles width={26} height={26} />
            <p>{chats.length === 0 ? '还没有任何对话' : '没有匹配的对话'}</p>
            <button className="btn btn-small btn-ghost" onClick={onOpenCards}>
              <IconBook width={14} height={14} /> 去选择角色卡
            </button>
          </div>
        ) : (
          filtered.map((chat) => {
            const character = characters.find((c) => c.id === chat.characterId);
            return (
              <div
                key={chat.id}
                className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => onSelect(chat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(chat.id)}
              >
                <Avatar src={character?.avatar} name={character?.name ?? chat.title} size={42} />
                <div className="chat-item-main">
                  <div className="chat-item-top">
                    <span className="chat-item-name">{chat.title}</span>
                    <span className="chat-item-time">{formatTime(chat.updatedAt)}</span>
                  </div>
                  <div className="chat-item-bottom">
                    <span className="chat-item-preview">{lastPreview(chat)}</span>
                    <button
                      className="item-delete"
                      title="删除对话"
                      aria-label="删除对话"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestDelete(chat);
                      }}
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="panel-foot">
        <span>{chats.length} 个对话</span>
        <span className="dot" />
        <span>数据仅存本机</span>
      </div>
    </aside>
  );
}
