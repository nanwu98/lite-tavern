import { useEffect, useRef, useState } from 'react';
import type { Chat } from '../types';
import { Modal } from './Modal';
import { useStore } from '../store';
import { blobToDataUrl, compressImageDataUrl } from '../lib/image';
import { MAX_CONTEXT_LIMIT, MIN_CONTEXT_LIMIT, normalizeOverrides } from '../lib/chatSettings';
import { formatLimit } from '../lib/tokens';
import { IconAlert, IconImage, IconTrash } from './Icons';

interface ChatSettingsModalProps {
  open: boolean;
  chat: Chat;
  /** Used as the fallback title when the field is cleared. */
  characterName: string;
  onClose: () => void;
}

const LIMIT_PRESETS = [65_536, 131_072, 262_144, 1_048_576];

/** `1.5M`, `128K` … for the chip labels. */
function chipLabel(limit: number): string {
  return limit >= 1_048_576 ? `${Math.round(limit / 1_048_576)}M` : `${Math.round(limit / 1024)}K`;
}

export function ChatSettingsModal({ open, chat, characterName, onClose }: ChatSettingsModalProps) {
  const globalLimit = useStore((s) => s.settings.contextLimit);
  const updateChat = useStore((s) => s.updateChat);
  const toast = useStore((s) => s.toast);
  const [title, setTitle] = useState(chat.title);
  const [limit, setLimit] = useState<number | ''>(chat.overrides?.contextLimit ?? '');
  const [background, setBackground] = useState<string | undefined>(chat.background);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle(chat.title);
      setLimit(chat.overrides?.contextLimit ?? '');
      setBackground(chat.background);
    }
    wasOpen.current = open;
  }, [chat, open]);

  const pickBackground = async (file: File | null) => {
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
      toast('请选择图片文件', 'error');
      return;
    }
    setBusy(true);
    try {
      const raw = await blobToDataUrl(file);
      setBackground(await compressImageDataUrl(raw));
    } catch {
      toast('背景图读取失败，换一张试试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const nextLimit = limit === '' ? 0 : Math.round(Number(limit) || 0);
    const clamped =
      nextLimit > 0
        ? Math.min(MAX_CONTEXT_LIMIT, Math.max(MIN_CONTEXT_LIMIT, nextLimit))
        : undefined;
    updateChat(chat.id, {
      title: title.trim() || characterName,
      overrides: normalizeOverrides({ contextLimit: clamped }),
      background,
    });
    toast('对话设置已保存', 'success');
    onClose();
  };

  return (
    <Modal
      open={open}
      title="对话设置"
      subtitle="只影响这一段对话：标题、上下文长度与背景图"
      onClose={onClose}
      width={560}
      className="chat-settings-modal"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-accent" onClick={save} disabled={busy}>
            保存
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="chat-title">对话标题</label>
        <input
          id="chat-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={characterName}
          maxLength={80}
        />
        <p className="field-hint">显示在左侧对话列表里；留空则使用角色名。</p>
      </div>

      <div className="field">
        <label htmlFor="chat-limit">上下文长度（tokens）</label>
        <div className="chat-limit-row">
          <input
            id="chat-limit"
            type="number"
            min={MIN_CONTEXT_LIMIT}
            max={MAX_CONTEXT_LIMIT}
            step={1024}
            value={limit}
            onChange={(event) =>
              setLimit(event.target.value === '' ? '' : Number(event.target.value))
            }
            placeholder={String(globalLimit)}
          />
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setLimit('')}>
            跟随全局
          </button>
        </div>
        <div className="quick-models">
          {LIMIT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`chip ${Number(limit) === preset ? 'active' : ''}`}
              onClick={() => setLimit(preset)}
            >
              {chipLabel(preset)}
            </button>
          ))}
        </div>
        <p className="field-hint">
          {limit === ''
            ? `当前跟随全局设置：${formatLimit(globalLimit)} tokens。`
            : `这一段对话按 ${formatLimit(Number(limit))} tokens 计算用量与自动压缩。`}
          自动压缩的 80% 阈值也按这个上限算。
        </p>
      </div>

      <div className="field">
        <label>背景图</label>
        <div className={`chat-bg-picker ${background ? 'has-image' : ''}`}>
          {background ? (
            <img src={background} alt="对话背景预览" />
          ) : (
            <div className="chat-bg-empty">
              <IconImage width={22} height={22} />
              <span>还没有背景图</span>
            </div>
          )}
        </div>
        <div className="chat-bg-actions">
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <IconImage width={14} height={14} />{' '}
            {busy ? '处理中…' : background ? '更换图片' : '选择图片'}
          </button>
          {background && (
            <button
              type="button"
              className="btn btn-small btn-ghost btn-danger-ghost"
              onClick={() => setBackground(undefined)}
            >
              <IconTrash width={14} height={14} /> 移除
            </button>
          )}
          {background && (
            <span className="settings-hint">
              约 {Math.max(1, Math.round(background.length / 1024))} KB
            </span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            void pickBackground(file);
          }}
        />
        <p className="field-hint">
          图片只在聊天区背景铺满显示。夜间模式会盖一层很淡的暗色蒙版让文字更清楚，亮色模式不加。
          保存前会自动压缩到 1920px 以内，不会把手机原图塞进本地存储。
        </p>
        <p className="field-hint form-hint-warn">
          <IconAlert width={12} height={12} /> 背景图会随备份一起导出。
        </p>
      </div>
    </Modal>
  );
}
