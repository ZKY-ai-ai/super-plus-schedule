import type { Semester } from "../types";
import {
  complete,
  createChatMessage,
  providerPreset,
  type AiChatMessage,
  type AiSettings,
} from "./ai";
import { parseAiActions, type AiAction } from "./aiActions";
import {
  attachmentExtension,
  attachmentImages,
  buildAttachmentPromptBlock,
  type AiAttachment,
} from "./aiAttachments";
import { getWeekNumber, getWeekdayNumber, parseDateKey, timeToMinutes } from "./date";
import { parseCourseText, type ParsedCourseSeed } from "./textImport";
import { parseIcsEvents } from "./transfer";

export interface CourseImportConversion {
  seeds: ParsedCourseSeed[];
  notes: string[];
}

export function isAiImportReady(settings: AiSettings): boolean {
  const preset = providerPreset(settings.provider);
  if (preset.probe === "none") return false;
  return !preset.keyRequired || Boolean(settings.apiKey.trim());
}

export function isIcsFile(name: string): boolean {
  return attachmentExtension(name) === "ics";
}

/* ------------------------------ 课程合并 ------------------------------ */

const SLOT_KEY = (slot: ParsedCourseSeed["slots"][number]) =>
  `${slot.day}|${slot.start}|${slot.end}|${slot.weekStart}|${slot.weekEnd}|${slot.pattern}`;

export function mergeCourseSeeds(seeds: ParsedCourseSeed[]): ParsedCourseSeed[] {
  const byCourse = new Map<string, ParsedCourseSeed>();
  for (const seed of seeds) {
    const name = seed.name.trim();
    if (!name || seed.slots.length === 0) continue;
    const key = `${name}|${seed.teacher.trim()}`;
    const existing = byCourse.get(key);
    if (!existing) {
      byCourse.set(key, {
        name,
        teacher: seed.teacher.trim(),
        location: seed.location.trim(),
        slots: [...seed.slots],
      });
      continue;
    }
    if (!existing.location && seed.location) existing.location = seed.location.trim();
    const known = new Set(existing.slots.map(SLOT_KEY));
    for (const slot of seed.slots) {
      const slotKey = SLOT_KEY(slot);
      if (known.has(slotKey)) continue;
      known.add(slotKey);
      existing.slots.push(slot);
    }
  }
  return [...byCourse.values()].filter((seed) => seed.slots.length > 0);
}

/* ------------------------------ ICS 转换 ------------------------------ */

interface IcsCourseGroup {
  name: string;
  teacher: string;
  location: string;
  day: number;
  start: number;
  end: number;
  weeks: Set<number>;
}

function cleanIcsTitle(title: string): string {
  return (
    title
      .replace(/[（(]\s*第\s*\d+\s*周\s*[)）]/g, " ")
      .replace(/(?:周|星期)\s*[一二三四五六日天1-7]/g, " ")
      .replace(/第?\s*\d{1,2}\s*[-–~至]\s*\d{1,2}\s*节/g, " ")
      .replace(/第\s*\d{1,2}\s*节/g, " ")
      .replace(/\d{1,2}:\d{2}\s*[-–~至]\s*\d{1,2}:\d{2}/g, " ")
      .replace(/\s+/g, " ")
      .trim() || title.trim()
  );
}

function weeksFromText(text: string, totalWeeks: number): number[] {
  const withoutRanges = text.replace(/第?\s*\d{1,2}\s*[-–~至]\s*\d{1,2}\s*周/g, " ");
  const singles = [...withoutRanges.matchAll(/第\s*(\d{1,2})\s*周/g)]
    .map((match) => Number(match[1]))
    .filter((week) => week >= 1 && week <= totalWeeks);
  if (singles.length > 0) return [...new Set(singles)];

  const range = /第?\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*周/.exec(text);
  if (range) {
    const from = Math.max(1, Number(range[1]));
    const to = Math.min(totalWeeks, Number(range[2]));
    const weeks: number[] = [];
    for (let week = from; week <= to; week += 1) weeks.push(week);
    if (weeks.length > 0) return weeks;
  }
  return [];
}

function periodsFromTitle(text: string): { start: number; end: number } | null {
  const range = /第?\s*(\d{1,2})\s*[-–~至]\s*(\d{1,2})\s*节/.exec(text);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start >= 1 && end >= start) return { start, end };
  }
  const single = /第\s*(\d{1,2})\s*节/.exec(text);
  if (single) {
    const start = Number(single[1]);
    if (start >= 1) return { start, end: start };
  }
  return null;
}

