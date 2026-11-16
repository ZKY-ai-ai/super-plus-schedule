import type { CourseCategory, SelectionSection } from "./planner-types";
import {
  generatePlans,
  groupCoursesByCode,
  type GeneratorPreferences,
} from "../vendor/p07/src/utils/planGenerator";
import type { Course, DayOfWeek } from "../vendor/p07/src/types/schedule";

const DAY_IDS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** P07 works on clock times; local sections use period indexes, so map them to a stable timeline. */
const FIRST_PERIOD_MINUTES = 8 * 60;
const PERIOD_SPAN_MINUTES = 55;
const LESSON_MINUTES = 50;

export interface SelectionGenerationOptions {
  maxCredits?: number;
  maxWeeklyPeriods?: number;
  categories?: CourseCategory[];
}

export interface SelectionGenerationResult {
  sectionIds: string[];
  evaluated: number;
  capped: boolean;
  emptyReason: string | null;
}

function clampPeriod(value: number): number {
  return Math.min(14, Math.max(1, Math.round(value)));
}

function periodStart(period: number): number {
  return FIRST_PERIOD_MINUTES + (clampPeriod(period) - 1) * PERIOD_SPAN_MINUTES;
}

function periodEnd(period: number): number {
  return periodStart(period) + LESSON_MINUTES;
}

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function courseColor(section: SelectionSection): string {
  const palette = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6"];
  let hash = 0;
  for (const char of `${section.code}${section.name}`) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function toUniplanCourse(section: SelectionSection): Course {
  return {
    id: section.id,
    code: section.code.trim() || section.name.trim(),
    name: section.name,
    section: section.code.trim() || undefined,
    instructor: section.teacher || undefined,
    credits: section.credits,
    color: courseColor(section),
    sessions: section.meetings.map((meeting, index) => {
      const start = Math.min(meeting.start, meeting.end);
      const end = Math.max(meeting.start, meeting.end);
      return {
        id: `${section.id}-${index}`,
        day: DAY_IDS[Math.min(7, Math.max(1, meeting.day)) - 1],
        startTime: clock(periodStart(start)),
        endTime: clock(periodEnd(end)),
        room: section.location || undefined,
      };
    }),
  };
}

function preferences(maxCredits: number): GeneratorPreferences {
  return {
    mode: "credits",
    courseCount: 0,
    creditMin: 0,
    creditMax: Math.max(1, Math.round(maxCredits)),
    gapsEnabled: false,
    gapLimit: 60,
    lunchEnabled: false,
    lunchStart: 11 * 60,
    lunchEnd: 13 * 60,
    lunchMinutes: 40,
    daysOff: [],
    dailyCap: null,
    classStart: null,
    classEnd: null,
    blocked: [],
    lockedSectionIds: [],
    excludedSectionIds: [],
  };
}

export function generateSelectionPlan(
  sections: SelectionSection[],
  options: SelectionGenerationOptions = {},
): SelectionGenerationResult {
  const allowed = options.categories;
  const candidates = allowed
    ? sections.filter((section) => allowed.includes(section.category))
    : sections;
  const courses = candidates.map(toUniplanCourse);
  const groups = groupCoursesByCode(courses);
  if (groups.length === 0) {
    return { sectionIds: [], evaluated: 0, capped: false, emptyReason: "课程池里没有可组合的课程。" };
  }

  const result = generatePlans({
    groups,
    pinnedKeys: [],
    preferences: preferences(options.maxCredits ?? 26),
  });
  const best = result.plans[0];
  return {
    sectionIds: best ? best.courses.map((course) => course.id) : [],
    evaluated: result.evaluated,
    capped: result.capped,
    emptyReason: best ? null : result.emptyReason,
  };
}
