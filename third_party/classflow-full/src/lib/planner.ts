import type { Course } from "../types";
import { generateSelectionPlan } from "./selectionGenerator";
import type {
  CatalogState,
  CourseCategory,
  SelectionMeeting,
  SelectionPlan,
  SelectionSection,
} from "./planner-types";

export type {
  CatalogState,
  CourseCategory,
  SelectionMeeting,
  SelectionPlan,
  SelectionSection,
} from "./planner-types";

export const PLAN_CATALOG_KEY = "kexu:planner:catalog:v1";
export const MAX_PLAN_SECTIONS = 40;

export const CATEGORY_LABELS: Record<CourseCategory, string> = {
  required: "必修",
  elective: "选修",
  general: "通识",
  pe: "体育",
  lab: "实验",
  other: "其他",
};

export const CATEGORY_ORDER: CourseCategory[] = [
  "required",
  "elective",
  "general",
  "pe",
  "lab",
  "other",
];

export const GRADUATION_TARGETS: Record<CourseCategory, number> = {
  required: 60,
  elective: 24,
  general: 16,
  pe: 8,
  lab: 6,
  other: 6,
};

function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeCategory(value: unknown): CourseCategory {
  return value === "required" ||
    value === "elective" ||
    value === "general" ||
    value === "pe" ||
    value === "lab" ||
    value === "other"
    ? value
    : "other";
}

function normalizePattern(value: unknown): SelectionMeeting["pattern"] {
  return value === "odd" || value === "even" ? value : undefined;
}

export function normalizeMeeting(raw: unknown): SelectionMeeting | null {
  if (!isRecord(raw)) return null;
  const start = Math.round(clampNumber(raw.start, 1, 14, 1));
  const end = Math.round(clampNumber(raw.end, 1, 14, start));
  const weekStart = Math.round(clampNumber(raw.weekStart, 1, 30, 1));
  const weekEnd = Math.round(clampNumber(raw.weekEnd, 1, 30, 20));
  return {
    day: Math.round(clampNumber(raw.day, 1, 7, 1)),
    start,
    end: Math.max(start, end),
    weekStart: Math.min(weekStart, weekEnd),
    weekEnd: Math.max(weekStart, weekEnd),
    pattern: normalizePattern(raw.pattern),
  };
}

export function normalizeSection(raw: unknown): SelectionSection | null {
  if (!isRecord(raw)) return null;
  const name = text(raw.name, 80);
  if (!name) return null;
  const meetings = Array.isArray(raw.meetings)
    ? raw.meetings
        .map((item) => normalizeMeeting(item))
        .filter((item): item is SelectionMeeting => item !== null)
    : [];
  return {
    id: text(raw.id, 80) || uid("sec"),
    name,
    code: text(raw.code, 40),
    teacher: text(raw.teacher, 40),
    location: text(raw.location, 60),
    credits: Math.round(clampNumber(raw.credits, 0.5, 12, 2) * 10) / 10,
    category: normalizeCategory(raw.category),
    difficulty: Math.round(clampNumber(raw.difficulty, 1, 5, 3)),
    meetings,
    examWeek:
      raw.examWeek === undefined || raw.examWeek === null
        ? undefined
        : Math.round(clampNumber(raw.examWeek, 1, 30, 16)),
    note: text(raw.note, 300) || undefined,
    createdAt: text(raw.createdAt, 40) || new Date().toISOString(),
  };
}

function normalizePlan(raw: unknown): SelectionPlan | null {
  if (!isRecord(raw)) return null;
  const name = text(raw.name, 40);
  if (!name) return null;
  const now = new Date().toISOString();
  const sectionIds = Array.isArray(raw.sectionIds)
    ? raw.sectionIds
        .map((item) => text(item, 80))
        .filter(Boolean)
        .slice(0, MAX_PLAN_SECTIONS)
    : [];
  return {
    id: text(raw.id, 80) || uid("plan"),
    name,
    sectionIds: [...new Set(sectionIds)],
    createdAt: text(raw.createdAt, 40) || now,
    updatedAt: text(raw.updatedAt, 40) || now,
  };
}

export function createEmptyCatalog(): CatalogState {
  const plan = createPlan("方案 A");
  return {
    version: 1,
    sections: [],
    plans: [plan],
    activePlanId: plan.id,
  };
}

