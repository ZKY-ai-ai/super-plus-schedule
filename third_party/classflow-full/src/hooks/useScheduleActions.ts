import type {
  Course,
  ImportResult,
  PeriodProfile,
  PeriodRule,
  ScheduleData,
  ScheduleEvent,
  Semester,
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
} from "../lib/factory";
import { createTemplateCourses } from "../lib/templates";
import type { TimetableTemplateId } from "../lib/templates";
import { downloadScheduleIcs, downloadScheduleJson, readScheduleFile } from "../lib/transfer";
import { normalizeSchedule } from "../lib/storage";
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
}

export type ScheduleActions = ReturnType<typeof useScheduleActions>;

export function useScheduleActions({
  store,
  view,
  notify,
  askConfirm,
  onOpenTimetable,
  onSettingsClosed,
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

  const requestDeleteCourse = (course: Course): Promise<boolean> =>
    askConfirm({
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
    const confirmed = await askConfirm({
      title: "导入并替换全部课表？",
      message: `将导入 ${next.timetables.length} 套课表，替换当前的 ${data.timetables.length} 套课表。\n建议先导出现有备份。`,
      confirmLabel: "导入并替换",
      tone: "danger",
    });
    if (!confirmed) {
      return { ok: false, message: "已取消导入，当前课表未改变。" };
    }
    applyImportedData(next);
    onOpenTimetable();
    notify(result.message);
    return { ok: true, message: result.message };
  };

  return {
    saveCourse,
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
  };
}
