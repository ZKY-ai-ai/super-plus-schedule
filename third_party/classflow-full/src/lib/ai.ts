/**
 * 丁 · AI 与自然语言模块（F111 / F117 / F118）
 *
 * 设计原则：
 * 1. 本地规则模式零配置可用，不联网也能查课。
 * 2. OpenAI 兼容接口是可选项，密钥只存本机。
 * 3. 任何上下文都必须经过分项授权裁剪，默认最小授权。
 */
import type { Course, Semester } from "../types";
import {
  addDays,
  dateKey,
  formatMonthDay,
  getDateForSlot,
  getWeekDates,
  weekdayLabel,
} from "./date";
import { buildSessions } from "./schedule";
import { searchNotes, MAX_NOTES, type Note } from "./notes";

/* ------------------------------ 课表快照 ------------------------------ */

export interface AiCourse {
  id: string;
  name: string;
  teacher: string;
  location: string;
  tone: string;
}

export interface AiSession {
  id: string;
  date: string;
  week: number;
  weekday: number;
  courseId: string;
  courseName: string;
  teacher: string;
  location: string;
  startPeriod: number;
  endPeriod: number;
  startTime: string;
  endTime: string;
}

export interface AiDay {
  date: string;
  weekday: number;
  week: number;
  isToday: boolean;
  sessions: AiSession[];
}

export interface AiScheduleSnapshot {
  generatedAt: string;
  semesterName: string;
  week: number;
  totalWeeks: number;
  days: AiDay[];
  courses: AiCourse[];
  nextSession: AiSession | null;
}

export interface AiSnapshotInput {
  courses: Course[];
  semester: Semester;
  week: number;
  now: Date;
}

function toAiSession(
  session: ReturnType<typeof buildSessions>[number],
  date: Date,
  week: number,
  periods: Semester["periods"],
): AiSession {
  const start = periods[session.start - 1];
  const end = periods[session.end - 1];
  return {
    id: session.id,
    date: dateKey(date),
    week,
    weekday: session.day,
    courseId: session.course.id,
    courseName: session.course.name,
    teacher: session.course.teacher,
    location: session.course.location,
    startPeriod: session.start,
    endPeriod: session.end,
    startTime: start?.start ?? "",
    endTime: end?.end ?? "",
  };
}

function sessionStart(session: AiSession): Date {
  return new Date(`${session.date}T${session.startTime || "00:00"}:00`);
}

function sessionEnd(session: AiSession): Date {
  return new Date(`${session.date}T${session.endTime || "23:59"}:00`);
}

export function buildAiScheduleSnapshot(input: AiSnapshotInput): AiScheduleSnapshot {
  const totalWeeks = Math.max(1, input.semester.totalWeeks);
  const week = Math.min(Math.max(1, input.week), totalWeeks);
  const todayKey = dateKey(input.now);
  const weeks = week < totalWeeks ? [week, week + 1] : [week];
  const days: AiDay[] = [];
  const periods = input.semester.periods;

  for (const targetWeek of weeks) {
    const dates = getWeekDates(input.semester.startDate, targetWeek);
    const sessions = buildSessions(input.courses, targetWeek);
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      const date = dates[weekday - 1] ?? getDateForSlot(input.semester.startDate, targetWeek, weekday);
      const key = dateKey(date);
      days.push({
        date: key,
        weekday,
        week: targetWeek,
        isToday: key === todayKey,
        sessions: sessions
          .filter((session) => session.day === weekday)
          .sort((a, b) => a.start - b.start || a.end - b.end)
          .map((session) => toAiSession(session, date, targetWeek, periods)),
      });
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const now = input.now;
  const nextSession =
    days
      .flatMap((day) => day.sessions)
      .filter((session) => sessionEnd(session).getTime() >= now.getTime())
      .sort(
        (a, b) =>
          sessionStart(a).getTime() - sessionStart(b).getTime() ||
          a.startPeriod - b.startPeriod,
      )[0] ?? null;

  return {
    generatedAt: now.toISOString(),
    semesterName: input.semester.name,
    week,
    totalWeeks,
    days,
    courses: input.courses.map((course) => ({
      id: course.id,
      name: course.name,
      teacher: course.teacher,
      location: course.location,
      tone: course.tone,
    })),
    nextSession,
  };
}

/* --------------------------- 自然语言查课 --------------------------- */

export type ScheduleIntent =
  | "today"
  | "tomorrow"
  | "weekday"
  | "next"
  | "remaining"
  | "course"
  | "count"
  | "week"
  | "unknown";

export interface ScheduleAnswer {
  text: string;
  intent: ScheduleIntent;
  sessions: AiSession[];
}

const WEEKDAY_CHARS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
};

