import type { Course, Period, ScheduleData } from "../types";
import { dateKey, getDefaultStartDate, parseDateKey } from "./date";
import {
  MAX_PERIODS,
  MIN_PERIODS,
  createBlankSchedule,
  createPeriods,
  makeCourse,
  makeSlot,
  nextTone,
  uid,
} from "./factory";

export type ThirdPartySource = "wakeup" | "starlink";

export interface ThirdPartyShareCode {
  source: ThirdPartySource;
  code: string;
}

export interface ThirdPartyImportResult {
  source: ThirdPartySource;
  data: ScheduleData;
  name: string;
  startDate: string;
  courseCount: number;
  slotCount: number;
  message: string;
}

interface TimeSlotSeed {
  index: number;
  start: string;
  end: string;
}

interface RawEntry {
  name: string;
  teacher: string;
  location: string;
  day: number;
  start: number;
  end: number;
  weeks: number[];
}

interface CollectedSchedule {
  source: ThirdPartySource;
  name: string;
  startDate: string;
  timeSlots: TimeSlotSeed[];
  entries: RawEntry[];
}

const MAX_WEEK = 60;
const DEFAULT_WEEKS = 20;

export function thirdPartyLabel(source: ThirdPartySource): string {
  return source === "wakeup" ? "WakeUp" : "星链";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 80): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseClock(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function clockFromParts(item: Record<string, unknown>, prefix: "start" | "end"): string | null {
  const hour = item[`${prefix}Hour`];
  const minute = item[`${prefix}Minute`];
  if (hour === undefined || minute === undefined) return null;
  const h = integer(hour);
  const m = integer(minute);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

function toTimeSlot(value: unknown): TimeSlotSeed | null {
  if (!isRecord(value)) return null;
  const index = integer(value.node ?? value.number ?? value.section);
  const start =
    parseClock(value.startTime) ??
    clockFromParts(value, "start") ??
    parseClock(value.start);
  const end =
    parseClock(value.endTime) ??
    clockFromParts(value, "end") ??
    parseClock(value.end);
  if (index < 1 || index > MAX_PERIODS || !start || !end) return null;
  return { index, start, end };
}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Turn every JSON object/array in the pasted text into a candidate. WakeUp
 * online responses wrap a multi-line payload in `data`, so strings are decoded
 * recursively as well.
 */
function collectFragments(input: string): unknown[] {
  const fragments: unknown[] = [];
  const seenObjects = new Set<object>();
  const seenTexts = new Set<string>();

  const visitText = (raw: string, depth: number) => {
    if (depth > 6) return;
    let value = raw.trim().replace(/^\uFEFF/, "");
    if (!value) return;
    if (seenTexts.has(value)) return;
    seenTexts.add(value);

    const parsed = tryJson(value);
    if (parsed !== undefined) {
      visitValue(parsed, depth + 1);
      return;
    }

    if (value.includes("\\n") || value.includes('\\"')) {
      const decoded = value
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"');
      if (decoded !== value) {
        visitText(decoded, depth + 1);
        return;
      }
    }

    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      for (const line of lines) visitText(line, depth + 1);
    }
  };

  const visitValue = (value: unknown, depth: number) => {
    if (depth > 6) return;
    if (typeof value === "string") {
      visitText(value, depth + 1);
      return;
    }
    if (Array.isArray(value)) {
      if (seenObjects.has(value)) return;
      seenObjects.add(value);
      fragments.push(value);
      return;
    }
    if (!isRecord(value)) return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    fragments.push(value);
    for (const key of [
      "data",
      "payload",
      "schedule",
      "tableInfo",
      "courseList",
      "courses",
      "timeList",
      "timeSlots",
      "courseInfos",
      "courseDetails",
      "timeTable",
    ]) {
      const nested = value[key];
      if (nested !== undefined) visitValue(nested, depth + 1);
    }
  };

  visitText(input, 0);
  return fragments;
}

function weekType(value: unknown): "all" | "odd" | "even" {
  if (value === 1 || value === "1") return "odd";
  if (value === 2 || value === "2") return "even";
  const label = String(value ?? "");
  if (/单/.test(label)) return "odd";
  if (/双/.test(label)) return "even";
  return "all";
}

function weeksFromValue(value: unknown): number[] {
  const weeks: number[] = [];
  const add = (number: number) => {
    if (number >= 1 && number <= MAX_WEEK && !weeks.includes(number)) weeks.push(number);
  };
  const addPart = (part: string) => {
    const cleaned = part.replace(/周/g, "").trim();
    const range = /^(\d{1,2})\s*[-–~至]\s*(\d{1,2})$/.exec(cleaned);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (let week = Math.min(from, to); week <= Math.max(from, to); week += 1) add(week);
      return;
    }
    const single = /^\d{1,2}$/.exec(cleaned);
    if (single) add(Number(single[0]));
  };

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "number" || typeof item === "string") addPart(String(item));
    }
  } else if (typeof value === "string") {
    for (const part of value.split(/[,，、;；\s]+/)) addPart(part);
  } else if (typeof value === "number") {
    add(value);
  }

  return weeks.sort((a, b) => a - b);
}

