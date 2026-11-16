import { useCallback, useEffect, useRef, useState } from "react";
import type { Preferences, ScheduleData, Theme, Timetable, TimetableLayout } from "../types";
import { dateKey } from "../lib/date";
import { getActiveTimetable } from "../lib/factory";
import { loadPreferences, loadSchedule, savePreferences, saveSchedule } from "../lib/storage";
import { syncAndroidWidget } from "../lib/widget";
import { useReminderEngine } from "./useReminderEngine";

export type ScheduleStore = ReturnType<typeof useScheduleStore>;

const MAX_HISTORY = 50;

export function useScheduleStore(now: Date) {
  const [data, setDataState] = useState<ScheduleData>(() => loadSchedule());
  const dataRef = useRef(data);
  dataRef.current = data;
  const undoStack = useRef<ScheduleData[]>([]);
  const redoStack = useRef<ScheduleData[]>([]);
  const [, setHistoryTick] = useState(0);

  const setData = useCallback((update: ScheduleData | ((current: ScheduleData) => ScheduleData)) => {
    const current = dataRef.current;
    const next = typeof update === "function" ? update(current) : update;
    if (!next || next === current) return;
    undoStack.current = [...undoStack.current.slice(-(MAX_HISTORY - 1)), current];
    redoStack.current = [];
    dataRef.current = next;
    setDataState(next);
    setHistoryTick((tick) => tick + 1);
  }, []);

  const undo = useCallback((): boolean => {
    const previous = undoStack.current.pop();
    if (!previous) return false;
    redoStack.current.push(dataRef.current);
    dataRef.current = previous;
    setDataState(previous);
    setHistoryTick((tick) => tick + 1);
    return true;
  }, []);

  const redo = useCallback((): boolean => {
    const next = redoStack.current.pop();
    if (!next) return false;
    undoStack.current.push(dataRef.current);
    dataRef.current = next;
    setDataState(next);
    setHistoryTick((tick) => tick + 1);
    return true;
  }, []);

  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());
  const [storageOk, setStorageOk] = useState(true);
  const timetable = getActiveTimetable(data);
  const todayKey = dateKey(now);
  useReminderEngine({ data, timetable, autoHolidays: prefs.autoHolidays });

  const updateActiveTimetable = useCallback((updater: (current: Timetable) => Timetable) => {
    setData((current) => {
      const activeId = current.activeTimetableId;
      const timestamp = new Date().toISOString();
      return {
        ...current,
        updatedAt: timestamp,
        timetables: current.timetables.map((item) =>
          item.id === activeId ? { ...updater(item), updatedAt: timestamp } : item,
        ),
      };
    });
  }, [setData]);

  useEffect(() => {
    setStorageOk(saveSchedule(data));
  }, [data]);

  useEffect(() => {
    void syncAndroidWidget(data, prefs.autoHolidays).catch(() => undefined);
  }, [data, prefs.autoHolidays, todayKey]);

  useEffect(() => {
    savePreferences(prefs);
    document.documentElement.dataset.theme = prefs.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute(
      "content",
      prefs.theme === "dark" ? "#101613" : prefs.theme === "whale" ? "#071426" : "#f4f1e8",
    );
  }, [prefs]);

  const toggleTheme = useCallback(() => {
    const themes: Theme[] = ["light", "dark", "whale"];
    setPrefs((current) => ({
      ...current,
      theme: themes[(themes.indexOf(current.theme) + 1) % themes.length],
    }));
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    setPrefs((current) => ({ ...current, theme }));
  }, []);

  const setAutoHolidays = useCallback((value: boolean) => {
    setPrefs((current) => ({ ...current, autoHolidays: value }));
  }, []);

  const setLayout = useCallback((layout: TimetableLayout) => {
    setPrefs((current) => ({ ...current, layout }));
  }, []);

  const setShowAliases = useCallback((showAliases: boolean) => {
    setPrefs((current) => ({ ...current, showAliases }));
  }, []);

  return {
    data,
    setData,
    prefs,
    setPrefs,
    storageOk,
    timetable,
    semester: timetable.semester,
    courses: timetable.courses,
    events: timetable.events,
    updateActiveTimetable,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    toggleTheme,
    setTheme,
    setAutoHolidays,
    setLayout,
    setShowAliases,
  };
}
