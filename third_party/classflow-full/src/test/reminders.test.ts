import { describe, expect, it } from "vitest";
import type { Course, CourseSlot, Period, Session } from "../types";
import type { Task } from "../lib/tasks";
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

function task(patch: Partial<Task> & { title: string }): Task {
  const base: Task = {
    id: "t-1",
    title: "交报告",
    courseId: "c-math",
    dueDate: "2026-11-16",
    dueTime: "22:00",
    note: "",
    done: false,
    repeat: "none",
    subtasks: [],
    estimatedMinutes: 0,
    createdAt: "",
    updatedAt: "",
  };
  return { ...base, ...patch };
}

interface PlanTaskOptions {
  todayTasks?: Task[];
  tomorrowTasks?: Task[];
  overdueTasks?: Task[];
  todaySessions?: Session[];
  tomorrowSessions?: Session[];
}

function plan(
  now: Date,
  patch: Partial<ReminderSettings> = {},
  sent = {},
  options: PlanTaskOptions = {},
) {
  return planReminders({
    now,
    timetableId: "tt-1",
    todayKey: "2026-11-16",
    tomorrowKey: "2026-11-17",
    settings: settings(patch),
    todaySessions: options.todaySessions ?? [session],
    todayPeriods: periods,
    tomorrowSessions: options.tomorrowSessions ?? [],
    tomorrowPeriods: periods,
    todayTasks: options.todayTasks,
    tomorrowTasks: options.tomorrowTasks,
    overdueTasks: options.overdueTasks,
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

describe("summary tasks", () => {
  const todaySummary = (planned: ReturnType<typeof plan>) =>
    planned.find((item) => item.key === "summary:today:2026-11-16");

  it("keeps the class-only body and title when there are no tasks", () => {
    const today = todaySummary(plan(new Date(2026, 10, 16, 7, 30), { todaySummary: true }));
    expect(today?.title).toBe("今日课程 · 1 节");
    expect(today?.body).toBe("08:00–09:40 数据结构 · A101");
  });

  it("appends today's due tasks with time and course name", () => {
    const today = todaySummary(
      plan(new Date(2026, 10, 16, 7, 30), { todaySummary: true }, {}, {
        todayTasks: [task({ id: "t-1", title: "交报告", dueTime: "22:00" })],
      }),
    );
    expect(today?.title).toBe("今日 · 1 节课 · 1 项作业");
    expect(today?.body).toBe(
      "08:00–09:40 数据结构 · A101\n截止 22:00 · 交报告（数据结构）",
    );
  });

  it("lists overdue tasks first and counts them in the title", () => {
    const today = todaySummary(
      plan(new Date(2026, 10, 16, 7, 30), { todaySummary: true }, {}, {
        overdueTasks: [
          task({ id: "t-old", title: "补交实验", dueDate: "2026-11-14", dueTime: "" }),
        ],
        todayTasks: [task({ id: "t-new", title: "交报告", dueTime: "09:00" })],
      }),
    );
    expect(today?.title).toBe("今日 · 1 节课 · 2 项作业");
    expect(today?.body).toContain("已逾期 · 补交实验（数据结构）");
    expect(today?.body.indexOf("已逾期 · 补交实验")).toBeLessThan(
      today?.body.indexOf("截止 09:00 · 交报告") ?? -1,
    );
  });

  it("caps the task list at five lines and summarises the rest", () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      task({ id: `t-${index}`, title: `作业${index + 1}`, dueTime: `0${index + 1}:00` }),
    );
    const today = todaySummary(
      plan(new Date(2026, 10, 16, 7, 30), { todaySummary: true }, {}, { todayTasks: many }),
    );
    expect(today?.title).toBe("今日 · 1 节课 · 7 项作业");
    expect(today?.body.split("\n")).toHaveLength(7);
    expect(today?.body).toContain("截止 01:00 · 作业1");
    expect(today?.body).not.toContain("作业6");
    expect(today?.body).toContain("还有 2 项");
  });

  it("adds tomorrow's due tasks to the tomorrow summary", () => {
    const planned = plan(
      new Date(2026, 10, 16, 21, 30),
      { tomorrowSummary: true, tomorrowSummaryTime: "21:30" },
      {},
      {
        tomorrowTasks: [
          task({ id: "t-tomorrow", title: "预习实验", dueDate: "2026-11-17", dueTime: "08:00" }),
        ],
      },
    );
    const tomorrow = planned.find((item) => item.key === "summary:tomorrow:2026-11-17");
    expect(tomorrow?.body).toBe("截止 08:00 · 预习实验（数据结构）");
    expect(tomorrow?.body).not.toContain("明天没有排课");
  });

  it("keeps the old empty-schedule text when there are no tasks either", () => {
    const today = todaySummary(
      plan(new Date(2026, 10, 16, 7, 30), { todaySummary: true }, {}, { todaySessions: [] }),
    );
    expect(today?.title).toBe("今日课程 · 0 节");
    expect(today?.body).toBe("今天没有排课，稍微喘口气。");
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