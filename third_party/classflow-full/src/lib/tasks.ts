import { dateKey, dayDiff, parseDateKey, timeToMinutes } from "./date";
import { uid } from "./factory";
import type { PlannedReminder, SentLog } from "./reminders";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export type RepeatRule = "none" | "daily" | "weekly" | "monthly";

export interface RepeatOption {
  id: RepeatRule;
  label: string;
}

export const REPEAT_OPTIONS: RepeatOption[] = [
  { id: "none", label: "不重复" },
  { id: "daily", label: "每天" },
  { id: "weekly", label: "每周" },
  { id: "monthly", label: "每月" },
];

export interface Task {
  id: string;
  title: string;
  courseId: string | null;
  /** YYYY-MM-DD. An empty string means the task has no deadline. */
  dueDate: string;
  /** HH:mm, only valid together with dueDate. Empty means "any time that day". */
  dueTime: string;
  note: string;
  done: boolean;
  repeat: RepeatRule;
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
}

export type TaskBucket = "overdue" | "today" | "tomorrow" | "upcoming" | "later" | "undated";

export interface TaskGroups {
  overdue: Task[];
  today: Task[];
  tomorrow: Task[];
  upcoming: Task[];
  later: Task[];
  undated: Task[];
}

export interface TaskCountdown {
  text: string;
  tone: "danger" | "warn" | "normal" | "muted";
}

const TASKS_KEY = "kexu:tasks:v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BUCKET_ORDER: TaskBucket[] = ["overdue", "today", "tomorrow", "upcoming", "later", "undated"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeSubtasks(raw: unknown): Subtask[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const subtasks: Subtask[] = [];
  raw.slice(0, 50).forEach((item, index) => {
    if (!isRecord(item)) return;
    const title = text(item.title, 80);
    if (!title) return;
    const id = text(item.id, 80) || `subtask-${index + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    subtasks.push({ id, title, done: item.done === true });
  });
  return subtasks;
}

export function subtaskProgress(task: Task): { done: number; total: number } {
  return {
    done: task.subtasks.filter((subtask) => subtask.done).length,
    total: task.subtasks.length,
  };
}

export function addSubtask(task: Task, title: string): Task {
  const trimmed = title.trim().slice(0, 80);
  if (!trimmed) return task;
  return {
    ...task,
    subtasks: [...task.subtasks, { id: uid("subtask"), title: trimmed, done: false }],
    updatedAt: new Date().toISOString(),
  };
}

export function toggleSubtask(task: Task, subtaskId: string): Task {
  return {
    ...task,
    subtasks: task.subtasks.map((subtask) =>
      subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function removeSubtask(task: Task, subtaskId: string): Task {
  return {
    ...task,
    subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId),
    updatedAt: new Date().toISOString(),
  };
}

function todayStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isRepeatRule(value: unknown): value is RepeatRule {
  return REPEAT_OPTIONS.some((item) => item.id === value);
}

export function repeatLabel(rule: RepeatRule): string {
  return REPEAT_OPTIONS.find((item) => item.id === rule)?.label ?? "不重复";
}

export function normalizeTasks(raw: unknown): Task[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.tasks)
      ? raw.tasks
      : [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const tasks: Task[] = [];
  list.slice(0, 500).forEach((item, index) => {
    if (!isRecord(item)) return;
    const title = text(item.title, 80);
    if (!title) return;
    const id = text(item.id, 80) || `task-${index + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    const rawDueDate = text(item.dueDate, 20);
    const dueDate = DATE_RE.test(rawDueDate) ? rawDueDate : "";
    const rawDueTime = text(item.dueTime, 10);
    const dueTime = dueDate && TIME_RE.test(rawDueTime) ? rawDueTime : "";
    tasks.push({
      id,
      title,
      courseId: text(item.courseId, 80) || null,
      dueDate,
      dueTime,
      note: text(item.note, 300),
      done: item.done === true,
      repeat: isRepeatRule(item.repeat) && dueDate ? item.repeat : "none",
      subtasks: normalizeSubtasks(item.subtasks),
      createdAt: text(item.createdAt, 40) || now,
      updatedAt: text(item.updatedAt, 40) || now,
    });
  });
  return tasks;
}

