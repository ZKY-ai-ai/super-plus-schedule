import type { ParsedCourseSeed } from "./textImport";
import { parseCourseText } from "./textImport";
import {
  detectHeaderRow,
  guessColumnMapping,
  mapCourseRows,
  mappingReady,
} from "./excelMapping";
import { readXlsxRows, type XlsxSheet } from "./xlsx";
import { readDocx } from "./docx";
import { readPdfText } from "./pdf";
import { parseIcsEvents } from "./transfer";
import {
  MAX_SCREENSHOT_BYTES,
  compressImageDataUrl,
  readFileAsDataUrl,
  validateImageFile,
} from "./screenshotImport";

export type AiAttachmentKind = "text" | "spreadsheet" | "image" | "document" | "unsupported";
export type AiAttachmentStatus = "reading" | "ready" | "error";

export interface AiAttachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: AiAttachmentKind;
  status: AiAttachmentStatus;
  summary: string;
  text?: string;
  imageDataUrl?: string;
  courseSeeds?: ParsedCourseSeed[];
  error?: string;
}

export interface AiAttachmentMeta {
  name: string;
  kind: AiAttachmentKind;
  size: number;
}

export const MAX_AI_ATTACHMENTS = 6;
export const MAX_AI_ATTACHMENT_IMAGES = 4;
export const MAX_AI_ATTACHMENT_BYTES = MAX_SCREENSHOT_BYTES;
export const MAX_AI_ATTACHMENT_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_AI_ATTACHMENT_TEXT_CHARS = 8000;
export const MAX_AI_ATTACHMENT_PROMPT_CHARS = 20000;

export const AI_ATTACHMENT_ACCEPT = [
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".xlsx",
  ".docx",
  ".pdf",
  ".ics",
  ".html",
  ".htm",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "ics",
  "html",
  "htm",
  "log",
  "xml",
  "yaml",
  "yml",
]);
const SHEET_EXTENSIONS = new Set(["xlsx", "csv", "tsv"]);
const DOCUMENT_EXTENSIONS = new Set(["docx", "pdf"]);
const LEGACY_EXTENSIONS = new Set(["xls", "doc", "ppt", "pptx", "zip", "rar", "7z"]);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const DAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function attachmentExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLocaleLowerCase() : "";
}

export function classifyAttachment(name: string, mime = ""): AiAttachmentKind {
  const extension = attachmentExtension(name);
  const type = mime.toLocaleLowerCase();
  if (IMAGE_MIME_TYPES.has(type) || ["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) {
    return "image";
  }
  if (SHEET_EXTENSIONS.has(extension)) return "spreadsheet";
  if (
    DOCUMENT_EXTENSIONS.has(extension) ||
    type === "application/pdf" ||
    type === DOCX_MIME
  ) {
    return "document";
  }
  if (TEXT_EXTENSIONS.has(extension) || type.startsWith("text/")) return "text";
  return "unsupported";
}

export function attachmentKindLabel(kind: AiAttachmentKind): string {
  if (kind === "image") return "图片";
  if (kind === "spreadsheet") return "表格";
  if (kind === "document") return "文档";
  if (kind === "text") return "文本";
  return "不支持";
}

export function formatAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentId(): string {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createPendingAttachment(file: File): AiAttachment {
  const kind = classifyAttachment(file.name, file.type);
  return {
    id: attachmentId(),
    name: file.name || "未命名文件",
    size: file.size,
    mime: file.type,
    kind,
    status: kind === "unsupported" ? "error" : "reading",
    summary: kind === "unsupported" ? "暂不支持这种文件" : "正在本地解析…",
    ...(kind === "unsupported" ? { error: unsupportedMessage(file.name, file.type) } : {}),
  };
}

function unsupportedMessage(name: string, mime = ""): string {
  const extension = attachmentExtension(name);
  if (extension === "xls") {
    return "旧版 .xls 暂不支持，请另存为 .xlsx 或 .csv 后再拖入。";
  }
  if (extension === "doc") {
    return "旧版 .doc 暂不支持，请用 Word 另存为 .docx 后再拖入。";
  }
  if (LEGACY_EXTENSIONS.has(extension)) {
    return `.${extension} 暂不支持，请先转换成 .docx、.pdf、.txt、.md、.csv 或 .xlsx。`;
  }
  const type = mime ? `（${mime}）` : "";
  return `暂不支持这种文件${type}。支持图片、Word/PDF、xlsx/csv/tsv 表格和 txt/md/json/ics 等文本。`;
}

function guessKindFromContent(name: string, value: string): AiAttachmentKind {
  const trimmed = value.trim();
  if (!trimmed) return "text";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    if (attachmentExtension(name) === "json") return "text";
  }
  const rows = parseDelimitedText(trimmed, 3, 8);
  if (rows.length >= 2 && rows[0].filter((cell) => cell.trim()).length >= 2) {
    return "spreadsheet";
  }
  return "text";
}

async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_AI_ATTACHMENT_TEXT_BYTES) {
    throw new Error(
      `文本超过 ${Math.round(MAX_AI_ATTACHMENT_TEXT_BYTES / 1024 / 1024)} MB，请先截取需要的部分。`,
    );
  }
  const buffer = await file.arrayBuffer();
  const decoded = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  const broken = (decoded.match(/\uFFFD/g) ?? []).length;
  if (broken > 8 && broken > decoded.length * 0.01) {
    throw new Error("这个文件可能不是 UTF-8 编码，请另存为 UTF-8 后再拖入。");
  }
  return decoded;
}

