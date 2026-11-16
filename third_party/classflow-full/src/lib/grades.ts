export interface GradeRecord {
  courseId: string;
  /** 0–100. null means the score has not been entered yet. */
  score: number | null;
  updatedAt: string;
}

export interface GradeSettings {
  hideScores: boolean;
}

const GRADES_KEY = "kexu:grades:v1";
const GRADE_SETTINGS_KEY = "kexu:grades:settings:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGrades(raw: unknown): GradeRecord[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.grades)
      ? raw.grades
      : [];
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const records: GradeRecord[] = [];
  for (const item of list.slice(0, 500)) {
    if (!isRecord(item)) continue;
    const courseId = typeof item.courseId === "string" ? item.courseId.trim().slice(0, 80) : "";
    if (!courseId || seen.has(courseId)) continue;
    seen.add(courseId);
    const parsed = typeof item.score === "number" ? item.score : Number(item.score);
    const score = Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed * 10) / 10)) : null;
    records.push({
      courseId,
      score,
      updatedAt: typeof item.updatedAt === "string" && item.updatedAt ? item.updatedAt : now,
    });
  }
  return records;
}

export function normalizeGradeSettings(raw: unknown): GradeSettings {
  const object = isRecord(raw) ? raw : {};
  return { hideScores: object.hideScores === true };
}

function readStore(): Record<string, unknown> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(GRADES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function loadGrades(timetableId: string): GradeRecord[] {
  return normalizeGrades(readStore()[timetableId]);
}

export function saveGrades(timetableId: string, records: GradeRecord[]): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const store = readStore();
    store[timetableId] = records;
    localStorage.setItem(GRADES_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function loadGradeSettings(): GradeSettings {
  if (typeof localStorage === "undefined") return { hideScores: false };
  try {
    const raw = localStorage.getItem(GRADE_SETTINGS_KEY);
    return normalizeGradeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { hideScores: false };
  }
}

export function saveGradeSettings(settings: GradeSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(GRADE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Grade settings are non-critical.
  }
}

export function isFailed(record: GradeRecord): boolean {
  return record.score !== null && record.score < 60;
}

export function formatScore(record: GradeRecord | undefined, hideScores: boolean): string {
  if (hideScores) return "••";
  if (!record || record.score === null) return "未录入";
  return String(record.score);
}