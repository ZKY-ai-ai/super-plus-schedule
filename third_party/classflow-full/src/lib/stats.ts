import type { Period, ScheduleEvent, Session } from "../types";
import { dateKey, minutesToTime, timeToMinutes, WEEKDAYS } from "./date";
import { buildDayTimeline, sessionEndMinutes, sessionStartMinutes, type GapPreferences, DEFAULT_GAP_PREFERENCES } from "./gaps";
import { sessionMinutes } from "./schedule";

export const TASKS_KEY = "kexu:planner:tasks:v1";
export const STUDY_LOGS_KEY = "kexu:planner:study:v1";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "不急",
  normal: "普通",
  high: "重要",
  urgent: "紧迫",
};

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

/**
 * 丙的轻量待办。等乙的 Task 模型落地后，这里作为适配层保留：
 * 字段与 Task 的 id/title/courseId/due/priority/done 对齐。
 */
export interface PlannerTask {
  id: string;
  title: string;
  courseId?: string;
  /** ISO 时间或 YYYY-MM-DD；为空表示没有截止时间。 */
  due?: string;
  priority: TaskPriority;
  done: boolean;
  completedAt?: string;
  createdAt: string;
  note?: string;
  /** 预计需要的分钟数，用于复习与今日汇总。 */
  minutes?: number;
}

export interface StudyLog {
  id: string;
  courseId?: string;
  taskId?: string;
  subject: string;
  /** 开始时间，ISO 字符串。 */
  start: string;
  minutes: number;
  kind: "pomodoro" | "manual" | "review";
  note?: string;
  /** 计划中的复习时段，不计入已学习分钟。 */
  planned?: boolean;
  createdAt: string;
}

function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizePriority(value: unknown): TaskPriority {
  return value === "low" || value === "normal" || value === "high" || value === "urgent"
    ? value
    : "normal";
}

export function normalizePlannerTask(raw: unknown): PlannerTask | null {
  if (!isRecord(raw)) return null;
  const title = text(raw.title, 120);
  if (!title) return null;
  const now = new Date().toISOString();
  return {
    id: text(raw.id, 80) || uid("task"),
    title,
    courseId: text(raw.courseId, 80) || undefined,
    due: text(raw.due, 40) || undefined,
    priority: normalizePriority(raw.priority),
    done: raw.done === true,
    completedAt: text(raw.completedAt, 40) || undefined,
    createdAt: text(raw.createdAt, 40) || now,
    note: text(raw.note, 500) || undefined,
    minutes: raw.minutes === undefined ? undefined : clampNumber(raw.minutes, 5, 600, 30),
  };
}

export function loadPlannerTasks(): PlannerTask[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizePlannerTask(item))
      .filter((item): item is PlannerTask => item !== null)
      .slice(0, 500);
  } catch {
    return [];
  }
}

export function savePlannerTasks(tasks: PlannerTask[]): void {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.slice(0, 500)));
  } catch {
    // 本地存储不可用时保持内存数据。
  }
}

export function normalizeStudyLog(raw: unknown): StudyLog | null {
  if (!isRecord(raw)) return null;
  const subject = text(raw.subject, 80);
  if (!subject) return null;
  const start = text(raw.start, 40);
  if (!start) return null;
  const now = new Date().toISOString();
  const kind =
    raw.kind === "pomodoro" || raw.kind === "manual" || raw.kind === "review"
      ? raw.kind
      : "manual";
  return {
    id: text(raw.id, 80) || uid("study"),
    courseId: text(raw.courseId, 80) || undefined,
    taskId: text(raw.taskId, 80) || undefined,
    subject,
    start,
    minutes: clampNumber(raw.minutes, 1, 24 * 60, 25),
    kind,
    note: text(raw.note, 500) || undefined,
    planned: raw.planned === true,
    createdAt: text(raw.createdAt, 40) || now,
  };
}

export function loadStudyLogs(): StudyLog[] {
  try {
    const raw = localStorage.getItem(STUDY_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeStudyLog(item))
      .filter((item): item is StudyLog => item !== null)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 5_000);
  } catch {
    return [];
  }
}

export function saveStudyLogs(logs: StudyLog[]): void {
  try {
    localStorage.setItem(STUDY_LOGS_KEY, JSON.stringify(logs.slice(-5_000)));
  } catch {
    // 本地存储不可用时保持内存数据。
  }
}

/* -------------------------------------------------------------------------- */
/* 阶段 1 · F095 任务紧迫性排序                                                */
/* -------------------------------------------------------------------------- */

export type UrgencyTier = "overdue" | "today" | "tomorrow" | "soon" | "later" | "none" | "done";

export interface TaskUrgency {
  tier: UrgencyTier;
  /** 距离截止的分钟数；没有截止时间为 null。 */
  minutesLeft: number | null;
  score: number;
}

