import { describe, expect, it } from "vitest";
import type {
  Course,
  CourseSlot,
  Period,
  ScheduleEvent,
  Timetable,
} from "../types";
import {
  buildCalendarEventKey,
  buildCalendarEvents,
  detectSystemCalendarCapability,
  expandTimetableToCalendarEvents,
  extractCalendarKey,
} from "../lib/systemCalendar";

const PERIODS: Period[] = [
  { index: 1, start: "08:00", end: "08:45" },
  { index: 2, start: "08:55", end: "09:40" },
  { index: 3, start: "10:00", end: "10:45" },
  { index: 4, start: "10:55", end: "11:40" },
];

function slot(
  overrides: Pick<CourseSlot, "id" | "day" | "start" | "end"> & Partial<CourseSlot>,
): CourseSlot {
  return { weekStart: 1, weekEnd: 4, pattern: "all", ...overrides };
}

function course(
  id: string,
  name: string,
  slots: CourseSlot[],
  location = "教三 201",
): Course {
  return {
    id,
    name,
    teacher: "李老师",
    location,
    tone: "clay",
    note: "带教材",
    slots,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function scheduleEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: "ev-1",
    title: "班会",
    date: "2026-09-08",
    allDay: false,
    start: "19:00",
    end: "20:00",
    note: "带笔记本",
    tone: "sky",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTimetable(overrides: Partial<Timetable> = {}): Timetable {
  return {
    id: "tb-f122",
    name: "测试课表",
    semester: {
      name: "2026 秋",
      startDate: "2026-09-07",
      totalWeeks: 18,
      showWeekends: true,
      weekStartsOn: 1,
      periods: PERIODS.map((period) => ({ ...period })),
    },
    periodProfileId: null,
    periodRules: [],
    courses: [
      course("c-math", "高等数学", [slot({ id: "s-math", day: 1, start: 1, end: 2 })]),
      course(
        "c-odd",
        "单周实验",
        [slot({ id: "s-odd", day: 3, start: 3, end: 4, pattern: "odd" })],
        "实验楼 305",
      ),
      course(
        "c-thu",
        "周四讲座",
        [slot({ id: "s-thu", day: 4, start: 1, end: 2, weekStart: 4, weekEnd: 4 })],
        "礼堂",
      ),
      course(
        "c-weeks",
        "双周英语",
        [slot({ id: "s-weeks", day: 5, start: 1, end: 2, weeks: [1, 3] })],
        "外语楼",
      ),
    ],
    events: [],
    overrides: [],
    calendarOverrides: [],
    wallpaper: { preset: "paper", dataUrl: "", dim: 0 },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("systemCalendar 事件展开", () => {
  it("把课程展开成带日期、开始结束、标题、地点与备注的日程", () => {
    const events = buildCalendarEvents(makeTimetable());
    const math = events.find((event) => event.courseId === "c-math" && event.week === 1);

    expect(math).toBeDefined();
    expect(math?.date).toBe("2026-09-07");
    expect(math?.start).toBe("08:00");
    expect(math?.end).toBe("09:40");
    expect(math?.startMs).toBe(new Date(2026, 8, 7, 8, 0).getTime());
    expect(math?.endMs).toBe(new Date(2026, 8, 7, 9, 40).getTime());
    expect(math?.title).toBe("高等数学");
    expect(math?.location).toBe("教三 201");
    expect(math?.allDay).toBe(false);
    expect(math?.description).toContain("第 1 周");
    expect(math?.description).toContain("教师：李老师");
    expect(math?.description).toContain("带教材");
  });

  it("跨周日期按 7 天递进", () => {
    const mathDates = buildCalendarEvents(makeTimetable())
      .filter((event) => event.courseId === "c-math")
      .map((event) => event.date);

    expect(mathDates).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("过滤非活动周：单周课不会出现在双周", () => {
    const oddDates = buildCalendarEvents(makeTimetable())
      .filter((event) => event.courseId === "c-odd")
      .map((event) => event.date);

    expect(oddDates).toEqual(["2026-09-09", "2026-09-23"]);
    expect(oddDates).not.toContain("2026-09-16");
  });

  it("显式 weeks 优先于区间与单双周", () => {
    const dates = buildCalendarEvents(makeTimetable(), [], false)
      .filter((event) => event.courseId === "c-weeks")
      .map((event) => event.date);

    expect(dates).toEqual(["2026-09-11", "2026-09-25"]);
  });

  it("自动跳过法定节假日，关闭开关后保留", () => {
    const filtered = buildCalendarEvents(makeTimetable());
    expect(filtered.some((event) => event.courseId === "c-thu")).toBe(false);

    const kept = buildCalendarEvents(makeTimetable(), [], false);
    expect(kept.find((event) => event.courseId === "c-thu")?.date).toBe("2026-10-01");
  });

  it("补课日按指定星期借用课程", () => {
    const timetable = makeTimetable({
      calendarOverrides: [
        {
          id: "ov-1",
          date: "2026-09-19",
          kind: "workday",
          name: "调休补课",
          borrowFrom: 1,
        },
      ],
    });
    const borrowed = buildCalendarEvents(timetable).find(
      (event) => event.courseId === "c-math" && event.date === "2026-09-19",
    );

    expect(borrowed).toBeDefined();
    expect(borrowed?.week).toBe(2);
    expect(borrowed?.description).toContain("补课");
  });

  it("套用调课 override 后的日期与节次", () => {
    const timetable = makeTimetable({
      overrides: [
        {
          id: "o-1",
          action: "move",
          courseId: "c-math",
          slotId: "s-math",
          week: 2,
          toDay: 2,
          toStart: 3,
          toEnd: 4,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const moved = buildCalendarEvents(timetable, [], false).find(
      (event) => event.courseId === "c-math" && event.week === 2,
    );

    expect(moved?.date).toBe("2026-09-15");
    expect(moved?.start).toBe("10:00");
    expect(moved?.end).toBe("11:40");
  });

  it("包含全天与定时日程，全天日程跨到次日零点", () => {
    const timetable = makeTimetable({
      events: [
        scheduleEvent(),
        scheduleEvent({
          id: "ev-2",
          title: "校运会",
          date: "2026-09-10",
          allDay: true,
          start: "",
          end: "",
          note: "",
        }),
      ],
    });
    const events = buildCalendarEvents(timetable);
    const timed = events.find((event) => event.title === "班会");
    const allDay = events.find((event) => event.title === "校运会");

    expect(timed?.startMs).toBe(new Date(2026, 8, 8, 19, 0).getTime());
    expect(timed?.description).toContain("带笔记本");
    expect(allDay?.allDay).toBe(true);
    expect(allDay?.startMs).toBe(new Date(2026, 8, 10).getTime());
    expect(allDay?.endMs).toBe(new Date(2026, 8, 11).getTime());
  });
});

describe("systemCalendar 稳定去重键", () => {
  it("重复展开得到完全一致的键", () => {
    const first = buildCalendarEvents(makeTimetable()).map((event) => event.key);
    const second = buildCalendarEvents(makeTimetable()).map((event) => event.key);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("键由课表、课程、日期与节次组成", () => {
    expect(
      buildCalendarEventKey({
        timetableId: "tb-f122",
        source: "course",
        id: "c-math",
        date: "2026-09-07",
        start: "1",
        end: "2",
      }),
    ).toBe("kexu|tb-f122|course|c-math|2026-09-07|1-2");

    const math = buildCalendarEvents(makeTimetable()).find(
      (event) => event.courseId === "c-math" && event.week === 1,
    );
    expect(math).toBeDefined();
    expect(extractCalendarKey(math?.description ?? "")).toBe(math?.key);
  });

  it("同一课程同一天同一节次只保留一条", () => {
    const timetable = makeTimetable({
      courses: [
        course("c-math", "高等数学", [
          slot({ id: "s-a", day: 1, start: 1, end: 2 }),
          slot({ id: "s-b", day: 1, start: 1, end: 2 }),
        ]),
      ],
    });
    const result = expandTimetableToCalendarEvents({ timetable, autoHolidays: false });
    const weekOne = result.events.filter((event) => event.week === 1);

    expect(weekOne).toHaveLength(1);
    expect(result.duplicates).toBe(4);
  });
});

describe("systemCalendar 平台能力", () => {
  it("Web 端明确返回不支持，并给出 .ics 降级", () => {
    const capability = detectSystemCalendarCapability({
      platform: "web",
      pluginAvailable: false,
    });

    expect(capability.platform).toBe("web");
    expect(capability.supported).toBe(false);
    expect(capability.fallback).toBe("ics");
    expect(capability.reason).toContain("网页版");
  });

  it("测试环境默认按 Web 处理，不会声称可写系统日历", () => {
    const capability = detectSystemCalendarCapability();

    expect(capability.supported).toBe(false);
    expect(capability.fallback).toBe("ics");
  });

  it("Android 缺少原生插件时降级，存在插件时可用", () => {
    const missing = detectSystemCalendarCapability({
      platform: "android",
      pluginAvailable: false,
    });
    const available = detectSystemCalendarCapability({
      platform: "android",
      pluginAvailable: true,
    });

    expect(missing.supported).toBe(false);
    expect(missing.fallback).toBe("ics");
    expect(available.supported).toBe(true);
    expect(available.fallback).toBeNull();
  });

  it("iOS 暂不支持写入系统日历", () => {
    const capability = detectSystemCalendarCapability({ platform: "ios" });

    expect(capability.supported).toBe(false);
    expect(capability.fallback).toBe("ics");
    expect(capability.reason).toContain("iOS");
  });
});
