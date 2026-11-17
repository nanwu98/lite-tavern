import { useEffect } from 'react';
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
    <div className={`toast toast-${type}`} role="status">
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

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
