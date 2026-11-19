import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Character, WorldBook } from '../types';
import { Avatar } from './Avatar';
import { Pager } from './Pager';
import { IconBook, IconChevronRight, IconEdit, IconPlus, IconTrash } from './Icons';
import { truncate } from '../lib/util';
import { paginate } from '../lib/pagination';

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
  /** Desktop only: hides the panel and leaves a restore handle. */
  onCollapse?: () => void;
  /** True while the phone drawer is open; used to jump to the active card. */
  opened?: boolean;
}

/** Cards per page in the rail; roughly what fits above the fold on a phone. */
const RAIL_PAGE_SIZE = 8;

/** Where the card menu is anchored; it lives in a body portal, not in the card. */
interface MenuPlacement {
  id: string;
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const MENU_WIDTH = 202;
const MENU_GAP = 6;
const MENU_EDGE = 8;
const MENU_ESTIMATED_HEIGHT = 244;

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
  onCollapse,
  opened,
}: CharacterRailProps) {
  const [menu, setMenu] = useState<MenuPlacement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [worldTarget, setWorldTarget] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const cardInputId = 'card-file-input';
  const worldInputId = 'world-file-input';

  const sorted = useMemo(
    () => [...characters].sort((a, b) => b.createdAt - a.createdAt),
    [characters],
  );
  const {
    page: safePage,
    pageCount,
    items: pageCharacters,
  } = paginate(sorted, page, RAIL_PAGE_SIZE);
  const activeIndex = activeCharacterId
    ? sorted.findIndex((character) => character.id === activeCharacterId)
    : -1;

  // Open the drawer on the page that holds the current conversation's card, so
  // a 60-card library does not require scrolling down to find it.
  useEffect(() => {
    if (activeIndex < 0) return;
    setPage(Math.floor(activeIndex / RAIL_PAGE_SIZE));
  }, [activeIndex, opened]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [safePage]);

  /**
   * Opens the card menu as a body-level portal.
   *
   * It used to be absolutely positioned inside the card with a `.menu-backdrop`
   * sibling: because `.panel` carries `z-index` (and a backdrop filter), that
   * backdrop was trapped in the panel's stacking context, so clicks on other
   * cards went straight through to the cards underneath and the translucent
   * menu visibly mixed with the card text. A portal puts the menu and its
   * full-screen backdrop above everything and closes on any outside click.
   */
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
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
      maxHeight: Math.max(160, openUp ? above : below),
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
    const onViewportChange = () => setMenu(null);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onViewportChange);
    // Any scroll (the card list, the chat) moves the anchor: close instead of
    // tracking a stale position.
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [menu]);

  const booksOf = (character: Character) =>
    character.worldBookIds
      .map((id) => worldBooks.find((b) => b.id === id))
      .filter((b): b is WorldBook => Boolean(b));

  const menuCharacter = menu ? characters.find((c) => c.id === menu.id) : undefined;
  const menuBooks = menuCharacter ? booksOf(menuCharacter) : [];

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
          <p>{characters.length} 张</p>
        </div>
        <div className="rail-head-actions">
          {onCollapse && (
            <button
              className="icon-btn collapse-btn desktop-only"
              onClick={onCollapse}
              title="收起角色卡列表"
              aria-label="收起角色卡列表"
            >
              <IconChevronRight width={15} height={15} />
            </button>
          )}
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

      <div className="list-scroll card-scroll" ref={listRef}>
        {characters.length === 0 ? (
          <div className="panel-empty card-empty">
            <div className="empty-orbit">
              <IconBook width={28} height={28} />
            </div>
            <h3>导入或手写第一张卡</h3>
            <p>PNG / JSON 卡会自动带上内嵌世界书；也可以手写一张。</p>
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
          pageCharacters.map((character) => {
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
                    openMenu(e, character.id);
                  }}
                  aria-label="角色卡菜单"
                  aria-haspopup="menu"
                  aria-expanded={menu?.id === character.id}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.4" />
                    <circle cx="12" cy="12" r="1.4" />
                    <circle cx="19" cy="12" r="1.4" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      <Pager
        page={safePage}
        pageCount={pageCount}
        onChange={setPage}
        className="rail-pager"
        label="角色卡分页"
      />

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

      {menu &&
        menuCharacter &&
        createPortal(
          <>
            <div className="card-menu-backdrop" onMouseDown={() => setMenu(null)} />
            <div
              className="card-menu"
              role="menu"
              aria-label={`${menuCharacter.name} 的操作`}
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
                  onNewChat(menuCharacter.id);
                }}
              >
                <IconPlus width={15} height={15} /> 新对话
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onEditCard(menuCharacter);
                }}
              >
                <IconEdit width={15} height={15} /> 编辑角色卡
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  onCreateWorldBook(menuCharacter.id);
                }}
              >
                <IconPlus width={15} height={15} /> 新建世界书
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  setWorldTarget(menuCharacter.id);
                  document.getElementById(worldInputId)?.click();
                }}
              >
                <IconBook width={15} height={15} /> 导入 / 替换世界书
              </button>
              <button
                role="menuitem"
                disabled={menuBooks.length === 0}
                onClick={() => {
                  setMenu(null);
                  onViewWorldBooks(menuCharacter);
                }}
              >
                <IconBook width={15} height={15} /> 查看世界书
              </button>
              <div className="menu-sep" />
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenu(null);
                  onDeleteCharacter(menuCharacter);
                }}
              >
                <IconTrash width={15} height={15} /> 删除角色卡
              </button>
            </div>
          </>,
          document.body,
        )}
    </aside>
  );
}
