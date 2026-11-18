import { IconChevronLeft, IconChevronRight } from './Icons';

interface PagerProps {
  /** Zero-based current page. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Extra class for the surrounding nav (e.g. vertical placement). */
  className?: string;
  label?: string;
}

/**
 * Small theme-native pager used by the start screen and the card rail.
 * Prev/next are real buttons with a disabled state; the indicator is the only
 * text so the control stays compact on phones.
 */
export function Pager({ page, pageCount, onChange, className = '', label = '分页' }: PagerProps) {
  if (pageCount <= 1) return null;
  const current = Math.min(pageCount - 1, Math.max(0, page));
  const go = (next: number) => onChange(Math.min(pageCount - 1, Math.max(0, next)));
  return (
    <nav className={`pager ${className}`.trim()} aria-label={label}>
      <button
        type="button"
        className="pager-btn"
        onClick={() => go(current - 1)}
        disabled={current <= 0}
        aria-label="上一页"
      >
        <IconChevronLeft width={14} height={14} />
        上一页
      </button>
      <span className="pager-info" aria-live="polite">
        {current + 1} / {pageCount}
      </span>
      <button
        type="button"
        className="pager-btn"
        onClick={() => go(current + 1)}
        disabled={current >= pageCount - 1}
        aria-label="下一页"
      >
        下一页
        <IconChevronRight width={14} height={14} />
      </button>
    </nav>
  );
}
