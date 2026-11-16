import { useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CalendarRange,
  Check,
  ClipboardList,
  Clock,
  Cloud,
  CloudDownload,
  Pencil,
  Plus,
  Sparkles,
  X,
  Database,
  GraduationCap,
  Trash2,
  Waves,
} from "lucide-react";
import type { FormEvent } from "react";
import type {
  CourseTemplate,
  ImportDraft,
  ImportResult,
  Period,
  PeriodProfile,
  PeriodRule,
  ScheduleData,
  Semester,
  Theme,
} from "../types";
import { Modal } from "./Modal";
import { DataSettingsTab } from "./settings/DataSettingsTab";
import { PeriodGenerator } from "./settings/PeriodGenerator";
import { GradesSettingsTab } from "./settings/GradesSettingsTab";
import { RemindersSettingsTab } from "./settings/RemindersSettingsTab";
import { SystemCalendarPanel } from "./settings/SystemCalendarPanel";
import { GoogleCalendarPanel } from "./settings/GoogleCalendarPanel";
import { WebDavSettingsPanel } from "./settings/WebDavSettingsPanel";
import { AcademicImportPanel } from "./settings/AcademicImportPanel";
import type { ParsedCourseSeed } from "../lib/textImport";
import { TasksSettingsTab } from "./settings/TasksSettingsTab";
import {
  MAX_PERIODS,
  MIN_PERIODS,
  resizePeriods,
} from "../lib/factory";
import {
  WEEKDAYS,
  dateKey,
  formatDateWithWeekday,
  parseDateKey,
  startOfWeek,
  timeToMinutes,
} from "../lib/date";
import { getUsedMaxPeriod, weeksForSlot } from "../lib/schedule";
import type { ExportResult } from "../lib/nativeFile";
import {
  addMemory,
  clearMemory,
  loadAiSettings,
  loadMemory,
  removeMemory,
  saveAiSettings,
  saveMemory,
  type AiMemoryData,
  type AiSettings,
} from "../lib/ai";
import { AiSettingsPanel } from "./ai/AiSettingsPanel";
import { WhaleMascot } from "./WhaleMascot";

type SettingsTab =
  | "term"
  | "periods"
  | "tasks"
  | "grades"
  | "reminders"
  | "calendar"
  | "google-calendar"
  | "academic"
  | "webdav"
  | "data"
  | "ai";

interface SettingsModalProps {
  data: ScheduleData;
  theme: Theme;
  autoHolidays: boolean;
  onClose: () => void;
  onSaveSemester: (
    semester: Semester,
    periodProfileId: string | null,
    periodProfiles: PeriodProfile[],
    periodRules: PeriodRule[],
  ) => void;
  onExportJson: () => Promise<ExportResult>;
  onExportIcs: () => Promise<ExportResult & { count: number }>;
  onImportFile: (file: File) => Promise<ImportResult>;
  onApplyImportDraft: (draft: ImportDraft) => Promise<ImportResult>;
  onDiscardImportDraft: () => void;
  onSaveTemplate: (name: string) => ImportResult;
  onApplyTemplate: (template: CourseTemplate) => ImportResult;
  onDeleteTemplate: (id: string) => void;
  importDraftRevision: number;
  onPrint: () => void;
  onClearData: () => void;
  onToggleAutoHolidays: (value: boolean) => void;
  onSetCalendarOverride: (
    date: string,
    kind: "holiday" | "workday",
    name: string,
    borrowFrom?: number | null,
  ) => ImportResult;
  onRemoveCalendarOverride: (id: string) => void;
  onRenameProfile: (id: string, name: string) => void;
  onChangeTheme: (theme: Theme) => void;
  onOpenThirdPartyImport: () => void;
  onOpenScreenshotImport: () => void;
  onOpenExcelImport: () => void;
  onOpenTimetableShare: () => void;
  onRestoreWebDav: (data: ScheduleData) => ImportResult;
  onImportCourseSeeds: (seeds: ParsedCourseSeed[]) => { courses: number; slots: number };
}

interface Notice {
  tone: "success" | "error" | "info";
  message: string;
}

