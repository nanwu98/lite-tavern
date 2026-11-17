import { useEffect, useRef, useState } from 'react';
import type { Character } from '../types';
import type { TavernScript } from '../lib/tavern/types';
import { ensureChatScope } from '../lib/tavern/variables';
import { buildScriptDocument, nextIframeId, resetRuntimeState } from '../lib/tavern/runtime';
import { scriptBus } from '../lib/tavern/bus';
import { eventBus } from '../lib/tavern/events';

interface LoadedScript {
  key: string;
  iframeId: string;
  doc: string;
}

const MVU_LOADER = /MagVarUpdate|mvu_zod|MagicalAstrogy/i;

function isMvuScript(script: TavernScript): boolean {
  return MVU_LOADER.test(script.content);
}

function waitForMvu(timeoutMs: number): Promise<boolean> {
  const holder = window as unknown as Record<string, unknown>;
  if (holder.Mvu) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (holder.Mvu) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 200);
  });
}

/**
 * Hidden hosts for the card's Tavern Helper scripts.
 *
 * Each enabled script runs in its own about:srcdoc iframe with a
 * TavernHelper-compatible API attached, exactly like 酒馆助手 does. UI created by
 * those scripts (floating balls, panels) is appended to the app document.
 *
 * MVU-based cards are loaded in two phases: the MVU framework first, then the
 * scripts that depend on `Mvu`, so they never run against an undefined global.
 */
export function ScriptHost({ character, chatId }: { character: Character; chatId: string }) {
  const [scripts, setScripts] = useState<LoadedScript[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const enabled = (character.code?.scripts ?? []).filter((s) => s.enabled && s.content.trim());
    setScripts([]);
    if (!enabled.length) return;

    let cancelled = false;
    const loaded: LoadedScript[] = [];

    const mount = async (script: TavernScript) => {
      const iframeId = nextIframeId('script');
      try {
        const doc = await buildScriptDocument(script.content, {
          chatId,
          scriptId: script.id,
          scriptName: script.name,
          iframeId,
        });
        if (cancelled || !mountedRef.current) return;
        loaded.push({ key: script.id, iframeId, doc });
        setScripts([...loaded]);
      } catch (error) {
        console.error(`[轻语酒馆] 脚本「${script.name}」加载失败`, error);
      }
    };

    void (async () => {
      await ensureChatScope(chatId);
      if (cancelled) return;
      const mvuScripts = enabled.filter(isMvuScript);
      const rest = enabled.filter((s) => !isMvuScript(s));
      for (const script of mvuScripts) await mount(script);
      if (mvuScripts.length) await waitForMvu(20_000);
      if (cancelled) return;
      for (const script of rest) await mount(script);
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      scriptBus.clear();
      resetRuntimeState();
    };
  }, [character.id, chatId, character.code]);

  if (!scripts.length) return null;

  return (
    <div className="script-host" aria-hidden="true">
      {/* 酒馆助手 uses #tavern_helper to let duplicate frameworks pick one host. */}
      <div id="tavern_helper" className="tavern-helper-root">
        {scripts.map((script) => (
          <div key={`marker-${script.key}`} data-script-id={script.key} />
        ))}
      </div>
      {scripts.map((script) => (
        <iframe
          key={`${chatId}:${script.key}:${script.iframeId}`}
          className="script-frame"
          title={`脚本 ${script.key}`}
          srcDoc={script.doc}
          tabIndex={-1}
        />
      ))}
    </div>
  );
}

/** Compact menu with the buttons card scripts registered. */
export function ScriptButtonBar() {
  const [buttons, setButtons] = useState(scriptBus.snapshot());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => scriptBus.subscribe(() => setButtons(scriptBus.snapshot())), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!buttons.length) return null;

  return (
    <div className="script-menu" ref={rootRef}>
      <button
        className={`script-menu-toggle ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title="角色卡脚本提供的功能"
      >
        脚本
        <span className="script-menu-count">{buttons.length}</span>
      </button>
      {open && (
        <div className="script-menu-panel" role="menu">
          {buttons.map((button) => (
            <button
              key={button.id}
              className="script-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void eventBus.emit(button.event);
              }}
            >
              <span>{button.label}</span>
              <small>{button.scriptName}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
