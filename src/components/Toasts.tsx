import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { IconAlert, IconCheck, IconSparkles, IconX } from './Icons';

function ToastItem({
  id,
  message,
  type,
}: {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}) {
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3600);
    return () => clearTimeout(timer);
  }, [id, type, dismiss]);

  return (
    <div className={`toast toast-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="toast-icon">
        {type === 'success' ? <IconCheck /> : type === 'error' ? <IconAlert /> : <IconSparkles />}
      </span>
      <span className="toast-text">{message}</span>
      <button className="toast-close" onClick={() => dismiss(id)} aria-label="关闭提示">
        <IconX width={14} height={14} />
      </button>
    </div>
  );
}

/**
 * Toasts live in a portal on `document.body`.
 *
 * They used to be rendered inside `.app`, which is `isolation: isolate` and
 * therefore its own stacking context: every modal (a body-level portal at
 * z-index 100) painted above them, so "请填写角色名" was invisible while the
 * card editor was open. Mounting them next to the modals puts them in the same
 * stacking context, where their higher z-index actually wins.
 */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return createPortal(
    <div className="toast-stack">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>,
    document.body,
  );
}
