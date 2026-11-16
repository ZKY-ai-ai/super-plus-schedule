import { describe, expect, it } from "vitest";
import type { Course, CourseSlot, Period, Session } from "../types";
import {
  DEFAULT_REMINDER_SETTINGS,
  describeSentKey,
  normalizeReminderSettings,
  normalizeSentLog,
  planReminders,
  pruneSentLog,
  type ReminderSettings,
} from "../lib/reminders";

const course: Course = {
  id: "c-math",
  name: "数据结构",
  teacher: "",
  location: "A101",
  tone: "clay",
  note: "",
  slots: [],
  createdAt: "",
  updatedAt: "",
};

const slot: CourseSlot = {
  id: "slot-1",
  day: 1,
  start: 1,
  end: 2,
  weekStart: 1,
  weekEnd: 16,
  pattern: "all",
};

const session: Session = {
  id: "c-math:slot-1:1",
  course,
  slot,
  day: 1,
  start: 1,
  end: 2,
};

const periods: Period[] = [
  { index: 1, start: "08:00", end: "08:45" },
  { index: 2, start: "08:55", end: "09:40" },
];

const settings = (patch: Partial<ReminderSettings> = {}): ReminderSettings => ({
  ...DEFAULT_REMINDER_SETTINGS,
  enabled: true,
  todaySummary: false,
  tomorrowSummary: false,
  ...patch,
});

function plan(now: Date, patch: Partial<ReminderSettings> = {}, sent = {}) {
  return planReminders({
    now,
    timetableId: "tt-1",
    todayKey: "2026-11-16",
    tomorrowKey: "2026-11-17",
    settings: settings(patch),
    todaySessions: [session],
    todayPeriods: periods,
    tomorrowSessions: [],
    tomorrowPeriods: periods,
    sent,
  });
}

describe("reminder settings", () => {
  it("falls back to defaults for unknown values", () => {
    expect(normalizeReminderSettings(null)).toEqual(DEFAULT_REMINDER_SETTINGS);
    expect(normalizeReminderSettings({ leadMinutes: 7, todaySummaryTime: "25:00" })).toMatchObject({
      leadMinutes: DEFAULT_REMINDER_SETTINGS.leadMinutes,
      todaySummaryTime: DEFAULT_REMINDER_SETTINGS.todaySummaryTime,
      enabled: false,
      todaySummary: true,
    });
    expect(normalizeReminderSettings({ leadMinutes: 30, enabled: true, todaySummary: false })).toMatchObject(
      { leadMinutes: 30, enabled: true, todaySummary: false },
    );
  });
});

describe("class reminders", () => {
  it("fires inside the lead window and respects the sent log", () => {
    const now = new Date(2026, 10, 16, 7, 50);
    const planned = plan(now);
    expect(planned).toHaveLength(1);
    expect(planned[0].key).toBe("class:tt-1:2026-11-16:c-math:slot-1");
    expect(planned[0].title).toContain("数据结构");
    expect(planned[0].body).toContain("10 分钟后开始");

    expect(plan(now, {}, { [planned[0].key]: now.toISOString() })).toHaveLength(0);
  });

  it("does not fire before the lead window or after the class starts", () => {
    expect(plan(new Date(2026, 10, 16, 7, 40))).toHaveLength(0);
    expect(plan(new Date(2026, 10, 16, 8, 1))).toHaveLength(0);
  });
});

describe("daily summaries", () => {
  it("sends today and tomorrow digests once inside their window", () => {
    const now = new Date(2026, 10, 16, 7, 30);
    const planned = plan(now, {
      todaySummary: true,
      tomorrowSummary: true,
      tomorrowSummaryTime: "07:30",
    });
    const keys = planned.map((item) => item.key);
    expect(keys).toContain("summary:today:2026-11-16");
    expect(keys).toContain("summary:tomorrow:2026-11-17");
    const today = planned.find((item) => item.key === "summary:today:2026-11-16");
    expect(today?.body).toContain("08:00–09:40 数据结构 · A101");
    expect(today?.title).toContain("1 节");
  });

  it("skips stale summaries and already-sent summaries", () => {
    const noon = new Date(2026, 10, 16, 12, 0);
    expect(plan(noon, { todaySummary: true })).toHaveLength(0);
    expect(
      plan(new Date(2026, 10, 16, 7, 21), { todaySummary: true }, {
        "summary:today:2026-11-16": "2026-11-16T07:21:00.000Z",
      }),
    ).toHaveLength(0);
  });
});

describe("sent log", () => {
  it("drops malformed entries and entries older than a week", () => {
    const now = new Date(2026, 10, 16, 10, 0);
    const log = normalizeSentLog({
      fresh: "2026-11-16T09:00:00.000Z",
      old: "2026-11-01T09:00:00.000Z",
      broken: "not-a-date",
      empty: "",
    });
    expect(Object.keys(log)).toEqual(["fresh", "old"]);
    expect(Object.keys(pruneSentLog(log, now))).toEqual(["fresh"]);
  });

  it("describes keys for the settings list", () => {
    expect(describeSentKey("class:tt-1:2026-11-16:c-math:slot-1")).toBe("课前提醒 · 2026-11-16");
    expect(describeSentKey("summary:today:2026-11-16")).toBe("今日摘要 · 2026-11-16");
    expect(describeSentKey("summary:tomorrow:2026-11-17")).toBe("明日课表 · 2026-11-17");
  });
});