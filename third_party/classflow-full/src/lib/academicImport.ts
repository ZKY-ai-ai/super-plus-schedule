import type { WeekPattern } from "../types";
import type { ParsedCourseSeed } from "./textImport";

export const ACADEMIC_MAX_WEEKS = 60;
export const ACADEMIC_MAX_PERIODS = 14;
export const ACADEMIC_DEFAULT_TOTAL_WEEKS = 20;
export const ACADEMIC_MAX_HEADERS = 30;
export const ACADEMIC_DEFAULT_TIMEOUT_MS = 15000;
export const ACADEMIC_MAX_ERRORS = 30;

export const WEEKDAY_FORMAT_OPTIONS = [
  { id: "auto", label: "自动识别" },
  { id: "number", label: "数字（1-7）" },
  { id: "chinese", label: "中文（周一 / 一）" },
  { id: "english", label: "英文（Mon / Monday）" },
] as const;

export const PERIOD_FORMAT_OPTIONS = [
  { id: "auto", label: "自动识别" },
  { id: "number", label: "单个节次（3）" },
  { id: "range", label: "节次范围（3-4）" },
  { id: "label", label: "带文字（第3-4节）" },
] as const;

export const WEEK_FORMAT_OPTIONS = [
  { id: "auto", label: "自动识别" },
  { id: "number", label: "单个周次（3）" },
  { id: "range", label: "周次范围（1-16）" },
  { id: "list", label: "周次列表（1,3,5）" },
  { id: "label", label: "带文字（第1-16周）" },
] as const;

export type WeekdayFormat = (typeof WEEKDAY_FORMAT_OPTIONS)[number]["id"];
export type PeriodFormat = (typeof PERIOD_FORMAT_OPTIONS)[number]["id"];
export type WeekFormat = (typeof WEEK_FORMAT_OPTIONS)[number]["id"];
export type AcademicHttpMethod = "GET" | "POST";

const WEEKDAY_FORMAT_IDS = WEEKDAY_FORMAT_OPTIONS.map((item) => item.id);
const PERIOD_FORMAT_IDS = PERIOD_FORMAT_OPTIONS.map((item) => item.id);
const WEEK_FORMAT_IDS = WEEK_FORMAT_OPTIONS.map((item) => item.id);

export const ACADEMIC_FIELD_KEYS = [
  "name",
  "weekday",
  "periods",
  "periodStart",
  "periodEnd",
  "weeks",
  "weekStart",
  "weekEnd",
  "weekPattern",
  "teacher",
  "location",
] as const;

export type AcademicFieldKey = (typeof ACADEMIC_FIELD_KEYS)[number];
export type AcademicFieldPaths = Record<AcademicFieldKey, string>;

export const ACADEMIC_FIELD_OPTIONS: Array<{
  key: AcademicFieldKey;
  label: string;
  hint: string;
}> = [
  { key: "name", label: "课程名称", hint: "必填，例如 data.courseName" },
  { key: "weekday", label: "星期", hint: "必填，例如 weekday" },
  { key: "periods", label: "节次", hint: "与开始节 / 结束节二选一" },
  { key: "periodStart", label: "开始节", hint: "例如 startSection" },
  { key: "periodEnd", label: "结束节", hint: "例如 endSection" },
  { key: "weeks", label: "周次", hint: "例如 weeks，可写 1-16 或 [1,3,5]" },
  { key: "weekStart", label: "起始周", hint: "没有周次字段时使用" },
  { key: "weekEnd", label: "结束周", hint: "与起始周成对出现" },
  { key: "weekPattern", label: "单双周", hint: "可选，值为 1/2 或 单/双" },
  { key: "teacher", label: "教师", hint: "可选" },
  { key: "location", label: "地点", hint: "可选" },
];

const FIELD_LABELS: Record<AcademicFieldKey, string> = {
  name: "课程名称",
  weekday: "星期",
  periods: "节次",
  periodStart: "开始节",
  periodEnd: "结束节",
  weeks: "周次",
  weekStart: "起始周",
  weekEnd: "结束周",
  weekPattern: "单双周",
  teacher: "教师",
  location: "地点",
};

export interface AcademicAdapterConfig {
  name: string;
  url: string;
  method: AcademicHttpMethod;
  /** JSON object text; kept as text so it can be edited before validation. */
  headers: string;
  body: string;
  responsePath: string;
  fields: AcademicFieldPaths;
  weekdayFormat: WeekdayFormat;
  periodFormat: PeriodFormat;
  weekFormat: WeekFormat;
  totalWeeks: number;
  note: string;
}

export interface AcademicValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface HeaderParseResult {
  ok: boolean;
  headers: Record<string, string>;
  error?: string;
}

