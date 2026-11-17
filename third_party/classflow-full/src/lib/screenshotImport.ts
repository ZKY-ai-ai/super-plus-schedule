/**
 * 截图与图片工具（AI 附件共用）
 *
 * 只负责三件事：
 * 1. 校验并压缩本地截图，生成 data URL；
 * 2. 把图片和严格 JSON 要求发给用户自己配置的 OpenAI 兼容视觉模型；
 * 3. 逐项校验模型输出，转换成现有的 ParsedCourseSeed。
 *
 * 不内置模型、不在本地伪造课程；接口失败或结果为空都会明确报错。
 */
import type { WeekPattern } from "../types";
import type { ParsedCourseSeed } from "./textImport";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ScreenshotVisionConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface VisionSettingsLike {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface ScreenshotParseResult {
  courses: ParsedCourseSeed[];
  errors: string[];
}

export const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1600;
export const MAX_SCREENSHOT_COURSES = 40;
export const MAX_SCREENSHOT_SLOTS = 200;
export const MAX_VISION_CONTENT_CHARS = 200_000;
export const MAX_COURSE_NAME_LENGTH = 60;
export const MAX_COURSE_FIELD_LENGTH = 40;
export const MAX_PERIOD = 24;
export const MAX_WEEK = 30;
export const SCREENSHOT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const SCREENSHOT_MIME_TYPES = SCREENSHOT_ACCEPT.split(",");

/* ------------------------------ 图片处理 ------------------------------ */

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/") || !SCREENSHOT_MIME_TYPES.includes(file.type)) {
    return "只支持 PNG、JPG、WebP 或 GIF 截图。";
  }
  if (file.size <= 0) return "图片是空文件，换一张试试。";
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return `图片超过 ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)} MB，请先裁剪或压缩。`;
  }
  return null;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("当前环境不支持读取本地文件。"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result.startsWith("data:image/")) {
        resolve(reader.result);
      } else {
        reject(new Error("图片读取失败，请换一张试试。"));
      }
    };
    reader.onerror = () => reject(new Error("图片读取失败，请换一张试试。"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败。"));
    image.src = dataUrl;
  });
}

/**
 * 只缩小、不放大；最长边压到 1600px 以内，再按 JPEG 输出。
 * 环境不支持 canvas 时返回原图，由调用方继续处理。
 */
export async function compressImageDataUrl(
  dataUrl: string,
  maxEdge = MAX_IMAGE_EDGE,
): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") return dataUrl;
  try {
    const image = await loadImage(dataUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const longest = Math.max(width, height);
    if (!longest || longest <= maxEdge) return dataUrl;
    const scale = maxEdge / longest;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const compressed = canvas.toDataURL("image/jpeg", 0.9);
    return compressed.startsWith("data:image/") ? compressed : dataUrl;
  } catch {
    return dataUrl;
  }
}

/* ------------------------------ 请求构造 ------------------------------ */

export const SCREENSHOT_SYSTEM_PROMPT = [
  "你是课表截图识别助手。你的唯一任务是读取图片里的课程表，输出严格的 JSON 数组。",
  "不要输出 Markdown 代码块、解释、前后缀或任何多余文字，只输出数组本身。",
  "每个数组项代表一条上课时间段，字段如下：",
  '{"name": "课程名", "teacher": "老师，没有就留空", "location": "教室，没有就留空", "day": 1-7 的整数（周一为 1）, "startPeriod": 开始节次整数, "endPeriod": 结束节次整数, "startWeek": 开始周整数, "endWeek": 结束周整数, "pattern": "all" | "odd" | "even"}',
  "规则：",
  "1. 同一门课有多个上课时间时输出多项，每项都要带相同的课程名。",
  "2. 只读取图片中能看清的内容；看不清的字段留空字符串或直接省略，不要编造。",
  "3. 明确写着「单周」时 pattern 用 odd，「双周」用 even，其余用 all。",
  "4. 节次和周次必须是正整数，结束值不小于开始值。",
].join("\n");

export type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export interface VisionMessage {
  role: "system" | "user";
  content: string | VisionContentPart[];
}