const CN_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function parseChineseNumber(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value);
  if (!/^[一二三四五六七八九十百]+$/.test(value)) return null;
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (CN_DIGITS[value[1]] ?? 0);
  const [tens, ones] = value.split("十");
  if (ones !== undefined) {
    return (CN_DIGITS[tens] ?? 1) * 10 + (CN_DIGITS[ones] ?? 0);
  }
  return CN_DIGITS[value] ?? null;
}

function parseWeekNumber(question: string): number | null {
  const match = /第\s*([一二三四五六七八九十百\d]+)\s*周/.exec(question);
  return match ? parseChineseNumber(match[1]) : null;
}

function parseWeekday(
  question: string,
): { weekday: number; nextWeek: boolean } | null {
  const nextWeek = /(下周|下星期|下礼拜|下个星期)/.test(question);
  const match = /(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/.exec(question);
  if (!match) return null;
  const weekday = WEEKDAY_CHARS[match[1]];
  if (!weekday) return null;
  return { weekday, nextWeek };
}

function normalizeForMatch(value: string): string {
  return value.replace(/[（(].*?[)）]/g, "").replace(/\s+/g, "").toLocaleLowerCase();
}

function courseAliases(course: AiCourse): string[] {
  const name = normalizeForMatch(course.name);
  const cjk = name.replace(/[^\u4e00-\u9fa5]/g, "");
  const aliases = new Set<string>();
  if (name.length >= 2) aliases.add(name);
  if (cjk.length >= 2) {
    aliases.add(cjk);
    aliases.add(cjk.slice(0, 2));
    aliases.add(cjk.slice(-2));
  }
  if (cjk.length >= 3) aliases.add(cjk[0] + cjk[2]);
  if (course.teacher.trim()) {
    aliases.add(normalizeForMatch(course.teacher));
  }
  return [...aliases].filter((alias) => alias.length >= 2);
}

function findCourse(question: string, courses: AiCourse[]): AiCourse | null {
  const normalized = normalizeForMatch(question);
  if (!normalized) return null;
  let best: { course: AiCourse; weight: number } | null = null;
  for (const course of courses) {
    for (const alias of courseAliases(course)) {
      if (!normalized.includes(alias)) continue;
      if (!best || alias.length > best.weight) {
        best = { course, weight: alias.length };
      }
    }
  }
  return best?.course ?? null;
}

function dayLabel(day: AiDay): string {
  const date = new Date(`${day.date}T00:00:00`);
  return `${weekdayLabel(day.weekday)} ${formatMonthDay(date)}`;
}

function formatSession(session: AiSession): string {
  const time = session.startTime && session.endTime
    ? `${session.startTime}–${session.endTime}`
    : `第 ${session.startPeriod}–${session.endPeriod} 节`;
  const location = session.location ? ` · ${session.location}` : "";
  const teacher = session.teacher ? ` · ${session.teacher}` : "";
  return `${time} 《${session.courseName}》${location}${teacher}`;
}

function listDay(day: AiDay): string {
  const label = `${dayLabel(day)}${day.isToday ? "（今天）" : ""}`;
  if (day.sessions.length === 0) return `${label}没有课，可以安排复习或休息。`;
  return `${label}有 ${day.sessions.length} 节课：\n${day.sessions
    .map((session) => `· ${formatSession(session)}`)
    .join("\n")}`;
}

function findDayByDate(snapshot: AiScheduleSnapshot, key: string): AiDay | null {
  return snapshot.days.find((day) => day.date === key) ?? null;
}

function answerToday(snapshot: AiScheduleSnapshot, now: Date): ScheduleAnswer {
  const day = findDayByDate(snapshot, dateKey(now));
  if (!day) {
    return {
      text: "今天不在已加载的两周课表里，可能是假期或学期之外。",
      intent: "today",
      sessions: [],
    };
  }
  return { text: listDay(day), intent: "today", sessions: day.sessions };
}

function answerTomorrow(snapshot: AiScheduleSnapshot, now: Date): ScheduleAnswer {
  const key = dateKey(addDays(now, 1));
  const day = findDayByDate(snapshot, key);
  if (!day) {
    return {
      text: "明天不在已加载的两周课表里，可能已经到学期末了。",
      intent: "tomorrow",
      sessions: [],
    };
  }
  return { text: listDay(day), intent: "tomorrow", sessions: day.sessions };
}

function answerWeekday(
  snapshot: AiScheduleSnapshot,
  now: Date,
  info: { weekday: number; nextWeek: boolean },
  explicitWeek: number | null,
): ScheduleAnswer {
  let day: AiDay | null = null;
  if (explicitWeek !== null) {
    day = snapshot.days.find((item) => item.week === explicitWeek && item.weekday === info.weekday) ?? null;
  } else if (info.nextWeek) {
    day = snapshot.days.find(
      (item) => item.week === snapshot.week + 1 && item.weekday === info.weekday,
    ) ?? null;
  } else {
    const todayKey = dateKey(now);
    day =
      snapshot.days.find(
        (item) => item.weekday === info.weekday && item.date >= todayKey,
      ) ?? null;
  }
  if (!day) {
    return {
      text: `课表里没有找到${weekdayLabel(info.weekday)}的安排；目前只加载了第 ${snapshot.week} 周和下一周。`,
      intent: "weekday",
      sessions: [],
    };
  }
  return { text: listDay(day), intent: "weekday", sessions: day.sessions };
}

function answerWeek(snapshot: AiScheduleSnapshot, targetWeek: number): ScheduleAnswer {
  const days = snapshot.days.filter((day) => day.week === targetWeek && day.sessions.length > 0);
  if (days.length === 0) {
    const loaded = [...new Set(snapshot.days.map((day) => day.week))].join("、");
    return {
      text: `没有找到第 ${targetWeek} 周的课；目前只加载了第 ${loaded} 周。`,
      intent: "week",
      sessions: [],
    };
  }
  const sessions = days.flatMap((day) => day.sessions);
  return {
    text: `第 ${targetWeek} 周共 ${sessions.length} 节课：\n${days
      .map((day) => `· ${dayLabel(day)}：${day.sessions.length} 节（${day.sessions.map((s) => s.courseName).join("、")}）`)
      .join("\n")}`,
    intent: "week",
    sessions,
  };
}

function answerCourse(
  snapshot: AiScheduleSnapshot,
  now: Date,
  course: AiCourse,
  question: string,
): ScheduleAnswer {
  const related = snapshot.days
    .flatMap((day) => day.sessions)
    .filter((session) => session.courseId === course.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startPeriod - b.startPeriod);
  const upcoming = related.filter((session) => sessionEnd(session).getTime() >= now.getTime());
  const asksWhere = /在哪|哪里|地点|教室|楼/.test(question);
  const asksWhen = /几点|什么时候|时间|哪天|周几/.test(question);
  const head = `《${course.name}》${course.teacher ? ` · ${course.teacher}` : ""}${course.location ? ` · 常用教室 ${course.location}` : ""}`;

  if (upcoming.length === 0) {
    return {
      text: `${head}\n这两周没有排到这门课；如果刚调过课，等课表更新后再问我一次。`,
      intent: "course",
      sessions: [],
    };
  }
  if (asksWhere) {
    return {
      text: `${head}\n接下来的上课地点：\n${upcoming
        .slice(0, 5)
        .map((session) => `· ${dayLabel(findDayByDate(snapshot, session.date) ?? snapshot.days[0])}：${session.location || "未填写教室"}`)
        .join("\n")}`,
      intent: "course",
      sessions: upcoming.slice(0, 5),
    };
  }
  if (asksWhen) {
    return {
      text: `${head}\n接下来的上课时间：\n${upcoming
        .slice(0, 5)
        .map(
          (session) =>
            `· ${dayLabel(findDayByDate(snapshot, session.date) ?? snapshot.days[0])}：${formatSession(session)}`,
        )
        .join("\n")}`,
      intent: "course",
      sessions: upcoming.slice(0, 5),
    };
  }
  return {
    text: `${head}\n接下来两周的安排：\n${upcoming
      .slice(0, 6)
      .map(
        (session) =>
          `· ${dayLabel(findDayByDate(snapshot, session.date) ?? snapshot.days[0])}：${formatSession(session)}`,
      )
      .join("\n")}`,
    intent: "course",
    sessions: upcoming.slice(0, 6),
  };
}

function answerNext(snapshot: AiScheduleSnapshot, now: Date): ScheduleAnswer {
  const session = snapshot.nextSession;
  if (!session) {
    return { text: "这两周没有更多课了，可以安心安排自习。", intent: "next", sessions: [] };
  }
  const start = sessionStart(session);
  const end = sessionEnd(session);
  const ongoing = now >= start && now <= end;
  const day = findDayByDate(snapshot, session.date);
  const prefix = ongoing ? "现在正在上" : "下一节是";
  return {
    text: `${prefix}${formatSession(session)}${day ? `（${dayLabel(day)}）` : ""}。`,
    intent: "next",
    sessions: [session],
  };
}

function answerRemaining(snapshot: AiScheduleSnapshot, now: Date): ScheduleAnswer {
  const day = findDayByDate(snapshot, dateKey(now));
  if (!day) return { text: "今天不在已加载的课表里。", intent: "remaining", sessions: [] };
  const remaining = day.sessions.filter((session) => sessionEnd(session).getTime() >= now.getTime());
  if (remaining.length === 0) {
    return {
      text: day.sessions.length === 0
        ? "今天没有课，已经可以自由安排啦。"
        : "今天的课已经上完了，去休息或复习吧。",
      intent: "remaining",
      sessions: [],
    };
  }
  return {
    text: `今天还有 ${remaining.length} 节：\n${remaining
      .map((session) => `· ${formatSession(session)}`)
      .join("\n")}`,
    intent: "remaining",
    sessions: remaining,
  };
}

function answerCount(snapshot: AiScheduleSnapshot, now: Date): ScheduleAnswer {
  const weekSessions = snapshot.days
    .filter((day) => day.week === snapshot.week)
    .flatMap((day) => day.sessions);
  const today = findDayByDate(snapshot, dateKey(now));
  return {
    text: `第 ${snapshot.week} 周共 ${snapshot.courses.length} 门课、${weekSessions.length} 节课；今天 ${today?.sessions.length ?? 0} 节。`,
    intent: "count",
    sessions: weekSessions,
  };
}

export function answerScheduleQuestion(
  question: string,
  snapshot: AiScheduleSnapshot,
  now = new Date(),
): ScheduleAnswer {
  const text = question.trim();
  if (!text) {
    return {
      text: "可以问我：今天有什么课、明天几点上课、下一节是什么、高数在哪上。",
      intent: "unknown",
      sessions: [],
    };
  }

  if (/考试|考场|成绩|绩点|排名/.test(text)) {
    return {
      text: "考试与成绩数据属于学习管理模块（乙的泳道），接入后可以直接问「下周的期中考试在哪」。现在可以先把考试安排记在笔记里。",
      intent: "unknown",
      sessions: [],
    };
  }

  if (/下一节|下节|接下来|还要上|后面.*课/.test(text)) {
    return answerNext(snapshot, now);
  }
  if (/还有.*[几多]|剩下|剩余|没上完/.test(text)) {
    return answerRemaining(snapshot, now);
  }
  if (/几门|多少门|几节课|多少节课|课程数|共.*节/.test(text) && !/第\s*\S+\s*周/.test(text)) {
    return answerCount(snapshot, now);
  }

  const course = findCourse(text, snapshot.courses);
  if (course) {
    return answerCourse(snapshot, now, course, text);
  }

  const explicitWeek = parseWeekNumber(text);
  const weekday = parseWeekday(text);
  if (weekday) {
    return answerWeekday(snapshot, now, weekday, explicitWeek);
  }
  if (explicitWeek !== null) {
    return answerWeek(snapshot, explicitWeek);
  }
  const isScheduleTalk = /课|上|安排|几点|什么|空|节/.test(text);
  if (/明天|明日/.test(text) && isScheduleTalk) {
    return answerTomorrow(snapshot, now);
  }
  if (/今天|今日|现在/.test(text) && (isScheduleTalk || /^(今天|今日|现在)$/.test(text))) {
    return answerToday(snapshot, now);
  }
  if (/下周/.test(text)) {
    return answerWeek(snapshot, snapshot.week + 1);
  }
  if (/这周|本周|这个星期/.test(text)) {
    return answerWeek(snapshot, snapshot.week);
  }

  return {
    text: "我还没听懂这句。可以试试：「今天有什么课」「明天几点有课」「下一节是什么」「高数在哪上」「第 8 周有几节课」。",
    intent: "unknown",
    sessions: [],
  };
}

/* --------------------------- 人格与设置 --------------------------- */

export type AiProviderId = "local" | "openai-compatible";
export type AiTone = "concise" | "warm" | "playful";

export interface AiPersona {
  name: string;
  tone: AiTone;
  customPrompt: string;
}

export interface AiPermissions {
  schedule: boolean;
  notes: boolean;
  noteTags: boolean;
  tasks: boolean;
  exams: boolean;
}

export interface AiSettings {
  provider: AiProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  persona: AiPersona;
  permissions: AiPermissions;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AiChatData {
  version: 1;
  messages: AiChatMessage[];
  updatedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const AI_SETTINGS_KEY = "kexu:ai:settings:v1";
export const AI_CHAT_KEY = "kexu:ai:chat:v1";
export const MAX_CHAT_MESSAGES = 120;

export const DEFAULT_PERSONA: AiPersona = {
  name: "小序",
  tone: "warm",
  customPrompt: "",
};

export const DEFAULT_AI_PERMISSIONS: AiPermissions = {
  schedule: true,
  notes: false,
  noteTags: false,
  tasks: false,
  exams: false,
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "local",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  persona: DEFAULT_PERSONA,
  permissions: DEFAULT_AI_PERMISSIONS,
};

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max) || fallback;
}

function normalizePersona(value: unknown): AiPersona {
  const object = isRecord(value) ? value : {};
  const tone: AiTone =
    object.tone === "concise" || object.tone === "playful" ? object.tone : "warm";
  return {
    name: text(object.name, 20, DEFAULT_PERSONA.name),
    tone,
    customPrompt: text(object.customPrompt, 500),
  };
}

function normalizePermissions(value: unknown): AiPermissions {
  const object = isRecord(value) ? value : {};
  return {
    schedule: object.schedule !== false,
    notes: object.notes === true,
    noteTags: object.noteTags === true,
    tasks: object.tasks === true,
    exams: object.exams === true,
  };
}

function normalizeBaseUrl(value: unknown): string {
  const raw = text(value, 300, DEFAULT_AI_SETTINGS.baseUrl);
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_AI_SETTINGS.baseUrl;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_AI_SETTINGS.baseUrl;
  }
}