export interface AcademicMappingResult {
  courses: ParsedCourseSeed[];
  errors: string[];
  totalItems: number;
  validItems: number;
}

export interface AcademicWeekSegment {
  weekStart: number;
  weekEnd: number;
  pattern: WeekPattern;
}

export interface ParsedAcademicWeeks {
  weeks: number[];
  pattern: WeekPattern;
}

export type AcademicFailureKind =
  | "config"
  | "invalid-url"
  | "timeout"
  | "http"
  | "cors"
  | "network"
  | "json"
  | "empty";

export interface AcademicRequestOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Override platform detection; useful for tests. */
  native?: boolean;
}

export interface AcademicRequestResult {
  ok: boolean;
  kind: "ok" | AcademicFailureKind;
  status: number | null;
  message: string;
  data: unknown;
  rawText: string;
  durationMs: number;
}

export interface AcademicTestOutcome {
  status: "ok" | "failed";
  message: string;
  testedAt: string;
  itemCount: number;
  courseCount: number;
  slotCount: number;
  rawSnippet: string;
  courses: ParsedCourseSeed[];
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function rawText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function pickFormat<T extends string>(
  value: unknown,
  allowed: readonly string[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value) ? (value as T) : fallback;
}

function emptyFields(): AcademicFieldPaths {
  return {
    name: "",
    weekday: "",
    periods: "",
    periodStart: "",
    periodEnd: "",
    weeks: "",
    weekStart: "",
    weekEnd: "",
    weekPattern: "",
    teacher: "",
    location: "",
  };
}

export function createEmptyAcademicAdapter(): AcademicAdapterConfig {
  return {
    name: "",
    url: "",
    method: "GET",
    headers: '{\n  "Accept": "application/json"\n}',
    body: "",
    responsePath: "",
    fields: emptyFields(),
    weekdayFormat: "auto",
    periodFormat: "auto",
    weekFormat: "auto",
    totalWeeks: ACADEMIC_DEFAULT_TOTAL_WEEKS,
    note: "",
  };
}

export function normalizeAdapterConfig(value: unknown): AcademicAdapterConfig | null {
  if (!isRecord(value)) return null;
  const fieldSource = isRecord(value.fields) ? value.fields : {};
  const fields = emptyFields();
  for (const key of ACADEMIC_FIELD_KEYS) {
    fields[key] = text(fieldSource[key], 120);
  }
  let headers = "";
  if (typeof value.headers === "string") headers = value.headers.slice(0, 8000);
  else if (isRecord(value.headers)) headers = JSON.stringify(value.headers, null, 2);

  return {
    name: text(value.name, 60),
    url: text(value.url, 500),
    method: value.method === "POST" ? "POST" : "GET",
    headers,
    body: rawText(value.body, 20000),
    responsePath: text(value.responsePath, 200),
    fields,
    weekdayFormat: pickFormat<WeekdayFormat>(value.weekdayFormat, WEEKDAY_FORMAT_IDS, "auto"),
    periodFormat: pickFormat<PeriodFormat>(value.periodFormat, PERIOD_FORMAT_IDS, "auto"),
    weekFormat: pickFormat<WeekFormat>(value.weekFormat, WEEK_FORMAT_IDS, "auto"),
    totalWeeks: clampInt(value.totalWeeks, 1, ACADEMIC_MAX_WEEKS, ACADEMIC_DEFAULT_TOTAL_WEEKS),
    note: text(value.note, 300),
  };
}

const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function parseAdapterHeaders(input: string): HeaderParseResult {
  const raw = input.trim();
  if (!raw) return { ok: true, headers: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      ok: false,
      headers: {},
      error: '请求头必须是 JSON 对象，例如 {"Cookie": "…"}。',
    };
  }
  if (!isRecord(parsed)) {
    return { ok: false, headers: {}, error: "请求头必须是 JSON 对象。" };
  }

  const entries = Object.entries(parsed);
  if (entries.length > ACADEMIC_MAX_HEADERS) {
    return {
      ok: false,
      headers: {},
      error: `请求头最多 ${ACADEMIC_MAX_HEADERS} 项，请精简后再试。`,
    };
  }

  const headers: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (!HEADER_NAME_RE.test(name)) {
      return { ok: false, headers: {}, error: `请求头名称「${name}」不合法。` };
    }
    if (value === null || value === undefined) continue;
    let headerValue = "";
    if (typeof value === "string") headerValue = value;
    else if (typeof value === "number" || typeof value === "boolean") headerValue = String(value);
    else {
      return {
        ok: false,
        headers: {},
        error: `请求头「${name}」的值必须是字符串、数字或布尔值。`,
      };
    }
    if (/[\r\n]/.test(headerValue)) {
      return { ok: false, headers: {}, error: `请求头「${name}」的值不能包含换行。` };
    }
    headers[name] = headerValue;
  }
  return { ok: true, headers };
}

