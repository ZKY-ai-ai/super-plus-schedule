import { describe, expect, it } from "vitest";
import {
  addSubtask,
  completeTask,
  groupTasks,
  makeTask,
  normalizeTasks,
  parseTasksJson,
  planTaskReminders,
  removeSubtask,
  subtaskProgress,
  taskBucket,
  taskCountdown,
  toggleSubtask,
} from "../lib/tasks";

describe("task normalization", () => {
  it("upgrades a legacy bare array and trims fields", () => {
    const tasks = normalizeTasks([
      {
        id: "t1",
        title: "  交数据结构作业  ",
        courseId: " course-1 ",
        dueDate: "2026-11-20",
        dueTime: "23:59",
        done: true,
      },
      { title: "读论文", dueDate: "not-a-date", dueTime: "25:00" },
    ]);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      id: "t1",
      title: "交数据结构作业",
      courseId: "course-1",
      dueDate: "2026-11-20",
      dueTime: "23:59",
      done: true,
    });
    expect(tasks[1].dueDate).toBe("");
    expect(tasks[1].dueTime).toBe("");
  });

  it("accepts the versioned wrapper and drops empty or duplicate entries", () => {
    const tasks = normalizeTasks({
      version: 1,
      tasks: [
        { id: "same", title: "A" },
        { id: "same", title: "B" },
        { id: "c", title: "   " },
        null,
        { id: "d", title: "D", done: "yes" },
      ],
    });
    expect(tasks.map((task) => task.id)).toEqual(["same", "d"]);
    expect(tasks[1].done).toBe(false);
  });

  it("fills timestamps and generates ids for imported tasks", () => {
    const [task] = normalizeTasks([{ title: "无 id" }]);
    expect(task.id).toBe("task-1");
    expect(task.createdAt).not.toBe("");
    expect(task.updatedAt).not.toBe("");
  });

  it("parses manual JSON and reports empty or broken input", () => {
    const ok = parseTasksJson('[{"title":"实验报告","dueDate":"2026-12-01"}]');
    expect(ok.ok).toBe(true);
    expect(ok.tasks[0].title).toBe("实验报告");
    expect(parseTasksJson("{oops").ok).toBe(false);
    expect(parseTasksJson("[]").error).toBe("没有找到带标题的任务。");
  });

  it("normalizes subtasks and keeps ids unique", () => {
    const [task] = normalizeTasks([
      {
        title: "实验报告",
        subtasks: [
          { id: "s1", title: " 写摘要 ", done: true },
          { id: "s1", title: "重复" },
          { title: "" },
          { title: "画图", done: "yes" },
        ],
      },
    ]);
    expect(task.subtasks).toHaveLength(2);
    expect(task.subtasks[0]).toEqual({ id: "s1", title: "写摘要", done: true });
    expect(task.subtasks[1].title).toBe("画图");
    expect(task.subtasks[1].done).toBe(false);
  });

  it("keeps a valid minute estimate and rejects bad values", () => {
    const [valid, invalid, negative] = normalizeTasks([
      { title: "写报告", estimatedMinutes: 45 },
      { title: "脏数据", estimatedMinutes: "45" },
      { title: "负数", estimatedMinutes: -1 },
    ]);
    expect(valid.estimatedMinutes).toBe(45);
    expect(invalid.estimatedMinutes).toBe(0);
    expect(negative.estimatedMinutes).toBe(0);
    expect(makeTask({ title: "估算", estimatedMinutes: 90 }).estimatedMinutes).toBe(90);
  });
});

describe("subtask editing", () => {
  it("adds, toggles and removes subtasks", () => {
    const task = makeTask({ title: "实验报告" });
    expect(subtaskProgress(task)).toEqual({ done: 0, total: 0 });

    const withOne = addSubtask(task, "  写摘要  ");
    expect(withOne.subtasks).toHaveLength(1);
    expect(withOne.subtasks[0].title).toBe("写摘要");
    expect(subtaskProgress(withOne)).toEqual({ done: 0, total: 1 });

    const done = toggleSubtask(withOne, withOne.subtasks[0].id);
    expect(done.subtasks[0].done).toBe(true);
    expect(subtaskProgress(done)).toEqual({ done: 1, total: 1 });

    expect(addSubtask(withOne, "   ").subtasks).toHaveLength(1);
    expect(removeSubtask(withOne, withOne.subtasks[0].id).subtasks).toHaveLength(0);
  });
});