function clipText(value: string, max = MAX_AI_ATTACHMENT_TEXT_CHARS): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}\n…（已截断）` : normalized;
}

/* ------------------------------ 分隔文本表格 ------------------------------ */

function delimiterScore(line: string, delimiter: string): number {
  let score = 0;
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === delimiter) score += 1;
  }
  return score;
}

export function detectDelimiter(raw: string): string {
  const sample = raw.split(/\r?\n/).filter((line) => line.trim()).slice(0, 5).join("\n");
  const candidates = ["\t", ",", ";", "|"];
  let best = "\t";
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = sample.split(/\r?\n/).reduce(
      (total, line) => total + delimiterScore(line, candidate),
      0,
    );
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
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
    if (!quoted && char === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseDelimitedText(
  raw: string,
  maxRows = 200,
  maxCols = 20,
): string[][] {
  const delimiter = detectDelimiter(raw);
  const rows: string[][] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (rows.length >= maxRows) break;
    rows.push(splitDelimitedLine(line, delimiter).slice(0, maxCols));
  }
  return rows;
}

/* ------------------------------ 课程识别 ------------------------------ */

export function courseSeedsFromRows(
  rows: string[][],
  totalWeeks = 20,
): ParsedCourseSeed[] {
  if (rows.length < 2) return [];
  const headerRow = detectHeaderRow(rows);
  const mapping = guessColumnMapping(rows[headerRow] ?? []);
  if (!mappingReady(mapping)) return [];
  const result = mapCourseRows(rows, mapping, {
    totalWeeks,
    startRow: headerRow + 1,
  });
  return result.courses;
}

export function courseSeedsToText(seeds: ParsedCourseSeed[]): string {
  const lines: string[] = [];
  for (const course of seeds) {
    for (const slot of course.slots) {
      const parts = [
        course.name,
        DAY_NAMES[slot.day] ?? "",
        slot.start === slot.end
          ? `第${slot.start}节`
          : `第${slot.start}-${slot.end}节`,
        slot.weekStart === slot.weekEnd
          ? `第${slot.weekStart}周`
          : `${slot.weekStart}-${slot.weekEnd}周`,
        slot.pattern === "odd" ? "单周" : slot.pattern === "even" ? "双周" : "",
        course.location ? `地点：${course.location}` : "",
        course.teacher ? `@${course.teacher}` : "",
      ].filter(Boolean);
      lines.push(parts.join(" "));
    }
  }
  return lines.join("\n");
}

function uniqueCourseSeeds(seeds: ParsedCourseSeed[]): ParsedCourseSeed[] {
  const byKey = new Map<string, ParsedCourseSeed>();
  for (const seed of seeds) {
    const key = `${seed.name}|${seed.teacher}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...seed, slots: [...seed.slots] });
      continue;
    }
    if (!existing.location && seed.location) existing.location = seed.location;
    for (const slot of seed.slots) {
      const duplicate = existing.slots.some(
        (item) =>
          item.day === slot.day &&
          item.start === slot.start &&
          item.end === slot.end &&
          item.weekStart === slot.weekStart &&
          item.weekEnd === slot.weekEnd &&
          item.pattern === slot.pattern,
      );
      if (!duplicate) existing.slots.push(slot);
    }
  }
  return [...byKey.values()];
}