export function normalizeCatalog(raw: unknown): CatalogState {
  if (!isRecord(raw)) return createEmptyCatalog();
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map((item) => normalizeSection(item))
        .filter((item): item is SelectionSection => item !== null)
        .slice(0, 500)
    : [];
  const known = new Set(sections.map((section) => section.id));
  const plans = Array.isArray(raw.plans)
    ? raw.plans
        .map((item) => normalizePlan(item))
        .filter((item): item is SelectionPlan => item !== null)
        .map((plan) => ({ ...plan, sectionIds: plan.sectionIds.filter((id) => known.has(id)) }))
        .slice(0, 8)
    : [];
  if (plans.length === 0) plans.push(createPlan("方案 A"));
  const activeTimetable = text(raw.activePlanId, 80);
  const activePlanId = plans.some((plan) => plan.id === activeTimetable)
    ? activeTimetable
    : plans[0].id;
  return { version: 1, sections, plans, activePlanId };
}

export function loadCatalog(): CatalogState {
  try {
    const raw = localStorage.getItem(PLAN_CATALOG_KEY);
    if (!raw) return createEmptyCatalog();
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    return createEmptyCatalog();
  }
}

export function saveCatalog(state: CatalogState): void {
  try {
    localStorage.setItem(PLAN_CATALOG_KEY, JSON.stringify(state));
  } catch {
    // 选课数据是本地辅助信息，写入失败不影响课表与空档功能。
  }
}

export function createPlan(name: string): SelectionPlan {
  const now = new Date().toISOString();
  return { id: uid("plan"), name, sectionIds: [], createdAt: now, updatedAt: now };
}

export function activePlan(state: CatalogState): SelectionPlan {
  return state.plans.find((plan) => plan.id === state.activePlanId) ?? state.plans[0] ?? createPlan("方案 A");
}

export function selectedSections(state: CatalogState): SelectionSection[] {
  const ids = new Set(activePlan(state).sectionIds);
  return state.sections.filter((section) => ids.has(section.id));
}

export function withSectionAdded(state: CatalogState, sectionId: string): CatalogState {
  const plan = activePlan(state);
  if (plan.sectionIds.includes(sectionId) || plan.sectionIds.length >= MAX_PLAN_SECTIONS) return state;
  const now = new Date().toISOString();
  return {
    ...state,
    plans: state.plans.map((item) =>
      item.id === plan.id
        ? { ...item, sectionIds: [...item.sectionIds, sectionId], updatedAt: now }
        : item,
    ),
  };
}

export function withSectionRemoved(state: CatalogState, sectionId: string): CatalogState {
  const plan = activePlan(state);
  const now = new Date().toISOString();
  return {
    ...state,
    plans: state.plans.map((item) =>
      item.id === plan.id
        ? { ...item, sectionIds: item.sectionIds.filter((id) => id !== sectionId), updatedAt: now }
        : item,
    ),
  };
}

export function withPlanCreated(state: CatalogState, name: string): CatalogState {
  if (state.plans.length >= 8) return state;
  const plan = createPlan(name);
  return { ...state, plans: [...state.plans, plan], activePlanId: plan.id };
}

export function withPlanRemoved(state: CatalogState, planId: string): CatalogState {
  if (state.plans.length <= 1) return state;
  const plans = state.plans.filter((plan) => plan.id !== planId);
  return {
    ...state,
    plans,
    activePlanId: state.activePlanId === planId ? plans[0].id : state.activePlanId,
  };
}

export function withPlanSections(state: CatalogState, sectionIds: string[]): CatalogState {
  const plan = activePlan(state);
  const known = new Set(state.sections.map((section) => section.id));
  const nextIds = [...new Set(sectionIds)].filter((id) => known.has(id)).slice(0, MAX_PLAN_SECTIONS);
  const now = new Date().toISOString();
  return {
    ...state,
    plans: state.plans.map((item) =>
      item.id === plan.id ? { ...item, sectionIds: nextIds, updatedAt: now } : item,
    ),
  };
}

export function withSectionDeleted(state: CatalogState, sectionId: string): CatalogState {
  return {
    ...state,
    sections: state.sections.filter((section) => section.id !== sectionId),
    plans: state.plans.map((plan) => ({
      ...plan,
      sectionIds: plan.sectionIds.filter((id) => id !== sectionId),
    })),
  };
}

