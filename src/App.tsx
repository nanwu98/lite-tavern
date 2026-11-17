import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore, activeChat as selectActiveChat, booksForCharacter } from './store';
import { importFile, type ImportResult } from './lib/card';
import { looksLikeWorldBook, parseWorldBook } from './lib/worldbook';
import { ChatList } from './components/ChatList';
import { CharacterRail } from './components/CharacterRail';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { WorldBookModal } from './components/WorldBookModal';
import { CardEditorModal } from './components/CardEditorModal';
import { WorldBookEditorModal } from './components/WorldBookEditorModal';
import { Avatar } from './components/Avatar';
import { Modal } from './components/Modal';
import { Toasts } from './components/Toasts';
import {
  IconBook,
  IconEdit,
  IconLogo,
  IconPlus,
  IconSettings,
  IconSparkles,
  IconX,
} from './components/Icons';
import type { Character, Chat, WorldBook } from './types';
import { flushPersist, snapshotNow } from './store';
import { applyTheme, onSystemThemeChange } from './lib/theme';
import { clearRestoredFlag, snapshotWasRestored } from './lib/snapshot';
import { checkForUpdates, isAndroidApp } from './lib/update';

type ConfirmState =
  { kind: 'chat'; chat: Chat } | { kind: 'character'; character: Character } | null;

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">
        <IconLogo />
      </div>
      <div className="loading-title">轻语酒馆</div>
      <div className="loading-sub">正在打开你的角色卡…</div>
    </div>
  );
}

