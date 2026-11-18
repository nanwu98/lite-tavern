import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Character, Chat } from '../types';
import { Avatar } from './Avatar';
import {
  IconArchive,
  IconBook,
  IconChevronLeft,
  IconChevronRight,
  IconMore,
  IconPin,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTrash,
} from './Icons';
import { formatTime, truncate } from '../lib/util';
import { isPinned, sortArchivedChats, sortVisibleChats } from '../lib/chatOrder';

interface ChatListProps {
  chats: Chat[];
  characters: Character[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onPin: (chat: Chat) => void;
  onArchive: (chat: Chat) => void;
  onRestore: (chat: Chat) => void;
  onRequestDelete: (chat: Chat) => void;
  onOpenSettings: () => void;
  onOpenCards: () => void;
  /** A newer release was found and the settings have not been opened since. */
  updateReady?: boolean;
  /** Desktop only: hides the panel and leaves a restore handle. */
  onCollapse?: () => void;
}

/** Where the per-chat menu is anchored; it lives in a body portal. */
interface MenuPlacement {
  id: string;
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const MENU_WIDTH = 178;
const MENU_GAP = 6;
const MENU_EDGE = 8;
const MENU_ESTIMATED_HEIGHT = 156;

function lastPreview(chat: Chat): string {
  const last = [...chat.messages].reverse().find((m) => m.content.trim());
  if (!last) return '还没有消息';
  const text = last.content
    .replace(/[#*>`_~\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${last.role === 'user' ? '你：' : ''}${truncate(text, 46)}`;
}

/** Full date + time for archived conversations ("最近更新日期"). */
function formatArchiveDate(ts: number): string {
  const date = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function ChatList({
  chats,
  characters,
  activeChatId,
  onSelect,
  onNew,
  onPin,
  onArchive,
  onRestore,
  onRequestDelete,
  onOpenSettings,
  onOpenCards,
  updateReady,
  onCollapse,
}: ChatListProps) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<MenuPlacement | null>(null);

  const characterName = (chat: Chat) =>
    characters.find((c) => c.id === chat.characterId)?.name ?? '';
  const matches = (chat: Chat) => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return true;
    return (
      chat.title.toLocaleLowerCase().includes(q) ||
      characterName(chat).toLocaleLowerCase().includes(q)
    );
  };

  const visible = useMemo(
    () => sortVisibleChats(chats).filter(matches),
    // `matches` only depends on the query and the character names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chats, characters, query],
  );
  const archivedAll = useMemo(() => sortArchivedChats(chats), [chats]);
  const archived = useMemo(
    () => archivedAll.filter(matches),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archivedAll, characters, query],
  );

  // The last archived chat can be deleted while the section is open.
  useEffect(() => {
    if (archivedAll.length === 0) setShowArchived(false);
  }, [archivedAll.length]);

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.min(
      Math.max(MENU_EDGE, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - MENU_EDGE,
    );
    const below = window.innerHeight - rect.bottom - MENU_GAP - MENU_EDGE;
    const above = rect.top - MENU_GAP - MENU_EDGE;
    const openUp = below < MENU_ESTIMATED_HEIGHT && above > below;
    setMenu({
      id,
      left,
      maxHeight: Math.max(140, openUp ? above : below),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    });
  };

  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    const close = () => setMenu(null);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    // Any scroll moves the anchor: close instead of tracking a stale position.
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const menuChat = menu ? chats.find((chat) => chat.id === menu.id) : undefined;

  const renderChat = (chat: Chat) => {
    const character = characters.find((c) => c.id === chat.characterId);
    const pinned = isPinned(chat);
    return (
      <div
        key={chat.id}
        className={`chat-item ${chat.id === activeChatId ? 'active' : ''} ${
          pinned ? 'is-pinned' : ''
        } ${menu?.id === chat.id ? 'menu-open' : ''}`}
        onClick={() => onSelect(chat.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(chat.id)}
      >
        <Avatar src={character?.avatar} name={character?.name ?? chat.title} size={42} />
        <div className="chat-item-main">
          <div className="chat-item-top">
            {pinned && (
              <span className="chat-item-pin" title="已置顶" aria-label="已置顶">
                <IconPin width={12} height={12} />
              </span>
            )}
            <span className="chat-item-name">{chat.title}</span>
            <span className="chat-item-time">{formatTime(chat.updatedAt)}</span>
            <button
              className="item-more"
              title="对话操作"
              aria-label={`${chat.title} 的对话操作`}
              aria-haspopup="menu"
              aria-expanded={menu?.id === chat.id}
              onClick={(event) => openMenu(event, chat.id)}
            >
              <IconMore width={15} height={15} />
            </button>
          </div>
          <div className="chat-item-bottom">
            <span className="chat-item-preview">{lastPreview(chat)}</span>
          </div>
        </div>
      </div>
    );
  };

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
        <span className="search-icon" aria-hidden>
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
        {visible.length === 0 ? (
          <div className="panel-empty">
            <IconSparkles width={26} height={26} />
            <p>
              {chats.length > 0 && archivedAll.length === chats.length
                ? '所有对话都已归档'
                : query.trim()
                  ? '没有匹配的对话'
                  : '还没有任何对话'}
            </p>
            <button className="btn btn-small btn-ghost" onClick={onOpenCards}>
              <IconBook width={14} height={14} /> 去选择角色卡
            </button>
          </div>
        ) : (
          visible.map(renderChat)
        )}

        {showArchived && (
          <section className="archive-block" aria-label="已归档的对话">
            <div className="archive-head">
              <IconArchive width={13} height={13} />
              <span>已归档</span>
              <span className="archive-count">{archivedAll.length}</span>
            </div>
            {archived.length === 0 ? (
              <p className="archive-empty">
                {query.trim() ? '没有匹配的归档对话' : '还没有归档的对话'}
              </p>
            ) : (
              archived.map((chat) => {
                const character = characters.find((c) => c.id === chat.characterId);
                return (
                  <div className="archive-item" key={chat.id}>
                    <Avatar
                      src={character?.avatar}
                      name={character?.name ?? chat.title}
                      size={36}
                    />
                    <div className="archive-item-main">
                      <div className="archive-item-name">{chat.title}</div>
                      <div className="archive-item-meta">
                        {character?.name ? `${character.name} · ` : ''}
                        更新于 {formatArchiveDate(chat.updatedAt)}
                      </div>
                    </div>
                    <div className="archive-item-actions">
                      <button
                        className="archive-action"
                        onClick={() => onRestore(chat)}
                        title="恢复到对话列表"
                      >
                        恢复
                      </button>
                      <button
                        className="archive-action danger"
                        onClick={() => onRequestDelete(chat)}
                        title="彻底删除，无法恢复"
                        aria-label={`彻底删除 ${chat.title}`}
                      >
                        <IconTrash width={13} height={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}
      </div>

      {archivedAll.length > 0 && (
        <button
          className={`archive-toggle ${showArchived ? 'open' : ''}`}
          onClick={() => setShowArchived((value) => !value)}
          aria-expanded={showArchived}
        >
          <IconArchive width={14} height={14} />
          {showArchived ? '收起归档' : `查看归档（${archivedAll.length}）`}
          <IconChevronRight className="archive-chevron" width={13} height={13} />
        </button>
      )}

      <div className="panel-foot">
        <span>{chats.length} 个对话</span>
        <span className="dot" />
        <span>数据仅存本机</span>
      </div>

      {menu &&
        menuChat &&
        createPortal(
          <>
            <div className="card-menu-backdrop" onMouseDown={() => setMenu(null)} />
            <div
              className="card-menu chat-menu"
              role="menu"
              aria-label={`${menuChat.title} 的操作`}
              style={{
                left: menu.left,
                width: MENU_WIDTH,
                maxHeight: menu.maxHeight,
                ...(menu.top !== undefined ? { top: menu.top } : { bottom: menu.bottom }),
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onPin(menuChat);
                }}
              >
                <IconPin width={15} height={15} /> {isPinned(menuChat) ? '取消置顶' : '置顶'}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onArchive(menuChat);
                }}
              >
                <IconArchive width={15} height={15} /> 归档
              </button>
              <div className="menu-sep" />
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenu(null);
                  onRequestDelete(menuChat);
                }}
              >
                <IconTrash width={15} height={15} /> 删除对话
              </button>
            </div>
          </>,
          document.body,
        )}
    </aside>
  );
}