export function withSectionsMerged(
  state: CatalogState,
  incoming: SelectionSection[],
): CatalogState {
  if (incoming.length === 0) return state;
  const existing = new Set(state.sections.map((section) => section.id));
  const additions = incoming.filter((section) => !existing.has(section.id));
  if (additions.length === 0) return state;
  return { ...state, sections: [...state.sections, ...additions].slice(0, 500) };
}

/* -------------------------------------------------------------------------- */
/* 时间冲突                                                                    */
/* -------------------------------------------------------------------------- */

function patternMatches(week: number, pattern: SelectionMeeting["pattern"]): boolean {
  if (pattern === "odd") return week % 2 === 1;
  if (pattern === "even") return week % 2 === 0;
  return true;
}

export function meetingsConflict(a: SelectionMeeting, b: SelectionMeeting): boolean {
  if (a.day !== b.day) return false;
  if (a.end < b.start || b.end < a.start) return false;
  const from = Math.max(a.weekStart, b.weekStart);
  const to = Math.min(a.weekEnd, b.weekEnd);
  for (let week = from; week <= to; week += 1) {
    if (patternMatches(week, a.pattern) && patternMatches(week, b.pattern)) return true;
  }
  return false;
}

export function sectionsConflict(a: SelectionSection, b: SelectionSection): boolean {
  return a.meetings.some((left) => b.meetings.some((right) => meetingsConflict(left, right)));
}

export function conflictPartners(
  sections: SelectionSection[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let index = 0; index < sections.length; index += 1) {
    for (let other = index + 1; other < sections.length; other += 1) {
      if (!sectionsConflict(sections[index], sections[other])) continue;
      for (const [current, partner] of [
        [sections[index].id, sections[other].id],
        [sections[other].id, sections[index].id],
      ]) {
        map.set(current, [...(map.get(current) ?? []), partner]);
      }
    }
  }
  return map;
}

export function groupKey(section: SelectionSection): string {
  return section.code.trim() || section.name;
}

export function sectionNameById(sections: SelectionSection[]): Map<string, string> {
  return new Map(sections.map((section) => [section.id, section.name]));
}

/* -------------------------------------------------------------------------- */
/* 方案统计                                                                    */
/* -------------------------------------------------------------------------- */

export interface PlanStats {
  creditTotal: number;
  weeklyPeriods: number;
  dayCount: number;
  conflictPairs: Array<[string, string]>;
  conflictIds: string[];
  duplicateGroups: string[];
  earliestStart: number | null;
  latestEnd: number | null;
}

export function weeklyPeriodsOf(section: SelectionSection): number {
  return section.meetings.reduce(
    (total, meeting) => total + Math.max(1, meeting.end - meeting.start + 1),
    0,
  );
}