export function makeTask(input: {
  title: string;
  courseId?: string | null;
  dueDate?: string;
  dueTime?: string;
  note?: string;
  repeat?: RepeatRule;
  subtasks?: Subtask[];
  id?: string;
}): Task {
  const now = new Date().toISOString();
  const dueDate = input.dueDate && DATE_RE.test(input.dueDate) ? input.dueDate : "";
  return {
    id: input.id ?? uid("task"),
    title: input.title.trim().slice(0, 80),
    courseId: input.courseId?.trim() || null,
    dueDate,
    dueTime: dueDate && input.dueTime && TIME_RE.test(input.dueTime) ? input.dueTime : "",
    note: input.note?.trim().slice(0, 300) ?? "",
    done: false,
    repeat: dueDate && input.repeat ? input.repeat : "none",
    subtasks: normalizeSubtasks(input.subtasks ?? []),
    createdAt: now,
    updatedAt: now,
  };
}

function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/**
 * Marking a repeating task done rolls its deadline forward to at least
 * tomorrow (or next week / month) and reopens its subtasks. Non-repeating
 * tasks simply move to the done list.
 */
export function completeTask(task: Task, now = new Date()): Task {
  const stamp = now.toISOString();
  if (task.repeat === "none" || !task.dueDate) {
    return { ...task, done: true, updatedAt: stamp };
  }
  const today = todayStart(now);
  let next = parseDateKey(task.dueDate);
  let guard = 0;
  do {
    if (task.repeat === "daily") {
      next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
    } else if (task.repeat === "weekly") {
      next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 7);
    } else {
      next = addMonths(next, 1);
    }
    guard += 1;
  } while (dayDiff(today, next) <= 0 && guard < 500);
  return {
    ...task,
    done: false,
    dueDate: dateKey(next),
    subtasks: task.subtasks.map((subtask) => ({ ...subtask, done: false })),
    updatedAt: stamp,
  };
}

function readStore(): Record<string, unknown> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function loadTasks(timetableId: string): Task[] {
  return normalizeTasks(readStore()[timetableId]);
}

export function saveTasks(timetableId: string, tasks: Task[]): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const store = readStore();
    store[timetableId] = tasks;
    localStorage.setItem(TASKS_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** Legacy shape (a bare array) is upgraded to the timetable-scoped store. */
export function migrateLegacyTasks(raw: unknown, timetableId: string): Task[] {
  const tasks = normalizeTasks(raw);
  if (tasks.length > 0) saveTasks(timetableId, tasks);
  return tasks;
}

export function taskBucket(task: Task, now: Date): TaskBucket {
  if (!task.dueDate) return "undated";
  const days = dayDiff(todayStart(now), parseDateKey(task.dueDate));
  if (days < 0) return "overdue";
  if (days === 0) {
    if (task.dueTime && timeToMinutes(task.dueTime) < now.getHours() * 60 + now.getMinutes()) {
      return "overdue";
    }
    return "today";
  }
  if (days === 1) return "tomorrow";
  if (days <= 7) return "upcoming";
  return "later";
}

export function taskCountdown(task: Task, now: Date): TaskCountdown {
  if (!task.dueDate) return { text: "未设截止", tone: "muted" };
  const days = dayDiff(todayStart(now), parseDateKey(task.dueDate));
  if (days < 0) return { text: `已逾期 ${-days} 天`, tone: "danger" };
  if (days === 0) {
    if (!task.dueTime) return { text: "今天截止", tone: "warn" };
    const minutes = timeToMinutes(task.dueTime) - (now.getHours() * 60 + now.getMinutes());
    if (minutes < 0) return { text: `已过 ${task.dueTime} 截止时间`, tone: "danger" };
    if (minutes <= 120) return { text: `还有 ${Math.max(1, minutes)} 分钟`, tone: "warn" };
    return { text: `今天 ${task.dueTime} 截止`, tone: "warn" };
  }
  if (days === 1) return { text: task.dueTime ? `明天 ${task.dueTime}` : "明天截止", tone: "normal" };
  if (days <= 7) return { text: `还有 ${days} 天`, tone: "normal" };
  return { text: `还有 ${days} 天`, tone: "muted" };
}

function compareTasks(a: Task, b: Task): number {
  if (!a.dueDate && !b.dueDate) return a.createdAt.localeCompare(b.createdAt);
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate) || a.dueTime.localeCompare(b.dueTime);
}

