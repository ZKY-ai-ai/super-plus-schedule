import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PeriodProfile, ScheduleEvent, Session, Timetable } from "../types";
import {
  dateKey,
  getDateForSlot,
  getTermPosition,
  getWeekNumber,
  parseDateKey,
  weekdayLabel,
} from "./date";
import { buildSessions, formatPeriodLabel } from "./schedule";
import { isHolidayDate } from "./holidays";
import { periodsForDate } from "./periods";

const PLUGIN_NAME = "SystemCalendar";
const KEY_MARKER = /\[KEXU:([^\]]+)\]/;

export type SystemCalendarPlatform = "android" | "ios" | "web";

export type CalendarPermission =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale"
  | "unsupported"
  | "error";

export interface SystemCalendarCapability {
  platform: SystemCalendarPlatform;
  supported: boolean;
  reason: string;
  fallback: "ics" | null;
}

export interface SystemCalendarInfo {
  id: string;
  name: string;
  account: string;
  color: string;
  isPrimary: boolean;
  access: number;
}

export interface CalendarEventDraft {
  /** Stable dedupe key: timetable + course/event + date + periods. */
  key: string;
  title: string;
  description: string;
  location: string;
  date: string;
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  week: number | null;
  courseId: string;
  source: "course" | "event";
}

export interface ExpandCalendarOptions {
  timetable: Timetable;
  periodProfiles?: PeriodProfile[];
  /** Skip official holidays and add borrowed make-up workday classes. Default true. */
  autoHolidays?: boolean;
  /** Include standalone schedule events. Default true. */
  includeEvents?: boolean;
}

export interface ExpandCalendarResult {
  events: CalendarEventDraft[];
  duplicates: number;
  skippedHolidays: number;
}

export type SystemCalendarListResult =
  | { ok: true; calendars: SystemCalendarInfo[] }
  | { ok: false; message: string };

export interface SystemCalendarSyncInput {
  timetable: Timetable;
  periodProfiles?: PeriodProfile[];
  calendarId: string;
  autoHolidays?: boolean;
  includeEvents?: boolean;
}

export type SystemCalendarSyncResult =
  | {
      status: "synced";
      inserted: number;
      skipped: number;
      failed: number;
      total: number;
      message: string;
    }
  | { status: "unsupported" | "denied" | "empty" | "error"; message: string };

interface RawCalendar {
  id?: string | number;
  name?: string;
  account?: string;
  color?: string;
  isPrimary?: boolean;
  access?: number;
}

interface RawSyncResult {
  inserted?: number;
  skipped?: number;
  failed?: number;
  total?: number;
}

interface SystemCalendarNativePlugin {
  checkPermissions(): Promise<{ calendar?: string }>;
  requestPermissions(): Promise<{ calendar?: string }>;
  listCalendars(): Promise<{ calendars?: RawCalendar[] }>;
  sync(options: {
    calendarId: string;
    events: string;
  }): Promise<RawSyncResult>;
}

const SystemCalendar = registerPlugin<SystemCalendarNativePlugin>(PLUGIN_NAME);

function normalizePlatform(value: string): SystemCalendarPlatform {
  return value === "android" || value === "ios" ? value : "web";
}

/**
 * Web never claims to write the system calendar; it points at the .ics path.
 * Android reports unsupported when the build does not include the native plugin.
 */
export function detectSystemCalendarCapability(overrides?: {
  platform?: string;
  pluginAvailable?: boolean;
}): SystemCalendarCapability {
  const platform = normalizePlatform(overrides?.platform ?? Capacitor.getPlatform());
  if (platform === "android") {
    const available =
      overrides?.pluginAvailable ??
      Capacitor.isPluginAvailable(PLUGIN_NAME);
    return available
      ? {
          platform,
          supported: true,
          reason: "已连接 Android 系统日历，可以把当前课表写入手机日历。",
          fallback: null,
        }
      : {
          platform,
          supported: false,
          reason: "当前安装包未包含系统日历插件，请更新或重新构建 App，也可以改用 .ics 文件导入。",
          fallback: "ics",
        };
  }
  if (platform === "ios") {
    return {
      platform,
      supported: false,
      reason: "iOS 版暂未提供系统日历写入，请下载 .ics 文件后用系统日历打开导入。",
      fallback: "ics",
    };
  }
  return {
    platform: "web",
    supported: false,
    reason: "网页版无法直接写入手机系统日历，请下载 .ics 文件，再用手机日历打开导入。",
    fallback: "ics",
  };
}

function normalizePermission(value: string | undefined): CalendarPermission {
  if (
    value === "granted" ||
    value === "denied" ||
    value === "prompt" ||
    value === "prompt-with-rationale"
  ) {
    return value;
  }
  return "prompt";
}

export async function checkSystemCalendarPermission(
  capability: SystemCalendarCapability = detectSystemCalendarCapability(),
): Promise<CalendarPermission> {
  if (!capability.supported) return "unsupported";
  try {
    const result = await SystemCalendar.checkPermissions();
    return normalizePermission(result?.calendar);
  } catch {
    return "error";
  }
}

