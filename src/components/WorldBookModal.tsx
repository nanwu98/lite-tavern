import { useMemo, useState } from 'react';
import type { Character, WorldBook, WorldBookEntry } from '../types';
import { Modal } from './Modal';
import { IconBook } from './Icons';
import { normalizePosition } from '../lib/worldbook';

const POSITION_LABEL: Record<number, string> = {
  0: '角色前',
  1: '角色后',
  2: '作者注释顶',
  3: '作者注释底',
  4: '按深度',
  5: '示例顶',
  6: '示例底',
};

function EntryRow({ entry, index }: { entry: WorldBookEntry; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`wb-entry ${entry.constant ? 'constant' : ''} ${entry.disable ? 'disabled' : ''}`}
    >
      <button className="wb-entry-head" onClick={() => setOpen((v) => !v)}>
        <span className="wb-index">{String(index + 1).padStart(2, '0')}</span>
        <span className="wb-title">{entry.comment}</span>
        <span className="wb-badges">
          {entry.constant && <span className="tag tag-const">常驻</span>}
          {entry.disable && <span className="tag tag-ghost">禁用</span>}
          {entry.keys.length > 0 && <span className="tag tag-key">{entry.keys.length} 键</span>}
          <span className="tag tag-ghost">
            {POSITION_LABEL[normalizePosition(entry.position)] ?? '角色后'}
          </span>
          {entry.position === 4 && <span className="tag tag-ghost">深度 {entry.depth}</span>}
        </span>
        <span className={`wb-caret ${open ? 'open' : ''}`}>›</span>
      </button>
      <div className="wb-keys">
        {entry.keys.length > 0 ? (
          entry.keys.map((key, i) => <code key={`${key}-${i}`}>{key}</code>)
        ) : (
          <span className="muted">无条件常驻</span>
        )}
        {entry.secondaryKeys.length > 0 && (
          <span className="muted">+ 次要键：{entry.secondaryKeys.join(' / ')}</span>
        )}
      </div>
      {open && <div className="wb-content">{entry.content}</div>}
    </div>
  );
}

export function WorldBookModal({
  character,
  books,
  onClose,
  onEditBook,
}: {
  character: Character | null;
  books: WorldBook[];
  onClose: () => void;
  onEditBook: (book: WorldBook) => void;
}) {
  const [query, setQuery] = useState('');
  const total = books.reduce((n, b) => n + b.entries.length, 0);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return books
      .map((book) => ({
        book,
        entries: q
          ? book.entries.filter(
              (e) =>
                e.comment.toLocaleLowerCase().includes(q) ||
                e.content.toLocaleLowerCase().includes(q) ||
                e.keys.some((k) => k.toLocaleLowerCase().includes(q)),
            )
          : book.entries,
      }))
      .filter((item) => item.entries.length > 0);
  }, [books, query]);

  return (
    <Modal
      open={Boolean(character)}
      title={`${character?.name ?? ''} · 世界书`}
      subtitle={`${books.length} 本 · 共 ${total} 条词条`}
      onClose={onClose}
      width={760}
      className="wb-modal"
      footer={
        <button className="btn btn-ghost" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div className="wb-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索词条标题、关键词或内容…"
          aria-label="搜索世界书"
        />
      </div>
      {books.length === 0 ? (
        <div className="panel-empty">
          <IconBook width={28} height={28} />
          <p>这张卡没有挂载世界书。</p>
        </div>
      ) : (
        <div className="wb-books">
          {filtered.map(({ book, entries }) => (
            <section className="wb-book" key={book.id}>
              <header className="wb-book-head">
                <h3>{book.name}</h3>
                <span className="tag tag-book">{entries.length} 条</span>
                <span className="tag tag-ghost">
                  {book.source === 'embedded'
                    ? '卡内嵌'
                    : book.source === 'auto'
                      ? '自动关联'
                      : book.source === 'manual'
                        ? '手动创建'
                        : '手动导入'}
                </span>
                <button className="link-btn wb-edit-btn" onClick={() => onEditBook(book)}>
                  编辑
                </button>
              </header>
              <div className="wb-entries">
                {entries.map((entry, i) => (
                  <EntryRow entry={entry} index={i} key={entry.id} />
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && <div className="panel-empty">没有匹配的词条</div>}
        </div>
      )}
    </Modal>
  );
}