describe("task grouping and countdown", () => {
  const now = new Date(2026, 10, 16, 10, 0);
  const task = (title: string, dueDate: string, dueTime = "", done = false) => ({
    ...makeTask({ title, dueDate, dueTime }),
    done,
  });

  it("sorts deadlines into overdue / today / tomorrow / upcoming / later / undated", () => {
    const yesterday = task("昨天", "2026-11-15");
    const todayNoTime = task("今天", "2026-11-16");
    const todayPastTime = task("今天早上", "2026-11-16", "09:00");
    const tomorrow = task("明天", "2026-11-17");
    const soon = task("三天后", "2026-11-19");
    const later = task("下个月", "2026-12-20");
    const undated = task("没日子", "");

    expect(taskBucket(yesterday, now)).toBe("overdue");
    expect(taskBucket(todayNoTime, now)).toBe("today");
    expect(taskBucket(todayPastTime, now)).toBe("overdue");
    expect(taskBucket(tomorrow, now)).toBe("tomorrow");
    expect(taskBucket(soon, now)).toBe("upcoming");
    expect(taskBucket(later, now)).toBe("later");
    expect(taskBucket(undated, now)).toBe("undated");

    const groups = groupTasks(
      [later, tomorrow, yesterday, undated, todayNoTime, soon, todayPastTime],
      now,
    );
    expect(groups.overdue.map((item) => item.title)).toEqual(["昨天", "今天早上"]);
    expect(groups.today.map((item) => item.title)).toEqual(["今天"]);
    expect(groups.tomorrow.map((item) => item.title)).toEqual(["明天"]);
    expect(groups.upcoming.map((item) => item.title)).toEqual(["三天后"]);
    expect(groups.later.map((item) => item.title)).toEqual(["下个月"]);
    expect(groups.undated.map((item) => item.title)).toEqual(["没日子"]);
  });

  it("describes the countdown in user-facing words", () => {
    expect(taskCountdown(task("逾期", "2026-11-14"), now).text).toBe("已逾期 2 天");
    expect(taskCountdown(task("今天", "2026-11-16"), now)).toEqual({
      text: "今天截止",
      tone: "warn",
    });
    expect(taskCountdown(task("两小时后", "2026-11-16", "12:00"), now).text).toBe("还有 120 分钟");
    expect(taskCountdown(task("已过点", "2026-11-16", "09:00"), now)).toEqual({
      text: "已过 09:00 截止时间",
      tone: "danger",
    });
    expect(taskCountdown(task("明天", "2026-11-17", "18:30"), now).text).toBe("明天 18:30");
    expect(taskCountdown(task("没日子", ""), now).tone).toBe("muted");
  });
});
describe("deadline reminders", () => {
  const plan = (now: Date, tasks = [
    makeTask({
      id: "t1",
      title: "交实验报告",
      dueDate: "2026-11-20",
      dueTime: "18:00",
      subtasks: [
        { id: "s1", title: "写摘要", done: false },
        { id: "s2", title: "画图", done: true },
      ],
    }),
  ], sent = {}) =>
    planTaskReminders({ now, timetableId: "tt-1", tasks, sent });

  it("escalates at 3 days, 24h, 3h and 1h before a timed deadline", () => {
    const threeDays = plan(new Date(2026, 10, 18, 12, 0));
    expect(threeDays.map((item) => item.key)).toEqual(["task:tt-1:t1:72h"]);
    expect(threeDays[0].body).toContain("还有不到 3 天");

    const dayBefore = plan(new Date(2026, 10, 19, 20, 0));
    expect(dayBefore.map((item) => item.key)).toEqual(["task:tt-1:t1:24h"]);
    expect(dayBefore[0].title).toBe("DDL 提醒 · 交实验报告");
    expect(dayBefore[0].body).toContain("还有不到 24 小时");
    expect(dayBefore[0].body).toContain("还有 1 个子任务未完成");

    const threeHours = plan(
      new Date(2026, 10, 20, 15, 30),
      undefined,
      { "task:tt-1:t1:72h": "2026-11-17T12:00:00.000Z", "task:tt-1:t1:24h": "2026-11-19T12:00:00.000Z" },
    );
    expect(threeHours.map((item) => item.key)).toEqual(["task:tt-1:t1:3h"]);

    const oneHour = plan(
      new Date(2026, 10, 20, 17, 10),
      undefined,
      {
        "task:tt-1:t1:72h": "2026-11-17T12:00:00.000Z",
        "task:tt-1:t1:24h": "2026-11-19T12:00:00.000Z",
        "task:tt-1:t1:3h": "2026-11-20T07:00:00.000Z",
      },
    );
    expect(oneHour.map((item) => item.key)).toEqual(["task:tt-1:t1:1h"]);
    expect(oneHour[0].body).toContain("还有不到 1 小时");
  });

  it("reminds the evening before when only a date is known", () => {
    const tasks = [makeTask({ id: "t2", title: "读书报告", dueDate: "2026-11-20" })];
    const planned = plan(new Date(2026, 10, 19, 21, 0), tasks);
    expect(planned.map((item) => item.key)).toEqual(["task:tt-1:t2:1d"]);
    expect(planned[0].body).toContain("明天截止");
    expect(planned[0].body).toContain("11/20");
    expect(plan(new Date(2026, 10, 18, 21, 0), tasks)).toHaveLength(0);
  });

  it("skips done, undated and already-due tasks", () => {
    const now = new Date(2026, 10, 20, 17, 40);
    const base = { dueDate: "2026-11-20", dueTime: "18:00" };
    expect(plan(now, [{ ...makeTask({ title: "已完成", ...base }), done: true }])).toHaveLength(0);
    expect(plan(now, [makeTask({ title: "无日期" })])).toHaveLength(0);
    expect(plan(now, [makeTask({ title: "已过期", dueDate: "2026-11-20", dueTime: "17:00" })])).toHaveLength(0);
    expect(
      plan(now, undefined, {
        "task:tt-1:t1:72h": "2026-11-17T12:00:00.000Z",
        "task:tt-1:t1:24h": "2026-11-19T12:00:00.000Z",
        "task:tt-1:t1:3h": "2026-11-20T07:00:00.000Z",
        "task:tt-1:t1:1h": "2026-11-20T09:00:00.000Z",
      }),
    ).toHaveLength(0);
  });
});

