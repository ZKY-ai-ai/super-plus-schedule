import { describe, expect, it } from "vitest";
import { createPeriods, makeCourse, makeSlot } from "../lib/factory";
import type { Session } from "../types";
import {
  DEFAULT_POMODORO,
  buildTodaySummary,
  completionStats,
  experienceStats,
  nextPomodoroStep,
  normalizePlannerTask,
  sortTasksByUrgency,
  studyHeatmap,
  studyMinutes,
  studyMinutesBySubject,
  taskDueLabel,
  taskUrgency,
  type PlannerTask,
  type StudyLog,
} from "../lib/stats";

const periods = createPeriods(12);
const now = new Date("2026-11-16T10:00:00");

function task(patch: Partial<PlannerTask> & { title: string }): PlannerTask {
  return {
    id: patch.id ?? patch.title,
    priority: "normal",
    done: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    ...patch,
  };
}

function session(name: string, day: number, start: number, end: number): Session {
  const course = makeCourse({ name, location: "教一 401", slots: [makeSlot({ day, start, end })] });
  return { id: `${name}:${start}`, course, slot: course.slots[0], day, start, end };
}

function log(subject: string, start: string, minutes: number, kind: StudyLog["kind"] = "manual"): StudyLog {
  return {
    id: `${subject}:${start}`,
    subject,
    start,
    minutes,
    kind,
    createdAt: start,
  };
}

describe("task urgency", () => {
  it("逾期任务排在最前，已完成沉底", () => {
    const tasks = [
      task({ title: "周末读论文", due: "2026-11-22T23:59:00", priority: "low" }),
      task({ title: "昨天就该交", due: "2026-11-15T18:00:00", priority: "normal" }),
      task({ title: "已经完成", due: "2026-11-15T18:00:00", done: true }),
      task({ title: "今天截止", due: "2026-11-16T22:00:00", priority: "high" }),
    ];
    const sorted = sortTasksByUrgency(tasks, now);
    expect(sorted[0].title).toBe("昨天就该交");
    expect(sorted[1].title).toBe("今天截止");
    expect(sorted[sorted.length - 1].title).toBe("已经完成");
  });

  it("重要性模式优先看优先级", () => {
    const tasks = [
      task({ title: "普通但快到期", due: "2026-11-16T12:00:00", priority: "normal" }),
      task({ title: "重要但不急", due: "2026-11-25T12:00:00", priority: "urgent" }),
    ];
    expect(sortTasksByUrgency(tasks, now, "importance")[0].title).toBe("重要但不急");
  });

  it("紧迫性分档与文案", () => {
    expect(taskUrgency(task({ title: "x", due: "2026-11-14T09:00:00" }), now).tier).toBe("overdue");
    expect(taskUrgency(task({ title: "x", due: "2026-11-16T20:00:00" }), now).tier).toBe("today");
    expect(taskUrgency(task({ title: "x", due: "2026-11-17T20:00:00" }), now).tier).toBe("tomorrow");
    expect(taskDueLabel(task({ title: "x", due: "2026-11-18T10:00:00" }), now)).toBe("2 天后");
    expect(taskDueLabel(task({ title: "x" }), now)).toBe("没有截止时间");
  });

  it("外部任务会做字段归一化", () => {
    const normalized = normalizePlannerTask({ title: " 交作业 ", priority: "急", minutes: 9999 });
    expect(normalized?.title).toBe("交作业");
    expect(normalized?.priority).toBe("normal");
    expect(normalized?.minutes).toBe(600);
    expect(normalizePlannerTask({})).toBeNull();
  });
});

