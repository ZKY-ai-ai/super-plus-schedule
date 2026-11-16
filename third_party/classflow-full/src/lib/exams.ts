import { dayDiff, parseDateKey, timeToMinutes } from "./date";
import { uid } from "./factory";
import type { PlannedReminder, SentLog } from "./reminders";

export type ExamType = "quiz" | "midterm" | "final" | "lab" | "other";

export interface ExamTypeMeta {
  id: ExamType;
  label: string;
}

export const EXAM_TYPES: ExamTypeMeta[] = [
  { id: "quiz", label: "测验" },
  { id: "midterm", label: "期中" },
  { id: "final", label: "期末" },
  { id: "lab", label: "实验考核" },
  { id: "other", label: "其他" },
];

export interface Exam {
  id: string;
  courseId: string | null;
  title: string;
  type: ExamType;
  /** YYYY-MM-DD, required. */
  date: string;
  /** HH:mm, may be empty when the time is not announced yet. */
  startTime: string;
  endTime: string;
  location: string;
  seat: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamCountdown {
  text: string;
  tone: "danger" | "warn" | "normal" | "muted";
}

const EXAMS_KEY = "kexu:exams:v1";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_TYPE: ExamType = "other";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateKey(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isExamType(value: unknown): value is ExamType {
  return EXAM_TYPES.some((item) => item.id === value);
}

export function examTypeLabel(type: ExamType): string {
  return EXAM_TYPES.find((item) => item.id === type)?.label ?? "其他";
}

function todayStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function normalizeExams(raw: unknown): Exam[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.exams)
      ? raw.exams
      : [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const exams: Exam[] = [];
  list.slice(0, 300).forEach((item, index) => {
    if (!isRecord(item)) return;
    const date = text(item.date, 20);
    if (!isDateKey(date)) return;
    const title = text(item.title, 80);
    if (!title) return;
    const id = text(item.id, 80) || `exam-${index + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    const rawStart = text(item.startTime, 10);
    const rawEnd = text(item.endTime, 10);
    const startTime = TIME_RE.test(rawStart) ? rawStart : "";
    exams.push({
      id,
      courseId: text(item.courseId, 80) || null,
      title,
      type: isExamType(item.type) ? item.type : DEFAULT_TYPE,
      date,
      startTime,
      endTime: startTime && TIME_RE.test(rawEnd) ? rawEnd : "",
      location: text(item.location, 80),
      seat: text(item.seat, 40),
      note: text(item.note, 300),
      createdAt: text(item.createdAt, 40) || now,
      updatedAt: text(item.updatedAt, 40) || now,
    });
  });
  return exams;
}

export function makeExam(input: {
  title: string;
  date: string;
  courseId?: string | null;
  type?: ExamType;
  startTime?: string;
  endTime?: string;
  location?: string;
  seat?: string;
  note?: string;
  id?: string;
}): Exam {
  const now = new Date().toISOString();
  const startTime = input.startTime && TIME_RE.test(input.startTime) ? input.startTime : "";
  return {
    id: input.id ?? uid("exam"),
    courseId: input.courseId?.trim() || null,
    title: input.title.trim().slice(0, 80),
    type: input.type ?? DEFAULT_TYPE,
    date: isDateKey(input.date) ? input.date : "",
    startTime,
    endTime: startTime && input.endTime && TIME_RE.test(input.endTime) ? input.endTime : "",
    location: input.location?.trim().slice(0, 80) ?? "",
    seat: input.seat?.trim().slice(0, 40) ?? "",
    note: input.note?.trim().slice(0, 300) ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

function readStore(): Record<string, unknown> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(EXAMS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function loadExams(timetableId: string): Exam[] {
  return normalizeExams(readStore()[timetableId]);
}

export function saveExams(timetableId: string, exams: Exam[]): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const store = readStore();
    store[timetableId] = exams;
    localStorage.setItem(EXAMS_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function examStart(exam: Exam): Date | null {
  if (!DATE_RE.test(exam.date)) return null;
  const base = parseDateKey(exam.date);
  if (!TIME_RE.test(exam.startTime)) return base;
  const minutes = timeToMinutes(exam.startTime);
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  );
}

export function isExamUpcoming(exam: Exam, now: Date): boolean {
  const start = examStart(exam);
  if (!start) return false;
  if (TIME_RE.test(exam.endTime)) {
    const end = new Date(start.getTime() + Math.max(0, timeToMinutes(exam.endTime) - timeToMinutes(exam.startTime)) * 60_000);
    return end.getTime() >= now.getTime();
  }
  return dayDiff(todayStart(now), parseDateKey(exam.date)) >= 0;
}

export function sortExams(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
  });
}

export function upcomingExams(exams: Exam[], now: Date): Exam[] {
  return sortExams(exams.filter((exam) => isExamUpcoming(exam, now)));
}

export function examCountdown(exam: Exam, now: Date): ExamCountdown {
  const start = examStart(exam);
  if (!start) return { text: "日期无效", tone: "muted" };
  const days = dayDiff(todayStart(now), parseDateKey(exam.date));
  if (days < 0 || start.getTime() < now.getTime()) return { text: "已结束", tone: "muted" };
  const time = exam.startTime ? ` ${exam.startTime}` : "";
  if (days === 0) {
    const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
    if (minutes <= 60) return { text: `还有 ${Math.max(1, minutes)} 分钟`, tone: "danger" };
    if (minutes <= 360) return { text: `还有 ${Math.round(minutes / 60)} 小时`, tone: "danger" };
    return { text: `今天${time}开考`, tone: "warn" };
  }
  if (days === 1) return { text: `明天${time}`, tone: "warn" };
  if (days <= 7) return { text: `还有 ${days} 天`, tone: "normal" };
  return { text: `还有 ${days} 天`, tone: "muted" };
}

export function describeExam(exam: Exam, courseName?: string): string {
  const parts = [courseName || exam.title, examTypeLabel(exam.type)];
  if (exam.date) parts.push(exam.date.slice(5).replace("-", "/"));
  if (exam.startTime) parts.push(exam.startTime);
  if (exam.location) parts.push(exam.location);
  if (exam.seat) parts.push(`座位 ${exam.seat}`);
  return parts.filter(Boolean).join(" · ");
}

interface ExamReminderNode {
  id: string;
  /** Used for the sentence shown to the user. */
  lead: string;
  target: (start: Date) => Date;
  windowMinutes: number;
}

const EXAM_NODES: ExamReminderNode[] = [
  {
    id: "7d",
    lead: "一周后",
    target: (start) => new Date(start.getTime() - 7 * 86_400_000),
    windowMinutes: 12 * 60,
  },
  {
    id: "1d",
    lead: "明天",
    target: (start) => new Date(start.getTime() - 86_400_000),
    windowMinutes: 12 * 60,
  },
  {
    id: "2h",
    lead: "两小时后",
    target: (start) => new Date(start.getTime() - 2 * 60 * 60_000),
    windowMinutes: 90,
  },
];

export interface ExamReminderPlanInput {
  now: Date;
  timetableId: string;
  exams: Exam[];
  courseName: (courseId: string | null) => string;
  sent: SentLog;
}

/**
 * Fires once per node (7 days, 1 day, 2 hours before). Daily nodes land at
 * 20:00 so they show up in the evening; the 2-hour node follows the start
 * time and is skipped while the exam time is still unknown.
 */
export function planExamReminders(input: ExamReminderPlanInput): PlannedReminder[] {
  const { now, exams, sent } = input;
  const planned: PlannedReminder[] = [];
  for (const exam of exams) {
    const start = examStart(exam);
    if (!start || start.getTime() <= now.getTime()) continue;
    for (const node of EXAM_NODES) {
      if (node.id === "2h" && !TIME_RE.test(exam.startTime)) continue;
      const base =
        node.id === "2h"
          ? node.target(start)
          : new Date(
              parseDateKey(exam.date).getFullYear(),
              parseDateKey(exam.date).getMonth(),
              parseDateKey(exam.date).getDate() - Number(node.id.replace("d", "")),
              20,
              0,
            );
      if (now.getTime() < base.getTime()) continue;
      if (now.getTime() - base.getTime() > node.windowMinutes * 60_000) continue;
      const key = `exam:${input.timetableId}:${exam.id}:${node.id}`;
      if (sent[key]) continue;
      const place = exam.location ? ` · ${exam.location}` : "";
      const seat = exam.seat ? ` · 座位 ${exam.seat}` : "";
      const when = exam.startTime ? `${exam.date.slice(5).replace("-", "/")} ${exam.startTime}` : exam.date.slice(5).replace("-", "/");
      planned.push({
        key,
        title: `${examTypeLabel(exam.type)}提醒 · ${input.courseName(exam.courseId) || exam.title}`,
        body: `${node.lead}开考：${when}${place}${seat}。`,
      });
    }
  }
  return planned;
}