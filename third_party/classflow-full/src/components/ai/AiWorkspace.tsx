import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CalendarClock,
  Cpu,
  Heart,
  Layers,
  MapPin,
  MessageCircle,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import type { Course, ScheduleEvent, Semester, Timetable } from "../../types";
import {
  addMemory,
  aiProviderLabel,
  buildAiScheduleSnapshot,
  clearMemory,
  describePermissions,
  loadAiSettings,
  loadMemory,
  removeMemory,
  saveAiSettings,
  saveMemory,
  type AiInventory,
  type AiMemoryData,
  type AiMemoryEntry,
  type AiSettings,
} from "../../lib/ai";
import type { AiAction, AiActionContext } from "../../lib/aiActions";
import { loadNotes } from "../../lib/notes";
import { loadExams } from "../../lib/exams";
import { loadGrades } from "../../lib/grades";
import { loadTasks } from "../../lib/tasks";
import { loadPreferences, loadTemplates } from "../../lib/storage";
import { loadCatalog } from "../../lib/planner";
import { formatMonthDay, getWeekNumber, weekdayLabel } from "../../lib/date";
import { AiChatPanel } from "./AiChatPanel";
import { AiSettingsPanel } from "./AiSettingsPanel";
import { CatalogExtractPanel } from "./CatalogExtractPanel";
import "../../styles/ai.css";

interface AiWorkspaceProps {
  timetableId: string;
  timetable: Timetable;
  timetables: Array<{
    id: string;
    name: string;
    semesterName: string;
    courseCount: number;
    eventCount: number;
    active: boolean;
  }>;
  periodProfiles: Array<{ id: string; name: string }>;
  courses: Course[];
  events: ScheduleEvent[];
  semester: Semester;
  now: Date;
  onRunAction: (action: AiAction) => Promise<{ ok: boolean; message: string }>;
  onNotify: (message: string, tone?: "success" | "error") => void;
}

type AiTab = "chat" | "catalog" | "model" | "profile";