export async function requestSystemCalendarPermission(
  capability: SystemCalendarCapability = detectSystemCalendarCapability(),
): Promise<CalendarPermission> {
  if (!capability.supported) return "unsupported";
  try {
    const result = await SystemCalendar.requestPermissions();
    return normalizePermission(result?.calendar);
  } catch {
    return "error";
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function keyPart(value: string): string {
  return value.replace(/[|\]]/g, "_");
}

/** Stable across rebuilds, so repeated syncs can skip events already written. */
export function buildCalendarEventKey(input: {
  timetableId: string;
  source: "course" | "event";
  id: string;
  date: string;
  start?: string;
  end?: string;
}): string {
  const periods = input.start ? `${input.start}-${input.end ?? input.start}` : "allday";
  return ["kexu", input.timetableId, input.source, input.id, input.date, periods]
    .map(keyPart)
    .join("|");
}

export function calendarKeyMarker(key: string): string {
  return `[KEXU:${key}]`;
}

export function extractCalendarKey(description: string): string | null {
  return KEY_MARKER.exec(description)?.[1] ?? null;
}

function localMoment(date: Date, time: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

function courseDescription(
  session: Session,
  week: number,
  extraNote: string,
): string {
  const { course } = session;
  return [
    `课程：${course.name}`,
    course.teacher ? `教师：${course.teacher}` : "",
    course.location ? `地点：${course.location}` : "",
    `第 ${week} 周 · ${weekdayLabel(session.day)} · ${formatPeriodLabel(session.start, session.end)}`,
    extraNote,
    course.note,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCourseEvent(
  timetable: Timetable,
  session: Session,
  week: number,
  date: Date,
  periodProfiles: PeriodProfile[],
  extraNote: string,
): CalendarEventDraft | null {
  const periods = periodsForDate(timetable, periodProfiles, date);
  const startPeriod = periods[session.start - 1];
  const endPeriod = periods[session.end - 1];
  if (!startPeriod || !endPeriod) return null;
  const start = localMoment(date, startPeriod.start);
  const end = localMoment(date, endPeriod.end);
  if (!start || !end || end.getTime() <= start.getTime()) return null;

  const day = dateKey(date);
  const key = buildCalendarEventKey({
    timetableId: timetable.id,
    source: "course",
    id: session.course.id,
    date: day,
    start: String(session.start),
    end: String(session.end),
  });

  return {
    key,
    title: session.course.name,
    description: `${courseDescription(session, week, extraNote)}\n${calendarKeyMarker(key)}`,
    location: session.course.location,
    date: day,
    start: startPeriod.start,
    end: endPeriod.end,
    startMs: start.getTime(),
    endMs: end.getTime(),
    allDay: false,
    week,
    courseId: session.course.id,
    source: "course",
  };
}

function buildScheduleEvent(
  timetable: Timetable,
  event: ScheduleEvent,
): CalendarEventDraft | null {
  const date = parseDateKey(event.date);
  const day = dateKey(date);
  const start = event.allDay
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
    : localMoment(date, event.start);
  const end = event.allDay
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    : localMoment(date, event.end);
  if (!start || !end || end.getTime() <= start.getTime()) return null;

  const startText = event.allDay ? "00:00" : event.start;
  const endText = event.allDay ? "24:00" : event.end;
  const key = buildCalendarEventKey({
    timetableId: timetable.id,
    source: "event",
    id: event.id,
    date: day,
    start: startText,
    end: endText,
  });

  return {
    key,
    title: event.title,
    description: [event.allDay ? "全天日程" : "日程", event.note, calendarKeyMarker(key)]
      .filter(Boolean)
      .join("\n"),
    location: "",
    date: day,
    start: startText,
    end: endText,
    startMs: start.getTime(),
    endMs: end.getTime(),
    allDay: event.allDay,
    week: null,
    courseId: "",
    source: "event",
  };
}

/**
 * Expands the timetable week by week using the same rules as the grid:
 * session overrides (cancel/move/hide), odd/even or explicit weeks, holiday
 * filtering and borrowed make-up workday classes.
 */
export function expandTimetableToCalendarEvents(
  options: ExpandCalendarOptions,
): ExpandCalendarResult {
  const {
    timetable,
    periodProfiles = [],
    autoHolidays = true,
    includeEvents = true,
  } = options;
  const { semester } = timetable;
  const weekStartsOn = semester.weekStartsOn ?? 1;
  const totalWeeks = Math.max(1, semester.totalWeeks);
  const calendarOverrides = timetable.calendarOverrides ?? [];
  const events: CalendarEventDraft[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let skippedHolidays = 0;

  const push = (draft: CalendarEventDraft) => {
    if (seen.has(draft.key)) {
      duplicates += 1;
      return;
    }
    seen.add(draft.key);
    events.push(draft);
  };

  const addCourseSession = (
    session: Session,
    week: number,
    date: Date,
    extraNote = "",
  ) => {
    if (autoHolidays && isHolidayDate(date, calendarOverrides)) {
      skippedHolidays += 1;
      return;
    }
    const draft = buildCourseEvent(
      timetable,
      session,
      week,
      date,
      periodProfiles,
      extraNote,
    );
    if (draft) push(draft);
  };

  for (let week = 1; week <= totalWeeks; week += 1) {
    const sessions = buildSessions(timetable.courses, week, timetable.overrides);
    for (const session of sessions) {
      const date = getDateForSlot(semester.startDate, week, session.day, weekStartsOn);
      addCourseSession(session, week, date);
    }
  }

  if (autoHolidays) {
    const handled = new Set<string>();
    for (const override of calendarOverrides) {
      if (override.kind !== "workday" || !override.borrowFrom) continue;
      if (handled.has(override.date)) continue;
      handled.add(override.date);
      const date = parseDateKey(override.date);
      if (
        getTermPosition(semester.startDate, totalWeeks, date, weekStartsOn).state !== "during"
      ) {
        continue;
      }
      const week = getWeekNumber(semester.startDate, date, totalWeeks, weekStartsOn);
      const borrowed = buildSessions(timetable.courses, week, timetable.overrides).filter(
        (session) => session.day === override.borrowFrom,
      );
      const note = `补课（按${weekdayLabel(override.borrowFrom)}课表）`;
      for (const session of borrowed) {
        addCourseSession(session, week, date, note);
      }
    }
  }

  if (includeEvents) {
    for (const event of timetable.events) {
      if (
        autoHolidays &&
        isHolidayDate(parseDateKey(event.date), calendarOverrides)
      ) {
        skippedHolidays += 1;
        continue;
      }
      const draft = buildScheduleEvent(timetable, event);
      if (draft) push(draft);
    }
  }

  events.sort(
    (a, b) => a.startMs - b.startMs || a.title.localeCompare(b.title, "zh-CN"),
  );

  return { events, duplicates, skippedHolidays };
}

export function buildCalendarEvents(
  timetable: Timetable,
  periodProfiles: PeriodProfile[] = [],
  autoHolidays = true,
): CalendarEventDraft[] {
  return expandTimetableToCalendarEvents({ timetable, periodProfiles, autoHolidays }).events;
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

export async function loadWritableCalendars(): Promise<SystemCalendarListResult> {
  const capability = detectSystemCalendarCapability();
  if (!capability.supported) {
    return { ok: false, message: capability.reason };
  }
  try {
    const result = await SystemCalendar.listCalendars();
    const calendars = (result?.calendars ?? [])
      .map((item) => ({
        id: String(item.id ?? ""),
        name: item.name?.trim() || "未命名日历",
        account: item.account ?? "",
        color: item.color ?? "",
        isPrimary: item.isPrimary === true,
        access: toCount(item.access),
      }))
      .filter((item) => item.id !== "");
    return { ok: true, calendars };
  } catch (error) {
    return { ok: false, message: `读取系统日历失败：${errorText(error)}` };
  }
}

export async function syncTimetableToSystemCalendar(
  input: SystemCalendarSyncInput,
): Promise<SystemCalendarSyncResult> {
  const capability = detectSystemCalendarCapability();
  if (!capability.supported) {
    return { status: "unsupported", message: capability.reason };
  }
  if (!input.calendarId) {
    return { status: "error", message: "请先选择一个可写入的系统日历。" };
  }

  const permission = await checkSystemCalendarPermission(capability);
  if (permission === "denied") {
    return {
      status: "denied",
      message: "日历权限被拒绝，请在系统设置 → 应用 → 课序 → 权限中允许日历读写。",
    };
  }
  if (permission === "error" || permission === "unsupported") {
    return {
      status: "error",
      message: "无法读取日历权限状态，请重新打开 App 后再试。",
    };
  }
  if (permission !== "granted") {
    return { status: "denied", message: "还没有授权日历权限，请先点击「授权日历」。" };
  }

  const { events } = expandTimetableToCalendarEvents({
    timetable: input.timetable,
    periodProfiles: input.periodProfiles,
    autoHolidays: input.autoHolidays,
    includeEvents: input.includeEvents,
  });
  if (events.length === 0) {
    return { status: "empty", message: "当前课表没有可写入的课程或日程。" };
  }

  try {
    const result = await SystemCalendar.sync({
      calendarId: input.calendarId,
      events: JSON.stringify(
        events.map((event) => ({
          key: event.key,
          title: event.title,
          description: event.description,
          location: event.location,
          startMs: event.startMs,
          endMs: event.endMs,
          allDay: event.allDay,
        })),
      ),
    });
    const inserted = toCount(result?.inserted);
    const skipped = toCount(result?.skipped);
    const failed = toCount(result?.failed);
    const total = toCount(result?.total) || events.length;
    const parts = [`已写入 ${inserted} 个日程`];
    if (skipped > 0) parts.push(`跳过 ${skipped} 个已同步的`);
    if (failed > 0) parts.push(`${failed} 个写入失败`);
    return {
      status: "synced",
      inserted,
      skipped,
      failed,
      total,
      message: `${parts.join("，")}。`,
    };
  } catch (error) {
    return { status: "error", message: `写入系统日历失败：${errorText(error)}` };
  }
}
