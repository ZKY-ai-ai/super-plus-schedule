import { describe, expect, it } from "vitest";
import type { Period } from "../types";
import type { SelectionSection } from "../lib/planner-types";
import { generateSelectionPlans, toGeneratedCourses } from "../lib/planning/bridge";

const periods: Period[] = [
  { index: 1, start: "08:00", end: "08:45" },
  { index: 2, start: "08:55", end: "09:40" },
  { index: 3, start: "10:00", end: "10:45" },
  { index: 4, start: "10:55", end: "11:40" },
  { index: 5, start: "14:00", end: "14:45" },
  { index: 6, start: "14:55", end: "15:40" },
];

function section(
  id: string,
  name: string,
  code: string,
  start: number,
  end: number,
  patch: Partial<SelectionSection> = {},
): SelectionSection {
  return {
    id,
    name,
    code,
    teacher: "",
    location: "",
    credits: 2,
    category: "required",
    difficulty: 3,
    meetings: [{ day: 1, start, end, weekStart: 1, weekEnd: 16 }],
    createdAt: "2026-11-16T00:00:00.000Z",
    ...patch,
  };
}

describe("selection bridge", () => {
  it("converts period indexes to clock times", () => {
    const [course] = toGeneratedCourses([section("a", "高数", "MATH", 1, 2)], periods);
    expect(course.sessions[0]).toMatchObject({
      day: "monday",
      startTime: "08:00",
      endTime: "09:40",
    });
  });

  it("never combines sections that overlap in the same week", () => {
    const pool = [
      section("a1", "高数 A", "MATH", 1, 2),
      section("a2", "高数 B", "MATH", 4, 5),
      section("b1", "英语", "ENG", 2, 3),
    ];
    const result = generateSelectionPlans(pool, periods, 4);
    expect(result.plans.length, result.emptyReason ?? "").toBeGreaterThan(0);
    for (const plan of result.plans) {
      const ids = new Set(plan.sectionIds);
      expect(ids.has("a1") && ids.has("b1")).toBe(false);
    }
  });

  it("allows odd/even sections to share the same slot", () => {
    const pool = [
      section("odd", "高数（单周）", "MATH", 1, 2, {
        meetings: [{ day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16, pattern: "odd" }],
      }),
      section("even", "高数（双周）", "MATH", 1, 2, {
        meetings: [{ day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16, pattern: "even" }],
      }),
    ];
    const [odd, even] = toGeneratedCourses(pool, periods);
    expect(odd.sessions[0].weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    expect(even.sessions[0].weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
  });
});