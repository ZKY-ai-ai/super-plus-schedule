// Ported from StudyDesk (https://github.com/arun-v-p/StudyDesk), MIT.
// Source: src/features/timer/usePomodoro.ts
//
// The timer is driven by an absolute deadline instead of a decremented
// countdown: the interval only re-reads the clock, so it does not drift and the
// effect depends only on `isRunning`. Completed focus sessions persist per
// local day, so reloading the page does not reset today's count.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TimerMode = "focus" | "shortBreak" | "longBreak";

export const DURATIONS: Record<TimerMode, number> = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

export const LABELS: Record<TimerMode, string> = {
  focus: "专注",
  shortBreak: "短休息",
  longBreak: "长休息",
};

export const LONG_BREAK_EVERY = 4;

export const TIMER_STORAGE_KEY = "kexu:study:focus:v1";

interface TimerPersist {
  day: string;
  completed: number;
  focusSeconds: number;
}

function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadPersisted(): TimerPersist {
  const empty: TimerPersist = { day: localDay(), completed: 0, focusSeconds: 0 };
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<TimerPersist>;
    if (parsed.day !== localDay()) return empty;
    return {
      day: parsed.day ?? localDay(),
      completed: Number(parsed.completed) || 0,
      focusSeconds: Number(parsed.focusSeconds) || 0,
    };
  } catch {
    return empty;
  }
}

export interface UsePomodoroOptions {
  onComplete?: (mode: TimerMode, completedToday: number) => void;
  durations?: Partial<Record<TimerMode, number>>;
}

export function usePomodoro({ onComplete, durations }: UsePomodoroOptions = {}) {
  const secs = useMemo(() => ({ ...DURATIONS, ...durations }), [durations]);
  const [mode, setMode] = useState<TimerMode>("focus");
  const [isRunning, setIsRunning] = useState(false);
  const [remaining, setRemaining] = useState(secs.focus);
  const [stats, setStats] = useState<TimerPersist>(loadPersisted);
  const endsAtRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    try {
      localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(stats));
    } catch {
      // 计时统计不是关键数据，写入失败时保持当前会话可用。
    }
  }, [stats]);

  useEffect(() => {
    if (!isRunning || endsAtRef.current == null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endsAtRef.current! - Date.now()) / 1000));
      setRemaining(left);
      if (left > 0) return;
      endsAtRef.current = null;
      setIsRunning(false);
      if (mode === "focus") {
        setStats((current) =>
          current.day === localDay()
            ? {
                ...current,
                completed: current.completed + 1,
                focusSeconds: current.focusSeconds + secs.focus,
              }
            : { day: localDay(), completed: 1, focusSeconds: secs.focus },
        );
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [isRunning, mode, secs.focus]);

  useEffect(() => {
    if (isRunning || remaining !== 0) return;
    onCompleteRef.current?.(mode, stats.completed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, remaining]);

  const start = useCallback(() => {
    if (remaining <= 0) return;
    endsAtRef.current = Date.now() + remaining * 1000;
    setIsRunning(true);
  }, [remaining]);

  const pause = useCallback(() => {
    endsAtRef.current = null;
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => (isRunning ? pause() : start()), [isRunning, pause, start]);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    setIsRunning(false);
    setRemaining(secs[mode]);
  }, [mode, secs]);

  const switchMode = useCallback(
    (next: TimerMode, { autostart = false }: { autostart?: boolean } = {}) => {
      endsAtRef.current = null;
      setIsRunning(false);
      setMode(next);
      setRemaining(secs[next]);
      if (autostart) {
        endsAtRef.current = Date.now() + secs[next] * 1000;
        setIsRunning(true);
      }
    },
    [secs],
  );

  const nextMode = useCallback((): TimerMode => {
    if (mode !== "focus") return "focus";
    return (stats.completed + 1) % LONG_BREAK_EVERY === 0 ? "longBreak" : "shortBreak";
  }, [mode, stats.completed]);

  const skip = useCallback(() => switchMode(nextMode()), [nextMode, switchMode]);

  useEffect(() => {
    const base = document.title.replace(/\s*[·\-—]\s*课序.*$/, "");
    if (!isRunning) {
      document.title = base;
      return;
    }
    const m = String(Math.floor(remaining / 60)).padStart(2, "0");
    const s = String(remaining % 60).padStart(2, "0");
    document.title = `${m}:${s} · ${LABELS[mode]} — 课序`;
    return () => {
      document.title = base;
    };
  }, [isRunning, remaining, mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const el = event.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const total = secs[mode];
  return {
    mode,
    remaining,
    isRunning,
    progress: total > 0 ? 1 - remaining / total : 0,
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
    sessionsToday: stats.completed,
    focusSecondsToday: stats.focusSeconds,
    untilLongBreak: LONG_BREAK_EVERY - (stats.completed % LONG_BREAK_EVERY),
    nextMode,
    toggle,
    start,
    pause,
    reset,
    skip,
    switchMode,
  };
}