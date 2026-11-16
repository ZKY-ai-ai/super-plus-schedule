import { dateKey } from "./date";
import { examStart, sortExams, type Exam } from "./exams";
import { taskUrgency, type PlannerTask } from "./stats";

/**
 * Tasks that belong in the agenda's "this week" block: everything unfinished
 * that is already overdue, plus anything due inside the given week window.
 * Undated tasks are left to the planner page.
 */
export function collectWeekTasks(
  tasks: PlannerTask[],
  now: Date,
  weekStartKey: string,
  weekEndKey: string,
): PlannerTask[] {
  const collected = tasks.filter((task) => {
    if (task.done) return false;
    const urgency = taskUrgency(task, now);
    if (urgency.minutesLeft === null) return false;
    if (urgency.minutesLeft < 0) return true;
    const dueKey = task.due?.slice(0, 10) ?? "";
    return dueKey >= weekStartKey && dueKey <= weekEndKey;
  });
  return collected.sort((a, b) => {
    const left = taskUrgency(a, now).minutesLeft ?? 0;
    const right = taskUrgency(b, now).minutesLeft ?? 0;
    if (left !== right) return left - right;
    return a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title);
  });
}

/** Exams scheduled from today through the end of the given week. */
export function collectUpcomingExams(exams: Exam[], now: Date, weekEndKey: string): Exam[] {
  const todayKey = dateKey(now);
  return sortExams(
    exams.filter((exam) => {
      if (examStart(exam) === null) return false;
      return exam.date >= todayKey && exam.date <= weekEndKey;
    }),
  );
}

/** "11/20" for date-only deadlines, "11/20 09:00" when a time is attached. */
export function formatTaskDue(task: PlannerTask): string {
  if (!task.due) return "无截止";
  const [year, month, day] = task.due.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return task.due;
  const label = `${month}/${day}`;
  if (task.due.length > 10) {
    const due = new Date(task.due);
    if (!Number.isNaN(due.getTime())) {
      const hours = String(due.getHours()).padStart(2, "0");
      const minutes = String(due.getMinutes()).padStart(2, "0");
      return `${label} ${hours}:${minutes}`;
    }
  }
  return `${label} 截止`;
}

/** "11/20 09:00–11:00", or "11/20 待定" when the time is not announced. */
export function formatExamWhen(exam: Exam): string {
  const label = exam.date ? exam.date.slice(5).replace("-", "/") : "";
  if (!exam.startTime) return label ? `${label} 待定` : "日期待定";
  const range = exam.endTime ? `${exam.startTime}–${exam.endTime}` : exam.startTime;
  return label ? `${label} ${range}` : range;
}
