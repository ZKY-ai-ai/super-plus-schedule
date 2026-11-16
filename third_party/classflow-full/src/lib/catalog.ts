/**
 * 丁 · 课程目录提取（F115）
 *
 * 培养方案、课程目录常以纯文本粘贴进来。这里不做 OCR，也不猜测模糊格式：
 * 只有能明确读到课程名，并且至少读到学分/先修/开课学期之一的行才会被采纳。
 * 解析是纯函数，方便测试与预览；写入笔记由调用方负责。
 */

export interface CatalogCourse {
  name: string;
  credits: number | null;
  prerequisites: string[];
  semester: number | null;
  raw: string;
}

export interface CatalogParseResult {
  courses: CatalogCourse[];
  skipped: number;
  total: number;
}

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

function toNumber(value: string): number | null {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (CN_DIGITS[value[1]] ?? 0);
  const [tens, ones] = value.split("十");
  if (ones !== undefined) {
    return (CN_DIGITS[tens] ?? 1) * 10 + (CN_DIGITS[ones] ?? 0);
  }
  return CN_DIGITS[value] ?? null;
}

function cleanLine(line: string): string {
  return line
    .replace(/^[\s>*•·\-–—]+/, "")
    .replace(/^\d+[.、)）]\s*/, "")
    .replace(/\u3000/g, " ")
    .trim();
}

function parseCredits(line: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*学分|学分\s*[：:=]?\s*(\d+(?:\.\d+)?)/.exec(line);
  if (!match) return null;
  const value = Number(match[1] ?? match[2]);
  return Number.isFinite(value) ? value : null;
}

function splitPrerequisites(value: string): string[] {
  return value
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter((item) => item && !/^(无|暂无|没有|—|-)$/.test(item));
}

function parsePrerequisites(line: string): string[] {
  const match = /先修(?:课程|课)?\s*[：:=]\s*([^；;。|\n]+)/.exec(line);
  if (!match) return [];
  const cut = /\s{2,}|第\s*[一二三四五六七八九十\d]+\s*学期|(?:开课|开设)\s*[：:=]?/.exec(
    match[1],
  );
  const value = cut ? match[1].slice(0, cut.index) : match[1];
  return splitPrerequisites(value);
}

function parseSemester(line: string): number | null {
  const match = /(?:开课|开设)?\s*学期\s*[：:=]?\s*第?\s*([一二三四五六七八九十\d]+)\s*学期/.exec(line)
    ?? /第\s*([一二三四五六七八九十\d]+)\s*学期/.exec(line);
  if (!match) return null;
  return toNumber(match[1]);
}

function stripMetadata(line: string): string {
  let rest = line
    .replace(/[（(]?\s*\d+(?:\.\d+)?\s*学分\s*[)）]?/g, " ")
    .replace(/学分\s*[：:=]?\s*\d+(?:\.\d+)?/g, " ")
    .replace(/先修(?:课程|课)?\s*[：:=]\s*[^；;。|]+/g, " ")
    .replace(/(?:开课|开设)?\s*学期\s*[：:=]?\s*第?\s*[一二三四五六七八九十\d]+\s*学期/g, " ")
    .replace(/第\s*[一二三四五六七八九十\d]+\s*学期/g, " ")
    .replace(/[|｜]/g, " ");
  rest = rest.replace(/^[\s、,，:：;；.。]+|[\s、,，:：;；.。]+$/g, " ");
  const cut = /[，,；;。]|\s{2,}|\t/.exec(rest);
  const name = (cut ? rest.slice(0, cut.index) : rest).trim();
  return name.replace(/[（(]\s*[)）]/g, "").trim();
}

const HEADER_CELL = /^(课程名称?|课程|学分|先修(?:课程)?|开课学期|学期)$/;
const NUMERIC_CELL = /^\d+(?:\.\d+)?\s*(?:学分)?$/;
const SEMESTER_CELL = /第?\s*[一二三四五六七八九十\d]+\s*学期/;

interface RowFields {
  name: string;
  credits: number | null;
  prerequisites: string[];
  semester: number | null;
  isHeader: boolean;
}

