import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  Brain,
  Check,
  Clock3,
  Coffee,
  Flame,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import type { Course, Period, ScheduleEvent, Session } from "../../types";
import { toneColor } from "../../types";
import { dateKey, formatDuration, minutesToTime, WEEKDAYS } from "../../lib/date";
import { findDayGaps, type GapPreferences } from "../../lib/gaps";
import {
  DEFAULT_POMODORO,
  PRIORITY_LABELS,
  addStudyLog,
  buildTodaySummary,
  completionStats,
  experienceStats,
  loadPlannerTasks,
  loadStudyLogs,
  nextPomodoroStep,
  savePlannerTasks,
  saveStudyLogs,
  sortTasksByUrgency,
  studyHeatmap,
  studyMinutes,
  taskDueLabel,
  taskUrgency,
  type PlannerTask,
  type PomodoroPhase,
  type StudyLog,
  type TaskPriority,
  type TaskSortMode,
} from "../../lib/stats";

interface StudyPanelProps {
  now: Date;
  week: number;
  todaySessions: Session[];
  todayPeriods: Period[];
  courses: Course[];
  events: ScheduleEvent[];
  preferences: GapPreferences;
  onSelectCourse: (course: Course) => void;
}

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: "专注",
  short: "短休息",
  long: "长休息",
};

const LOG_KIND_LABELS: Record<StudyLog["kind"], string> = {
  pomodoro: "番茄",
  manual: "手动",
  review: "复习",
};

const SORT_MODES: Array<{ mode: TaskSortMode; label: string }> = [
  { mode: "urgency", label: "紧迫度" },
  { mode: "importance", label: "重要性" },
  { mode: "due", label: "截止" },
];

function clock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function phaseMinutes(phase: PomodoroPhase): number {
  return phase === "focus"
    ? DEFAULT_POMODORO.focusMinutes
    : phase === "short"
      ? DEFAULT_POMODORO.shortBreakMinutes
      : DEFAULT_POMODORO.longBreakMinutes;
}

