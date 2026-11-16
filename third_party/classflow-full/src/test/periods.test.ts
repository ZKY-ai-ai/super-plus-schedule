import { describe, expect, it } from "vitest";
import { createDemoSchedule, generatePeriods } from "../lib/factory";
import { normalizePeriodRules, periodsForDate } from "../lib/periods";

describe("annual period rules", () => {
  it("uses the profile effective for the selected date", () => {
    const data = createDemoSchedule(new Date(2026, 8, 7));
    const timetable = data.timetables[0];
    const [first, second] = data.periodProfiles;
    timetable.periodProfileId = first.id;
    timetable.periodRules = [
      { id: "rule-a", from: "09-07", profileId: first.id },
      { id: "rule-b", from: "11-01", profileId: second.id },
    ];

    expect(periodsForDate(timetable, data.periodProfiles, new Date(2026, 8, 8))[0].start).toBe(
      first.periods[0].start,
    );
    expect(periodsForDate(timetable, data.periodProfiles, new Date(2026, 10, 15))[0].start).toBe(
      second.periods[0].start,
    );
  });

  it("wraps a rule list across the new year", () => {
    const data = createDemoSchedule(new Date(2026, 8, 7));
    const timetable = data.timetables[0];
    const [first, second] = data.periodProfiles;
    timetable.periodProfileId = first.id;
    timetable.periodRules = [
      { id: "rule-spring", from: "03-01", profileId: first.id },
      { id: "rule-winter", from: "11-01", profileId: second.id },
    ];

    // January is still in the previous year's winter rule.
    expect(periodsForDate(timetable, data.periodProfiles, new Date(2027, 0, 15))[0].start).toBe(
      second.periods[0].start,
    );
    expect(periodsForDate(timetable, data.periodProfiles, new Date(2027, 3, 1))[0].start).toBe(
      first.periods[0].start,
    );
  });

  it("migrates full dates to month-day rules", () => {
    const data = createDemoSchedule(new Date(2026, 8, 7));
    const [first] = data.periodProfiles;
    const rules = normalizePeriodRules(
      [{ id: "old", from: "2026-09-07", profileId: first.id }],
      data.periodProfiles,
      "2026-09-07",
      first.id,
    );
    expect(rules).toEqual([{ id: "old", from: "09-07", profileId: first.id }]);
  });

  it("generates a full scheme from lesson length and break", () => {
    const periods = generatePeriods({
      count: 8,
      startTime: "08:00",
      lessonMinutes: 45,
      breakMinutes: 10,
    });
    expect(periods).toHaveLength(8);
    expect(periods[0]).toMatchObject({ index: 1, start: "08:00", end: "08:45" });
    expect(periods[1]).toMatchObject({ index: 2, start: "08:55", end: "09:40" });
    expect(periods[7]).toMatchObject({ index: 8, start: "14:25", end: "15:10" });
  });

  it("keeps the generated scheme within the supported period range", () => {
    const few = generatePeriods({ count: 1, startTime: "09:00", lessonMinutes: 60, breakMinutes: 5 });
    const many = generatePeriods({ count: 99, startTime: "09:00", lessonMinutes: 60, breakMinutes: 5 });
    expect(few).toHaveLength(6);
    expect(few[0]).toMatchObject({ start: "09:00", end: "10:00" });
    expect(many).toHaveLength(14);
  });
});
