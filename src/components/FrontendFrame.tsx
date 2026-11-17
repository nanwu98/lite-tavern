import { useEffect, useRef, useState } from 'react';
import { buildMessageDocument } from '../lib/tavern/runtime';
import { useStore } from '../store';
import { resolveTheme } from '../lib/theme';

interface FrontendFrameProps {
  html: string;
  chatId: string;
  messageIndex: number;
  minHeight?: number;
}

/**
 * Renders a card-provided HTML/JS page (the ```html code blocks cards emit, or
 * regex-injected front-ends) inside an iframe, like the 酒馆助手 renderer.
 */
export function FrontendFrame({ html, chatId, messageIndex, minHeight = 280 }: FrontendFrameProps) {
  const theme = useStore((s) => s.settings.theme);
  const [doc, setDoc] = useState('');
  const [error, setError] = useState('');
  const [stalled, setStalled] = useState(false);
  const aliveRef = useRef(true);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    setDoc('');
    setError('');
    setStalled(false);
    void buildMessageDocument(html, { chatId, messageIndex, theme: resolveTheme(theme) })
      .then((document) => {
        if (aliveRef.current) setDoc(document);
      })
      .catch((err: unknown) => {
        if (!aliveRef.current) return;
        console.error('[轻语酒馆] 前端页面渲染失败', err);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [html, chatId, messageIndex, theme]);

  const onLoad = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const body = frameRef.current?.contentDocument?.body;
        if (!body || body.innerHTML.trim().length < 24) setStalled(true);
        else setStalled(false);
      } catch {
        setStalled(true);
      }
    }, 8000);
  };

  if (error) {
    return (
      <div className="frontend-error">
        <span>页面渲染失败</span>
        <code>{error}</code>
      </div>
    );
  }

  return (
    <div className="frontend-shell" style={{ minHeight }}>
      {doc ? (
        <>
          <iframe
            ref={frameRef}
            className="frontend-frame"
            title="角色卡前端页面"
            srcDoc={doc}
            onLoad={onLoad}
          />
          {stalled && (
            <div className="frontend-stalled">
              如果这里应该是角色卡页面：它可能还在加载（卡内脚本需要联网），或当前系统 WebView
              不支持卡内脚本。聊天与世界书不受影响。
            </div>
          )}
        </>
      ) : (
        <div className="frontend-loading">正在加载角色卡页面…</div>
      )}
    </div>
  );
}