function parseDue(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T23:59:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function taskUrgency(task: PlannerTask, now = new Date()): TaskUrgency {
  if (task.done) return { tier: "done", minutesLeft: null, score: -1000 };
  const due = parseDue(task.due);
  if (!due) return { tier: "none", minutesLeft: null, score: PRIORITY_WEIGHT[task.priority] * 10 };
  const minutesLeft = Math.round((due.getTime() - now.getTime()) / 60_000);
  if (minutesLeft < 0) {
    return { tier: "overdue", minutesLeft, score: 10_000 + Math.min(5_000, -minutesLeft) + PRIORITY_WEIGHT[task.priority] };
  }
  const days = minutesLeft / (24 * 60);
  const tier: UrgencyTier =
    days <= 1 ? "today" : days <= 2 ? "tomorrow" : days <= 7 ? "soon" : "later";
  const proximity = Math.max(0, 7_000 - minutesLeft / 10);
  return {
    tier,
    minutesLeft,
    score: proximity + PRIORITY_WEIGHT[task.priority] * 10,
  };
}

export type TaskSortMode = "urgency" | "importance" | "due";

/** 未完成在前；再按紧迫性/重要性/截止时间排序。 */
export function sortTasksByUrgency(
  tasks: PlannerTask[],
  now = new Date(),
  mode: TaskSortMode = "urgency",
): PlannerTask[] {
  const copy = [...tasks];
  copy.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (mode === "importance") {
      const weight = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (weight !== 0) return weight;
    }
    const urgencyA = taskUrgency(a, now);
    const urgencyB = taskUrgency(b, now);
    if (mode === "due") {
      if (urgencyA.minutesLeft === null && urgencyB.minutesLeft !== null) return 1;
      if (urgencyA.minutesLeft !== null && urgencyB.minutesLeft === null) return -1;
      if (urgencyA.minutesLeft !== null && urgencyB.minutesLeft !== null) {
        return urgencyA.minutesLeft - urgencyB.minutesLeft;
      }
      return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    }
    if (urgencyB.score !== urgencyA.score) return urgencyB.score - urgencyA.score;
    if (urgencyA.minutesLeft === null && urgencyB.minutesLeft !== null) return 1;
    if (urgencyA.minutesLeft !== null && urgencyB.minutesLeft === null) return -1;
    return (urgencyA.minutesLeft ?? 0) - (urgencyB.minutesLeft ?? 0);
  });
  return copy;
}

export function taskDueLabel(task: PlannerTask, now = new Date()): string {
  const urgency = taskUrgency(task, now);
  if (task.done) return "已完成";
  if (urgency.tier === "none") return "没有截止时间";
  if (urgency.minutesLeft === null) return "";
  if (urgency.minutesLeft < 0) return `已逾期 ${Math.abs(urgency.minutesLeft) >= 1440 ? `${Math.floor(Math.abs(urgency.minutesLeft) / 1440)} 天` : `${Math.abs(urgency.minutesLeft)} 分钟`}`;
  if (urgency.minutesLeft < 60) return `${urgency.minutesLeft} 分钟后`;
  if (urgency.minutesLeft < 1440) return `${Math.floor(urgency.minutesLeft / 60)} 小时后`;
  return `${Math.floor(urgency.minutesLeft / 1440)} 天后`;
}

export function tasksDueOn(tasks: PlannerTask[], date: Date): PlannerTask[] {
  const key = dateKey(date);
  return tasks.filter((task) => {
    if (task.done || !task.due) return false;
    return task.due.slice(0, 10) === key;
  });
}

/* -------------------------------------------------------------------------- */
/* 阶段 2 · F092 学习时段与 F091 番茄钟                                         */
/* -------------------------------------------------------------------------- */

export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  rounds: number;
}

export const DEFAULT_POMODORO: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  rounds: 4,
};

export type PomodoroPhase = "focus" | "short" | "long";

export interface PomodoroStep {
  phase: PomodoroPhase;
  minutes: number;
  round: number;
  label: string;
}

/** 完成一个阶段后推进到下一个阶段。 */
export function nextPomodoroStep(
  phase: PomodoroPhase,
  round: number,
  settings: PomodoroSettings = DEFAULT_POMODORO,
): PomodoroStep {
  if (phase === "focus") {
    const nextRound = round + 1;
    if (nextRound >= settings.rounds) {
      return { phase: "long", minutes: settings.longBreakMinutes, round: nextRound, label: "长休息" };
    }
    return { phase: "short", minutes: settings.shortBreakMinutes, round: nextRound, label: "短休息" };
  }
  if (phase === "long") {
    return { phase: "focus", minutes: settings.focusMinutes, round: 0, label: "专注" };
  }
  return { phase: "focus", minutes: settings.focusMinutes, round, label: "专注" };
}

