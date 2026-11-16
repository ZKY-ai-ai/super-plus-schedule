import { describe, expect, it } from "vitest";
import { getWeekDates } from "../lib/date";
import { buildSessions, weeksForSlot } from "../lib/schedule";
import { parseCourseText } from "../lib/textImport";
import type { Course, CourseSlot, Period } from "../types";
import {
  buildCourseShareText,
  buildWeekMarkdown,
  buildWeekText,
  timetableImageFilename,
  type WeekShareInput,
} from "../lib/timetableImage";

const slot = (overrides: Partial<CourseSlot> = {}): CourseSlot => ({
  id: "slot-a",
  day: 1,
  start: 1,
  end: 2,
  weekStart: 1,
  weekEnd: 16,
  pattern: "all",
  ...overrides,
});

const course = (name: string, slots: CourseSlot[], extra: Partial<Course> = {}): Course => ({
  id: `course-${name}`,
  name,
  teacher: "",
  location: "",
  tone: "clay",
  note: "",
  slots,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...extra,
});

const periods: Period[] = [
  { index: 1, start: "08:00", end: "09:40" },
  { index: 2, start: "10:00", end: "11:40" },
  { index: 3, start: "14:00", end: "15:40" },
  { index: 4, start: "16:00", end: "17:40" },
];

function input(extra: Partial<WeekShareInput> = {}): WeekShareInput {
  const math = course("高等数学", [slot()], {
    teacher: "张老师",
    location: "教一401",
    alias: "高数",
  });
  const physics = course(
    "大学物理",
    [slot({ id: "slot-b", day: 3, start: 3, end: 4, weekStart: 2, weekEnd: 18 })],
    { teacher: "李老师", location: "教二205", tone: "sky" },
  );
  const dates = getWeekDates("2026-09-07", 10);
  return {
    title: "我的课表",
    term: "2026 秋季学期",
    week: 10,
    dateRange: "11月9日 — 15日",
    days: [1, 2, 3, 4, 5],
    dates,
    sessions: buildSessions([math, physics], 10),
    periods,
    ...extra,
  };
}

describe("timetable image helpers", () => {
  it("builds readable plain text for the week", () => {
    const text = buildWeekText(input());
    expect(text).toContain("课序 · 2026 秋季学期");
    expect(text).toContain("第 10 周 · 11月9日 — 15日");
    expect(text).toContain("周一 11/09");
    expect(text).toContain("第 1–2 节  高等数学 · 教一401 · @张老师");
    expect(text).toContain("周三 11/11");
    expect(text).toContain("第 3–4 节  大学物理 · 教二205 · @李老师");
  });

  it("uses the alias when the alias switch is on", () => {
    const text = buildWeekText(input({ showAliases: true }));
    expect(text).toContain("第 1–2 节  高数 · 教一401 · @张老师");
    expect(text).not.toContain("高等数学");
  });

  it("builds markdown with day headings and a summary", () => {
    const markdown = buildWeekMarkdown(input());
    expect(markdown).toContain("## 第 10 周课表 · 2026 秋季学期");
    expect(markdown).toContain("**11月9日 — 15日** · 2 门课程");
    expect(markdown).toContain("### 周三 11/11");
    expect(markdown).toContain("- **第 3–4 节** 大学物理 · 教二205 · @李老师");
  });

  it("says so when the week is empty", () => {
    const text = buildWeekText(input({ sessions: [] }));
    expect(text).toContain("这一周还没有排课。");
    expect(buildWeekMarkdown(input({ sessions: [] }))).toContain("这一周还没有排课。");
  });

  it("sanitizes the png filename", () => {
    expect(timetableImageFilename(input({ title: "2026/秋:课表?" }))).toBe(
      "课序-2026 秋 课表-第10周.png",
    );
  });
});

describe("course share text", () => {
  it("round-trips ranges, parity and explicit weeks through the text importer", () => {
    const math = course(
      "高等数学",
      [
        slot({ weeks: [1, 2, 3, 5] }),
        slot({ id: "slot-b", day: 3, start: 3, end: 4, pattern: "odd", weekStart: 1, weekEnd: 15 }),
      ],
      { teacher: "张老师", location: "教一401" },
    );
    const text = buildCourseShareText([math]);
    const parsed = parseCourseText(text, 20);
    expect(parsed.errors).toEqual([]);
    expect(parsed.courses).toHaveLength(1);
    const shared = parsed.courses[0];
    expect(shared.teacher).toBe("张老师");
    expect(shared.location).toBe("教一401");
    const weeks = shared.slots
      .map((item) => weeksForSlot({ ...item, id: "parsed" }))
      .flat()
      .sort((a, b) => a - b);
    expect([...new Set(weeks)]).toEqual([1, 2, 3, 5, 7, 9, 11, 13, 15]);
  });

  it("escapes nothing away from names with spaces and punctuation", () => {
    const courseA = course("数据结构（实验）", [slot()], {
      location: "实验楼 302",
      teacher: "王老师",
    });
    const parsed = parseCourseText(buildCourseShareText([courseA]), 20);
    expect(parsed.errors).toEqual([]);
    expect(parsed.courses[0].name).toBe("数据结构（实验）");
  });
});