export function normalizeAiSettings(raw: unknown): AiSettings {
  const object = isRecord(raw) ? raw : {};
  return {
    provider: object.provider === "openai-compatible" ? "openai-compatible" : "local",
    baseUrl: normalizeBaseUrl(object.baseUrl),
    apiKey: text(object.apiKey, 300),
    model: text(object.model, 80, DEFAULT_AI_SETTINGS.model),
    persona: normalizePersona(object.persona),
    permissions: normalizePermissions(object.permissions),
  };
}

export function loadAiSettings(
  storage: StorageLike | null = defaultStorage(),
): AiSettings {
  if (!storage) return { ...DEFAULT_AI_SETTINGS, persona: { ...DEFAULT_PERSONA }, permissions: { ...DEFAULT_AI_PERMISSIONS } };
  try {
    const raw = storage.getItem(AI_SETTINGS_KEY);
    if (!raw) return normalizeAiSettings(null);
    return normalizeAiSettings(JSON.parse(raw));
  } catch {
    return normalizeAiSettings(null);
  }
}

export function saveAiSettings(settings: AiSettings, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AI_SETTINGS_KEY, JSON.stringify(normalizeAiSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function createChatMessage(
  role: AiChatMessage["role"],
  content: string,
  now = new Date(),
): AiChatMessage {
  return {
    id: `msg-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: content.trim().slice(0, 8000),
    createdAt: now.toISOString(),
  };
}

export function normalizeChat(raw: unknown, now = new Date()): AiChatData {
  const object = isRecord(raw) ? raw : {};
  const messages: AiChatMessage[] = [];
  const ids = new Set<string>();
  if (Array.isArray(object.messages)) {
    for (const item of object.messages.slice(-MAX_CHAT_MESSAGES)) {
      if (!isRecord(item)) continue;
      const role = item.role === "assistant" ? "assistant" : "user";
      const content = text(item.content, 8000);
      if (!content) continue;
      const id = text(item.id, 80) || `msg-${messages.length}`;
      if (ids.has(id)) continue;
      ids.add(id);
      messages.push({
        id,
        role,
        content,
        createdAt: text(item.createdAt, 40, now.toISOString()),
      });
    }
  }
  return { version: 1, messages, updatedAt: now.toISOString() };
}

export function loadChat(
  storage: StorageLike | null = defaultStorage(),
  now = new Date(),
): AiChatData {
  if (!storage) return { version: 1, messages: [], updatedAt: now.toISOString() };
  try {
    const raw = storage.getItem(AI_CHAT_KEY);
    if (!raw) return { version: 1, messages: [], updatedAt: now.toISOString() };
    return normalizeChat(JSON.parse(raw), now);
  } catch {
    return { version: 1, messages: [], updatedAt: now.toISOString() };
  }
}

export function saveChat(data: AiChatData, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AI_CHAT_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function appendChat(
  data: AiChatData,
  message: AiChatMessage,
  now = new Date(),
): AiChatData {
  return {
    version: 1,
    messages: [...data.messages, message].slice(-MAX_CHAT_MESSAGES),
    updatedAt: now.toISOString(),
  };
}

/* --------------------------- 分项授权与上下文 --------------------------- */

export interface AiContextSources {
  snapshot?: AiScheduleSnapshot;
  notes?: Note[];
  tasks?: unknown[];
  exams?: unknown[];
}

export interface PermissionDescriptor {
  key: keyof AiPermissions;
  label: string;
  enabled: boolean;
  hint: string;
}

export function describePermissions(permissions: AiPermissions): PermissionDescriptor[] {
  return [
    {
      key: "schedule",
      label: "课表与学期",
      enabled: permissions.schedule,
      hint: "课程名、时间、教室、周次与下一节课",
    },
    {
      key: "notes",
      label: "笔记正文",
      enabled: permissions.notes,
      hint: "授权后 AI 可以阅读并摘录笔记内容",
    },
    {
      key: "noteTags",
      label: "笔记标题与标签",
      enabled: permissions.noteTags,
      hint: "只共享标题和标签，不包含正文",
    },
    {
      key: "tasks",
      label: "任务与 DDL",
      enabled: permissions.tasks,
      hint: "乙的任务模块接入后生效",
    },
    {
      key: "exams",
      label: "考试与成绩",
      enabled: permissions.exams,
      hint: "乙的考试模块接入后生效",
    },
  ];
}

export function buildAiContext(
  sources: AiContextSources,
  permissions: AiPermissions,
): string {
  const sections: string[] = [];
  const snapshot = sources.snapshot;
  if (permissions.schedule && snapshot) {
    const lines = [
      `学期：${snapshot.semesterName}（第 ${snapshot.week}/${snapshot.totalWeeks} 周）`,
      `课程：${snapshot.courses.length} 门`,
    ];
    const busyDays = snapshot.days.filter((day) => day.sessions.length > 0);
    for (const day of busyDays.slice(0, 14)) {
      lines.push(
        `${weekdayLabel(day.weekday)} ${day.date}（第 ${day.week} 周）：${day.sessions
          .map(
            (session) =>
              `${session.startTime || `第${session.startPeriod}节`}-${session.endTime || `第${session.endPeriod}节`} ${session.courseName}${session.location ? `@${session.location}` : ""}`,
          )
          .join("；")}`,
      );
    }
    if (snapshot.nextSession) {
      lines.push(
        `下一节：${snapshot.nextSession.courseName} ${snapshot.nextSession.date} ${snapshot.nextSession.startTime}-${snapshot.nextSession.endTime}${snapshot.nextSession.location ? ` @${snapshot.nextSession.location}` : ""}`,
      );
    }
    sections.push(`【课表】\n${lines.join("\n")}`);
  }

  if ((permissions.notes || permissions.noteTags) && sources.notes?.length) {
    const notes = sources.notes.slice(0, 20).map((note) => {
      const meta = note.tags.length > 0 ? ` [${note.tags.map((tag) => `#${tag}`).join(" ")}]` : "";
      if (permissions.notes) {
        return `- ${note.title}${meta}：${note.body.replace(/\s+/g, " ").slice(0, 500)}`;
      }
      return `- ${note.title}${meta}`;
    });
    sections.push(`【笔记】\n${notes.join("\n")}`);
  }

  if (permissions.tasks && sources.tasks?.length) {
    sections.push(`【任务】\n共 ${sources.tasks.length} 条（乙的任务模块接入后提供详情）`);
  }
  if (permissions.exams && sources.exams?.length) {
    sections.push(`【考试】\n共 ${sources.exams.length} 条（乙的考试模块接入后提供详情）`);
  }

  return sections.length > 0 ? sections.join("\n\n") : "（当前没有授权任何上下文）";
}

/* --------------------------- 聊天与提供方 --------------------------- */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  system?: string;
  snapshot?: AiScheduleSnapshot;
  notes?: Note[];
}

export interface AiCompletionResult {
  content: string;
  provider: string;
  error?: string;
}

function toneInstruction(tone: AiTone): string {
  if (tone === "concise") return "回答简洁，先给结论，不超过三句话。";
  if (tone === "playful") return "语气轻快一点，可以有一点点俏皮，但不要影响信息准确。";
  return "语气温和、清楚，像熟悉校园生活的朋友。";
}

export function buildSystemPrompt(
  settings: AiSettings,
  sources: AiContextSources,
): string {
  return [
    `你是「${settings.persona.name}」，一个住在课表里的 AI 助手。`,
    toneInstruction(settings.persona.tone),
    "只依据下面授权上下文中的事实回答；没有数据就直说没有，不要编造课程、时间或老师。",
    settings.persona.customPrompt ? `用户的人格补充：${settings.persona.customPrompt}` : "",
    "以下是用户本次授权的上下文：",
    buildAiContext(sources, settings.permissions),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function stripQuestionWords(value: string): string {
  return value
    .replace(/我的|请|帮我|找一下|有没有|关于|什么|哪些|相关|笔记|资料|复习/g, " ")
    .replace(/[？?！!，,。.]/g, " ")
    .trim();
}

function answerNotesQuestion(
  question: string,
  notes: Note[],
  includeBody: boolean,
): string | null {
  if (!/笔记|资料|复习|学过|记录/.test(question)) return null;
  const keyword = stripQuestionWords(question);
  const hits = keyword
    ? searchNotes(notes, keyword, { limit: 5 })
    : notes
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5)
        .map((note) => ({ note, excerpt: note.body.replace(/\s+/g, " ").slice(0, 60) }));
  if (hits.length === 0) return "没有找到相关笔记。换一个关键词，或者先去笔记页记一条。";
  return `找到 ${hits.length} 条相关笔记：\n${hits
    .map(
      (hit) =>
        `· ${hit.note.title}${hit.note.tags.length ? `（${hit.note.tags.map((tag) => `#${tag}`).join(" ")}）` : ""}${includeBody && hit.excerpt ? `：${hit.excerpt}` : ""}`,
    )
    .join("\n")}`;
}

function localFallback(settings: AiSettings): string {
  const name = settings.persona.name;
  const intro =
    settings.persona.tone === "playful"
      ? `${name}在这里。这个问题我还答不上来，但课表里的问题我比较拿手。`
      : settings.persona.tone === "concise"
        ? "这个问题暂时答不上来。可以问我课表相关的问题。"
        : `这个问题我还答不上来，不过课表相关的问题可以问我。`;
  return `${intro}\n试试：「今天有什么课」「明天几点有课」「下一节是什么」「高数在哪上」「第 8 周有几节课」。`;
}

async function completeRemote(
  request: AiCompletionRequest,
  settings: AiSettings,
  fetchImpl: FetchLike,
): Promise<AiCompletionResult> {
  if (!settings.apiKey.trim()) {
    return {
      content: "还没有填写 API Key。可以继续用「本地规则」模式查课，或在设置里填入兼容 OpenAI 的服务。",
      provider: "openai-compatible",
      error: "missing-api-key",
    };
  }
  const system = buildSystemPrompt(settings, {
    snapshot: request.snapshot,
    notes: request.notes,
  });
  const messages = [
    { role: "system", content: request.system ? `${request.system}\n\n${system}` : system },
    ...request.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-20)
      .map((message) => ({ role: message.role, content: message.content })),
  ];
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = setTimeout(() => controller?.abort(), 30_000);
  try {
    const response = await fetchImpl(
      `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          temperature: 0.6,
          max_tokens: 600,
        }),
        ...(controller ? { signal: controller.signal } : {}),
      },
    );
    const raw = await response.text();
    if (!response.ok) {
      return {
        content: `AI 服务返回 ${response.status}。请检查 Base URL、模型名和 API Key。`,
        provider: "openai-compatible",
        error: `http-${response.status}`,
      };
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        content: "AI 服务返回了无法解析的内容，请检查 Base URL 是否指向兼容 OpenAI 的接口。",
        provider: "openai-compatible",
        error: "bad-json",
      };
    }
    const content =
      isRecord(parsed) &&
      Array.isArray(parsed.choices) &&
      isRecord(parsed.choices[0]) &&
      isRecord(parsed.choices[0].message) &&
      typeof parsed.choices[0].message.content === "string"
        ? parsed.choices[0].message.content
        : "";
    if (!content) {
      return {
        content: "AI 服务没有返回内容，请稍后再试。",
        provider: "openai-compatible",
        error: "empty-content",
      };
    }
    return { content, provider: "openai-compatible" };
  } catch {
    return {
      content: "网络请求失败，请检查 Base URL、网络连接，或稍后再试。",
      provider: "openai-compatible",
      error: "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function complete(
  request: AiCompletionRequest,
  settings: AiSettings = loadAiSettings(),
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  now = new Date(),
): Promise<AiCompletionResult> {
  if (settings.provider === "openai-compatible") {
    return completeRemote(request, settings, fetchImpl);
  }

  const lastUser = [...request.messages].reverse().find((message) => message.role === "user");
  const question = lastUser?.content.trim() ?? "";
  if (!question) {
    return { content: localFallback(settings), provider: "local" };
  }
  if (settings.permissions.schedule && request.snapshot) {
    const answer = answerScheduleQuestion(question, request.snapshot, now);
    if (answer.intent !== "unknown") {
      return { content: answer.text, provider: "local" };
    }
  }
  if (settings.permissions.notes && request.notes?.length) {
    const noteAnswer = answerNotesQuestion(question, request.notes, true);
    if (noteAnswer) return { content: noteAnswer, provider: "local" };
  } else if (settings.permissions.noteTags && request.notes?.length) {
    const noteAnswer = answerNotesQuestion(question, request.notes, false);
    if (noteAnswer) return { content: noteAnswer, provider: "local" };
  }
  if (/^(你好|嗨|hello|hi|在吗)[!！。.?\s]*$/i.test(question)) {
    return {
      content:
        settings.persona.tone === "playful"
          ? `嗨，我是${settings.persona.name}，在课表里等你。今天想先看哪节课？`
          : `你好，我是${settings.persona.name}。可以问我今天的课、下一节在哪，或者让我找找笔记。`,
      provider: "local",
    };
  }
  if (/你是谁|介绍一下|能做什么/.test(question)) {
    return {
      content:
        `我是${settings.persona.name}，本地课表助手。不联网也能回答今天/明天/周几的课、下一节、课程地点和数量；开启笔记授权后还能帮你找笔记。换到 OpenAI 兼容模式后可以自由聊天。`,
      provider: "local",
    };
  }
  if (/谢谢|感谢|thanks/i.test(question)) {
    return { content: "不客气，课上顺利。", provider: "local" };
  }
  if (/授权|隐私|权限/.test(question)) {
    return {
      content:
        "AI 只会读取你逐项开启的数据：课表默认开启，笔记正文与标签默认关闭。所有设置和密钥都只保存在这台设备上，可随时关闭。",
      provider: "local",
    };
  }
  return { content: localFallback(settings), provider: "local" };
}

/**
 * 给甲（F114 识课）与丙（F116 选课建议）的便捷入口。
 * 默认读取本机 AI 设置，只返回文本，不抛出网络错误。
 */
export async function aiComplete(
  prompt: string,
  context: Omit<AiCompletionRequest, "messages"> = {},
  settings: AiSettings = loadAiSettings(),
): Promise<string> {
  const result = await complete(
    {
      ...context,
      messages: [createChatMessage("user", prompt)],
    },
    settings,
  );
  return result.content;
}

export const AI_NOTE_LIMIT = MAX_NOTES;