function tableText(sheet: XlsxSheet): string {
  const lines: string[] = [`工作表「${sheet.name}」`];
  let rows = 0;
  for (const row of sheet.rows) {
    if (!row.some((cell) => cell.trim())) continue;
    if (rows >= 80) {
      lines.push("…（表格已截断）");
      break;
    }
    lines.push(
      row
        .slice(0, 16)
        .map((cell) => clipText(cell, 60).replace(/\n/g, " "))
        .join(" | "),
    );
    rows += 1;
  }
  return lines.join("\n");
}

/* ------------------------------ ICS 日历 ------------------------------ */

export const MAX_AI_ATTACHMENT_ICS_CHARS = 16_000;

export interface IcsSeries {
  title: string;
  weekday: number;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  teacher: string;
  weeks: Set<number>;
  firstDate: string;
  lastDate: string;
  count: number;
}

const ICS_WEEK_MARK = /[（(]\s*第\s*\d+\s*周\s*[)）]/g;

function icsWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function icsBaseTitle(title: string): string {
  return title.replace(ICS_WEEK_MARK, "").replace(/\s+/g, " ").trim() || title;
}

function icsField(note: string, label: string): string {
  return new RegExp(`${label}[:：]\\s*([^\\n]+)`).exec(note)?.[1]?.trim() ?? "";
}

function icsWeeksFromText(value: string): number[] {
  const weeks = new Set<number>();
  for (const match of value.matchAll(/第\s*(\d{1,2})\s*周/g)) weeks.add(Number(match[1]));
  const rule = /周次规则[:：]\s*(\d{1,2})\s*[~\-–至]\s*(\d{1,2})\s*周/.exec(value);
  if (rule) {
    const start = Number(rule[1]);
    const end = Math.min(Number(rule[2]), 60);
    for (let week = start; week <= end; week += 1) weeks.add(week);
  }
  return [...weeks].filter((week) => week >= 1 && week <= 60);
}

