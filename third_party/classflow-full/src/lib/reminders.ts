import type { Period, Session } from "../types";
import { timeToMinutes } from "./date";

export interface ReminderSettings {
  enabled: boolean;
  /** Minutes before the first period starts. */
  leadMinutes: number;
  todaySummary: boolean;
  todaySummaryTime: string;
  tomorrowSummary: boolean;
  tomorrowSummaryTime: string;
  /** Exam reminders at 7 days / 1 day / 2 hours before the start. */
  examReminders: boolean;
}

/** Keyed by reminder id, value is the ISO time it was sent. */
export type SentLog = Record<string, string>;

export interface PlannedReminder {
  key: string;
  title: string;
  body: string;
}

export const LEAD_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;
const SUMMARY_GRACE_MINUTES = 180;
const SENT_LOG_MAX = 300;
const SENT_LOG_DAYS = 7;
const REMINDERS_KEY = "kexu:reminders:v1";
const SENT_KEY = "kexu:reminders:sent:v1";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  leadMinutes: 15,
  todaySummary: true,
  todaySummaryTime: "07:20",
  tomorrowSummary: true,
  tomorrowSummaryTime: "21:30",
  examReminders: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timeText(value: unknown, fallback: string): string {
  return typeof value === "string" && TIME_RE.test(value) ? value : fallback;
}

export function normalizeReminderSettings(raw: unknown): ReminderSettings {
  const object = isRecord(raw) ? raw : {};
  const lead = Number(object.leadMinutes);
  return {
    enabled: object.enabled === true,
    leadMinutes: LEAD_OPTIONS.includes(lead as (typeof LEAD_OPTIONS)[number])
      ? lead
      : DEFAULT_REMINDER_SETTINGS.leadMinutes,
    todaySummary: object.todaySummary === undefined ? true : object.todaySummary === true,
    todaySummaryTime: timeText(object.todaySummaryTime, DEFAULT_REMINDER_SETTINGS.todaySummaryTime),
    tomorrowSummary: object.tomorrowSummary === undefined ? true : object.tomorrowSummary === true,
    tomorrowSummaryTime: timeText(
      object.tomorrowSummaryTime,
      DEFAULT_REMINDER_SETTINGS.tomorrowSummaryTime,
    ),
    examReminders: object.examReminders === undefined ? true : object.examReminders === true,
  };
}

export function loadReminderSettings(): ReminderSettings {
  if (typeof localStorage === "undefined") return DEFAULT_REMINDER_SETTINGS;
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    return normalizeReminderSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function saveReminderSettings(settings: ReminderSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(REMINDERS_KEY, JSON.stringify(settings));
  } catch {
    // Reminder settings are non-critical.
  }
}

export function normalizeSentLog(raw: unknown): SentLog {
  const object = isRecord(raw) ? raw : {};
  const log: SentLog = {};
  for (const [key, value] of Object.entries(object)) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) continue;
    log[key.slice(0, 200)] = value;
  }
  return log;
}

export function loadSentLog(): SentLog {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SENT_KEY);
    return normalizeSentLog(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

export function saveSentLog(log: SentLog): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(log));
  } catch {
    // The sent log is only used to avoid duplicate notifications.
  }
}

export function pruneSentLog(log: SentLog, now: Date): SentLog {
  const cutoff = now.getTime() - SENT_LOG_DAYS * 86_400_000;
  const entries = Object.entries(log)
    .filter(([, value]) => Date.parse(value) >= cutoff)
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
    .slice(0, SENT_LOG_MAX);
  return Object.fromEntries(entries);
}

function dateTimeOn(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function withinSummaryWindow(now: Date, time: string): boolean {
  const elapsed = minutesOfDay(now) - timeToMinutes(time);
  return elapsed >= 0 && elapsed <= SUMMARY_GRACE_MINUTES;
}

function summaryBody(sessions: Session[], periods: Period[], emptyText: string): string {
  if (sessions.length === 0) return emptyText;
  return sessions
    .map((session) => {
      const start = periods[session.start - 1]?.start ?? "";
      const end = periods[session.end - 1]?.end ?? "";
      const time = start && end ? `${start}–${end}` : "";
      const place = session.course.location ? ` · ${session.course.location}` : "";
      return `${time} ${session.course.name}${place}`.trim();
    })
    .join("\n");
}

function sessionLabel(session: Session): string {
  return session.start === session.end
    ? `第 ${session.start} 节`
    : `第 ${session.start}–${session.end} 节`;
}

export interface ReminderPlanInput {
  now: Date;
  timetableId: string;
  todayKey: string;
  tomorrowKey: string;
  settings: ReminderSettings;
  todaySessions: Session[];
  todayPeriods: Period[];
  tomorrowSessions: Session[];
  tomorrowPeriods: Period[];
  sent: SentLog;
}

/**
 * Returns every notification that should fire right now. The caller marks them
 * as sent, so a stale sent log only needs to be pruned, never replayed.
 */
export function planReminders(input: ReminderPlanInput): PlannedReminder[] {
  const { now, settings, sent } = input;
  if (!settings.enabled) return [];
  const planned: PlannedReminder[] = [];

  for (const session of input.todaySessions) {
    const startPeriod = input.todayPeriods[session.start - 1];
    if (!startPeriod) continue;
    const start = dateTimeOn(now, startPeriod.start);
    const remindAt = new Date(start.getTime() - settings.leadMinutes * 60_000);
    if (now < remindAt || now >= start) continue;
    const key = `class:${input.timetableId}:${input.todayKey}:${session.course.id}:${session.slot.id}`;
    if (sent[key]) continue;
    const minutes = Math.max(1, Math.round((start.getTime() - now.getTime()) / 60_000));
    const place = session.course.location ? ` · ${session.course.location}` : "";
    planned.push({
      key,
      title: `即将上课 · ${session.course.name}`,
      body: `${minutes} 分钟后开始，${sessionLabel(session)}${place}。`,
    });
  }

  const todayKey = `summary:today:${input.todayKey}`;
  if (settings.todaySummary && withinSummaryWindow(now, settings.todaySummaryTime) && !sent[todayKey]) {
    planned.push({
      key: todayKey,
      title: `今日课程 · ${input.todaySessions.length} 节`,
      body: summaryBody(input.todaySessions, input.todayPeriods, "今天没有排课，稍微喘口气。"),
    });
  }

  const tomorrowKey = `summary:tomorrow:${input.tomorrowKey}`;
  if (
    settings.tomorrowSummary &&
    withinSummaryWindow(now, settings.tomorrowSummaryTime) &&
    !sent[tomorrowKey]
  ) {
    planned.push({
      key: tomorrowKey,
      title: `明日课程 · ${input.tomorrowSessions.length} 节`,
      body: summaryBody(input.tomorrowSessions, input.tomorrowPeriods, "明天没有排课。"),
    });
  }

  return planned;
}

export function describeSentKey(key: string): string {
  const parts = key.split(":");
  if (parts[0] === "class") return `课前提醒 · ${parts[2] ?? ""}`;
  if (parts[0] === "summary" && parts[1] === "today") return `今日摘要 · ${parts[2] ?? ""}`;
  if (parts[0] === "summary" && parts[1] === "tomorrow") return `明日课表 · ${parts[2] ?? ""}`;
  if (parts[0] === "exam") {
    const node = parts[3] === "7d" ? "考前一周" : parts[3] === "1d" ? "考前一天" : "考前两小时";
    return `${node}提醒 · ${parts[2] ?? ""}`;
  }
  return key;
}