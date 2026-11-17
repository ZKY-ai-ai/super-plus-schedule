import { useMemo } from "react";
import { CalendarPlus, Plus, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import type { Course, Session, Semester } from "../types";
import { toneColor } from "../types";
import { courseDisplayName, conflictSessionIds, findSessionConflicts, formatWeeks, groupSessionsByDay } from "../lib/schedule";
import { getWeekdayNumber, WEEKDAYS } from "../lib/date";
import type { CalendarDayInfo } from "../lib/holidays";
import { ConflictBar } from "./ConflictBar";

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
  onSessionMenu: (session: Session, point: { x: number; y: number }) => void;
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
  onSessionMenu,
  onAddAt,
  onAddCourse,
}: TimetableListProps) {
  const byDay = useMemo(() => groupSessionsByDay(sessions), [sessions]);
  const conflicts = useMemo(() => findSessionConflicts(sessions), [sessions]);
  const conflictIds = useMemo(() => conflictSessionIds(conflicts), [conflicts]);
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

      <ConflictBar conflicts={conflicts} showAliases={showAliases} />

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
                  const conflict = conflictIds.has(session.id);
                  return (
                    <div
                      className={`tt-list-item ${conflict ? "is-conflict" : ""}`}
                      role="button"
                      tabIndex={0}
                      key={session.id}
                      style={{ "--tone": toneColor(session.course.tone) } as CSSProperties}
                      onClick={() => onSelectCourse(session.course)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectCourse(session.course);
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onSessionMenu(session, { x: event.clientX, y: event.clientY });
                      }}
                    >
                      <span className="tt-list-time">
                        <strong>{first?.start ?? session.start}</strong>
                        <small>{last?.end ?? session.end}</small>
                      </span>
                      <span className="tt-list-rule" aria-hidden="true" />
                      <span className="tt-list-copy">
                        <span className="tt-list-title">
                          <span className="tt-list-name">
                            {courseDisplayName(session.course, showAliases)}
                          </span>
                          {conflict ? (
                            <span className="conflict-mark" title="时间冲突">
                              !
                            </span>
                          ) : null}
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
                        <button
                          className="tt-list-menu"
                          type="button"
                          aria-label="课程操作"
                          title="课程操作"
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            onSessionMenu(session, { x: rect.left, y: rect.bottom + 4 });
                          }}
                        >
                          ⋯
                        </button>
                      </span>
                    </div>
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