const TABS: Array<{ id: SettingsTab; label: string; icon: typeof Database }> = [
  { id: "term", label: "学期与视图", icon: CalendarDays },
  { id: "periods", label: "作息时间", icon: Clock },
  { id: "tasks", label: "作业与任务", icon: ClipboardList },
  { id: "grades", label: "考试与成绩", icon: GraduationCap },
  { id: "reminders", label: "上课提醒", icon: Bell },
  { id: "calendar", label: "系统日历", icon: CalendarDays },
  { id: "google-calendar", label: "Google 日历", icon: CalendarRange },
  { id: "academic", label: "教务导入", icon: CloudDownload },
  { id: "webdav", label: "WebDAV 备份", icon: Cloud },
  { id: "data", label: "数据与备份", icon: Database },
  { id: "ai", label: "笔记与 AI", icon: Sparkles },
];

function isValidMonthDay(value: string): boolean {
  if (!/^\d{2}-\d{2}$/.test(value)) return false;
  const [month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(2024, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
}

function monthLength(month: number): number {
  return new Date(2024, month, 0).getDate();
}

function splitMonthDay(value: string): { month: number; day: number } {
  const [month, day] = value.split("-").map(Number);
  return {
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1,
    day: Number.isFinite(day) && day >= 1 ? Math.min(day, 31) : 1,
  };
}

function usedMaxWeek(data: ScheduleData): number {
  const active = data.timetables.find((item) => item.id === data.activeTimetableId) ?? data.timetables[0];
  let max = 0;
  for (const course of active?.courses ?? []) {
    for (const slot of course.slots) {
      const weeks = weeksForSlot(slot);
      if (weeks.length > 0) max = Math.max(max, weeks[weeks.length - 1]);
    }
  }
  return max;
}

export function SettingsModal({
  data,
  theme,
  autoHolidays,
  onClose,
  onSaveSemester,
  onExportJson,
  onExportIcs,
  onImportFile,
  onApplyImportDraft,
  onDiscardImportDraft,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  importDraftRevision,
  onPrint,
  onClearData,
  onToggleAutoHolidays,
  onSetCalendarOverride,
  onRemoveCalendarOverride,
  onRenameProfile,
  onChangeTheme,
  onOpenThirdPartyImport,
  onOpenScreenshotImport,
  onOpenExcelImport,
  onOpenTimetableShare,
  onRestoreWebDav,
  onImportCourseSeeds,
}: SettingsModalProps) {
  const active = data.timetables.find((item) => item.id === data.activeTimetableId) ?? data.timetables[0];
  const calendarOverrides = active.calendarOverrides ?? [];
  const [tab, setTab] = useState<SettingsTab>("term");
  const [draft, setDraft] = useState<Semester>(() => ({
    ...active.semester,
    weekStartsOn: active.semester.weekStartsOn ?? 1,
    periods: active.semester.periods.map((period) => ({ ...period })),
  }));
  const [profileId, setProfileId] = useState<string | null>(active.periodProfileId);
  const [periodRules, setPeriodRules] = useState<PeriodRule[]>(() => {
    const rules = active.periodRules?.length ? active.periodRules : [];
    if (rules.length > 0) return rules.map((rule) => ({ ...rule }));
    const fallback = active.periodProfileId;
    return fallback
      ? [{ id: `rule-${active.semester.startDate.slice(5)}`, from: active.semester.startDate.slice(5), profileId: fallback }]
      : [];
  });
  const [profilePeriods, setProfilePeriods] = useState<Record<string, Period[]>>(() =>
    Object.fromEntries(
      data.periodProfiles.map((profile) => [
        profile.id,
        profile.periods.map((period) => ({ ...period })),
      ]),
    ),
  );
  const [renamingProfile, setRenamingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideKind, setOverrideKind] = useState<"holiday" | "workday">("holiday");
  const [overrideBorrow, setOverrideBorrow] = useState(0);
  const [overrideName, setOverrideName] = useState("");
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [aiMemory, setAiMemory] = useState<AiMemoryData>(() => loadMemory());
  const rememberForAi = (value: string) => {
    const next = addMemory(aiMemory, value);
    saveMemory(next);
    setAiMemory(next);
    setNotice({ tone: "success", message: "已加入长期记忆。" });
  };
  const forgetForAi = (id: string) => {
    const next = removeMemory(aiMemory, id);
    saveMemory(next);
    setAiMemory(next);
    setNotice({ tone: "success", message: "已删除这条记忆。" });
  };
  const forgetAllForAi = () => {
    const next = clearMemory(aiMemory);
    saveMemory(next);
    setAiMemory(next);
    setNotice({ tone: "success", message: "长期记忆已清空。" });
  };
  const currentProfile = data.periodProfiles.find((profile) => profile.id === profileId);
  const maxPeriodForProfile = (id: string): number => {
    const related = data.timetables.filter((timetable) => timetable.periodProfileId === id);
    return getUsedMaxPeriod(related.flatMap((timetable) => timetable.courses));
  };
  const maxPeriod = profileId ? maxPeriodForProfile(profileId) : getUsedMaxPeriod(active.courses);
  const maxWeek = usedMaxWeek(data);
  const periodWarning =
    maxPeriod > draft.periods.length
      ? `已有课程上到第 ${maxPeriod} 节，节数不能少于 ${maxPeriod}。`
      : "";
  const weekWarning =
    maxWeek > draft.totalWeeks
      ? `已有课程安排到第 ${maxWeek} 周，总周数不能少于 ${maxWeek}。`
      : "";
  const semesterStart = parseDateKey(draft.startDate);
  const semesterEndDate = dateKey(
    new Date(
      semesterStart.getFullYear(),
      semesterStart.getMonth(),
      semesterStart.getDate() + draft.totalWeeks * 7 - 1,
    ),
  );
  const handleAddCalendarOverride = () => {
    const result = onSetCalendarOverride(
      overrideDate,
      overrideKind,
      overrideName,
      overrideBorrow || null,
    );
    if (!result.ok) {
      setNotice({ tone: "error", message: result.message });
      return;
    }
    setOverrideDate("");
    setOverrideBorrow(0);
    setOverrideName("");
  };

  const updatePeriodRule = (id: string, patch: Partial<PeriodRule>) => {
    setError("");
    setPeriodRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
  };

  const addPeriodRule = () => {
    const profile = currentProfile ?? data.periodProfiles[0];
    if (!profile) return;
    setPeriodRules((current) => [
      ...current,
      {
        id: `rule-${Date.now()}-${current.length}`,
        from: dateKey(new Date()).slice(5),
        profileId: profile.id,
      },
    ]);
    setError("");
  };

  const removePeriodRule = (id: string) => {
    setPeriodRules((current) => (current.length <= 1 ? current : current.filter((rule) => rule.id !== id)));
    setError("");
  };

  const setPeriodCount = (count: number) => {
    setError("");
    const periods = resizePeriods(draft.periods, count).map((period) => ({ ...period }));
    setDraft((current) => ({ ...current, periods }));
    if (profileId) {
      setProfilePeriods((current) => ({ ...current, [profileId]: periods }));
    }
  };

  const startRenameProfile = () => {
    if (!currentProfile) return;
    setProfileName(currentProfile.name);
    setRenamingProfile(true);
    setError("");
  };

  const submitProfileName = () => {
    if (!currentProfile) return;
    const name = profileName.trim();
    if (!name) {
      setError("作息方案需要一个名字。");
      return;
    }
    onRenameProfile(currentProfile.id, name);
    setRenamingProfile(false);
    setError("");
  };

  const applyProfile = (profile: PeriodProfile) => {
    const periods = profilePeriods[profile.id] ?? profile.periods;
    const targetMax = maxPeriodForProfile(profile.id);
    if (targetMax > periods.length) {
      setError(`使用「${profile.name}」的课表已上到第 ${targetMax} 节，方案只有 ${periods.length} 节，无法应用。`);
      return;
    }
    setError("");
    setProfileId(profile.id);
    setDraft((current) => ({
      ...current,
      periods: periods.map((period) => ({ ...period })),
    }));
    setNotice({ tone: "info", message: `正在编辑「${profile.name}」，保存后更新到课表。` });
  };

  const updatePeriod = (index: number, patch: Partial<Period>) => {
    setError("");
    const periods = draft.periods.map((period) =>
      period.index === index ? { ...period, ...patch } : period,
    );
    setDraft((current) => ({ ...current, periods }));
    if (profileId) {
      setProfilePeriods((current) => ({ ...current, [profileId]: periods }));
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (tab === "ai") return;
    const name = draft.name.trim();
    if (!name) {
      setError("学期名称不能为空。");
      return;
    }
    if (weekWarning) {
      setError(weekWarning);
      return;
    }
    if (periodWarning) {
      setError(periodWarning);
      return;
    }
    if (periodRules.length === 0) {
      setError("至少保留一条作息执行日期。");
      return;
    }
    const ruleDates = new Set<string>();
    for (const rule of periodRules) {
      if (!/^\d{2}-\d{2}$/.test(rule.from) || !isValidMonthDay(rule.from)) {
        setError("请为每条作息规则选择一个有效的月和日。");
        return;
      }
      if (ruleDates.has(rule.from)) {
        setError("同一天只能设置一套作息。");
        return;
      }
      if (!data.periodProfiles.some((profile) => profile.id === rule.profileId)) {
        setError("有一条作息规则引用了不存在的作息方案。");
        return;
      }
      ruleDates.add(rule.from);
    }
    const sortedPeriodRules = [...periodRules].sort((a, b) => a.from.localeCompare(b.from));

    const profilesForSave: PeriodProfile[] = data.periodProfiles.map((profile) => {
      const periods = profile.id === profileId ? draft.periods : profilePeriods[profile.id] ?? profile.periods;
      return {
        ...profile,
        periods: periods.map((period, index) => ({ ...period, index: index + 1 })),
      };
    });

    const invalidProfile = profilesForSave.find((profile) =>
      profile.periods.some(
        (period) => !period.start || !period.end || timeToMinutes(period.end) <= timeToMinutes(period.start),
      ),
    );
    if (invalidProfile) {
      const invalid = invalidProfile.periods.find(
        (period) => !period.start || !period.end || timeToMinutes(period.end) <= timeToMinutes(period.start),
      );
      setError(`「${invalidProfile.name}」第 ${invalid?.index ?? 1} 节的时间不正确。`);
      return;
    }

    for (const profile of profilesForSave) {
      const max = maxPeriodForProfile(profile.id);
      if (max > profile.periods.length) {
        setError(`使用「${profile.name}」的课表上到第 ${max} 节，方案不能少于 ${max} 节。`);
        return;
      }
    }

    const activePeriods = draft.periods.map((period, index) => ({ ...period, index: index + 1 }));

    onSaveSemester(
      {
        ...draft,
        name,
        periods: activePeriods,
      },
      profileId,
      profilesForSave,
      sortedPeriodRules,
    );
  };

  return (
    <Modal
      className="settings-modal"
      eyebrow="PREFERENCES"
      title="设置"
      onClose={onClose}
      footer={
tab === "ai" ? (
          <>
            <p className="modal-foot-note">聊天与密钥只保存在本机</p>
            <span className="modal-foot-spacer" />
            <button className="primary-button" type="button" onClick={onClose}>
              完成
            </button>
          </>
        ) : (
          <>
            <p className="modal-foot-note">所有内容只保存在本机</p>
            <span className="modal-foot-spacer" />
            <button className="secondary-button" type="button" onClick={onClose}>
              {tab === "term" || tab === "periods" ? "取消" : "关闭"}
            </button>
            {tab === "term" || tab === "periods" ? (
              <button className="primary-button" type="submit" form="settings-form">
                <Check size={16} />
                保存设置
              </button>
            ) : null}
          </>
        )
      }
    >
      <form id="settings-form" className="settings-form" onSubmit={handleSubmit}>
        <div className="settings-layout">
          <nav className="settings-tabs" aria-label="设置分类">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={tab === item.id ? "is-active" : ""}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setNotice(null);
                    setError("");
                  }}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <div className="settings-tabs-foot">
              <a href="https://github.com/lcymxm/classflow" target="_blank" rel="noreferrer">
                <ArrowUpRight size={15} />
                GitHub
              </a>
              <span>课序 v1.11.1</span>
            </div>
          </nav>

          <div className="settings-content">
            {error ? <p className="form-error">{error}</p> : null}
            {notice ? (
              <p className={`inline-notice inline-notice--${notice.tone}`} role="status">
                {notice.message}
              </p>
            ) : null}

            {tab === "term" ? (
              <section className="settings-pane">
                <div className="settings-pane-head">
                  <p className="eyebrow">TERM</p>
                  <h3>学期与视图</h3>
                  <p>课表里的每一周，都从学期开始的第一个周一算起。</p>
                </div>

                <div className="theme-picker-block">
                  <div className="theme-picker-head">
                    <span className="field-label">界面主题</span>
                    <small className="field-hint">切换立即生效，不影响课表数据。</small>
                  </div>
                  <div className="theme-choice-grid" role="group" aria-label="界面主题">
                    <button
                      className={`theme-choice ${theme === "light" ? "is-active" : ""}`}
                      type="button"
                      onClick={() => onChangeTheme("light")}
                      aria-pressed={theme === "light"}
                    >
                      <span className="theme-swatch theme-swatch--light" />
                      <span className="theme-choice-copy">
                        <strong>奶油纸</strong>
                        <small>明亮、纸张感</small>
                      </span>
                    </button>
                    <button
                      className={`theme-choice ${theme === "dark" ? "is-active" : ""}`}
                      type="button"
                      onClick={() => onChangeTheme("dark")}
                      aria-pressed={theme === "dark"}
                    >
                      <span className="theme-swatch theme-swatch--dark" />
                      <span className="theme-choice-copy">
                        <strong>夜读</strong>
                        <small>深绿、适合晚上</small>
                      </span>
                    </button>
                    <button
                      className={`theme-choice theme-choice--whale ${theme === "whale" ? "is-active" : ""}`}
                      type="button"
                      onClick={() => onChangeTheme("whale")}
                      aria-pressed={theme === "whale"}
                    >
                      <span className="theme-swatch theme-swatch--whale">
                        <WhaleMascot size={34} face />
                      </span>
                      <span className="theme-choice-copy">
                        <strong>DeepSeek 鲸鱼娘</strong>
                        <small>深海蓝 · dsh-pet 素材 · 非官方</small>
                      </span>
                      <Waves size={14} className="theme-choice-wave" />
                    </button>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="field field--wide">
                    <span className="field-label">学期名称</span>
                    <input
                      className="field-input"
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="例如：2026 秋季学期"
                      maxLength={60}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">
                      开学第一周（{WEEKDAYS[(draft.weekStartsOn ?? 1) - 1]?.label ?? "周一"}）
                    </span>
                    <input
                      className="field-input"
                      type="date"
                      value={draft.startDate}
                      onChange={(event) => {
                        const normalized = startOfWeek(
                          parseDateKey(event.target.value || dateKey(new Date())),
                          draft.weekStartsOn ?? 1,
                        );
                        setDraft((current) => ({
                          ...current,
                          startDate: dateKey(normalized),
                        }));
                      }}
                    />
                    <small className="field-hint">
                      {formatDateWithWeekday(parseDateKey(draft.startDate))} · 已自动对齐
                      {WEEKDAYS[(draft.weekStartsOn ?? 1) - 1]?.label ?? "周一"}
                    </small>
                  </label>
                  <label className="field">
                    <span className="field-label">周起始日</span>
                    <select
                      className="field-input"
                      value={draft.weekStartsOn ?? 1}
                      onChange={(event) => {
                        const weekStartsOn = Math.min(
                          7,
                          Math.max(1, Number(event.target.value) || 1),
                        );
                        setDraft((current) => ({
                          ...current,
                          weekStartsOn,
                          startDate: dateKey(
                            startOfWeek(parseDateKey(current.startDate), weekStartsOn),
                          ),
                        }));
                      }}
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day.index} value={day.index}>
                          从{day.label}开始
                        </option>
                      ))}
                    </select>
                    <small className="field-hint">课表网格、周次与日期会一起对齐。</small>
                  </label>
                  <label className="field">
                    <span className="field-label">学期总周数</span>
                    <input
                      className="field-input"
                      type="number"
                      min={1}
                      max={30}
                      value={draft.totalWeeks}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          totalWeeks: Math.min(30, Math.max(1, Number(event.target.value) || 1)),
                        }))
                      }
                    />
                    <small className="field-hint">支持 1–30 周，一般学期为 16–20 周。</small>
                  </label>
                </div>

                <label className="toggle-row">
                  <span>
                    <strong>显示周末</strong>
                    <small>关闭后只显示周一至周五；遇到调休周末仍会自动出现。</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.showWeekends}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, showWeekends: event.target.checked }))
                    }
                  />
                  <span className="switch" aria-hidden="true" />
                </label>

                <label className="toggle-row">
                  <span>
                    <strong>自动识别节假日与调休</strong>
                    <small>内置 2026–2027 年中国法定节假日；修改立即生效。放假日的课程会自动隐藏，调休日会标「班」。</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={autoHolidays}
                    onChange={(event) => onToggleAutoHolidays(event.target.checked)}
                  />
                  <span className="switch" aria-hidden="true" />
                </label>

                <div className="calendar-override-box">
                  <div className="calendar-override-head">
                    <strong>逐日调整</strong>
                    <small>把教学周里的某一天单独设为放假或补课，优先于内置日历。</small>
                  </div>
                  <div className="calendar-override-form">
                    <input
                      className="field-input"
                      type="date"
                      value={overrideDate}
                      min={draft.startDate}
                      max={semesterEndDate}
                      onChange={(event) => setOverrideDate(event.target.value)}
                      aria-label="调整日期"
                    />
                    <select
                      className="field-input"
                      value={overrideKind}
                      onChange={(event) =>
                        setOverrideKind(event.target.value === "workday" ? "workday" : "holiday")
                      }
                      aria-label="日期类型"
                    >
                      <option value="holiday">放假</option>
                      <option value="workday">补课</option>
                    </select>
                    {overrideKind === "workday" ? (
                      <select
                        className="field-input"
                        value={overrideBorrow}
                        onChange={(event) => setOverrideBorrow(Number(event.target.value) || 0)}
                        aria-label="按哪天的课表上课"
                      >
                        <option value={0}>不映射课程</option>
                        {WEEKDAYS.map((day) => (
                          <option key={day.index} value={day.index}>
                            上周{day.label.replace("周", "")}的课
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      className="field-input"
                      value={overrideName}
                      maxLength={20}
                      placeholder="名称（可选）"
                      onChange={(event) => setOverrideName(event.target.value)}
                      aria-label="日期名称"
                    />
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!overrideDate}
                      onClick={handleAddCalendarOverride}
                    >
                      <Plus size={14} />
                      添加
                    </button>
                  </div>
                  {calendarOverrides.length > 0 ? (
                    <ul className="calendar-override-list">
                      {calendarOverrides.map((override) => (
                        <li key={override.id}>
                          <span className={`day-status-tag is-${override.kind}`}>
                            {override.kind === "holiday" ? "休" : "班"}
                          </span>
                          <span>
                            <strong>{override.date}</strong>
                            <small>
                              {formatDateWithWeekday(parseDateKey(override.date))} ·{" "}
                              {override.name}
                              {override.borrowFrom
                                ? ` · 上周${WEEKDAYS[override.borrowFrom - 1]?.label.replace("周", "") ?? ""}课`
                                : ""}
                            </small>
                          </span>
                          <button
                            className="ghost-button"
                            type="button"
                            aria-label={`删除 ${override.date} 的调整`}
                            onClick={() => onRemoveCalendarOverride(override.id)}
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="calendar-override-empty">还没有自定义日期。</p>
                  )}
                </div>

                <div className="term-preview">
                  <span className="term-preview-label">第 1 周从</span>
                  <strong>{formatDateWithWeekday(parseDateKey(draft.startDate))}</strong>
                  <span>开始，共 {draft.totalWeeks} 周。</span>
                </div>
              </section>
            ) : null}

            {tab === "periods" ? (
              <section className="settings-pane">
                <div className="settings-pane-head">
                  <p className="eyebrow">DAILY RHYTHM</p>
                  <h3>作息时间</h3>
                  <p>设定每天有几节课，以及每一节的上下课时间。</p>
                </div>

                <div className="profile-section">
                  <div className="profile-section-head">
                    <div>
                      <span className="field-label">作息方案</span>
                      <small className="field-hint">选择一套现成的时间表，保存后应用到当前课表。</small>
                    </div>
                    {renamingProfile && currentProfile ? (
                      <div className="profile-rename-row">
                        <input
                          className="field-input"
                          value={profileName}
                          onChange={(event) => setProfileName(event.target.value)}
                          maxLength={40}
                          autoFocus
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              submitProfileName();
                            }
                            if (event.key === "Escape") setRenamingProfile(false);
                          }}
                        />
                        <button
                          className="icon-button"
                          type="button"
                          onClick={submitProfileName}
                          aria-label="保存作息方案名称"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => setRenamingProfile(false)}
                          aria-label="取消重命名"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="profile-current-group">
                        <span className="profile-current">{currentProfile?.name ?? "自定义"}</span>
                        {currentProfile ? (
                          <button
                            className="profile-rename"
                            type="button"
                            onClick={startRenameProfile}
                          >
                            <Pencil size={12} />
                            改名
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="profile-grid">
                    {data.periodProfiles.map((profile) => (
                      <button
                        key={profile.id}
                        className={`profile-card ${profileId === profile.id ? "is-active" : ""}`}
                        type="button"
                        onClick={() => applyProfile(profile)}
                        aria-pressed={profileId === profile.id}
                      >
                        <span className="profile-card-top">
                          <strong>{profile.name}</strong>
                          {profileId === profile.id ? <Check size={14} /> : null}
                        </span>
                        <span className="profile-card-meta">
                          {profile.periods.length} 节 · 第 1 节 {profile.periods[0]?.start} 开始
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="period-rule-section">
                  <div className="profile-section-head">
                    <div>
                      <span className="field-label">从某天起执行哪套作息</span>
                      <small className="field-hint">
                        不需要选择年份；每年到了这个月日就自动切换。查看某一周时按该周内日期选择方案。
                      </small>
                    </div>
                    <button className="secondary-button period-rule-add" type="button" onClick={addPeriodRule}>
                      <Plus size={14} />
                      添加日期
                    </button>
                  </div>
                  <div className="period-rule-list">
                    {periodRules.map((rule) => (
                      <div className="period-rule-row" key={rule.id}>
                        <span className="period-rule-prefix">每年</span>
                        <select
                          className="field-input period-rule-month"
                          value={splitMonthDay(rule.from).month}
                          onChange={(event) => {
                            const month = Number(event.target.value);
                            const day = Math.min(splitMonthDay(rule.from).day, monthLength(month));
                            updatePeriodRule(rule.id, {
                              from: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
                            });
                          }}
                          aria-label="作息开始月份"
                        >
                          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                            <option key={month} value={month}>
                              {month} 月
                            </option>
                          ))}
                        </select>
                        <select
                          className="field-input period-rule-day"
                          value={splitMonthDay(rule.from).day}
                          onChange={(event) =>
                            updatePeriodRule(rule.id, {
                              from: `${String(splitMonthDay(rule.from).month).padStart(2, "0")}-${String(
                                Number(event.target.value),
                              ).padStart(2, "0")}`,
                            })
                          }
                          aria-label="作息开始日"
                        >
                          {Array.from(
                            { length: monthLength(splitMonthDay(rule.from).month) },
                            (_, index) => index + 1,
                          ).map((day) => (
                            <option key={day} value={day}>
                              {day} 日
                            </option>
                          ))}
                        </select>
                        <span className="period-rule-prefix">起使用</span>
                        <select
                          className="field-input period-rule-select"
                          value={rule.profileId}
                          onChange={(event) => updatePeriodRule(rule.id, { profileId: event.target.value })}
                          aria-label="生效作息方案"
                        >
                          {data.periodProfiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => removePeriodRule(rule.id)}
                          disabled={periodRules.length <= 1}
                          aria-label="删除这条作息规则"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="settings-note">
                    第一条规则之前的时间使用当前课表的默认作息。
                  </p>
                </div>

                <div className="period-count-row">
                  <label className="field">
                    <span className="field-label">每日节数</span>
                    <input
                      className="field-input"
                      type="number"
                      min={MIN_PERIODS}
                      max={MAX_PERIODS}
                      value={draft.periods.length}
                      onChange={(event) =>
                        setPeriodCount(
                          Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, Number(event.target.value) || MIN_PERIODS)),
                        )
                      }
                    />
                  </label>
                  <p>
                    当前为 {draft.periods.length} 节 · 第 1 节 {draft.periods[0]?.start} 开始
                    {periodWarning ? <strong className="period-warning">{periodWarning}</strong> : null}
                  </p>
                </div>

                <PeriodGenerator
                  periods={draft.periods}
                  onGenerate={(periods) => {
                    setDraft((current) => ({ ...current, periods }));
                    if (profileId) {
                      setProfilePeriods((current) => ({ ...current, [profileId]: periods }));
                    }
                  }}
                />

                <div className="period-table">
                  <div className="period-table-head">
                    <span>节次</span>
                    <span>开始</span>
                    <span>结束</span>
                  </div>
                  {draft.periods.map((period) => (
                    <div className="period-row" key={period.index}>
                      <span className="period-index">
                        第 <strong>{period.index}</strong> 节
                      </span>
                      <input
                        className="field-input"
                        type="time"
                        value={period.start}
                        onChange={(event) => updatePeriod(period.index, { start: event.target.value })}
                        aria-label={`第 ${period.index} 节开始时间`}
                      />
                      <input
                        className="field-input"
                        type="time"
                        value={period.end}
                        onChange={(event) => updatePeriod(period.index, { end: event.target.value })}
                        aria-label={`第 ${period.index} 节结束时间`}
                      />
                    </div>
                  ))}
                </div>
                <p className="settings-note">
                  修改节次数量时，已有课程若使用了被删除的节次，将无法保存。
                </p>
              </section>
            ) : null}

            {tab === "tasks" ? (
              <TasksSettingsTab timetableId={active.id} courses={active.courses} />
            ) : null}

            {tab === "grades" ? (
              <GradesSettingsTab timetableId={active.id} courses={active.courses} />
            ) : null}

            {tab === "reminders" ? (
              <RemindersSettingsTab />
            ) : null}

            {tab === "calendar" ? (
              <SystemCalendarPanel
                timetable={active}
                periodProfiles={data.periodProfiles}
                autoHolidays={autoHolidays}
              />
            ) : null}

            {tab === "google-calendar" ? (
              <GoogleCalendarPanel
                timetable={active}
                periodProfiles={data.periodProfiles}
              />
            ) : null}

            {tab === "academic" ? (
              <AcademicImportPanel onImport={onImportCourseSeeds} />
            ) : null}

            {tab === "webdav" ? (
              <WebDavSettingsPanel data={data} onRestore={onRestoreWebDav} />
            ) : null}

            {tab === "data" ? (
              <DataSettingsTab
                activeTimetableName={active.name}
                draftRevision={importDraftRevision}
                onExportJson={onExportJson}
                onExportIcs={onExportIcs}
                onImportFile={onImportFile}
                onOpenThirdPartyImport={onOpenThirdPartyImport}
                onOpenScreenshotImport={onOpenScreenshotImport}
                onOpenExcelImport={onOpenExcelImport}
                onOpenTimetableShare={onOpenTimetableShare}
                onApplyDraft={onApplyImportDraft}
                onDiscardDraft={onDiscardImportDraft}
                onSaveTemplate={onSaveTemplate}
                onApplyTemplate={onApplyTemplate}
                onDeleteTemplate={onDeleteTemplate}
                onPrint={onPrint}
                onClearData={onClearData}
              />
            ) : null}

            {tab === "ai" ? (
              <section className="settings-pane">
                <div className="settings-pane-head">
                  <p className="eyebrow">NOTES & AI</p>
                  <h3>笔记与 AI 助手</h3>
                  <p>
                    本地规则零配置可用；需要自由聊天时再接入兼容 OpenAI 的服务。
                    笔记、聊天记录与密钥都只保存在这台设备。
                  </p>
                </div>
                <AiSettingsPanel
                  settings={aiSettings}
                  memory={aiMemory.entries}
                  onAddMemory={rememberForAi}
                  onRemoveMemory={forgetForAi}
                  onClearMemory={forgetAllForAi}
                  onSave={(next) => {
                    saveAiSettings(next);
                    setAiSettings(next);
                    setError("");
                    setNotice({ tone: "success", message: "AI 设置已保存在本机。" });
                  }}
                  onNotify={(message, tone) => setNotice({ tone: tone ?? "success", message })}
                />
              </section>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  );
}
