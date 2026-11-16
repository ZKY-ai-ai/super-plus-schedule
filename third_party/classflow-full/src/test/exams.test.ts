import { describe, expect, it } from "vitest";
import {
  describeExam,
  examCountdown,
  examStart,
  examTypeLabel,
  isExamUpcoming,
  makeExam,
  normalizeExams,
  planExamReminders,
  sortExams,
  upcomingExams,
  type Exam,
} from "../lib/exams";

const baseExam = (patch: Partial<Exam> = {}): Exam => ({
  id: "e-1",
  courseId: "c-math",
  title: "高等数学期末",
  type: "final",
  date: "2026-12-01",
  startTime: "09:00",
  endTime: "11:00",
  location: "教一 401",
  seat: "A12",
  note: "",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...patch,
});

describe("normalizeExams", () => {
  it("drops entries without a title or a valid date", () => {
    const exams = normalizeExams([
      { title: "期中", date: "2026-11-20" },
      { title: "", date: "2026-11-21" },
      { title: "无效日期", date: "2026-13-40" },
      null,
      "exam",
    ]);
    expect(exams).toHaveLength(1);
    expect(exams[0].title).toBe("期中");
  });

  it("falls back to the other type and clears an orphan end time", () => {
    const [exam] = normalizeExams([
      { title: "小测", date: "2026-11-20", type: "pop-quiz", startTime: "", endTime: "10:00" },
    ]);
    expect(exam.type).toBe("other");
    expect(exam.startTime).toBe("");
    expect(exam.endTime).toBe("");
  });

  it("accepts a wrapped { exams } object and dedupes ids", () => {
    const exams = normalizeExams({
      exams: [
        { id: "e-1", title: "A", date: "2026-11-20" },
        { id: "e-1", title: "B", date: "2026-11-21" },
      ],
    });
    expect(exams).toHaveLength(1);
    expect(exams[0].title).toBe("A");
  });
});

describe("makeExam", () => {
  it("keeps seat and location and trims the title", () => {
    const exam = makeExam({
      title: "  数据结构  ",
      date: "2026-12-05",
      startTime: "14:00",
      endTime: "16:00",
      location: " 计算机楼 205 ",
      seat: " 32 ",
    });
    expect(exam.title).toBe("数据结构");
    expect(exam.location).toBe("计算机楼 205");
    expect(exam.seat).toBe("32");
    expect(exam.endTime).toBe("16:00");
  });
});

describe("exam timing", () => {
  it("sorts by date then start time", () => {
    const exams = [
      baseExam({ id: "c", date: "2026-12-02", startTime: "09:00" }),
      baseExam({ id: "a", date: "2026-12-01", startTime: "14:00" }),
      baseExam({ id: "b", date: "2026-12-01", startTime: "09:00" }),
    ];
    expect(sortExams(exams).map((exam) => exam.id)).toEqual(["b", "a", "c"]);
  });

  it("detects an exam as upcoming until its end time", () => {
    const exam = baseExam();
    expect(isExamUpcoming(exam, new Date(2026, 11, 1, 10, 30))).toBe(true);
    expect(isExamUpcoming(exam, new Date(2026, 11, 1, 11, 5))).toBe(false);
    expect(upcomingExams([exam], new Date(2026, 11, 2, 8, 0))).toHaveLength(0);
  });

  it("uses midnight when the start time is unknown", () => {
    const exam = baseExam({ startTime: "", endTime: "" });
    expect(examStart(exam)).toEqual(new Date(2026, 11, 1));
  });

  it("describes the countdown in human terms", () => {
    const exam = baseExam();
    expect(examCountdown(exam, new Date(2026, 10, 20, 9, 0))).toMatchObject({
      text: "还有 11 天",
      tone: "muted",
    });
    expect(examCountdown(exam, new Date(2026, 10, 26, 9, 0))).toMatchObject({
      text: "还有 5 天",
      tone: "normal",
    });
    expect(examCountdown(exam, new Date(2026, 10, 30, 9, 0)).text).toBe("明天 09:00");
    expect(examCountdown(exam, new Date(2026, 11, 1, 7, 0)).text).toBe("还有 2 小时");
    expect(examCountdown(exam, new Date(2026, 11, 1, 8, 0)).text).toBe("还有 60 分钟");
    expect(examCountdown(exam, new Date(2026, 11, 1, 12, 0))).toMatchObject({
      text: "已结束",
      tone: "muted",
    });
  });

  it("labels types and describes the full exam", () => {
    expect(examTypeLabel("midterm")).toBe("期中");
    expect(examTypeLabel("other")).toBe("其他");
    expect(describeExam(baseExam(), "高等数学")).toBe(
      "高等数学 · 期末 · 12/01 · 09:00 · 教一 401 · 座位 A12",
    );
  });
});

describe("planExamReminders", () => {
  const input = (now: Date, sent = {}, patch: Partial<Exam> = {}) => ({
    now,
    timetableId: "tt-1",
    exams: [baseExam(patch)],
    courseName: (courseId: string | null) => (courseId === "c-math" ? "高等数学" : ""),
    sent,
  });

  it("fires the one-week node at 20:00 seven days before", () => {
    const planned = planExamReminders(input(new Date(2026, 10, 24, 20, 30)));
    expect(planned).toHaveLength(1);
    expect(planned[0].key).toBe("exam:tt-1:e-1:7d");
    expect(planned[0].title).toBe("期末提醒 · 高等数学");
    expect(planned[0].body).toContain("一周后开考");
    expect(planned[0].body).toContain("教一 401");
    expect(planned[0].body).toContain("座位 A12");
  });

  it("fires the day-before and two-hour nodes", () => {
    const dayBefore = planExamReminders(input(new Date(2026, 10, 30, 21, 0)));
    expect(dayBefore.map((item) => item.key)).toEqual(["exam:tt-1:e-1:1d"]);
    expect(dayBefore[0].body).toContain("明天开考");

    const twoHours = planExamReminders(
      input(new Date(2026, 11, 1, 7, 30), { "exam:tt-1:e-1:1d": "2026-11-30T12:00:00.000Z" }),
    );
    expect(twoHours.map((item) => item.key)).toEqual(["exam:tt-1:e-1:2h"]);
    expect(twoHours[0].body).toContain("两小时后开考");
  });

  it("skips nodes that were already sent or are outside the window", () => {
    expect(
      planExamReminders(
        input(new Date(2026, 10, 24, 20, 30), { "exam:tt-1:e-1:7d": "2026-11-24T12:30:00.000Z" }),
      ),
    ).toHaveLength(0);
    expect(planExamReminders(input(new Date(2026, 10, 24, 9, 0)))).toHaveLength(0);
    expect(planExamReminders(input(new Date(2026, 11, 1, 12, 0)))).toHaveLength(0);
  });

  it("does not schedule the two-hour node while the start time is unknown", () => {
    const planned = planExamReminders(
      input(new Date(2026, 11, 1, 0, 30), {}, { startTime: "", endTime: "" }),
    );
    expect(planned).toHaveLength(0);
  });
});