describe("study stats", () => {
  it("按课程汇总学习分钟并忽略计划时段", () => {
    const logs = [
      log("高等数学", "2026-11-16T08:00:00", 50),
      log("高等数学", "2026-11-15T08:00:00", 25),
      log("大学英语", "2026-11-16T10:00:00", 30),
      { ...log("高等数学", "2026-11-20T08:00:00", 60), planned: true },
    ];
    expect(studyMinutes(logs, new Date("2026-11-16T00:00:00"))).toBe(80);
    expect(studyMinutesBySubject(logs)[0]).toEqual({ key: "高等数学", minutes: 75, sessions: 2 });
  });

  it("90 天热力图按等级聚合", () => {
    const logs = [log("高等数学", "2026-11-16T08:00:00", 130), log("英语", "2026-11-15T08:00:00", 30)];
    const cells = studyHeatmap(logs, 7, new Date("2026-11-16T12:00:00"));
    expect(cells).toHaveLength(7);
    expect(cells[cells.length - 1].date).toBe("2026-11-16");
    expect(cells[cells.length - 1].level).toBe(3);
    expect(cells[cells.length - 2].level).toBe(1);
  });

  it("完成率与按时率", () => {
    const tasks = [
      task({ title: "按时", due: "2026-11-16T23:00:00", done: true, completedAt: "2026-11-16T09:00:00" }),
      task({ title: "迟到", due: "2026-11-15T23:00:00", done: true, completedAt: "2026-11-16T09:00:00" }),
      task({ title: "还没做", due: "2026-11-17T23:00:00" }),
    ];
    const stats = completionStats(tasks, now);
    expect(stats.total).toBe(3);
    expect(stats.done).toBe(2);
    expect(stats.rate).toBe(67);
    expect(stats.onTime).toBe(1);
    expect(stats.onTimeRate).toBe(50);
  });

  it("经验值、等级与连续天数", () => {
    const tasks = [
      task({ title: "完成任务", done: true, completedAt: "2026-11-16T09:00:00" }),
      task({ title: "完成任务 2", done: true, completedAt: "2026-11-15T09:00:00" }),
    ];
    const logs = [log("高数", "2026-11-16T08:00:00", 50), log("英语", "2026-11-15T08:00:00", 50)];
    const stats = experienceStats(tasks, logs, now);
    expect(stats.completedTasks).toBe(2);
    expect(stats.focusMinutes).toBe(100);
    expect(stats.streak).toBe(2);
    expect(stats.xp).toBeGreaterThan(0);
    expect(stats.level).toBeGreaterThanOrEqual(1);
  });

  it("番茄钟按轮次在短休息与长休息间切换", () => {
    expect(nextPomodoroStep("focus", 0).phase).toBe("short");
    expect(nextPomodoroStep("focus", DEFAULT_POMODORO.rounds - 1).phase).toBe("long");
    expect(nextPomodoroStep("short", 2).phase).toBe("focus");
    expect(nextPomodoroStep("long", 4).round).toBe(0);
  });
});

describe("today summary", () => {
  it("聚合课程、空档、日程、任务与学习分钟", () => {
    const sessions = [session("高等数学", 1, 1, 2), session("大学英语", 1, 3, 4)];
    const tasks = [
      task({ title: "今天交作业", due: "2026-11-16T22:00:00" }),
      task({ title: "已完成", due: "2026-11-16T12:00:00", done: true, completedAt: "2026-11-16T09:00:00" }),
      task({ title: "明天的事", due: "2026-11-17T12:00:00" }),
    ];
    const logs = [log("高等数学", "2026-11-16T07:00:00", 25, "pomodoro")];
    const summary = buildTodaySummary({
      sessions,
      periods,
      events: [
        {
          id: "e1",
          title: "班会",
          date: "2026-11-16",
          allDay: false,
          start: "16:00",
          end: "17:00",
          note: "",
          tone: "teal",
          createdAt: "",
          updatedAt: "",
        },
      ],
      tasks,
      logs,
      now,
    });
    expect(summary.courseCount).toBe(2);
    expect(summary.classMinutes).toBe(180);
    expect(summary.gapCount).toBe(1);
    expect(summary.eventCount).toBe(1);
    expect(summary.tasksTotal).toBe(2);
    expect(summary.tasksDone).toBe(1);
    expect(summary.tasksDue).toBe(1);
    expect(summary.studyMinutes).toBe(25);
    expect(summary.focusMinutes).toBe(25);
  });
});