export function formatIcsWeeks(weeks: number[]): string {
  const sorted = [...new Set(weeks)].filter((week) => week >= 1 && week <= 60).sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = start;
  for (const week of sorted.slice(1)) {
    if (week === previous + 1) {
      previous = week;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = week;
    previous = week;
  }
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  const shown = ranges.slice(0, 8).join("、");
  return `第${shown}${ranges.length > 8 ? "…" : ""}周`;
}

export function summarizeIcs(raw: string): {
  text: string;
  events: number;
  series: IcsSeries[];
  timetable: boolean;
} {
  const seeds = parseIcsEvents(raw.replace(/^\uFEFF/, ""));
  const map = new Map<string, IcsSeries>();
  for (const seed of seeds) {
    const title = icsBaseTitle(seed.title);
    const weekday = icsWeekday(seed.date);
    const location = icsField(seed.note, "地点");
    const teacher = icsField(seed.note, "教师");
    const key = [title, weekday, seed.start, seed.end, seed.allDay ? "全天" : "", location, teacher].join("|");
    let series = map.get(key);
    if (!series) {
      series = {
        title,
        weekday,
        start: seed.start,
        end: seed.end,
        allDay: seed.allDay,
        location,
        teacher,
        weeks: new Set<number>(),
        firstDate: seed.date,
        lastDate: seed.date,
        count: 0,
      };
      map.set(key, series);
    }
    for (const week of icsWeeksFromText(`${seed.title}\n${seed.note}`)) series.weeks.add(week);
    if (seed.date < series.firstDate) series.firstDate = seed.date;
    if (seed.date > series.lastDate) series.lastDate = seed.date;
    series.count += 1;
  }

  const series = [...map.values()].sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.start.localeCompare(b.start) ||
      a.title.localeCompare(b.title),
  );
  const lines = series.map((item) => {
    const time = item.allDay ? "全天" : `${item.start}-${item.end}`;
    const weekLabel = formatIcsWeeks([...item.weeks]);
    const span =
      weekLabel ||
      `${item.firstDate}${item.lastDate !== item.firstDate ? ` 至 ${item.lastDate}` : ""}`;
    const parts = [
      item.title,
      `${DAY_NAMES[item.weekday] ?? ""} ${time}`.trim(),
      item.location,
      `${span} · ${item.count} 次`,
      item.teacher ? `教师：${item.teacher}` : "",
    ].filter(Boolean);
    return `· ${parts.join("｜")}`;
  });
  const header = `日历共 ${seeds.length} 个日程，按课程/系列归并为 ${series.length} 组：`;
  const timetable =
    series.length > 0 &&
    series.filter((item) => /第\s*\d+(?:\s*[-–~至]\s*\d+)?\s*节/.test(item.title)).length >=
      Math.ceil(series.length * 0.6);
  return {
    text: clipText(`${header}\n${lines.join("\n")}`, MAX_AI_ATTACHMENT_ICS_CHARS),
    events: seeds.length,
    series,
    timetable,
  };
}

async function extractIcs(
  file: File,
): Promise<Partial<AiAttachment>> {
  const raw = await readTextFile(file);
  if (!/BEGIN:VCALENDAR/i.test(raw)) throw new Error("这不是有效的 ICS 日历文件。");
  const summary = summarizeIcs(raw);
  if (summary.events === 0) throw new Error("ICS 里没有读到任何日程。");
  return {
    text: summary.text,
    summary: `ICS ${summary.timetable ? "课表" : "日历"} · ${summary.events} 个日程 · 归并为 ${summary.series.length} 组`,
  };
}

async function extractSpreadsheet(
  file: File,
  totalWeeks: number,
): Promise<Partial<AiAttachment>> {
  const extension = attachmentExtension(file.name);
  let sheets: XlsxSheet[];
  if (extension === "xlsx") {
    sheets = await readXlsxRows(await file.arrayBuffer());
  } else {
    const raw = await readTextFile(file);
    const rows = parseDelimitedText(raw, 500, 24);
    if (rows.length === 0) throw new Error("表格里没有读到可用内容。");
    sheets = [{ name: extension === "tsv" ? "TSV 数据" : "CSV 数据", rows }];
  }

  sheets = sheets.filter((sheet) => sheet.rows.some((row) => row.some(Boolean))).slice(0, 3);
  if (sheets.length === 0) throw new Error("表格里没有读到可用内容。");

  let best: ParsedCourseSeed[] = [];
  for (const sheet of sheets) {
    const seeds = courseSeedsFromRows(sheet.rows, totalWeeks);
    if (seeds.length > best.length) best = seeds;
  }
  const courseSeeds = uniqueCourseSeeds(best);
  const content = sheets.map(tableText).join("\n\n");
  const summaryParts = [
    `${sheets.length} 个${extension === "xlsx" ? "工作表" : "数据表"}`,
    courseSeeds.length > 0 ? `识别到 ${courseSeeds.length} 门课程` : "",
  ].filter(Boolean);

  return {
    text: clipText(content),
    courseSeeds,
    summary: summaryParts.join(" · "),
  };
}

