import { describe, expect, it } from "vitest";
import type { ScheduleEvent } from "../types";
import { makeEvent } from "../lib/factory";
import { parseDateKey } from "../lib/date";
import {
  eventOccursOn,
  expandEventsForDates,
  repeatLabel,
  toggleEventCheckIn,
} from "../lib/eventRepeat";

function dates(...keys: string[]): Date[] {
  return keys.map((key) => parseDateKey(key));
}

function event(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return makeEvent({
    id: "ev-1",
    title: "晨跑",
    date: "2026-11-10",
    start: "07:00",
    end: "07:30",
    ...overrides,
  });
}

describe("eventOccursOn", () => {
  it("only matches the base date for a one-time event", () => {
    const once = event();
    expect(eventOccursOn(once, "2026-11-10")).toBe(true);
    expect(eventOccursOn(once, "2026-11-11")).toBe(false);
    expect(eventOccursOn(once, "2026-11-09")).toBe(false);
  });

  it("matches every day after the start for daily repeats", () => {
    const daily = event({ repeat: "daily" });
    expect(eventOccursOn(daily, "2026-11-10")).toBe(true);
    expect(eventOccursOn(daily, "2026-11-13")).toBe(true);
    expect(eventOccursOn(daily, "2027-01-01")).toBe(true);
    expect(eventOccursOn(daily, "2026-11-09")).toBe(false);
  });

  it("matches the same weekday for weekly repeats", () => {
    const weekly = event({ repeat: "weekly" });
    expect(eventOccursOn(weekly, "2026-11-10")).toBe(true);
    expect(eventOccursOn(weekly, "2026-11-17")).toBe(true);
    expect(eventOccursOn(weekly, "2026-11-24")).toBe(true);
    expect(eventOccursOn(weekly, "2026-11-12")).toBe(false);
  });

  it("matches the same day of month for monthly repeats across months", () => {
    const monthly = event({ date: "2026-01-15", repeat: "monthly" });
    expect(eventOccursOn(monthly, "2026-01-15")).toBe(true);
    expect(eventOccursOn(monthly, "2026-02-15")).toBe(true);
    expect(eventOccursOn(monthly, "2026-12-15")).toBe(true);
    expect(eventOccursOn(monthly, "2026-02-16")).toBe(false);
  });

  it("skips months that do not have the base day", () => {
    const monthly = event({ date: "2026-01-31", repeat: "monthly" });
    expect(eventOccursOn(monthly, "2026-03-31")).toBe(true);
    expect(eventOccursOn(monthly, "2026-02-28")).toBe(false);
  });

  it("stops at the end date", () => {
    const daily = event({ repeat: "daily", repeatUntil: "2026-11-12" });
    expect(eventOccursOn(daily, "2026-11-12")).toBe(true);
    expect(eventOccursOn(daily, "2026-11-13")).toBe(false);
  });

  it("ignores a malformed end date", () => {
    const daily = event({ repeat: "daily", repeatUntil: "not-a-date" });
    expect(eventOccursOn(daily, "2026-11-30")).toBe(true);
  });

  it("rejects invalid dates", () => {
    const daily = event({ repeat: "daily" });
    expect(eventOccursOn(daily, "2026-13-40")).toBe(false);
    expect(eventOccursOn(daily, "")).toBe(false);
  });
});

