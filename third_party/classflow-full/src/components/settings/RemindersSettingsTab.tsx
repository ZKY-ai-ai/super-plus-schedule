import { useState } from "react";
import { BellRing, Clock3 } from "lucide-react";
import {
  LEAD_OPTIONS,
  describeSentKey,
  loadReminderSettings,
  loadSentLog,
  saveReminderSettings,
  saveSentLog,
  type ReminderSettings,
} from "../../lib/reminders";

type PermissionState = NotificationPermission | "unsupported";

function readPermission(): PermissionState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function formatSentTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RemindersSettingsTab() {
  const [settings, setSettings] = useState<ReminderSettings>(() => loadReminderSettings());
  const [sent, setSent] = useState(() => loadSentLog());
  const [permission, setPermission] = useState<PermissionState>(() => readPermission());

  const update = (patch: Partial<ReminderSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveReminderSettings(next);
  };

  const requestPermission = async () => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const clearSent = () => {
    saveSentLog({});
    setSent({});
  };

  const sentEntries = Object.entries(sent)
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .slice(0, 5);

  const permissionLabel =
    permission === "unsupported"
      ? "当前浏览器不支持系统通知"
      : permission === "granted"
        ? "已允许系统通知"
        : permission === "denied"
          ? "通知已被浏览器阻止"
          : "尚未授权系统通知";

  return (
    <section className="settings-pane reminders-pane">
      <div className="settings-pane-head">
        <p className="eyebrow">REMINDERS</p>
        <h3>上课提醒与每日摘要</h3>
        <p>上课前按设定提前量提醒；今日与明日摘要可以分别设置发送时间。</p>
      </div>

      <div className="reminder-permission">
        <div>
          <strong>{permissionLabel}</strong>
          <small>提醒通过系统通知发出，同一节课不会重复推送。</small>
        </div>
        {permission === "granted" ? (
          <span className="reminder-pill reminder-pill--ok">已开启</span>
        ) : permission === "unsupported" || permission === "denied" ? (
          <span className="reminder-pill reminder-pill--off">不可用</span>
        ) : (
          <button className="secondary-button" type="button" onClick={() => { void requestPermission(); }}>
            <BellRing size={14} />
            开启通知
          </button>
        )}
      </div>

      <label className="toggle-row">
        <span>
          <strong>启用提醒</strong>
          <small>关闭后不再发送任何课前提醒与摘要。</small>
        </span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        <span className="switch" aria-hidden="true" />
      </label>

      <label className="field reminder-lead">
        <span className="field-label">课前提前量</span>
        <select
          className="field-input"
          value={settings.leadMinutes}
          onChange={(event) => update({ leadMinutes: Number(event.target.value) })}
          disabled={!settings.enabled}
        >
          {LEAD_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} 分钟
            </option>
          ))}
        </select>
        <small className="field-hint">到点前只会在课程开始前提醒一次。</small>
      </label>

      <div className="reminder-time-grid">
        <div className="reminder-time-card">
          <label>
            <Clock3 size={13} />
            <input
              type="checkbox"
              checked={settings.todaySummary}
              onChange={(event) => update({ todaySummary: event.target.checked })}
              disabled={!settings.enabled}
            />
            今日课程摘要
          </label>
          <input
            className="field-input"
            type="time"
            value={settings.todaySummaryTime}
            onChange={(event) => update({ todaySummaryTime: event.target.value })}
            disabled={!settings.enabled || !settings.todaySummary}
            aria-label="今日摘要发送时间"
          />
          <small className="field-hint">当天过了这个时间再打开 App 会补发一次。</small>
        </div>
        <div className="reminder-time-card">
          <label>
            <Clock3 size={13} />
            <input
              type="checkbox"
              checked={settings.tomorrowSummary}
              onChange={(event) => update({ tomorrowSummary: event.target.checked })}
              disabled={!settings.enabled}
            />
            明日课表提醒
          </label>
          <input
            className="field-input"
            type="time"
            value={settings.tomorrowSummaryTime}
            onChange={(event) => update({ tomorrowSummaryTime: event.target.value })}
            disabled={!settings.enabled || !settings.tomorrowSummary}
            aria-label="明日课表发送时间"
          />
          <small className="field-hint">提前一晚看看明天的课与教室。</small>
        </div>
      </div>

      <p className="settings-note">
        网页版需要保持标签页在运行才能弹出通知；安装为 PWA 后由系统接管通知。
      </p>

      <div className="sent-log">
        <div className="sent-log-head">
          <strong>发送记录 · {Object.keys(sent).length} 条</strong>
          <button
            className="secondary-button"
            type="button"
            onClick={clearSent}
            disabled={Object.keys(sent).length === 0}
          >
            清空记录
          </button>
        </div>
        {sentEntries.length === 0 ? (
          <p className="settings-note">还没有发送过提醒。记录用来防止同一提醒重复推送。</p>
        ) : (
          <ul>
            {sentEntries.map(([key, value]) => (
              <li key={key}>
                <span>{describeSentKey(key)}</span>
                <span>{formatSentTime(value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}