function periodsFromTimes(
  startTime: string,
  endTime: string,
  semester: Semester,
): { start: number; end: number } | null {
  const periods = semester.periods;
  if (periods.length === 0) return null;
  const startMinutes = timeToMinutes(startTime);
  let startIndex = -1;
  let bestDiff = 25;
  periods.forEach((period, index) => {
    const diff = Math.abs(timeToMinutes(period.start) - startMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      startIndex = index;
    }
  });
  if (startIndex < 0) return null;
  const endMinutes = timeToMinutes(endTime);
  let endIndex = startIndex;
  for (let index = startIndex; index < periods.length; index += 1) {
    if (timeToMinutes(periods[index].end) >= endMinutes - 5) {
      endIndex = index;
      break;
    }
  }
  return { start: periods[startIndex].index, end: periods[endIndex].index };
}

function weekSlotRanges(
  weeks: number[],
  totalWeeks: number,
): Array<{ weekStart: number; weekEnd: number; pattern: "all" | "odd" | "even" }> {
  const sorted = [...new Set(weeks)]
    .filter((week) => week >= 1 && week <= totalWeeks)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const stepTwo = sorted.every((week, index) => index === 0 || week - sorted[index - 1] === 2);
  if (sorted.length > 1 && stepTwo) {
    return [
      {
        weekStart: sorted[0],
        weekEnd: sorted[sorted.length - 1],
        pattern: sorted[0] % 2 === 1 ? "odd" : "even",
      },
    ];
  }

  const runs: Array<{ weekStart: number; weekEnd: number; pattern: "all" | "odd" | "even" }> = [];
  let runStart = sorted[0];
  let previous = sorted[0];
  for (const week of sorted.slice(1)) {
    if (week === previous + 1) {
      previous = week;
      continue;
    }
    runs.push({ weekStart: runStart, weekEnd: previous, pattern: "all" });
    runStart = week;
    previous = week;
  }
  runs.push({ weekStart: runStart, weekEnd: previous, pattern: "all" });
  return runs;
}

export function courseSeedsFromIcs(raw: string, semester: Semester): ParsedCourseSeed[] {
  const totalWeeks = Math.max(1, semester.totalWeeks);
  const events = parseIcsEvents(raw.replace(/^\uFEFF/, ""));
  const groups = new Map<string, IcsCourseGroup>();

  for (const event of events) {
    if (event.allDay) continue;
    const combined = `${event.title}\n${event.note}`;
    const date = parseDateKey(event.date);
    const day = getWeekdayNumber(date);
    const periods =
      periodsFromTitle(combined) ?? periodsFromTimes(event.start, event.end, semester);
    if (!periods) continue;

    const name = cleanIcsTitle(event.title);
    if (!name) continue;
    const teacher =
      /教师[:：]\s*([^\n]+)/.exec(event.note)?.[1]?.trim() ??
      /@\s*([^\s,，;；|]+)/.exec(combined)?.[1]?.trim() ??
      "";
    const location = /地点[:：]\s*([^\n]+)/.exec(event.note)?.[1]?.trim() ?? "";

    let weeks = weeksFromText(combined, totalWeeks);
    if (weeks.length === 0) {
      weeks = [getWeekNumber(semester.startDate, date, totalWeeks, semester.weekStartsOn)];
    }

    const key = [name, teacher, location, day, periods.start, periods.end].join("|");
    let group = groups.get(key);
    if (!group) {
      group = {
        name,
        teacher,
        location,
        day,
        start: periods.start,
        end: periods.end,
        weeks: new Set<number>(),
      };
      groups.set(key, group);
    }
    for (const week of weeks) {
      if (week >= 1 && week <= totalWeeks) group.weeks.add(week);
    }
  }

  const seeds: ParsedCourseSeed[] = [];
  for (const group of groups.values()) {
    const slots = weekSlotRanges([...group.weeks], totalWeeks).map((range) => ({
      day: group.day,
      start: group.start,
      end: group.end,
      weekStart: range.weekStart,
      weekEnd: range.weekEnd,
      pattern: range.pattern,
    }));
    if (slots.length === 0) continue;
    seeds.push({
      name: group.name,
      teacher: group.teacher,
      location: group.location,
      slots,
    });
  }
  return mergeCourseSeeds(seeds);
}

/* ------------------------------ AI 转换 ------------------------------ */

