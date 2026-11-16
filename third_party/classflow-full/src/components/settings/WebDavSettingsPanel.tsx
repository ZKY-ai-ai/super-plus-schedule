import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  Download,
  Eye,
  EyeOff,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import type { ImportResult, ScheduleData } from "../../types";
import {
  cleanupOldBackups,
  downloadBackup,
  listRemoteBackups,
  loadWebDavConfig,
  normalizeRemoteDir,
  normalizeWebDavConfig,
  normalizeWebDavUrl,
  parseBackupDate,
  saveWebDavConfig,
  startWebDavAutoBackup,
  testWebDavConnection,
  uploadScheduleBackup,
  webDavErrorMessage,
  WebDavError,
  WEBDAV_CREDENTIAL_NOTICE,
  type RemoteBackup,
  type WebDavConfig,
} from "../../lib/webdav";
import "../../styles/webdav.css";

export interface WebDavSettingsPanelProps {
  data: ScheduleData;
  /** Apply a backup only after the owner has validated and saved it. */
  onRestore: (data: ScheduleData) => ImportResult | void | Promise<ImportResult | void>;
  /** Optional toast bridge, e.g. App's notify(). */
  onNotify?: (message: string) => void;
  /**
   * "panel" runs the timer only while this settings pane is mounted.
   * "external" relies on an app-level startWebDavAutoBackup() call instead.
   */
  autoBackupDriver?: "panel" | "external";
}

type Action = "save" | "test" | "backup" | "list" | "restore" | "cleanup";

interface Notice {
  tone: "success" | "error" | "info";
  message: string;
}

interface LastBackup {
  name: string;
}

const INTERVAL_OPTIONS = [15, 30, 60, 120, 240];
const RETAIN_OPTIONS = [5, 10, 20, 30, 50];

function Spinner() {
  return <LoaderCircle size={15} className="webdav-spin" aria-hidden="true" />;
}