function Welcome({
  characters,
  onPick,
  onImport,
  onCreate,
  onOpenChats,
  onOpenCards,
  onOpenSettings,
  onDelete,
  updateReady,
}: {
  characters: Character[];
  onPick: (id: string) => void;
  onImport: () => void;
  onCreate: () => void;
  onOpenChats: () => void;
  onOpenCards: () => void;
  onOpenSettings: () => void;
  onDelete: (character: Character) => void;
  updateReady?: boolean;
}) {
  return (
    <main className="chat-view welcome">
      <div className="mobile-topbar mobile-only">
        <div className="mobile-brand">
          <IconSparkles width={18} height={18} /> 轻语酒馆
        </div>
        <div className="mobile-top-actions">
          <button className="icon-btn" onClick={onOpenChats} aria-label="对话列表">
            <IconBook />
          </button>
          <button className="icon-btn" onClick={onOpenCards} aria-label="角色卡">
            <IconSparkles />
          </button>
          <button className="icon-btn" onClick={onOpenSettings} aria-label="设置">
            <IconSettings />
            {updateReady && <span className="update-dot" title="有新版本可用" />}
          </button>
        </div>
      </div>
      <div className="welcome-inner">
        <div className="welcome-mark">
          <IconLogo width={64} height={64} />
        </div>
        <h1>轻语酒馆</h1>
        <p className="welcome-lead">
          一张角色卡，一本世界书，一段只属于你的对话。
          <br />
          不做卡片编辑，不做群聊，只把故事讲好。
        </p>
        {characters.length === 0 ? (
          <div className="welcome-actions">
            <button className="btn btn-accent btn-large" onClick={onImport}>
              <IconPlus width={18} height={18} /> 导入第一张角色卡
            </button>
            <button className="btn btn-ghost" onClick={onCreate}>
              <IconEdit width={16} height={16} /> 或者手写一张
            </button>
          </div>
        ) : (
          <>
            <div className="welcome-cards">
              {[...characters]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((character) => (
                  <div className="welcome-card" key={character.id}>
                    <button className="welcome-card-main" onClick={() => onPick(character.id)}>
                      <Avatar src={character.avatar} name={character.name} size={56} />
                      <span className="welcome-card-name">{character.name}</span>
                      <span className="welcome-card-hint">开始聊天</span>
                    </button>
                    <button
                      className="welcome-card-del"
                      title={`删除「${character.name}」`}
                      aria-label={`删除角色卡 ${character.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(character);
                      }}
                    >
                      <IconX width={11} height={11} />
                    </button>
                  </div>
                ))}
            </div>
            <div className="welcome-actions-row">
              <button className="link-btn" onClick={onImport}>
                <IconPlus width={14} height={14} /> 再导入一张卡
              </button>
              <span className="welcome-tip">共 {characters.length} 张 · 点卡片右上角 ✕ 可删除</span>
            </div>
          </>
        )}
        <div className="welcome-foot">
          <span>PNG / JSON 角色卡</span>
          <span className="dot" />
          <span>自动读取世界书</span>
          <span className="dot" />
          <span>多模型可选</span>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const setHydrated = useStore((s) => s.setHydrated);
  const characters = useStore((s) => s.characters);
  const chats = useStore((s) => s.chats);
  const worldBooks = useStore((s) => s.worldBooks);
  const activeChatId = useStore((s) => s.activeChatId);
  const toast = useStore((s) => s.toast);
  const selectChat = useStore((s) => s.selectChat);
  const openCharacter = useStore((s) => s.openCharacter);
  const createChat = useStore((s) => s.createChat);
  const deleteChat = useStore((s) => s.deleteChat);
  const deleteCharacter = useStore((s) => s.deleteCharacter);
  const importCard = useStore((s) => s.importCard);
  const attachWorldBook = useStore((s) => s.attachWorldBook);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wbCharacterId, setWbCharacterId] = useState<string | null>(null);
  const [cardEditor, setCardEditor] = useState<{ open: boolean; character: Character | null }>({
    open: false,
    character: null,
  });
  const [wbEditor, setWbEditor] = useState<{
    open: boolean;
    book: WorldBook | null;
    attachTo?: string;
  }>({
    open: false,
    book: null,
  });
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const updateInfo = useStore((s) => s.updateInfo);
  const updateSeenVersion = useStore((s) => s.updateSeenVersion);
  const setUpdateInfo = useStore((s) => s.setUpdateInfo);
  const setUpdateChecking = useStore((s) => s.setUpdateChecking);
  const markUpdateSeen = useStore((s) => s.markUpdateSeen);

  // A newer release exists and the user has not opened the settings since.
  const updateReady =
    updateInfo?.status === 'available' &&
    Boolean(updateInfo.latest) &&
    updateInfo.latest !== updateSeenVersion;

  const chat = useMemo(() => selectActiveChat({ chats, activeChatId }), [chats, activeChatId]);
  const character = useMemo(
    () => (chat ? characters.find((c) => c.id === chat.characterId) : undefined),
    [chat, characters],
  );
  const books = useMemo(
    () => booksForCharacter({ worldBooks }, character),
    [worldBooks, character],
  );
  const wbCharacter = characters.find((c) => c.id === wbCharacterId) ?? null;
  const wbBooks = wbCharacter ? booksForCharacter({ worldBooks }, wbCharacter) : [];

  useEffect(() => {
    const finish = () => setHydrated(true);
    const unsub = useStore.persist.onFinishHydration(finish);
    if (useStore.persist.hasHydrated()) finish();
    const timeout = setTimeout(finish, 4000);
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [setHydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (activeChatId && !chats.some((c) => c.id === activeChatId)) selectChat(null);
  }, [hydrated, activeChatId, chats, selectChat]);

  useEffect(() => {
    const onHide = () => {
      flushPersist();
      snapshotNow();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      flushPersist();
      snapshotNow();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!snapshotWasRestored()) return;
    clearRestoredFlag();
    toast('检测到本地存储异常，已从自动快照恢复上次的角色卡与对话', 'success');
  }, [hydrated, toast]);

  useEffect(() => {
    setLeftOpen(false);
    setRightOpen(false);
  }, [activeChatId]);

  const theme = useStore((s) => s.settings.theme);
  const bossKeyEnabled = useStore((s) => s.settings.bossKeyEnabled);
  const bossKey = useStore((s) => s.settings.bossKey);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    return onSystemThemeChange(() => applyTheme('system'));
  }, [theme]);

  useEffect(() => {
    if (!hydrated) return;
    const bridge = window.liteTavern;
    if (!bridge?.setBossKey) return;
    void bridge
      .setBossKey(bossKeyEnabled && bossKey.trim() ? bossKey.trim() : null)
      .then((result) => {
        if (!result.ok) toast(`老板键注册失败：${result.error ?? '快捷键不可用'}`, 'error');
      });
  }, [hydrated, bossKeyEnabled, bossKey, toast]);

  /**
   * Silent update check on launch.
   *
   * Runs once, a moment after the first paint, and never blocks the UI: the
   * result only lights a dot on the settings buttons and pre-fills
   * 设置 → 关于与更新, so the user can look at the release notes whenever they
   * want instead of getting a modal in the middle of a story.
   */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setUpdateChecking(true);
        try {
          const bridge = window.liteTavern;
          const result = bridge?.checkUpdate
            ? await bridge.checkUpdate()
            : await checkForUpdates(__APP_VERSION__, isAndroidApp() ? 'android' : 'windows');
          if (cancelled) return;
          setUpdateInfo({ ...result, checkedAt: Date.now() });
        } catch (cause) {
          if (cancelled) return;
          setUpdateInfo({
            status: 'error',
            current: __APP_VERSION__,
            error: cause instanceof Error ? cause.message : String(cause),
            checkedAt: Date.now(),
          });
        } finally {
          if (!cancelled) setUpdateChecking(false);
        }
      })();
    }, 1600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hydrated, setUpdateChecking, setUpdateInfo]);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    setLeftOpen(false);
    setRightOpen(false);
    // Opening the settings is the acknowledgement: the release notes are right
    // there under 关于与更新, so the dot has done its job.
    const latest = useStore.getState().updateInfo?.latest;
    if (latest && latest !== useStore.getState().updateSeenVersion) markUpdateSeen(latest);
  }, [markUpdateSeen]);

  const startNewChat = useCallback(() => {
    const state = useStore.getState();
    const current = selectActiveChat(state);
    const targetId = current?.characterId ?? state.characters[0]?.id;
    if (!targetId) {
      toast('请先导入一张角色卡', 'info');
      setRightOpen(true);
      return;
    }
    createChat(targetId, 0);
    setLeftOpen(false);
    setRightOpen(false);
  }, [createChat, toast]);

  const openCard = useCallback(
    (characterId: string) => {
      openCharacter(characterId);
      setLeftOpen(false);
      setRightOpen(false);
    },
    [openCharacter],
  );

  const newChatFor = useCallback(
    (characterId: string) => {
      createChat(characterId, 0);
      setLeftOpen(false);
      setRightOpen(false);
    },
    [createChat],
  );

  const pickWelcomeCard = useCallback(
    (id: string) => {
      const existing = useStore
        .getState()
        .chats.filter((c) => c.characterId === id)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (existing) selectChat(existing.id);
      else createChat(id, 0);
    },
    [createChat, selectChat],
  );

  const parseWorldBookFile = useCallback(async (file: File): Promise<WorldBook> => {
    const text = await file.text();
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new Error('世界书文件不是有效的 JSON');
    }
    let source = obj as Record<string, unknown>;
    if (!looksLikeWorldBook(source)) {
      const nested =
        source?.data && typeof source.data === 'object'
          ? (source.data as Record<string, unknown>).character_book
          : source?.character_book;
      if (nested) source = nested as Record<string, unknown>;
    }
    return parseWorldBook(source, file.name.replace(/\.json$/i, ''), 'imported', file.name);
  }, []);

  const handleImportItems = useCallback(
    async (items: Array<{ file: File; path?: string }>) => {
      if (!items.length || importing) return;
      setImporting(true);
      const results: Array<{ item: { file: File; path?: string }; result: ImportResult }> = [];
      const errors: string[] = [];

      for (const item of items) {
        try {
          results.push({ item, result: await importFile(item.file) });
        } catch (error) {
          errors.push(
            `${item.file.name}：${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      let lastCharacter: Character | null = null;
      const pendingBooks: ImportResult[] = [];

      for (const { item, result } of results) {
        if (result.kind === 'worldbook') {
          pendingBooks.push(result);
          continue;
        }
        const extraBooks: Array<{
          name: string;
          entries: WorldBook['entries'];
          source: WorldBook['source'];
          fileName?: string;
        }> = [];
        const worldName = result.card.character.worldName;
        if (worldName && window.liteTavern?.isDesktop) {
          try {
            const cardPath = item.path ?? '';
            if (cardPath) {
              const sibling = await window.liteTavern.readSiblingWorldBook(cardPath, worldName);
              if (sibling) {
                const obj = JSON.parse(sibling.content) as unknown;
                const book = parseWorldBook(
                  obj,
                  sibling.name || worldName,
                  'auto',
                  `${sibling.name}.json`,
                );
                extraBooks.push({
                  name: book.name,
                  entries: book.entries,
                  source: 'auto',
                  fileName: book.fileName,
                });
              }
            }
          } catch {
            // The embedded book, if any, still imports fine.
          }
        }
        const imported = importCard(result.card, extraBooks);
        lastCharacter = imported;
        const state = useStore.getState();
        const attached = state.worldBooks.filter((b) => imported.worldBookIds.includes(b.id));
        const entryCount = attached.reduce((n, b) => n + b.entries.length, 0);
        toast(
          entryCount > 0
            ? `已导入「${imported.name}」，自动挂载世界书 ${entryCount} 条词条`
            : `已导入「${imported.name}」`,
          'success',
        );
        if (worldName && attached.length === 0) {
          toast(`卡引用了世界书「${worldName}」，但没找到文件。可在角色卡菜单里手动导入。`, 'info');
        }
      }

      const targetForBooks =
        lastCharacter?.id ??
        useStore.getState().characters.find((c) => c.id === character?.id)?.id ??
        useStore.getState().characters[0]?.id;
      if (pendingBooks.length && !targetForBooks) {
        toast('世界书需要挂到一张角色卡上：请先导入角色卡，再从卡片菜单导入世界书。', 'error');
      } else if (targetForBooks) {
        for (const result of pendingBooks) {
          if (result.kind !== 'worldbook') continue;
          attachWorldBook(targetForBooks, {
            name: result.book.name,
            entries: result.book.entries,
            source: 'imported',
            fileName: result.fileName,
          });
          toast(`世界书「${result.book.name}」已挂载`, 'success');
        }
      }

      if (errors.length) {
        toast(errors[0], 'error');
        if (errors.length > 1) toast(`另有 ${errors.length - 1} 个文件导入失败`, 'error');
      }

      setImporting(false);
      if (lastCharacter) {
        const id = lastCharacter.id;
        setTimeout(() => pickWelcomeCard(id), 0);
      }
    },
    [attachWorldBook, character?.id, importCard, importing, pickWelcomeCard, toast],
  );

  const handleImportFiles = useCallback(
    (files: File[]) => handleImportItems(files.map((file) => ({ file }))),
    [handleImportItems],
  );

  const pickDesktopCards = useCallback(async () => {
    const bridge = window.liteTavern;
    if (!bridge?.isDesktop) return;
    const paths = await bridge.pickCards();
    if (!paths.length) return;
    const items: Array<{ file: File; path: string }> = [];
    for (const filePath of paths) {
      const info = await bridge.readFile(filePath);
      if (!info) {
        toast(`无法读取：${filePath}`, 'error');
        continue;
      }
      const binary = atob(info.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      items.push({
        file: new File([bytes], info.name, { type: info.mime }),
        path: filePath,
      });
    }
    await handleImportItems(items);
  }, [handleImportItems, toast]);

  const openCardPicker = useCallback(() => {
    if (window.liteTavern?.isDesktop) {
      void pickDesktopCards();
      return;
    }
    document.getElementById('card-file-input')?.click();
  }, [pickDesktopCards]);

  const handleImportWorldBook = useCallback(
    async (characterId: string, file: File) => {
      try {
        const book = await parseWorldBookFile(file);
        attachWorldBook(characterId, {
          name: book.name,
          entries: book.entries,
          source: 'imported',
          fileName: file.name,
        });
        toast(`世界书「${book.name}」已挂载（${book.entries.length} 条）`, 'success');
      } catch (error) {
        toast(error instanceof Error ? error.message : '世界书导入失败', 'error');
      }
    },
    [attachWorldBook, parseWorldBookFile, toast],
  );

  const requestDeleteChat = useCallback(
    (target: Chat) => setConfirm({ kind: 'chat', chat: target }),
    [],
  );
  const requestDeleteCharacter = useCallback(
    (target: Character) => setConfirm({ kind: 'character', character: target }),
    [],
  );

  const confirmDelete = useCallback(() => {
    if (!confirm) return;
    if (confirm.kind === 'chat') {
      deleteChat(confirm.chat.id);
      toast('对话已删除', 'success');
    } else {
      deleteCharacter(confirm.character.id);
      toast(`「${confirm.character.name}」已删除`, 'success');
    }
    setConfirm(null);
  }, [confirm, deleteChat, deleteCharacter, toast]);

  if (!hydrated) return <LoadingScreen />;

  return (
    <div className={`app ${leftOpen ? 'show-left' : ''} ${rightOpen ? 'show-right' : ''}`}>
      {(leftOpen || rightOpen) && (
        <div
          className="drawer-backdrop"
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        />
      )}

      <ChatList
        chats={chats}
        characters={characters}
        activeChatId={activeChatId}
        onSelect={selectChat}
        onNew={startNewChat}
        onRequestDelete={requestDeleteChat}
        onOpenSettings={openSettings}
        onOpenCards={() => {
          setLeftOpen(false);
          setRightOpen(true);
        }}
        updateReady={updateReady}
      />

      {chat && character ? (
        <ChatView
          key={chat.id}
          chat={chat}
          character={character}
          books={books}
          onOpenChats={() => {
            setRightOpen(false);
            setLeftOpen(true);
          }}
          onOpenCards={() => {
            setLeftOpen(false);
            setRightOpen(true);
          }}
          onOpenSettings={openSettings}
          onNewChat={startNewChat}
          onDeleteChat={() => requestDeleteChat(chat)}
          updateReady={updateReady}
        />
      ) : (
        <Welcome
          characters={characters}
          onPick={pickWelcomeCard}
          onImport={() => {
            if (window.liteTavern?.isDesktop) {
              void openCardPicker();
              return;
            }
            // Keep the click inside the user gesture so Android WebView allows the picker.
            document.getElementById('card-file-input')?.click();
            setRightOpen(true);
          }}
          onCreate={() => setCardEditor({ open: true, character: null })}
          onOpenChats={() => setLeftOpen(true)}
          onOpenCards={() => setRightOpen(true)}
          onOpenSettings={openSettings}
          onDelete={requestDeleteCharacter}
          updateReady={updateReady}
        />
      )}

      <CharacterRail
        characters={characters}
        worldBooks={worldBooks}
        activeCharacterId={character?.id}
        onOpenCharacter={openCard}
        onNewChat={newChatFor}
        onPickCards={openCardPicker}
        onCreateCard={() => setCardEditor({ open: true, character: null })}
        onEditCard={(target) => setCardEditor({ open: true, character: target })}
        onImportFiles={(files) => void handleImportFiles(files)}
        onImportWorldBook={(id, file) => void handleImportWorldBook(id, file)}
        onCreateWorldBook={(id) => setWbEditor({ open: true, book: null, attachTo: id })}
        onViewWorldBooks={(target) => setWbCharacterId(target.id)}
        onDeleteCharacter={requestDeleteCharacter}
      />

      {importing && (
        <div className="import-overlay">
          <div className="import-card">
            <span className="spinner" />
            正在解析角色卡与世界书…
          </div>
        </div>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorldBookModal
        character={wbCharacter}
        books={wbBooks}
        onClose={() => setWbCharacterId(null)}
        onEditBook={(book) => setWbEditor({ open: true, book })}
      />
      <CardEditorModal
        open={cardEditor.open}
        character={cardEditor.character}
        onClose={() => setCardEditor({ open: false, character: null })}
        onSaved={(saved, created) => {
          if (created) openCard(saved.id);
        }}
      />
      <WorldBookEditorModal
        open={wbEditor.open}
        book={wbEditor.book}
        onClose={() => setWbEditor({ open: false, book: null })}
        onSaved={(saved) => {
          if (wbEditor.attachTo) {
            attachWorldBook(wbEditor.attachTo, {
              name: saved.name,
              entries: saved.entries,
              source: 'manual',
            });
          }
        }}
      />

      <Modal
        open={Boolean(confirm)}
        title={confirm?.kind === 'character' ? '删除这张角色卡？' : '删除这个对话？'}
        onClose={() => setConfirm(null)}
        width={430}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button className="btn btn-danger" onClick={confirmDelete}>
              删除
            </button>
          </>
        }
      >
        {confirm?.kind === 'character' ? (
          <p className="modal-text">
            「{confirm.character.name}」及其所有对话、独占的世界书都会从本机删除。此操作无法撤销。
          </p>
        ) : (
          <p className="modal-text">
            「{confirm?.chat.title}」的所有消息会从本机删除，角色卡保留。
          </p>
        )}
      </Modal>

      <Toasts />
      <div className="sr-only" aria-live="polite">
        {importing ? '正在导入' : ''}
      </div>
    </div>
  );
}
