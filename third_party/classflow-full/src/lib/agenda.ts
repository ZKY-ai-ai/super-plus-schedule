import { dateKey } from "./date";
import { examStart, sortExams, type Exam } from "./exams";
import { groupTasks, taskBucket, type Task } from "./tasks";

/**
 * Tasks that belong in the agenda's "this week" block: everything unfinished
 * that is already overdue, plus anything due inside the given week window.
 * Undated tasks are left to the planner page.
 */
export function collectWeekTasks(
  tasks: Task[],
  now: Date,
  weekStartKey: string,
  weekEndKey: string,
): Task[] {
  const picked = tasks.filter((task) => {
    if (task.done || !task.dueDate) return false;
    if (taskBucket(task, now) === "overdue") return true;
    return task.dueDate >= weekStartKey && task.dueDate <= weekEndKey;
  });
  const groups = groupTasks(picked, now);
  return [
    ...groups.overdue,
    ...groups.today,
    ...groups.tomorrow,
    ...groups.upcoming,
    ...groups.later,
  ];
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

/** "11/20 09:00–11:00", or "11/20 待定" when the time is not announced. */
export function formatExamWhen(exam: Exam): string {
  const label = exam.date ? exam.date.slice(5).replace("-", "/") : "";
  if (!exam.startTime) return label ? `${label} 待定` : "日期待定";
  const range = exam.endTime ? `${exam.startTime}–${exam.endTime}` : exam.startTime;
  return label ? `${label} ${range}` : range;
}
