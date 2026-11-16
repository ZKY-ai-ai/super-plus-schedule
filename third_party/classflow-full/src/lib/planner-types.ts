import type { WeekPattern } from "../types";

export type CourseCategory = "required" | "elective" | "general" | "pe" | "lab" | "other";

export interface SelectionMeeting {
  day: number;
  start: number;
  end: number;
  weekStart: number;
  weekEnd: number;
  pattern?: WeekPattern;
}

export interface SelectionSection {
  id: string;
  name: string;
  code: string;
  teacher: string;
  location: string;
  credits: number;
  category: CourseCategory;
  /** 1–5，越大越费精力。 */
  difficulty: number;
  meetings: SelectionMeeting[];
  /** 考试周，用于评估考核撞车。 */
  examWeek?: number;
  note?: string;
  createdAt: string;
}

export interface SelectionPlan {
  id: string;
  name: string;
  sectionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogState {
  version: 1;
  sections: SelectionSection[];
  plans: SelectionPlan[];
  activePlanId: string;
}