export function AiWorkspace({
  timetableId,
  timetable,
  timetables,
  periodProfiles,
  courses,
  events,
  semester,
  now,
  onRunAction,
  onNotify,
}: AiWorkspaceProps) {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [tab, setTab] = useState<AiTab>("chat");
  const [dataVersion, setDataVersion] = useState(0);
  const [memory, setMemory] = useState<AiMemoryData>(() => loadMemory());

  useEffect(() => {
    setSettings(loadAiSettings());
    setMemory(loadMemory());
  }, [dataVersion]);

  const notes = useMemo(() => loadNotes().notes, [dataVersion]);
  const chapters = useMemo(() => loadNotes().chapters, [dataVersion]);
  const tasks = useMemo(() => loadTasks(timetableId), [timetableId, dataVersion]);
  const exams = useMemo(() => loadExams(timetableId), [timetableId, dataVersion]);
  const grades = useMemo(() => loadGrades(timetableId), [timetableId, dataVersion]);
  const preferences = useMemo(() => loadPreferences(), [dataVersion]);
  const templates = useMemo(() => loadTemplates(), [dataVersion]);
  const catalog = useMemo(() => loadCatalog(), [dataVersion]);
  const inventory = useMemo<AiInventory>(() => {
    const courseNames = new Map(courses.map((course) => [course.id, course.name]));
    return {
      timetables,
      events,
      grades: grades.map((grade) => ({
        courseId: grade.courseId,
        courseName: courseNames.get(grade.courseId) ?? grade.courseId,
        score: grade.score,
        credits: grade.credits,
      })),
      periodProfiles,
      templates: templates.map((template) => ({ id: template.id, name: template.name })),
      catalogSections: catalog.sections.map((section) => ({ id: section.id, name: section.name })),
      selectionPlans: catalog.plans.map((plan) => ({ id: plan.id, name: plan.name })),
      chapters: chapters.map((chapter) => ({ id: chapter.id, title: chapter.title })),
      preferences,
    };
  }, [
    timetables,
    events,
    grades,
    courses,
    periodProfiles,
    templates,
    catalog,
    chapters,
    preferences,
  ]);
  const actionContext = useMemo<AiActionContext>(
    () => ({
      totalWeeks: semester.totalWeeks,
      courses: courses.map((course) => ({ id: course.id, name: course.name })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        subtasks: task.subtasks.map((subtask) => ({ id: subtask.id, title: subtask.title })),
      })),
      exams: exams.map((exam) => ({ id: exam.id, title: exam.title })),
      notes: notes.map((note) => ({ id: note.id, title: note.title })),
      events: events.map((event) => ({ id: event.id, title: event.title })),
      timetables,
      chapters: chapters.map((chapter) => ({ id: chapter.id, title: chapter.title })),
      overrides: timetable.overrides.map((override) => ({
        id: override.id,
        label: `${override.action} · ${override.courseId} · 第 ${override.week} 周`,
      })),
      calendarOverrides: (timetable.calendarOverrides ?? []).map((override) => ({
        id: override.id,
        name: override.name,
        date: override.date,
      })),
      periodProfiles,
      templates: templates.map((template) => ({ id: template.id, name: template.name })),
      catalogSections: catalog.sections.map((section) => ({
        id: section.id,
        name: section.name,
      })),
      selectionPlans: catalog.plans.map((plan) => ({ id: plan.id, name: plan.name })),
    }),
    [
      semester.totalWeeks,
      courses,
      tasks,
      exams,
      notes,
      events,
      timetables,
      chapters,
      timetable.overrides,
      timetable.calendarOverrides,
      periodProfiles,
      templates,
      catalog,
    ],
  );

  const week = getWeekNumber(semester.startDate, now, semester.totalWeeks);
  const snapshot = useMemo(
    () => buildAiScheduleSnapshot({ courses, semester, week, now }),
    [courses, semester, week, now],
  );

  const today = snapshot.days.find((day) => day.isToday) ?? null;
  const next = snapshot.nextSession;
  const enabledPermissions = describePermissions(settings.permissions).filter(
    (item) => item.enabled,
  );

  const saveSettings = (nextSettings: AiSettings) => {
    saveAiSettings(nextSettings);
    setSettings(nextSettings);
  };

  const remember = (text: string): AiMemoryEntry[] => {
    const next = addMemory(memory, text);
    saveMemory(next);
    setMemory(next);
    onNotify("已加入长期记忆，可在「人格与授权」里管理。");
    return next.entries;
  };

  const forget = (id: string) => {
    const next = removeMemory(memory, id);
    saveMemory(next);
    setMemory(next);
    onNotify("已删除这条记忆。");
  };

  const forgetAll = () => {
    const next = clearMemory(memory);
    saveMemory(next);
    setMemory(next);
    onNotify("长期记忆已清空。");
  };

  return (
    <div className="ai-page">
      <section className="ai-hero">
        <div className="ai-hero-copy">
          <span className="eyebrow">AI STUDY COMPANION</span>
          <h1>问课表，也问笔记</h1>
          <p>
            不联网也能查今天、明天和下一节；开启授权后，{settings.persona.name}
            还能帮你翻笔记。数据只在本机流转。
          </p>
          <div className="ai-hero-chips">
            <span>
              <Sparkles size={13} />
              {settings.provider === "local"
                ? "本地规则"
                : `${aiProviderLabel(settings.provider)} · ${settings.model || "未选模型"}`}
            </span>
            <span>
              <ShieldCheck size={13} />
              已授权 {enabledPermissions.length} 项
            </span>
            <span>
              <Heart size={13} />
              记忆 {memory.entries.length} 条
            </span>
            <button type="button" className="ai-inline-link" onClick={() => setTab("profile")}>
              调整授权与人设
            </button>
          </div>
        </div>
        <div className="ai-hero-stats">
          <div>
            <strong>{snapshot.week}</strong>
            <span>本周 / 共 {snapshot.totalWeeks} 周</span>
          </div>
          <div>
            <strong>{snapshot.courses.length}</strong>
            <span>门课程</span>
          </div>
          <div>
            <strong>{today?.sessions.length ?? 0}</strong>
            <span>今天有课</span>
          </div>
          <div>
            <strong>{notes.length}</strong>
            <span>条笔记</span>
          </div>
        </div>
      </section>

      <div className="ai-layout">
        <section className="ai-panel">
          <div className="ai-tabs" role="tablist" aria-label="AI 工作区">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "chat"}
              className={tab === "chat" ? "is-active" : ""}
              onClick={() => setTab("chat")}
            >
              <MessageCircle size={15} />
              对话
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "catalog"}
              className={tab === "catalog" ? "is-active" : ""}
              onClick={() => setTab("catalog")}
            >
              <BookOpenCheck size={15} />
              目录提取
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "model"}
              className={tab === "model" ? "is-active" : ""}
              onClick={() => setTab("model")}
            >
              <Cpu size={15} />
              模型设置
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "profile"}
              className={tab === "profile" ? "is-active" : ""}
              onClick={() => setTab("profile")}
            >
              <ShieldCheck size={15} />
              人格与授权
            </button>
          </div>
          {tab === "chat" ? (
            <AiChatPanel
              settings={settings}
              snapshot={snapshot}
              notes={notes}
              tasks={tasks}
              exams={exams}
              inventory={inventory}
              memory={memory.entries}
              actionContext={actionContext}
              onRemember={remember}
              onRunAction={onRunAction}
              onAfterAction={() => setDataVersion((value) => value + 1)}
              onOpenSettings={() => setTab("model")}
              onNotify={onNotify}
            />
          ) : tab === "catalog" ? (
            <CatalogExtractPanel onNotify={onNotify} />
          ) : (
            <AiSettingsPanel
              settings={settings}
              memory={memory.entries}
              onAddMemory={remember}
              onRemoveMemory={forget}
              onClearMemory={forgetAll}
              onSave={saveSettings}
              onNotify={onNotify}
              view={tab === "model" ? "model" : "profile"}
            />
          )}
        </section>

        <aside className="ai-side">
          <section className="ai-side-card ai-side-card--next">
            <div className="ai-side-heading">
              <CalendarClock size={15} />
              <h2>下一节</h2>
            </div>
            {next ? (
              <div className="ai-next">
                <strong>{next.courseName}</strong>
                <p>
                  {weekdayLabel(next.weekday)} {formatMonthDay(new Date(`${next.date}T00:00:00`))}
                  {next.startTime && next.endTime ? ` · ${next.startTime}–${next.endTime}` : ""}
                </p>
                <p className="ai-next-meta">
                  {next.location ? (
                    <>
                      <MapPin size={12} />
                      {next.location}
                    </>
                  ) : (
                    "还没填写教室"
                  )}
                  {next.teacher ? <span>· {next.teacher}</span> : null}
                </p>
              </div>
            ) : (
              <p className="ai-side-empty">这两周没有更多课了，安心自习。</p>
            )}
          </section>

          <section className="ai-side-card">
            <div className="ai-side-heading">
              <Sun size={15} />
              <h2>今天 · 第 {snapshot.week} 周</h2>
            </div>
            {today && today.sessions.length > 0 ? (
              <ol className="ai-today-list">
                {today.sessions.map((session) => (
                  <li key={session.id}>
                    <span className="ai-today-time">
                      {session.startTime}
                      <small>{session.endTime}</small>
                    </span>
                    <span className="ai-today-copy">
                      <strong>{session.courseName}</strong>
                      <small>{session.location || "地点待定"}</small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ai-side-empty">今天没有课，留给自己安排。</p>
            )}
          </section>

          <section className="ai-side-card">
            <div className="ai-side-heading">
              <NotebookPen size={15} />
              <h2>笔记联动</h2>
            </div>
            <p className="ai-side-text">
              {settings.permissions.notes
                ? "已授权读取笔记正文，可以直接问「帮我找复习笔记」。"
                : settings.permissions.noteTags
                  ? "已授权标题与标签，正文仍然只留在本机。"
                  : "笔记未授权。开启后 AI 才能帮你检索资料。"}
            </p>
            <button type="button" className="ai-inline-link" onClick={() => setTab("profile")}>
              去调整授权
            </button>
          </section>

          <section className="ai-side-card ai-side-card--quiet">
            <div className="ai-side-heading">
              <Layers size={15} />
              <h2>能看到什么</h2>
            </div>
            <ul className="ai-permission-chips">
              {enabledPermissions.map((item) => (
                <li key={item.key}>{item.label}</li>
              ))}
            </ul>
            <p className="ai-side-foot">
              默认共享本机全部数据。所有开关都能随时关闭，聊天与密钥只存在这台设备。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
