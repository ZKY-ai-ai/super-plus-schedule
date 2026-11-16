import type { WeekPattern } from "../types";

export interface ParsedCourseSeed {
  name: string;
  teacher: string;
  location: string;
  slots: Array<{
    day: number;
    start: number;
    end: number;
    weekStart: number;
    weekEnd: number;
    pattern: WeekPattern;
  }>;
}

export interface TextParseResult {
  courses: ParsedCourseSeed[];
  errors: string[];
}

const DAY_MAP: Record<string, number> = {
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

const DAY_RE = /(?:周|星期)\s*([一二三四五六日天1-7])/g;
const PERIOD_RANGE_RE = /第?\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*节/;
const PERIOD_SINGLE_RE = /第\s*(\d{1,2})\s*节/;
const WEEK_RANGE_RE = /第?\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*周([单双])?/;
const WEEK_SINGLE_RE = /第?\s*(\d{1,2})\s*周\s*([单双])?/;
const TEACHER_RE = /(?:@|(?:老师|教师)[:：])\s*([^\s,，;；|]+)/;
const LOCATION_RE =
  /(?:地点|教室)[:：]\s*([^\s,，;；|]+)|([^\s,，;；|]*(?:楼|室|馆|场|中心|机房|实验)[^\s,，;；|]*)/;

/**
 * Parse a pasted timetable such as:
 *   高等数学 周一 第1-2节 教一401 1-16周
 *   大学物理;周二;3-4节;教二205;1-16周
 *   英语 @李老师 周三 5-6节 地点：外语楼302 单周
 */
export function parseCourseText(input: string, totalWeeks = 20): TextParseResult {
  const errors: string[] = [];
  const byName = new Map<string, ParsedCourseSeed>();

  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line, index) => {
      if (!line || line.startsWith("#") || line.startsWith("//")) return;
      let rest = line;

      const days: number[] = [];
      for (const match of line.matchAll(DAY_RE)) {
        const day = DAY_MAP[match[1]];
        if (day && !days.includes(day)) days.push(day);
      }
      rest = rest.replace(DAY_RE, " ");

      const periodRange = rest.match(PERIOD_RANGE_RE);
      const periodSingle = !periodRange ? rest.match(PERIOD_SINGLE_RE) : null;
      let start = 0;
      let end = 0;
      if (periodRange) {
        start = Number(periodRange[1]);
        end = Number(periodRange[2]);
        rest = rest.replace(PERIOD_RANGE_RE, " ");
      } else if (periodSingle) {
        start = Number(periodSingle[1]);
        end = start;
        rest = rest.replace(PERIOD_SINGLE_RE, " ");
      }

      let weekStart = 1;
      let weekEnd = Math.min(Math.max(totalWeeks, 1), 30);
      let pattern: WeekPattern = "all";
      const weekRange = rest.match(WEEK_RANGE_RE);
      const weekSingle = !weekRange ? rest.match(WEEK_SINGLE_RE) : null;
      if (weekRange) {
        weekStart = Number(weekRange[1]);
        weekEnd = Number(weekRange[2]);
        if (weekRange[3] === "单") pattern = "odd";
        if (weekRange[3] === "双") pattern = "even";
        rest = rest.replace(WEEK_RANGE_RE, " ");
      } else if (weekSingle) {
        weekStart = Number(weekSingle[1]);
        weekEnd = weekStart;
        if (weekSingle[2] === "单") pattern = "odd";
        if (weekSingle[2] === "双") pattern = "even";
        rest = rest.replace(WEEK_SINGLE_RE, " ");
      } else if (/单周/.test(rest)) {
        pattern = "odd";
      } else if (/双周/.test(rest)) {
        pattern = "even";
      }
      if (/单周/.test(rest)) {
        if (pattern === "all") pattern = "odd";
        rest = rest.replace(/单周/g, " ");
      }
      if (/双周/.test(rest)) {
        if (pattern === "all") pattern = "even";
        rest = rest.replace(/双周/g, " ");
      }

      let teacher = "";
      const teacherMatch = rest.match(TEACHER_RE);
      if (teacherMatch) {
        teacher = teacherMatch[1];
        rest = rest.replace(TEACHER_RE, " ");
      }

      let location = "";
      const locationMatch = rest.match(LOCATION_RE);
      if (locationMatch) {
        location = (locationMatch[1] ?? locationMatch[2] ?? "").trim();
        rest = rest.replace(LOCATION_RE, " ");
      } else {
        const numeric = rest
          .split(/[\s,，;；|]+/)
          .find((token) => /\d/.test(token) && token.length > 1);
        if (numeric) {
          location = numeric;
          rest = rest.replace(numeric, " ");
        }
      }

      const name = rest
        .replace(/[,，、;；|/\\]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const label = `第 ${index + 1} 行`;
      if (!name) {
        errors.push(`${label}：缺少课程名。`);
        return;
      }
      if (days.length === 0) {
        errors.push(`${label}「${name}」：没有识别到星期，写成「周一」或「星期1」。`);
        return;
      }
      if (start < 1) {
        errors.push(`${label}「${name}」：没有识别到节次，写成「第1-2节」。`);
        return;
      }
      if (weekEnd < weekStart) {
        errors.push(`${label}「${name}」：周次范围不正确。`);
        return;
      }

      const key = `${name}|${teacher}`;
      const existing = byName.get(key);
      const seed = existing ?? { name, teacher, location, slots: [] };
      if (!existing) byName.set(key, seed);
      if (!seed.location && location) seed.location = location;
      for (const day of days) {
        const duplicate = seed.slots.some(
          (slot) =>
            slot.day === day &&
            slot.start === Math.min(start, end) &&
            slot.end === Math.max(start, end) &&
            slot.weekStart === weekStart &&
            slot.weekEnd === weekEnd,
        );
        if (duplicate) continue;
        seed.slots.push({
          day,
          start: Math.min(start, end),
          end: Math.max(start, end),
          weekStart,
          weekEnd,
          pattern,
        });
      }
    });

  return { courses: [...byName.values()], errors };
}
