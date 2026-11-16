import { useMemo, useState } from "react";
import { GraduationCap } from "lucide-react";
import type { Course } from "../../types";
import {
  formatScore,
  isFailed,
  loadGrades,
  loadGradeSettings,
  saveGrades,
  saveGradeSettings,
  type GradeRecord,
  type GradeSettings,
} from "../../lib/grades";

interface GradesSettingsTabProps {
  timetableId: string;
  courses: Course[];
}

export function GradesSettingsTab({ timetableId, courses }: GradesSettingsTabProps) {
  const [records, setRecords] = useState<GradeRecord[]>(() => loadGrades(timetableId));
  const [settings, setSettings] = useState<GradeSettings>(() => loadGradeSettings());
  const [error, setError] = useState("");

  const recordMap = useMemo(
    () => new Map(records.map((record) => [record.courseId, record])),
    [records],
  );
  const entered = records.filter((record) => record.score !== null).length;
  const failed = records.filter((record) => isFailed(record)).length;

  const persist = (next: GradeRecord[]) => {
    setRecords(next);
    if (!saveGrades(timetableId, next)) {
      setError("保存失败，浏览器可能禁用了本地存储。");
    } else {
      setError("");
    }
  };

  const updateScore = (courseId: string, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      persist(records.filter((record) => record.courseId !== courseId));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const score = Math.min(100, Math.max(0, Math.round(parsed * 10) / 10));
    const next: GradeRecord = { courseId, score, updatedAt: new Date().toISOString() };
    persist([...records.filter((record) => record.courseId !== courseId), next]);
  };

  const togglePrivacy = (hideScores: boolean) => {
    const next = { hideScores };
    setSettings(next);
    saveGradeSettings(next);
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
        <p className="eyebrow">GRADES</p>
        <h3>考试与成绩</h3>
        <p>记录每门课的成绩；低于 60 分会标红提醒。成绩只保存在本机。</p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

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
          <p className="settings-note">清空分数即可移除记录；分数范围 0–100，支持一位小数。</p>
        </>
      )}
    </section>
  );
}