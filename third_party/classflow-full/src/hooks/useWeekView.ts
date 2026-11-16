import { useCallback, useEffect, useMemo, useState } from "react";
import type { Preferences, ScheduleData, Semester, Timetable } from "../types";
import {
  dateKey,
  getTermPosition,
  getWeekDates,
  getWeekNumber,
  getWeekdayNumber,
} from "../lib/date";
import { buildSessions, getWeekStats } from "../lib/schedule";
import { periodsForDate } from "../lib/periods";
import {
  filterHolidaySessions,
  getCalendarSummary,
  getDayStatusMap,
  getVisibleDays,
} from "../lib/holidays";

interface WeekViewParams {
  data: ScheduleData;
  prefs: Preferences;
  timetable: Timetable;
  now: Date;
}

export type WeekView = ReturnType<typeof useWeekView>;

export function useWeekView({ data, prefs, timetable, now }: WeekViewParams) {
  const semester = timetable.semester;
  const events = timetable.events;
  const [week, setWeek] = useState(() =>
    getWeekNumber(semester.startDate, new Date(), semester.totalWeeks),
  );
  const [selectedDay, setSelectedDay] = useState(() => getWeekdayNumber(new Date()));

  const todayNumber = getWeekdayNumber(now);
  const termPosition = getTermPosition(semester.startDate, semester.totalWeeks, now);
  const currentWeek = termPosition.week;
  const termState = termPosition.state;
  const todayKey = dateKey(now);

  const viewDates = useMemo(() => getWeekDates(semester.startDate, week), [semester.startDate, week]);
  const currentDates = useMemo(
    () => getWeekDates(semester.startDate, currentWeek),
    [semester.startDate, currentWeek],
  );
  const calendarOverrides = timetable.calendarOverrides;
  const viewDays = useMemo(
    () => getVisibleDays(semester.showWeekends, viewDates, prefs.autoHolidays, calendarOverrides),
    [semester.showWeekends, viewDates, prefs.autoHolidays, calendarOverrides],
  );
  const currentDays = useMemo(
    () => getVisibleDays(semester.showWeekends, currentDates, prefs.autoHolidays, calendarOverrides),
    [semester.showWeekends, currentDates, prefs.autoHolidays, calendarOverrides],
  );
  const viewDayStatuses = useMemo(
    () => getDayStatusMap(viewDates, prefs.autoHolidays, calendarOverrides),
    [viewDates, prefs.autoHolidays, calendarOverrides],
  );
  const currentDayStatuses = useMemo(
    () => getDayStatusMap(currentDates, prefs.autoHolidays, calendarOverrides),
    [currentDates, prefs.autoHolidays, calendarOverrides],
  );
  const rawViewSessions = useMemo(
    () => buildSessions(timetable.courses, week, timetable.overrides),
    [timetable.courses, timetable.overrides, week],
  );
  const rawCurrentSessions = useMemo(
    () => buildSessions(timetable.courses, currentWeek, timetable.overrides),
    [timetable.courses, timetable.overrides, currentWeek],
  );
  const viewSessions = useMemo(
    () => filterHolidaySessions(rawViewSessions, viewDates, prefs.autoHolidays, calendarOverrides),
    [rawViewSessions, viewDates, prefs.autoHolidays, calendarOverrides],
  );
  const currentSessions = useMemo(
    () =>
      filterHolidaySessions(
        rawCurrentSessions,
        currentDates,
        prefs.autoHolidays,
        calendarOverrides,
      ),
    [rawCurrentSessions, currentDates, prefs.autoHolidays, calendarOverrides],
  );
  const viewPeriods = useMemo(
    () => periodsForDate(timetable, data.periodProfiles, viewDates[viewDates.length - 1] ?? new Date()),
    [timetable, data.periodProfiles, viewDates],
  );
  const currentPeriods = useMemo(
    () => periodsForDate(timetable, data.periodProfiles, now),
    [timetable, data.periodProfiles, todayKey],
  );
  const viewSemester = useMemo(
    () => ({ ...semester, periods: viewPeriods }),
    [semester, viewPeriods],
  );
  const viewStats = useMemo(
    () => getWeekStats(viewSessions, viewPeriods),
    [viewSessions, viewPeriods],
  );
  const currentStats = useMemo(
    () => getWeekStats(currentSessions, currentPeriods),
    [currentSessions, currentPeriods],
  );
  const calendarSummary = useMemo(
    () => getCalendarSummary(viewDates, prefs.autoHolidays, calendarOverrides),
    [viewDates, prefs.autoHolidays, calendarOverrides],
  );
  const selectedDate = viewDates[selectedDay - 1] ?? viewDates[0];
  const selectedEvents = selectedDate
    ? events.filter((event) => event.date === dateKey(selectedDate))
    : [];
  const weekEvents = useMemo(() => {
    const keys = new Set(viewDates.map((date) => dateKey(date)));
    return events
      .filter((event) => keys.has(event.date))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start.localeCompare(b.start);
      });
  }, [events, viewDates]);
  const todayEvents = events.filter((event) => event.date === dateKey(now));

  useEffect(() => {
    if (termState === "during" && week > semester.totalWeeks) {
      setWeek(semester.totalWeeks);
    }
    if (week < 1) setWeek(1);
  }, [semester.totalWeeks, termState, week]);

  useEffect(() => {
    if (!viewDays.includes(selectedDay)) {
      setSelectedDay(viewDays.includes(todayNumber) ? todayNumber : viewDays[0] ?? 1);
    }
  }, [viewDays, selectedDay, todayNumber]);

  useEffect(() => {
    if (selectedDay > 7) setSelectedDay(1);
  }, [selectedDay]);

  const goToWeek = useCallback(
    (nextWeek: number) => {
      setWeek(Math.min(Math.max(nextWeek, 1), semester.totalWeeks));
    },
    [semester.totalWeeks],
  );

  const goToday = useCallback(() => {
    setWeek(currentWeek);
    setSelectedDay(viewDays.includes(todayNumber) ? todayNumber : viewDays[0] ?? 1);
  }, [currentWeek, todayNumber, viewDays]);

  const resetToTimetable = useCallback((target: Timetable) => {
    setWeek(getWeekNumber(target.semester.startDate, new Date(), target.semester.totalWeeks));
    setSelectedDay(Math.min(getWeekdayNumber(new Date()), target.semester.showWeekends ? 7 : 5));
  }, []);

  const resetToSemester = useCallback((next: Semester) => {
    setWeek(getWeekNumber(next.startDate, new Date(), next.totalWeeks));
    setSelectedDay((current) => Math.min(current, next.showWeekends ? 7 : 5));
  }, []);

  return {
    now,
    week,
    setWeek,
    selectedDay,
    setSelectedDay,
    todayNumber,
    currentWeek,
    termState,
    viewDates,
    currentDates,
    viewDays,
    currentDays,
    viewDayStatuses,
    currentDayStatuses,
    viewSessions,
    currentSessions,
    viewPeriods,
    currentPeriods,
    viewSemester,
    viewStats,
    currentStats,
    calendarSummary,
    selectedDate,
    selectedEvents,
    weekEvents,
    todayEvents,
    goToWeek,
    goToday,
    resetToTimetable,
    resetToSemester,
  };
}