async function extractDocument(
  file: File,
  totalWeeks: number,
): Promise<Partial<AiAttachment>> {
  const buffer = await file.arrayBuffer();
  const isPdf =
    attachmentExtension(file.name) === "pdf" || file.type.toLocaleLowerCase() === "application/pdf";
  const tableSeeds: ParsedCourseSeed[] = [];
  let rawText = "";
  let label = "";
  let pageCount = 0;

  if (isPdf) {
    const content = await readPdfText(buffer);
    rawText = content.text;
    pageCount = content.pages;
    label = `PDF · ${content.pages} 页`;
    if (!rawText.trim()) {
      throw new Error("PDF 里没有可提取的文字，可能是扫描件；可以先截图后再拖入。");
    }
    tableSeeds.push(...courseSeedsFromRows(content.rows, totalWeeks));
  } else {
    const content = await readDocx(buffer);
    rawText = content.text;
    label = "Word 文档";
    if (!rawText.trim()) {
      throw new Error("Word 文档里没有可读取的文字，可能全是图片或文本框。");
    }
    for (const table of content.tables) {
      tableSeeds.push(...courseSeedsFromRows(table, totalWeeks));
    }
  }

  const textSeeds = parseCourseText(rawText.slice(0, 50_000), totalWeeks).courses;
  const courseSeeds = uniqueCourseSeeds([...tableSeeds, ...textSeeds]);
  return {
    text: clipText(rawText),
    ...(courseSeeds.length > 0 ? { courseSeeds } : {}),
    summary:
      courseSeeds.length > 0
        ? `${label} · 识别到 ${courseSeeds.length} 门课程`
        : `${label} · ${pageCount > 0 ? "未识别到课程" : "已读取文字"}`,
  };
}

async function extractText(
  file: File,
  totalWeeks: number,
): Promise<Partial<AiAttachment>> {
  const raw = await readTextFile(file);
  if (!raw.trim()) throw new Error("文件是空的。");
  const parsed = parseCourseText(raw.slice(0, 50_000), totalWeeks);
  const courseSeeds = uniqueCourseSeeds(parsed.courses);
  return {
    text: clipText(raw),
    ...(courseSeeds.length > 0 ? { courseSeeds } : {}),
    summary:
      courseSeeds.length > 0
        ? `文本 · 识别到 ${courseSeeds.length} 门课程`
        : "文本",
  };
}

export async function extractAiAttachment(
  file: File,
  options: { id?: string; totalWeeks?: number } = {},
): Promise<AiAttachment> {
  const base: AiAttachment = {
    id: options.id ?? attachmentId(),
    name: file.name || "未命名文件",
    size: file.size,
    mime: file.type,
    kind: classifyAttachment(file.name, file.type),
    status: "ready",
    summary: "",
  };
  if (file.size <= 0) {
    return { ...base, status: "error", error: "文件是空的。" };
  }
  if (file.size > MAX_AI_ATTACHMENT_BYTES) {
    return {
      ...base,
      status: "error",
      error: `文件超过 ${Math.round(MAX_AI_ATTACHMENT_BYTES / 1024 / 1024)} MB，请先压缩或截取。`,
    };
  }
  if (base.kind === "unsupported") {
    return {
      ...base,
      status: "error",
      error: unsupportedMessage(file.name, file.type),
    };
  }

  try {
    if (base.kind === "image") {
      const invalid = validateImageFile(file);
      if (invalid) return { ...base, status: "error", error: invalid };
      const raw = await readFileAsDataUrl(file);
      const compressed = await compressImageDataUrl(raw);
      return {
        ...base,
        imageDataUrl: compressed,
        summary: "图片 · 发送后由视觉模型读取",
      };
    }
    if (base.kind === "spreadsheet") {
      const result = await extractSpreadsheet(file, options.totalWeeks ?? 20);
      return { ...base, ...result };
    }
    if (base.kind === "document") {
      const result = await extractDocument(file, options.totalWeeks ?? 20);
      return { ...base, ...result };
    }
    if (attachmentExtension(file.name) === "ics") {
      const result = await extractIcs(file);
      return { ...base, ...result };
    }
    const raw = await readTextFile(file);
    const kind = guessKindFromContent(file.name, raw);
    if (kind === "spreadsheet" && !["md", "markdown"].includes(attachmentExtension(file.name))) {
      const rows = parseDelimitedText(raw, 500, 24);
      const courseSeeds = uniqueCourseSeeds(courseSeedsFromRows(rows, options.totalWeeks ?? 20));
      return {
        ...base,
        kind: "spreadsheet",
        text: clipText(raw),
        courseSeeds,
        summary: courseSeeds.length > 0 ? `表格文本 · 识别到 ${courseSeeds.length} 门课程` : "表格文本",
      };
    }
    const result = await extractText(file, options.totalWeeks ?? 20);
    return { ...base, ...result };
  } catch (error) {
    return {
      ...base,
      status: "error",
      error: error instanceof Error ? error.message : "读取文件失败，请重试。",
    };
  }
}

