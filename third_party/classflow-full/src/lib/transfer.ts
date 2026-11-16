import type { ScheduleData, Timetable } from "../types";
import { dateKey, getDateForSlot, parseDateKey, timeToMinutes } from "./date";
import { isHolidayDate } from "./holidays";
import { isSlotActiveInWeek } from "./schedule";
import { periodsForDate } from "./periods";
import { normalizeSchedule } from "./storage";
import { createBlankSchedule, makeCourse, makeEvent, makeSlot, nextTone } from "./factory";
import { parseCourseText } from "./textImport";
import type { ParsedCourseSeed } from "./textImport";
import { deliverTextFile, type ExportResult, type FileDelivery } from "./nativeFile";

interface ExportEnvelope {
  app: "kexu";
  version: 2;
  exportedAt: string;
  data: ScheduleData;
}

export function exportEnvelope(data: ScheduleData): ExportEnvelope {
  return {
    app: "kexu",
    version: 2,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "课序";
}

function activeTimetable(data: ScheduleData): Timetable {
  return (
    data.timetables.find((timetable) => timetable.id === data.activeTimetableId) ??
    data.timetables[0]
  );
}

export async function downloadScheduleJson(data: ScheduleData): Promise<ExportResult> {
  const active = activeTimetable(data);
  const filename = `课序-${sanitizeFilename(active.semester.name)}-${dateKey(new Date())}.json`;
  const delivery = await deliverTextFile(
    filename,
    JSON.stringify(exportEnvelope(data), null, 2),
    "application/json;charset=utf-8",
  );
  return { filename, delivery };
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function icsLocalDate(date: Date, time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(
    hours,
  )}${pad(minutes)}00`;
}

function icsDateOnly(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function icsStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate(),
  )}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let result = "";
  let current = "";
  for (const char of line) {
    const next = current + char;
    if (encoder.encode(next).length > 72) {
      result += `${current}\r\n `;
      current = char;
    } else {
      current = next;
    }
  }
  return result + current;
}

export function buildIcs(
  data: ScheduleData,
  autoHolidays = true,
): { content: string; count: number } {
  const active = activeTimetable(data);
  const { semester, courses, events } = active;
  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClassFlow//Kexu 2.0//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(`${active.name}·${semester.name}`)}`,
  ];
  let count = 0;

  for (const course of courses) {
    for (const slot of course.slots) {
      for (let week = slot.weekStart; week <= slot.weekEnd; week += 1) {
        if (!isSlotActiveInWeek(slot, week)) continue;
        const date = getDateForSlot(semester.startDate, week, slot.day);
        const periods = periodsForDate(active, data.periodProfiles, date);
        const periodStart = periods[slot.start - 1];
        const periodEnd = periods[slot.end - 1];
        if (!periodStart || !periodEnd) continue;
        if (autoHolidays && isHolidayDate(date)) continue;
        const description = [
          course.name,
          course.teacher ? `教师：${course.teacher}` : "",
          course.location ? `地点：${course.location}` : "",
          `第 ${week} 周 · 第 ${slot.start}${
            slot.end !== slot.start ? `–${slot.end}` : ""
          } 节`,
          course.note,
        ]
          .filter(Boolean)
          .join("\n");
        lines.push(
          "BEGIN:VEVENT",
          foldLine(`UID:${course.id}-${slot.id}-${week}@classflow`),
          `DTSTAMP:${icsStamp(now)}`,
          foldLine(`DTSTART:${icsLocalDate(date, periodStart.start)}`),
          foldLine(`DTEND:${icsLocalDate(date, periodEnd.end)}`),
          foldLine(`SUMMARY:${icsEscape(course.name)}`),
          foldLine(`LOCATION:${icsEscape(course.location)}`),
          foldLine(`DESCRIPTION:${icsEscape(description)}`),
          "END:VEVENT",
        );
        count += 1;
      }
    }
  }

  for (const event of events) {
    const date = parseDateKey(event.date);
    const description = [event.title, event.allDay ? "全天日程" : "日程", event.note]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${event.id}@classflow-event`),
      `DTSTAMP:${icsStamp(now)}`,
      event.allDay
        ? `DTSTART;VALUE=DATE:${icsDateOnly(date)}`
        : foldLine(`DTSTART:${icsLocalDate(date, event.start)}`),
      event.allDay
        ? `DTEND;VALUE=DATE:${icsDateOnly(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1))}`
        : foldLine(`DTEND:${icsLocalDate(date, event.end)}`),
      foldLine(`SUMMARY:${icsEscape(event.title)}`),
      foldLine(`DESCRIPTION:${icsEscape(description)}`),
      "END:VEVENT",
    );
    count += 1;
  }

  lines.push("END:VCALENDAR");
  return { content: `${lines.join("\r\n")}\r\n`, count };
}

export async function downloadScheduleIcs(
  data: ScheduleData,
  autoHolidays = true,
): Promise<ExportResult & { count: number }> {
  const active = activeTimetable(data);
  const { content, count } = buildIcs(data, autoHolidays);
  const filename = `课序-${sanitizeFilename(active.semester.name)}.ics`;
  const delivery: FileDelivery = await deliverTextFile(
    filename,
    content,
    "text/calendar;charset=utf-8",
  );
  return { count, filename, delivery };
}

export interface IcsEventSeed {
  title: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  note: string;
}

function icsUnescape(value: string): string {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\([,;\\])/g, "$1")
    .trim();
}

function parseIcsMoment(
  raw: string | undefined,
): { date: string; time: string | null; allDay: boolean } | null {
  if (!raw) return null;
  const value = raw.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null, allDay: true };
  }
  const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!full) return null;
  if (full[7]) {
    const utc = new Date(
      Date.UTC(
        Number(full[1]),
        Number(full[2]) - 1,
        Number(full[3]),
        Number(full[4]),
        Number(full[5]),
        Number(full[6] ?? 0),
      ),
    );
    return {
      date: dateKey(utc),
      time: `${pad(utc.getHours())}:${pad(utc.getMinutes())}`,
      allDay: false,
    };
  }
  return {
    date: `${full[1]}-${full[2]}-${full[3]}`,
    time: `${full[4]}:${full[5]}`,
    allDay: false,
  };
}

function addMinutesToTime(time: string, minutes: number): string {
  const total = Math.min(23 * 60 + 59, timeToMinutes(time) + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function shiftDate(date: string, days: number): string {
  const parsed = parseDateKey(date);
  const shifted = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate() + days,
    12,
    0,
    0,
  );
  return dateKey(shifted);
}

function expandWeeklyOccurrences(start: string, rrule: string | undefined): string[] {
  if (!rrule) return [start];
  const parts = new Map(
    rrule
      .split(";")
      .map((part) => part.split("="))
      .filter((pair) => pair.length === 2)
      .map(([key, value]) => [key.trim().toUpperCase(), value.trim()]),
  );
  if (parts.get("FREQ") !== "WEEKLY") return [start];
  const interval = Math.max(1, Number(parts.get("INTERVAL") ?? 1));
  const count = parts.has("COUNT") ? Math.max(1, Number(parts.get("COUNT"))) : 0;
  const until = parts.get("UNTIL");
  const untilDate = until ? parseIcsMoment(until)?.date : null;
  const dates = [start];
  for (let index = 1; index < 60; index += 1) {
    const next = shiftDate(start, index * 7 * interval);
    if (count > 0 && index >= count) break;
    if (untilDate && next > untilDate) break;
    dates.push(next);
  }
  return dates;
}

export function parseIcsEvents(content: string): IcsEventSeed[] {
  const unfolded = content.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const seeds: IcsEventSeed[] = [];
  const seen = new Set<string>();
  let current: Record<string, string> | null = null;

  const emit = (props: Record<string, string>) => {
    const start = parseIcsMoment(props.DTSTART);
    if (!start) return;
    const end = parseIcsMoment(props.DTEND);
    const title = icsUnescape(props.SUMMARY ?? "") || "未命名日程";
    const note = [
      props.LOCATION ? `地点：${icsUnescape(props.LOCATION)}` : "",
      icsUnescape(props.DESCRIPTION ?? ""),
    ]
      .filter(Boolean)
      .join("\n");
    const endTime =
      start.allDay || !end?.time
        ? start.allDay
          ? "23:59"
          : addMinutesToTime(start.time ?? "09:00", 60)
        : end.time;
    for (const date of expandWeeklyOccurrences(start.date, props.RRULE)) {
      const key = `${title}|${date}|${start.time ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({
        title,
        date,
        allDay: start.allDay,
        start: start.time ?? "09:00",
        end: endTime,
        note,
      });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^BEGIN:VEVENT$/i.test(trimmed)) {
      current = {};
      continue;
    }
    if (/^END:VEVENT$/i.test(trimmed)) {
      if (current) emit(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const name = trimmed.slice(0, colon).split(";")[0].toUpperCase();
    current[name] = trimmed.slice(colon + 1);
  }
  return seeds;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

const CSV_HEADERS: Record<string, string[]> = {
  name: ["课程名", "课程", "名称", "科目", "name", "course"],
  day: ["星期", "周几", "星期几", "上课日", "day", "weekday"],
  start: ["开始节", "起始节", "开始", "start", "节次起"],
  end: ["结束节", "结束", "end", "节次止"],
  weekStart: ["开始周", "起始周", "开始周次", "weekstart"],
  weekEnd: ["结束周", "结束周次", "weekend"],
  location: ["教室", "地点", "location", "room", "place"],
  teacher: ["老师", "教师", "teacher"],
  pattern: ["单双周", "单双", "周次类型", "pattern"],
};

function headerField(cell: string): string | null {
  const normalized = cell.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) return null;
  for (const [field, aliases] of Object.entries(CSV_HEADERS)) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

function parseDayCells(value: string): number[] {
  const map: Record<string, number> = {
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
  const days: number[] = [];
  for (const match of value.matchAll(/(?:周|星期)?\s*([一二三四五六日天1-7])/g)) {
    const day = map[match[1]];
    if (day && !days.includes(day)) days.push(day);
  }
  return days;
}

export function parseCsvCourses(content: string): ParsedCourseSeed[] {
  const cleaned = content.replace(/^\uFEFF/, "");
  const rows = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) return [];
  const delimiter = rows[0].includes("\t")
    ? "\t"
    : rows[0].split(";").length > rows[0].split(",").length
      ? ";"
      : ",";
  const cells = rows.map((row) => splitDelimitedLine(row, delimiter));
  const fields = cells[0].map(headerField);
  const hasHeader = fields.filter(Boolean).length >= 3;
  const order = hasHeader
    ? fields
    : ["name", "day", "start", "end", "weekStart", "weekEnd", "location", "teacher"];
  const dataRows = hasHeader ? cells.slice(1) : cells;
  const byName = new Map<string, ParsedCourseSeed>();

  for (const row of dataRows) {
    const value = (field: string): string => {
      const index = order.indexOf(field);
      return index >= 0 ? (row[index] ?? "").trim() : "";
    };
    const name = value("name");
    const days = parseDayCells(value("day"));
    const start = Number(value("start"));
    const end = Number(value("end")) || start;
    if (!name || days.length === 0 || !Number.isFinite(start) || start < 1) continue;
    const weekStart = Number(value("weekStart")) || 1;
    const weekEnd = Number(value("weekEnd")) || 20;
    const patternCell = value("pattern");
    const pattern = /单/.test(patternCell) ? "odd" : /双/.test(patternCell) ? "even" : "all";
    const teacher = value("teacher");
    const key = `${name}|${teacher}`;
    const seed = byName.get(key) ?? {
      name,
      teacher,
      location: value("location"),
      slots: [],
    };
    if (!seed.location) seed.location = value("location");
    for (const day of days) {
      const duplicate = seed.slots.some(
        (slot) =>
          slot.day === day &&
          slot.start === Math.min(start, end) &&
          slot.end === Math.max(start, end),
      );
      if (duplicate) continue;
      seed.slots.push({
        day,
        start: Math.min(start, end),
        end: Math.max(start, end),
        weekStart: Math.max(1, Math.min(weekStart, weekEnd)),
        weekEnd: Math.max(weekStart, weekEnd),
        pattern,
      });
    }
    byName.set(key, seed);
  }
  return [...byName.values()];
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function scheduleFromCourses(seeds: ParsedCourseSeed[], name: string): ScheduleData {
  const data = createBlankSchedule(new Date());
  const timetable = data.timetables[0];
  if (name) {
    timetable.name = name;
    timetable.semester.name = name;
  }
  const totalWeeks = timetable.semester.totalWeeks;
  const maxPeriod = timetable.semester.periods.length;
  for (const seed of seeds) {
    timetable.courses.push(
      makeCourse({
        name: seed.name,
        teacher: seed.teacher,
        location: seed.location,
        tone: nextTone(timetable.courses),
        slots: seed.slots.map((slot) =>
          makeSlot(
            {
              day: Math.min(Math.max(slot.day, 1), 7),
              start: Math.min(Math.max(slot.start, 1), maxPeriod),
              end: Math.min(Math.max(slot.end, slot.start), maxPeriod),
              weekStart: Math.min(Math.max(slot.weekStart, 1), totalWeeks),
              weekEnd: Math.min(Math.max(slot.weekEnd, slot.weekStart), totalWeeks),
              pattern: slot.pattern,
            },
            totalWeeks,
          ),
        ),
      }),
    );
  }
  return data;
}

function scheduleFromEvents(seeds: IcsEventSeed[], name: string): ScheduleData {
  const data = createBlankSchedule(new Date());
  const timetable = data.timetables[0];
  if (name) {
    timetable.name = name;
    timetable.semester.name = name;
  }
  timetable.events = seeds.map((seed) =>
    makeEvent({
      title: seed.title,
      date: seed.date,
      allDay: seed.allDay,
      start: seed.start,
      end: seed.end,
      note: seed.note,
    }),
  );
  return data;
}

export async function readScheduleFile(file: File): Promise<{
  data: ScheduleData | null;
  message: string;
}> {
  if (file.size > 20 * 1024 * 1024) {
    return { data: null, message: "文件超过 20 MB，无法导入。" };
  }
  const lower = file.name.toLowerCase();
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { data: null, message: "文件读取失败，请重试。" };
  }
  const baseName = file.name.replace(/\.[^.]+$/, "").trim();

  if (lower.endsWith(".ics") || /BEGIN:VCALENDAR/i.test(text.slice(0, 4000))) {
    const events = parseIcsEvents(text);
    if (events.length === 0) {
      return { data: null, message: "ICS 里没有找到可导入的日程。" };
    }
    return {
      data: scheduleFromEvents(events, baseName),
      message: `已从 ICS 读取 ${events.length} 条日程。`,
    };
  }

  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const seeds = parseCsvCourses(text);
    if (seeds.length === 0) {
      return {
        data: null,
        message: "CSV 里没有找到课程。需要表头包含课程名、星期、开始节等列。",
      };
    }
    const slotCount = seeds.reduce((total, seed) => total + seed.slots.length, 0);
    return {
      data: scheduleFromCourses(seeds, baseName),
      message: `已从表格读取 ${seeds.length} 门课程、${slotCount} 个时间段。`,
    };
  }

  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".html") ||
    lower.endsWith(".htm")
  ) {
    const raw = /\.html?$/.test(lower) || /<html|<body|<div|<table/i.test(text)
      ? htmlToText(text)
      : text;
    const parsed = parseCourseText(raw, 20);
    if (parsed.courses.length === 0) {
      return {
        data: null,
        message:
          parsed.errors[0] ?? "文本里没有找到课程。每行写成「课程名 周一 第1-2节」即可。",
      };
    }
    const slotCount = parsed.courses.reduce((total, seed) => total + seed.slots.length, 0);
    return {
      data: scheduleFromCourses(parsed.courses, baseName),
      message: `已从文本读取 ${parsed.courses.length} 门课程、${slotCount} 个时间段。`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { data: null, message: "文件不是有效的 JSON。" };
  }
  const data = normalizeSchedule(parsed);
  if (!data) {
    return { data: null, message: "没有找到可识别的课表数据。" };
  }
  const courseCount = data.timetables.reduce(
    (total, timetable) => total + timetable.courses.length,
    0,
  );
  const slotCount = data.timetables.reduce(
    (total, timetable) =>
      total + timetable.courses.reduce((sum, course) => sum + course.slots.length, 0),
    0,
  );
  if (courseCount === 0) {
    return { data, message: `已导入 ${data.timetables.length} 套空课表。` };
  }
  return {
    data,
    message: `已读取 ${data.timetables.length} 套课表、${courseCount} 门课程，共 ${slotCount} 个时间段。`,
  };
}

export function minutesToHoursLabel(minutes: number): string {
  if (minutes <= 0) return "0 学时";
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 学时`;
}

export function durationFromPeriods(
  periods: Array<{ start: string; end: string }>,
  start: number,
  end: number,
): number {
  let total = 0;
  for (let index = start; index <= end; index += 1) {
    const period = periods[index - 1];
    if (period) total += Math.max(0, timeToMinutes(period.end) - timeToMinutes(period.start));
  }
  return total;
}
