// Ported from StudyDesk (https://github.com/arun-v-p/StudyDesk), MIT.
// Source: src/features/revision/schedule.ts — date-fns removed.
export interface ScheduledReview {
  subjectId: string;
  scheduledDate: string;
  scheduledTime: string;
}

export type ScheduleResult =
  | { ok: true; sessions: ScheduledReview[] }
  | {
      ok: false;
      reason:
        | "invalid-exam"
        | "invalid-start-time"
        | "past-exam"
        | "exam-today"
        | "no-subjects"
        | "insufficient-days";
      availableDays: number;
    };

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 只用年月日计算相差天数，避免夏令时把 23 小时当成一天。 */
function differenceInCalendarDays(later: Date, earlier: Date): number {
  const utc = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc(later) - utc(earlier)) / 86_400_000);
}

function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function isResolvableDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(fromDayKey(value).getTime());
}

function isValidLocalExamDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  return Boolean(match && isResolvableDayKey(match[1]!) && toMinutes(match[2]!) != null);
}

/** 考前把每门课的一次复习均匀铺到可用的本地日期上。 */
export function generateReviewSchedule(
  subjectIds: string[],
  examAt: string,
  today = new Date(),
  sessionDurationMinutes = 45,
  preferredStartTime = "09:00",
): ScheduleResult {
  if (subjectIds.length === 0) return { ok: false, reason: "no-subjects", availableDays: 0 };
  if (!isValidLocalExamDateTime(examAt))
    return { ok: false, reason: "invalid-exam", availableDays: 0 };
  const preferredStartMinutes = toMinutes(preferredStartTime);
  if (preferredStartMinutes == null || preferredStartMinutes + sessionDurationMinutes > 22 * 60)
    return { ok: false, reason: "invalid-start-time", availableDays: 0 };

  const todayKey = dayKey(today);
  const examDate = examAt.slice(0, 10);
  if (examDate < todayKey) return { ok: false, reason: "past-exam", availableDays: 0 };
  if (examDate === todayKey) return { ok: false, reason: "exam-today", availableDays: 0 };

  const currentMinutes = today.getHours() * 60 + today.getMinutes();
  const sameDayMinutes = Math.max(preferredStartMinutes, Math.ceil((currentMinutes + 1) / 30) * 30);
  const canUseToday = sameDayMinutes + sessionDurationMinutes <= 22 * 60;
  const firstStudyDate = canUseToday ? todayKey : dayKey(addDays(fromDayKey(todayKey), 1));
  const firstStudyTime = canUseToday ? fromMinutes(sameDayMinutes) : preferredStartTime;
  const lastStudyDay = fromDayKey(examDate);
  lastStudyDay.setDate(lastStudyDay.getDate() - 1);
  const availableDays = Math.max(
    0,
    differenceInCalendarDays(lastStudyDay, fromDayKey(firstStudyDate)) + 1,
  );
  if (subjectIds.length > availableDays)
    return { ok: false, reason: "insufficient-days", availableDays };

  const sessions = subjectIds.map((subjectId, index) => {
    const dayOffset =
      subjectIds.length === 1
        ? 0
        : Math.round((index * (availableDays - 1)) / (subjectIds.length - 1));
    return {
      subjectId,
      scheduledDate: dayKey(addDays(fromDayKey(firstStudyDate), dayOffset)),
      scheduledTime: dayOffset === 0 ? firstStudyTime : preferredStartTime,
    };
  });
  return { ok: true, sessions };
}