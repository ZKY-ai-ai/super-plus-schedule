import { useEffect, useRef } from "react";
import type { ScheduleData, Timetable } from "../types";
import {
  addDays,
  dateKey,
  getTermPosition,
  getWeekDates,
  getWeekNumber,
  getWeekdayNumber,
} from "../lib/date";
import { buildSessions } from "../lib/schedule";
import { periodsForDate } from "../lib/periods";
import { applyCalendarToSessions } from "../lib/holidays";
import { loadExams, planExamReminders } from "../lib/exams";
import { loadTasks, planTaskReminders } from "../lib/tasks";
import {
  loadReminderSettings,
  loadSentLog,
  planReminders,
  pruneSentLog,
  saveSentLog,
} from "../lib/reminders";

interface ReminderEngineParams {
  data: ScheduleData;
  timetable: Timetable;
  autoHolidays: boolean;
}

/**
 * Mounted once with the active timetable. Settings are re-read from storage on
 * every tick so the settings tab and the engine never share React state.
 */
export function useReminderEngine({ data, timetable, autoHolidays }: ReminderEngineParams) {
  const sentRef = useRef(loadSentLog());

  useEffect(() => {
    const tick = () => {
      const settings = loadReminderSettings();
      if (!settings.enabled) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const now = new Date();
      if (
        getTermPosition(
          timetable.semester.startDate,
          timetable.semester.totalWeeks,
          now,
          timetable.semester.weekStartsOn ?? 1,
        ).state !== "during"
      ) {
        return;
      }

      const sessionsOn = (date: Date) => {
        const week = getWeekNumber(
          timetable.semester.startDate,
          date,
          timetable.semester.totalWeeks,
          timetable.semester.weekStartsOn ?? 1,
        );
        const periods = periodsForDate(timetable, data.periodProfiles, date);
        const weekday = getWeekdayNumber(date);
        const weekDates = getWeekDates(
          timetable.semester.startDate,
          week,
          timetable.semester.weekStartsOn ?? 1,
        );
        return {
          sessions: applyCalendarToSessions(
            buildSessions(timetable.courses, week, timetable.overrides),
            weekDates,
            autoHolidays,
            timetable.calendarOverrides ?? [],
          ).filter((session) => session.day === weekday),
          periods,
        };
      };

      const today = sessionsOn(now);
      const tomorrowDate = addDays(now, 1);
      const tomorrow = sessionsOn(tomorrowDate);
      const todayKey = dateKey(now);
      const tomorrowKey = dateKey(tomorrowDate);
      const tasks = loadTasks(timetable.id);
      const pendingTasks = tasks.filter((task) => !task.done && task.dueDate);
      const courseName = (courseId: string | null) =>
        timetable.courses.find((course) => course.id === courseId)?.name ?? "";
      const planned = planReminders({
        now,
        timetableId: timetable.id,
        todayKey,
        tomorrowKey,
        settings,
        todaySessions: today.sessions,
        todayPeriods: today.periods,
        tomorrowSessions: tomorrow.sessions,
        tomorrowPeriods: tomorrow.periods,
        todayTasks: pendingTasks.filter((task) => task.dueDate === todayKey),
        tomorrowTasks: pendingTasks.filter((task) => task.dueDate === tomorrowKey),
        overdueTasks: pendingTasks.filter((task) => task.dueDate < todayKey),
        courseName,
        sent: sentRef.current,
      });
      if (settings.examReminders) {
        planned.push(
          ...planExamReminders({
            now,
            timetableId: timetable.id,
            exams: loadExams(timetable.id),
            courseName,
            sent: sentRef.current,
          }),
        );
      }
      if (settings.taskReminders) {
        planned.push(
          ...planTaskReminders({
            now,
            timetableId: timetable.id,
            tasks,
            sent: sentRef.current,
          }),
        );
      }
      if (planned.length === 0) return;

      const next = { ...sentRef.current };
      for (const reminder of planned) {
        next[reminder.key] = now.toISOString();
        try {
          new Notification(reminder.title, { body: reminder.body, tag: reminder.key });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
      const pruned = pruneSentLog(next, now);
      sentRef.current = pruned;
      saveSentLog(pruned);
    };

    tick();
    const timer = window.setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timetable, data.periodProfiles, autoHolidays]);
}