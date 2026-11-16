import { useEffect, useRef } from "react";
import type { ScheduleData, Timetable } from "../types";
import {
  addDays,
  dateKey,
  getTermPosition,
  getWeekNumber,
  getWeekdayNumber,
} from "../lib/date";
import { buildSessions } from "../lib/schedule";
import { periodsForDate } from "../lib/periods";
import { isHolidayDate } from "../lib/holidays";
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
      if (getTermPosition(timetable.semester.startDate, timetable.semester.totalWeeks, now).state !== "during") {
        return;
      }

      const sessionsOn = (date: Date) => {
        const week = getWeekNumber(
          timetable.semester.startDate,
          date,
          timetable.semester.totalWeeks,
        );
        const periods = periodsForDate(timetable, data.periodProfiles, date);
        if (autoHolidays && isHolidayDate(date)) return { sessions: [], periods };
        const weekday = getWeekdayNumber(date);
        return {
          sessions: buildSessions(timetable.courses, week).filter(
            (session) => session.day === weekday,
          ),
          periods,
        };
      };

      const today = sessionsOn(now);
      const tomorrowDate = addDays(now, 1);
      const tomorrow = sessionsOn(tomorrowDate);
      const planned = planReminders({
        now,
        timetableId: timetable.id,
        todayKey: dateKey(now),
        tomorrowKey: dateKey(tomorrowDate),
        settings,
        todaySessions: today.sessions,
        todayPeriods: today.periods,
        tomorrowSessions: tomorrow.sessions,
        tomorrowPeriods: tomorrow.periods,
        sent: sentRef.current,
      });
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