import type {
  Course,
  CourseTemplate,
  ImportDraft,
  ImportResult,
  PeriodProfile,
  PeriodRule,
  ScheduleData,
  ScheduleEvent,
  Semester,
  Session,
  SessionOverride,
  Timetable as TimetableModel,
  TimetableCreateInput,
} from "../types";
import {
  dateKey,
  getDefaultStartDate,
  getTermName,
  parseDateKey,
  startOfWeekMonday,
} from "../lib/date";
import {
  MAX_TIMETABLES,
  cloneTimetable,
  createBlankTimetable,
  createInitialData,
  getActiveTimetable,
  makeCourse,
  makeSlot,
  nextTone,
  uid,
} from "../lib/factory";import { createTemplateCourses, instantiateTemplate } from "../lib/templates";
import type { TimetableTemplateId } from "../lib/templates";
import type { ParsedCourseSeed } from "../lib/textImport";
import { normalizeCourseNameKey, normalizeTeacherKey } from "../lib/schedule";
import { downloadScheduleIcs, downloadScheduleJson, readScheduleFile } from "../lib/transfer";
import {
  MAX_TEMPLATES,
  clearImportDraft,
  normalizeSchedule,
  removeTemplate,
  saveImportDraft,
  saveTemplate,
} from "../lib/storage";
import type { ToastTone } from "../components/Toast";
import type { ScheduleStore } from "./useScheduleStore";
import type { WeekView } from "./useWeekView";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "default";
}

export type Notify = (message: string, tone?: ToastTone) => void;
export type AskConfirm = (request: ConfirmRequest) => Promise<boolean>;

interface ActionParams {
  store: ScheduleStore;
  view: WeekView;
  notify: Notify;
  askConfirm: AskConfirm;
  onOpenTimetable: () => void;
  onSettingsClosed: () => void;
  onPreviewImport: (draft: ImportDraft) => void;
}

export type ScheduleActions = ReturnType<typeof useScheduleActions>;