export function groupTasks(tasks: Task[], now: Date): TaskGroups {
  const groups: TaskGroups = {
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming: [],
    later: [],
    undated: [],
  };
  for (const task of tasks) groups[taskBucket(task, now)].push(task);
  for (const key of BUCKET_ORDER) groups[key].sort(compareTasks);
  return groups;
}

export function describeDue(task: Task): string {
  if (!task.dueDate) return "无截止日期";
  const label = task.dueDate.slice(5).replace("-", "/");
  return task.dueTime ? `${label} ${task.dueTime}` : label;
}

export function parseTasksJson(source: string): { ok: boolean; tasks: Task[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, tasks: [], error: "JSON 格式不正确。" };
  }
  const tasks = normalizeTasks(parsed);
  if (tasks.length === 0) {
    return { ok: false, tasks: [], error: "没有找到带标题的任务。" };
  }
  return { ok: true, tasks };
}

function taskDue(task: Task): Date | null {
  if (!DATE_RE.test(task.dueDate)) return null;
  const base = parseDateKey(task.dueDate);
  if (TIME_RE.test(task.dueTime)) {
    const minutes = timeToMinutes(task.dueTime);
    return new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      Math.floor(minutes / 60),
      minutes % 60,
    );
  }
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59);
}

interface TaskReminderNode {
  id: string;
  lead: string;
  target: Date;
  windowMinutes: number;
}

function nodesFor(due: Date, hasTime: boolean): TaskReminderNode[] {
  if (hasTime) {
    return [
      { id: "24h", lead: "24 小时后截止", target: new Date(due.getTime() - 24 * 60 * 60_000), windowMinutes: 12 * 60 },
      { id: "3h", lead: "3 小时后截止", target: new Date(due.getTime() - 3 * 60 * 60_000), windowMinutes: 120 },
      { id: "30m", lead: "30 分钟后截止", target: new Date(due.getTime() - 30 * 60_000), windowMinutes: 30 },
    ];
  }
  const evening = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1, 20, 0);
  return [{ id: "1d", lead: "明天截止", target: evening, windowMinutes: 12 * 60 }];
}

export interface TaskReminderPlanInput {
  now: Date;
  timetableId: string;
  tasks: Task[];
  sent: SentLog;
}

/**
 * Escalating deadline reminders: 24h / 3h / 30m before a timed deadline, or
 * one evening-before notice when only a date is known.
 */
export function planTaskReminders(input: TaskReminderPlanInput): PlannedReminder[] {
  const { now, tasks, sent } = input;
  const planned: PlannedReminder[] = [];
  for (const task of tasks) {
    if (task.done) continue;
    const due = taskDue(task);
    if (!due || due.getTime() <= now.getTime()) continue;
    const hasTime = TIME_RE.test(task.dueTime);
    for (const node of nodesFor(due, hasTime)) {
      if (now.getTime() < node.target.getTime()) continue;
      if (now.getTime() - node.target.getTime() > node.windowMinutes * 60_000) continue;
      const key = `task:${input.timetableId}:${task.id}:${node.id}`;
      if (sent[key]) continue;
      const remaining = subtaskProgress(task);
      const pending = remaining.total - remaining.done;
      const dueText = hasTime
        ? `${task.dueDate.slice(5).replace("-", "/")} ${task.dueTime}`
        : task.dueDate.slice(5).replace("-", "/");
      planned.push({
        key,
        title: `DDL 提醒 · ${task.title}`,
        body: `${node.lead}（${dueText}）${pending > 0 ? `，还有 ${pending} 个子任务未完成` : ""}。`,
      });
    }
  }
  return planned;
}