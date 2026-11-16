import { describe, expect, it } from "vitest";
import {
  dateKey,
  dayDiff,
  formatWeekRange,
  getDateForSlot,
  getTermPosition,
  getWeekDates,
  getWeekNumber,
  getWeekdayNumber,
  orderWeekdays,
  parseDateKey,
  startOfWeek,
  startOfWeekMonday,
} from "../lib/date";

describe("date helpers", () => {
  it("normalizes a Thursday to the Monday of that week", () => {
    expect(dateKey(startOfWeekMonday(parseDateKey("2026-11-12")))).toBe("2026-11-09");
  });

  it("calculates semester weeks from a Monday", () => {
    expect(getWeekNumber("2026-09-07", parseDateKey("2026-11-12"), 20)).toBe(10);
    expect(getWeekNumber("2026-09-07", parseDateKey("2026-09-07"), 20)).toBe(1);
    expect(getWeekNumber("2026-09-07", parseDateKey("2027-03-01"), 20)).toBe(20);
  });

  it("returns seven week dates and a compact range", () => {
    const dates = getWeekDates("2026-09-07", 10);
    expect(dates).toHaveLength(7);
    expect(dateKey(dates[0])).toBe("2026-11-09");
    expect(dateKey(dates[6])).toBe("2026-11-15");
    expect(formatWeekRange(dates)).toBe("11月9日 — 15日");
  });

  it("finds the date for a slot day", () => {
    expect(dateKey(getDateForSlot("2026-09-07", 10, 4))).toBe("2026-11-12");
    expect(getWeekdayNumber(parseDateKey("2026-11-12"))).toBe(4);
  });

  it("reports before / during / after term", () => {
    expect(getTermPosition("2026-09-07", 20, parseDateKey("2026-08-30")).state).toBe("before");
    expect(getTermPosition("2026-09-07", 20, parseDateKey("2026-11-12"))).toMatchObject({
      week: 10,
      state: "during",
    });
    expect(getTermPosition("2026-09-07", 20, parseDateKey("2027-02-01")).state).toBe("after");
  });

  it("counts calendar days independent of time", () => {
    expect(dayDiff(parseDateKey("2026-11-09"), parseDateKey("2026-11-12"))).toBe(3);
  });

  it("supports a configurable week start day", () => {
    expect(dateKey(startOfWeek(parseDateKey("2026-11-12"), 7))).toBe("2026-11-08");
    expect(orderWeekdays(7)).toEqual([7, 1, 2, 3, 4, 5, 6]);
    expect(orderWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const dates = getWeekDates("2026-11-08", 1, 7);
    expect(dateKey(dates[6])).toBe("2026-11-08");
    expect(dateKey(dates[0])).toBe("2026-11-09");
    expect(dateKey(dates[5])).toBe("2026-11-14");
    expect(formatWeekRange(dates)).toBe("11月8日 — 14日");

    expect(dateKey(getDateForSlot("2026-11-08", 1, 7, 7))).toBe("2026-11-08");
    expect(dateKey(getDateForSlot("2026-11-08", 1, 1, 7))).toBe("2026-11-09");
    expect(getWeekNumber("2026-11-08", parseDateKey("2026-11-12"), 20, 7)).toBe(1);
    expect(getTermPosition("2026-11-08", 20, parseDateKey("2026-11-12"), 7)).toMatchObject({
      week: 1,
      state: "during",
    });
  });
});