export function addStudyLog(logs: StudyLog[], entry: Omit<StudyLog, "id" | "createdAt">): StudyLog[] {
  const log: StudyLog = {
    ...entry,
    id: uid("study"),
    createdAt: new Date().toISOString(),
  };
  return [...logs, log].sort((a, b) => a.start.localeCompare(b.start));
}

export function studyMinutes(logs: StudyLog[], from?: Date, to?: Date): number {
  return logs
    .filter((log) => !log.planned)
    .filter((log) => {
      const time = new Date(log.start).getTime();
      if (Number.isNaN(time)) return false;
      if (from && time < from.getTime()) return false;
      if (to && time > to.getTime()) return false;
      return true;
    })
    .reduce((total, log) => total + log.minutes, 0);
}

export interface CourseStudyTotal {
  key: string;
  minutes: number;
  sessions: number;
}

export function studyMinutesBySubject(logs: StudyLog[], from?: Date, to?: Date): CourseStudyTotal[] {
  const map = new Map<string, CourseStudyTotal>();
  for (const log of logs) {
    if (log.planned) continue;
    const time = new Date(log.start).getTime();
    if (Number.isNaN(time)) continue;
    if (from && time < from.getTime()) continue;
    if (to && time > to.getTime()) continue;
    const key = log.courseId || log.subject;
    const current = map.get(key) ?? { key, minutes: 0, sessions: 0 };
    map.set(key, { key, minutes: current.minutes + log.minutes, sessions: current.sessions + 1 });
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

export interface HeatmapCell {
  date: string;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** F097：最近 N 天的学习热力图（按自然日聚合）。 */
export function studyHeatmap(logs: StudyLog[], days = 90, end = new Date()): HeatmapCell[] {
  const buckets = new Map<string, number>();
  for (const log of logs) {
    if (log.planned) continue;
    const date = new Date(log.start);
    if (Number.isNaN(date.getTime())) continue;
    const key = dateKey(date);
    buckets.set(key, (buckets.get(key) ?? 0) + log.minutes);
  }
  const cells: HeatmapCell[] = [];
  const cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let index = 0; index < days; index += 1) {
    const key = dateKey(cursor);
    const minutes = buckets.get(key) ?? 0;
    const level: HeatmapCell["level"] =
      minutes >= 180 ? 4 : minutes >= 120 ? 3 : minutes >= 60 ? 2 : minutes > 0 ? 1 : 0;
    cells.push({ date: key, minutes, level });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

export interface CompletionStats {
  total: number;
  done: number;
  overdue: number;
  rate: number;
  onTime: number;
  onTimeRate: number;
}

/** F096：任务完成率与按时率。 */
export function completionStats(tasks: PlannerTask[], now = new Date()): CompletionStats {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  const overdue = tasks.filter((task) => !task.done && taskUrgency(task, now).tier === "overdue").length;
  const completed = tasks.filter((task) => task.done);
  const onTime = completed.filter((task) => {
    if (!task.due || !task.completedAt) return true;
    const due = parseDue(task.due);
    const completedAt = new Date(task.completedAt);
    if (!due || Number.isNaN(completedAt.getTime())) return true;
    return completedAt.getTime() <= due.getTime();
  }).length;
  return {
    total,
    done,
    overdue,
    rate: total === 0 ? 0 : Math.round((done / total) * 100),
    onTime,
    onTimeRate: done === 0 ? 100 : Math.round((onTime / done) * 100),
  };
}

export interface ExperienceStats {
  xp: number;
  level: number;
  /** 当前等级内的进度 0–1。 */
  progress: number;
  nextLevelXp: number;
  streak: number;
  focusMinutes: number;
  completedTasks: number;
}

const LEVEL_STEP = 220;

function activeDayKeys(tasks: PlannerTask[], logs: StudyLog[]): Set<string> {
  const keys = new Set<string>();
  for (const log of logs) {
    if (log.planned) continue;
    const date = new Date(log.start);
    if (!Number.isNaN(date.getTime())) keys.add(dateKey(date));
  }
  for (const task of tasks) {
    if (!task.done || !task.completedAt) continue;
    const date = new Date(task.completedAt);
    if (!Number.isNaN(date.getTime())) keys.add(dateKey(date));
  }
  return keys;
}

/** F098：经验值、等级与连续学习天数。 */
export function experienceStats(
  tasks: PlannerTask[],
  logs: StudyLog[],
  now = new Date(),
): ExperienceStats {
  const focusMinutes = logs.filter((log) => !log.planned).reduce((total, log) => total + log.minutes, 0);
  const completedTasks = tasks.filter((task) => task.done).length;
  const keys = activeDayKeys(tasks, logs);
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!keys.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (keys.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const xp = completedTasks * 20 + Math.round(focusMinutes / 10) * 5 + streak * 10;
  const level = Math.floor(xp / LEVEL_STEP) + 1;
  const nextLevelXp = level * LEVEL_STEP;
  const progress = (xp - (level - 1) * LEVEL_STEP) / LEVEL_STEP;
  return { xp, level, progress: Math.min(1, Math.max(0, progress)), nextLevelXp, streak, focusMinutes, completedTasks };
}

/* -------------------------------------------------------------------------- */
/* 阶段 1 · F100 今日汇总                                                      */
/* -------------------------------------------------------------------------- */

export interface TodaySummary {
  courseCount: number;
  classMinutes: number;
  freeMinutes: number;
  gapCount: number;
  usableGapMinutes: number;
  eventCount: number;
  tasksTotal: number;
  tasksDone: number;
  tasksDue: number;
  studyMinutes: number;
  focusMinutes: number;
  completedTaskTitles: string[];
}

export function buildTodaySummary(input: {
  sessions: Session[];
  periods: Period[];
  events: ScheduleEvent[];
  tasks: PlannerTask[];
  logs: StudyLog[];
  now: Date;
  preferences?: GapPreferences;
}): TodaySummary {
  const { sessions, periods, events, tasks, logs, now } = input;
  const preferences = input.preferences ?? DEFAULT_GAP_PREFERENCES;
  const todayKey = dateKey(now);
  const timeline = buildDayTimeline(sessions, periods, preferences);
  const gapEntries = timeline.filter((entry) => entry.kind === "gap");
  const dayTasks = tasks.filter((task) => {
    if (task.due?.slice(0, 10) === todayKey) return true;
    if (task.done && task.completedAt?.slice(0, 10) === todayKey) return true;
    return false;
  });
  const dueTasks = tasks.filter((task) => !task.done && task.due?.slice(0, 10) === todayKey);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const todayLogs = logs.filter((log) => {
    if (log.planned) return false;
    const time = new Date(log.start).getTime();
    return !Number.isNaN(time) && time >= dayStart.getTime() && time <= dayEnd.getTime();
  });
  return {
    courseCount: sessions.length,
    classMinutes: sessions.reduce((total, session) => total + sessionMinutes(periods, session), 0),
    freeMinutes: timeline.filter((entry) => entry.kind !== "class").reduce((total, entry) => total + entry.minutes, 0),
    gapCount: gapEntries.length,
    usableGapMinutes: gapEntries.reduce((total, entry) => total + (entry.gap?.usableMinutes ?? entry.minutes), 0),
    eventCount: events.filter((event) => event.date === todayKey).length,
    tasksTotal: dayTasks.length,
    tasksDone: dayTasks.filter((task) => task.done).length,
    tasksDue: dueTasks.length,
    studyMinutes: todayLogs.reduce((total, log) => total + log.minutes, 0),
    focusMinutes: todayLogs.reduce((total, log) => total + (log.kind === "pomodoro" ? log.minutes : 0), 0),
    completedTaskTitles: dayTasks.filter((task) => task.done).map((task) => task.title),
  };
}

/** 把一天的空档与课程画成一条简短的文字时间线，供汇总卡使用。 */
export function todayBrief(
  sessions: Session[],
  periods: Period[],
): Array<{ label: string; start: string; end: string; kind: "class" | "gap" }> {
  const entries = buildDayTimeline(sessions, periods, DEFAULT_GAP_PREFERENCES).filter(
    (entry) => entry.kind === "class" || entry.kind === "gap",
  );
  return entries.map((entry) => ({
    label: entry.kind === "class" ? entry.label : `${entry.label} · 可用 ${entry.gap?.usableMinutes ?? entry.minutes} 分钟`,
    start: minutesToTime(entry.start),
    end: minutesToTime(entry.end),
    kind: entry.kind as "class" | "gap",
  }));
}

/** 当前正在上的课（用于今天的汇总高亮）。 */
export function currentSession(
  sessions: Session[],
  periods: Period[],
  now: Date,
): Session | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const day = ((now.getDay() + 6) % 7) + 1;
  return (
    sessions.find(
      (session) =>
        session.day === day &&
        nowMinutes >= sessionStartMinutes(session, periods) &&
        nowMinutes < sessionEndMinutes(session, periods),
    ) ?? null
  );
}

export function minutesLabel(minutes: number): string {
  if (minutes <= 0) return "0 分钟";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  if (!rest) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分钟`;
}

export function weekdayShort(day: number): string {
  return WEEKDAYS[day - 1]?.short ?? "";
}

export function formatStudyStart(start: string): string {
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDate(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

export function timeToDate(date: Date, time: string): Date {
  const minutes = timeToMinutes(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
}