function seedFromStructuredAction(action: AiAction): ParsedCourseSeed | null {
  const args = action.args;
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!name || !Array.isArray(args.slots) || args.slots.length === 0) return null;
  const slots: ParsedCourseSeed["slots"] = [];
  for (const raw of args.slots) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const day = Number(record.day);
    const start = Number(record.start);
    const end = Number(record.end);
    if (!Number.isFinite(day) || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    slots.push({
      day,
      start,
      end,
      weekStart: Number(record.weekStart ?? 1),
      weekEnd: Number(record.weekEnd ?? 20),
      pattern:
        record.pattern === "odd" ? "odd" : record.pattern === "even" ? "even" : "all",
    });
  }
  if (slots.length === 0) return null;
  return {
    name,
    teacher: typeof args.teacher === "string" ? args.teacher.trim() : "",
    location: typeof args.location === "string" ? args.location.trim() : "",
    slots,
  };
}

function seedsFromAiContent(content: string, totalWeeks: number): ParsedCourseSeed[] {
  const parsed = parseAiActions(content);
  const seeds: ParsedCourseSeed[] = [];
  for (const action of parsed.actions) {
    if (action.action === "add_courses_from_text") {
      const text = typeof action.args.text === "string" ? action.args.text : "";
      if (text.trim()) seeds.push(...parseCourseText(text, totalWeeks).courses);
      continue;
    }
    if (action.action === "add_course") {
      const seed = seedFromStructuredAction(action);
      if (seed) seeds.push(seed);
    }
  }
  return mergeCourseSeeds(seeds);
}

function buildImportInstruction(semester: Semester): string {
  const totalWeeks = Math.max(1, semester.totalWeeks);
  const periodTable = semester.periods
    .map((period) => `第${period.index}节 ${period.start}-${period.end}`)
    .join("；");
  return [
    `请把附件里的课表转换成可导入的课程，学期共 ${totalWeeks} 周。`,
    "只输出一个 add_courses_from_text 动作，把所有课程合并进同一个 text，禁止拆成多个动作或分批。",
    "text 每行一门课，格式：课程名 周X 第a-b节 第s-e周 [单周/双周] 地点：教室 @老师。",
    periodTable
      ? `如果附件只有上下课时间，请按下面作息换算成节次：${periodTable}`
      : "如果附件没有节次信息，请根据上下课时间推断节次。",
    "缺少的信息留空，不要编造；不要输出 add_course、clear_all 等其他动作。",
  ].join("\n");
}

export async function aiConvertAttachmentsToCourses(
  attachments: AiAttachment[],
  settings: AiSettings,
  semester: Semester,
): Promise<CourseImportConversion> {
  const ready = attachments.filter((attachment) => attachment.status === "ready");
  const localSeeds = mergeCourseSeeds(
    ready.flatMap((attachment) => attachment.courseSeeds ?? []),
  );
  if (ready.length === 0) {
    return { seeds: localSeeds, notes: ["没有可读取的附件。"] };
  }
  if (!isAiImportReady(settings)) {
    return { seeds: localSeeds, notes: ["未接入 AI，只能导入本地解析出的课程。"] };
  }

  const now = new Date();
  const prompt = buildAttachmentPromptBlock(ready, buildImportInstruction(semester), 20_000);
  const userMessage: AiChatMessage = {
    ...createChatMessage("user", "把附件转换成课表导入动作。", now),
    content: prompt,
  };

  let content = "";
  try {
    const result = await complete(
      {
        messages: [userMessage],
        images: attachmentImages(ready),
        hasAttachments: true,
        system:
          "你正在执行「导入课表」任务：只把附件中的课程整理成一个 add_courses_from_text 动作，等待应用解析，不要写入数据。",
      },
      settings,
      undefined,
      now,
    );
    content = result.content ?? "";
    if (result.error && !content) {
      return { seeds: localSeeds, notes: ["AI 请求没有成功，已改用本地解析结果。"] };
    }
  } catch {
    return { seeds: localSeeds, notes: ["AI 请求失败，已改用本地解析结果。"] };
  }

  const aiSeeds = seedsFromAiContent(content, Math.max(1, semester.totalWeeks));
  const seeds = mergeCourseSeeds([...localSeeds, ...aiSeeds]);
  const notes: string[] = [];
  if (aiSeeds.length === 0 && localSeeds.length > 0) {
    notes.push("AI 没有返回可用的课程动作，已改用本地解析结果。");
  }
  return { seeds, notes };
}
