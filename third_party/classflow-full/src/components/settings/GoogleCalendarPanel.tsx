import { useState } from "react";
import { CalendarDays, Link2, Loader2, X } from "lucide-react";
import type { PeriodProfile, Timetable } from "../../types";
import {
  DEFAULT_TIME_ZONE,
  GOOGLE_CALENDAR_NAME,
  GoogleCalendarError,
  connectGoogleCalendar,
  defaultRedirectUri,
  loadGoogleAuth,
  loadGoogleClientId,
  normalizeClientId,
  revokeGoogleAccess,
  saveGoogleClientId,
  syncTimetableToGoogle,
  type GoogleCalendarAuth,
  type SyncResult,
} from "../../lib/googleCalendar";
import "../../styles/google-calendar.css";

export interface GoogleCalendarPanelProps {
  timetable: Timetable;
  periodProfiles?: PeriodProfile[];
}

interface PanelNotice {
  tone: "success" | "error" | "info";
  message: string;
}

type BusyState = "idle" | "connecting" | "syncing" | "disconnecting";

function errorMessage(error: unknown): string {
  if (error instanceof GoogleCalendarError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "操作失败，请稍后重试。";
}

function formatConnectedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventTimeLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  return `${Number(match[2])}月${Number(match[3])}日 ${match[4]}:${match[5]}`;
}

