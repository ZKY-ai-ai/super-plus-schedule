import { uid } from "./factory";
import {
  createEmptyAcademicAdapter,
  normalizeAdapterConfig,
  validateAdapterConfig,
  type AcademicAdapterConfig,
  type AcademicValidationResult,
} from "./academicImport";

export const SCHOOL_LIBRARY_KEY = "kexu:school-library:v1";
export const SCHOOL_LIBRARY_KIND = "kexu-school-library";
export const MAX_SCHOOL_PROFILES = 20;

export interface SchoolTestRecord {
  testedAt: string;
  status: "ok" | "failed";
  message: string;
  courseCount: number;
  slotCount: number;
}

/** A local-only school archive: no built-in presets are ever provided. */
export interface SchoolProfile {
  id: string;
  name: string;
  adapter: AcademicAdapterConfig;
  lastTest: SchoolTestRecord | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolLibraryRecord {
  kind: typeof SCHOOL_LIBRARY_KIND;
  version: 1;
  exportedAt: string;
  profiles: SchoolProfile[];
}

export interface LibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SchoolProfileSaveResult {
  ok: boolean;
  error?: string;
  profiles: SchoolProfile[];
}

export interface SchoolLibraryParseResult {
  ok: boolean;
  profiles: SchoolProfile[];
  errors: string[];
}

export type SchoolLibraryImportMode = "merge" | "replace";

export interface SchoolLibraryImportResult {
  ok: boolean;
  mode: SchoolLibraryImportMode;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
  profiles: SchoolProfile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function defaultSchoolStorage(): LibraryStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function normalizeTestRecord(value: unknown): SchoolTestRecord | null {
  if (!isRecord(value)) return null;
  const testedAt = normalizeTimestamp(value.testedAt);
  if (!testedAt) return null;
  const status = value.status === "ok" || value.status === "failed" ? value.status : null;
  if (!status) return null;
  const courseCount =
    typeof value.courseCount === "number" && Number.isFinite(value.courseCount)
      ? Math.max(0, Math.round(value.courseCount))
      : 0;
  const slotCount =
    typeof value.slotCount === "number" && Number.isFinite(value.slotCount)
      ? Math.max(0, Math.round(value.slotCount))
      : 0;
  return {
    testedAt,
    status,
    message: text(value.message, 300),
    courseCount,
    slotCount,
  };
}

export function createSchoolProfile(name = ""): SchoolProfile {
  const now = new Date().toISOString();
  const adapter = createEmptyAcademicAdapter();
  adapter.name = name;
  return {
    id: uid("school"),
    name,
    adapter,
    lastTest: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeSchoolProfile(value: unknown): SchoolProfile | null {
  if (!isRecord(value)) return null;
  const adapter = normalizeAdapterConfig(value.adapter);
  if (!adapter) return null;

  const name = text(value.name, 40);
  if (!adapter.name) adapter.name = name;
  const finalName = name || adapter.name;
  if (!finalName) return null;

  const now = new Date().toISOString();
  return {
    id: text(value.id, 80) || uid("school"),
    name: finalName,
    adapter,
    lastTest: normalizeTestRecord(value.lastTest),
    createdAt: normalizeTimestamp(value.createdAt) ?? now,
    updatedAt: normalizeTimestamp(value.updatedAt) ?? now,
  };
}

export function validateSchoolProfile(value: unknown): AcademicValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["档案必须是对象。"], warnings };
  }
  if (!text(value.id, 80)) errors.push("档案缺少 ID。");
  if (!text(value.name, 40)) errors.push("请填写档案名称。");

  const adapter = normalizeAdapterConfig(value.adapter);
  if (!adapter) {
    errors.push("缺少适配器配置。");
  } else {
    const result = validateAdapterConfig(adapter);
    errors.push(...result.errors.map((message) => `适配器：${message}`));
    warnings.push(...result.warnings);
  }