/* ------------------------------ 提示词拼装 ------------------------------ */

export const AI_ATTACHMENT_SYSTEM_RULES = [
  "用户这一轮带了附件。先判断每个附件是什么、用户想用它做什么，再决定是否生成动作。",
  "课程表/选课表（文本、Excel、CSV、ICS、Word、PDF、截图）：优先把逐行课程一次性放进同一个 add_courses_from_text，保留课程名、星期、节次、周次、地点和老师；不要分批。",
  "成绩单、考试安排或作业清单：整理成 create_exam、create_task 或 create_note，不要把整张表的原文塞进动作。",
  "图片：直接读取随消息发送的视觉内容；看不清或与课表无关时先说明，不要编造字段。",
  "不确定用途时，先用一两句话概括附件内容并询问用户，不要擅自清空、覆盖或批量删除数据。",
  "动作仍需放进 kexu-action 代码块；不要在文字里征求确认或要求用户回复「确认」。普通操作会直接执行，删除、清空等不可逆操作会弹一次确认框。不要声称已经写入成功，执行结果会由界面写回对话。",
].join("\n");

export function buildAttachmentPromptBlock(
  attachments: AiAttachment[],
  userText = "",
  maxChars = MAX_AI_ATTACHMENT_PROMPT_CHARS,
): string {
  const usable = attachments.filter((attachment) => attachment.status === "ready");
  const trimmed = userText.trim();
  if (usable.length === 0) return trimmed;

  const header = "【本轮附件（由本机解析，原始文件未上传）】";
  const footer = `【附件使用要求】\n${AI_ATTACHMENT_SYSTEM_RULES}`;
  const tail = trimmed ? `【用户消息】\n${trimmed}` : "";
  const fixed = [header, footer, tail].filter(Boolean).join("\n\n");
  let budget = Math.max(0, maxChars - fixed.length - 200);
  const blocks: string[] = [];

  usable.forEach((attachment, index) => {
    const title = `【附件 ${index + 1}】${attachment.name} · ${attachmentKindLabel(attachment.kind)}${
      attachment.summary ? ` · ${attachment.summary}` : ""
    }`;
    let body = "";
    if (attachment.kind === "image") {
      body = "图片已作为视觉输入随消息发送，请直接查看图片内容。";
    } else if (attachment.text) {
      body = attachment.text;
    }
    const available = Math.max(0, budget - title.length - 30);
    const clipped = body.length > available ? `${body.slice(0, available)}\n…（已截断）` : body;
    const block = [title, clipped].filter(Boolean).join("\n");
    if (budget <= title.length) return;
    blocks.push(block);
    budget -= block.length + 2;
  });

  return [header, ...blocks, footer, tail].filter(Boolean).join("\n\n").slice(0, maxChars);
}

export function attachmentImages(
  attachments: AiAttachment[],
  max = MAX_AI_ATTACHMENT_IMAGES,
): string[] {
  return attachments
    .filter(
      (attachment) =>
        attachment.status === "ready" &&
        attachment.kind === "image" &&
        typeof attachment.imageDataUrl === "string" &&
        attachment.imageDataUrl.startsWith("data:image/"),
    )
    .slice(0, max)
    .map((attachment) => attachment.imageDataUrl as string);
}

export function attachmentsToMeta(attachments: AiAttachment[]): AiAttachmentMeta[] {
  return attachments
    .filter((attachment) => attachment.status === "ready")
    .map((attachment) => ({
      name: attachment.name,
      kind: attachment.kind,
      size: attachment.size,
    }));
}