export function useScheduleActions({
  store,
  view,
  notify,
  askConfirm,
  onOpenTimetable,
  onSettingsClosed,
  onPreviewImport,
}: ActionParams) {
  const { data, setData, courses, updateActiveTimetable } = store;

  const saveCourse = (course: Course) => {
    const editing = courses.some((item) => item.id === course.id);
    updateActiveTimetable((current) => {
      const exists = current.courses.some((item) => item.id === course.id);
      return {
        ...current,
        courses: exists
          ? current.courses.map((item) => (item.id === course.id ? course : item))
          : [...current.courses, course],
      };
    });
    notify(editing ? "课程已更新。" : "已加入课表。");
  };

  const addTextCourses = (seeds: ParsedCourseSeed[]): { courses: number; slots: number } => {
    let addedCourses = 0;
    let addedSlots = 0;
    updateActiveTimetable((current) => {
      const nextCourses = [...current.courses];
      const maxPeriod = Math.max(1, current.semester.periods.length);
      const totalWeeks = Math.max(1, Math.min(current.semester.totalWeeks, 30));
      const now = new Date().toISOString();

      for (const seed of seeds) {
        const slots = seed.slots.map((slot) =>
          makeSlot(
            {
              day: Math.min(Math.max(slot.day, 1), 7),
              start: Math.min(Math.max(slot.start, 1), maxPeriod),
              end: Math.min(Math.max(slot.end, slot.start), maxPeriod),
              weekStart: Math.min(Math.max(slot.weekStart, 1), totalWeeks),
              weekEnd: Math.min(Math.max(slot.weekEnd, slot.weekStart), totalWeeks),
              pattern: slot.pattern,
            },
            totalWeeks,
          ),
        );
        const key = `${normalizeCourseNameKey(seed.name)}|${normalizeTeacherKey(seed.teacher)}`;
        const existingIndex = nextCourses.findIndex(
          (course) =>
            `${normalizeCourseNameKey(course.name)}|${normalizeTeacherKey(course.teacher)}` === key,
        );
        if (existingIndex >= 0) {
          const existing = nextCourses[existingIndex];
          const known = new Set(
            existing.slots.map(
              (slot) =>
                `${slot.day}|${slot.start}|${slot.end}|${slot.weekStart}|${slot.weekEnd}|${slot.pattern}`,
            ),
          );
          const fresh = slots.filter(
            (slot) =>
              !known.has(
                `${slot.day}|${slot.start}|${slot.end}|${slot.weekStart}|${slot.weekEnd}|${slot.pattern}`,
              ),
          );
          if (fresh.length > 0) {
            nextCourses[existingIndex] = {
              ...existing,
              location: existing.location || seed.location,
              slots: [...existing.slots, ...fresh],
              updatedAt: now,
            };
            addedSlots += fresh.length;
          }
          continue;
        }
        nextCourses.push(
          makeCourse({
            name: seed.name,
            teacher: seed.teacher,
            location: seed.location,
            tone: nextTone(nextCourses),
            slots,
          }),
        );
        addedCourses += 1;
        addedSlots += slots.length;
      }

      return { ...current, courses: nextCourses };
    });
    if (addedCourses > 0 || addedSlots > 0) {
      notify(`已从文本加入 ${addedCourses} 门课、${addedSlots} 个时间段。`);
    } else {
      notify("这些课程已经全部在课表里了。", "info");
    }
    return { courses: addedCourses, slots: addedSlots };
  };

  const requestDeleteCourse = (course: Course): Promise<boolean> =>    askConfirm({
      title: "删除这门课？",
      message: `“${course.name}”的所有上课时间会一起删除，这个操作无法撤销。`,
      confirmLabel: "删除课程",
      tone: "danger",
    }).then((ok) => {
      if (!ok) return false;
      updateActiveTimetable((current) => ({
        ...current,
        courses: current.courses.filter((item) => item.id !== course.id),
      }));
      notify("课程已删除。");
      return true;
    });

  const saveEvent = (event: ScheduleEvent) => {
    const editing = store.events.some((item) => item.id === event.id);
    updateActiveTimetable((current) => {
      const exists = current.events.some((item) => item.id === event.id);
      return {
        ...current,
        events: exists
          ? current.events.map((item) => (item.id === event.id ? event : item))
          : [...current.events, event],
      };
    });
    notify(editing ? "日程已更新。" : "日程已添加。");
  };

  const requestDeleteEvent = (event: ScheduleEvent): Promise<boolean> =>
    askConfirm({
      title: "删除这条日程？",
      message: `“${event.title}”会从课表中移除，这个操作无法撤销。`,
      confirmLabel: "删除日程",
      tone: "danger",
    }).then((ok) => {
      if (!ok) return false;
      updateActiveTimetable((current) => ({
        ...current,
        events: current.events.filter((item) => item.id !== event.id),
      }));
      notify("日程已删除。");
      return true;
    });

  const saveSemester = (
    nextSemester: Semester,
    periodProfileId: string | null,
    periodProfiles: PeriodProfile[],
    periodRules: PeriodRule[],
  ) => {
    const profileMap = new Map(periodProfiles.map((profile) => [profile.id, profile]));
    const timestamp = new Date().toISOString();
    setData((current) => ({
      ...current,
      periodProfiles,
      updatedAt: timestamp,
      timetables: current.timetables.map((item) => {
        if (item.id === current.activeTimetableId) {
          return {
            ...item,
            semester: nextSemester,
            periodProfileId,
            periodRules: periodRules.map((rule) => ({ ...rule })),
            updatedAt: timestamp,
          };
        }
        const profile = item.periodProfileId
          ? profileMap.get(item.periodProfileId)
          : undefined;
        if (!profile) return item;
        return {
          ...item,
          semester: {
            ...item.semester,
            periods: profile.periods.map((period) => ({ ...period })),
          },
          updatedAt: timestamp,
        };
      }),
    }));
    view.resetToSemester(nextSemester);
    onSettingsClosed();
    notify("课表与作息方案已更新。");
  };

  const switchTimetable = (id: string) => {
    const target = data.timetables.find((item) => item.id === id);
    if (!target) return;
    setData((current) => ({
      ...current,
      activeTimetableId: id,
      updatedAt: new Date().toISOString(),
    }));
    view.resetToTimetable(target);
    onOpenTimetable();
    notify(`已切换到「${target.name}」。`);
  };

  const createTimetable = (input: TimetableCreateInput) => {
    if (data.timetables.length >= MAX_TIMETABLES) {
      notify(`最多只能创建 ${MAX_TIMETABLES} 套课表。`, "error");
      return;
    }
    const profile =
      data.periodProfiles.find((item) => item.id === input.periodProfileId) ??
      data.periodProfiles[0];
    const date = startOfWeekMonday(parseDateKey(input.startDate || getDefaultStartDate()));
    const created = createBlankTimetable(
      data.periodProfiles,
      new Date(),
      input.name.trim() || `我的课表 ${data.timetables.length + 1}`,
    );
    created.semester = {
      ...created.semester,
      name: input.semesterName.trim() || getTermName(date),
      startDate: dateKey(date),
      totalWeeks: input.totalWeeks,
      showWeekends: input.showWeekends,
      periods: profile.periods.map((period) => ({ ...period })),
    };
    created.periodProfileId = profile.id;
    created.periodRules = [
      {
        id: `rule-${created.semester.startDate.slice(5)}`,
        from: created.semester.startDate.slice(5),
        profileId: profile.id,
      },
    ];
    created.courses = createTemplateCourses(
      (input.templateId as TimetableTemplateId | undefined) ?? "blank",
      created.semester.totalWeeks,
    );
    setData((current) => ({
      ...current,
      activeTimetableId: created.id,
      timetables: [...current.timetables, created],
      updatedAt: new Date().toISOString(),
    }));
    view.resetToTimetable(created);
    onOpenTimetable();
    notify(
      created.courses.length > 0
        ? `已创建「${created.name}」，包含 ${created.courses.length} 门模板课程。`
        : `已创建「${created.name}」。`,
    );
  };

  const renameTimetable = (id: string, name: string) => {
    setData((current) => ({
      ...current,
      timetables: current.timetables.map((item) =>
        item.id === id
          ? { ...item, name: name.trim().slice(0, 60), updatedAt: new Date().toISOString() }
          : item,
      ),
      updatedAt: new Date().toISOString(),
    }));
    notify("课表名称已更新。");
  };

  const duplicateTimetable = (id: string) => {
    if (data.timetables.length >= MAX_TIMETABLES) {
      notify(`最多只能创建 ${MAX_TIMETABLES} 套课表。`, "error");
      return;
    }
    const source = data.timetables.find((item) => item.id === id);
    if (!source) return;
    const copy = cloneTimetable(source, `${source.name} 副本`.slice(0, 60));
    setData((current) => ({
      ...current,
      activeTimetableId: copy.id,
      timetables: [...current.timetables, copy],
      updatedAt: new Date().toISOString(),
    }));
    view.resetToTimetable(copy);
    onOpenTimetable();
    notify(`已复制为「${copy.name}」。`);
  };

  const requestDeleteTimetable = (id: string): Promise<boolean> => {
    if (data.timetables.length <= 1) {
      notify("至少保留一套课表。", "error");
      return Promise.resolve(false);
    }
    const target = data.timetables.find((item) => item.id === id);
    if (!target) return Promise.resolve(false);
    return askConfirm({
      title: `删除「${target.name}」？`,
      message: "这套课表里的课程、日程和壁纸都会一起删除，无法撤销。",
      confirmLabel: "删除课表",
      tone: "danger",
    }).then((ok) => {
      if (!ok) return false;
      const remaining = data.timetables.filter((item) => item.id !== id);
      const nextActive =
        data.activeTimetableId === id
          ? remaining[0]
          : data.timetables.find((item) => item.id === data.activeTimetableId) ?? remaining[0];
      setData({
        ...data,
        activeTimetableId: nextActive.id,
        timetables: remaining,
        updatedAt: new Date().toISOString(),
      });
      view.resetToTimetable(nextActive);
      onOpenTimetable();
      notify(`已删除「${target.name}」。`);
      return true;
    });
  };

  const clearAll = (): Promise<boolean> =>
    askConfirm({
      title: "清空全部数据？",
      message:
        "所有课表、课程、日程和壁纸都会被清空，无法撤销。主题和节假日开关会保留。建议先导出备份。",
      confirmLabel: "清空全部",
      tone: "danger",
    }).then((ok) => {
      if (!ok) return false;
      const next = createInitialData();
      setData(next);
      view.resetToTimetable(getActiveTimetable(next));
      onOpenTimetable();
      notify("已经清空，开始写自己的课表吧。");
      return true;
    });

  const renamePeriodProfile = (id: string, name: string) => {
    setData((current) => ({
      ...current,
      periodProfiles: current.periodProfiles.map((profile) =>
        profile.id === id ? { ...profile, name: name.trim().slice(0, 40) } : profile,
      ),
      updatedAt: new Date().toISOString(),
    }));
    notify("作息方案已重命名。");
  };

  const updateWallpaper = (wallpaper: TimetableModel["wallpaper"]) => {
    updateActiveTimetable((current) => ({ ...current, wallpaper }));
  };

  const exportJson = () => downloadScheduleJson(data);

  const exportIcs = () => downloadScheduleIcs(data, store.prefs.autoHolidays);

  const applyImportedData = (next: ScheduleData) => {
    const nextActive = getActiveTimetable(next);
    setData(next);
    view.resetToTimetable(nextActive);
  };

  const importFile = async (file: File): Promise<ImportResult> => {
    const result = await readScheduleFile(file);
    if (!result.data) return { ok: false, message: result.message };
    const next = normalizeSchedule(result.data);
    if (!next) return { ok: false, message: "备份格式无法识别。" };
    const draft: ImportDraft = {
      id: uid("draft"),
      fileName: file.name,
      createdAt: new Date().toISOString(),
      data: next,
      message: result.message,
    };
    onPreviewImport(draft);
    return { ok: true, message: "已读取备份，请选择替换或合并。" };
  };

  const saveDraftForLater = (draft: ImportDraft): ImportResult => {
    const saved = saveImportDraft(draft);
    return {
      ok: false,
      message: saved
        ? "已关闭预览，这份备份已留作草稿，可在「数据与备份」里继续。"
        : "已关闭预览，当前课表未改变；本机空间不足，草稿未能保存。",
    };
  };

  const replaceWithImport = (draft: ImportDraft): ImportResult => {
    clearImportDraft();
    applyImportedData(draft.data);
    onOpenTimetable();
    notify(draft.message);
    return { ok: true, message: draft.message };
  };

  const mergeWithImport = (draft: ImportDraft): ImportResult => {
    const active = getActiveTimetable(data);
    const seen = new Set(
      active.courses.map(
        (course) => `${normalizeCourseNameKey(course.name)}|${normalizeTeacherKey(course.teacher)}`,
      ),
    );
    const courses: Course[] = [];
    const events: ScheduleEvent[] = [];
    for (const timetable of draft.data.timetables) {
      const incoming = instantiateTemplate(
        {
          id: "merge",
          name: timetable.name,
          createdAt: draft.createdAt,
          courses: timetable.courses,
          totalWeeks: timetable.semester.totalWeeks,
        },
        active.semester,
      );
      for (const course of incoming) {
        const key = `${normalizeCourseNameKey(course.name)}|${normalizeTeacherKey(course.teacher)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        courses.push(course);
      }
      for (const event of timetable.events) {
        events.push({ ...event, id: uid("event") });
      }
    }
    if (courses.length === 0 && events.length === 0) {
      return { ok: false, message: "没有可合并的新课程或日程。" };
    }
    updateActiveTimetable((current) => ({
      ...current,
      courses: [...current.courses, ...courses],
      events: [...current.events, ...events],
    }));
    clearImportDraft();
    onOpenTimetable();
    notify(`已合并 ${courses.length} 门课程、${events.length} 条日程。`);
    return {
      ok: true,
      message: `已把 ${courses.length} 门课程和 ${events.length} 条日程合并进当前课表。`,
    };
  };

  const applyImportDraft = async (draft: ImportDraft): Promise<ImportResult> => {
    const confirmed = await askConfirm({
      title: "继续导入这份备份？",
      message: `「${draft.fileName}」将替换当前的 ${data.timetables.length} 套课表。\n建议先导出现有备份。`,
      confirmLabel: "导入并替换",
      tone: "danger",
    });
    if (!confirmed) {
      return { ok: false, message: "已取消，导入草稿仍然保留。" };
    }
    return replaceWithImport(draft);
  };

  const discardImportDraft = () => {
    clearImportDraft();
    notify("已丢弃导入草稿。");
  };

  const saveCurrentAsTemplate = (name: string): ImportResult => {
    const active = getActiveTimetable(data);
    if (active.courses.length === 0) {
      return { ok: false, message: "当前课表还没有课程，先添加课程再存模板。" };
    }
    const template = saveTemplate(name, active.courses, active.semester.totalWeeks);
    if (!template) {
      return {
        ok: false,
        message: `最多保存 ${MAX_TEMPLATES} 个模板，或本机空间不足，请删掉旧模板再试。`,
      };
    }
    notify(`已存为模板「${template.name}」。`);
    return { ok: true, message: `已存为模板「${template.name}」，含 ${template.courses.length} 门课程。` };
  };

  const applyTemplate = (template: CourseTemplate): ImportResult => {
    const active = getActiveTimetable(data);
    const courses = instantiateTemplate(template, active.semester);
    if (courses.length === 0) {
      return { ok: false, message: "这个模板里没有可套用的课程。" };
    }
    updateActiveTimetable((current) => ({
      ...current,
      courses: [...current.courses, ...courses],
    }));
    notify(`已套用「${template.name}」的 ${courses.length} 门课程。`);
    return {
      ok: true,
      message: `已把「${template.name}」的 ${courses.length} 门课程追加到当前课表。`,
    };
  };

  const deleteTemplate = (id: string) => {
    removeTemplate(id);
    notify("模板已删除。");
  };

  const putOverride = (override: SessionOverride) => {
    updateActiveTimetable((current) => ({
      ...current,
      overrides: [
        ...current.overrides.filter((item) =>
          override.action === "hide"
            ? !(item.action === "hide" && item.courseId === override.courseId)
            : !(
                item.action !== "hide" &&
                item.courseId === override.courseId &&
                item.slotId === override.slotId &&
                item.week === override.week
              ),
        ),
        override,
      ],
    }));
  };

  const cancelSession = (session: Session, week: number) => {
    putOverride({
      id: uid("override"),
      action: "cancel",
      courseId: session.course.id,
      slotId: session.slot.id,
      week,
      createdAt: new Date().toISOString(),
    });
    notify(`已停掉第 ${week} 周「${session.course.name}」的这一次课。`);
  };

  const moveSession = (
    session: Session,
    week: number,
    toDay: number,
    toStart: number,
    toEnd: number,
  ) => {
    putOverride({
      id: uid("override"),
      action: "move",
      courseId: session.course.id,
      slotId: session.slot.id,
      week,
      toDay,
      toStart,
      toEnd,
      createdAt: new Date().toISOString(),
    });
    notify(`已把第 ${week} 周「${session.course.name}」调到周${"一二三四五六日"[toDay - 1]}第 ${toStart} 节。`);
  };

  const hideCourseFromWeek = (courseId: string, week: number) => {
    putOverride({
      id: uid("override"),
      action: "hide",
      courseId,
      slotId: "",
      week,
      createdAt: new Date().toISOString(),
    });
    notify(`这门课从第 ${week} 周起不再显示，可随时恢复。`);
  };

  const restoreCourse = (courseId: string) => {
    updateActiveTimetable((current) => ({
      ...current,
      overrides: current.overrides.filter(
        (item) => !(item.action === "hide" && item.courseId === courseId),
      ),
    }));
    notify("已恢复显示这门课。");
  };

  const restoreSession = (session: Session, week: number) => {
    updateActiveTimetable((current) => ({
      ...current,
      overrides: current.overrides.filter(
        (item) =>
          !(
            item.action !== "hide" &&
            item.courseId === session.course.id &&
            item.slotId === session.slot.id &&
            item.week === week
          ),
      ),
    }));
    notify("这一次课已恢复原样。");
  };

  const removeOverride = (id: string) => {
    updateActiveTimetable((current) => ({
      ...current,
      overrides: current.overrides.filter((item) => item.id !== id),
    }));
    notify("这次单次调整已撤销。");
  };

  return {
    saveCourse,
    addTextCourses,
    requestDeleteCourse,
    saveEvent,
    requestDeleteEvent,
    saveSemester,
    switchTimetable,
    createTimetable,
    renameTimetable,
    duplicateTimetable,
    requestDeleteTimetable,
    clearAll,
    renamePeriodProfile,
    updateWallpaper,
    exportJson,
    exportIcs,
    importFile,
    saveDraftForLater,
    replaceWithImport,
    mergeWithImport,
    applyImportDraft,
    discardImportDraft,
    saveCurrentAsTemplate,
    applyTemplate,
    deleteTemplate,
    cancelSession,
    moveSession,
    hideCourseFromWeek,
    restoreCourse,
    restoreSession,
    removeOverride,
  };
}
