import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Download,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { PeriodProfile, ScheduleData, Timetable } from "../../types";
import { downloadScheduleIcs } from "../../lib/transfer";
import {
  checkSystemCalendarPermission,
  detectSystemCalendarCapability,
  expandTimetableToCalendarEvents,
  loadWritableCalendars,
  requestSystemCalendarPermission,
  syncTimetableToSystemCalendar,
  type CalendarPermission,
  type SystemCalendarCapability,
  type SystemCalendarInfo,
} from "../../lib/systemCalendar";
import "../../styles/system-calendar.css";

interface SystemCalendarPanelProps {
  timetable: Timetable;
  periodProfiles: PeriodProfile[];
  autoHolidays?: boolean;
}

interface Notice {
  tone: "success" | "error" | "info";
  message: string;
}

interface SyncStats {
  inserted: number;
  skipped: number;
  failed: number;
}

const PLATFORM_LABELS: Record<SystemCalendarCapability["platform"], string> = {
  android: "Android 系统日历",
  ios: "iOS 系统日历",
  web: "网页版",
};

function permissionLabel(permission: CalendarPermission | "checking"): string {
  switch (permission) {
    case "checking":
      return "正在检查权限…";
    case "granted":
      return "已授权日历读写";
    case "prompt":
      return "尚未授权日历权限";
    case "prompt-with-rationale":
      return "需要再次确认日历权限";
    case "denied":
      return "日历权限被拒绝";
    case "unsupported":
      return "当前平台不支持写入系统日历";
    default:
      return "无法读取日历权限状态";
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SystemCalendarPanel({
  timetable,
  periodProfiles,
  autoHolidays = true,
}: SystemCalendarPanelProps) {
  const [capability] = useState<SystemCalendarCapability>(() =>
    detectSystemCalendarCapability(),
  );
  const [permission, setPermission] = useState<CalendarPermission | "checking">(
    "checking",
  );
  const [calendars, setCalendars] = useState<SystemCalendarInfo[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [icsBusy, setIcsBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastSync, setLastSync] = useState<SyncStats | null>(null);

  const preview = useMemo(
    () =>
      expandTimetableToCalendarEvents({
        timetable,
        periodProfiles,
        autoHolidays,
      }),
    [timetable, periodProfiles, autoHolidays],
  );

  useEffect(() => {
    if (!capability.supported) {
      setPermission("unsupported");
      return;
    }
    let cancelled = false;
    void checkSystemCalendarPermission(capability).then((state) => {
      if (!cancelled) setPermission(state);
    });
    return () => {
      cancelled = true;
    };
  }, [capability]);

  useEffect(() => {
    if (permission !== "granted") return;
    let cancelled = false;
    setLoadingCalendars(true);
    void loadWritableCalendars().then((result) => {
      if (cancelled) return;
      setLoadingCalendars(false);
      if (!result.ok) {
        setNotice({ tone: "error", message: result.message });
        return;
      }
      setCalendars(result.calendars);
      setCalendarId((current) => {
        if (current && result.calendars.some((item) => item.id === current)) {
          return current;
        }
        return (
          result.calendars.find((item) => item.isPrimary)?.id ??
          result.calendars[0]?.id ??
          ""
        );
      });
      if (result.calendars.length === 0) {
        setNotice({
          tone: "error",
          message: "手机上没有找到可写入的日历，请先在系统日历中添加本地日历或登录账号。",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [permission]);

  const authorize = async () => {
    setAuthorizing(true);
    setNotice(null);
    const state = await requestSystemCalendarPermission(capability);
    setAuthorizing(false);
    setPermission(state);
    if (state === "granted") {
      setNotice({ tone: "success", message: "日历权限已授权，可以开始同步课表。" });
    } else if (state === "denied") {
      setNotice({
        tone: "error",
        message: "日历权限被拒绝，请到系统设置 → 应用 → 课序 → 权限中手动允许日历读写。",
      });
    } else if (state === "error") {
      setNotice({ tone: "error", message: "无法请求日历权限，请重新打开 App 后再试。" });
    }
  };

  const refreshCalendars = async () => {
    setLoadingCalendars(true);
    setNotice(null);
    const result = await loadWritableCalendars();
    setLoadingCalendars(false);
    if (!result.ok) {
      setNotice({ tone: "error", message: result.message });
      return;
    }
    setCalendars(result.calendars);
    setCalendarId((current) =>
      result.calendars.some((item) => item.id === current)
        ? current
        : result.calendars[0]?.id ?? "",
    );
  };

  const sync = async () => {
    if (!calendarId) {
      setNotice({ tone: "error", message: "请先选择一个可写入的系统日历。" });
      return;
    }
    setSyncing(true);
    setLastSync(null);
    setNotice(null);
    const result = await syncTimetableToSystemCalendar({
      timetable,
      periodProfiles,
      calendarId,
      autoHolidays,
    });
    setSyncing(false);
    if (result.status === "synced") {
      setLastSync({
        inserted: result.inserted,
        skipped: result.skipped,
        failed: result.failed,
      });
      setNotice({
        tone: result.failed > 0 ? "error" : "success",
        message: result.message,
      });
    } else {
      setNotice({ tone: "error", message: result.message });
    }
  };

  const exportIcs = async () => {
    setIcsBusy(true);
    setNotice(null);
    try {
      const data: ScheduleData = {
        version: 2,
        activeTimetableId: timetable.id,
        timetables: [timetable],
        periodProfiles,
        updatedAt: timetable.updatedAt,
      };
      const result = await downloadScheduleIcs(data, autoHolidays);
      const delivery =
        result.delivery === "shared"
          ? "已打开系统分享面板"
          : result.delivery === "saved"
            ? "已保存到文件"
            : "已开始下载";
      setNotice({
        tone: "success",
        message: `已生成 ${result.count} 条日程的 .ics 文件，${delivery}。用手机日历打开即可导入。`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: `导出 .ics 失败：${errorText(error)}`,
      });
    } finally {
      setIcsBusy(false);
    }
  };

  const calendarLabel = (calendar: SystemCalendarInfo): string =>
    calendar.account
      ? `${calendar.name} · ${calendar.account}`
      : calendar.name;

  return (
    <section className="settings-pane system-calendar-pane">
      <div className="settings-pane-head">
        <p className="eyebrow">SYSTEM CALENDAR</p>
        <h3>写入设备系统日历</h3>
        <p>
          把当前课表按周展开成一条条日程，写入手机自带的日历。重复同步会自动跳过已写入的课程。
        </p>
      </div>

      <div className="system-calendar-status">
        <span
          className={`system-calendar-status-icon ${capability.supported ? "is-ok" : "is-off"}`}
        >
          {capability.supported ? <CalendarDays size={18} /> : <AlertTriangle size={18} />}
        </span>
        <div className="system-calendar-status-copy">
          <strong>{PLATFORM_LABELS[capability.platform]}</strong>
          <small>{capability.reason}</small>
        </div>
        <span
          className={`system-calendar-badge ${capability.supported ? "is-ok" : "is-off"}`}
        >
          {capability.supported ? "可用" : "不可用"}
        </span>
      </div>

      {capability.supported ? (
        <>
          <div className="system-calendar-permission">
            <div>
              <strong>{permissionLabel(permission)}</strong>
              <small>写入日程需要读取与写入日历的权限，只用于本机日历。</small>
            </div>
            {permission === "granted" ? (
              <span className="system-calendar-badge is-ok">
                <ShieldCheck size={13} />
                已授权
              </span>
            ) : (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  void authorize();
                }}
                disabled={authorizing || permission === "checking"}
              >
                {authorizing ? <Loader2 className="is-spinning" size={14} /> : <ShieldCheck size={14} />}
                {permission === "denied" ? "重新授权" : "授权日历"}
              </button>
            )}
          </div>

          {permission === "granted" ? (
            <div className="system-calendar-form">
              <label className="field system-calendar-field">
                <span className="field-label">写入到哪个日历</span>
                <select
                  className="field-input"
                  value={calendarId}
                  onChange={(event) => setCalendarId(event.target.value)}
                  disabled={loadingCalendars || calendars.length === 0}
                >
                  {calendars.length === 0 ? (
                    <option value="">没有可写入的日历</option>
                  ) : (
                    calendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendarLabel(calendar)}
                      </option>
                    ))
                  )}
                </select>
                <small className="field-hint">
                  只列出有写入权限的日历；同步只新增事件，不会删除你已有的日程。
                </small>
              </label>

              <div className="system-calendar-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    void sync();
                  }}
                  disabled={syncing || !calendarId}
                >
                  {syncing ? <Loader2 className="is-spinning" size={15} /> : <CalendarPlus size={15} />}
                  同步当前课表（{preview.events.length} 条）
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    void refreshCalendars();
                  }}
                  disabled={loadingCalendars || syncing}
                >
                  {loadingCalendars ? <Loader2 className="is-spinning" size={14} /> : <CalendarDays size={14} />}
                  刷新日历列表
                </button>
              </div>

              {lastSync ? (
                <div className="system-calendar-summary">
                  <span>
                    <strong>{lastSync.inserted}</strong>
                    新写入
                  </span>
                  <span>
                    <strong>{lastSync.skipped}</strong>
                    已存在跳过
                  </span>
                  <span>
                    <strong>{lastSync.failed}</strong>
                    失败
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="settings-note">
              授权后可以列出手机上的日历，并把当前课表写进去。已拒绝时请到系统设置里手动开启。
            </p>
          )}
        </>
      ) : (
        <div className="system-calendar-fallback">
          <p>
            这里不会假装已经写入系统日历。可以导出 .ics 文件，用手机日历打开导入；在
            App 内会直接打开系统分享面板。
          </p>
        </div>
      )}

      <div className="system-calendar-ics">
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            void exportIcs();
          }}
          disabled={icsBusy}
        >
          {icsBusy ? <Loader2 className="is-spinning" size={14} /> : <Download size={14} />}
          导出 .ics（{preview.events.length} 条）
        </button>
        <small>网页版与暂不支持的平台都可以使用这条降级路径。</small>
      </div>

      {notice ? (
        <p className={`inline-notice inline-notice--${notice.tone}`} role="status">
          {notice.message}
        </p>
      ) : null}

      <p className="settings-note">
        去重依据是「课表 + 课程 + 日期 + 节次」，同一门课的不同周或调课会分别写入。
      </p>
    </section>
  );
}