function parseTableRow(line: string): RowFields | null {
  if (!/[|｜]/.test(line)) return null;
  const cells = line
    .split(/[|｜]/)
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length === 0) return null;
  if (cells.some((cell) => HEADER_CELL.test(cell))) {
    return { name: "", credits: null, prerequisites: [], semester: null, isHeader: true };
  }
  const creditsCell = cells.find((cell) => NUMERIC_CELL.test(cell));
  const credits = creditsCell ? Number(parseFloat(creditsCell)) : parseCredits(line);
  const semesterCell = cells.find((cell) => SEMESTER_CELL.test(cell));
  const semester = semesterCell ? parseSemester(semesterCell) : parseSemester(line);
  const nameCell = cells.find((cell) => !NUMERIC_CELL.test(cell) && !SEMESTER_CELL.test(cell)) ?? "";
  let prerequisites: string[] = [];
  const labelIndex = cells.findIndex((cell) => /^先修/.test(cell));
  if (labelIndex >= 0) {
    const labelled = cells[labelIndex].replace(/^先修(?:课程|课)?\s*[：:=]?\s*/, "");
    prerequisites = splitPrerequisites(labelled || cells[labelIndex + 1] || "");
  } else if (cells.length >= 4) {
    const candidate = cells[2] ?? "";
    if (!NUMERIC_CELL.test(candidate) && !SEMESTER_CELL.test(candidate)) {
      prerequisites = splitPrerequisites(candidate);
    }
  }
  return {
    name: stripMetadata(nameCell) || nameCell,
    credits,
    prerequisites,
    semester,
    isHeader: false,
  };
}

function extractName(line: string): string {
  if (!/[|｜]/.test(line)) return stripMetadata(line);
  const cells = line
    .split(/[|｜]/)
    .map((cell) => cell.trim())
    .filter(Boolean)
    .filter((cell) => !/^(课程名称?|课程|学分|先修(?:课程)?|开课学期|学期)$/.test(cell));
  const first = cells[0] ?? "";
  return stripMetadata(first) || first;
}

/**
 * 解析课程目录文本。支持「名称 + 学分/先修/学期」的自由行，也支持表格行。
 * 表头、空行、无法识别的说明文字计入 skipped。
 */
export function parseCatalog(text: string): CatalogParseResult {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
  const courses: CatalogCourse[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const line of lines) {
    const table = parseTableRow(line);
    if (table?.isHeader) {
      skipped += 1;
      continue;
    }
    const credits = table ? table.credits : parseCredits(line);
    const prerequisites = table ? table.prerequisites : parsePrerequisites(line);
    const semester = table ? table.semester : parseSemester(line);
    const name = table ? table.name : extractName(line);
    const hasMeta = credits !== null || prerequisites.length > 0 || semester !== null;
    const isTableDivider = /^[|\-:\s]+$/.test(line);

    if (
      !hasMeta ||
      isTableDivider ||
      name.length < 2 ||
      name.length > 60 ||
      /学分|先修|开课学期|课程名称|培养方案|教学计划/.test(name)
    ) {
      skipped += 1;
      continue;
    }
    const key = name.replace(/\s+/g, "").toLocaleLowerCase();
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    courses.push({ name, credits, prerequisites, semester, raw: line });
  }

  return { courses, skipped, total: lines.length };
}

export function catalogToMarkdown(courses: CatalogCourse[]): string {
  if (courses.length === 0) return "";
  const rows = courses.map(
    (course) =>
      `| ${course.name} | ${course.credits ?? "—"} | ${course.prerequisites.length > 0 ? course.prerequisites.join("、") : "—"} | ${course.semester !== null ? `第 ${course.semester} 学期` : "—"} |`,
  );
  return [
    "| 课程 | 学分 | 先修 | 开课学期 |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

export function catalogStats(courses: CatalogCourse[]): {
  total: number;
  credits: number;
  withPrerequisites: number;
} {
  return {
    total: courses.length,
    credits: courses.reduce(
      (sum, course) => sum + (course.credits !== null && course.credits > 0 ? course.credits : 0),
      0,
    ),
    withPrerequisites: courses.filter((course) => course.prerequisites.length > 0).length,
  };
}