export function GoogleCalendarPanel({ timetable, periodProfiles }: GoogleCalendarPanelProps) {
  const [auth, setAuth] = useState<GoogleCalendarAuth | null>(() => loadGoogleAuth());
  const [clientId, setClientId] = useState(() => {
    const stored = loadGoogleClientId();
    return stored || loadGoogleAuth()?.clientId || "";
  });
  const [redirectUri] = useState(() => {
    try {
      return defaultRedirectUri();
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState<BusyState>("idle");
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const handleConnect = async () => {
    if (busy !== "idle") return;
    setBusy("connecting");
    setSyncResult(null);
    setProgress(null);
    setNotice({ tone: "info", message: "正在打开 Google 授权窗口…" });
    try {
      const id = normalizeClientId(clientId);
      saveGoogleClientId(id);
      const connection = await connectGoogleCalendar(id, { timeZone: DEFAULT_TIME_ZONE });
      setAuth(connection.auth);
      setNotice({
        tone: "success",
        message: connection.createdCalendar
          ? `已创建专用日历「${GOOGLE_CALENDAR_NAME}」并完成授权。`
          : `已连接专用日历「${GOOGLE_CALENDAR_NAME}」。`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusy("idle");
    }
  };

  const handleSync = async () => {
    if (!auth || busy !== "idle") return;
    setBusy("syncing");
    setSyncResult(null);
    setProgress({ done: 0, total: 0 });
    setNotice({
      tone: "info",
      message: `正在按周展开课表并写入「${GOOGLE_CALENDAR_NAME}」…`,
    });
    try {
      const result = await syncTimetableToGoogle(timetable, {
        timeZone: DEFAULT_TIME_ZONE,
        periodProfiles,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setSyncResult(result);
      setAuth(loadGoogleAuth() ?? auth);
      if (result.total === 0) {
        setNotice({
          tone: "info",
          message: "当前课表没有可同步的课程。请先添加课程，或检查学期与作息时间。",
        });
      } else if (result.failed > 0) {
        setNotice({
          tone: "error",
          message: `同步结束：成功 ${result.succeeded} 节，跳过重复 ${result.skipped} 节，失败 ${result.failed} 节。`,
        });
      } else if (result.succeeded === 0) {
        setNotice({
          tone: "info",
          message: `没有新增事件：${result.skipped} 节已在 Google 日历中。`,
        });
      } else {
        setNotice({
          tone: "success",
          message: `同步完成：成功 ${result.succeeded} 节${
            result.skipped > 0 ? `，跳过重复 ${result.skipped} 节` : ""
          }。`,
        });
      }
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusy("idle");
    }
  };

  const handleDisconnect = async () => {
    if (!auth || busy !== "idle") return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            "断开连接后，本机保存的 Google 令牌会被清除，已同步到日历的事件不会删除。确定继续吗？",
          );
    if (!confirmed) return;
    setBusy("disconnecting");
    setNotice({ tone: "info", message: "正在撤销 Google 授权…" });
    try {
      await revokeGoogleAccess(auth);
      setNotice({ tone: "success", message: "已断开 Google 日历，本机令牌已清除。" });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setAuth(null);
      setProgress(null);
      setSyncResult(null);
      setBusy("idle");
    }
  };

  const busyLabel =
    busy === "connecting"
      ? "正在连接…"
      : busy === "syncing"
        ? "正在同步…"
        : busy === "disconnecting"
          ? "正在断开…"
          : "";

  return (
    <section className="settings-pane google-calendar-pane">
      <div className="settings-pane-head">
        <p className="eyebrow">GOOGLE CALENDAR</p>
        <h3>Google 日历同步</h3>
        <p>
          使用你自己的 Google OAuth Client ID 授权，课序PLUS只把当前课表写入专用日历「
          {GOOGLE_CALENDAR_NAME}」。令牌与日历 ID 只保存在本机。
        </p>
      </div>

      {notice ? (
        <p className={`inline-notice inline-notice--${notice.tone}`} role="status">
          {notice.message}
        </p>
      ) : null}

      <label className="field">
        <span className="field-label">Google OAuth Client ID</span>
        <input
          className="field-input"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          placeholder="1234567890-abc.apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
          disabled={busy !== "idle" || auth !== null}
        />
        <small className="field-hint">
          在 Google Cloud Console → API 和服务 → 凭据 → OAuth 2.0 客户端 ID（Web
          应用）中创建，并启用 Google Calendar API。
        </small>
      </label>

      <div className="google-calendar-redirect">
        <span className="field-label">已获授权的重定向 URI</span>
        <code>{redirectUri || "无法从当前页面地址生成"}</code>
        <small className="field-hint">
          必须把这一整串地址原样加入 OAuth 客户端的「已获授权的重定向 URI」。
        </small>
      </div>

      <div className="google-calendar-status">
        <div className="google-calendar-status-head">
          <span className={`google-calendar-dot ${auth ? "is-on" : ""}`} aria-hidden="true" />
          <strong>
            {auth
              ? `已连接「${auth.calendarSummary ?? GOOGLE_CALENDAR_NAME}」`
              : "未连接 Google 日历"}
          </strong>
          {busy !== "idle" ? (
            <span className="google-calendar-busy">
              <Loader2 size={14} className="google-calendar-spin" aria-hidden="true" />
              {busyLabel}
            </span>
          ) : null}
        </div>

        {auth ? (
          <dl className="google-calendar-meta">
            <div>
              <dt>专用日历</dt>
              <dd>{auth.calendarSummary ?? GOOGLE_CALENDAR_NAME}</dd>
            </div>
            <div>
              <dt>日历 ID</dt>
              <dd>
                <code>{auth.calendarId ?? "尚未创建"}</code>
              </dd>
            </div>
            <div>
              <dt>授权时间</dt>
              <dd>{formatConnectedAt(auth.connectedAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="google-calendar-status-note">
            授权只申请 Google 日历读写权限。没有 Client ID、授权被拒绝或网络不可用时，这里会明确报错，不会伪造同步结果。
          </p>
        )}
      </div>

      <div className="google-calendar-actions">
        {auth ? (
          <>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                void handleSync();
              }}
              disabled={busy !== "idle"}
            >
              {busy === "syncing" ? (
                <Loader2 size={15} className="google-calendar-spin" aria-hidden="true" />
              ) : (
                <CalendarDays size={15} aria-hidden="true" />
              )}
              同步当前课表
            </button>
            <button
              className="danger-ghost-button"
              type="button"
              onClick={() => {
                void handleDisconnect();
              }}
              disabled={busy !== "idle"}
            >
              <X size={15} aria-hidden="true" />
              断开连接
            </button>
          </>
        ) : (
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              void handleConnect();
            }}
            disabled={busy !== "idle"}
          >
            {busy === "connecting" ? (
              <Loader2 size={15} className="google-calendar-spin" aria-hidden="true" />
            ) : (
              <Link2 size={15} aria-hidden="true" />
            )}
            连接 Google 日历
          </button>
        )}
      </div>

      {progress ? (
        <div className="google-calendar-progress" role="status">
          <div className="google-calendar-progress-head">
            <span>同步进度</span>
            <span>
              {progress.done} / {progress.total}
            </span>
          </div>
          <progress value={progress.done} max={Math.max(progress.total, 1)} />
        </div>
      ) : null}

      {syncResult && syncResult.total > 0 ? (
        <div className="google-calendar-result">
          <div className="google-calendar-stats">
            <span className="google-calendar-stat is-ok">
              <strong>{syncResult.succeeded}</strong>
              成功
            </span>
            <span className="google-calendar-stat">
              <strong>{syncResult.skipped}</strong>
              跳过重复
            </span>
            <span className={`google-calendar-stat ${syncResult.failed > 0 ? "is-bad" : ""}`}>
              <strong>{syncResult.failed}</strong>
              失败
            </span>
          </div>
          {syncResult.failures.length > 0 ? (
            <ul className="google-calendar-failures">
              {syncResult.failures.slice(0, 5).map((failure, index) => (
                <li key={`${index}-${failure.start}-${failure.summary}`}>
                  <span>
                    {failure.summary} · {eventTimeLabel(failure.start)}
                  </span>
                  <small>{failure.reason}</small>
                </li>
              ))}
              {syncResult.failures.length > 5 ? (
                <li className="google-calendar-more">
                  另有 {syncResult.failures.length - 5} 条失败记录未显示。
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="settings-note">
        同步只新增事件，不会删除 Google 日历里已有的内容；重复同步时，同一节课会以 409
        跳过，不会产生重复事件。已取消、调课或隐藏的课次按课表当前设置写入。
      </p>
    </section>
  );
}