function formatSize(size: number | null): string {
  if (size === null) return "大小未知";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function backupTimeLabel(backup: RemoteBackup): string {
  const created = backup.created ?? parseBackupDate(backup.name);
  const modified = backup.lastModified ? new Date(backup.lastModified) : null;
  const date = created ?? (modified && !Number.isNaN(modified.getTime()) ? modified : null);
  if (!date) return backup.lastModified ?? "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WebDavSettingsPanel({
  data,
  onRestore,
  onNotify,
  autoBackupDriver = "panel",
}: WebDavSettingsPanelProps) {
  const [config, setConfig] = useState<WebDavConfig>(() => loadWebDavConfig());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [backups, setBackups] = useState<RemoteBackup[]>([]);
  const [restoringName, setRestoringName] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<LastBackup | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const dataRef = useRef(data);
  const configRef = useRef(config);
  const notifyRef = useRef(onNotify);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    notifyRef.current = onNotify;
  }, [onNotify]);

  useEffect(() => {
    if (autoBackupDriver === "external" || !config.autoBackup) return;
    const stop = startWebDavAutoBackup({
      getConfig: () => configRef.current,
      getData: () => dataRef.current,
      onBackup: (result) => {
        setLastBackup({ name: result.name });
        setNotice({
          tone: "success",
          message: `定时备份完成：${result.name}（${formatSize(result.bytes)}）。`,
        });
        notifyRef.current?.(`WebDAV 自动备份完成：${result.name}`);
      },
      onError: (error) => {
        setNotice({
          tone: "error",
          message: `定时备份失败：${webDavErrorMessage(error)}`,
        });
      },
    });
    return stop;
  }, [autoBackupDriver, config.autoBackup]);

  const patchConfig = (patch: Partial<WebDavConfig>) => {
    setConfig((previous) => {
      const next = { ...previous, ...patch };
      configRef.current = next;
      return next;
    });
  };

  const storeConfig = (next: WebDavConfig): boolean => {
    if (!saveWebDavConfig(next)) {
      setNotice({
        tone: "error",
        message: "配置保存失败：本机存储不可用或空间不足。",
      });
      return false;
    }
    setConfig(next);
    configRef.current = next;
    return true;
  };

  const persistConfig = (patch: Partial<WebDavConfig> = {}): WebDavConfig => {
    const merged = { ...configRef.current, ...patch };
    const next = normalizeWebDavConfig({
      ...merged,
      url: normalizeWebDavUrl(merged.url),
      remoteDir: normalizeRemoteDir(merged.remoteDir),
    });
    if (!saveWebDavConfig(next)) {
      throw new WebDavError("config", "配置保存失败：本机存储不可用或空间不足。");
    }
    setConfig(next);
    configRef.current = next;
    return next;
  };

  const handleSave = () => {
    setBusy("save");
    try {
      const next = persistConfig();
      setNotice({
        tone: "success",
        message: `配置已保存到本机；远程目录：${next.remoteDir || "WebDAV 根目录"}。`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: webDavErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    setNotice({ tone: "info", message: "正在连接 WebDAV 并检查认证…" });
    try {
      const next = persistConfig();
      await testWebDavConnection(next);
      setNotice({
        tone: "success",
        message: "连接成功，认证有效。可以立即备份，或点「刷新远程备份」查看历史备份。",
      });
    } catch (error) {
      setNotice({ tone: "error", message: webDavErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleBackup = async () => {
    setBusy("backup");
    setNotice({ tone: "info", message: "正在创建远程目录并上传备份…" });
    try {
      const next = persistConfig();
      const result = await uploadScheduleBackup(next, dataRef.current);
      const created = new Date();
      setLastBackup({ name: result.name });
      setBackups((previous) =>
        [
          {
            href: result.url,
            name: result.name,
            isCollection: false,
            size: result.bytes,
            lastModified: created.toISOString(),
            created,
          },
          ...previous.filter((item) => item.name !== result.name),
        ].sort((left, right) => right.name.localeCompare(left.name)),
      );
      setNotice({
        tone: "success",
        message: `已上传 ${result.name}（${formatSize(result.bytes)}）到「${next.remoteDir || "WebDAV 根目录"}」。`,
      });
      notifyRef.current?.(`已备份到 WebDAV：${result.name}`);
    } catch (error) {
      setNotice({ tone: "error", message: `备份失败：${webDavErrorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleRefresh = async () => {
    setBusy("list");
    setNotice({ tone: "info", message: "正在读取远程备份目录…" });
    try {
      const next = persistConfig();
      const list = await listRemoteBackups(next);
      setBackups(list);
      setNotice({
        tone: list.length > 0 ? "success" : "info",
        message:
          list.length > 0
            ? `找到 ${list.length} 份远程备份，按时间从新到旧排列。`
            : "远程目录里还没有备份。先点「立即备份」上传一份。",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: `读取远程备份失败：${webDavErrorMessage(error)}`,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (backup: RemoteBackup) => {
    const confirmed = window.confirm(
      `用「${backup.name}」替换当前全部课表？\n\n恢复前建议先导出一份本机备份。`,
    );
    if (!confirmed) {
      setNotice({ tone: "info", message: "已取消恢复，当前课表没有改变。" });
      return;
    }
    setBusy("restore");
    setRestoringName(backup.name);
    setNotice({ tone: "info", message: `正在下载并校验「${backup.name}」…` });
    try {
      const next = persistConfig();
      const restored = await downloadBackup(next, backup.name);
      const result = await onRestore(restored);
      if (result && !result.ok) {
        setNotice({ tone: "error", message: result.message });
        return;
      }
      const message =
        result && result.ok ? result.message : `已从「${backup.name}」恢复课表。`;
      setNotice({ tone: "success", message });
      notifyRef.current?.(message);
    } catch (error) {
      setNotice({
        tone: "error",
        message: `恢复失败：${webDavErrorMessage(error)}`,
      });
    } finally {
      setBusy(null);
      setRestoringName(null);
    }
  };

  const handleCleanup = async () => {
    const keep = configRef.current.retainCount;
    const confirmed = window.confirm(
      `只保留最近 ${keep} 份远程备份，其余会被永久删除。\n\n继续清理旧备份？`,
    );
    if (!confirmed) {
      setNotice({ tone: "info", message: "已取消清理，远程备份没有改变。" });
      return;
    }
    setBusy("cleanup");
    setNotice({ tone: "info", message: "正在清理旧备份…" });
    try {
      const next = persistConfig();
      const result = await cleanupOldBackups(next, keep);
      setBackups((previous) =>
        previous.filter((item) => !result.deleted.includes(item.name)),
      );
      setNotice({
        tone: "success",
        message:
          result.deleted.length > 0
            ? `已删除 ${result.deleted.length} 份旧备份，保留最近 ${result.kept} 份。`
            : `没有需要清理的旧备份，现有 ${result.kept} 份。`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: `清理失败：${webDavErrorMessage(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const handleAutoToggle = (enabled: boolean) => {
    try {
      if (enabled && !configRef.current.url.trim()) {
        throw new WebDavError("config", "请先填写并保存 WebDAV 地址，再开启定时备份。");
      }
      const next = persistConfig({ autoBackup: enabled });
      setNotice({
        tone: "info",
        message: enabled
          ? `已开启定时备份：应用打开期间每 ${next.autoBackupMinutes} 分钟一次。`
          : "已关闭定时备份。",
      });
    } catch (error) {
      patchConfig({ autoBackup: false });
      setNotice({ tone: "error", message: webDavErrorMessage(error) });
    }
  };

  const handleIntervalChange = (minutes: number) => {
    const next = normalizeWebDavConfig({ ...configRef.current, autoBackupMinutes: minutes });
    if (storeConfig(next)) {
      setNotice({
        tone: "info",
        message: `定时备份间隔已设为 ${next.autoBackupMinutes} 分钟。`,
      });
    }
  };

  const handleRetainChange = (count: number) => {
    const next = normalizeWebDavConfig({ ...configRef.current, retainCount: count });
    storeConfig(next);
  };

  const disabled = busy !== null;

  return (
    <section className="settings-pane webdav-pane" aria-busy={disabled}>
      <div className="settings-pane-head">
        <p className="eyebrow">WEBDAV BACKUP</p>
        <h3>WebDAV 自动备份</h3>
        <p>
          把课表备份到自己的网盘，例如 Nextcloud、坚果云、群晖。备份由这台设备直接上传，
          不经过课序的中转服务器。
        </p>
      </div>

      <p className="webdav-security">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>{WEBDAV_CREDENTIAL_NOTICE}</span>
      </p>

      {notice ? (
        <p className={`inline-notice inline-notice--${notice.tone}`} role="status">
          {notice.message}
        </p>
      ) : null}

      <form
        className="webdav-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        <div className="webdav-field webdav-field--wide">
          <label htmlFor="webdav-url">WebDAV 地址</label>
          <input
            id="webdav-url"
            value={config.url}
            placeholder="https://dav.example.com/remote.php/dav/files/用户名/"
            autoComplete="url"
            inputMode="url"
            spellCheck={false}
            onChange={(event) => patchConfig({ url: event.target.value })}
          />
          <small>填写 WebDAV 根地址，例如坚果云的 WebDAV 入口，而不是网盘网页首页。</small>
        </div>

        <div className="webdav-field">
          <label htmlFor="webdav-username">用户名</label>
          <input
            id="webdav-username"
            value={config.username}
            autoComplete="username"
            spellCheck={false}
            onChange={(event) => patchConfig({ username: event.target.value })}
          />
        </div>

        <div className="webdav-field">
          <label htmlFor="webdav-password">密码 / 应用密码</label>
          <div className="webdav-password-row">
            <input
              id="webdav-password"
              type={showPassword ? "text" : "password"}
              value={config.password}
              autoComplete="current-password"
              onChange={(event) => patchConfig({ password: event.target.value })}
            />
            <button
              className="webdav-eye"
              type="button"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <small>部分网盘需要单独生成应用密码，请勿填写登录网页用的验证码。</small>
        </div>

        <div className="webdav-field">
          <label htmlFor="webdav-dir">远程目录</label>
          <input
            id="webdav-dir"
            value={config.remoteDir}
            placeholder="课序备份"
            spellCheck={false}
            onChange={(event) => patchConfig({ remoteDir: event.target.value })}
          />
          <small>留空则使用根目录；不存在的子目录会在备份时自动创建。</small>
        </div>

        <div className="webdav-field">
          <label htmlFor="webdav-retain">保留备份份数</label>
          <select
            id="webdav-retain"
            value={String(config.retainCount)}
            onChange={(event) => handleRetainChange(Number(event.target.value))}
          >
            {RETAIN_OPTIONS.map((count) => (
              <option key={count} value={count}>
                最近 {count} 份
              </option>
            ))}
          </select>
          <small>清理旧备份时使用，最新的备份不会被删除。</small>
        </div>

        <div className="webdav-form-actions">
          <button className="secondary-button" type="submit" disabled={disabled}>
            {busy === "save" ? <Spinner /> : null}
            保存配置
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={disabled}
            onClick={() => {
              void handleTest();
            }}
          >
            {busy === "test" ? <Spinner /> : <Cloud size={15} />}
            {busy === "test" ? "正在连接…" : "测试连接"}
          </button>
        </div>
      </form>

      <div className="webdav-auto">
        <label className="webdav-switch">
          <input
            type="checkbox"
            checked={config.autoBackup}
            disabled={disabled}
            onChange={(event) => handleAutoToggle(event.target.checked)}
          />
          <span>应用打开期间定时备份</span>
        </label>
        <label className="webdav-interval">
          每
          <select
            value={String(config.autoBackupMinutes)}
            disabled={!config.autoBackup || disabled}
            aria-label="定时备份间隔"
            onChange={(event) => handleIntervalChange(Number(event.target.value))}
          >
            {INTERVAL_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} 分钟
              </option>
            ))}
          </select>
          一次
        </label>
        <small className="webdav-auto-hint">
          {lastBackup
            ? `上次备份：${lastBackup.name}`
            : "开启后会保存配置；间隔到期后才会上传，不会立刻联网。"}
        </small>
      </div>

      <div className="webdav-toolbar">
        <button
          className="primary-button"
          type="button"
          disabled={disabled || !config.url.trim()}
          onClick={() => {
            void handleBackup();
          }}
        >
          {busy === "backup" ? <Spinner /> : <Upload size={15} />}
          {busy === "backup" ? "正在备份…" : "立即备份"}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={disabled || !config.url.trim()}
          onClick={() => {
            void handleRefresh();
          }}
        >
          {busy === "list" ? <Spinner /> : <RefreshCw size={15} />}
          {busy === "list" ? "正在读取…" : "刷新远程备份"}
        </button>
        <button
          className="danger-ghost-button"
          type="button"
          disabled={disabled || !config.url.trim()}
          onClick={() => {
            void handleCleanup();
          }}
        >
          {busy === "cleanup" ? <Spinner /> : <Trash2 size={15} />}
          {busy === "cleanup" ? "正在清理…" : "清理旧备份"}
        </button>
      </div>

      <div className="webdav-backups">
        <div className="webdav-backups-head">
          <span className="webdav-backups-title">
            <Cloud size={16} aria-hidden="true" />
            <strong>远程备份</strong>
          </span>
          <span className="storage-pill">{backups.length} 份</span>
        </div>

        {busy === "list" ? (
          <p className="webdav-empty">
            <LoaderCircle size={14} className="webdav-spin" aria-hidden="true" />
            正在读取远程目录…
          </p>
        ) : backups.length === 0 ? (
          <p className="webdav-empty">
            还没有读取到远程备份。保存配置后点「刷新远程备份」即可查看。
          </p>
        ) : (
          <ul className="webdav-list">
            {backups.map((backup) => {
              const restoring = busy === "restore" && restoringName === backup.name;
              return (
                <li className="webdav-item" key={backup.name}>
                  <div className="webdav-item-main">
                    <strong title={backup.name}>{backup.name}</strong>
                    <small>
                      {backupTimeLabel(backup)} · {formatSize(backup.size)}
                    </small>
                  </div>
                  <button
                    className="secondary-button webdav-restore"
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      void handleRestore(backup);
                    }}
                  >
                    {restoring ? <Spinner /> : <Download size={15} />}
                    {restoring ? "恢复中…" : "恢复"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="webdav-hint">
        <strong>网页版提示：</strong>
        浏览器直连 WebDAV 需要网盘允许跨域（CORS），并放行 PROPFIND / MKCOL / PUT / GET / DELETE
        与 Authorization 请求头。若「测试连接」提示跨域失败，可改用 Android App（系统网络请求不受
        CORS 限制），或在网盘 / 反向代理中放行上述方法与请求头。远程地址建议使用 HTTPS。
      </p>
    </section>
  );
}
