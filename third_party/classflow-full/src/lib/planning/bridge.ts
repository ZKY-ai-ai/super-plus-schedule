import type { Period } from "../../types";
import type { SelectionSection } from "../planner-types";
import type { Course as GeneratedCourse, DayOfWeek } from "./types/schedule";
import { DAYS_LIST } from "./types/schedule";
import {
  creditBounds,
  generatePlans,
  groupCoursesByCode,
  type GeneratorPreferences,
} from "./utils/planGenerator";

const DAY_IDS: DayOfWeek[] = DAYS_LIST.map((day) => day.id);

function clockOf(periods: Period[], index: number, edge: "start" | "end"): string {
  const period = periods.find((item) => item.index === index);
  if (period) return edge === "start" ? period.start : period.end;
  // Keep relative overlap measurable when a meeting points past the current profile.
  const minutes = 8 * 60 + (Math.max(1, index) - 1) * 45 + (edge === "end" ? 45 : 0);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function weeksOf(section: SelectionSection, meetingIndex: number): number[] | undefined {
  const meeting = section.meetings[meetingIndex];
  if (!meeting || (meeting.pattern !== "odd" && meeting.pattern !== "even")) return undefined;
  const weeks: number[] = [];
  const start = Math.max(1, meeting.weekStart);
  const end = Math.max(start, meeting.weekEnd);
  for (let week = start; week <= end; week += 1) {
    if (meeting.pattern === "odd" ? week % 2 === 1 : week % 2 === 0) weeks.push(week);
  }
  return weeks;
}

export function toGeneratedCourses(
  sections: SelectionSection[],
  periods: Period[],
): GeneratedCourse[] {
  return sections.flatMap((section) => {
    if (section.meetings.length === 0) return [];
    const code = (section.code || section.name).trim();
    return [
      {
        id: section.id,
        code,
        name: section.name,
        section: section.id,
        instructor: section.teacher,
        credits: section.credits,
        color: "#3B82F6",
        sessions: section.meetings.map((meeting, index) => ({
          id: `${section.id}-${index}`,
          day: DAY_IDS[Math.min(6, Math.max(0, meeting.day - 1))],
          startTime: clockOf(periods, meeting.start, "start"),
          endTime: clockOf(periods, meeting.end, "end"),
          room: section.location,
          weeks: weeksOf(section, index),
        })),
      },
    ];
  });
}

function preferencesFor(targetCredits: number, relaxCredits: boolean): GeneratorPreferences {
  const bounds = relaxCredits
    ? { min: 0, max: Math.max(0, Math.round(targetCredits + 6)) }
    : creditBounds(targetCredits, 0);
  return {
    mode: "credits",
    courseCount: 0,
    creditMin: bounds.min,
    creditMax: bounds.max,
    gapsEnabled: false,
    gapLimit: 60,
    lunchEnabled: false,
    lunchStart: 11 * 60 + 30,
    lunchEnd: 13 * 60 + 30,
    lunchMinutes: 45,
    daysOff: [],
    dailyCap: null,
    classStart: null,
    classEnd: null,
    blocked: [],
    lockedSectionIds: [],
    excludedSectionIds: [],
  };
}

export interface GeneratedSelectionPlan {
  id: string;
  sectionIds: string[];
  score: number;
  tags: string[];
  credits: number;
}

export interface SelectionGeneration {
  plans: GeneratedSelectionPlan[];
  evaluated: number;
  emptyReason: string | null;
}

export function generateSelectionPlans(
  sections: SelectionSection[],
  periods: Period[],
  targetCredits: number,
): SelectionGeneration {
  const courses = toGeneratedCourses(sections, periods);
  if (courses.length === 0) {
    return { plans: [], evaluated: 0, emptyReason: "没有带上课时间的候选课程。" };
  }
  const groups = groupCoursesByCode(courses);
  const run = (relaxCredits: boolean) => {
    const result = generatePlans({
      groups,
      pinnedKeys: [],
      preferences: preferencesFor(targetCredits, relaxCredits),
    });
    const byId = new Map(sections.map((section) => [section.id, section]));
    const plans = result.plans.map((plan) => ({
      id: plan.id,
      sectionIds: plan.courses.map((course) => course.id),
      score: plan.score,
      tags: plan.tags,
      credits: plan.courses.reduce(
        (total, course) => total + (byId.get(course.id)?.credits ?? 0),
        0,
      ),
    }));
    return { ...result, plans };
  };

  const strict = run(false);
  if (strict.plans.length > 0) {
    return { plans: strict.plans, evaluated: strict.evaluated, emptyReason: null };
  }
  const relaxed = run(true);
  return {
    plans: relaxed.plans,
    evaluated: relaxed.evaluated,
    emptyReason:
      relaxed.plans.length === 0
        ? relaxed.emptyReason ?? "没有找到不冲突且满足学分要求的组合。"
        : null,
  };
}