export function planStats(sections: SelectionSection[]): PlanStats {
  const partners = conflictPartners(sections);
  const pairs: Array<[string, string]> = [];
  for (const [id, list] of partners) {
    for (const partner of list) {
      if (id < partner) pairs.push([id, partner]);
    }
  }
  const groups = new Map<string, number>();
  for (const section of sections) {
    const key = groupKey(section);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const days = new Set<number>();
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const section of sections) {
    for (const meeting of section.meetings) {
      days.add(meeting.day);
      earliest = earliest === null ? meeting.start : Math.min(earliest, meeting.start);
      latest = latest === null ? meeting.end : Math.max(latest, meeting.end);
    }
  }
  return {
    creditTotal: Math.round(sections.reduce((total, section) => total + section.credits, 0) * 10) / 10,
    weeklyPeriods: sections.reduce((total, section) => total + weeklyPeriodsOf(section), 0),
    dayCount: days.size,
    conflictPairs: pairs,
    conflictIds: [...new Set(pairs.flat())],
    duplicateGroups: [...groups.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
    earliestStart: earliest,
    latestEnd: latest,
  };
}

/* -------------------------------------------------------------------------- */
/* F039 考核压力                                                               */
/* -------------------------------------------------------------------------- */

export type PressureLevel = "light" | "steady" | "heavy" | "extreme";

export interface PressureStats {
  score: number;
  level: PressureLevel;
  label: string;
  examWeeks: Array<{ week: number; count: number }>;
  difficultySum: number;
}

const PRESSURE_LABELS: Record<PressureLevel, string> = {
  light: "轻松",
  steady: "适中",
  heavy: "偏重",
  extreme: "很重",
};

export function assessmentPressure(sections: SelectionSection[]): PressureStats {
  const weekly = sections.reduce((total, section) => total + weeklyPeriodsOf(section), 0);
  const difficulty = sections.reduce((total, section) => total + section.difficulty, 0);
  const examBuckets = new Map<number, number>();
  for (const section of sections) {
    if (!section.examWeek) continue;
    examBuckets.set(section.examWeek, (examBuckets.get(section.examWeek) ?? 0) + 1);
  }
  const examWeeks = [...examBuckets.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => b.count - a.count || a.week - b.week);
  const peakExam = examWeeks.reduce((max, item) => Math.max(max, item.count), 0);
  const score = Math.round(weekly * 1.1 + difficulty * 3.5 + peakExam * 12);
  const level: PressureLevel =
    score < 55 ? "light" : score < 90 ? "steady" : score < 125 ? "heavy" : "extreme";
  return { score, level, label: PRESSURE_LABELS[level], examWeeks, difficultySum: difficulty };
}

/* -------------------------------------------------------------------------- */
/* F031 筛选 / F032 课程池                                                     */
/* -------------------------------------------------------------------------- */

export interface SectionFilter {
  query?: string;
  category?: CourseCategory | "all";
  day?: number | "all";
  freeOnly?: boolean;
}

export function filterSections(
  sections: SelectionSection[],
  filter: SectionFilter,
  selected: SelectionSection[] = [],
): SelectionSection[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  return sections.filter((section) => {
    if (filter.category && filter.category !== "all" && section.category !== filter.category) {
      return false;
    }
    if (filter.day && filter.day !== "all" && !section.meetings.some((meeting) => meeting.day === filter.day)) {
      return false;
    }
    if (query) {
      const haystack = `${section.name} ${section.code} ${section.teacher} ${section.location}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filter.freeOnly && selected.some((item) => sectionsConflict(item, section))) {
      return false;
    }
    return true;
  });
}

export interface RankedSection {
  section: SelectionSection;
  conflicts: string[];
}

export function rankAlternatives(
  pool: SelectionSection[],
  selected: SelectionSection[],
  limit = 12,
): RankedSection[] {
  const selectedIds = new Set(selected.map((section) => section.id));
  return pool
    .filter((section) => !selectedIds.has(section.id))
    .map((section) => ({
      section,
      conflicts: selected
        .filter((item) => sectionsConflict(item, section))
        .map((item) => item.name),
    }))
    .sort(
      (a, b) =>
        a.conflicts.length - b.conflicts.length ||
        b.section.credits - a.section.credits ||
        a.section.difficulty - b.section.difficulty ||
        a.section.name.localeCompare(b.section.name, "zh"),
    )
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* F034 自动组合 / F037 替代班次                                                */
/* -------------------------------------------------------------------------- */

export interface AutoCombineOptions {
  maxCredits?: number;
  maxWeeklyPeriods?: number;
  categories?: CourseCategory[];
}

export function autoCombine(
  pool: SelectionSection[],
  options: AutoCombineOptions = {},
): string[] {
  const generated = generateSelectionPlan(pool, options);
  const picked = generated.sectionIds
    .map((id) => pool.find((section) => section.id === id))
    .filter((section): section is SelectionSection => Boolean(section));
  const maxPeriods = options.maxWeeklyPeriods ?? 32;
  const periods = picked.reduce((sum, section) => sum + weeklyPeriodsOf(section), 0);
  if (picked.length > 0 && periods <= maxPeriods) {
    return picked.map((section) => section.id);
  }
  return greedyCombine(pool, options);
}

function greedyCombine(
  pool: SelectionSection[],
  options: AutoCombineOptions = {},
): string[] {
  const maxCredits = options.maxCredits ?? 26;
  const maxPeriods = options.maxWeeklyPeriods ?? 32;
  const allowed = options.categories;
  const candidates = pool
    .filter((section) => !allowed || allowed.includes(section.category))
    .sort(
      (a, b) =>
        b.credits - a.credits ||
        a.difficulty - b.difficulty ||
        weeklyPeriodsOf(a) - weeklyPeriodsOf(b),
    );
  const chosen: SelectionSection[] = [];
  const groups = new Set<string>();
  let credits = 0;
  let periods = 0;
  for (const section of candidates) {
    const key = groupKey(section);
    if (groups.has(key)) continue;
    if (credits + section.credits > maxCredits) continue;
    const cost = weeklyPeriodsOf(section);
    if (periods + cost > maxPeriods) continue;
    if (chosen.some((item) => sectionsConflict(item, section))) continue;
    chosen.push(section);
    groups.add(key);
    credits += section.credits;
    periods += cost;
  }
  return chosen.map((section) => section.id);
}

export function alternativesFor(
  target: SelectionSection,
  pool: SelectionSection[],
  selected: SelectionSection[],
): RankedSection[] {
  const key = groupKey(target);
  const others = selected.filter((section) => section.id !== target.id);
  return rankAlternatives(
    pool.filter((section) => section.id !== target.id && groupKey(section) === key),
    others,
  );
}

/* -------------------------------------------------------------------------- */
/* F038 培养方案                                                               */
/* -------------------------------------------------------------------------- */

export interface CategoryProgress {
  category: CourseCategory;
  label: string;
  credits: number;
  target: number;
  rate: number;
}

export function graduationProgress(
  sections: SelectionSection[],
  targets: Record<CourseCategory, number> = GRADUATION_TARGETS,
): CategoryProgress[] {
  return CATEGORY_ORDER.map((category) => {
    const credits =
      Math.round(
        sections
          .filter((section) => section.category === category)
          .reduce((total, section) => total + section.credits, 0) * 10,
      ) / 10;
    const target = targets[category];
    return {
      category,
      label: CATEGORY_LABELS[category],
      credits,
      target,
      rate: target === 0 ? 0 : Math.min(100, Math.round((credits / target) * 100)),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 从课表导入候选课程                                                           */
/* -------------------------------------------------------------------------- */

function inferCategory(name: string): CourseCategory {
  if (/体育|羽毛球|篮球|足球|游泳|健美/.test(name)) return "pe";
  if (/实验|实训/.test(name)) return "lab";
  if (/通识|导论|概论|史|政策|文化|艺术|音乐/.test(name)) return "general";
  if (/选修/.test(name)) return "elective";
  return "required";
}

export function sectionsFromCourses(courses: Course[]): SelectionSection[] {
  return courses.map((course) => {
    const meetings: SelectionMeeting[] = course.slots.map((slot) => ({
      day: slot.day,
      start: slot.start,
      end: slot.end,
      weekStart: slot.weekStart ?? 1,
      weekEnd: slot.weekEnd ?? 20,
      pattern: slot.pattern === "odd" || slot.pattern === "even" ? slot.pattern : undefined,
    }));
    const periods = meetings.reduce(
      (total, meeting) => total + Math.max(1, meeting.end - meeting.start + 1),
      0,
    );
    return {
      id: `sec-${course.id}`,
      name: course.name,
      code: "",
      teacher: course.teacher,
      location: course.location,
      credits: Math.min(6, Math.max(1, Math.round(periods / 2))),
      category: inferCategory(course.name),
      difficulty: 3,
      meetings,
      createdAt: new Date().toISOString(),
    };
  });
}

export function createSection(input: {
  name: string;
  credits: number;
  category: CourseCategory;
  day: number;
  start: number;
  end: number;
  teacher?: string;
  location?: string;
  code?: string;
  difficulty?: number;
  examWeek?: number;
  weekStart?: number;
  weekEnd?: number;
}): SelectionSection {
  return {
    id: uid("sec"),
    name: input.name.trim(),
    code: input.code?.trim() ?? "",
    teacher: input.teacher?.trim() ?? "",
    location: input.location?.trim() ?? "",
    credits: Math.max(0.5, input.credits),
    category: input.category,
    difficulty: Math.min(5, Math.max(1, input.difficulty ?? 3)),
    meetings: [
      {
        day: input.day,
        start: Math.min(input.start, input.end),
        end: Math.max(input.start, input.end),
        weekStart: input.weekStart ?? 1,
        weekEnd: input.weekEnd ?? 20,
      },
    ],
    examWeek: input.examWeek,
    createdAt: new Date().toISOString(),
  };
}
