import { useEffect, useRef, useState } from 'react';
import type { Character } from '../types';
import { Modal } from './Modal';
import { useStore } from '../store';
import { blobToDataUrl, shrinkDataUrl } from '../lib/image';

interface CardEditorModalProps {
  open: boolean;
  /** null = create a new card; otherwise edit this one. */
  character: Character | null;
  onClose: () => void;
  onSaved: (character: Character, created: boolean) => void;
}

interface Draft {
  name: string;
  notes: string;
  avatar?: string;
  systemPrompt: string;
  firstMes: string;
}

const EMPTY: Draft = { name: '', notes: '', avatar: undefined, systemPrompt: '', firstMes: '' };

function draftOf(character: Character | null): Draft {
  if (!character) return { ...EMPTY };
  return {
    name: character.name,
    notes: character.notes ?? '',
    avatar: character.avatar,
    systemPrompt: character.systemPrompt,
    firstMes: character.firstMes,
  };
}

export function CardEditorModal({ open, character, onClose, onSaved }: CardEditorModalProps) {
  const createCharacter = useStore((s) => s.createCharacter);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) setDraft(draftOf(character));
    wasOpen.current = open;
  }, [open, character]);

  const patch = (value: Partial<Draft>) => setDraft((current) => ({ ...current, ...value }));

  const pickAvatar = async (file: File | null) => {
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
      toast('请选择图片文件', 'error');
      return;
    }
    try {
      const url = await blobToDataUrl(file);
      patch({ avatar: await shrinkDataUrl(url) });
    } catch {
      toast('头像读取失败', 'error');
    }
  };

  const save = () => {
    const name = draft.name.trim();
    if (!name) {
      toast('请填写角色名', 'error');
      return;
    }
    if (!draft.systemPrompt.trim() && !draft.firstMes.trim()) {
      toast('提示词和开场白至少填一项', 'error');
      return;
    }
    setSaving(true);
    try {
      if (character) {
        updateCharacter(character.id, {
          name,
          notes: draft.notes.trim(),
          avatar: draft.avatar,
          systemPrompt: draft.systemPrompt.trim(),
          firstMes: draft.firstMes.trim(),
        });
        toast('角色卡已更新（已有对话不受影响）', 'success');
        onSaved({ ...character, name, notes: draft.notes.trim() }, false);
      } else {
        const created = createCharacter({
          name,
          notes: draft.notes,
          avatar: draft.avatar,
          systemPrompt: draft.systemPrompt,
          firstMes: draft.firstMes,
        });
        toast(`已创建「${created.name}」`, 'success');
        onSaved(created, true);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={character ? '编辑角色卡' : '手动创建角色卡'}
      subtitle={
        character
          ? '修改会立即生效；已经开始的对话保持原样'
          : '只填你需要的：头像、名字、备注、提示词、开场白'
      }
      onClose={onClose}
      width={760}
      className="card-editor-modal"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-accent" onClick={save} disabled={saving}>
            {character ? '保存修改' : '创建角色卡'}
          </button>
        </>
      }
    >
      <div className="card-editor">
        <div className="card-editor-top">
          <button
            type="button"
            className="avatar-picker"
            onClick={() => fileRef.current?.click()}
            title="选择头像"
          >
            {draft.avatar ? (
              <img src={draft.avatar} alt="角色头像" />
            ) : (
              <span className="avatar-picker-empty">
                ＋<small>头像</small>
              </span>
            )}
          </button>
          <div className="card-editor-top-fields">
            <div className="field">
              <label htmlFor="card-name">角色名</label>
              <input
                id="card-name"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="例如：临渊"
                maxLength={80}
              />
            </div>
            <div className="field">
              <label htmlFor="card-notes">备注</label>
              <input
                id="card-notes"
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder="只显示在角色卡列表，不会发给模型"
                maxLength={200}
              />
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = '';
              void pickAvatar(file);
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="card-prompt">提示词（写入系统提示词）</label>
          <textarea
            id="card-prompt"
            className="card-editor-textarea"
            value={draft.systemPrompt}
            onChange={(e) => patch({ systemPrompt: e.target.value })}
            placeholder={
              '描述角色是谁、性格、说话方式、世界观与禁止事项。\n例如：你是临渊，沉默的守夜人……'
            }
            rows={10}
          />
          <p className="field-hint">这段文字会作为角色的系统提示词，与世界书一起参与每次请求。</p>
        </div>

        <div className="field">
          <label htmlFor="card-greeting">开场白（AI 的第一条消息）</label>
          <textarea
            id="card-greeting"
            className="card-editor-textarea"
            value={draft.firstMes}
            onChange={(e) => patch({ firstMes: e.target.value })}
            placeholder={
              '角色开口说的第一段话，可以是场景描写或对白。\n例如：*雨声渐歇*「你终于来了。」'
            }
            rows={8}
          />
          <p className="field-hint">
            新建对话时，这段话会成为 AI 的第一条消息；可随时在聊天里编辑。
          </p>
        </div>
      </div>
    </Modal>
  );
}
