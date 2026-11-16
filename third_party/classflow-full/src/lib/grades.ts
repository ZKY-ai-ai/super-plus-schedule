export type CourseStatus = "normal" | "retake" | "exempt" | "audit" | "planned";

export interface CourseStatusMeta {
  id: CourseStatus;
  label: string;
}

export const COURSE_STATUSES: CourseStatusMeta[] = [
  { id: "normal", label: "正常修读" },
  { id: "retake", label: "重修" },
  { id: "exempt", label: "免修" },
  { id: "audit", label: "旁听" },
  { id: "planned", label: "计划修读" },
];

export interface GradeRecord {
  courseId: string;
  /** 0–100. null means the score has not been entered yet. */
  score: number | null;
  /** Credit hours of the course; null means unknown. */
  credits: number | null;
  status: CourseStatus;
  updatedAt: string;
}

export interface GradeSettings {
  hideScores: boolean;
  /** Credits required for graduation, 0 = not set. */
  requiredCredits: number;
}

export interface SemesterStats {
  enteredCount: number;
  passedCount: number;
  failedCount: number;
  /** Credits behind all entered scores. */
  creditTotal: number;
  /** Credits of passed courses. */
  earnedCredits: number;
  /** Credit-weighted 0–100 average, null when nothing is entered. */
  weightedAverage: number | null;
  /** Credit-weighted grade point on a 4.0 scale, null when nothing is entered. */
  gpa: number | null;
  /** Number of courses marked as planned. */
  plannedCount: number;
  /** Credits behind planned courses; missing credits count as 0. */
  plannedCredits: number;
}

const GRADES_KEY = "kexu:grades:v1";
const GRADE_SETTINGS_KEY = "kexu:grades:settings:v1";
const DEFAULT_SETTINGS: GradeSettings = { hideScores: false, requiredCredits: 0 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is CourseStatus {
  return COURSE_STATUSES.some((item) => item.id === value);
}

function parseCredits(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(30, Math.round(parsed * 10) / 10);
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
    const rawScore = item.score;
    const parsed =
      rawScore === null || rawScore === "" || typeof rawScore === "undefined"
        ? NaN
        : typeof rawScore === "number"
          ? rawScore
          : Number(rawScore);
    const score = Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed * 10) / 10)) : null;
    records.push({
      courseId,
      score,
      credits: parseCredits(item.credits),
      status: isStatus(item.status) ? item.status : "normal",
      updatedAt: typeof item.updatedAt === "string" && item.updatedAt ? item.updatedAt : now,
    });
  }
  return records;
}

export function normalizeGradeSettings(raw: unknown): GradeSettings {
  const object = isRecord(raw) ? raw : {};
  const required = Number(object.requiredCredits);
  return {
    hideScores: object.hideScores === true,
    requiredCredits:
      Number.isFinite(required) && required > 0 ? Math.min(400, Math.round(required)) : 0,
  };
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
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(GRADE_SETTINGS_KEY);
    return normalizeGradeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_SETTINGS;
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

/** Common 4.0-scale mapping used by most Chinese universities. */
export function gpaForScore(score: number): number {
  if (score >= 90) return 4.0;
  if (score >= 85) return 3.7;
  if (score >= 82) return 3.3;
  if (score >= 78) return 3.0;
  if (score >= 75) return 2.7;
  if (score >= 72) return 2.3;
  if (score >= 68) return 2.0;
  if (score >= 64) return 1.5;
  if (score >= 60) return 1.0;
  return 0;
}

export function semesterStats(records: GradeRecord[]): SemesterStats {
  const planned = records.filter((record) => record.status === "planned");
  const scored = records.filter(
    (record) => record.score !== null && record.status !== "planned",
  );
  let weightSum = 0;
  let scoreSum = 0;
  let pointSum = 0;
  let creditTotal = 0;
  let earnedCredits = 0;
  let failedCount = 0;
  for (const record of scored) {
    const score = record.score as number;
    const weight = record.credits ?? 1;
    weightSum += weight;
    scoreSum += score * weight;
    pointSum += gpaForScore(score) * weight;
    creditTotal += record.credits ?? 0;
    if (score < 60) failedCount += 1;
    else earnedCredits += record.credits ?? 0;
  }
  return {
    enteredCount: scored.length,
    passedCount: scored.length - failedCount,
    failedCount,
    creditTotal: Math.round(creditTotal * 10) / 10,
    earnedCredits: Math.round(earnedCredits * 10) / 10,
    weightedAverage: weightSum > 0 ? Math.round((scoreSum / weightSum) * 10) / 10 : null,
    gpa: weightSum > 0 ? Math.round((pointSum / weightSum) * 100) / 100 : null,
    plannedCount: planned.length,
    plannedCredits:
      Math.round(planned.reduce((sum, record) => sum + (record.credits ?? 0), 0) * 10) / 10,
  };
}

export function courseStatusLabel(status: CourseStatus): string {
  return COURSE_STATUSES.find((item) => item.id === status)?.label ?? "正常修读";
}