function weeksFromRange(start: number, end: number, type: unknown = "all"): number[] {
  const from = Math.min(MAX_WEEK, Math.max(1, start || 1));
  const to = Math.min(MAX_WEEK, Math.max(from, end || from));
  const pattern = weekType(type);
  const weeks: number[] = [];
  for (let week = from; week <= to; week += 1) {
    if (pattern === "odd" && week % 2 === 0) continue;
    if (pattern === "even" && week % 2 === 1) continue;
    weeks.push(week);
  }
  return weeks;
}

function entryWeeks(item: Record<string, unknown>): number[] {
  const explicit =
    weeksFromValue(item.stepWeekList).length > 0
      ? weeksFromValue(item.stepWeekList)
      : weeksFromValue(item.weeks);
  if (explicit.length > 0) return explicit;
  return weeksFromRange(
    integer(item.startWeek) || 1,
    integer(item.endWeek) || DEFAULT_WEEKS,
    item.type,
  );
}

function wakeupEntry(
  item: Record<string, unknown>,
  info?: Record<string, unknown>,
): RawEntry | null {
  if (item.ownTime === true) return null;
  const name = text(item.courseName) || text(item.name) || text(info?.courseName);
  const day = integer(item.day);
  const start = integer(item.startNode ?? item.startSection);
  if (!name || day < 1 || day > 7 || start < 1) return null;
  const step = Math.max(1, integer(item.step));
  const end = integer(item.endNode ?? item.endSection) || start + step - 1;
  return {
    name,
    teacher: text(item.teacher) || text(info?.teacher),
    location: text(item.room) || text(item.location) || text(info?.room),
    day,
    start,
    end: Math.max(start, end),
    weeks: entryWeeks(item),
  };
}

function starlinkEntry(item: Record<string, unknown>): RawEntry | null {
  const name = text(item.name) || text(item.courseName);
  const day = integer(item.weekday);
  const start = integer(item.startSection);
  if (!name || day < 1 || day > 7 || start < 1) return null;
  const end = integer(item.endSection) || start;
  return {
    name,
    teacher: text(item.teacher),
    location: text(item.position) || text(item.location) || text(item.room),
    day,
    start,
    end: Math.max(start, end),
    weeks: entryWeeks(item),
  };
}

function collectSchedule(fragments: unknown[]): CollectedSchedule | null {
  const timeSlots: TimeSlotSeed[] = [];
  const starlinkCourses: Array<Record<string, unknown>> = [];
  const wakeupCourses: Array<Record<string, unknown>> = [];
  const wakeupDetails: Array<Record<string, unknown>> = [];
  const wakeupInfos: Array<Record<string, unknown>> = [];
  let tableName = "";
  let fallbackName = "";
  let startDate = "";

  for (const fragment of fragments) {
    if (isRecord(fragment)) {
      if (!startDate) {
        startDate =
          text(fragment.startDate, 10) ||
          (isRecord(fragment.tableInfo) ? text(fragment.tableInfo.startDate, 10) : "");
      }
      if (!tableName) {
        tableName =
          text(fragment.tableName) ||
          (isRecord(fragment.tableInfo) ? text(fragment.tableInfo.tableName) : "");
      }
      if (!fallbackName) fallbackName = text(fragment.name);
      continue;
    }
    if (!Array.isArray(fragment) || fragment.length === 0) continue;
    const records = fragment.filter(isRecord);
    if (records.length === 0) continue;

    const slots = records.map(toTimeSlot).filter((slot): slot is TimeSlotSeed => slot !== null);
    if (slots.length > 0 && slots.length === records.length) {
      for (const slot of slots) {
        if (!timeSlots.some((item) => item.index === slot.index)) timeSlots.push(slot);
      }
      continue;
    }

    if (records.some((item) => item.weekday !== undefined && item.startSection !== undefined)) {
      starlinkCourses.push(...records);
      continue;
    }
    if (records.some((item) => item.day !== undefined && item.startNode !== undefined)) {
      if (records.some((item) => item.courseName !== undefined || item.name !== undefined)) {
        wakeupCourses.push(...records);
      } else {
        wakeupDetails.push(...records);
      }
      continue;
    }
    if (records.some((item) => item.courseName !== undefined || item.name !== undefined)) {
      wakeupInfos.push(...records);
    }
  }

  const entries: RawEntry[] = [];
  let source: ThirdPartySource;
  if (starlinkCourses.length > 0) {
    source = "starlink";
    for (const item of starlinkCourses) {
      const entry = starlinkEntry(item);
      if (entry) entries.push(entry);
    }
  } else if (wakeupCourses.length > 0) {
    source = "wakeup";
    for (const item of wakeupCourses) {
      const entry = wakeupEntry(item);
      if (entry) entries.push(entry);
    }
  } else if (wakeupDetails.length > 0) {
    source = "wakeup";
    const byId = new Map<string, Record<string, unknown>>();
    for (const info of wakeupInfos) {
      const id = info.id;
      if (id !== undefined) byId.set(String(id), info);
    }
    for (const detail of wakeupDetails) {
      const info = byId.get(String(detail.id));
      const entry = wakeupEntry(detail, info);
      if (entry) entries.push(entry);
    }
  } else {
    return null;
  }

  if (entries.length === 0) return null;
  return {
    source,
    name: tableName || fallbackName,
    startDate,
    timeSlots: timeSlots.sort((a, b) => a.index - b.index),
    entries,
  };
}

function normalizeStartDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return getDefaultStartDate();
  const date = parseDateKey(value);
  return dateKey(date) === value ? value : getDefaultStartDate();
}

function buildPeriods(timeSlots: TimeSlotSeed[]): Period[] {
  if (timeSlots.length === 0) return [];
  const maxIndex = Math.max(MIN_PERIODS, ...timeSlots.map((slot) => slot.index));
  const count = Math.min(MAX_PERIODS, maxIndex);
  const periods = createPeriods(count);
  for (const slot of timeSlots) {
    if (slot.index > count) continue;
    periods[slot.index - 1] = {
      index: slot.index,
      start: slot.start,
      end: slot.end,
    };
  }
  return periods;
}

function weeksKey(weeks: number[]): string {
  return weeks.join(",");
}

function mergeEntries(entries: RawEntry[]): RawEntry[] {
  const sorted = [...entries].sort(
    (a, b) =>
      `${a.name}|${a.teacher}|${a.location}`.localeCompare(
        `${b.name}|${b.teacher}|${b.location}`,
        "zh",
      ) ||
      a.day - b.day ||
      a.start - b.start ||
      a.end - b.end,
  );
  const merged: RawEntry[] = [];
  for (const entry of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.name === entry.name &&
      last.teacher === entry.teacher &&
      last.location === entry.location &&
      last.day === entry.day &&
      weeksKey(last.weeks) === weeksKey(entry.weeks) &&
      entry.start <= last.end + 1
    ) {
      last.end = Math.max(last.end, entry.end);
      continue;
    }
    merged.push({ ...entry, weeks: [...entry.weeks] });
  }
  return merged;
}

function buildSchedule(collected: CollectedSchedule): ThirdPartyImportResult | null {
  const periods = buildPeriods(collected.timeSlots);
  const periodCount = periods.length || createPeriods().length;
  const entries = mergeEntries(
    collected.entries
      .filter((entry) => entry.start >= 1 && entry.start <= periodCount)
      .map((entry) => ({
        ...entry,
        end: Math.min(Math.max(entry.end, entry.start), periodCount),
        weeks: entry.weeks.length > 0 ? entry.weeks : weeksFromRange(1, DEFAULT_WEEKS),
      })),
  );
  if (entries.length === 0) return null;

  const weeks = entries.flatMap((entry) => entry.weeks);
  const totalWeeks = Math.min(MAX_WEEK, Math.max(DEFAULT_WEEKS, ...weeks));
  const startDate = normalizeStartDate(collected.startDate);
  const label = thirdPartyLabel(collected.source);
  const name = collected.name || `${label} 导入`;

  const data = createBlankSchedule(new Date());
  const timetable = data.timetables[0];
  timetable.name = name;
  timetable.semester.name = name;
  timetable.semester.startDate = startDate;
  timetable.semester.totalWeeks = totalWeeks;

  if (periods.length > 0) {
    timetable.semester.periods = periods.map((period) => ({ ...period }));
    const profile = {
      id: uid("profile"),
      name: `${label}作息`,
      periods: periods.map((period) => ({ ...period })),
    };
    data.periodProfiles.push(profile);
    timetable.periodProfileId = profile.id;
    timetable.periodRules = [
      { id: uid("period-rule"), from: startDate.slice(5), profileId: profile.id },
    ];
  }

  const groups = new Map<
    string,
    { name: string; teacher: string; location: string; slots: ReturnType<typeof makeSlot>[] }
  >();
  for (const entry of entries) {
    const key = `${entry.name}|${entry.teacher}|${entry.location}`;
    const group = groups.get(key) ?? {
      name: entry.name,
      teacher: entry.teacher,
      location: entry.location,
      slots: [],
    };
    group.slots.push(
      makeSlot(
        {
          day: entry.day,
          start: entry.start,
          end: entry.end,
          weekStart: entry.weeks[0],
          weekEnd: entry.weeks[entry.weeks.length - 1],
          pattern: "all",
          weeks: entry.weeks,
        },
        totalWeeks,
      ),
    );
    groups.set(key, group);
  }

  const courses: Course[] = [];
  for (const group of groups.values()) {
    courses.push(
      makeCourse({
        name: group.name,
        teacher: group.teacher,
        location: group.location,
        tone: nextTone(courses),
        slots: group.slots,
      }),
    );
  }
  timetable.courses = courses;

  const slotCount = courses.reduce((total, course) => total + course.slots.length, 0);
  return {
    source: collected.source,
    data,
    name,
    startDate,
    courseCount: courses.length,
    slotCount,
    message: `已读取 ${label}「${name}」：${courses.length} 门课程、${slotCount} 个时间段，开学日期 ${startDate}。`,
  };
}

