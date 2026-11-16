import { describe, expect, it } from "vitest";
import type { Course, Period, Session } from "../types";
import { DEFAULT_GAP_PREFERENCES, findDayGaps } from "../lib/gaps";
import { assessDayGap } from "../lib/gapsEngine/bridge";

const periods: Period[] = [
  { index: 1, start: "08:00", end: "08:45" },
  { index: 2, start: "08:55", end: "09:40" },
  { index: 3, start: "10:00", end: "10:45" },
  { index: 4, start: "10:55", end: "11:40" },
];

function session(id: string, name: string, location: string, start: number, end: number): Session {
  const course: Course = {
    id: `c-${id}`,
    name,
    teacher: "",
    location,
    tone: "olive",
    note: "",
    slots: [{ id: `s-${id}`, day: 1, start, end, weekStart: 1, weekEnd: 16, pattern: "all" }],
    createdAt: "2026-11-17T00:00:00.000Z",
    updatedAt: "2026-11-17T00:00:00.000Z",
  };
  return { id, course, slot: course.slots[0], day: 1, start, end };
}

describe("gap assessment bridge", () => {
  it("treats a same-building gap as a same-room route", () => {
    const [gap] = findDayGaps(
      [session("a", "高数", "教一 401", 1, 2), session("b", "英语", "教一 305", 3, 4)],
      periods,
      DEFAULT_GAP_PREFERENCES,
    );
    const assessment = assessDayGap(gap, DEFAULT_GAP_PREFERENCES);
    expect(assessment.routeStatus).toBe("same-room");
    expect(assessment.travelMinutes).toBe(0);
    expect(assessment.confidenceLabel).toBe("high");
  });

  it("keeps the walk estimate and adds risk buffer for approximate routes", () => {
    const [gap] = findDayGaps(
      [session("a", "高数", "教一 401", 1, 2), session("b", "英语", "体育馆", 3, 4)],
      periods,
      DEFAULT_GAP_PREFERENCES,
    );
    const assessment = assessDayGap(gap, DEFAULT_GAP_PREFERENCES);
    expect(assessment.routeStatus).toBe("approximate");
    expect(assessment.travelMinutes).toBe(gap.walkMinutes);
    expect(assessment.bufferMinutes).toBe(DEFAULT_GAP_PREFERENCES.bufferMinutes + 2);
    expect(assessment.leaveByMinutes).toBe(gap.end - gap.walkMinutes - assessment.bufferMinutes);
  });

  it("offers an actionable block when the gap is long enough", () => {
    const [gap] = findDayGaps(
      [session("a", "高数", "教一 401", 1, 2), session("b", "英语", "教二 201", 4, 4)],
      periods,
      DEFAULT_GAP_PREFERENCES,
    );
    const assessment = assessDayGap(gap, DEFAULT_GAP_PREFERENCES);
    expect(assessment.primary.activityMinutes).toBeGreaterThan(0);
    expect(assessment.primary.timeline.length).toBeGreaterThan(1);
  });
});