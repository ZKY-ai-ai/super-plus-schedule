import { describe, expect, it } from "vitest";
import { collectUpcomingExams, collectWeekTasks } from "../lib/agenda";
import { makeExam } from "../lib/exams";
import { makeTask } from "../lib/tasks";

const NOW = new Date(2026, 10, 16, 8, 0);
const WEEK_START = "2026-11-16";
const WEEK_END = "2026-11-22";

describe("collectWeekTasks", () => {
  it("keeps overdue tasks and tasks due inside the week, sorted by deadline", () => {
    const tasks = [
      makeTask({ id: "week-end", title: "周日交报告", dueDate: "2026-11-22" }),
      makeTask({ id: "overdue", title: "补交实验", dueDate: "2026-11-14" }),
      makeTask({ id: "today", title: "今晚复习", dueDate: "2026-11-16", dueTime: "20:00" }),
    ];
    expect(collectWeekTasks(tasks, NOW, WEEK_START, WEEK_END).map((item) => item.id)).toEqual([
      "overdue",
      "today",
      "week-end",
    ]);
  });

  it("drops completed, undated and next-week tasks", () => {
    const tasks = [
      { ...makeTask({ id: "done", title: "已完成的作业", dueDate: "2026-11-17" }), done: true },
      makeTask({ id: "undated", title: "随便看看" }),
      makeTask({ id: "next-week", title: "下周一交", dueDate: "2026-11-23" }),
    ];
    expect(collectWeekTasks(tasks, NOW, WEEK_START, WEEK_END)).toEqual([]);
  });

  it("includes deadlines on both week boundaries", () => {
    const tasks = [
      makeTask({ id: "start", title: "周一截止", dueDate: WEEK_START }),
      makeTask({ id: "end", title: "周日截止", dueDate: WEEK_END }),
    ];
    expect(collectWeekTasks(tasks, NOW, WEEK_START, WEEK_END).map((item) => item.id)).toEqual([
      "start",
      "end",
    ]);
  });

  it("keeps a timed deadline that already passed today as overdue", () => {
    const tasks = [
      makeTask({ id: "passed", title: "早八作业", dueDate: "2026-11-16", dueTime: "07:00" }),
    ];
    expect(collectWeekTasks(tasks, NOW, WEEK_START, WEEK_END).map((item) => item.id)).toEqual([
      "passed",
    ]);
  });
});

describe("collectUpcomingExams", () => {
  const exams = [
    makeExam({ id: "next", title: "下周期末", date: "2026-11-23", startTime: "09:00" }),
    makeExam({ id: "sunday", title: "周日测验", date: WEEK_END, startTime: "14:00" }),
    makeExam({ id: "today", title: "今天期中", date: WEEK_START, startTime: "10:00" }),
    makeExam({ id: "past", title: "昨天实验", date: "2026-11-15", startTime: "09:00" }),
  ];

  it("keeps exams from today through the week end and sorts them by date/time", () => {
    expect(collectUpcomingExams(exams, NOW, WEEK_END).map((exam) => exam.id)).toEqual([
      "today",
      "sunday",
    ]);
  });

  it("excludes past exams and exams after the week end", () => {
    const ids = collectUpcomingExams(exams, NOW, WEEK_END).map((exam) => exam.id);
    expect(ids).not.toContain("past");
    expect(ids).not.toContain("next");
  });

  it("includes date-only exams on the boundaries and drops invalid dates", () => {
    const boundary = [
      makeExam({ id: "today-only", title: "今天", date: WEEK_START }),
      makeExam({ id: "sunday-only", title: "周日", date: WEEK_END }),
      makeExam({ id: "invalid", title: "坏日期", date: "2026-13-01" }),
    ];
    expect(collectUpcomingExams(boundary, NOW, WEEK_END).map((exam) => exam.id)).toEqual([
      "today-only",
      "sunday-only",
    ]);
  });
});