describe("expandEventsForDates", () => {
  it("expands a weekly event into occurrences with stable keys", () => {
    const weekly = event({ repeat: "weekly" });
    const occurrences = expandEventsForDates(
      [weekly],
      dates("2026-11-10", "2026-11-11", "2026-11-17"),
    );
    expect(occurrences.map((item) => item.occurrenceDate)).toEqual([
      "2026-11-10",
      "2026-11-17",
    ]);
    expect(occurrences.map((item) => item.occurrenceKey)).toEqual([
      "ev-1@2026-11-10",
      "ev-1@2026-11-17",
    ]);
    expect(occurrences.every((item) => item.date === item.occurrenceDate)).toBe(true);
    expect(occurrences.every((item) => item.seriesDate === "2026-11-10")).toBe(true);
  });

  it("sorts by date, all-day first, then start time", () => {
    const allDay = event({ id: "ev-all", title: "全天", allDay: true, repeat: "daily" });
    const late = event({ id: "ev-late", title: "晚", start: "20:00", end: "21:00", repeat: "daily" });
    const early = event({ id: "ev-early", title: "早", start: "08:00", end: "09:00", repeat: "daily" });
    const occurrences = expandEventsForDates(
      [late, early, allDay],
      dates("2026-11-11", "2026-11-10"),
    );
    expect(occurrences.map((item) => item.id)).toEqual([
      "ev-all",
      "ev-early",
      "ev-late",
      "ev-all",
      "ev-early",
      "ev-late",
    ]);
  });

  it("marks checked occurrences and de-duplicates dates", () => {
    const daily = event({ repeat: "daily", checkIns: ["2026-11-11"] });
    const occurrences = expandEventsForDates(
      [daily],
      dates("2026-11-10", "2026-11-11", "2026-11-11"),
    );
    expect(occurrences).toHaveLength(2);
    expect(occurrences.find((item) => item.occurrenceDate === "2026-11-11")?.checked).toBe(true);
    expect(occurrences.find((item) => item.occurrenceDate === "2026-11-10")?.checked).toBe(false);
  });

  it("does not mutate the source events", () => {
    const daily = event({ repeat: "daily" });
    expandEventsForDates([daily], dates("2026-11-11"));
    expect(daily.date).toBe("2026-11-10");
    expect(daily).not.toHaveProperty("occurrenceDate");
  });
});

describe("toggleEventCheckIn", () => {
  it("adds and removes a check-in without mutating the input", () => {
    const daily = event({ repeat: "daily" });
    const checked = toggleEventCheckIn(daily, "2026-11-11");
    expect(checked.checkIns).toEqual(["2026-11-11"]);
    expect(daily.checkIns).toEqual([]);
    expect(checked).not.toBe(daily);

    const unchecked = toggleEventCheckIn(checked, "2026-11-11");
    expect(unchecked.checkIns).toEqual([]);
    expect(checked.checkIns).toEqual(["2026-11-11"]);
  });

  it("keeps check-ins sorted and ignores non-occurrence dates", () => {
    const weekly = event({ repeat: "weekly" });
    const first = toggleEventCheckIn(weekly, "2026-11-17");
    const second = toggleEventCheckIn(first, "2026-11-10");
    expect(second.checkIns).toEqual(["2026-11-10", "2026-11-17"]);

    const ignored = toggleEventCheckIn(weekly, "2026-11-12");
    expect(ignored.checkIns).toEqual([]);
  });
});

describe("repeatLabel", () => {
  it("returns a Chinese label for each rule", () => {
    expect(repeatLabel("none")).toBe("不重复");
    expect(repeatLabel("daily")).toBe("每天");
    expect(repeatLabel("weekly")).toBe("每周");
    expect(repeatLabel("monthly")).toBe("每月");
  });
});

describe("legacy event compatibility", () => {
  it("treats an event missing repeat fields as a one-time event", () => {
    const legacy = {
      ...event(),
      repeat: undefined,
      repeatUntil: undefined,
      checkIns: undefined,
    } as unknown as ScheduleEvent;
    expect(eventOccursOn(legacy, "2026-11-10")).toBe(true);
    expect(eventOccursOn(legacy, "2026-11-11")).toBe(false);
    expect(expandEventsForDates([legacy], dates("2026-11-10"))[0].checked).toBe(false);
    expect(toggleEventCheckIn(legacy, "2026-11-10").checkIns).toEqual(["2026-11-10"]);
  });
});
