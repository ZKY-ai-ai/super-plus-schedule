import { useMemo, useState } from "react";
import { CalendarClock, GraduationCap, Plus, Trash2 } from "lucide-react";
import type { Course } from "../../types";
import {
  COURSE_STATUSES,
  formatScore,
  isFailed,
  loadGrades,
  loadGradeSettings,
  saveGrades,
  saveGradeSettings,
  semesterStats,
  type CourseStatus,
  type GradeRecord,
  type GradeSettings,
} from "../../lib/grades";
import {
  EXAM_TYPES,
  describeExam,
  examCountdown,
  examTypeLabel,
  isExamUpcoming,
  loadExams,
  makeExam,
  saveExams,
  sortExams,
  type Exam,
  type ExamType,
} from "../../lib/exams";
import { dateKey } from "../../lib/date";

interface GradesSettingsTabProps {
  timetableId: string;
  courses: Course[];
}

type TypeFilter = ExamType | "all";

export function GradesSettingsTab({ timetableId, courses }: GradesSettingsTabProps) {
  const [records, setRecords] = useState<GradeRecord[]>(() => loadGrades(timetableId));
  const [settings, setSettings] = useState<GradeSettings>(() => loadGradeSettings());
  const [exams, setExams] = useState<Exam[]>(() => loadExams(timetableId));
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [draft, setDraft] = useState(() => ({
    title: "",
    courseId: "",
    type: "final" as ExamType,
    date: dateKey(new Date()),
    startTime: "",
    endTime: "",
    location: "",
    seat: "",
  }));
  const [error, setError] = useState("");

  const recordMap = useMemo(
    () => new Map(records.map((record) => [record.courseId, record])),
    [records],
  );
  const courseNames = useMemo(
    () => new Map(courses.map((course) => [course.id, course.name])),
    [courses],
  );
  const entered = records.filter((record) => record.score !== null).length;
  const failed = records.filter((record) => isFailed(record)).length;
  const stats = semesterStats(records);

  const now = new Date();
  const sortedExams = sortExams(exams);
  const upcoming = sortedExams.filter(
    (exam) => isExamUpcoming(exam, now) && (filter === "all" || exam.type === filter),
  );
  const past = sortedExams.filter((exam) => !isExamUpcoming(exam, now)).reverse();

  const persist = (next: GradeRecord[]) => {
    setRecords(next);
    if (!saveGrades(timetableId, next)) {
      setError("保存失败，浏览器可能禁用了本地存储。");
    } else {
      setError("");
    }
  };

  const persistExams = (next: Exam[]) => {
    setExams(next);
    if (!saveExams(timetableId, next)) {
      setError("保存失败，浏览器可能禁用了本地存储。");
    } else {
      setError("");
    }
  };

  const updateRecord = (courseId: string, patch: Partial<GradeRecord>) => {
    const existing = records.find((record) => record.courseId === courseId);
    const base: GradeRecord = existing ?? {
      courseId,
      score: null,
      credits: null,
      status: "normal",
      updatedAt: new Date().toISOString(),
    };
    const next: GradeRecord = { ...base, ...patch, updatedAt: new Date().toISOString() };
    const rest = records.filter((record) => record.courseId !== courseId);
    if (next.score === null && next.credits === null && next.status === "normal") {
      persist(rest);
    } else {
      persist([...rest, next]);
    }
  };

  const updateScore = (courseId: string, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      updateRecord(courseId, { score: null });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const score = Math.min(100, Math.max(0, Math.round(parsed * 10) / 10));
    updateRecord(courseId, { score });
  };

  const updateCredits = (courseId: string, raw: string) => {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
      updateRecord(courseId, { credits: null });
      return;
    }
    updateRecord(courseId, { credits: Math.min(30, Math.round(parsed * 10) / 10) });
  };

  const updateStatus = (courseId: string, status: CourseStatus) => {
    updateRecord(courseId, { status });
  };

  const updateSettings = (patch: Partial<GradeSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveGradeSettings(next);
  };

  const togglePrivacy = (hideScores: boolean) => {
    updateSettings({ hideScores });
  };

  const addExam = () => {
    const title = draft.title.trim() || courseNames.get(draft.courseId) || "";
    if (!title) {
      setError("请填写考试名称，或先选择课程。");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError("请选择考试日期。");
      return;
    }
    const exam = makeExam({
      title,
      courseId: draft.courseId || null,
      type: draft.type,
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      location: draft.location,
      seat: draft.seat,
    });
    persistExams([...exams.filter((item) => item.id !== exam.id), exam]);
    setDraft((current) => ({ ...current, title: "", location: "", seat: "" }));
  };

  const removeExam = (id: string) => {
    persistExams(exams.filter((exam) => exam.id !== id));
  };

  return (
    <section
      className="settings-pane grades-pane"
      onKeyDown={(event) => {
        if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault();
        }
      }}
    >
      <div className="settings-pane-head">
        <p className="eyebrow">EXAMS &amp; GRADES</p>
        <h3>考试与成绩</h3>
        <p>记录考试时间、地点与座位号，考前按 7 天 / 1 天 / 2 小时自动提醒；成绩只保存在本机。</p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <h4 className="settings-subhead">
        <CalendarClock size={15} /> 考试安排
      </h4>

      <div className="exam-filter" role="tablist" aria-label="按考核类型筛选">
        {(["all", ...EXAM_TYPES.map((item) => item.id)] as TypeFilter[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`exam-filter-chip ${filter === id ? "is-active" : ""}`}
            onClick={() => setFilter(id)}
          >
            {id === "all" ? "全部" : examTypeLabel(id)}
          </button>
        ))}
      </div>

      {upcoming.length === 0 ? (
        <div className="task-empty">
          <GraduationCap size={18} />
          <span>{filter === "all" ? "暂无待考考试，添加一场考试试试。" : "该类型暂无待考考试。"}</span>
        </div>
      ) : (
        <ul className="exam-list">
          {upcoming.map((exam) => {
            const countdown = examCountdown(exam, now);
            return (
              <li className="exam-row" key={exam.id}>
                <span className={`exam-type exam-type--${exam.type}`}>{examTypeLabel(exam.type)}</span>
                <span className="exam-main">
                  <strong>{courseNames.get(exam.courseId ?? "") || exam.title}</strong>
                  <small>{describeExam(exam)}</small>
                </span>
                <span className={`exam-countdown exam-countdown--${countdown.tone}`}>
                  {countdown.text}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`删除考试 ${exam.title}`}
                  onClick={() => removeExam(exam.id)}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="exam-form">
        <div className="exam-form-grid">
          <label className="field">
            <span className="field-label">课程</span>
            <select
              className="field-input"
              value={draft.courseId}
              onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}
            >
              <option value="">不关联课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">考试名称</span>
            <input
              className="field-input"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="留空则使用课程名"
              maxLength={80}
            />
          </label>
          <label className="field">
            <span className="field-label">类型</span>
            <select
              className="field-input"
              value={draft.type}
              onChange={(event) => setDraft({ ...draft, type: event.target.value as ExamType })}
            >
              {EXAM_TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">日期</span>
            <input
              className="field-input"
              type="date"
              value={draft.date}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">开始</span>
            <input
              className="field-input"
              type="time"
              value={draft.startTime}
              onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">结束</span>
            <input
              className="field-input"
              type="time"
              value={draft.endTime}
              disabled={!draft.startTime}
              onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">地点</span>
            <input
              className="field-input"
              value={draft.location}
              onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              placeholder="教学楼 / 教室"
              maxLength={80}
            />
          </label>
          <label className="field">
            <span className="field-label">座位号</span>
            <input
              className="field-input"
              value={draft.seat}
              onChange={(event) => setDraft({ ...draft, seat: event.target.value })}
              placeholder="可选"
              maxLength={40}
            />
          </label>
        </div>
        <button className="primary-button exam-add" type="button" onClick={addExam}>
          <Plus size={15} /> 添加考试
        </button>
      </div>

      {past.length > 0 ? (
        <details className="exam-past">
          <summary>已结束的考试 · {past.length}</summary>
          <ul className="exam-list">
            {past.map((exam) => (
              <li className="exam-row is-past" key={exam.id}>
                <span className={`exam-type exam-type--${exam.type}`}>{examTypeLabel(exam.type)}</span>
                <span className="exam-main">
                  <strong>{courseNames.get(exam.courseId ?? "") || exam.title}</strong>
                  <small>{describeExam(exam)}</small>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`删除考试 ${exam.title}`}
                  onClick={() => removeExam(exam.id)}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <h4 className="settings-subhead">
        <GraduationCap size={15} /> 学期成绩
      </h4>

      <label className="toggle-row grade-privacy">
        <span>
          <strong>隐藏成绩</strong>
          <small>开启后所有分数显示为圆点，适合在公共场合查看课表。</small>
        </span>
        <input
          type="checkbox"
          checked={settings.hideScores}
          onChange={(event) => togglePrivacy(event.target.checked)}
        />
        <span className="switch" aria-hidden="true" />
      </label>

      {courses.length === 0 ? (
        <div className="task-empty">
          <GraduationCap size={18} />
          <span>课程库里还没有课程，先在课表中添加课程再记成绩。</span>
        </div>
      ) : (
        <>
          <div className="grade-stats">
            <div className="grade-stat">
              <span>加权平均</span>
              <strong>{settings.hideScores ? "••" : (stats.weightedAverage ?? "—")}</strong>
            </div>
            <div className="grade-stat">
              <span>绩点</span>
              <strong>{settings.hideScores ? "••" : (stats.gpa ?? "—")}</strong>
            </div>
            <div className="grade-stat">
              <span>已获学分</span>
              <strong>
                {settings.hideScores ? "••" : stats.earnedCredits}
                {settings.hideScores ? "" : stats.creditTotal > 0 ? ` / ${stats.creditTotal}` : ""}
              </strong>
            </div>
          </div>

          <label className="field grade-required">
            <span className="field-label">毕业要求学分</span>
            <input
              className="field-input"
              type="number"
              min={0}
              max={400}
              step={1}
              value={settings.requiredCredits || ""}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                updateSettings({
                  requiredCredits:
                    Number.isFinite(parsed) && parsed > 0 ? Math.min(400, Math.round(parsed)) : 0,
                });
              }}
              placeholder="未设置"
            />
            {settings.requiredCredits > 0 ? (
              <small className="field-hint">
                学分进度 {Math.min(100, Math.round((stats.earnedCredits / settings.requiredCredits) * 100))}%
              </small>
            ) : null}
          </label>

          <div className="grade-summary">
            <span>
              已录入 <strong>{settings.hideScores ? "••" : entered}</strong> 门
            </span>
            <span className="grade-summary-fail">
              未通过 <strong>{settings.hideScores ? "••" : failed}</strong> 门
            </span>
            <span>
              共 <strong>{courses.length}</strong> 门课程
            </span>
          </div>

          <div className="grade-list">
            {courses.map((course) => {
              const record = recordMap.get(course.id);
              const score = record?.score ?? null;
              const failedCourse = !settings.hideScores && record !== undefined && isFailed(record);
              return (
                <div className={`grade-row ${failedCourse ? "is-failed" : ""}`} key={course.id}>
                  <span className="grade-name">
                    <strong>{course.name}</strong>
                    <small>
                      {course.teacher || "未填教师"} · {course.slots.length} 个时段
                    </small>
                  </span>
                  <select
                    className="field-input grade-status"
                    value={record?.status ?? "normal"}
                    onChange={(event) =>
                      updateStatus(course.id, event.target.value as CourseStatus)
                    }
                    aria-label={`${course.name}的修读状态`}
                  >
                    {COURSE_STATUSES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field-input grade-credits"
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={record?.credits ?? ""}
                    onChange={(event) => updateCredits(course.id, event.target.value)}
                    placeholder="学分"
                    aria-label={`${course.name}的学分`}
                  />
                  {settings.hideScores ? (
                    <span className="grade-score-masked">{formatScore(record, true)}</span>
                  ) : (
                    <input
                      className="field-input grade-input"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={score ?? ""}
                      onChange={(event) => updateScore(course.id, event.target.value)}
                      placeholder="未录入"
                      aria-label={`${course.name}的成绩`}
                    />
                  )}
                  {failedCourse ? <span className="grade-fail">未通过</span> : null}
                </div>
              );
            })}
          </div>
          <p className="settings-note">清空分数即可移除记录；学分用于计算加权平均与绩点。</p>
        </>
      )}
    </section>
  );
}