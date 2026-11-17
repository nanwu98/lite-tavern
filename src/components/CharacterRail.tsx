import { useMemo, useState } from 'react';
import type { Character, Chat, WorldBook } from '../types';
import { Avatar } from './Avatar';
import { IconBook, IconEdit, IconPlus, IconSettings, IconSparkles, IconTrash } from './Icons';
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
        <button className="icon-btn" onClick={onOpenSettings} title="设置" aria-label="设置">
          <IconSettings />
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNew}>
        <IconPlus width={17} height={17} />
        新对话
      </button>

      <div className="list-search">
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
              去选择角色卡
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
                    <span className="chat-item-name">{character?.name ?? chat.title}</span>
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

interface CharacterRailProps {
  characters: Character[];
  worldBooks: WorldBook[];
  activeCharacterId?: string;
  onOpenCharacter: (id: string) => void;
  onNewChat: (id: string) => void;
  onPickCards: () => void;
  onCreateCard: () => void;
  onEditCard: (character: Character) => void;
  onImportFiles: (files: File[]) => void;
  onImportWorldBook: (characterId: string, file: File) => void;
  onCreateWorldBook: (characterId: string) => void;
  onViewWorldBooks: (character: Character) => void;
  onDeleteCharacter: (character: Character) => void;
}

export function CharacterRail({
  characters,
  worldBooks,
  activeCharacterId,
  onOpenCharacter,
  onNewChat,
  onPickCards,
  onCreateCard,
  onEditCard,
  onImportFiles,
  onImportWorldBook,
  onCreateWorldBook,
  onViewWorldBooks,
  onDeleteCharacter,
}: CharacterRailProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [worldTarget, setWorldTarget] = useState<string | null>(null);
  const cardInputId = 'card-file-input';
  const worldInputId = 'world-file-input';

  const booksOf = (character: Character) =>
    character.worldBookIds
      .map((id) => worldBooks.find((b) => b.id === id))
      .filter((b): b is WorldBook => Boolean(b));

  return (
    <aside
      className={`panel character-panel ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files ?? []).filter(
          (f) =>
            /\.(png|json)$/i.test(f.name) ||
            f.type === 'image/png' ||
            f.type === 'application/json',
        );
        if (files.length) onImportFiles(files);
      }}
    >
      <div className="rail-head">
        <div>
          <h2>角色卡</h2>
          <p>{characters.length} 张 · PNG / JSON / 手写</p>
        </div>
        <div className="rail-head-actions">
          <button className="btn btn-small btn-ghost" onClick={onCreateCard} title="手动创建角色卡">
            <IconEdit width={14} height={14} /> 新建
          </button>
          <label
            className="btn btn-small btn-accent"
            htmlFor={cardInputId}
            onClick={(e) => {
              e.preventDefault();
              onPickCards();
            }}
          >
            <IconPlus width={15} height={15} /> 导入
          </label>
        </div>
        <input
          id={cardInputId}
          type="file"
          accept=".png,.json,image/png,application/json"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) onImportFiles(files);
          }}
        />
      </div>

      <div className="list-scroll card-scroll">
        {characters.length === 0 ? (
          <div className="panel-empty card-empty">
            <div className="empty-orbit">
              <IconBook width={28} height={28} />
            </div>
            <h3>导入或手写第一张卡</h3>
            <p>
              支持酒馆 PNG / JSON
              角色卡，卡内嵌的世界书会自动挂载；也可以只填提示词和开场白，手写一张。
            </p>
            <div className="empty-actions">
              <label
                className="btn btn-accent"
                htmlFor={cardInputId}
                onClick={(e) => {
                  e.preventDefault();
                  onPickCards();
                }}
              >
                <IconPlus width={15} height={15} /> 选择角色卡
              </label>
              <button className="btn btn-ghost" onClick={onCreateCard}>
                <IconEdit width={15} height={15} /> 手动创建
              </button>
            </div>
          </div>
        ) : (
          [...characters]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((character) => {
              const books = booksOf(character);
              const entryCount = books.reduce((n, b) => n + b.entries.length, 0);
              const needsWorld = character.worldName && books.length === 0;
              return (
                <div
                  key={character.id}
                  className={`character-card ${character.id === activeCharacterId ? 'active' : ''}`}
                  onClick={() => onOpenCharacter(character.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onOpenCharacter(character.id)}
                >
                  <Avatar src={character.avatar} name={character.name} size={52} />
                  <div className="card-main">
                    <div className="card-name">{character.name}</div>
                    <div className="card-desc">
                      {character.notes
                        ? truncate(character.notes.replace(/\s+/g, ' '), 64)
                        : character.description
                          ? truncate(
                              character.description
                                .replace(/\{\{char\}\}/gi, character.name)
                                .replace(/\{\{user\}\}/gi, '你')
                                .replace(/\s+/g, ' '),
                              64,
                            )
                          : character.personality
                            ? truncate(character.personality.replace(/\s+/g, ' '), 64)
                            : '没有填写角色描述'}
                    </div>
                    <div className="card-tags">
                      {entryCount > 0 ? (
                        <span className="tag tag-book">
                          <IconBook width={11} height={11} /> 世界书 {entryCount}
                        </span>
                      ) : needsWorld ? (
                        <span className="tag tag-warn">缺少世界书</span>
                      ) : (
                        <span className="tag tag-ghost">无世界书</span>
                      )}
                      {character.tags.slice(0, 2).map((tag) => (
                        <span className="tag tag-ghost" key={tag}>
                          {tag}
                        </span>
                      ))}
                      {character.code?.scripts?.some((s) => s.enabled) && (
                        <span className="card-script-tag">含脚本</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="icon-btn card-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuId(menuId === character.id ? null : character.id);
                    }}
                    aria-label="角色卡菜单"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.4" />
                      <circle cx="12" cy="12" r="1.4" />
                      <circle cx="19" cy="12" r="1.4" />
                    </svg>
                  </button>

                  {menuId === character.id && (
                    <>
                      <div className="menu-backdrop" onClick={() => setMenuId(null)} />
                      <div className="card-menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setMenuId(null);
                            onNewChat(character.id);
                          }}
                        >
                          <IconPlus width={15} height={15} /> 新对话
                        </button>
                        <button
                          onClick={() => {
                            setMenuId(null);
                            onEditCard(character);
                          }}
                        >
                          <IconEdit width={15} height={15} /> 编辑角色卡
                        </button>
                        <button
                          onClick={() => {
                            setMenuId(null);
                            onCreateWorldBook(character.id);
                          }}
                        >
                          <IconPlus width={15} height={15} /> 新建世界书
                        </button>
                        <button
                          onClick={() => {
                            setWorldTarget(character.id);
                            setMenuId(null);
                            document.getElementById(worldInputId)?.click();
                          }}
                        >
                          <IconBook width={15} height={15} /> 导入 / 替换世界书
                        </button>
                        <button
                          disabled={books.length === 0}
                          onClick={() => {
                            setMenuId(null);
                            onViewWorldBooks(character);
                          }}
                        >
                          <IconSparkles width={15} height={15} /> 查看世界书
                        </button>
                        <div className="menu-sep" />
                        <button
                          className="danger"
                          onClick={() => {
                            setMenuId(null);
                            onDeleteCharacter(character);
                          }}
                        >
                          <IconTrash width={15} height={15} /> 删除角色卡
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
        )}
      </div>

      <div className="panel-foot">
        <span>自动挂载内嵌世界书</span>
        <span className="dot" />
        <span>拖入文件也可导入</span>
      </div>

      <input
        id={worldInputId}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file && worldTarget) onImportWorldBook(worldTarget, file);
          setWorldTarget(null);
        }}
      />
    </aside>
  );
}
