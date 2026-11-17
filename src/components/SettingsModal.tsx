import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store';
import { DEFAULT_SETTINGS } from '../defaults';
import type { Settings } from '../types';
import { testConnection } from '../lib/api';
import { formatLimit } from '../lib/tokens';
import { backupFileName, parseBackup, statsSummary, type BackupPayload } from '../lib/backup';
import { pickTextFile, saveTextFile } from '../lib/backupFile';
import { IconAlert, IconArchive, IconCheck, IconCompress, IconSparkles } from './Icons';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const CONTEXT_PRESETS = [65_536, 131_072, 262_144];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<Settings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [appInfo, setAppInfo] = useState<{
    version: string;
    userData: string;
    portable: boolean;
  } | null>(null);
  const wasOpen = useRef(false);
  const apiKeyRef = useRef(settings.apiKey);
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const exportBackup = useStore((s) => s.exportBackup);
  const importBackup = useStore((s) => s.importBackup);
  const [backupCards, setBackupCards] = useState(true);
  const [backupChats, setBackupChats] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<{
    name: string;
    payload: BackupPayload;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const bridge = window.liteTavern;
    if (!bridge?.getAppInfo) return;
    void bridge
      .getAppInfo()
      .then((info) =>
        setAppInfo({ version: info.version, userData: info.userData, portable: info.portable }),
      )
      .catch(() => setAppInfo(null));
  }, [open]);

  useEffect(() => {
    // Only initialise the draft on a closed → open transition. Do not reset it
    // when unrelated store updates (or a slow IndexedDB hydration) change the
    // settings object: on Android that used to wipe a key that was being typed.
    if (open && !wasOpen.current) {
      setDraft(settings);
      apiKeyRef.current = settings.apiKey;
      setTestResult(null);
      setTesting(false);
    }
    wasOpen.current = open;
  }, [open, settings]);

  const patch = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }));

  const readApiKey = () => (apiKeyInputRef.current?.value ?? apiKeyRef.current).trim();

  const persistKey = () => {
    const apiKey = readApiKey();
    if (apiKey) updateSettings({ apiKey });
  };

  const handleExport = async () => {
    if (!backupCards && !backupChats) {
      toast('至少勾选一项要备份的内容', 'error');
      return;
    }
    const payload = exportBackup({ characters: backupCards, chats: backupChats }, __APP_VERSION__);
    if (!payload.characters.length && !payload.chats.length) {
      toast('还没有可以备份的角色卡或对话', 'info');
      return;
    }
    setExporting(true);
    const name = backupFileName();
    const result = await saveTextFile(name, JSON.stringify(payload, null, 2));
    setExporting(false);
    if (!result.ok) {
      if (!result.canceled) toast(`导出失败：${result.error ?? '未知错误'}`, 'error');
      return;
    }
    toast(
      result.shared
        ? '备份已生成，请在分享面板里保存'
        : result.path
          ? `备份已保存：${result.path}`
          : '备份已导出',
      'success',
    );
  };

  const readBackup = async (source: File | { name: string; content: string }) => {
    try {
      const content = 'content' in source ? source.content : await source.text();
      const payload = parseBackup(content);
      setPendingBackup({ name: source.name, payload });
    } catch (error) {
      toast(error instanceof Error ? error.message : '导入失败', 'error');
    }
  };

  const handleImportClick = async () => {
    if (window.liteTavern?.isDesktop && window.liteTavern.pickBackup) {
      const picked = await window.liteTavern.pickBackup();
      if (picked) await readBackup(picked);
      return;
    }
    backupInputRef.current?.click();
  };

  const confirmImport = () => {
    if (!pendingBackup) return;
    const stats = importBackup(pendingBackup.payload);
    setPendingBackup(null);
    toast(statsSummary(stats), 'success');
  };

  const save = () => {
    const baseUrl = draft.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl;
    const model = draft.model.trim() || DEFAULT_SETTINGS.model;
    const apiKey = readApiKey();
    if (draft.bossKeyEnabled && !draft.bossKey.trim()) {
      toast('请填写老板键快捷键，例如 Ctrl+Shift+H', 'error');
      return;
    }
    updateSettings({
      ...draft,
      apiKey,
      baseUrl,
      model,
      bossKey: draft.bossKey.trim() || DEFAULT_SETTINGS.bossKey,
      temperature: Math.min(2, Math.max(0, Number(draft.temperature) || 0)),
      maxTokens: Math.min(16384, Math.max(0, Math.round(Number(draft.maxTokens) || 0))),
      contextMessages: Math.min(200, Math.max(4, Math.round(Number(draft.contextMessages) || 40))),
      contextLimit: Math.min(
        1_000_000,
        Math.max(2000, Math.round(Number(draft.contextLimit) || 65536)),
      ),
      loreBudget: Math.min(80_000, Math.max(1000, Math.round(Number(draft.loreBudget) || 16000))),
      userName: draft.userName.trim() || '旅人',
    });
    toast('设置已保存', 'success');
    onClose();
  };

  const runTest = async () => {
    const apiKey = readApiKey();
    if (!apiKey) {
      setTestResult({ ok: false, message: '请先填写 API Key。' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await testConnection({ ...draft, apiKey });
    setTesting(false);
    setTestResult({ ok: result.ok, message: result.message });
    if (result.ok) {
      // Persist the key as soon as it is proven valid, so an Android WebView
      // field reset or an accidental close can never lose it again.
      updateSettings({ apiKey });
    }
  };

  return (
    <Modal
      open={open}
      title="设置"
      subtitle="连接 DeepSeek，调整角色扮演与上下文参数"
      onClose={onClose}
      width={720}
      className="settings-modal"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-accent" onClick={save}>
            保存设置
          </button>
        </>
      }
    >
      <div className="settings-scroll">
        <section className="settings-section">
          <div className="section-title">
            <IconSparkles width={16} height={16} /> DeepSeek 连接
          </div>
          <div className="field">
            <label htmlFor="api-key">API Key</label>
            <div className="input-with-action">
              <input
                ref={apiKeyInputRef}
                id="api-key"
                type="text"
                className={showKey ? '' : 'secret-input'}
                defaultValue={settings.apiKey}
                onChange={(e) => {
                  apiKeyRef.current = e.target.value;
                }}
                onBlur={persistKey}
                placeholder="sk-..."
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
              />
              <button type="button" className="input-action" onClick={() => setShowKey((v) => !v)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <p className="field-hint">
              到{' '}
              <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">
                platform.deepseek.com/api_keys
              </a>{' '}
              创建，Key 只显示一次。它仅保存在本机，不会上传到别处。
            </p>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="base-url">Base URL</label>
              <input
                id="base-url"
                value={draft.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                placeholder="https://api.deepseek.com"
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="model">模型</label>
              <input
                id="model"
                value={draft.model}
                onChange={(e) => patch({ model: e.target.value })}
                list="model-options"
                placeholder="deepseek-flash"
                spellCheck={false}
              />
              <datalist id="model-options">
                <option value="deepseek-flash" />
                <option value="deepseek-v4-pro" />
                <option value="deepseek-chat" />
                <option value="deepseek-reasoner" />
              </datalist>
            </div>
          </div>
          <div className="quick-models">
            {['deepseek-flash', 'deepseek-v4-pro'].map((model) => (
              <button
                key={model}
                type="button"
                className={`chip ${draft.model === model ? 'active' : ''}`}
                onClick={() => patch({ model })}
              >
                {model}
                {model === 'deepseek-flash' && <span className="chip-hint">推荐</span>}
              </button>
            ))}
          </div>
          <div className="test-row">
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => void runTest()}
              disabled={testing}
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            {testResult && (
              <span className={`test-result ${testResult.ok ? 'ok' : 'bad'}`}>
                {testResult.ok ? (
                  <IconCheck width={14} height={14} />
                ) : (
                  <IconAlert width={14} height={14} />
                )}
                {testResult.message}
              </span>
            )}
          </div>
          <p className="field-hint">
            官方文档：
            <a href="https://api-docs.deepseek.com/zh-cn/" target="_blank" rel="noreferrer">
              api-docs.deepseek.com
            </a>
            。 模型名以官方文档为准；旧版 deepseek-chat 仍可手动填写。
          </p>
        </section>

        <section className="settings-section">
          <div className="section-title">角色扮演</div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="user-name">你的称呼（{'{{user}}'}）</label>
              <input
                id="user-name"
                value={draft.userName}
                onChange={(e) => patch({ userName: e.target.value })}
                placeholder="旅人"
              />
            </div>
            <div className="field">
              <label htmlFor="temperature">温度 · {Number(draft.temperature).toFixed(1)}</label>
              <input
                id="temperature"
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(e) => patch({ temperature: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="user-persona">你的设定（可选，会以 {'{{user}}'} 身份写入提示词）</label>
            <textarea
              id="user-persona"
              rows={3}
              value={draft.userPersona}
              onChange={(e) => patch({ userPersona: e.target.value })}
              placeholder="例如：一名路过的年轻旅人，随身带着旧地图。"
            />
          </div>
        </section>

        <section className="settings-section">
          <div className="section-title">上下文与生成</div>
          <div className="field-row three">
            <div className="field">
              <label htmlFor="max-tokens">最大回复 Token</label>
              <input
                id="max-tokens"
                type="number"
                min={0}
                max={16384}
                step={128}
                value={draft.maxTokens}
                onChange={(e) => patch({ maxTokens: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="context-messages">携带历史消息</label>
              <input
                id="context-messages"
                type="number"
                min={4}
                max={200}
                step={2}
                value={draft.contextMessages}
                onChange={(e) => patch({ contextMessages: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="lore-budget">世界书字符上限</label>
              <input
                id="lore-budget"
                type="number"
                min={1000}
                max={80000}
                step={1000}
                value={draft.loreBudget}
                onChange={(e) => patch({ loreBudget: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="switch-row">
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.stream}
                onChange={(e) => patch({ stream: e.target.checked })}
              />
              <span className="switch-track" />
              <span>流式输出（逐字显示）</span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.enterToSend}
                onChange={(e) => patch({ enterToSend: e.target.checked })}
              />
              <span className="switch-track" />
              <span>Enter 发送</span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="section-title">
            <IconCompress width={16} height={16} /> 上下文压缩
          </div>
          <div className="switch-row">
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.autoCompact}
                onChange={(e) => patch({ autoCompact: e.target.checked })}
              />
              <span className="switch-track" />
              <span>自动压缩上下文（达到上限 80% 时自动摘要旧对话）</span>
            </label>
          </div>
          <div className="field">
            <label htmlFor="context-limit">
              上下文上限（tokens）· 当前 ≈ {formatLimit(Number(draft.contextLimit) || 0)}
            </label>
            <input
              id="context-limit"
              type="number"
              min={2000}
              max={1_000_000}
              step={1024}
              value={draft.contextLimit}
              onChange={(e) => patch({ contextLimit: Number(e.target.value) })}
            />
            <div className="quick-models">
              {CONTEXT_PRESETS.map((limit) => (
                <button
                  key={limit}
                  type="button"
                  className={`chip ${Number(draft.contextLimit) === limit ? 'active' : ''}`}
                  onClick={() => patch({ contextLimit: limit })}
                >
                  {formatLimit(limit)}
                </button>
              ))}
            </div>
            <p className="settings-hint">
              按模型的上下文窗口填写，以 DeepSeek
              官方文档为准。压缩会把最早的一批消息交给模型总结成一段长期记忆， 之后只发送「记忆 +
              最近几条消息」；摘要会随对话不断合并更新，老剧情不会丢。
            </p>
            <p className="settings-hint">
              关掉自动压缩也不会丢消息：真正撞到上下文上限时，对话里会出现「一键压缩上下文并继续对话」按钮，
              点一下就走同一套压缩流程。
            </p>
          </div>
        </section>

        <section className="settings-section">
          <div className="section-title">角色卡代码</div>
          <div className="switch-row">
            <label className="switch">
              <input
                type="checkbox"
                checked={draft.cardScripts}
                onChange={(e) => patch({ cardScripts: e.target.checked })}
              />
              <span className="switch-track" />
              <span>运行动作卡内的 HTML / JS（酒馆助手脚本、状态栏、悬浮窗）</span>
            </label>
          </div>
          <p className="settings-hint">
            开启后，导入角色卡里的脚本会在隔离的 iframe 中执行，并可通过变量接口读写本对话的数据。
            只从你信任的来源导入带脚本的角色卡；关闭后卡片页面不再渲染，聊天记录与世界书不受影响。
          </p>
        </section>

        <section className="settings-section">
          <div className="section-title">外观</div>
          <div className="theme-choices" role="radiogroup" aria-label="主题">
            {(
              [
                ['system', '跟随系统'],
                ['dark', '深色'],
                ['light', '亮色'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={draft.theme === value}
                className={`theme-choice ${draft.theme === value ? 'active' : ''}`}
                onClick={() => patch({ theme: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="settings-hint">跟随系统时会随 Windows / Android 的深色模式自动切换。</p>
        </section>

        {window.liteTavern?.isDesktop && (
          <section className="settings-section">
            <div className="section-title">老板键（桌面版）</div>
            <div className="switch-row">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={draft.bossKeyEnabled}
                  onChange={(e) => patch({ bossKeyEnabled: e.target.checked })}
                />
                <span className="switch-track" />
                <span>启用全局快捷键隐藏 / 恢复窗口</span>
              </label>
            </div>
            <div className="field">
              <label htmlFor="boss-key">快捷键</label>
              <input
                id="boss-key"
                value={draft.bossKey}
                onChange={(e) => patch({ bossKey: e.target.value })}
                placeholder="Ctrl+Shift+H"
                disabled={!draft.bossKeyEnabled}
              />
              <p className="settings-hint">
                形如 <code>Ctrl+Shift+H</code>、<code>Alt+X</code>、<code>Ctrl+Alt+Space</code>。
                按一次隐藏窗口，再按一次恢复；保存时若被其他程序占用会提示。
              </p>
            </div>
          </section>
        )}

        <section className="settings-section">
          <div className="section-title">
            <IconArchive width={16} height={16} /> 备份与恢复
          </div>
          <div className="switch-row">
            <label className="switch">
              <input
                type="checkbox"
                checked={backupCards}
                onChange={(e) => setBackupCards(e.target.checked)}
              />
              <span className="switch-track" />
              <span>角色卡（含世界书）</span>
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={backupChats}
                onChange={(e) => setBackupChats(e.target.checked)}
              />
              <span className="switch-track" />
              <span>聊天记录（含对应角色卡）</span>
            </label>
          </div>
          <div className="backup-actions">
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              <IconArchive width={15} height={15} /> {exporting ? '正在导出…' : '导出备份'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void handleImportClick()}
            >
              <IconArchive width={15} height={15} /> 导入备份…
            </button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void readBackup(file);
              }}
            />
          </div>
          <p className="settings-hint">
            备份是带时间戳的 JSON 文件（如 <code>LiteTavern-backup-2026-11-17-1030.json</code>），
            Windows 与 Android 之间可以互相导入。
          </p>
          <p className="settings-hint">
            导入会<b>合并</b>
            到现有数据：已经存在的角色卡、世界书和对话会跳过，不会覆盖或删除本机内容。 备份不包含
            API Key 与界面设置。
          </p>
        </section>

        <section className="settings-section">
          <div className="section-title">存储位置</div>
          {window.liteTavern?.isDesktop ? (
            <>
              <div className="field">
                <label>数据目录（角色卡、世界书、对话都在这里）</label>
                <div className="data-path" title={appInfo?.userData ?? ''}>
                  {appInfo?.userData ?? '读取中…'}
                </div>
                <div className="data-path-actions">
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={async () => {
                      const result = await window.liteTavern?.openDataDir();
                      if (result && !result.ok) toast(result.error ?? '无法打开数据目录', 'error');
                    }}
                  >
                    打开数据文件夹
                  </button>
                  <span className="settings-hint">
                    {appInfo?.portable
                      ? '便携模式：数据在 exe 同级的 UserData 里，直接双击解压出来的 LiteTavern.exe 也会读同一份。'
                      : '数据保存在系统用户目录。'}
                  </span>
                </div>
              </div>
              <p className="settings-hint">版本 {appInfo?.version ?? '—'}</p>
            </>
          ) : (
            <p className="settings-hint">
              Android 版把角色卡、世界书与对话保存在应用自己的 IndexedDB 里，卸载应用会一并删除。
            </p>
          )}
        </section>

        <p className="settings-note">
          所有角色卡、世界书与聊天记录只保存在本机（IndexedDB）。只有调用模型时，提示词会发送到你填写的
          Base URL。
        </p>

        <Modal
          open={Boolean(pendingBackup)}
          title="导入这个备份？"
          subtitle="这里只做合并，不会删除本机已有的角色卡或对话。"
          onClose={() => setPendingBackup(null)}
          width={460}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPendingBackup(null)}>
                取消
              </button>
              <button className="btn btn-accent" onClick={confirmImport}>
                导入
              </button>
            </>
          }
        >
          <p className="modal-text">
            文件：<span className="backup-file-name">{pendingBackup?.name}</span>
          </p>
          <ul className="backup-summary">
            <li>{pendingBackup?.payload.characters.length ?? 0} 张角色卡</li>
            <li>{pendingBackup?.payload.worldBooks.length ?? 0} 本世界书</li>
            <li>{pendingBackup?.payload.chats.length ?? 0} 段对话</li>
          </ul>
          <p className="settings-hint">备份里已经存在的条目会自动跳过，不会重复添加。</p>
        </Modal>
      </div>
    </Modal>
  );
}
