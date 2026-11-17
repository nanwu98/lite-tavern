import { useEffect, useRef, useState } from 'react';
import {
  checkForUpdates,
  downloadAndroidUpdate,
  ensureAndroidInstallAllowed,
  formatDownloadSize,
  installAndroidUpdate,
  isAndroidApp,
  releasePageUrl,
  type UpdateAsset,
  type UpdateCheck,
} from '../lib/update';
import { IconDownload, IconRefresh } from './Icons';

type Phase = 'idle' | 'checking' | 'ready' | 'downloading' | 'installing' | 'restarting' | 'done';

const STATUS_LABEL: Record<Phase, string> = {
  idle: '',
  checking: '正在检查更新…',
  ready: '',
  downloading: '正在下载…',
  installing: '正在安装…',
  restarting: '正在重启轻语酒馆…',
  done: '新版本已交给系统安装，请按提示完成。',
};

function percent(received: number, total: number): string {
  if (!total) return formatDownloadSize(received);
  return `${Math.min(100, Math.round((received / total) * 100))}%`;
}

export function UpdateSection() {
  const desktop = Boolean(window.liteTavern?.isDesktop);
  const android = isAndroidApp();
  const [current, setCurrent] = useState(__APP_VERSION__);
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const bridge = window.liteTavern;
    if (bridge?.getAppInfo) {
      bridge
        .getAppInfo()
        .then((info) => {
          if (mounted.current) setCurrent(info.version);
        })
        .catch(() => undefined);
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  const runCheck = async () => {
    setPhase('checking');
    setError('');
    setProgress('');
    try {
      const result = desktop
        ? await window.liteTavern!.checkUpdate()
        : await checkForUpdates(__APP_VERSION__, android ? 'android' : 'windows');
      if (!mounted.current) return;
      setCheck(result);
      setPhase('ready');
      if (result.status === 'error') setError(result.error ?? '检查更新失败');
    } catch (cause) {
      if (!mounted.current) return;
      setPhase('idle');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const asset: UpdateAsset | undefined = check?.asset;

  const downloadDesktop = async () => {
    setPhase('downloading');
    setProgress('');
    setError('');
    const unsubscribe = window.liteTavern?.onUpdateProgress?.(({ received, total }) => {
      if (mounted.current) setProgress(percent(received, total));
    });
    try {
      const result = await window.liteTavern!.downloadUpdate();
      if (!result.ok) throw new Error(result.error ?? '下载失败');
      if (!mounted.current) return;
      setPhase('installing');
      const installed = await window.liteTavern!.installUpdate();
      if (!mounted.current) return;
      if (!installed.ok) throw new Error(installed.error ?? '安装失败');
      if (installed.restarted) {
        setPhase('restarting');
        return;
      }
      // No launcher to replace (the app was started from the unpacked folder).
      setPhase('done');
      setProgress(installed.path ? `安装包已保存到 ${installed.path}` : '');
    } catch (cause) {
      if (!mounted.current) return;
      setPhase('ready');
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      unsubscribe?.();
    }
  };

  const downloadAndroid = async () => {
    if (!asset) return;
    setPhase('downloading');
    setProgress('');
    setError('');
    try {
      // Android only installs APKs after the user allowed it for this app.
      const allowed = await ensureAndroidInstallAllowed();
      if (!allowed) {
        setPhase('ready');
        setError('请在系统设置里允许「轻语酒馆」安装未知应用，然后回来再点一次。');
        return;
      }
      const path = await downloadAndroidUpdate(asset, (received, total) => {
        if (mounted.current) setProgress(percent(received, total));
      });
      if (!mounted.current) return;
      setPhase('installing');
      await installAndroidUpdate(path);
      if (mounted.current) setPhase('done');
    } catch (cause) {
      if (!mounted.current) return;
      setPhase('ready');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const download = desktop ? downloadDesktop : downloadAndroid;
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const available = check?.status === 'available';
  const upToDate = check?.status === 'up-to-date';

  return (
    <section className="settings-section">
      <div className="section-title">
        <IconRefresh width={16} height={16} /> 关于与更新
      </div>
      <div className="update-row">
        <div className="update-version">
          <span>当前版本</span>
          <strong>v{current}</strong>
        </div>
        <div className="update-actions">
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => void runCheck()}
            disabled={busy}
          >
            {phase === 'checking' ? '检查中…' : '检查更新'}
          </button>
          <a
            className="btn btn-small btn-ghost"
            href={releasePageUrl()}
            target="_blank"
            rel="noreferrer"
          >
            发布页
          </a>
        </div>
      </div>

      {available && (
        <div className="update-card">
          <div className="update-card-head">
            <strong>发现新版本 v{check?.latest}</strong>
            <span className="settings-hint">
              {check?.publishedAt ? new Date(check.publishedAt).toLocaleDateString() : ''}
              {asset ? ` · ${formatDownloadSize(asset.size)}` : ''}
            </span>
          </div>
          {check?.notes && <pre className="update-notes">{check.notes}</pre>}
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void download()}
            disabled={busy || (phase !== 'ready' && phase !== 'idle' && phase !== 'done')}
          >
            <IconDownload width={15} height={15} /> {desktop ? '下载并安装' : '下载并安装 APK'}
          </button>
          {!asset && (
            <p className="settings-hint">这个版本还没有为当前平台提供安装包，请到发布页下载。</p>
          )}
        </div>
      )}

      {upToDate && <p className="settings-hint">已经是最新版本。</p>}

      {STATUS_LABEL[phase] && (
        <p className="update-progress-line">
          {STATUS_LABEL[phase]}
          {phase === 'downloading' && progress ? ` ${progress}` : ''}
        </p>
      )}
      {phase === 'done' && progress && <p className="settings-hint">{progress}</p>}
      {error && <p className="test-result bad">{error}</p>}

      <p className="settings-hint">
        更新从 GitHub Releases 获取，并校验 SHA-256；下载、替换与安装都在本机完成，
        不会把角色卡、对话或 API Key 发送出去。{desktop ? ' 更新会替换启动器并自动重启。' : ''}
      </p>
    </section>
  );
}
