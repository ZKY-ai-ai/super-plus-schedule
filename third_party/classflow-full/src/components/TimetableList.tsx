import { useMemo } from "react";
import { CalendarPlus, Plus, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import type { Course, Session, Semester } from "../types";
import { toneColor } from "../types";
import { courseDisplayName, formatWeeks, groupSessionsByDay } from "../lib/schedule";
import { getWeekdayNumber, WEEKDAYS } from "../lib/date";
import type { CalendarDayInfo } from "../lib/holidays";

interface TimetableListProps {
  semester: Semester;
  week: number;
  currentWeek: number;
  dates: Date[];
  days: number[];
  courses: Course[];
  sessions: Session[];
  dayStatuses: Record<number, CalendarDayInfo | null>;
  calendarSummary: { holidays: string[]; workdays: string[] };
  showAliases: boolean;
  now: Date;
  onSelectCourse: (course: Course) => void;
  onAddAt: (day: number, start: number) => void;
  onAddCourse: () => void;
}

export function TimetableList({
  semester,
  week,
  currentWeek,
  dates,
  days,
  courses,
  sessions,
  dayStatuses,
  calendarSummary,
  showAliases,
  now,
  onSelectCourse,
  onAddAt,
  onAddCourse,
}: TimetableListProps) {
  const byDay = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const todayNumber = getWeekdayNumber(now);

  if (courses.length === 0) {
    return (
      <div className="blank-board">
        <span className="blank-board-icon">
          <Sparkles size={22} />
        </span>
        <p className="eyebrow">A FRESH START</p>
        <h3>课表还是空的</h3>
        <p>先把学期和作息调好，再把第一门课放进来。</p>
        <button className="primary-button" type="button" onClick={onAddCourse}>
          <Plus size={16} />
          添加第一门课
        </button>
      </div>
    );
  }

  return (
    <div className="timetable-list">
      {calendarSummary.holidays.length > 0 || calendarSummary.workdays.length > 0 ? (
        <div className="calendar-strip">
          <CalendarPlus size={15} />
          <div>
            {calendarSummary.holidays.length > 0 ? (
              <span>
                <strong>{calendarSummary.holidays.join("、")}</strong> 放假，假期课程已自动隐藏。
              </span>
            ) : null}
            {calendarSummary.workdays.length > 0 ? (
              <span className="calendar-strip-workday">
                调休上班：{calendarSummary.workdays.join("、")}，周末仍会显示。
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {days.map((day) => {
        const info = WEEKDAYS[day - 1];
        const date = dates[day - 1];
        const status = dayStatuses[day] ?? null;
        const isToday = week === currentWeek && day === todayNumber;
        const daySessions = byDay[day] ?? [];
        const holiday = status?.kind === "holiday";
        return (
          <section
            className={`tt-list-day ${isToday ? "is-today" : ""} ${status ? `is-${status.kind}` : ""}`}
            key={day}
            title={status ? status.name : undefined}
          >
            <header className="tt-list-head">
              <span className="tt-list-date">
                <b>{info.label}</b>
                <small>{date ? `${date.getMonth() + 1}/${date.getDate()}` : ""}</small>
              </span>
              {status ? (
                <span className={`day-status-tag is-${status.kind}`}>{status.short}</span>
              ) : null}
              {isToday ? <span className="tt-list-now">今天</span> : null}
              <span className="tt-list-count">
                {daySessions.length > 0 ? `${daySessions.length} 节` : "空闲"}
              </span>
            </header>

            {daySessions.length > 0 ? (
              <div className="tt-list-body">
                {daySessions.map((session) => {
                  const first = semester.periods[session.start - 1];
                  const last = semester.periods[session.end - 1];
                  return (
                    <button
                      className="tt-list-item"
                      type="button"
                      key={session.id}
                      style={{ "--tone": toneColor(session.course.tone) } as CSSProperties}
                      onClick={() => onSelectCourse(session.course)}
                    >
                      <span className="tt-list-time">
                        <strong>{first?.start ?? session.start}</strong>
                        <small>{last?.end ?? session.end}</small>
                      </span>
                      <span className="tt-list-rule" aria-hidden="true" />
                      <span className="tt-list-copy">
                        <span className="tt-list-name">
                          {courseDisplayName(session.course, showAliases)}
                        </span>
                        <span className="tt-list-meta">
                          {session.course.location || "地点待定"}
                          {session.course.teacher ? ` · @${session.course.teacher}` : ""}
                        </span>
                      </span>
                      <span className="tt-list-side">
                        <span className="tt-list-period">
                          {session.start === session.end
                            ? `第 ${session.start} 节`
                            : `第 ${session.start}–${session.end} 节`}
                        </span>
                        <span className="tt-list-weeks">{formatWeeks(session.slot)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                className="tt-list-empty"
                type="button"
                disabled={holiday}
                onClick={() => onAddAt(day, 1)}
              >
                {holiday ? `${status?.name ?? "节假日"}，没有课程` : "这一天还没有课，点此添加"}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
