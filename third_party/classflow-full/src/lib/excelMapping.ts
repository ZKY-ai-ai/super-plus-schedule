import { parseCourseText, type ParsedCourseSeed } from "./textImport";

export interface ExcelColumnMapping {
  name: number;
  day: number;
  period: number;
  start: number;
  end: number;
  weeks: number;
  location: number;
  teacher: number;
  section: number;
}

export interface MappedCourseResult {
  courses: ParsedCourseSeed[];
  errors: string[];
  totalRows: number;
}

const FIELD_ALIASES: Record<keyof ExcelColumnMapping, string[]> = {
  name: ["课程名", "课程名称", "课程", "名称", "科目", "教学班名称", "name", "course"],
  day: ["星期", "周几", "星期几", "上课日", "上课星期", "day", "weekday"],
  period: ["节次", "节", "上课节次", "时间", "上课时间", "period", "time"],
  start: ["开始节", "起始节", "开始", "节次起", "start", "开始节次"],
  end: ["结束节", "结束", "节次止", "end", "结束节次"],
  weeks: ["周次", "周数", "起止周", "上课周次", "教学周", "weeks", "week"],
  location: ["教室", "地点", "上课地点", "location", "room", "place"],
  teacher: ["老师", "教师", "任课教师", "授课教师", "teacher"],
  section: ["班级", "教学班", "行政班", "班次", "班级名称", "分组", "section", "class"],
};

export const EXCEL_MAPPING_FIELDS: Array<{
  key: keyof ExcelColumnMapping;
  label: string;
  required?: boolean;
}> = [
  { key: "name", label: "课程名称", required: true },
  { key: "day", label: "星期", required: true },
  { key: "period", label: "节次" },
  { key: "start", label: "开始节" },
  { key: "end", label: "结束节" },
  { key: "weeks", label: "周次" },
  { key: "location", label: "地点" },
  { key: "teacher", label: "教师" },
  { key: "section", label: "班次" },
];

const EMPTY_MAPPING: ExcelColumnMapping = {
  name: -1,
  day: -1,
  period: -1,
  start: -1,
  end: -1,
  weeks: -1,
  location: -1,
  teacher: -1,
  section: -1,
};

const MATCH_ORDER: Array<keyof ExcelColumnMapping> = [
  "name",
  "day",
  "start",
  "end",
  "weeks",
  "period",
  "location",
  "teacher",
  "section",
];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * 表格里的周次常见三种写法：`2~16`、`2,3,4,5`、`第2-16周`。
 * 课程种子只支持连续周段，所以把列表压缩成周段（奇偶列表转成单双周）。
 */
export function normalizeWeekCell(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{1,2}\s*[-–~至]\s*\d{1,2}\s*周?$/.test(trimmed)) {
    return trimmed.endsWith("周") ? trimmed : `${trimmed}周`;
  }
  if (/^\d{1,2}$/.test(trimmed)) return `第${trimmed}周`;
  const numbers = [...trimmed.matchAll(/\d{1,2}/g)]
    .map((match) => Number(match[0]))
    .filter((week) => week >= 1 && week <= 60);
  if (numbers.length < 2) return trimmed;
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  const min = unique[0];
  const max = unique[unique.length - 1];
  if (unique.length === max - min + 1) return `${min}-${max}周`;
  const span = max - min + 1;
  if (unique.every((week) => week % 2 === 1) && span === unique.length * 2 - 1) {
    return `${min}-${max}周单周`;
  }
  if (unique.every((week) => week % 2 === 0) && span === unique.length * 2 - 1) {
    return `${min}-${max}周双周`;
  }
  return `${min}-${max}周`;
}

/**
 * A week cell may hold several disjoint ranges (`2~10,12~14,16~17`) and
 * per-range parity (`14~16(双),17`). ParsedCourseSeed segments are contiguous,
 * so split the cell into one segment per range instead of flattening it.
 */
export function weekCellSegments(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [""];
  const segments: Array<{ start: number; end: number; pattern: string }> = [];
  for (const match of trimmed.matchAll(
    /(\d{1,2})(?:\s*[-–~至]\s*(\d{1,2}))?\s*(?:[（(]\s*([单双])\s*[)）]|([单双])周)?/g,
  )) {
    let start = Number(match[1]);
    let end = match[2] ? Number(match[2]) : start;
    if (start > end) [start, end] = [end, start];
    if (start < 1 || start > 60 || end > 60) continue;
    segments.push({ start, end, pattern: match[3] ?? match[4] ?? "" });
  }
  if (segments.length === 0) return [""];
  const merged: typeof segments = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.pattern === "" &&
      segment.pattern === "" &&
      segment.start === previous.end + 1
    ) {
      previous.end = segment.end;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged.map((segment) =>
    segment.start === segment.end
      ? `${segment.start}周${segment.pattern}`
      : `${segment.start}~${segment.end}周${segment.pattern}`,
  );
}

