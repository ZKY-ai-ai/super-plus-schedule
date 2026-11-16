import { CalendarPlus, ChevronLeft, ChevronRight, GraduationCap, ListTodo, Plus } from "lucide-react";
import type { CalendarDayInfo } from "../lib/holidays";
import {
  collectUpcomingExams,
  collectWeekTasks,
  formatExamWhen,
} from "../lib/agenda";
import { dateKey as toDateKey, formatWeekRange, WEEKDAYS } from "../lib/date";
import { examCountdown, examTypeLabel, type Exam } from "../lib/exams";
import { describeDue, taskBucket, type Task } from "../lib/tasks";
import type {
  Period,
  ScheduleEvent,
  Semester,
  Session,
  WeekStats,
} from "../types";
import { toneColor } from "../types";
import { DayView } from "./DayView";
import { TodayRail } from "./TodayRail";

interface AgendaPageProps {
  now: Date;
  week: number;
  currentWeek: number;
  totalWeeks: number;
  semester: Semester;
  dates: Date[];
  days: number[];
  sessions: Session[];
  selectedDay: number;
  selectedEvents: ScheduleEvent[];
  weekEvents: ScheduleEvent[];
  dayStatuses: Record<number, CalendarDayInfo | null>;
  currentDates: Date[];
  currentSessions: Session[];
  currentPeriods: Period[];
  currentStats: WeekStats;
  currentDays: number[];
  currentDayStatuses: Record<number, CalendarDayInfo | null>;
  todayNumber: number;
  todayEvents: ScheduleEvent[];
  showAliases: boolean;
  tasks?: Task[];
  exams?: Exam[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSelectDay: (day: number) => void;
  onSelectCourse: (course: Session["course"]) => void;
  onAddAt: (day: number, start: number) => void;
  onAddEventAt: (date: string) => void;
  onSelectEvent: (event: ScheduleEvent) => void;
}

export function AgendaPage({
  now,
  week,
  currentWeek,
  totalWeeks,
  semester,
  dates,
  days,
  sessions,
  selectedDay,
  selectedEvents,
  weekEvents,
  dayStatuses,
  currentDates,
  currentSessions,
  currentPeriods,
  currentStats,
  currentDays,
  currentDayStatuses,
  todayNumber,
  todayEvents,
  showAliases,
  tasks = [],
  exams = [],
  onPrevWeek,
  onNextWeek,
  onToday,
  onSelectDay,
  onSelectCourse,
  onAddAt,
  onAddEventAt,
  onSelectEvent,
}: AgendaPageProps) {
  const selectedDate = dates[selectedDay - 1];
  const dateKey = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(
        selectedDate.getDate(),
      ).padStart(2, "0")}`
    : "";

  const weekKeys = dates.map((date) => toDateKey(date)).sort();
  const weekStartKey = weekKeys[0] ?? toDateKey(now);
  const weekEndKey = weekKeys[weekKeys.length - 1] ?? toDateKey(now);
  const weekTasks = collectWeekTasks(tasks, now, weekStartKey, weekEndKey);
  const upcomingExams = collectUpcomingExams(exams, now, weekEndKey);

  const courseNames = new Map<string, string>();
  for (const session of [...sessions, ...currentSessions]) {
    const course = session.course;
    courseNames.set(course.id, showAliases && course.alias ? course.alias : course.name);
  }

  return (
    <div className="agenda-page">
      <section className="agenda-hero">
        <div>
          <p className="eyebrow">AGENDA</p>
          <h1>日程与单日表</h1>
          <p className="agenda-sub">
            {formatWeekRange(dates)} · 第 {week} 周 / 共 {totalWeeks} 周
          </p>
        </div>
        <div className="week-switcher" role="group" aria-label="切换周次">
          <button type="button" onClick={onPrevWeek} disabled={week <= 1} aria-label="上一周">
            <ChevronLeft size={18} />
          </button>
          <button
            className={`week-today ${week === currentWeek ? "is-current" : ""}`}
            type="button"
            onClick={onToday}
            disabled={week === currentWeek}
          >
            {week === currentWeek ? "本周" : "回到本周"}
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            disabled={week >= totalWeeks}
            aria-label="下一周"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <div className="agenda-layout">
        <div className="agenda-main">
          <section className="board agenda-board" aria-label="单日课表">
            <DayView
              semester={semester}
              week={week}
              currentWeek={currentWeek}
              dates={dates}
              days={days}
              sessions={sessions}
              events={selectedEvents}
              dayStatuses={dayStatuses}
              selectedDay={selectedDay}
              showAliases={showAliases}
              now={now}
              onSelectDay={onSelectDay}
              onSelectCourse={onSelectCourse}
              onAddAt={onAddAt}
              onAddEvent={(date) => onAddEventAt(date)}
              onSelectEvent={onSelectEvent}
            />
          </section>

          <section className="agenda-events" aria-label="本周日程列表">
            <div className="agenda-events-head">
              <div>
                <p className="eyebrow">THIS WEEK</p>
                <h2>本周日程</h2>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => onAddEventAt(dateKey)}
              >
                <Plus size={14} />
                添加日程
              </button>
            </div>
            {weekEvents.length > 0 ? (
              <div className="agenda-event-list">
                {weekEvents.map((event) => {
                  const [, month, date] = event.date.split("-");
                  const weekday = WEEKDAYS[new Date(`${event.date}T00:00:00`).getDay() === 0 ? 7 : new Date(`${event.date}T00:00:00`).getDay()].label;
                  return (
                    <button
                      className="agenda-event-item"
                      type="button"
                      key={event.id}
                      onClick={() => onSelectEvent(event)}
                    >
                      <span
                        className="agenda-event-dot"
                        style={{ background: toneColor(event.tone) }}
                        aria-hidden="true"
                      />
                      <span className="agenda-event-date">
                        <strong>
                          {Number(month)}/{Number(date)}
                        </strong>
                        <small>{weekday}</small>
                      </span>
                      <span className="agenda-event-copy">
                        <strong>{event.title}</strong>
                        {event.note ? <small>{event.note}</small> : null}
                      </span>
                      <span className="agenda-event-time">
                        {event.allDay ? "全天" : event.start}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="agenda-events-empty">
                <CalendarPlus size={17} />
                <span>这一周还没有日程。点右上角「添加日程」记一笔。</span>
              </div>
            )}
          </section>

          <div className="agenda-triage">
            <section className="agenda-events agenda-tasks" aria-label="本周任务">
              <div className="agenda-events-head">
                <div>
                  <p className="eyebrow">TASKS</p>
                  <h2>本周任务</h2>
                </div>
                <span className="agenda-count">{weekTasks.length} 项</span>
              </div>
              {weekTasks.length > 0 ? (
                <div className="agenda-event-list">
                  {weekTasks.map((task) => {
                    const overdue = taskBucket(task, now) === "overdue";
                    const courseName = task.courseId ? courseNames.get(task.courseId) : undefined;
                    return (
                      <div
                        className={`agenda-task-item ${overdue ? "is-overdue" : ""}`}
                        key={task.id}
                      >
                        <span className="agenda-task-dot" aria-hidden="true" />
                        <span className="agenda-task-copy">
                          <strong>{task.title}</strong>
                          <small>{courseName ?? "未关联课程"}</small>
                        </span>
                        <span className="agenda-task-due">
                          {overdue ? <em>逾期</em> : null}
                          <time>{describeDue(task)}</time>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="agenda-events-empty">
                  <ListTodo size={17} />
                  <span>本周没有到期的任务。</span>
                </div>
              )}
            </section>

            <section className="agenda-events agenda-exams" aria-label="待考考试">
              <div className="agenda-events-head">
                <div>
                  <p className="eyebrow">EXAMS</p>
                  <h2>待考考试</h2>
                </div>
                <span className="agenda-count">{upcomingExams.length} 场</span>
              </div>
              {upcomingExams.length > 0 ? (
                <div className="agenda-event-list">
                  {upcomingExams.map((exam) => {
                    const countdown = examCountdown(exam, now);
                    const place = [exam.location, exam.seat ? `座位 ${exam.seat}` : ""]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div className={`agenda-exam-item is-${countdown.tone}`} key={exam.id}>
                        <span className="agenda-exam-type">{examTypeLabel(exam.type)}</span>
                        <span className="agenda-exam-copy">
                          <strong>{exam.title}</strong>
                          <small>{place || "地点待定"}</small>
                        </span>
                        <span className="agenda-exam-when">
                          <time>{formatExamWhen(exam)}</time>
                          <small>{countdown.text}</small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="agenda-events-empty">
                  <GraduationCap size={17} />
                  <span>本周没有待考考试。</span>
                </div>
              )}
            </section>
          </div>
        </div>

        <TodayRail
          now={now}
          currentWeek={currentWeek}
          totalWeeks={totalWeeks}
          weekDates={currentDates}
          sessions={currentSessions}
          periods={currentPeriods}
          stats={currentStats}
          days={currentDays}
          holiday={currentDayStatuses[todayNumber] ?? null}
          events={todayEvents}
          showAliases={showAliases}
          onSelectCourse={onSelectCourse}
          onSelectEvent={onSelectEvent}
          onAddEvent={() => onAddEventAt("")}
        />
      </div>
    </div>
  );
}