  if (value.lastTest !== undefined && value.lastTest !== null) {
    if (!normalizeTestRecord(value.lastTest)) {
      errors.push("最近测试结果格式不正确。");
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function readProfileList(raw: string): unknown[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.profiles)) return parsed.profiles;
  return null;
}

export function loadSchoolProfiles(
  storage: LibraryStorage | null = defaultSchoolStorage(),
): SchoolProfile[] {
  if (!storage) return [];
  let raw: string | null;
  try {
    raw = storage.getItem(SCHOOL_LIBRARY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  const list = readProfileList(raw);
  if (!list) return [];

  const seen = new Set<string>();
  const profiles: SchoolProfile[] = [];
  for (const item of list) {
    if (profiles.length >= MAX_SCHOOL_PROFILES) break;
    const profile = normalizeSchoolProfile(item);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  return profiles;
}

export function saveSchoolProfiles(
  profiles: SchoolProfile[],
  storage: LibraryStorage | null = defaultSchoolStorage(),
): boolean {
  if (!storage) return false;
  const seen = new Set<string>();
  const normalized: SchoolProfile[] = [];
  for (const profile of profiles) {
    if (normalized.length >= MAX_SCHOOL_PROFILES) break;
    const item = normalizeSchoolProfile(profile);
    if (!item || seen.has(item.id)) continue;
    if (!validateSchoolProfile(item).ok) continue;
    seen.add(item.id);
    normalized.push(item);
  }

  const record: SchoolLibraryRecord = {
    kind: SCHOOL_LIBRARY_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: normalized,
  };
  try {
    storage.setItem(SCHOOL_LIBRARY_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function upsertSchoolProfile(
  profile: SchoolProfile,
  storage: LibraryStorage | null = defaultSchoolStorage(),
): SchoolProfileSaveResult {
  const current = loadSchoolProfiles(storage);
  const check = validateSchoolProfile(profile);
  if (!check.ok) {
    return {
      ok: false,
      error: check.errors[0] ?? "档案配置不完整。",
      profiles: current,
    };
  }
  const normalized = normalizeSchoolProfile(profile);
  if (!normalized) {
    return { ok: false, error: "档案格式不正确。", profiles: current };
  }

  const index = current.findIndex((item) => item.id === normalized.id);
  if (index < 0 && current.length >= MAX_SCHOOL_PROFILES) {
    return {
      ok: false,
      error: `最多保存 ${MAX_SCHOOL_PROFILES} 个档案，请先删除不用的档案。`,
      profiles: current,
    };
  }

  normalized.updatedAt = new Date().toISOString();
  const next =
    index >= 0
      ? current.map((item, itemIndex) => (itemIndex === index ? normalized : item))
      : [...current, normalized];

  if (!saveSchoolProfiles(next, storage)) {
    return {
      ok: false,
      error: "写入本机存储失败，可能是浏览器禁用了 localStorage 或空间不足。",
      profiles: current,
    };
  }
  return { ok: true, profiles: next };
}

export function deleteSchoolProfile(
  id: string,
  storage: LibraryStorage | null = defaultSchoolStorage(),
): SchoolProfileSaveResult {
  const current = loadSchoolProfiles(storage);
  const next = current.filter((profile) => profile.id !== id);
  if (!saveSchoolProfiles(next, storage)) {
    return {
      ok: false,
      error: "写入本机存储失败，档案没有被删除。",
      profiles: current,
    };
  }
  return { ok: true, profiles: next };
}

export function exportSchoolLibrary(
  profiles: SchoolProfile[] = loadSchoolProfiles(),
): string {
  const record: SchoolLibraryRecord = {
    kind: SCHOOL_LIBRARY_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: profiles.slice(0, MAX_SCHOOL_PROFILES),
  };
  return JSON.stringify(record, null, 2);
}

export function parseSchoolLibraryJson(json: string): SchoolLibraryParseResult {
  const trimmed = json.trim();
  if (!trimmed) {
    return { ok: false, profiles: [], errors: ["JSON 内容为空。"] };
  }
  const list = readProfileList(trimmed);
  if (!list) {
    return {
      ok: false,
      profiles: [],
      errors: ["不是有效的档案 JSON：需要包含 profiles 数组。"],
    };
  }

  const errors: string[] = [];
  const profiles: SchoolProfile[] = [];
  const seen = new Set<string>();
  list.forEach((item, index) => {
    const profile = normalizeSchoolProfile(item);
    if (!profile) {
      if (errors.length < 20) errors.push(`第 ${index + 1} 个档案格式不正确。`);
      return;
    }
    const check = validateSchoolProfile(profile);
    if (!check.ok) {
      if (errors.length < 20) {
        errors.push(`第 ${index + 1} 个档案「${profile.name}」：${check.errors[0]}`);
      }
      return;
    }
    if (seen.has(profile.id)) {
      if (errors.length < 20) errors.push(`第 ${index + 1} 个档案 ID 重复，已跳过。`);
      return;
    }
    if (profiles.length >= MAX_SCHOOL_PROFILES) {
      if (errors.length < 20) {
        errors.push(`档案数量超过上限 ${MAX_SCHOOL_PROFILES}，多余条目已跳过。`);
      }
      return;
    }
    seen.add(profile.id);
    profiles.push(profile);
  });

  return { ok: errors.length === 0, profiles, errors };
}

export function importSchoolLibrary(
  json: string,
  mode: SchoolLibraryImportMode = "merge",
  storage: LibraryStorage | null = defaultSchoolStorage(),
): SchoolLibraryImportResult {
  const parsed = parseSchoolLibraryJson(json);
  const existing = mode === "replace" ? [] : loadSchoolProfiles(storage);
  const base = {
    mode,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: [...parsed.errors],
    profiles: existing,
  };

  if (parsed.profiles.length === 0) {
    return {
      ...base,
      ok: false,
      errors:
        base.errors.length > 0 ? base.errors : ["没有可导入的档案。"],
    };
  }
  if (!storage) {
    return {
      ...base,
      ok: false,
      errors: [...base.errors, "本机存储不可用，无法保存学校档案。"],
    };
  }

  const next = [...existing];
  let added = 0;
  let updated = 0;
  let skipped = parsed.errors.length;
  for (const profile of parsed.profiles) {
    const index = next.findIndex((item) => item.id === profile.id);
    if (index >= 0) {
      next[index] = profile;
      updated += 1;
      continue;
    }
    if (next.length >= MAX_SCHOOL_PROFILES) {
      skipped += 1;
      if (base.errors.length < 20) {
        base.errors.push(`档案数量超过上限 ${MAX_SCHOOL_PROFILES}，已跳过「${profile.name}」。`);
      }
      continue;
    }
    next.push(profile);
    added += 1;
  }

  if (!saveSchoolProfiles(next, storage)) {
    return {
      ...base,
      ok: false,
      errors: [...base.errors, "写入本机存储失败，可能是浏览器禁用了 localStorage 或空间不足。"],
    };
  }

  return {
    ok: true,
    mode,
    added,
    updated,
    skipped,
    errors: base.errors,
    profiles: next,
  };
}
