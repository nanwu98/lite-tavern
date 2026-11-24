import { useEffect, useRef, useState } from 'react';
import type { WorldBook, WorldBookEntry } from '../types';
import { Modal } from './Modal';
import { useStore } from '../store';
import { createEmptyEntry } from '../lib/worldbook';
import { IconPlus, IconTrash } from './Icons';
import { useImeSync } from '../hooks/useImeSync';

interface WorldBookEditorModalProps {
  open: boolean;
  /** null = create a new book; otherwise edit this book. */
  book: WorldBook | null;
  onClose: () => void;
  onSaved: (book: WorldBook) => void;
}

const POSITIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '角色前' },
  { value: 1, label: '角色后' },
  { value: 2, label: '作者注释顶' },
  { value: 3, label: '作者注释底' },
  { value: 4, label: '按深度插入' },
  { value: 5, label: '示例顶' },
  { value: 6, label: '示例底' },
];

function splitKeys(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function EntryEditor({
  entry,
  index,
  onChange,
  onRemove,
}: {
  entry: WorldBookEntry;
  index: number;
  onChange: (patch: Partial<WorldBookEntry>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const fieldId = (name: string) => `wb-entry-${index}-${name}`;

  // Same IME safety net as the composer: entry bodies are long text people
  // paste into, and an IME commit without `input` must not be lost.
  useImeSync(contentRef, (value) => onChange({ content: value }), open);

  // The list scrolls inside the dialog, so an entry opened near the bottom has
  // its fields below the fold; bring the whole card into view when it expands.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <div ref={rootRef} className={`wb-edit-entry ${entry.disable ? 'disabled' : ''}`}>
      <div className="wb-edit-head">
        <button type="button" className="wb-edit-toggle" onClick={() => setOpen((v) => !v)}>
          <span className={`wb-caret ${open ? 'open' : ''}`}>›</span>
          <span className="wb-title">{entry.comment || `词条 ${index + 1}`}</span>
          {entry.constant && <span className="tag tag-const">常驻</span>}
          {entry.disable && <span className="tag tag-ghost">禁用</span>}
          {entry.keys.length > 0 && <span className="tag tag-key">{entry.keys.length} 键</span>}
        </button>
        <button type="button" className="meta-btn danger" onClick={onRemove} title="删除词条">
          <IconTrash width={14} height={14} />
        </button>
      </div>
      {open && (
        <div className="wb-edit-body">
          <div className="field-row two">
            <div className="field">
              <label htmlFor={fieldId('comment')}>标题</label>
              <input
                id={fieldId('comment')}
                value={entry.comment}
                onChange={(e) => onChange({ comment: e.target.value })}
                placeholder="词条标题，方便自己辨认"
              />
            </div>
            <div className="field">
              <label htmlFor={fieldId('order')}>排序（越小越靠前）</label>
              <input
                id={fieldId('order')}
                type="number"
                value={entry.order}
                onChange={(e) => onChange({ order: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor={fieldId('keys')}>关键词（逗号分隔，命中任意一个就触发）</label>
            <input
              id={fieldId('keys')}
              value={entry.keys.join('，')}
              onChange={(e) => onChange({ keys: splitKeys(e.target.value) })}
              placeholder="例如：钟楼，钥匙，守夜人"
            />
          </div>
          <div className="field">
            <label htmlFor={fieldId('secondary')}>次要关键词（可选，配合「选择性触发」）</label>
            <input
              id={fieldId('secondary')}
              value={entry.secondaryKeys.join('，')}
              onChange={(e) => onChange({ secondaryKeys: splitKeys(e.target.value) })}
              placeholder="例如：地下室"
            />
          </div>
          <div className="field">
            <label htmlFor={fieldId('content')}>内容（命中后注入提示词）</label>
            <textarea
              id={fieldId('content')}
              ref={contentRef}
              rows={5}
              value={entry.content}
              onChange={(e) => onChange({ content: e.target.value })}
              placeholder="这个世界观事实、角色关系或规则……"
            />
          </div>
          <div className="field-row three">
            <div className="field">
              <label htmlFor={fieldId('position')}>插入位置</label>
              <select
                id={fieldId('position')}
                value={entry.position}
                onChange={(e) => onChange({ position: Number(e.target.value) })}
              >
                {POSITIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={fieldId('depth')}>深度（按深度插入时）</label>
              <input
                id={fieldId('depth')}
                type="number"
                min={0}
                value={entry.depth}
                onChange={(e) => onChange({ depth: Math.max(0, Number(e.target.value) || 0) })}
                disabled={entry.position !== 4}
              />
            </div>
            <div className="field wb-switches">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={entry.constant}
                  onChange={(e) => onChange({ constant: e.target.checked })}
                />
                <span className="switch-track" />
                <span>常驻</span>
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={entry.disable}
                  onChange={(e) => onChange({ disable: e.target.checked })}
                />
                <span className="switch-track" />
                <span>禁用</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorldBookEditorModal({ open, book, onClose, onSaved }: WorldBookEditorModalProps) {
  const createWorldBook = useStore((s) => s.createWorldBook);
  const updateWorldBook = useStore((s) => s.updateWorldBook);
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState('');
  const [entries, setEntries] = useState<WorldBookEntry[]>([]);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open || wasOpen.current) return;
    if (book) {
      setName(book.name);
      setEntries(book.entries.map((entry) => ({ ...entry })));
    } else {
      setName('');
      setEntries([createEmptyEntry(0)]);
    }
    wasOpen.current = open;
  }, [open, book]);

  useEffect(() => {
    if (!open) wasOpen.current = false;
  }, [open]);

  const patchEntry = (index: number, patch: Partial<WorldBookEntry>) =>
    setEntries((list) => list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  const removeEntry = (index: number) => setEntries((list) => list.filter((_, i) => i !== index));

  const addEntry = () => setEntries((list) => [...list, createEmptyEntry(list.length)]);

  const save = () => {
    const bookName = name.trim();
    if (!bookName) {
      toast('请填写世界书名称', 'error');
      return;
    }
    const valid = entries.filter((entry) => entry.content.trim());
    if (entries.length > 0 && valid.length === 0) {
      toast('至少填写一条词条内容', 'error');
      return;
    }
    const cleaned = valid.map((entry, index) => ({
      ...entry,
      comment: entry.comment.trim() || entry.keys[0] || `词条 ${index + 1}`,
      content: entry.content.trim(),
    }));
    if (book) {
      updateWorldBook(book.id, { name: bookName, entries: cleaned });
      toast('世界书已更新', 'success');
      onSaved({ ...book, name: bookName, entries: cleaned });
    } else {
      const created = createWorldBook({ name: bookName, entries: cleaned });
      toast(`世界书「${created.name}」已创建`, 'success');
      onSaved(created);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      title={book ? '编辑世界书' : '手动创建世界书'}
      subtitle={book ? '修改会立即影响所有使用这本书的角色卡' : '给角色卡加一本自己的设定集'}
      onClose={onClose}
      width={820}
      className="wb-editor-modal"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-accent" onClick={save}>
            {book ? '保存修改' : '创建世界书'}
          </button>
        </>
      }
    >
      <div className="wb-editor">
        <div className="field">
          <label htmlFor="wb-name">世界书名称</label>
          <input
            id="wb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：雾港设定集"
            maxLength={80}
          />
        </div>

        <div className="wb-editor-list">
          {entries.map((entry, index) => (
            <EntryEditor
              key={entry.id}
              entry={entry}
              index={index}
              onChange={(patch) => patchEntry(index, patch)}
              onRemove={() => removeEntry(index)}
            />
          ))}
          {entries.length === 0 && (
            <div className="panel-empty">还没有词条，点下面的按钮添加。</div>
          )}
        </div>

        <button type="button" className="btn btn-ghost wb-add-entry" onClick={addEntry}>
          <IconPlus width={15} height={15} /> 添加词条
        </button>
      </div>
    </Modal>
  );
}