/**
 * Parse a WakeUp share payload / backup file or a Starlink exported JSON.
 * Returns null when the text does not contain a recognizable timetable.
 */
export function parseThirdPartySchedule(input: string): ThirdPartyImportResult | null {
  if (!input.trim()) return null;
  const collected = collectSchedule(collectFragments(input));
  return collected ? buildSchedule(collected) : null;
}

export function detectThirdPartyShare(input: string): ThirdPartyShareCode | null {
  const value = input.trim();
  if (!value || value.startsWith("{") || value.startsWith("[")) return null;

  const wakeup =
    /分享口令为[「"'"]?([a-fA-F0-9]{32})[」"'"]?/.exec(value) ??
    /口令[：:]\s*[「"'"]?([a-fA-F0-9]{32})[」"'"]?/.exec(value) ??
    /[「"']([a-fA-F0-9]{32})[」"']/.exec(value) ??
    (/^[a-fA-F0-9]{32}$/.test(value) ? [value, value] : null);
  if (wakeup) return { source: "wakeup", code: wakeup[1] };

  if (value.includes("星链课表") || /starlink/i.test(value)) {
    const match =
      /输入[：:]\s*([A-Za-z0-9_-]{5,20})/.exec(value) ??
      /分享码[为：:]\s*([A-Za-z0-9_-]{5,20})/.exec(value) ??
      /[「"']([A-Za-z0-9_-]{5,20})[」"']/.exec(value);
    if (match) return { source: "starlink", code: match[1] };
  }

  if (/^[A-Za-z0-9_-]{6,20}$/.test(value)) {
    return { source: "starlink", code: value };
  }
  return null;
}

function apiErrorMessage(status: number, data: unknown): Error {
  if (isRecord(data) && typeof data.message === "string" && data.message.trim()) {
    return new Error(data.message.trim());
  }
  return new Error(`接口返回 ${status}`);
}

async function requestJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url,
      headers,
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    if (response.status < 200 || response.status >= 300) {
      throw apiErrorMessage(response.status, response.data);
    }
    if (typeof response.data === "string") {
      const parsed = tryJson(response.data);
      return parsed === undefined ? response.data : parsed;
    }
    return response.data;
  }

  const response = await fetch(url);
  const raw = await response.text();
  const parsed = tryJson(raw);
  if (!response.ok) throw apiErrorMessage(response.status, parsed);
  return parsed === undefined ? raw : parsed;
}

/**
 * Download a share code from the provider. WakeUp does not send CORS headers,
 * so its online lookup is only available inside the native app; the web build
 * should import a `.wakeup_schedule` backup instead.
 */
export async function fetchThirdPartyShare(share: ThirdPartyShareCode): Promise<string> {
  if (share.source === "starlink") {
    const payload = await requestJson(
      `https://api.starlinkkb.cn/share/curriculum/${encodeURIComponent(share.code)}`,
    );
    return JSON.stringify(payload);
  }

  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) {
    throw new Error(
      "WakeUp 接口没有开放浏览器跨域访问。请改用 .wakeup_schedule 备份文件导入，或在 Android App 内直接使用分享口令。",
    );
  }
  const payload = await requestJson(
    `https://i.wakeup.fun/share_schedule/get?key=${encodeURIComponent(share.code)}`,
    { "User-Agent": "okhttp/4.12.0" },
  );
  if (!isRecord(payload)) throw new Error("WakeUp 接口没有返回有效数据。");
  if (payload.status === 5000004 || String(payload.message ?? "").includes("版本过低")) {
    throw new Error(
      "WakeUp 服务器提示当前版本过低。请用旧版 6.0.23 重新生成口令，或改用备份文件导入。",
    );
  }
  if (payload.status !== 1 || payload.data === undefined) {
    throw new Error(
      String(payload.message ?? "") || "分享口令无效或已过期，请重新生成后再试。",
    );
  }
  return typeof payload.data === "string" ? payload.data : JSON.stringify(payload.data);
}