export function buildScreenshotMessages(
  dataUrl: string,
  totalWeeks = 20,
): VisionMessage[] {
  const weeks = Number.isFinite(totalWeeks)
    ? Math.min(Math.max(Math.round(totalWeeks), 1), MAX_WEEK)
    : 20;
  return [
    { role: "system", content: SCREENSHOT_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `这是大学课表截图，当前学期共 ${weeks} 周。请按约定只输出 JSON 数组，最多 ${MAX_SCREENSHOT_COURSES} 条。`,
        },
        { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
      ],
    },
  ];
}


export function visionConfigFromAiSettings(
  settings: VisionSettingsLike | null | undefined,
): ScreenshotVisionConfig | null {
  if (!settings) return null;
  const provider = (settings.provider ?? "").trim();
  if (!provider || provider === "local") return null;
  const baseUrl = (settings.baseUrl ?? "").trim().replace(/\/+$/, "");
  const apiKey = (settings.apiKey ?? "").trim();
  const model = (settings.model ?? "").trim();
  if (!baseUrl || !model) return null;
  if (!/^https?:\/\//i.test(baseUrl)) return null;
  const keyOptional = provider === "ollama" || provider === "lmstudio" || provider === "custom";
  if (!apiKey && !keyOptional) return null;
  return { baseUrl, apiKey, model };
}

/* ------------------------------ JSON 解析 ------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 纯 JSON、代码块 JSON、前后带少量说明文字都能取出主体。 */
export function extractJsonPayload(content: string): string {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const start = trimmed.search(/[[{]/);
  if (start === -1) return trimmed;
  const end = Math.max(trimmed.lastIndexOf("]"), trimmed.lastIndexOf("}"));
  if (end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

const DAY_ALIASES: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
  周一: 1,
  周二: 2,
  周三: 3,
  周四: 4,
  周五: 5,
  周六: 6,
  周日: 7,
  周天: 7,
  星期一: 1,
  星期二: 2,
  星期三: 3,
  星期四: 4,
  星期五: 5,
  星期六: 6,
  星期日: 7,
  星期天: 7,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function parseDay(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 && value <= 7 ? value : null;
  }
  const text = normalizeText(value).toLocaleLowerCase();
  if (!text) return null;
  const direct = DAY_ALIASES[text];
  if (direct) return direct;
  const stripped = DAY_ALIASES[text.replace(/^(周|星期|礼拜)/, "")];
  if (stripped) return stripped;
  const digit = /(?:^|\D)([1-7])(?:\D|$)/.exec(text);
  return digit ? Number(digit[1]) : null;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string" && /^\s*\d{1,2}\s*$/.test(value)) return Number(value.trim());
  return null;
}

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function parseRangeText(value: string): { start: number; end: number } | null {
  const range = /(\d{1,2})\s*[-–—~至到]\s*(\d{1,2})/.exec(value);
  if (range) return { start: Number(range[1]), end: Number(range[2]) };
  const single = /(\d{1,2})/.exec(value);
  if (single) {
    const number = Number(single[1]);
    return { start: number, end: number };
  }
  return null;
}

function normalizePattern(value: unknown): WeekPattern | null {
  if (value === "all" || value === "odd" || value === "even") return value;
  if (typeof value !== "string") return null;
  const text = value.trim().toLocaleLowerCase();
  if (text === "all" || text === "每周" || text === "全周") return "all";
  if (text === "odd" || text.includes("单")) return "odd";
  if (text === "even" || text.includes("双")) return "even";
  return null;
}

interface WeekValue {
  start: number;
  end: number;
  pattern: WeekPattern;
  note: string | null;
}

function parseWeeksValue(value: unknown): WeekValue | null {
  if (Array.isArray(value)) {
    const numbers = value
      .map(parseInteger)
      .filter((item): item is number => item !== null);
    if (numbers.length === 0) return null;
    const start = Math.min(...numbers);
    const end = Math.max(...numbers);
    const contiguous = new Set(numbers).size === end - start + 1;
    return {
      start,
      end,
      pattern: "all",
      note: contiguous ? null : "周次不连续，已按最小–最大周导入，请核对。",
    };
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { start: value, end: value, pattern: "all", note: null }
      : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const pattern: WeekPattern = /单/.test(text)
    ? "odd"
    : /双/.test(text)
      ? "even"
      : "all";
  const ranges = [...text.matchAll(/(\d{1,2})\s*[-–—~至到]\s*(\d{1,2})/g)];
  if (ranges.length === 0) {
    const single = /(\d{1,2})/.exec(text);
    if (!single) return null;
    const number = Number(single[1]);
    return { start: number, end: number, pattern, note: null };
  }
  const start = Math.min(...ranges.map((range) => Number(range[1])));
  const end = Math.max(...ranges.map((range) => Number(range[2])));
  return {
    start,
    end,
    pattern,
    note: ranges.length > 1 ? "周次包含多段，已按最小–最大周导入，请核对。" : null,
  };
}

function parsePeriods(
  record: Record<string, unknown>,
): { start: number; end: number } | null {
  const startRaw = firstValue(record, ["startPeriod", "start", "开始节"]);
  const endRaw = firstValue(record, ["endPeriod", "end", "结束节"]);
  if (startRaw !== undefined) {
    const start = parseInteger(startRaw);
    if (start === null) return null;
    if (endRaw === undefined) return { start, end: start };
    const end = parseInteger(endRaw);
    return end === null ? null : { start, end };
  }
  if (endRaw !== undefined) return null;
  const text = normalizeText(firstValue(record, ["periods", "period", "节次"]));
  return text ? parseRangeText(text) : null;
}

function sanitizeField(
  value: unknown,
  label: string,
  fieldLabel: string,
  errors: string[],
): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    errors.push(`${label}：${fieldLabel}不是文本，已忽略该字段。`);
    return "";
  }
  const text = normalizeText(value);
  if (text.length > MAX_COURSE_FIELD_LENGTH) {
    errors.push(
      `${label}：${fieldLabel}超过 ${MAX_COURSE_FIELD_LENGTH} 个字符，已截断，请核对。`,
    );
    return text.slice(0, MAX_COURSE_FIELD_LENGTH);
  }
  return text;
}

/* ------------------------------ 课程校验 ------------------------------ */

export function parseScreenshotCourses(
  rawCourses: unknown[],
  totalWeeks = 20,
): ScreenshotParseResult {
  const errors: string[] = [];
  const seeds = new Map<string, ParsedCourseSeed>();
  const weekLimit = Number.isFinite(totalWeeks)
    ? Math.min(Math.max(Math.round(totalWeeks), 1), MAX_WEEK)
    : 20;

  if (rawCourses.length === 0) {
    errors.push("模型返回的课程列表是空的。");
    return { courses: [], errors };
  }

  let list = rawCourses;
  if (list.length > MAX_SCREENSHOT_COURSES) {
    errors.push(
      `识别到 ${list.length} 条课程，超过 ${MAX_SCREENSHOT_COURSES} 条上限，只处理前 ${MAX_SCREENSHOT_COURSES} 条。`,
    );
    list = list.slice(0, MAX_SCREENSHOT_COURSES);
  }

  let slotCount = 0;
  let slotLimitHit = false;

  for (let index = 0; index < list.length; index += 1) {
    if (slotLimitHit) break;
    const item = list[index];
    if (!isRecord(item)) {
      errors.push(`第 ${index + 1} 项：不是有效的课程对象，已跳过。`);
      continue;
    }
    const name = normalizeText(firstValue(item, ["name", "course", "courseName", "课程"]));
    const label = `第 ${index + 1} 项${name ? `「${name.slice(0, 20)}」` : ""}`;
    if (!name) {
      errors.push(`${label}：缺少课程名，已跳过。`);
      continue;
    }
    if (name.length > MAX_COURSE_NAME_LENGTH) {
      errors.push(
        `${label}：课程名超过 ${MAX_COURSE_NAME_LENGTH} 个字符，已跳过。`,
      );
      continue;
    }

    const rawDay = firstValue(item, ["day", "weekday", "星期"]);
    const day = parseDay(rawDay);
    if (rawDay === undefined) {
      errors.push(`${label}：缺少星期，已跳过。`);
      continue;
    }
    if (day === null) {
      errors.push(`${label}：星期「${String(rawDay).slice(0, 10)}」无效，应为 1–7，已跳过。`);
      continue;
    }

    const periods = parsePeriods(item);
    if (!periods) {
      errors.push(`${label}：缺少或无法识别节次，已跳过。`);
      continue;
    }
    if (
      periods.start < 1 ||
      periods.end < periods.start ||
      periods.end > MAX_PERIOD
    ) {
      errors.push(
        `${label}：节次 ${periods.start}–${periods.end} 无效，应为 1–${MAX_PERIOD} 且结束不小于开始，已跳过。`,
      );
      continue;
    }

    const startWeekRaw = firstValue(item, ["startWeek", "weekStart", "开始周"]);
    const endWeekRaw = firstValue(item, ["endWeek", "weekEnd", "结束周"]);
    const weeksRaw = firstValue(item, ["weeks", "周次"]);
    const patternRaw = firstValue(item, ["pattern", "oddEven", "单双周"]);

    let weekStart = 1;
    let weekEnd = weekLimit;
    let pattern: WeekPattern = "all";
    let weekNote: string | null = null;
    let hasWeeks = false;

    if (startWeekRaw !== undefined || endWeekRaw !== undefined) {
      const start = parseInteger(startWeekRaw);
      const end = parseInteger(endWeekRaw);
      if (start === null || end === null) {
        errors.push(`${label}：开始周和结束周必须同时是整数，已跳过。`);
        continue;
      }
      weekStart = start;
      weekEnd = end;
      hasWeeks = true;
    } else if (weeksRaw !== undefined) {
      const parsedWeeks = parseWeeksValue(weeksRaw);
      if (!parsedWeeks) {
        errors.push(
          `${label}：周次「${String(weeksRaw).slice(0, 20)}」无法识别，已跳过。`,
        );
        continue;
      }
      weekStart = parsedWeeks.start;
      weekEnd = parsedWeeks.end;
      pattern = parsedWeeks.pattern;
      weekNote = parsedWeeks.note;
      hasWeeks = true;
    }

    if (
      weekStart < 1 ||
      weekEnd < weekStart ||
      weekEnd > MAX_WEEK
    ) {
      errors.push(
        `${label}：周次 ${weekStart}–${weekEnd} 无效，应为 1–${MAX_WEEK} 且结束不小于开始，已跳过。`,
      );
      continue;
    }

    if (patternRaw !== undefined) {
      const explicitPattern = normalizePattern(patternRaw);
      if (explicitPattern) {
        pattern = explicitPattern;
      } else {
        errors.push(`${label}：单双周「${String(patternRaw).slice(0, 10)}」无法识别，按每周导入。`);
      }
    }
    if (!hasWeeks) {
      weekNote = `未识别到周次，按第 1–${weekLimit} 周导入，请核对。`;
    }
    if (weekNote) errors.push(`${label}：${weekNote}`);

    const teacher = sanitizeField(
      firstValue(item, ["teacher", "老师", "教师"]),
      label,
      "老师",
      errors,
    );
    const location = sanitizeField(
      firstValue(item, ["location", "room", "教室", "地点"]),
      label,
      "教室",
      errors,
    );

    const key = `${name}|${teacher}`;
    let seed = seeds.get(key);
    if (!seed) {
      seed = { name, teacher, location, slots: [] };
      seeds.set(key, seed);
    }
    if (!seed.location && location) seed.location = location;

    const start = Math.min(periods.start, periods.end);
    const end = Math.max(periods.start, periods.end);
    const duplicate = seed.slots.some(
      (slot) =>
        slot.day === day &&
        slot.start === start &&
        slot.end === end &&
        slot.weekStart === weekStart &&
        slot.weekEnd === weekEnd &&
        slot.pattern === pattern,
    );
    if (duplicate) continue;
    if (slotCount >= MAX_SCREENSHOT_SLOTS) {
      errors.push(`时间段超过 ${MAX_SCREENSHOT_SLOTS} 个上限，其余已忽略。`);
      slotLimitHit = true;
      break;
    }
    seed.slots.push({
      day,
      start,
      end,
      weekStart,
      weekEnd,
      pattern,
    });
    slotCount += 1;
  }

  const courses = [...seeds.values()].filter((course) => course.slots.length > 0);
  if (courses.length === 0) {
    errors.push("没有识别到可用课程。");
  }
  return { courses, errors };
}

export function parseScreenshotCourseJson(
  content: string,
  totalWeeks = 20,
): ScreenshotParseResult {
  if (typeof content !== "string" || !content.trim()) {
    return { courses: [], errors: ["模型没有返回任何内容。"] };
  }
  if (content.length > MAX_VISION_CONTENT_CHARS) {
    return {
      courses: [],
      errors: [
        `模型返回内容过长（${content.length} 字符，上限 ${MAX_VISION_CONTENT_CHARS}），已拒绝解析。`,
      ],
    };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(extractJsonPayload(content));
  } catch {
    return {
      courses: [],
      errors: ["模型返回的内容不是有效 JSON，请重试或换一张更清晰的截图。"],
    };
  }
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.courses)
      ? payload.courses
      : null;
  if (!list) {
    return { courses: [], errors: ["模型返回的 JSON 不是课程数组。"] };
  }
  return parseScreenshotCourses(list, totalWeeks);
}

/* ------------------------------ 接口请求 ------------------------------ */

export class ScreenshotImportError extends Error {
  readonly errors: string[];

  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = "ScreenshotImportError";
    this.errors = errors;
  }
}

function readServerError(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) {
      if (isRecord(parsed.error) && typeof parsed.error.message === "string") {
        return parsed.error.message.trim().slice(0, 200);
      }
      if (typeof parsed.message === "string") return parsed.message.trim().slice(0, 200);
    }
  } catch {
    // 非 JSON 错误页，直接截取原文。
  }
  return raw.trim().slice(0, 200);
}

function extractAssistantContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    return "";
  }
  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return "";
  const content = choice.message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

export interface RecognizeScreenshotOptions {
  dataUrl: string;
  config: ScreenshotVisionConfig | null | undefined;
  totalWeeks?: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

export async function recognizeScreenshot(
  options: RecognizeScreenshotOptions,
): Promise<ScreenshotParseResult> {
  const config = options.config;
  if (!config?.baseUrl.trim() || !config.model.trim()) {
    throw new ScreenshotImportError(
      "还没有可用的视觉模型配置。请先在「设置 → AI 与授权」选择云端或本地模型，填写 Base URL、API Key（本地可留空）和支持图片输入的模型。",
    );
  }
  if (!options.dataUrl.startsWith("data:image/")) {
    throw new ScreenshotImportError("请先选择一张课表截图。");
  }

  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((input, init) => fetch(input, init));
  const controller =
    options.signal || typeof AbortController === "undefined" ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), 90_000);
  }
  const signal = options.signal ?? controller?.signal;
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildScreenshotMessages(options.dataUrl, options.totalWeeks ?? 20),
        temperature: 0.1,
        max_tokens: 2000,
      }),
      ...(signal ? { signal } : {}),
    });
    const raw = await response.text();
    if (!response.ok) {
      const detail = readServerError(raw);
      throw new ScreenshotImportError(
        `视觉模型接口返回 ${response.status}${detail ? `：${detail}` : ""}。请确认模型支持图片输入，并检查 Base URL、Key 与模型名。`,
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ScreenshotImportError(
        "视觉模型接口返回了无法解析的响应，请确认 Base URL 指向兼容 OpenAI 的接口。",
      );
    }
    const content = extractAssistantContent(payload);
    if (!content) {
      throw new ScreenshotImportError(
        "视觉模型没有返回内容，可能不支持图片输入或图片过大。",
      );
    }
    const result = parseScreenshotCourseJson(content, options.totalWeeks ?? 20);
    if (result.courses.length === 0) {
      throw new ScreenshotImportError(
        "没有从截图里识别到可用课程，请换一张更清晰、完整的截图重试。",
        result.errors,
      );
    }
    return result;
  } catch (error) {
    if (error instanceof ScreenshotImportError) throw error;
    const name = isRecord(error) && typeof error.name === "string" ? error.name : "";
    if (name === "AbortError") {
      throw new ScreenshotImportError("识别请求已取消或超时，请重试。");
    }
    throw new ScreenshotImportError(
      "网络请求失败：请检查 Base URL 是否可访问，以及服务端是否允许浏览器跨域（CORS）。",
    );
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
