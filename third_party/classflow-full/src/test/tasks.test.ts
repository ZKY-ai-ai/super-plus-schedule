import { describe, expect, it } from "vitest";
import {
  groupTasks,
  makeTask,
  normalizeTasks,
  parseTasksJson,
  taskBucket,
  taskCountdown,
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