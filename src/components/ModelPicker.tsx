import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProviderModel } from '../lib/providers';
import { IconCheck, IconSearch, IconSparkles, IconX } from './Icons';

interface ModelPickerProps {
  id?: string;
  value: string;
  models: ProviderModel[];
  placeholder?: string;
  disabled?: boolean;
  /** Free-form ids are always accepted: presets and /models are hints, not a whitelist. */
  onChange: (model: string) => void;
}

interface Placement {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const PANEL_MIN_WIDTH = 268;
const PANEL_MAX_HEIGHT = 340;
const VIEWPORT_GAP = 10;

/**
 * Model chooser.
 *
 * Replaces `<input list="…">` + `<datalist>`, which was both unstyled (the
 * browser draws it, so it looked foreign next to the rest of the settings) and
 * unreliable: Android WebView renders datalists inconsistently and the popup is
 * positioned by the OS, not by the app. This is a plain button + portal panel,
 * so it looks the same everywhere and never gets clipped by the modal scroller.
 */
export function ModelPicker({
  id,
  value,
  models,
  placeholder = '选择或输入模型名',
  disabled,
  onChange,
}: ModelPickerProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return models;
    return models.filter(
      (item) =>
        item.id.toLocaleLowerCase().includes(q) ||
        (item.label ?? '').toLocaleLowerCase().includes(q),
    );
  }, [models, query]);

  /** A free-form id typed by the user, offered as the first row when it is new. */
  const typed = query.trim();
  const canUseTyped =
    typed.length > 0 &&
    !models.some((item) => item.id.toLocaleLowerCase() === typed.toLocaleLowerCase());

  const options = useMemo(() => {
    const rows = filtered.map((item) => ({ id: item.id, label: item.label ?? item.id }));
    return rows;
  }, [filtered]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const select = useCallback(
    (model: string) => {
      onChange(model);
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
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(160, openUp ? above : below));
    setPlacement({
      left,
      width,
      maxHeight,
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
    if (!open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const picked = options[active];
      if (picked) select(picked.id);
      else if (typed) select(typed);
    } else if (event.key === 'Tab') {
      close();
    }
  };

  const current = models.find((item) => item.id === value);
  const panel =
    open && placement ? (
      <div
        ref={panelRef}
        className="model-picker-panel"
        style={{
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
          ...(placement.top !== undefined ? { top: placement.top } : { bottom: placement.bottom }),
        }}
        role="listbox"
        aria-label="模型列表"
        onKeyDown={onPanelKeyDown}
      >
        <div className="model-picker-search">
          <IconSearch width={13} height={13} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模型，或直接输入模型名"
            aria-label="搜索模型"
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
        <div className="model-picker-list">
          {canUseTyped && (
            <button
              type="button"
              className="model-option custom"
              onClick={() => select(typed)}
              title="使用这个模型名"
            >
              <span className="model-option-main">
                <span className="model-option-id">{typed}</span>
                <span className="model-option-label">使用自定义模型名</span>
              </span>
            </button>
          )}
          {options.length === 0 && !canUseTyped && (
            <div className="model-picker-empty">
              没有匹配的模型。换个关键词，或直接输入模型名后回车。
            </div>
          )}
          {options.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === value}
              className={`model-option ${index === active ? 'active' : ''} ${
                item.id === value ? 'selected' : ''
              }`}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(item.id)}
            >
              <span className="model-option-main">
                <span className="model-option-id">{item.id}</span>
                {item.label && item.label !== item.id && (
                  <span className="model-option-label">{item.label}</span>
                )}
              </span>
              {item.id === value && <IconCheck width={13} height={13} />}
            </button>
          ))}
        </div>
        <div className="model-picker-foot">
          <IconSparkles width={11} height={11} /> 可手动输入任意模型名，以服务商控制台为准
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`model-picker-trigger ${open ? 'open' : ''} ${value ? '' : 'empty'}`}
        onClick={() => (open ? close() : setOpen(true))}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value || placeholder}
      >
        <span className="model-picker-value">{value || placeholder}</span>
        {current?.label && current.label !== current.id && (
          <span className="model-picker-hint">{current.label}</span>
        )}
        <span className="model-picker-chevron" aria-hidden>
          ⌄
        </span>
      </button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}