describe("repeating tasks", () => {
  it("normalizes repeat rules and requires a due date", () => {
    const [withRepeat, noDate] = normalizeTasks([
      { title: "每周例会", dueDate: "2026-11-20", repeat: "weekly" },
      { title: "有空再看", repeat: "daily" },
    ]);
    expect(withRepeat.repeat).toBe("weekly");
    expect(noDate.repeat).toBe("none");
    expect(makeTask({ title: "无日期", repeat: "daily" }).repeat).toBe("none");
  });

  it("marks non-repeating tasks as done", () => {
    const task = makeTask({ title: "交作业", dueDate: "2026-11-16" });
    expect(completeTask(task, new Date(2026, 10, 16, 10, 0)).done).toBe(true);
  });

  it("completes remaining subtasks when the parent is marked done", () => {
    const task = makeTask({
      title: "交作业",
      dueDate: "2026-11-16",
      subtasks: [
        { id: "s1", title: "写摘要", done: true },
        { id: "s2", title: "画图", done: false },
      ],
    });
    const done = completeTask(task, new Date(2026, 10, 16, 10, 0));
    expect(done.subtasks.map((subtask) => subtask.done)).toEqual([true, true]);
  });

  it("rolls daily and weekly deadlines into the future", () => {
    const now = new Date(2026, 10, 16, 10, 0);
    const daily = makeTask({ title: "背单词", dueDate: "2026-11-15", repeat: "daily" });
    expect(completeTask(daily, now)).toMatchObject({
      done: false,
      dueDate: "2026-11-17",
      repeat: "daily",
    });

    const weekly = makeTask({ title: "交周报", dueDate: "2026-11-16", repeat: "weekly" });
    expect(completeTask(weekly, now).dueDate).toBe("2026-11-23");
  });

  it("keeps the day of month for monthly repeats and clamps short months", () => {
    const now = new Date(2026, 0, 31, 10, 0);
    const monthly = makeTask({ title: "交房租", dueDate: "2026-01-31", repeat: "monthly" });
    expect(completeTask(monthly, now).dueDate).toBe("2026-02-28");
  });

  it("reopens subtasks for the next occurrence", () => {
    const task = makeTask({
      title: "每周复习",
      dueDate: "2026-11-15",
      repeat: "weekly",
      subtasks: [{ id: "s1", title: "第一章", done: true }],
    });
    const next = completeTask(task, new Date(2026, 10, 16, 10, 0));
    expect(next.subtasks[0].done).toBe(false);
    expect(next.dueDate).toBe("2026-11-22");
  });
});
