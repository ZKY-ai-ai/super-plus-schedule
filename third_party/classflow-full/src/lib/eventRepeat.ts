import type { EventRepeat, ScheduleEvent } from "../types";
import { dateKey, parseDateKey } from "./date";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** A single concrete occurrence of a (possibly repeating) schedule event. */
export interface EventOccurrence extends ScheduleEvent {
  /** The date this occurrence falls on (YYYY-MM-DD). `date` mirrors it for display. */
  occurrenceDate: string;
  /** Stable per-occurrence id: `${event.id}@${date}`. */
  occurrenceKey: string;
  /** Whether this occurrence has been checked in. */
  checked: boolean;
  /** The series start date, so editing an occurrence does not shift the series. */
  seriesDate: string;
}

const REPEAT_LABELS: Record<EventRepeat, string> = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
};

export function repeatLabel(rule: EventRepeat): string {
  return REPEAT_LABELS[rule] ?? REPEAT_LABELS.none;
}

function parseKey(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const parsed = parseDateKey(value);
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== value) return null;
  return parsed;
}

function utcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function eventOccursOn(event: ScheduleEvent, date: string): boolean {
  const base = parseKey(event.date);
  const target = parseKey(date);
  if (!base || !target) return false;
  const diffDays = Math.round((utcDay(target) - utcDay(base)) / DAY_MS);
  if (diffDays < 0) return false;
  if (event.repeatUntil) {
    const until = parseKey(event.repeatUntil);
    if (until && utcDay(target) > utcDay(until)) return false;
  }
  switch (event.repeat) {
    case "daily":
      return true;
    case "weekly":
      return diffDays % 7 === 0;
    case "monthly":
      return target.getDate() === base.getDate();
    default:
      return diffDays === 0;
  }
}

function compareOccurrences(a: EventOccurrence, b: EventOccurrence): number {
  if (a.occurrenceDate !== b.occurrenceDate) {
    return a.occurrenceDate.localeCompare(b.occurrenceDate);
  }
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.start !== b.start) return a.start.localeCompare(b.start);
  return a.occurrenceKey.localeCompare(b.occurrenceKey);
}

export function expandEventsForDates(
  events: ScheduleEvent[],
  dates: Date[],
): EventOccurrence[] {
  const keys = [...new Set(dates.map((date) => dateKey(date)))];
  const occurrences: EventOccurrence[] = [];
  for (const event of events) {
    const checkIns = new Set(event.checkIns ?? []);
    for (const key of keys) {
      if (!eventOccursOn(event, key)) continue;
      occurrences.push({
        ...event,
        date: key,
        occurrenceDate: key,
        occurrenceKey: `${event.id}@${key}`,
        checked: checkIns.has(key),
        seriesDate: event.date,
      });
    }
  }
  return occurrences.sort(compareOccurrences);
}

export function toggleEventCheckIn(event: ScheduleEvent, date: string): ScheduleEvent {
  const current = new Set(event.checkIns ?? []);
  if (!eventOccursOn(event, date)) {
    return { ...event, checkIns: [...current].sort() };
  }
  if (current.has(date)) current.delete(date);
  else current.add(date);
  return {
    ...event,
    checkIns: [...current].sort(),
    updatedAt: new Date().toISOString(),
  };
}
