import { dayDiff, parseDateKey, timeToMinutes } from "./date";
import { uid } from "./factory";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

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
  subtasks?: Subtask[];
  id?: string;
}): Task {
  const now = new Date().toISOString();
  return {
    id: input.id ?? uid("task"),
    title: input.title.trim().slice(0, 80),
    courseId: input.courseId?.trim() || null,
    dueDate: input.dueDate && DATE_RE.test(input.dueDate) ? input.dueDate : "",
    dueTime: input.dueTime && TIME_RE.test(input.dueTime) ? input.dueTime : "",
    note: input.note?.trim().slice(0, 300) ?? "",
    done: false,
    subtasks: normalizeSubtasks(input.subtasks ?? []),
    createdAt: now,
    updatedAt: now,
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