function tokenizeJsonPath(path: string): string[] | null {
  let body = path.trim();
  if (path.trim().length > 200) return null;
  if (!body || body === "$") return [];
  if (body.startsWith("$.")) body = body.slice(2);
  else if (body.startsWith("$")) body = body.slice(1);

  const tokens: string[] = [];
  let index = 0;
  let expectKey = true;
  while (index < body.length) {
    const char = body[index];
    if (char === ".") {
      if (expectKey) return null;
      index += 1;
      expectKey = true;
      continue;
    }
    if (char === "[") {
      const end = body.indexOf("]", index);
      if (end < 0) return null;
      const inner = body.slice(index + 1, end).trim();
      if (!/^\d+$/.test(inner)) return null;
      tokens.push(inner);
      index = end + 1;
      expectKey = false;
      continue;
    }
    if (!expectKey) return null;
    const start = index;
    while (index < body.length && body[index] !== "." && body[index] !== "[") index += 1;
    const key = body.slice(start, index);
    if (!key || /[\u0000-\u001f]/.test(key)) return null;
    tokens.push(key);
    expectKey = false;
  }
  if (expectKey && tokens.length > 0) return null;
  return tokens;
}

export function isValidJsonPath(path: string): boolean {
  return tokenizeJsonPath(path) !== null;
}

/**
 * Resolve a dot / bracket path against arbitrary JSON without eval.
 * Supports "data.list", "data[0].courses" and "$.data.list".
 */
export function readJsonPath(value: unknown, path: string): unknown {
  const tokens = tokenizeJsonPath(path);
  if (!tokens) return undefined;
  let current = value;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(token)) return undefined;
      current = current[Number(token)];
    } else if (isRecord(current)) {
      current = current[token];
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

const CN_WEEKDAYS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
  七: 7,
};

const EN_WEEKDAYS: Record<string, number> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7,
};

function normalizeFullWidth(input: string): string {
  return input
    .replace(/[\uFF10-\uFF19]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ");
}

export function parseAcademicWeekday(
  value: unknown,
  format: WeekdayFormat = "auto",
): number | null {
  const raw = typeof value === "string" ? normalizeFullWidth(value).trim() : "";

  let numeric: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const number = Math.round(value);
    if (number >= 1 && number <= 7) numeric = number;
  } else if (/^\d{1,2}$/.test(raw)) {
    const number = Number(raw);
    if (number >= 1 && number <= 7) numeric = number;
  }

  let chinese: number | null = null;
  if (raw) {
    const cleaned = raw.replace(/^(周|星期|礼拜)/, "").replace(/周$/, "").trim();
    if (/^[一二三四五六日天七]$/.test(cleaned)) chinese = CN_WEEKDAYS[cleaned] ?? null;
  }

  let english: number | null = null;
  if (raw) {
    const cleaned = raw.toLowerCase().replace(/[^a-z]/g, "");
    english = EN_WEEKDAYS[cleaned] ?? null;
  }

  if (format === "number") return numeric;
  if (format === "chinese") return chinese;
  if (format === "english") return english;
  return numeric ?? chinese ?? english;
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && /^\d{1,2}$/.test(value.trim())) return Number(value.trim());
  return null;
}

function periodRange(start: number, end: number): { start: number; end: number } | null {
  const from = Math.round(start);
  const to = Math.round(end);
  if (from < 1 || to < 1 || from > ACADEMIC_MAX_PERIODS || to > ACADEMIC_MAX_PERIODS) {
    return null;
  }
  return { start: Math.min(from, to), end: Math.max(from, to) };
}

