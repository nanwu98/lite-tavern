import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconSearch, IconX } from './Icons';

export interface DropdownOption {
  /** Stored value (model id, provider id, …). */
  value: string;
  /** Primary text shown in the trigger and the row. */
  label: string;
  /** Muted second line: a description, a hint or the provider's platform name. */
  hint?: string;
}

interface DropdownProps {
  id?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shows a filter box at the top of the panel. */
  searchable?: boolean;
  /** Accepts a typed value that is not in `options` (free-form model ids). */
  allowCustom?: boolean;
  customHint?: string;
  /** One-line note pinned to the bottom of the panel. */
  footer?: React.ReactNode;
  emptyText?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

interface Placement {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const PANEL_MIN_WIDTH = 240;
const PANEL_MAX_HEIGHT = 340;
const VIEWPORT_GAP = 10;

/**
 * Custom dropdown used everywhere in the settings dialog.
 *
 * Replaces both `<select>` and `<input list>`: the browser draws those itself,
 * so they ignored the app's theme, and on Android WebView the native popup is
 * positioned by the OS (it can land under the keyboard or be clipped by the
 * dialog). This panel is a body-level portal that measures the trigger, flips
 * above when there is no room below, and stays inside the viewport.
 */
export function Dropdown({
  id,
  value,
  options,
  onChange,
  placeholder = '请选择',
  searchable = false,
  allowCustom = false,
  customHint = '使用自定义值',
  footer,
  emptyText = '没有匹配的选项',
  ariaLabel,
  disabled,
}: DropdownProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return options;
    return options.filter(
      (item) =>
        item.value.toLocaleLowerCase().includes(q) ||
        item.label.toLocaleLowerCase().includes(q) ||
        (item.hint ?? '').toLocaleLowerCase().includes(q),
    );
  }, [options, query]);

  const typed = query.trim();
  const canUseTyped =
    allowCustom &&
    typed.length > 0 &&
    !options.some((item) => item.value.toLocaleLowerCase() === typed.toLocaleLowerCase());

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const select = useCallback(
    (next: string) => {
      onChange(next);
      close();
      triggerRef.current?.focus();
    },
    [close, onChange],
  );

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(
      Math.max(rect.width, PANEL_MIN_WIDTH),
      window.innerWidth - VIEWPORT_GAP * 2,
    );
    const left = Math.min(
      Math.max(VIEWPORT_GAP, rect.left),
      window.innerWidth - width - VIEWPORT_GAP,
    );
    const below = window.innerHeight - rect.bottom - VIEWPORT_GAP;
    const above = rect.top - VIEWPORT_GAP;
    const openUp = below < 220 && above > below;
    setPlacement({
      left,
      width,
      maxHeight: Math.min(PANEL_MAX_HEIGHT, Math.max(160, openUp ? above : below)),
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onScrollOrResize = () => measure();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [measure, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open || !searchable) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open, searchable]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const picked = filtered[active];
      if (picked) select(picked.value);
      else if (typed) select(typed);
    } else if (event.key === 'Tab') {
      close();
    }
  };

  const current = options.find((item) => item.value === value);
  const panel =
    open && placement ? (
      <div
        ref={panelRef}
        id={id ? `${id}-panel` : undefined}
        className="dropdown-panel"
        style={{
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
          ...(placement.top !== undefined ? { top: placement.top } : { bottom: placement.bottom }),
        }}
        role="listbox"
        aria-label={ariaLabel ?? '选项列表'}
        onKeyDown={onPanelKeyDown}
      >
        {searchable && (
          <div className="dropdown-search">
            <IconSearch width={13} height={13} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索，或直接输入"
              aria-label="搜索"
              spellCheck={false}
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                className="icon-btn tiny"
                onClick={() => setQuery('')}
                aria-label="清空搜索"
              >
                <IconX width={11} height={11} />
              </button>
            )}
          </div>
        )}
        <div className="dropdown-list">
          {canUseTyped && (
            <button
              type="button"
              className="dropdown-option custom"
              onClick={() => select(typed)}
              title={customHint}
            >
              <span className="dropdown-option-main">
                <span className="dropdown-option-value">{typed}</span>
                <span className="dropdown-option-hint">{customHint}</span>
              </span>
            </button>
          )}
          {filtered.length === 0 && !canUseTyped && (
            <div className="dropdown-empty">{emptyText}</div>
          )}
          {filtered.map((item, index) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={`dropdown-option ${index === active ? 'active' : ''} ${
                item.value === value ? 'selected' : ''
              }`}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(item.value)}
            >
              <span className="dropdown-option-main">
                <span className="dropdown-option-value">{item.label}</span>
                {item.hint && <span className="dropdown-option-hint">{item.hint}</span>}
              </span>
              {item.value === value && <IconCheck width={13} height={13} />}
            </button>
          ))}
        </div>
        {footer && <div className="dropdown-foot">{footer}</div>}
      </div>
    ) : null;

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`dropdown-trigger ${open ? 'open' : ''} ${value ? '' : 'empty'}`}
        onClick={() => (open ? close() : setOpen(true))}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={
          current ? `${current.label}${current.hint ? ` · ${current.hint}` : ''}` : placeholder
        }
      >
        <span className="dropdown-value">{current?.label ?? (value || placeholder)}</span>
        {current?.hint && <span className="dropdown-hint">{current.hint}</span>}
        <span className="dropdown-chevron" aria-hidden>
          ⌄
        </span>
      </button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}
