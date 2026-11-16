import { describe, expect, it } from "vitest";
import {
  applyCalendarToSessions,
  filterHolidaySessions,
  getBorrowedWeekday,
  getCalendarInfo,
  getVisibleDays,
  isClassDay,
} from "../lib/holidays";
import { getWeekDates } from "../lib/date";
import type { Session } from "../types";

const session = (day: number): Session => ({
  id: `session-${day}`,
  course: {
    id: "course",
    name: "测试课",
    teacher: "",
    location: "",
    tone: "clay",
    note: "",
    slots: [],
    createdAt: "",
    updatedAt: "",
  },
  slot: {
    id: "slot",
    day,
    start: 1,
    end: 2,
    weekStart: 1,
    weekEnd: 20,
    pattern: "all",
  },
  day,
  start: 1,
  end: 2,
});

describe("Chinese holiday calendar", () => {
  it("recognises 2026 holidays and make-up workdays", () => {
    expect(getCalendarInfo("2026-10-01")).toMatchObject({ kind: "holiday", name: "国庆节" });
    expect(getCalendarInfo("2026-09-20")).toMatchObject({ kind: "workday", short: "班" });
    expect(getCalendarInfo("2026-11-12")).toBeNull();
  });

  it("recognises the 2027 Spring Festival and May Day", () => {
    expect(getCalendarInfo("2027-02-06")).toMatchObject({ kind: "holiday", name: "春节" });
    expect(getCalendarInfo("2027-05-08")).toMatchObject({ kind: "workday" });
  });

  it("hides classes on holidays and keeps make-up weekends visible", () => {
    const dates = getWeekDates("2026-09-07", 4);
    const sessions = [session(1), session(4), session(5)];
    expect(filterHolidaySessions(sessions, dates, true).map((item) => item.day)).toEqual([1]);
    expect(filterHolidaySessions(sessions, dates, false)).toHaveLength(3);

    const workdayWeek = getWeekDates("2026-09-07", 2);
    expect(getVisibleDays(false, workdayWeek, true)).toEqual([1, 2, 3, 4, 5, 7]);
    expect(getVisibleDays(false, workdayWeek, false)).toEqual([1, 2, 3, 4, 5]);
  });

  it("marks holidays as non-class days but keeps make-up workdays", () => {
    expect(isClassDay("2026-10-01")).toBe(false);
    expect(isClassDay("2026-09-20")).toBe(true);
    expect(isClassDay("2026-11-12")).toBe(true);
  });

  it("lets custom overrides beat the built-in calendar", () => {
    const overrides = [
      { id: "o1", date: "2026-11-12", kind: "holiday" as const, name: "校庆" },
      { id: "o2", date: "2026-10-01", kind: "workday" as const, name: "补课" },
      { id: "o3", date: "2026-11-15", kind: "workday" as const, name: "周末补课" },
    ];
    expect(getCalendarInfo("2026-11-12", overrides)).toMatchObject({
      kind: "holiday",
      name: "校庆",
      short: "休",
    });
    expect(getCalendarInfo("2026-10-01", overrides)).toMatchObject({
      kind: "workday",
      short: "班",
    });
    expect(isClassDay("2026-11-12", overrides)).toBe(false);
    expect(isClassDay("2026-10-01", overrides)).toBe(true);

    const dates = getWeekDates("2026-11-09", 1);
    const sessions = [session(4)];
    expect(filterHolidaySessions(sessions, dates, true, overrides)).toHaveLength(0);
    expect(getVisibleDays(false, dates, true, overrides)).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it("borrows another weekday's timetable on a mapped make-up day", () => {
    const overrides = [
      {
        id: "o1",
        date: "2026-11-15",
        kind: "workday" as const,
        name: "校庆补课",
        borrowFrom: 5,
      },
    ];
    const dates = getWeekDates("2026-11-09", 1);
    expect(getBorrowedWeekday("2026-11-15", overrides)).toBe(5);
    expect(getBorrowedWeekday("2026-11-15")).toBeNull();

    const sessions = [session(5), session(1)];
    const mapped = applyCalendarToSessions(sessions, dates, true, overrides);
    expect(mapped).toHaveLength(3);
    expect(mapped.filter((item) => item.day === 7)).toHaveLength(1);
    expect(mapped.find((item) => item.day === 7)?.id).toContain("2026-11-15");
    expect(applyCalendarToSessions(sessions, dates, false, overrides)).toHaveLength(2);
  });
});