export function guessColumnMapping(headers: string[]): ExcelColumnMapping {
  const mapping = { ...EMPTY_MAPPING };
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    for (const field of MATCH_ORDER) {
      if (mapping[field] >= 0) continue;
      const aliases = FIELD_ALIASES[field];
      if (
        aliases.some(
          (alias) => normalized === alias || (alias.length >= 2 && normalized.includes(alias)),
        )
      ) {
        mapping[field] = index;
        break;
      }
    }
  });
  return mapping;
}

export function detectHeaderRow(rows: string[][]): number {
  for (let index = 0; index < rows.length; index += 1) {
    const mapping = guessColumnMapping(rows[index] ?? []);
    if (mapping.name >= 0 && mapping.day >= 0) return index;
  }
  return 0;
}

function cell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

function mergeSeed(target: ParsedCourseSeed, source: ParsedCourseSeed | undefined) {
  if (!source) return;
  if (!target.location && source.location) target.location = source.location;
  if (!target.teacher && source.teacher) target.teacher = source.teacher;
  for (const slot of source.slots) {
    const duplicate = target.slots.some(
      (item) =>
        item.day === slot.day &&
        item.start === slot.start &&
        item.end === slot.end &&
        item.weekStart === slot.weekStart &&
        item.weekEnd === slot.weekEnd &&
        item.pattern === slot.pattern,
    );
    if (!duplicate) target.slots.push(slot);
  }
}

export function mapCourseRows(
  rows: string[][],
  mapping: ExcelColumnMapping,
  options: { totalWeeks?: number; sectionKeyword?: string; startRow?: number } = {},
): MappedCourseResult {
  const totalWeeks = Math.min(Math.max(options.totalWeeks ?? 20, 1), 30);
  const keyword = options.sectionKeyword?.trim() ?? "";
  const startRow = Math.max(0, options.startRow ?? 1);
  const byName = new Map<string, ParsedCourseSeed>();
  const errors: string[] = [];
  let totalRows = 0;

  rows.slice(startRow).forEach((row, index) => {
    if (!row.some((value) => value.trim())) return;
    if (keyword && mapping.section >= 0 && !cell(row, mapping.section).includes(keyword)) return;
    if (keyword && mapping.section < 0) return;
    totalRows += 1;
    const name = cell(row, mapping.name);
    if (!name) return;

    const dayCell = cell(row, mapping.day);
    const periodCell =
      cell(row, mapping.period) ||
      [cell(row, mapping.start), cell(row, mapping.end)].filter(Boolean).join("-");
    const weekCell = cell(row, mapping.weeks);
    const location = cell(row, mapping.location);
    const teacher = cell(row, mapping.teacher);
    if (!dayCell) {
      errors.push(`第 ${startRow + index + 1} 行「${name}」缺少星期。`);
      return;
    }
    if (!periodCell) {
      errors.push(`第 ${startRow + index + 1} 行「${name}」缺少节次。`);
      return;
    }

    const segments = periodCell
      .split(/[;；|\n]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    const weekVariants = weekCellSegments(weekCell);
    const baseParts = [
      name,
      dayCell,
      location ? `地点：${location}` : "",
      teacher ? `@${teacher}` : "",
    ].filter(Boolean);
    let merged: ParsedCourseSeed | null = null;
    for (const weekText of weekVariants) {
      for (const segment of segments.length > 0 ? segments : [periodCell]) {
        const normalizePeriod = /^\d{1,2}\s*[-–~至]\s*\d{1,2}$/.test(segment)
          ? `${segment}节`
          : /^\d{1,2}$/.test(segment)
            ? `第${segment}节`
            : segment;
        const parsed = parseCourseText(
          [...baseParts, weekText, normalizePeriod].filter(Boolean).join(" "),
          totalWeeks,
        );
        const seed = parsed.courses[0];
        if (!seed) {
          errors.push(...parsed.errors.map((message) => `第 ${startRow + index + 1} 行「${name}」：${message}`));
          continue;
        }
        if (!merged) {
          merged = { ...seed, name: seed.name || name, slots: [...seed.slots] };
        } else {
          mergeSeed(merged, seed);
        }
      }
    }
    if (!merged) return;
    const key = `${merged.name}|${merged.teacher}`;
    const existing = byName.get(key);
    if (existing) mergeSeed(existing, merged);
    else byName.set(key, merged);
  });

  return { courses: [...byName.values()], errors, totalRows };
}

export function mappingReady(mapping: ExcelColumnMapping): boolean {
  return mapping.name >= 0 && mapping.day >= 0;
}