function parsePeriodList(input: string): { start: number; end: number } | null {
  const cleaned = input.trim();
  if (!cleaned) return null;
  const range = /^(\d{1,2})\s*[-–—~至到]\s*(\d{1,2})$/.exec(cleaned);
  if (range) return periodRange(Number(range[1]), Number(range[2]));
  if (/^\d{1,2}$/.test(cleaned)) return periodRange(Number(cleaned), Number(cleaned));

  const parts = cleaned.split(/[,，、;；\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    const partRange = /^(\d{1,2})\s*[-–—~至到]\s*(\d{1,2})$/.exec(part);
    if (partRange) {
      numbers.push(Number(partRange[1]), Number(partRange[2]));
      continue;
    }
    if (/^\d{1,2}$/.test(part)) {
      numbers.push(Number(part));
      continue;
    }
    return null;
  }
  const valid = numbers.filter((item) => item >= 1 && item <= ACADEMIC_MAX_PERIODS);
  if (valid.length === 0 || valid.length !== numbers.length) return null;
  return periodRange(Math.min(...valid), Math.max(...valid));
}

export function parseAcademicPeriods(
  value: unknown,
  format: PeriodFormat = "auto",
): { start: number; end: number } | null {
  if (Array.isArray(value)) {
    const numbers = value
      .map((item) => toInteger(item))
      .filter((item): item is number => item !== null);
    if (numbers.length === 0) return null;
    return periodRange(Math.min(...numbers), Math.max(...numbers));
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? periodRange(value, value) : null;
  }
  if (typeof value !== "string") return null;

  const raw = normalizeFullWidth(value).trim();
  if (!raw) return null;
  if (format === "number") {
    if (!/^\d{1,2}$/.test(raw)) return null;
    return periodRange(Number(raw), Number(raw));
  }

  const cleaned = raw.replace(/^第\s*/, "").replace(/\s*(节|课时)$/, "").trim();
  return parsePeriodList(cleaned);
}

function collectWeekNumbers(input: string): ParsedAcademicWeeks | null {
  let body = normalizeFullWidth(input).trim();
  if (!body) return null;

  let pattern: WeekPattern = "all";
  if (/单/.test(body)) pattern = "odd";
  if (/双/.test(body)) pattern = "even";

  body = body
    .replace(/[单双]/g, " ")
    .replace(/(周次|周数|教学周|上课周|第|学期|周|\(|\)|（|）)/g, " ");
  const parts = body.split(/[,，、;；/／\s]+/).filter(Boolean);
  if (parts.length === 0) return null;

  const weeks: number[] = [];
  const add = (number: number) => {
    if (number >= 1 && number <= ACADEMIC_MAX_WEEKS && !weeks.includes(number)) {
      weeks.push(number);
    }
  };

  for (const part of parts) {
    const range = /^(\d{1,2})\s*[-–—~至到]\s*(\d{1,2})$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (
        from < 1 ||
        to < 1 ||
        from > ACADEMIC_MAX_WEEKS ||
        to > ACADEMIC_MAX_WEEKS
      ) {
        return null;
      }
      for (let week = Math.min(from, to); week <= Math.max(from, to); week += 1) add(week);
      continue;
    }
    if (/^\d{1,2}$/.test(part)) {
      const week = Number(part);
      if (week < 1 || week > ACADEMIC_MAX_WEEKS) return null;
      add(week);
      continue;
    }
    return null;
  }

  if (weeks.length === 0) return null;
  return { weeks: weeks.sort((a, b) => a - b), pattern };
}

export function parseAcademicWeeks(
  value: unknown,
  format: WeekFormat = "auto",
): ParsedAcademicWeeks | null {
  if (typeof value === "number") {
    const week = Math.round(value);
    if (week < 1 || week > ACADEMIC_MAX_WEEKS) return null;
    return { weeks: [week], pattern: "all" };
  }

  if (Array.isArray(value)) {
    const weeks: number[] = [];
    let pattern: WeekPattern = "all";
    for (const item of value) {
      if (typeof item === "number" || typeof item === "string") {
        const parsed = collectWeekNumbers(String(item));
        if (!parsed) return null;
        if (parsed.pattern !== "all") pattern = parsed.pattern;
        for (const week of parsed.weeks) {
          if (!weeks.includes(week)) weeks.push(week);
        }
      } else {
        return null;
      }
    }
    if (weeks.length === 0) return null;
    return { weeks: weeks.sort((a, b) => a - b), pattern };
  }

  if (typeof value !== "string") return null;
  const raw = normalizeFullWidth(value).trim();
  if (!raw) return null;

  if (format === "number") {
    const cleaned = raw.replace(/^第\s*/, "").replace(/\s*周$/, "").trim();
    if (!/^\d{1,2}$/.test(cleaned)) return null;
    const week = Number(cleaned);
    if (week < 1 || week > ACADEMIC_MAX_WEEKS) return null;
    return { weeks: [week], pattern: "all" };
  }

  return collectWeekNumbers(raw);
}

/**
 * Compress a week list into the range + odd/even shape used by course slots.
 * [1,3,5,7] becomes 1-7 odd weeks; [1,2,3,5] becomes 1-3 plus 5.
 */
