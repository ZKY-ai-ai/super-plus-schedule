export const SHARES_KEY = "kexu:planner:shares:v1";
export const NICKNAME_KEY = "kexu:planner:nickname:v1";

const CODE_PREFIX = "KEXUSHARE1:";

export interface WeeklyShare {
  id: string;
  name: string;
  week: number;
  term: string;
  courseCount: number;
  classMinutes: number;
  studyMinutes: number;
  tasksDone: number;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function text(value: unknown, max = 60): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export function normalizeShare(raw: unknown): WeeklyShare | null {
  if (!isRecord(raw)) return null;
  const name = text(raw.name) || "同学";
  return {
    id: text(raw.id, 80) || `share-${Date.now().toString(36)}`,
    name,
    week: clampInt(raw.week, 1, 60, 1),
    term: text(raw.term, 40),
    courseCount: clampInt(raw.courseCount, 0, 60),
    classMinutes: clampInt(raw.classMinutes, 0, 60 * 120),
    studyMinutes: clampInt(raw.studyMinutes, 0, 60 * 120),
    tasksDone: clampInt(raw.tasksDone, 0, 500),
    createdAt: text(raw.createdAt, 40) || new Date().toISOString(),
  };
}

export function encodeShare(share: WeeklyShare): string {
  const payload = {
    v: 1,
    n: share.name,
    w: share.week,
    t: share.term,
    c: share.courseCount,
    cm: share.classMinutes,
    sm: share.studyMinutes,
    td: share.tasksDone,
    at: share.createdAt,
  };
  return `${CODE_PREFIX}${toBase64(JSON.stringify(payload))}`;
}

export function decodeShare(code: string): WeeklyShare | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(fromBase64(trimmed.slice(CODE_PREFIX.length)));
    if (!isRecord(parsed)) return null;
    return normalizeShare({
      id: `peer-${Math.random().toString(36).slice(2, 10)}`,
      name: parsed.n,
      week: parsed.w,
      term: parsed.t,
      courseCount: parsed.c,
      classMinutes: parsed.cm,
      studyMinutes: parsed.sm,
      tasksDone: parsed.td,
      createdAt: parsed.at,
    });
  } catch {
    return null;
  }
}

/** 专注分：自习分钟为主，待办与课时少量加权。 */
export function shareScore(share: WeeklyShare): number {
  return Math.round(share.studyMinutes + share.tasksDone * 15 + share.classMinutes * 0.15);
}

export function rankShares(shares: WeeklyShare[]): WeeklyShare[] {
  return [...shares].sort(
    (a, b) =>
      shareScore(b) - shareScore(a) ||
      b.studyMinutes - a.studyMinutes ||
      a.name.localeCompare(b.name, "zh"),
  );
}

export function shareToText(share: WeeklyShare, code: string): string {
  const hours = (minutes: number) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
  return [
    `【课序周报】第 ${share.week} 周${share.term ? ` · ${share.term}` : ""} · ${share.name}`,
    `课程 ${share.courseCount} 门 · 课时 ${hours(share.classMinutes)}`,
    `自习 ${hours(share.studyMinutes)} · 完成待办 ${share.tasksDone} 项`,
    `专注分 ${shareScore(share)}`,
    "",
    "把这个口令发给同学，Ta 就能导入你的周报：",
    code,
  ].join("\n");
}

export function loadShares(): WeeklyShare[] {
  try {
    const raw = localStorage.getItem(SHARES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeShare(item))
      .filter((item): item is WeeklyShare => item !== null)
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function saveShares(shares: WeeklyShare[]): void {
  try {
    localStorage.setItem(SHARES_KEY, JSON.stringify(shares.slice(0, 30)));
  } catch {
    // 分享数据是可选的，本地存储失败不影响课表。
  }
}

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY)?.slice(0, 20) ?? "";
  } catch {
    return "";
  }
}

export function saveNickname(name: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, name.slice(0, 20));
  } catch {
    // ignore
  }
}