export function StudyPanel({
  now,
  week,
  todaySessions,
  todayPeriods,
  courses,
  events,
  preferences,
  onSelectCourse,
}: StudyPanelProps) {
  const todayNumber = ((now.getDay() + 6) % 7) + 1;
  const todayKey = dateKey(now);

  const [tasks, setTasks] = useState<PlannerTask[]>(() => loadPlannerTasks());
  const [logs, setLogs] = useState<StudyLog[]>(() => loadStudyLogs());
  const [sortMode, setSortMode] = useState<TaskSortMode>("urgency");
  const [showDone, setShowDone] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("normal");
  const [logSubject, setLogSubject] = useState("");
  const [logMinutes, setLogMinutes] = useState(25);

  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [round, setRound] = useState(0);
  const [remaining, setRemaining] = useState(DEFAULT_POMODORO.focusMinutes * 60);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusCourseId, setFocusCourseId] = useState("");

  const updateTasks = (next: PlannerTask[]) => {
    setTasks(next);
    savePlannerTasks(next);
  };

  const updateLogs = (next: StudyLog[]) => {
    setLogs(next);
    saveStudyLogs(next);
  };

  const daySessions = useMemo(
    () =>
      todaySessions
        .filter((session) => session.day === todayNumber)
        .sort((a, b) => a.start - b.start || a.end - b.end),
    [todaySessions, todayNumber],
  );
  const dayEvents = useMemo(() => events.filter((event) => event.date === todayKey), [events, todayKey]);

  const summary = useMemo(
    () =>
      buildTodaySummary({
        sessions: daySessions,
        periods: todayPeriods,
        events: dayEvents,
        tasks,
        logs,
        now,
        preferences,
      }),
    [daySessions, todayPeriods, dayEvents, tasks, logs, now, preferences],
  );
  const experience = useMemo(() => experienceStats(tasks, logs, now), [tasks, logs, now]);
  const completion = useMemo(() => completionStats(tasks, now), [tasks, now]);
  const sortedTasks = useMemo(() => sortTasksByUrgency(tasks, now, sortMode), [tasks, now, sortMode]);
  const visibleTasks = showDone ? sortedTasks : sortedTasks.filter((task) => !task.done);
  const heatmap = useMemo(() => studyHeatmap(logs, 91, now), [logs, now]);
  const heatmapOffset =
    heatmap.length > 0
      ? (new Date(`${heatmap[0].date}T00:00:00`).getDay() + 6) % 7
      : 0;

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const todayMinutes = studyMinutes(logs, dayStart, dayEnd);
  const todayLogs = useMemo(
    () =>
      logs
        .filter(
          (log) =>
            !log.planned &&
            dateKey(new Date(log.start)) === todayKey &&
            !Number.isNaN(new Date(log.start).getTime()),
        )
        .sort((a, b) => b.start.localeCompare(a.start)),
    [logs, todayKey],
  );

  const reviewPlan = useMemo(() => {
    const intervals = [1, 3, 7, 14, 30];
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const items = courses
      .map((course) => {
        const courseLogs = logs.filter((log) => log.courseId === course.id && !log.planned);
        let last: Date | null = null;
        for (const log of courseLogs) {
          const time = new Date(log.start);
          if (Number.isNaN(time.getTime())) continue;
          if (!last || time.getTime() > last.getTime()) last = time;
        }
        const hasClassToday = daySessions.some((session) => session.course.id === course.id);
        if (!last && !hasClassToday) return null;
        const interval = intervals[Math.min(courseLogs.length, intervals.length - 1)];
        const base = last ?? now;
        const due = new Date(base.getFullYear(), base.getMonth(), base.getDate());
        due.setDate(due.getDate() + interval);
        const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);
        return { course, count: courseLogs.length, days };
      })
      .filter((item): item is { course: Course; count: number; days: number } => item !== null);
    return items.sort((a, b) => a.days - b.days).slice(0, 5);
  }, [courses, logs, now, daySessions]);

  const reviewSlots = useMemo(
    () =>
      findDayGaps(daySessions, todayPeriods, preferences)
        .filter((gap) => gap.usableMinutes >= 20)
        .slice(0, 3)
        .map((gap) => {
          const start = gap.start + gap.walkMinutes + gap.bufferMinutes;
          return {
            id: gap.id,
            start: minutesToTime(start),
            end: minutesToTime(Math.min(gap.end, start + 25)),
            minutes: gap.usableMinutes,
          };
        }),
    [daySessions, todayPeriods, preferences],
  );

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [deadline]);

  const completePhase = () => {
    if (phase === "focus") {
      const course = courses.find((item) => item.id === focusCourseId);
      updateLogs(
        addStudyLog(logs, {
          subject: course?.name ?? "自由学习",
          courseId: course?.id,
          minutes: DEFAULT_POMODORO.focusMinutes,
          kind: "pomodoro",
          start: new Date(Date.now() - DEFAULT_POMODORO.focusMinutes * 60_000).toISOString(),
        }),
      );
    }
    const next = nextPomodoroStep(phase, round, DEFAULT_POMODORO);
    setPhase(next.phase);
    setRound(next.round);
    setRemaining(next.minutes * 60);
    setNotice(
      phase === "focus"
        ? `完成一轮专注，${next.label} ${next.minutes} 分钟。`
        : `休息结束，开始第 ${next.round + 1} 轮专注。`,
    );
  };

  useEffect(() => {
    if (deadline !== null) return;
    if (remaining > 0) return;
    completePhase();
    // completePhase 只依赖当前渲染的状态，remaining 归零时触发一次即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const toggleTimer = () => {
    if (deadline !== null) {
      setRemaining(Math.max(1, Math.ceil((deadline - Date.now()) / 1000)));
      setDeadline(null);
      return;
    }
    setNotice(null);
    setDeadline(Date.now() + Math.max(1, remaining) * 1000);
  };

  const resetTimer = () => {
    setDeadline(null);
    setRemaining(phaseMinutes(phase) * 60);
    setNotice(null);
  };

  const skipPhase = () => {
    const next = nextPomodoroStep(phase, round, DEFAULT_POMODORO);
    setDeadline(null);
    setPhase(next.phase);
    setRound(next.round);
    setRemaining(next.minutes * 60);
    setNotice(`已跳到${next.label}。`);
  };

  const addTask = (event: FormEvent) => {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    updateTasks([
      ...tasks,
      {
        id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        due: taskDue || undefined,
        priority: taskPriority,
        done: false,
        createdAt: new Date().toISOString(),
      },
    ]);
    setTaskTitle("");
    setTaskDue("");
    setTaskPriority("normal");
  };

  const toggleTask = (id: string) => {
    updateTasks(
      tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              done: !task.done,
              completedAt: task.done ? undefined : new Date().toISOString(),
            }
          : task,
      ),
    );
  };

  const removeTask = (id: string) => {
    updateTasks(tasks.filter((task) => task.id !== id));
  };

  const addManualLog = (event: FormEvent) => {
    event.preventDefault();
    const course = courses.find((item) => item.id === logSubject);
    updateLogs(
      addStudyLog(logs, {
        subject: course?.name ?? "自由学习",
        courseId: course?.id,
        minutes: Math.max(5, Math.min(600, Math.round(logMinutes) || 25)),
        kind: "manual",
        start: new Date().toISOString(),
      }),
    );
  };

  const startReview = (course: Course) => {
    setFocusCourseId(course.id);
    setPhase("focus");
    setRound(0);
    setDeadline(null);
    setRemaining(DEFAULT_POMODORO.focusMinutes * 60);
    setNotice(`已选中《${course.name}》，点击开始专注即可复习。`);
  };

  const timerTotal = phaseMinutes(phase) * 60;
  const timerProgress = timerTotal === 0 ? 0 : 1 - Math.min(1, remaining / timerTotal);
  const focusCourse = courses.find((item) => item.id === focusCourseId);

  return (
    <div className="study-board">
      <section className="study-hero">
        <div>
          <p className="eyebrow">TODAY &amp; STUDY</p>
          <h1>学习与统计</h1>
          <p className="planner-sub">
            第 {week} 周 · {WEEKDAYS[todayNumber - 1]?.label} · 学习记录只保存在本机
          </p>
        </div>
        <div className="study-level">
          <div className="study-level-top">
            <span className="study-level-badge">Lv.{experience.level}</span>
            <span className="study-level-xp">{experience.xp} XP</span>
          </div>
          <div className="study-level-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(experience.progress * 100)}%` }} />
          </div>
          <small>
            <Flame size={12} />
            连续 {experience.streak} 天 · 还差 {Math.max(0, experience.nextLevelXp - experience.xp)} XP 升级
          </small>
        </div>
      </section>

      <div className="planner-stat-row study-stat-row">
        <div className="planner-stat">
          <span className="planner-stat-icon">
            <Clock3 size={17} />
          </span>
          <div>
            <strong>
              {summary.courseCount} 节 · {formatDuration(summary.classMinutes)}
            </strong>
            <span>今日课程</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon is-teal">
            <Coffee size={17} />
          </span>
          <div>
            <strong>
              {summary.gapCount} 段 · {formatDuration(summary.usableGapMinutes)}
            </strong>
            <span>可用空档</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon is-amber">
            <Target size={17} />
          </span>
          <div>
            <strong>
              {summary.tasksDone}/{summary.tasksTotal}
            </strong>
            <span>待办完成</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon is-olive">
            <Brain size={17} />
          </span>
          <div>
            <strong>{formatDuration(todayMinutes)}</strong>
            <span>今日学习 · 番茄 {formatDuration(summary.focusMinutes)}</span>
          </div>
        </div>
      </div>

      <div className="study-columns">
        <section className="study-card study-tasks">
          <header className="study-card-head">
            <div>
              <p className="eyebrow">TASKS</p>
              <h2>待办清单</h2>
            </div>
            <div className="study-sort" role="group" aria-label="任务排序方式">
              {SORT_MODES.map((item) => (
                <button
                  key={item.mode}
                  className={item.mode === sortMode ? "is-active" : ""}
                  type="button"
                  onClick={() => setSortMode(item.mode)}
                  aria-pressed={item.mode === sortMode}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          <form className="task-form" onSubmit={addTask}>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="加一件要做的事…"
              aria-label="任务标题"
              maxLength={120}
            />
            <div className="task-form-meta">
              <input
                type="date"
                value={taskDue}
                onChange={(event) => setTaskDue(event.target.value)}
                aria-label="截止日期"
              />
              <select
                value={taskPriority}
                onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}
                aria-label="优先级"
              >
                {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
              <button className="primary-button" type="submit" disabled={!taskTitle.trim()}>
                <Plus size={14} />
                添加
              </button>
            </div>
          </form>

          {visibleTasks.length === 0 ? (
            <p className="study-empty">还没有待办。把今天想完成的事写下来吧。</p>
          ) : (
            <ul className="task-list">
              {visibleTasks.map((task) => {
                const urgency = taskUrgency(task, now);
                const course = courses.find((item) => item.id === task.courseId);
                return (
                  <li key={task.id} className={task.done ? "is-done" : ""}>
                    <button
                      className="task-check"
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      aria-label={task.done ? "标记为未完成" : "标记为已完成"}
                      aria-pressed={task.done}
                    >
                      {task.done ? <Check size={13} /> : null}
                    </button>
                    <div className="task-copy">
                      <strong>{task.title}</strong>
                      <span>
                        <em className={`task-tier is-${urgency.tier}`}>{PRIORITY_LABELS[task.priority]}</em>
                        {taskDueLabel(task, now)}
                        {course ? ` · ${course.name}` : ""}
                      </span>
                    </div>
                    <button
                      className="task-delete"
                      type="button"
                      onClick={() => removeTask(task.id)}
                      aria-label="删除任务"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <footer className="task-foot">
            <button className="text-button" type="button" onClick={() => setShowDone((value) => !value)}>
              {showDone ? "隐藏已完成" : `显示已完成（${completion.done}）`}
            </button>
            <span>
              完成率 {completion.rate}% · 按时 {completion.onTimeRate}%
            </span>
          </footer>
        </section>

        <section className="study-card study-pomodoro">
          <header className="study-card-head">
            <div>
              <p className="eyebrow">FOCUS</p>
              <h2>番茄钟</h2>
            </div>
            <span className={`pomo-phase is-${phase}`}>{PHASE_LABELS[phase]}</span>
          </header>

          <div
            className={`pomo-ring is-${phase}`}
            style={{ "--pomo-progress": `${Math.round(timerProgress * 360)}deg` } as CSSProperties}
          >
            <div className="pomo-ring-inner">
              <strong>{clock(remaining)}</strong>
              <span>
                {phase === "focus" ? `第 ${round + 1} / ${DEFAULT_POMODORO.rounds} 轮` : "休息一下"}
              </span>
            </div>
          </div>

          <label className="pomo-subject">
            <span>本次专注</span>
            <select value={focusCourseId} onChange={(event) => setFocusCourseId(event.target.value)}>
              <option value="">自由学习</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          <div className="pomo-actions">
            <button className="primary-button" type="button" onClick={toggleTimer}>
              {deadline !== null ? <Pause size={15} /> : <Play size={15} />}
              {deadline !== null ? "暂停" : "开始"}
            </button>
            <button className="small-button" type="button" onClick={resetTimer}>
              <RotateCcw size={13} />
              重置
            </button>
            <button className="small-button" type="button" onClick={skipPhase}>
              <SkipForward size={13} />
              跳过
            </button>
          </div>

          <p className="pomo-hint">
            {notice ??
              (focusCourse
                ? `专注 ${DEFAULT_POMODORO.focusMinutes} 分钟，完成会自动记入《${focusCourse.name}》。`
                : `专注 ${DEFAULT_POMODORO.focusMinutes} 分钟，结束后自动记一笔学习记录。`)}
          </p>
        </section>
      </div>

      <div className="study-columns">
        <section className="study-card study-progress">
          <header className="study-card-head">
            <div>
              <p className="eyebrow">PROGRESS</p>
              <h2>学习热力图</h2>
            </div>
            <span className="study-card-tag">最近 13 周</span>
          </header>

          <div className="heatmap-wrap">
            <div className="heatmap" role="img" aria-label="最近 13 周每日学习时长热力图">
              {Array.from({ length: heatmapOffset }).map((_, index) => (
                <span className="heat-cell is-pad" key={`pad-${index}`} />
              ))}
              {heatmap.map((cell) => (
                <span
                  key={cell.date}
                  className={`heat-cell lv-${cell.level}`}
                  title={`${cell.date} · ${cell.minutes > 0 ? `${cell.minutes} 分钟` : "没有记录"}`}
                />
              ))}
            </div>
            <div className="heatmap-legend">
              <span>少</span>
              <i className="lv-0" />
              <i className="lv-1" />
              <i className="lv-2" />
              <i className="lv-3" />
              <i className="lv-4" />
              <span>多</span>
            </div>
          </div>

          <div className="progress-stats">
            <div>
              <strong>{experience.focusMinutes}</strong>
              <span>累计学习分钟</span>
            </div>
            <div>
              <strong>{experience.completedTasks}</strong>
              <span>完成待办</span>
            </div>
            <div>
              <strong>{completion.overdue}</strong>
              <span>逾期未完成</span>
            </div>
          </div>

          <div className="completion-bar">
            <div className="completion-bar-head">
              <span>整体完成率</span>
              <strong>{completion.rate}%</strong>
            </div>
            <div className="completion-track" aria-hidden="true">
              <span style={{ width: `${completion.rate}%` }} />
            </div>
          </div>
        </section>

        <section className="study-card study-review">
          <header className="study-card-head">
            <div>
              <p className="eyebrow">REVIEW</p>
              <h2>复习计划</h2>
            </div>
            <span className="study-card-tag">间隔 1 / 3 / 7 / 14 / 30 天</span>
          </header>

          {reviewPlan.length === 0 ? (
            <p className="study-empty">还没有学习记录。完成一次专注，这里就会排出复习节奏。</p>
          ) : (
            <ul className="review-list">
              {reviewPlan.map((item) => (
                <li key={item.course.id}>
                  <span
                    className="review-dot"
                    style={{ background: toneColor(item.course.tone) }}
                    aria-hidden="true"
                  />
                  <button type="button" className="review-name" onClick={() => onSelectCourse(item.course)}>
                    {item.course.name}
                  </button>
                  <span className={`review-when ${item.days <= 0 ? "is-due" : ""}`}>
                    {item.days < 0
                      ? `已晚 ${-item.days} 天`
                      : item.days === 0
                        ? "今天复习"
                        : item.days === 1
                          ? "明天复习"
                          : `${item.days} 天后`}
                  </span>
                  <button
                    className="small-button"
                    type="button"
                    onClick={() => startReview(item.course)}
                  >
                    <Sparkles size={12} />
                    复习
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="review-slots">
            <span className="review-slots-label">今日可用的复习时段</span>
            {reviewSlots.length === 0 ? (
              <p className="study-empty-text">今天没有 20 分钟以上的空档，试着把复习挪到明天。</p>
            ) : (
              <div className="review-slot-chips">
                {reviewSlots.map((slot) => (
                  <span key={slot.id} className="review-slot">
                    {slot.start}–{slot.end}
                    <small>{slot.minutes} 分钟空档</small>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="study-card study-logs">
        <header className="study-card-head">
          <div>
            <p className="eyebrow">LOG</p>
            <h2>今日学习记录</h2>
          </div>
          <span className="study-card-tag">{formatDuration(todayMinutes)}</span>
        </header>

        <form className="log-form" onSubmit={addManualLog}>
          <select
            value={logSubject}
            onChange={(event) => setLogSubject(event.target.value)}
            aria-label="学习科目"
          >
            <option value="">自由学习</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          <label className="log-minutes">
            <input
              type="number"
              min={5}
              max={600}
              step={5}
              value={logMinutes}
              onChange={(event) => setLogMinutes(Number(event.target.value))}
              aria-label="学习分钟数"
            />
            <span>分钟</span>
          </label>
          <button className="primary-button" type="submit">
            <Plus size={14} />
            记一笔
          </button>
        </form>

        {todayLogs.length === 0 ? (
          <p className="study-empty">今天还没有学习记录，开始一个番茄或手动记一笔吧。</p>
        ) : (
          <ul className="log-list">
            {todayLogs.map((log) => (
              <li key={log.id}>
                <span className={`log-kind is-${log.kind}`}>{LOG_KIND_LABELS[log.kind]}</span>
                <strong>{log.subject}</strong>
                <span className="log-minutes-label">{log.minutes} 分钟</span>
                <span className="log-time">
                  {new Date(log.start).getHours().toString().padStart(2, "0")}:
                  {new Date(log.start).getMinutes().toString().padStart(2, "0")}
                </span>
                <button
                  className="task-delete"
                  type="button"
                  onClick={() => updateLogs(logs.filter((item) => item.id !== log.id))}
                  aria-label="删除学习记录"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