export function buildAcademicWeekSegments(weeks: number[]): AcademicWeekSegment[] {
  const sorted = [...new Set(weeks)]
    .filter((week) => week >= 1 && week <= ACADEMIC_MAX_WEEKS)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const runs: number[][] = [];
  for (const week of sorted) {
    const last = runs[runs.length - 1];
    if (last && week - last[last.length - 1] === 1) last.push(week);
    else runs.push([week]);
  }

  const segments: AcademicWeekSegment[] = [];
  let index = 0;
  while (index < runs.length) {
    const run = runs[index];
    if (run.length >= 2) {
      segments.push({ weekStart: run[0], weekEnd: run[run.length - 1], pattern: "all" });
      index += 1;
      continue;
    }
    const chain = [run[0]];
    let next = index + 1;
    while (
      next < runs.length &&
      runs[next].length === 1 &&
      runs[next][0] - chain[chain.length - 1] === 2
    ) {
      chain.push(runs[next][0]);
      next += 1;
    }
    if (chain.length >= 2) {
      segments.push({
        weekStart: chain[0],
        weekEnd: chain[chain.length - 1],
        pattern: chain[0] % 2 === 1 ? "odd" : "even",
      });
      index = next;
      continue;
    }
    segments.push({ weekStart: run[0], weekEnd: run[0], pattern: "all" });
    index += 1;
  }
  return segments;
}

function parseWeekPatternValue(value: unknown): WeekPattern {
  if (value === 1 || value === "1") return "odd";
  if (value === 2 || value === "2") return "even";
  if (typeof value !== "string") return "all";
  if (/单/.test(value) || /odd/i.test(value)) return "odd";
  if (/双/.test(value) || /even/i.test(value)) return "even";
  return "all";
}

function cellText(value: unknown, max = 80): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function fieldValue(row: Record<string, unknown>, path: string): unknown {
  return path.trim() ? readJsonPath(row, path) : undefined;
}

interface ExtractedRows {
  rows: Record<string, unknown>[];
  error?: string;
}

function extractAcademicRows(payload: unknown, responsePath: string): ExtractedRows {
  const target = readJsonPath(payload, responsePath);
  const label = responsePath.trim() || "$";
  if (target === undefined) {
    return {
      rows: [],
      error: `响应里找不到路径「${label}」，请检查响应 JSON 路径。`,
    };
  }
  if (!Array.isArray(target)) {
    return {
      rows: [],
      error: `路径「${label}」对应的值不是数组，无法映射课程。`,
    };
  }
  const rows = target.filter(isRecord);
  if (rows.length === 0) {
    return {
      rows: [],
      error:
        target.length === 0
          ? "接口返回的课程数组为空。"
          : "课程数组里没有对象，无法映射字段。",
    };
  }
  return { rows };
}

export function mapAcademicResponse(
  payload: unknown,
  adapter: AcademicAdapterConfig,
): AcademicMappingResult {
  const extracted = extractAcademicRows(payload, adapter.responsePath);
  const totalItems = extracted.rows.length;
  if (totalItems === 0) {
    return {
      courses: [],
      errors: extracted.error ? [extracted.error] : [],
      totalItems: 0,
      validItems: 0,
    };
  }

  const errors: string[] = [];
  const pushError = (message: string) => {
    if (errors.length < ACADEMIC_MAX_ERRORS) errors.push(message);
  };
  const byKey = new Map<string, ParsedCourseSeed>();
  let validItems = 0;

  extracted.rows.forEach((row, index) => {
    const label = `第 ${index + 1} 条`;
    const name = cellText(fieldValue(row, adapter.fields.name));
    if (!name) {
      pushError(`${label}：缺少课程名称。`);
      return;
    }

    const day = parseAcademicWeekday(
      fieldValue(row, adapter.fields.weekday),
      adapter.weekdayFormat,
    );
    if (!day) {
      pushError(`${label}「${name}」：无法识别星期。`);
      return;
    }

    let periods: { start: number; end: number } | null = null;
    if (adapter.fields.periods.trim()) {
      periods = parseAcademicPeriods(
        fieldValue(row, adapter.fields.periods),
        adapter.periodFormat,
      );
    }
    if (!periods && (adapter.fields.periodStart.trim() || adapter.fields.periodEnd.trim())) {
      const start = toInteger(fieldValue(row, adapter.fields.periodStart));
      const end = toInteger(fieldValue(row, adapter.fields.periodEnd));
      if (start !== null) {
        periods = periodRange(start, end !== null && end >= start ? end : start);
      }
    }
    if (!periods) {
      pushError(`${label}「${name}」：无法识别节次（应在 1-${ACADEMIC_MAX_PERIODS} 节之间）。`);
      return;
    }

    let weeks: number[] = [];
    let pattern: WeekPattern = "all";
    const weeksValue = fieldValue(row, adapter.fields.weeks);
    const hasWeeksValue =
      weeksValue !== undefined && weeksValue !== null && String(weeksValue).trim() !== "";

    if (adapter.fields.weeks.trim() && hasWeeksValue) {
      const parsed = parseAcademicWeeks(weeksValue, adapter.weekFormat);
      if (!parsed) {
        pushError(`${label}「${name}」：无法识别周次。`);
        return;
      }
      weeks = parsed.weeks;
      pattern = parsed.pattern;
    } else if (adapter.fields.weekStart.trim()) {
      const start = toInteger(fieldValue(row, adapter.fields.weekStart));
      if (start === null) {
        pushError(`${label}「${name}」：无法识别起始周。`);
        return;
      }
      const endRaw = adapter.fields.weekEnd.trim()
        ? toInteger(fieldValue(row, adapter.fields.weekEnd))
        : start;
      const from = Math.min(ACADEMIC_MAX_WEEKS, Math.max(1, start));
      const to = Math.min(ACADEMIC_MAX_WEEKS, Math.max(from, endRaw ?? start));
      weeks = [];
      for (let week = from; week <= to; week += 1) weeks.push(week);
    } else {
      weeks = [];
      for (let week = 1; week <= adapter.totalWeeks; week += 1) weeks.push(week);
    }

    const explicitPattern = adapter.fields.weekPattern.trim()
      ? parseWeekPatternValue(fieldValue(row, adapter.fields.weekPattern))
      : "all";
    if (explicitPattern !== "all") pattern = explicitPattern;
    if (pattern !== "all") {
      weeks = weeks.filter((week) => (pattern === "odd" ? week % 2 === 1 : week % 2 === 0));
      if (weeks.length === 0) {
        pushError(`${label}「${name}」：周次与单双周不匹配。`);
        return;
      }
    }

    const segments = buildAcademicWeekSegments(weeks);
    if (segments.length === 0) {
      pushError(`${label}「${name}」：周次为空。`);
      return;
    }

    const teacher = cellText(fieldValue(row, adapter.fields.teacher));
    const location = cellText(fieldValue(row, adapter.fields.location));
    const key = `${name}|${teacher}|${location}`;
    let seed = byKey.get(key);
    if (!seed) {
      seed = { name, teacher, location, slots: [] };
      byKey.set(key, seed);
    }
    for (const segment of segments) {
      const duplicate = seed.slots.some(
        (slot) =>
          slot.day === day &&
          slot.start === periods!.start &&
          slot.end === periods!.end &&
          slot.weekStart === segment.weekStart &&
          slot.weekEnd === segment.weekEnd &&
          slot.pattern === segment.pattern,
      );
      if (duplicate) continue;
      seed.slots.push({
        day,
        start: periods.start,
        end: periods.end,
        weekStart: segment.weekStart,
        weekEnd: segment.weekEnd,
        pattern: segment.pattern,
      });
    }
    validItems += 1;
  });

  return { courses: [...byKey.values()], errors, totalItems, validItems };
}

export function parseAcademicResponse(
  input: string,
  adapter: AcademicAdapterConfig,
): AcademicMappingResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { courses: [], errors: ["响应内容为空。"], totalItems: 0, validItems: 0 };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      courses: [],
      errors: ["响应不是有效的 JSON，可能被登录页重定向或返回了 HTML。"],
      totalItems: 0,
      validItems: 0,
    };
  }
  return mapAcademicResponse(payload, adapter);
}

export function validateAdapterConfig(adapter: AcademicAdapterConfig): AcademicValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = adapter.name.trim();
  if (!name) errors.push("请填写档案名称。");
  else if (name.length > 40) errors.push("档案名称请控制在 40 字以内。");

  const url = adapter.url.trim();
  if (!url) {
    errors.push("请填写教务接口 URL。");
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.push("接口 URL 只支持 http / https。");
      }
      if (url.startsWith("http://")) {
        warnings.push("接口使用 http 明文协议，可能被系统拦截或存在安全风险。");
      }
    } catch {
      errors.push("接口 URL 格式不正确。");
    }
  }

  if (adapter.method !== "GET" && adapter.method !== "POST") {
    errors.push("请求方式只能是 GET 或 POST。");
  }

  const headerResult = parseAdapterHeaders(adapter.headers);
  if (!headerResult.ok) errors.push(`请求头：${headerResult.error ?? "格式不正确。"}`);
  if (adapter.method === "GET" && adapter.body.trim()) {
    errors.push("GET 请求不能携带请求体，请清空正文或改用 POST。");
  }
  if (adapter.method === "POST" && adapter.body.trim()) {
    try {
      JSON.parse(adapter.body) as unknown;
    } catch {
      errors.push("请求体不是有效的 JSON。");
    }
  }

  if (!isValidJsonPath(adapter.responsePath)) {
    errors.push("响应 JSON 路径格式不正确，只支持点路径与 [数字] 下标。");
  }

  for (const key of ACADEMIC_FIELD_KEYS) {
    const path = adapter.fields[key].trim();
    if (path && !isValidJsonPath(path)) {
      errors.push(`字段「${FIELD_LABELS[key]}」的路径格式不正确。`);
    }
  }

  if (!adapter.fields.name.trim()) errors.push("缺少课程名称字段路径。");
  if (!adapter.fields.weekday.trim()) errors.push("缺少星期字段路径。");

  const hasPeriods = Boolean(adapter.fields.periods.trim());
  const hasStart = Boolean(adapter.fields.periodStart.trim());
  const hasEnd = Boolean(adapter.fields.periodEnd.trim());
  if (!hasPeriods && !hasStart && !hasEnd) {
    errors.push("请配置节次字段：可直接映射节次，或分别映射开始节与结束节。");
  } else if (!hasPeriods && hasStart !== hasEnd) {
    errors.push("开始节与结束节需要同时配置。");
  }

  const hasWeeks = Boolean(adapter.fields.weeks.trim());
  const hasWeekStart = Boolean(adapter.fields.weekStart.trim());
  const hasWeekEnd = Boolean(adapter.fields.weekEnd.trim());
  if (!hasWeeks && hasWeekStart !== hasWeekEnd) {
    errors.push("起始周与结束周需要同时配置，或只配置一个周次字段。");
  }
  if (!hasWeeks && !hasWeekStart) {
    warnings.push("未配置周次字段，导入时会按总周数默认全周。");
  }
  if (!adapter.fields.teacher.trim() && !adapter.fields.location.trim()) {
    warnings.push("未配置教师或地点字段，课程信息会留空。");
  }

  if (
    !Number.isInteger(adapter.totalWeeks) ||
    adapter.totalWeeks < 1 ||
    adapter.totalWeeks > ACADEMIC_MAX_WEEKS
  ) {
    errors.push(`总周数需为 1-${ACADEMIC_MAX_WEEKS} 的整数。`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

function parseMaybeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function responseMessage(value: unknown): string {
  if (typeof value === "string") return value.trim().slice(0, 160);
  if (!isRecord(value)) return "";
  for (const key of ["message", "msg", "error", "errorMsg", "error_msg", "info"]) {
    const item = value[key];
    if (typeof item === "string" && item.trim()) return item.trim().slice(0, 160);
    if (isRecord(item) && typeof item.message === "string" && item.message.trim()) {
      return item.message.trim().slice(0, 160);
    }
  }
  return "";
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}

export async function requestAcademicEndpoint(
  adapter: AcademicAdapterConfig,
  options: AcademicRequestOptions = {},
): Promise<AcademicRequestResult> {
  const started = Date.now();
  const fail = (
    kind: AcademicFailureKind,
    message: string,
    extra: { status?: number | null; rawText?: string } = {},
  ): AcademicRequestResult => ({
    ok: false,
    kind,
    status: extra.status ?? null,
    message,
    data: undefined,
    rawText: extra.rawText ?? "",
    durationMs: Date.now() - started,
  });

  const validation = validateAdapterConfig(adapter);
  if (!validation.ok) {
    return fail("config", validation.errors[0] ?? "适配器配置不完整。");
  }
  const headerResult = parseAdapterHeaders(adapter.headers);
  if (!headerResult.ok) {
    return fail("config", headerResult.error ?? "请求头格式不正确。");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(adapter.url.trim());
  } catch {
    return fail("invalid-url", "接口 URL 格式不正确。");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return fail("invalid-url", "接口 URL 只支持 http / https。");
  }

  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? ACADEMIC_DEFAULT_TIMEOUT_MS, 100),
    60000,
  );
  const headers = { ...headerResult.headers };
  const body = adapter.body.trim();
  if (adapter.method === "POST" && body && !hasHeader(headers, "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  let native = options.native;
  if (native === undefined) {
    try {
      const { Capacitor } = await import("@capacitor/core");
      native = Capacitor.isNativePlatform();
    } catch {
      native = false;
    }
  }

  const fromPayload = (
    status: number,
    payload: unknown,
    raw: string,
  ): AcademicRequestResult => {
    if (status < 200 || status >= 300) {
      const detail = responseMessage(payload);
      const hint =
        status === 401 || status === 403
          ? " 登录信息可能已失效，请在请求头里补充 Cookie 或 Token。"
          : "";
      return fail("http", `接口返回 ${status}${detail ? `：${detail}` : ""}。${hint}`, {
        status,
        rawText: raw,
      });
    }
    if (!raw.trim()) {
      return fail("empty", "接口返回了空响应，请检查是否需要登录或参数是否正确。", {
        status,
      });
    }
    if (payload === undefined) {
      return fail(
        "json",
        `接口返回的内容不是 JSON，可能被登录页重定向。片段：${raw.trim().slice(0, 120)}`,
        { status, rawText: raw },
      );
    }
    return {
      ok: true,
      kind: "ok",
      status,
      message: `请求成功（HTTP ${status}）。`,
      data: payload,
      rawText: raw,
      durationMs: Date.now() - started,
    };
  };

  if (native) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      let data: unknown;
      if (adapter.method === "POST" && body) {
        try {
          data = JSON.parse(body) as unknown;
        } catch {
          return fail("config", "请求体不是有效的 JSON。");
        }
      }
      const response = await CapacitorHttp.request({
        url: parsedUrl.toString(),
        method: adapter.method,
        headers,
        data,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      const payload =
        typeof response.data === "string" ? parseMaybeJson(response.data) : response.data;
      const raw =
        typeof response.data === "string"
          ? response.data
          : response.data === undefined
            ? ""
            : JSON.stringify(response.data, null, 2);
      return fromPayload(response.status, payload, raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/timeout|timed out|time out/i.test(message)) {
        return fail("timeout", `请求超过 ${Math.round(timeoutMs / 1000)} 秒未响应，已中止。`);
      }
      return fail(
        "network",
        `App 内请求失败：${message || "网络异常，请检查网络或接口地址。"}`,
      );
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(parsedUrl.toString(), {
      method: adapter.method,
      headers,
      body: adapter.method === "POST" && body ? body : undefined,
      signal: controller.signal,
    });
    const raw = await response.text();
    const payload = raw.trim() ? parseMaybeJson(raw) : undefined;
    return fromPayload(response.status, payload, raw);
  } catch (error) {
    if (controller.signal.aborted) {
      return fail("timeout", `请求超过 ${Math.round(timeoutMs / 1000)} 秒未响应，已中止。`);
    }
    if (error instanceof TypeError) {
      return fail(
        "cors",
        "浏览器拦截了这次请求：常见原因是教务接口没有开放 CORS 跨域，或网络不可达。Web 版无法绕过，请改用 App 内导入。",
      );
    }
    return fail(
      "network",
      `请求失败：${error instanceof Error ? error.message : "网络异常，请稍后再试。"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function formatAcademicSnippet(raw: string, limit = 2400): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}\n…（已截断，共 ${trimmed.length} 字符）`;
}

export async function testAcademicAdapter(
  adapter: AcademicAdapterConfig,
  options: AcademicRequestOptions = {},
): Promise<AcademicTestOutcome> {
  const testedAt = new Date().toISOString();
  const base = {
    testedAt,
    itemCount: 0,
    courseCount: 0,
    slotCount: 0,
    rawSnippet: "",
    courses: [] as ParsedCourseSeed[],
    errors: [] as string[],
  };

  const validation = validateAdapterConfig(adapter);
  if (!validation.ok) {
    return {
      ...base,
      status: "failed",
      message: validation.errors[0] ?? "适配器配置不完整。",
      errors: validation.errors,
    };
  }

  const request = await requestAcademicEndpoint(adapter, options);
  const rawSnippet = formatAcademicSnippet(request.rawText);
  if (!request.ok) {
    return {
      ...base,
      status: "failed",
      message: request.message,
      rawSnippet,
      errors: [request.message],
    };
  }

  const mapping = mapAcademicResponse(request.data, adapter);
  const slotCount = mapping.courses.reduce((total, seed) => total + seed.slots.length, 0);
  if (mapping.courses.length === 0) {
    return {
      ...base,
      status: "failed",
      message: mapping.errors[0] ?? "接口请求成功，但没有解析到课程。",
      itemCount: mapping.totalItems,
      rawSnippet,
      errors: mapping.errors,
    };
  }

  const skipped = mapping.totalItems - mapping.validItems;
  return {
    ...base,
    status: "ok",
    message: `请求成功：读取 ${mapping.validItems}/${mapping.totalItems} 条记录${
      skipped > 0 ? `，跳过 ${skipped} 条无法映射的记录` : ""
    }。`,
    itemCount: mapping.totalItems,
    courseCount: mapping.courses.length,
    slotCount,
    rawSnippet,
    courses: mapping.courses,
    errors: mapping.errors,
  };
}
