import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  FileUp,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Plus,
  Printer,
  Redo2,
  Tag,
  Undo2,
} from "lucide-react";
import type {
  AppPage,
  Course,
  EventRepeat,
  ImportDraft,
  Period,
  ScheduleEvent,
  Session,
  SettingsTab,
  Wallpaper,
  WeekPattern,
} from "./types";
import { dateKey, formatWeekRange } from "./lib/date";
import { readCourseShareFromHash } from "./lib/courseShare";
import { wallpaperStyle } from "./lib/wallpaper";
import { isNativeApp } from "./lib/nativeFile";
import { useClock } from "./hooks/useClock";
import { useScheduleStore } from "./hooks/useScheduleStore";
import { useWeekView } from "./hooks/useWeekView";
import { useScheduleActions } from "./hooks/useScheduleActions";
import type { ConfirmRequest } from "./hooks/useScheduleActions";
import { CourseDetail } from "./components/CourseDetail";
import { CourseEditor } from "./components/CourseEditor";
import type { EditorSeed } from "./components/CourseEditor";
import { CourseLibrary } from "./components/CourseLibrary";
import { AgendaPage } from "./components/AgendaPage";
import { MobileTabBar } from "./components/MobileTabBar";
import { ProfilePage } from "./components/ProfilePage";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { DesktopPet } from "./components/DesktopPet";
import { EventEditor } from "./components/EventEditor";
import type { EventSeed } from "./components/EventEditor";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { Timetable } from "./components/Timetable";
import { ImportPreviewDialog } from "./components/ImportPreviewDialog";
import { ImportScheduleDialog } from "./components/ImportScheduleDialog";
import { SessionOverrideDialog } from "./components/SessionOverrideDialog";
import { TextImportDialog } from "./components/TextImportDialog";
import { TimetableShareDialog } from "./components/TimetableShareDialog";
import { TimetableList } from "./components/TimetableList";
import { TimetableManager } from "./components/TimetableManager";
import { Toast } from "./components/Toast";
import type { ToastState } from "./components/Toast";
import { Topbar } from "./components/Topbar";
import { WallpaperModal } from "./components/WallpaperModal";
import { WeekHero } from "./components/WeekHero";
import { WeekPickerModal } from "./components/WeekPickerModal";
import { CommandPalette, type CommandItem } from "./components/CommandPalette";
import { PlanPage, type PlanTab } from "./components/planner/PlanPage";
import { NotesWorkspace } from "./components/notes/NotesWorkspace";
import { AiWorkspace } from "./components/ai/AiWorkspace";
import {
  DEFAULT_GAP_PREFERENCES,
  loadGapPreferences,
  saveGapPreferences,
  type GapPreferences,
} from "./lib/gaps";
import {
  addSubtask,
  completeTask,
  loadTasks,
  makeTask,
  removeSubtask,
  saveTasks,
  toggleSubtask,
  type RepeatRule,
  type Task,
} from "./lib/tasks";
import { loadExams, saveExams, makeExam, type ExamType } from "./lib/exams";
import {
  createChapter,
  createNote,
  deleteChapter,
  deleteNote,
  emptyNotes,
  loadNotes,
  moveNoteToChapter,
  saveNotes,
  updateNote,
  upsertChapter,
  upsertNote,
  type NotePatch,
} from "./lib/notes";
import { makeCourse, makeEvent, makeSlot, nextTone } from "./lib/factory";
import { parseCourseText } from "./lib/textImport";
import type { AiAction } from "./lib/aiActions";
import { toggleEventCheckIn } from "./lib/eventRepeat";
import {
  loadGradeSettings,
  loadGrades,
  saveGradeSettings,
  saveGrades,
  type CourseStatus,
  type GradeRecord,
} from "./lib/grades";
import { loadReminderSettings, saveReminderSettings } from "./lib/reminders";
import { loadTemplates } from "./lib/storage";
import {
  autoCombine,
  createEmptyCatalog,
  createSection,
  loadCatalog,
  saveCatalog,
  withPlanCreated,
  withPlanRemoved,
  withPlanSections,
  withSectionAdded,
  withSectionDeleted,
  withSectionRemoved,
  withSectionsMerged,
  type CourseCategory,
} from "./lib/planner";
import {
  addStudyLog,
  loadStudyLogs,
  saveStudyLogs,
  type StudyLog,
} from "./lib/stats";
import { emptyWoodfish, loadWoodfish, saveWoodfish, tapWoodfish } from "./lib/woodfish";
import { syncAndroidWidget } from "./lib/widget";
import {
  addMemory as addAiMemory,
  clearMemory as clearAiMemory,
  loadAiSettings,
  loadMemory as loadAiMemory,
  removeMemory as removeAiMemory,
  saveAiSettings,
  saveMemory as saveAiMemory,
} from "./lib/ai";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "default";
}

const PAGE_NAMES: Record<AppPage, string> = {
  timetable: "周课表",
  agenda: "日程与单日",
  plan: "空档与规划",
  notes: "笔记与看板",
  ai: "AI 助手",
  courses: "课程库",
  profile: "我的",
};

const PLAN_TAB_NAMES: Record<PlanTab, string> = {
  gaps: "空档评估",
  study: "学习与统计",
  select: "选课规划",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export default function App() {
  const now = useClock();
  const store = useScheduleStore(now);
  const view = useWeekView({
    data: store.data,
    prefs: store.prefs,
    timetable: store.timetable,
    now,
  });

  const [page, setPage] = useState<AppPage>("timetable");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [planTab, setPlanTab] = useState<PlanTab>("gaps");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("term");
  const [timetablesOpen, setTimetablesOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [editorSeed, setEditorSeed] = useState<EditorSeed | null>(null);
  const [eventSeed, setEventSeed] = useState<EventSeed | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sessionMenu, setSessionMenu] = useState<{ session: Session; week: number } | null>(null);
  const [textImportOpen, setTextImportOpen] = useState(false);
  const [importScheduleOpen, setImportScheduleOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedCourseText, setSharedCourseText] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  const confirmResolve = useRef<((value: boolean) => void) | null>(null);
  const [gapPrefs, setGapPrefs] = useState<GapPreferences>(() => loadGapPreferences());

  const { timetable, semester, courses, prefs, data } = store;
  const {
    week,
    selectedDay,
    setWeek,
    setSelectedDay,
    todayNumber,
    currentWeek,
    viewDates,
    viewDays,
    viewSessions,
    viewPeriods,
    currentSessions,
    currentPeriods,
    viewStats,
    viewSemester,
  } = view;
  const events = timetable.events;
  const currentSemester = useMemo(
    () => ({ ...semester, periods: view.currentPeriods }),
    [semester, view.currentPeriods],
  );
  const detailCourse = detailId ? courses.find((course) => course.id === detailId) ?? null : null;
  const nativeApp = isNativeApp();

  const notify = useCallback((message: string, tone: ToastState["tone"] = "success") => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, tone });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const shared = readCourseShareFromHash(window.location.hash);
    if (!shared) return;
    setSharedCourseText(shared);
    setTextImportOpen(true);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  const askConfirm = useCallback(
    (payload: ConfirmRequest): Promise<boolean> =>
      new Promise((resolve) => {
        confirmResolve.current?.(false);
        confirmResolve.current = resolve;
        setConfirmState(payload);
      }),
    [],
  );

  const settleConfirm = useCallback((value: boolean) => {
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    setConfirmState(null);
    resolve?.(value);
  }, []);

  const onOpenTimetable = useCallback(() => {
    setSettingsOpen(false);
    setTimetablesOpen(false);
    setSidebarOpen(false);
    setPage("timetable");
  }, []);
  const onSettingsClosed = useCallback(() => setSettingsOpen(false), []);
  const [importPreview, setImportPreview] = useState<ImportDraft | null>(null);
  const [draftRevision, setDraftRevision] = useState(0);

  const actions = useScheduleActions({
    store,
    view,
    notify,
    askConfirm,
    onOpenTimetable,
    onSettingsClosed,
    onPreviewImport: setImportPreview,
  });

  useEffect(() => {
    document.body.classList.toggle("sidebar-open", sidebarOpen);
    return () => document.body.classList.remove("sidebar-open");
  }, [sidebarOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1080) setSidebarOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navigate = (nextPage: AppPage) => {
    if (nextPage === "agenda" && !viewDays.includes(view.selectedDay)) {
      view.setSelectedDay(
        viewDays.includes(view.todayNumber) ? view.todayNumber : viewDays[0] ?? 1,
      );
    }
    setPage(nextPage);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openEditor = (seed: EditorSeed = {}) => {
    setEditorSeed(seed);
    setSidebarOpen(false);
  };

  const openEventEditor = (seed: EventSeed = {}) => {
    setEventSeed({ date: seed.date ?? dateKey(now), event: seed.event });
    setSidebarOpen(false);
  };

  const openCourseDetail = (course: Course) => {
    setDetailId(course.id);
  };

  const handleSaveCourse = (course: Course) => {
    actions.saveCourse(course);
    setEditorSeed(null);
  };

  const handleDeleteCourse = (course: Course) => {
    void actions.requestDeleteCourse(course).then((deleted) => {
      if (deleted) setDetailId(null);
    });
  };

  const handleSaveEvent = (event: ScheduleEvent) => {
    actions.saveEvent(event);
    setEventSeed(null);
  };

  const handleDeleteEvent = (event: ScheduleEvent) => {
    void actions.requestDeleteEvent(event).then((deleted) => {
      if (deleted) setEventSeed(null);
    });
  };

  const runAiAction = async (
    rawAction: AiAction,
  ): Promise<{ ok: boolean; message: string }> => {
    const { action, args } = rawAction;
    const fail = (message: string) => ({ ok: false, message });
    try {
      switch (action) {
        case "navigate": {
          const target = args.page as AppPage;
          const planTabArg = args.planTab as PlanTab | undefined;
          if (target === "plan" && planTabArg) setPlanTab(planTabArg);
          navigate(target);
          const suffix =
            target === "plan" && planTabArg ? ` · ${PLAN_TAB_NAMES[planTabArg]}` : "";
          return { ok: true, message: `已打开「${PAGE_NAMES[target]}${suffix}」。` };
        }

        case "set_week": {
          const week = Number(args.week);
          view.goToWeek(week);
          navigate("timetable");
          return { ok: true, message: `已跳到第 ${week} 周。` };
        }

        case "open_settings": {
          const tab = (args.tab as SettingsTab | undefined) ?? "term";
          setSettingsTab(tab);
          setSettingsOpen(true);
          return { ok: true, message: "已打开设置。" };
        }

        case "open_text_import": {
          setSharedCourseText(String(args.text));
          setTextImportOpen(true);
          return { ok: true, message: "已打开文本导入并填入内容。" };
        }

        case "create_note": {
          const notes = loadNotes();
          const note = createNote({
            title: String(args.title),
            body: typeof args.body === "string" ? args.body : "",
            tags: args.tags as string[] | undefined,
            courseId: (args.courseId as string | undefined) ?? null,
            pinned: args.pinned === true,
          });
          if (!saveNotes(upsertNote(notes, note))) return fail("笔记保存失败，本机存储可能已满。");
          return { ok: true, message: `已新建笔记《${note.title}》。` };
        }

        case "update_note": {
          const notes = loadNotes();
          const current = notes.notes.find((note) => note.id === args.id);
          if (!current) return fail("没有找到这条笔记。");
          const patch: NotePatch = {};
          if (typeof args.title === "string") patch.title = args.title;
          if (typeof args.body === "string") patch.body = args.body;
          if (Array.isArray(args.tags)) patch.tags = args.tags as string[];
          if (typeof args.pinned === "boolean") patch.pinned = args.pinned;
          const next = updateNote(current, patch);
          if (!saveNotes(upsertNote(notes, next))) return fail("笔记保存失败，本机存储可能已满。");
          return { ok: true, message: `已更新笔记《${next.title}》。` };
        }

        case "delete_note": {
          const notes = loadNotes();
          const target = notes.notes.find((note) => note.id === args.id);
          if (!target) return fail("没有找到这条笔记。");
          if (!saveNotes(deleteNote(notes, target.id))) return fail("笔记保存失败。");
          return { ok: true, message: `已删除笔记《${target.title}》。` };
        }

        case "create_task": {
          const tasks = loadTasks(timetable.id);
          const task = makeTask({
            title: String(args.title),
            courseId: (args.courseId as string | undefined) ?? null,
            dueDate: typeof args.dueDate === "string" ? args.dueDate : undefined,
            dueTime: typeof args.dueTime === "string" ? args.dueTime : undefined,
            note: typeof args.note === "string" ? args.note : undefined,
            repeat: args.repeat as RepeatRule | undefined,
            estimatedMinutes:
              typeof args.estimatedMinutes === "number" ? args.estimatedMinutes : undefined,
          });
          if (!saveTasks(timetable.id, [...tasks, task])) return fail("任务保存失败。");
          return { ok: true, message: `已新建任务《${task.title}》。` };
        }

        case "complete_task": {
          const tasks = loadTasks(timetable.id);
          const target = tasks.find((task) => task.id === args.id);
          if (!target) return fail("没有找到这个任务。");
          const next = tasks.map((task) => (task.id === target.id ? completeTask(task) : task));
          if (!saveTasks(timetable.id, next)) return fail("任务保存失败。");
          return { ok: true, message: `已把任务《${target.title}》标记完成。` };
        }

        case "delete_task": {
          const tasks = loadTasks(timetable.id);
          const target = tasks.find((task) => task.id === args.id);
          if (!target) return fail("没有找到这个任务。");
          if (!saveTasks(timetable.id, tasks.filter((task) => task.id !== target.id))) {
            return fail("任务保存失败。");
          }
          return { ok: true, message: `已删除任务《${target.title}》。` };
        }

        case "create_exam": {
          const exams = loadExams(timetable.id);
          const exam = makeExam({
            title: String(args.title),
            date: String(args.date),
            courseId: (args.courseId as string | undefined) ?? null,
            type: args.type as ExamType | undefined,
            startTime: typeof args.startTime === "string" ? args.startTime : undefined,
            endTime: typeof args.endTime === "string" ? args.endTime : undefined,
            location: typeof args.location === "string" ? args.location : undefined,
            seat: typeof args.seat === "string" ? args.seat : undefined,
            note: typeof args.note === "string" ? args.note : undefined,
          });
          if (!exam.date) return fail("考试日期无效。");
          if (!saveExams(timetable.id, [...exams, exam])) return fail("考试保存失败。");
          return { ok: true, message: `已新建考试《${exam.title}》。` };
        }

        case "delete_exam": {
          const exams = loadExams(timetable.id);
          const target = exams.find((exam) => exam.id === args.id);
          if (!target) return fail("没有找到这个考试。");
          if (!saveExams(timetable.id, exams.filter((exam) => exam.id !== target.id))) {
            return fail("考试保存失败。");
          }
          return { ok: true, message: `已删除考试《${target.title}》。` };
        }

        case "add_course": {
          const totalWeeks = currentSemester.totalWeeks;
          const slots = (args.slots as Array<Record<string, unknown>>).map((slot) =>
            makeSlot(
              {
                day: Number(slot.day),
                start: Number(slot.start),
                end: Number(slot.end),
                weekStart: Number(slot.weekStart ?? 1),
                weekEnd: Number(slot.weekEnd ?? totalWeeks),
                pattern: (slot.pattern as WeekPattern | undefined) ?? "all",
              },
              totalWeeks,
            ),
          );
          const course = makeCourse({
            name: String(args.name),
            teacher: typeof args.teacher === "string" ? args.teacher : undefined,
            location: typeof args.location === "string" ? args.location : undefined,
            note: typeof args.note === "string" ? args.note : undefined,
            tone: nextTone(courses),
            slots,
          });
          actions.saveCourse(course);
          return { ok: true, message: `已新建课程《${course.name}》，共 ${slots.length} 个时段。` };
        }

        case "update_course": {
          const course = courses.find((item) => item.id === args.id);
          if (!course) return fail("没有找到这门课程。");
          const next: Course = {
            ...course,
            ...(typeof args.name === "string" ? { name: args.name } : {}),
            ...(typeof args.teacher === "string" ? { teacher: args.teacher } : {}),
            ...(typeof args.location === "string" ? { location: args.location } : {}),
            ...(typeof args.note === "string" ? { note: args.note } : {}),
            updatedAt: new Date().toISOString(),
          };
          actions.saveCourse(next);
          return { ok: true, message: `已更新课程《${next.name}》。` };
        }

        case "delete_course": {
          const course = courses.find((item) => item.id === args.id);
          if (!course) return fail("没有找到这门课程。");
          const deleted = await actions.requestDeleteCourse(course);
          return deleted
            ? { ok: true, message: `已删除课程《${course.name}》。` }
            : fail("已取消删除课程。");
        }

        case "add_event": {
          const event = makeEvent({
            title: String(args.title),
            date: String(args.date),
            allDay: args.allDay === true,
            start: typeof args.start === "string" ? args.start : undefined,
            end: typeof args.end === "string" ? args.end : undefined,
            note: typeof args.note === "string" ? args.note : undefined,
            repeat: args.repeat as EventRepeat | undefined,
            repeatUntil: typeof args.repeatUntil === "string" ? args.repeatUntil : undefined,
          });
          actions.saveEvent(event);
          return { ok: true, message: `已新建日程《${event.title}》。` };
        }

        case "delete_event": {
          const event = events.find((item) => item.id === args.id);
          if (!event) return fail("没有找到这条日程。");
          const deleted = await actions.requestDeleteEvent(event);
          return deleted
            ? { ok: true, message: `已删除日程《${event.title}》。` }
            : fail("已取消删除日程。");
        }

        case "update_semester": {
          const next = {
            ...currentSemester,
            ...(typeof args.name === "string" ? { name: args.name } : {}),
            ...(typeof args.startDate === "string" ? { startDate: args.startDate } : {}),
            ...(typeof args.totalWeeks === "number" ? { totalWeeks: args.totalWeeks } : {}),
            ...(typeof args.showWeekends === "boolean" ? { showWeekends: args.showWeekends } : {}),
          };
          actions.saveSemester(
            next,
            timetable.periodProfileId,
            data.periodProfiles,
            timetable.periodRules,
          );
          return { ok: true, message: "已更新当前学期设置。" };
        }

        case "switch_timetable": {
          const target = data.timetables.find((item) => item.id === args.id);
          if (!target) return fail("没有找到这套课表。");
          actions.switchTimetable(target.id);
          return { ok: true, message: `已切换到课表「${target.name}」。` };
        }

        case "add_courses_from_text": {
          const parsed = parseCourseText(String(args.text), currentSemester.totalWeeks);
          if (parsed.courses.length === 0) return fail("文本里没有解析出课程。");
          const added = actions.addTextCourses(parsed.courses);
          return {
            ok: true,
            message: `已导入 ${added.courses} 门课程、${added.slots} 个时段。`,
          };
        }

        case "clear_all": {
          const cleared = await actions.clearAll();
          return cleared ? { ok: true, message: "已清空当前数据。" } : fail("已取消清空。");
        }

        case "open_dialog": {
          switch (args.dialog) {
            case "text-import":
              setSharedCourseText("");
              setTextImportOpen(true);
              break;
            case "share":
              setShareOpen(true);
              break;
            case "timetables":
              setTimetablesOpen(true);
              break;
            case "wallpaper":
              setWallpaperOpen(true);
              break;
            case "week-picker":
              setWeekPickerOpen(true);
              break;
            case "command-palette":
              setPaletteOpen(true);
              break;
            default:
              return fail("未知的弹窗。");
          }
          return { ok: true, message: "已打开对应入口。" };
        }

        case "print": {
          printTimetable();
          return { ok: true, message: "已打开打印预览。" };
        }

        case "undo": {
          const done = store.undo();
          return done ? { ok: true, message: "已撤销上一次修改。" } : fail("没有可撤销的修改。");
        }

        case "redo": {
          const done = store.redo();
          return done ? { ok: true, message: "已重做修改。" } : fail("没有可重做的修改。");
        }

        case "set_preferences": {
          if (typeof args.theme === "string") {
            store.setTheme(args.theme as "light" | "dark" | "whale");
          }
          if (typeof args.layout === "string") {
            store.setLayout(args.layout as "grid" | "list");
          }
          if (typeof args.showAliases === "boolean") {
            store.setShowAliases(args.showAliases);
          }
          if (typeof args.autoHolidays === "boolean") {
            store.setAutoHolidays(args.autoHolidays);
          }
          return { ok: true, message: "已更新界面偏好。" };
        }

        case "set_wallpaper": {
          actions.updateWallpaper({
            preset: args.preset as Wallpaper["preset"],
            dataUrl: "",
            dim: typeof args.dim === "number" ? args.dim : 20,
          });
          notify("壁纸已更新。");
          return { ok: true, message: "已更新课表壁纸。" };
        }

        case "create_chapter": {
          const notes = loadNotes();
          const chapter = createChapter({
            title: String(args.title),
            courseId: typeof args.courseId === "string" ? args.courseId : null,
            order: typeof args.order === "number" ? args.order : undefined,
          });
          if (!saveNotes(upsertChapter(notes, chapter))) return fail("章节保存失败。");
          return { ok: true, message: `已新建章节《${chapter.title}》。` };
        }

        case "rename_chapter": {
          const notes = loadNotes();
          const chapter = notes.chapters.find((item) => item.id === args.id);
          if (!chapter) return fail("没有找到这个章节。");
          const next = { ...chapter, title: String(args.title) };
          if (!saveNotes(upsertChapter(notes, next))) return fail("章节保存失败。");
          return { ok: true, message: `章节已改名为《${next.title}》。` };
        }

        case "delete_chapter": {
          const notes = loadNotes();
          const chapter = notes.chapters.find((item) => item.id === args.id);
          if (!chapter) return fail("没有找到这个章节。");
          if (!saveNotes(deleteChapter(notes, chapter.id))) return fail("章节保存失败。");
          return { ok: true, message: `已删除章节《${chapter.title}》，笔记回到未归档。` };
        }

        case "move_note": {
          const notes = loadNotes();
          const note = notes.notes.find((item) => item.id === args.noteId);
          if (!note) return fail("没有找到这条笔记。");
          const chapterId = typeof args.chapterId === "string" ? args.chapterId : null;
          if (!saveNotes(moveNoteToChapter(notes, note.id, chapterId))) {
            return fail("笔记保存失败。");
          }
          return { ok: true, message: `已移动笔记《${note.title}》。` };
        }

        case "update_task": {
          const tasks = loadTasks(timetable.id);
          const target = tasks.find((task) => task.id === args.id);
          if (!target) return fail("没有找到这个任务。");
          const next: Task = {
            ...target,
            ...(typeof args.title === "string" ? { title: args.title } : {}),
            ...(typeof args.dueDate === "string" ? { dueDate: args.dueDate } : {}),
            ...(typeof args.dueTime === "string" ? { dueTime: args.dueTime } : {}),
            ...(args.courseId !== undefined
              ? { courseId: (args.courseId as string | null) ?? null }
              : {}),
            ...(typeof args.note === "string" ? { note: args.note } : {}),
            ...(typeof args.estimatedMinutes === "number"
              ? { estimatedMinutes: args.estimatedMinutes }
              : {}),
            ...(typeof args.repeat === "string"
              ? { repeat: args.repeat as RepeatRule }
              : {}),
            updatedAt: new Date().toISOString(),
          };
          if (!next.dueDate) next.dueTime = "";
          if (next.repeat !== "none" && !next.dueDate) next.repeat = "none";
          if (!saveTasks(timetable.id, tasks.map((task) => (task.id === next.id ? next : task)))) {
            return fail("任务保存失败。");
          }
          return { ok: true, message: `已更新任务《${next.title}》。` };
        }

        case "reopen_task": {
          const tasks = loadTasks(timetable.id);
          const target = tasks.find((task) => task.id === args.id);
          if (!target) return fail("没有找到这个任务。");
          const next: Task = { ...target, done: false, updatedAt: new Date().toISOString() };
          if (!saveTasks(timetable.id, tasks.map((task) => (task.id === next.id ? next : task)))) {
            return fail("任务保存失败。");
          }
          return { ok: true, message: `任务《${next.title}》已改回未完成。` };
        }

        case "add_subtask": {
          const tasks = loadTasks(timetable.id);
          const target = tasks.find((task) => task.id === args.taskId);
          if (!target) return fail("没有找到这个任务。");
          const next = addSubtask(target, String(args.title));
          if (!saveTasks(timetable.id, tasks.map((task) => (task.id === next.id ? next : task)))) {
            return fail("任务保存失败。");
          }
          return { ok: true, message: "已添加子任务。" };
        }

        case "toggle_subtask": {
          const tasks = loadTasks(timetable.id);
          const target = tasks.find((task) => task.id === args.taskId);
          if (!target) return fail("没有找到这个任务。");
          if (!target.subtasks.some((item) => item.id === args.subtaskId)) {
            return fail("没有找到这个子任务。");
          }
          const next = toggleSubtask(target, String(args.subtaskId));
          if (!saveTasks(timetable.id, tasks.map((task) => (task.id === next.id ? next : task)))) {
            return fail("任务保存失败。");
          }
          return { ok: true, message: "已切换子任务状态。" };
        }

        case "delete_subtask": {
          const tasks = loadTasks(timetable.id);
          const target = tasks.find((task) => task.id === args.taskId);
          if (!target) return fail("没有找到这个任务。");
          const next = removeSubtask(target, String(args.subtaskId));
          if (!saveTasks(timetable.id, tasks.map((task) => (task.id === next.id ? next : task)))) {
            return fail("任务保存失败。");
          }
          return { ok: true, message: "已删除子任务。" };
        }

        case "update_exam": {
          const exams = loadExams(timetable.id);
          const target = exams.find((exam) => exam.id === args.id);
          if (!target) return fail("没有找到这个考试。");
          const next = {
            ...target,
            ...(typeof args.title === "string" ? { title: args.title } : {}),
            ...(typeof args.date === "string" ? { date: args.date } : {}),
            ...(args.courseId !== undefined
              ? { courseId: (args.courseId as string | null) ?? null }
              : {}),
            ...(typeof args.type === "string" ? { type: args.type as ExamType } : {}),
            ...(typeof args.startTime === "string" ? { startTime: args.startTime } : {}),
            ...(typeof args.endTime === "string" ? { endTime: args.endTime } : {}),
            ...(typeof args.location === "string" ? { location: args.location } : {}),
            ...(typeof args.seat === "string" ? { seat: args.seat } : {}),
            ...(typeof args.note === "string" ? { note: args.note } : {}),
            updatedAt: new Date().toISOString(),
          };
          if (!next.startTime) next.endTime = "";
          if (!saveExams(timetable.id, exams.map((exam) => (exam.id === next.id ? next : exam)))) {
            return fail("考试保存失败。");
          }
          return { ok: true, message: `已更新考试《${next.title}》。` };
        }

        case "set_grade": {
          const records = loadGrades(timetable.id);
          const existing = records.find((record) => record.courseId === args.courseId);
          const record: GradeRecord = {
            courseId: String(args.courseId),
            score:
              "score" in args ? (args.score as number | null) : existing?.score ?? null,
            credits:
              "credits" in args ? (args.credits as number | null) : existing?.credits ?? null,
            status:
              typeof args.status === "string"
                ? (args.status as CourseStatus)
                : existing?.status ?? "normal",
            updatedAt: new Date().toISOString(),
          };
          const next = existing
            ? records.map((item) => (item.courseId === record.courseId ? record : item))
            : [...records, record];
          if (!saveGrades(timetable.id, next)) return fail("成绩保存失败。");
          return { ok: true, message: "成绩已保存。" };
        }

        case "delete_grade": {
          const records = loadGrades(timetable.id);
          if (!records.some((record) => record.courseId === args.courseId)) {
            return fail("这门课还没有成绩记录。");
          }
          if (
            !saveGrades(
              timetable.id,
              records.filter((record) => record.courseId !== args.courseId),
            )
          ) {
            return fail("成绩保存失败。");
          }
          return { ok: true, message: "成绩已删除。" };
        }

        case "update_grade_settings": {
          const current = loadGradeSettings();
          saveGradeSettings({
            hideScores:
              typeof args.hideScores === "boolean" ? args.hideScores : current.hideScores,
            requiredCredits:
              typeof args.requiredCredits === "number"
                ? args.requiredCredits
                : current.requiredCredits,
          });
          return { ok: true, message: "成绩设置已更新。" };
        }

        case "set_course_slots": {
          const course = courses.find((item) => item.id === args.courseId);
          if (!course) return fail("没有找到这门课程。");
          const slots = (args.slots as Array<Record<string, unknown>>).map((slot) =>
            makeSlot(
              {
                day: Number(slot.day),
                start: Number(slot.start),
                end: Number(slot.end),
                weekStart: Number(slot.weekStart ?? 1),
                weekEnd: Number(slot.weekEnd ?? currentSemester.totalWeeks),
                pattern: (slot.pattern as WeekPattern | undefined) ?? "all",
                weeks: Array.isArray(slot.weeks) ? (slot.weeks as number[]) : undefined,
              },
              currentSemester.totalWeeks,
            ),
          );
          actions.saveCourse({ ...course, slots, updatedAt: new Date().toISOString() });
          return { ok: true, message: `已替换《${course.name}》的时段。` };
        }

        case "restore_course": {
          actions.restoreCourse(String(args.courseId));
          return { ok: true, message: "已恢复显示这门课。" };
        }

        case "override_session": {
          const course = courses.find((item) => item.id === args.courseId);
          if (!course) return fail("没有找到这门课程。");
          const weekNumber = Number(args.week);
          if (args.kind === "hide") {
            actions.hideCourseFromWeek(course.id, weekNumber);
            return { ok: true, message: `已从第 ${weekNumber} 周起隐藏《${course.name}》。` };
          }
          const slot = course.slots.find((item) => item.id === args.slotId);
          if (!slot) return fail("没有找到这个上课时段。");
          const session: Session = {
            id: `${course.id}-${slot.id}`,
            course,
            slot,
            day: slot.day,
            start: slot.start,
            end: slot.end,
          };
          if (args.kind === "cancel") {
            actions.cancelSession(session, weekNumber);
            return { ok: true, message: `已停掉第 ${weekNumber} 周《${course.name}》的这一次课。` };
          }
          actions.moveSession(
            session,
            weekNumber,
            Number(args.toDay),
            Number(args.toStart),
            Number(args.toEnd),
          );
          return { ok: true, message: `已调整第 ${weekNumber} 周《${course.name}》的上课时间。` };
        }

        case "remove_override": {
          actions.removeOverride(String(args.id));
          return { ok: true, message: "已撤销这条单次调整。" };
        }

        case "update_event": {
          const event = events.find((item) => item.id === args.id);
          if (!event) return fail("没有找到这条日程。");
          const next: ScheduleEvent = {
            ...event,
            ...(typeof args.title === "string" ? { title: args.title } : {}),
            ...(typeof args.date === "string" ? { date: args.date } : {}),
            ...(typeof args.allDay === "boolean" ? { allDay: args.allDay } : {}),
            ...(typeof args.start === "string" ? { start: args.start } : {}),
            ...(typeof args.end === "string" ? { end: args.end } : {}),
            ...(typeof args.note === "string" ? { note: args.note } : {}),
            ...(typeof args.repeat === "string"
              ? { repeat: args.repeat as EventRepeat }
              : {}),
            ...(typeof args.repeatUntil === "string"
              ? { repeatUntil: args.repeatUntil }
              : {}),
            updatedAt: new Date().toISOString(),
          };
          if (!next.start) next.end = "";
          if (next.repeat === "none") next.repeatUntil = "";
          actions.saveEvent(next);
          return { ok: true, message: `已更新日程《${next.title}》。` };
        }

        case "check_in_event": {
          const event = events.find((item) => item.id === args.id);
          if (!event) return fail("没有找到这条日程。");
          actions.saveEvent(toggleEventCheckIn(event, String(args.date)));
          return { ok: true, message: "已切换这天的打卡状态。" };
        }

        case "create_timetable": {
          actions.createTimetable({
            name: String(args.name),
            semesterName: typeof args.semesterName === "string" ? args.semesterName : "",
            startDate: typeof args.startDate === "string" ? args.startDate : "",
            totalWeeks:
              typeof args.totalWeeks === "number" ? args.totalWeeks : currentSemester.totalWeeks,
            showWeekends:
              typeof args.showWeekends === "boolean"
                ? args.showWeekends
                : currentSemester.showWeekends,
            weekStartsOn:
              typeof args.weekStartsOn === "number"
                ? args.weekStartsOn
                : currentSemester.weekStartsOn,
            periodProfileId:
              typeof args.periodProfileId === "string"
                ? args.periodProfileId
                : data.periodProfiles[0]?.id ?? "",
            ...(typeof args.templateId === "string" ? { templateId: args.templateId } : {}),
          });
          return { ok: true, message: `已新建课表《${args.name}》。` };
        }

        case "rename_timetable": {
          actions.renameTimetable(String(args.id), String(args.name));
          return { ok: true, message: "课表已改名。" };
        }

        case "duplicate_timetable": {
          actions.duplicateTimetable(String(args.id));
          return { ok: true, message: "已复制这套课表。" };
        }

        case "delete_timetable": {
          const deleted = await actions.requestDeleteTimetable(String(args.id));
          return deleted
            ? { ok: true, message: "已删除这套课表。" }
            : fail("已取消删除课表。");
        }

        case "set_periods": {
          const periods = (args.periods as Array<{ index: number; start: string; end: string }>).map(
            (period) => ({ ...period }),
          ) as Period[];
          const profileId =
            typeof args.profileId === "string" ? args.profileId : timetable.periodProfileId;
          const periodProfiles = data.periodProfiles.map((profile) =>
            profile.id === profileId ? { ...profile, periods } : profile,
          );
          actions.saveSemester(
            { ...currentSemester, periods },
            profileId ?? null,
            periodProfiles,
            timetable.periodRules,
          );
          return { ok: true, message: `已把作息改为 ${periods.length} 节。` };
        }

        case "rename_period_profile": {
          actions.renamePeriodProfile(String(args.id), String(args.name));
          return { ok: true, message: "作息方案已重命名。" };
        }

        case "set_calendar_override": {
          const result = actions.setCalendarOverride(
            String(args.date),
            args.kind === "workday" ? "workday" : "holiday",
            typeof args.name === "string" ? args.name : "",
            typeof args.borrowFrom === "number" ? args.borrowFrom : null,
          );
          return result.ok
            ? { ok: true, message: "已更新这天的放假/补课安排。" }
            : fail(result.message);
        }

        case "delete_calendar_override": {
          actions.removeCalendarOverride(String(args.id));
          return { ok: true, message: "已删除这天的自定义安排。" };
        }

        case "update_reminders": {
          const current = loadReminderSettings();
          saveReminderSettings({
            ...current,
            ...(typeof args.enabled === "boolean" ? { enabled: args.enabled } : {}),
            ...(typeof args.leadMinutes === "number" ? { leadMinutes: args.leadMinutes } : {}),
            ...(typeof args.todaySummary === "boolean"
              ? { todaySummary: args.todaySummary }
              : {}),
            ...(typeof args.todaySummaryTime === "string"
              ? { todaySummaryTime: args.todaySummaryTime }
              : {}),
            ...(typeof args.tomorrowSummary === "boolean"
              ? { tomorrowSummary: args.tomorrowSummary }
              : {}),
            ...(typeof args.tomorrowSummaryTime === "string"
              ? { tomorrowSummaryTime: args.tomorrowSummaryTime }
              : {}),
            ...(typeof args.examReminders === "boolean"
              ? { examReminders: args.examReminders }
              : {}),
            ...(typeof args.taskReminders === "boolean"
              ? { taskReminders: args.taskReminders }
              : {}),
          });
          return { ok: true, message: "提醒设置已更新。" };
        }

        case "save_template": {
          const result = actions.saveCurrentAsTemplate(String(args.name));
          return result.ok ? { ok: true, message: result.message } : fail(result.message);
        }

        case "apply_template": {
          const template = loadTemplates().find((item) => item.id === args.id);
          if (!template) return fail("没有找到这个模板。");
          const result = actions.applyTemplate(template);
          return result.ok ? { ok: true, message: result.message } : fail(result.message);
        }

        case "delete_template": {
          actions.deleteTemplate(String(args.id));
          return { ok: true, message: "模板已删除。" };
        }

        case "export_data": {
          if (args.format === "ics") actions.exportIcs();
          else actions.exportJson();
          return { ok: true, message: `已导出 ${String(args.format).toUpperCase()} 文件。` };
        }

        case "sync_widget": {
          await syncAndroidWidget(data, prefs.autoHolidays);
          return {
            ok: true,
            message: nativeApp ? "桌面小组件已刷新。" : "当前是网页端，小组件只在安卓 App 内可用。",
          };
        }

        case "clear_scope": {
          switch (args.scope) {
            case "notes":
              if (!saveNotes(emptyNotes())) return fail("笔记清空失败。");
              break;
            case "tasks":
              if (!saveTasks(timetable.id, [])) return fail("任务清空失败。");
              break;
            case "exams":
              if (!saveExams(timetable.id, [])) return fail("考试清空失败。");
              break;
            case "grades":
              if (!saveGrades(timetable.id, [])) return fail("成绩清空失败。");
              break;
            case "planner":
              saveCatalog(createEmptyCatalog());
              saveStudyLogs([]);
              saveGapPreferences(DEFAULT_GAP_PREFERENCES);
              setGapPrefs(DEFAULT_GAP_PREFERENCES);
              break;
            case "woodfish":
              saveWoodfish(emptyWoodfish());
              break;
            default:
              return fail("未知的清空范围。");
          }
          return { ok: true, message: "已按范围清空。" };
        }

        case "update_gap_preferences": {
          const next: GapPreferences = {
            ...gapPrefs,
            ...(typeof args.walkSpeed === "number" ? { walkSpeed: args.walkSpeed } : {}),
            ...(typeof args.bufferMinutes === "number"
              ? { bufferMinutes: args.bufferMinutes }
              : {}),
            ...(typeof args.lunchEnabled === "boolean"
              ? { lunchEnabled: args.lunchEnabled }
              : {}),
            ...(typeof args.lunchStart === "string" ? { lunchStart: args.lunchStart } : {}),
            ...(typeof args.lunchEnd === "string" ? { lunchEnd: args.lunchEnd } : {}),
            ...(typeof args.lunchMinutes === "number"
              ? { lunchMinutes: args.lunchMinutes }
              : {}),
            ...(typeof args.accessMode === "boolean" ? { accessMode: args.accessMode } : {}),
            ...(typeof args.accessibleExtra === "number"
              ? { accessibleExtra: args.accessibleExtra }
              : {}),
            ...(args.aliases && typeof args.aliases === "object"
              ? { aliases: { ...gapPrefs.aliases, ...(args.aliases as Record<string, string>) } }
              : {}),
            ...(args.customWalks && typeof args.customWalks === "object"
              ? {
                  customWalks: {
                    ...gapPrefs.customWalks,
                    ...(args.customWalks as Record<string, number>),
                  },
                }
              : {}),
          };
          saveGapPreferences(next);
          setGapPrefs(next);
          return { ok: true, message: "空档偏好已更新。" };
        }

        case "add_catalog_section": {
          const section = createSection({
            name: String(args.name),
            credits: Number(args.credits),
            category: args.category as CourseCategory,
            day: Number(args.day),
            start: Number(args.start),
            end: Number(args.end),
            teacher: typeof args.teacher === "string" ? args.teacher : undefined,
            location: typeof args.location === "string" ? args.location : undefined,
            code: typeof args.code === "string" ? args.code : undefined,
            difficulty: typeof args.difficulty === "number" ? args.difficulty : undefined,
            examWeek: typeof args.examWeek === "number" ? args.examWeek : undefined,
            weekStart: typeof args.weekStart === "number" ? args.weekStart : undefined,
            weekEnd: typeof args.weekEnd === "number" ? args.weekEnd : undefined,
          });
          if (args.pattern === "odd" || args.pattern === "even") {
            section.meetings[0].pattern = args.pattern;
          }
          const catalog = loadCatalog();
          saveCatalog(withSectionAdded(withSectionsMerged(catalog, [section]), section.id));
          return { ok: true, message: `已把《${section.name}》加入选课池和当前方案。` };
        }

        case "update_catalog_section": {
          const catalog = loadCatalog();
          const target = catalog.sections.find((item) => item.id === args.id);
          if (!target) return fail("没有找到这个候选班次。");
          const next = catalog.sections.map((section) =>
            section.id === target.id
              ? {
                  ...section,
                  ...(typeof args.name === "string" ? { name: args.name } : {}),
                  ...(typeof args.credits === "number" ? { credits: args.credits } : {}),
                  ...(typeof args.category === "string"
                    ? { category: args.category as CourseCategory }
                    : {}),
                  ...(typeof args.teacher === "string" ? { teacher: args.teacher } : {}),
                  ...(typeof args.location === "string" ? { location: args.location } : {}),
                  ...(typeof args.code === "string" ? { code: args.code } : {}),
                  ...(typeof args.note === "string" ? { note: args.note } : {}),
                  ...(typeof args.difficulty === "number"
                    ? { difficulty: args.difficulty }
                    : {}),
                  ...(typeof args.examWeek === "number" ? { examWeek: args.examWeek } : {}),
                }
              : section,
          );
          saveCatalog({ ...catalog, sections: next });
          return { ok: true, message: "候选班次已更新。" };
        }

        case "delete_catalog_section": {
          saveCatalog(withSectionDeleted(loadCatalog(), String(args.id)));
          return { ok: true, message: "已从选课池删除这个班次。" };
        }

        case "select_catalog_section": {
          saveCatalog(withSectionAdded(loadCatalog(), String(args.id)));
          return { ok: true, message: "已加入当前选课方案。" };
        }

        case "unselect_catalog_section": {
          saveCatalog(withSectionRemoved(loadCatalog(), String(args.id)));
          return { ok: true, message: "已从当前选课方案移除。" };
        }

        case "create_selection_plan": {
          const catalog = loadCatalog();
          saveCatalog(withPlanCreated(catalog, String(args.name)));
          return { ok: true, message: `已新建选课方案《${args.name}》。` };
        }

        case "switch_selection_plan": {
          const catalog = loadCatalog();
          if (!catalog.plans.some((plan) => plan.id === args.id)) {
            return fail("没有找到这个选课方案。");
          }
          saveCatalog({ ...catalog, activePlanId: String(args.id) });
          return { ok: true, message: "已切换选课方案。" };
        }

        case "delete_selection_plan": {
          saveCatalog(withPlanRemoved(loadCatalog(), String(args.id)));
          return { ok: true, message: "选课方案已删除。" };
        }

        case "auto_combine_plan": {
          const catalog = loadCatalog();
          const ids = autoCombine(catalog.sections, {
            ...(typeof args.maxCredits === "number" ? { maxCredits: args.maxCredits } : {}),
            ...(typeof args.maxWeeklyPeriods === "number"
              ? { maxWeeklyPeriods: args.maxWeeklyPeriods }
              : {}),
            ...(Array.isArray(args.categories)
              ? { categories: args.categories as CourseCategory[] }
              : {}),
          });
          saveCatalog(withPlanSections(catalog, ids));
          return { ok: true, message: `已自动选中 ${ids.length} 个班次。` };
        }

        case "add_study_log": {
          const start = typeof args.start === "string" ? new Date(args.start) : new Date();
          const log: Omit<StudyLog, "id" | "createdAt"> = {
            subject: String(args.subject),
            minutes: Number(args.minutes),
            start: Number.isNaN(start.getTime()) ? new Date().toISOString() : start.toISOString(),
            kind:
              args.kind === "pomodoro" || args.kind === "review" ? args.kind : "manual",
            ...(typeof args.courseId === "string" ? { courseId: args.courseId } : {}),
            ...(typeof args.note === "string" ? { note: args.note } : {}),
          };
          saveStudyLogs(addStudyLog(loadStudyLogs(), log));
          return { ok: true, message: `已记录 ${log.minutes} 分钟学习。` };
        }

        case "update_ai_settings": {
          const current = loadAiSettings();
          const permissions =
            args.permissions && typeof args.permissions === "object"
              ? (args.permissions as Partial<typeof current.permissions>)
              : undefined;
          const next = {
            ...current,
            ...(typeof args.provider === "string"
              ? { provider: args.provider as "local" | "openai-compatible" }
              : {}),
            ...(typeof args.baseUrl === "string" ? { baseUrl: args.baseUrl } : {}),
            ...(typeof args.model === "string" ? { model: args.model } : {}),
            persona: {
              ...current.persona,
              ...(typeof args.personaName === "string" ? { name: args.personaName } : {}),
              ...(typeof args.tone === "string"
                ? { tone: args.tone as typeof current.persona.tone }
                : {}),
              ...(typeof args.customPrompt === "string"
                ? { customPrompt: args.customPrompt }
                : {}),
            },
            permissions: permissions
              ? { ...current.permissions, ...permissions }
              : current.permissions,
          };
          if (!saveAiSettings(next)) return fail("AI 设置保存失败。");
          return { ok: true, message: "AI 设置已更新（密钥未改动）。" };
        }

        case "add_memory": {
          const next = addAiMemory(loadAiMemory(), String(args.text));
          saveAiMemory(next);
          return { ok: true, message: "已加入长期记忆。" };
        }

        case "delete_memory": {
          saveAiMemory(removeAiMemory(loadAiMemory(), String(args.id)));
          return { ok: true, message: "已删除这条长期记忆。" };
        }

        case "clear_memory": {
          saveAiMemory(clearAiMemory(loadAiMemory()));
          return { ok: true, message: "长期记忆已清空。" };
        }

        case "tap_woodfish": {
          let stats = loadWoodfish();
          const times = typeof args.times === "number" ? args.times : 1;
          for (let index = 0; index < times; index += 1) {
            stats = tapWoodfish(stats);
          }
          saveWoodfish(stats);
          return { ok: true, message: `敲了 ${times} 下木鱼。` };
        }

        case "read_manual":
          return { ok: true, message: "手册内容已在对话中展示。" };

        default:
          return fail(`不支持的动作「${action}」。`);
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : "执行动作时出错。");
    }
  };

  const jumpToWeek = (nextWeek: number) => {
    view.goToWeek(nextWeek);
    setWeekPickerOpen(false);
  };

  const printTimetable = () => {
    setSettingsOpen(false);
    setDetailId(null);
    setEditorSeed(null);
    setEventSeed(null);
    window.setTimeout(() => window.print(), 150);
  };

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
        return;
      }
      if (event.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      if (document.querySelector("dialog[open]") || isTypingTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          const done = event.shiftKey ? store.redo() : store.undo();
          if (done) notify(event.shiftKey ? "已重做。" : "已撤销。");
          return;
        }
        if (key === "y") {
          event.preventDefault();
          if (store.redo()) notify("已重做。");
          return;
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setEditorSeed({});
        return;
      }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        setEventSeed({ date: dateKey(viewDates[view.selectedDay - 1] ?? now) });
        return;
      }
      if (page !== "timetable") return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        view.setWeek((current) => Math.max(1, current - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        view.setWeek((current) => Math.min(semester.totalWeeks, current + 1));
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        view.setWeek(view.currentWeek);
        view.setSelectedDay(
          viewDays.includes(view.todayNumber) ? view.todayNumber : viewDays[0] ?? 1,
        );
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [sidebarOpen, page, semester.totalWeeks, view, viewDates, viewDays, now, store.undo, store.redo, notify]);

  const setAutoHolidays = (value: boolean) => {
    store.setAutoHolidays(value);
    notify(value ? "已开启节假日与调休识别。" : "已关闭节假日识别。");
  };

  const paletteCommands: CommandItem[] = [
    { id: "go-timetable", group: "导航", label: "周课表", run: () => navigate("timetable") },
    { id: "go-agenda", group: "导航", label: "日程与单日", run: () => navigate("agenda") },
    {
      id: "go-gaps",
      group: "导航",
      label: "空档与规划",
      hint: "找空档、算步行",
      run: () => {
        setPlanTab("gaps");
        navigate("plan");
      },
    },
    {
      id: "go-study",
      group: "导航",
      label: "学习与统计",
      hint: "番茄钟、待办、热力图",
      run: () => {
        setPlanTab("study");
        navigate("plan");
      },
    },
    {
      id: "go-select",
      group: "导航",
      label: "选课规划",
      hint: "课程池与多方案",
      run: () => {
        setPlanTab("select");
        navigate("plan");
      },
    },
    {
      id: "go-notes",
      group: "导航",
      label: "笔记与看板",
      hint: "笔记、章节、链接导入",
      run: () => navigate("notes"),
    },
    {
      id: "go-ai",
      group: "导航",
      label: "AI 助手",
      hint: "对话、查课、授权",
      run: () => navigate("ai"),
    },
    { id: "go-courses", group: "导航", label: "课程库", run: () => navigate("courses") },
    { id: "go-profile", group: "导航", label: "我的", run: () => navigate("profile") },
    {
      id: "act-new-course",
      group: "操作",
      label: "新建课程",
      shortcut: "N",
      run: () => openEditor(),
    },
    {
      id: "act-new-event",
      group: "操作",
      label: "添加日程",
      shortcut: "E",
      run: () => openEventEditor({ date: dateKey(viewDates[selectedDay - 1] ?? now) }),
    },
    {
      id: "act-today",
      group: "操作",
      label: "回到今天",
      shortcut: "T",
      run: () => {
        setWeek(currentWeek);
        setSelectedDay(viewDays.includes(todayNumber) ? todayNumber : viewDays[0] ?? 1);
        navigate("timetable");
      },
    },
    { id: "act-theme", group: "操作", label: "切换主题", run: store.toggleTheme },
    { id: "act-settings", group: "操作", label: "打开设置", run: () => setSettingsOpen(true) },
    { id: "act-timetables", group: "操作", label: "管理课表", run: () => setTimetablesOpen(true) },
    { id: "act-print", group: "操作", label: "打印课表", run: printTimetable },
    ...courses.map((course) => ({
      id: `course-${course.id}`,
      group: "课程",
      label: course.name,
      hint: [course.teacher, course.location].filter(Boolean).join(" · "),
      run: () => openCourseDetail(course),
    })),
  ];

  return (
    <div className="app-shell">
      <Sidebar
        open={sidebarOpen}
        page={page}
        timetableName={timetable.name}
        timetableCount={data.timetables.length}
        semesterName={semester.name}
        currentWeek={view.currentWeek}
        totalWeeks={semester.totalWeeks}
        courseCount={courses.length}
        sessionCount={view.currentStats.sessionCount}
        agendaCount={view.weekEvents.length}
        theme={prefs.theme}
        onNavigate={navigate}
        onToggleTheme={store.toggleTheme}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setSidebarOpen(false);
        }}
        onManageTimetables={() => {
          setTimetablesOpen(true);
          setSidebarOpen(false);
        }}
      />
      {sidebarOpen ? (
        <button
          className="sidebar-scrim"
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="关闭导航"
        />
      ) : null}

      <div className="main-shell">
        <Topbar
          page={page}
          timetableName={timetable.name}
          semesterName={semester.name}
          week={view.week}
          theme={prefs.theme}
          storageOk={store.storageOk}
          onOpenMenu={() => setSidebarOpen(true)}
          onAddCourse={() => openEditor()}
          onAddEvent={() =>
            openEventEditor({ date: dateKey(viewDates[view.selectedDay - 1] ?? now) })
          }
          onOpenSettings={() => setSettingsOpen(true)}
          onManageTimetables={() => setTimetablesOpen(true)}
          onOpenWeekPicker={() => setWeekPickerOpen(true)}
          onToggleTheme={store.toggleTheme}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <main className="main">
          {page === "timetable" ? (
            <>
              <WeekHero
                week={view.week}
                currentWeek={view.currentWeek}
                totalWeeks={semester.totalWeeks}
                dates={viewDates}
                stats={viewStats}
                termState={view.termState}
                onPrev={() => view.goToWeek(view.week - 1)}
                onNext={() => view.goToWeek(view.week + 1)}
                onToday={view.goToday}
                onOpenWeekPicker={() => setWeekPickerOpen(true)}
              />

              <div className="content-grid content-grid--solo">
                <section
                  className="board"
                  aria-label="周课表"
                  style={wallpaperStyle(timetable.wallpaper, prefs.theme)}
                >
                  <div className="board-toolbar">
                    <div className="board-title">
                      {prefs.layout === "list" ? <List size={15} /> : <LayoutGrid size={15} />}
                      <span>{prefs.layout === "list" ? "周列表" : "周全网格"}</span>
                    </div>
                    <div className="board-toolbar-right">
                      <button
                        className="secondary-button board-import-button"
                        type="button"
                        onClick={() => setImportScheduleOpen(true)}
                        title="导入课表（图片 / Word / PDF / Excel / 文本 / ICS）"
                      >
                        <FileUp size={15} />
                        <span>导入课表</span>
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        disabled={!store.canUndo}
                        onClick={() => {
                          if (store.undo()) notify("已撤销。", "info");
                        }}
                        aria-label="撤销"
                        title="撤销（Ctrl/⌘+Z）"
                      >
                        <Undo2 size={17} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        disabled={!store.canRedo}
                        onClick={() => {
                          if (store.redo()) notify("已重做。", "info");
                        }}
                        aria-label="重做"
                        title="重做（Ctrl/⌘+Shift+Z）"
                      >
                        <Redo2 size={17} />
                      </button>
                      <span className="board-meta">
                        {viewStats.sessionCount} 节 · {viewStats.courseCount} 门
                      </span>
                      <button
                        className={`icon-button ${prefs.layout === "list" ? "is-toggled" : ""}`}
                        type="button"
                        onClick={() => store.setLayout(prefs.layout === "list" ? "grid" : "list")}
                        aria-label="切换周课表视图"
                        aria-pressed={prefs.layout === "list"}
                        title={prefs.layout === "list" ? "切换到网格视图" : "切换到列表视图"}
                      >
                        {prefs.layout === "list" ? <LayoutGrid size={17} /> : <List size={17} />}
                      </button>
                      <button
                        className={`icon-button ${prefs.showAliases ? "is-toggled" : ""}`}
                        type="button"
                        onClick={() => store.setShowAliases(!prefs.showAliases)}
                        aria-label="显示课程别名"
                        aria-pressed={prefs.showAliases}
                        title={prefs.showAliases ? "正在显示课程别名" : "显示课程别名"}
                      >
                        <Tag size={17} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => setWallpaperOpen(true)}
                        aria-label="更换课表壁纸"
                        title="更换课表壁纸"
                      >
                        <ImageIcon size={17} />
                      </button>
                      {!nativeApp ? (
                        <button
                          className="icon-button"
                          type="button"
                          onClick={printTimetable}
                          aria-label="打印当前课表"
                          title="打印当前课表"
                        >
                          <Printer size={17} />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {prefs.layout === "list" ? (
                    <TimetableList
                      semester={viewSemester}
                      week={view.week}
                      currentWeek={view.currentWeek}
                      dates={viewDates}
                      days={viewDays}
                      courses={courses}
                      sessions={viewSessions}
                      dayStatuses={view.viewDayStatuses}
                      calendarSummary={view.calendarSummary}
                      showAliases={prefs.showAliases}
                      now={now}
                      onSelectCourse={openCourseDetail}
                      onSessionMenu={(session) => setSessionMenu({ session, week: view.week })}
                      onAddAt={(day, start) => openEditor({ prefill: { day, start } })}
                      onAddCourse={() => openEditor()}
                    />
                  ) : (
                    <Timetable
                      semester={viewSemester}
                      week={view.week}
                      currentWeek={view.currentWeek}
                      dates={viewDates}
                      days={viewDays}
                      courses={courses}
                      sessions={viewSessions}
                      dayStatuses={view.viewDayStatuses}
                      calendarSummary={view.calendarSummary}
                      showAliases={prefs.showAliases}
                      now={now}
                      onSelectCourse={openCourseDetail}
                      onSessionMenu={(session) => setSessionMenu({ session, week: view.week })}
                      onMoveSlot={actions.moveCourseSlot}
                      onPrevWeek={() => view.goToWeek(view.week - 1)}
                      onNextWeek={() => view.goToWeek(view.week + 1)}
                      onAddAt={(day, start) => openEditor({ prefill: { day, start } })}
                      onAddCourse={() => openEditor()}
                    />
                  )}
                </section>
              </div>
            </>
          ) : page === "agenda" ? (
            <AgendaPage
              now={now}
              week={view.week}
              currentWeek={view.currentWeek}
              totalWeeks={semester.totalWeeks}
              semester={viewSemester}
              dates={viewDates}
              days={viewDays}
              sessions={viewSessions}
              selectedDay={view.selectedDay}
              selectedEvents={view.selectedEvents}
              weekEvents={view.weekEvents}
              dayStatuses={view.viewDayStatuses}
              currentDates={view.currentDates}
              currentSessions={view.currentSessions}
              currentPeriods={view.currentPeriods}
              currentStats={view.currentStats}
              currentDays={view.currentDays}
              currentDayStatuses={view.currentDayStatuses}
              todayNumber={view.todayNumber}
              todayEvents={view.todayEvents}
              showAliases={prefs.showAliases}
              tasks={loadTasks(timetable.id)}
              exams={loadExams(timetable.id)}
              onPrevWeek={() => view.goToWeek(view.week - 1)}
              onNextWeek={() => view.goToWeek(view.week + 1)}
              onToday={view.goToday}
              onSelectDay={view.setSelectedDay}
              onSelectCourse={openCourseDetail}
              onAddAt={(day, start) => openEditor({ prefill: { day, start } })}
              onAddEventAt={(date) => openEventEditor({ date: date || dateKey(now) })}
              onSelectEvent={(event) => openEventEditor({ event })}
              onToggleEventCheckIn={(event, date) =>
                actions.saveEvent(toggleEventCheckIn({ ...event, date: event.seriesDate }, date))
              }
            />
          ) : page === "plan" ? (
            <PlanPage
              tab={planTab}
              onChangeTab={setPlanTab}
              now={now}
              week={week}
              term={semester.name}
              dates={viewDates}
              periods={viewPeriods}
              sessions={viewSessions}
              todaySessions={currentSessions}
              todayPeriods={currentPeriods}
              courses={courses}
              events={events}
              preferences={gapPrefs}
              onChangePreferences={setGapPrefs}
              onSelectCourse={openCourseDetail}
              onAddCourse={() => openEditor()}
            />
          ) : page === "notes" ? (
            <NotesWorkspace courses={courses} onNotify={notify} />
          ) : page === "ai" ? (
            <AiWorkspace
              timetableId={timetable.id}
              timetable={timetable}
              timetables={data.timetables.map((item) => ({ id: item.id, name: item.name }))}
              periodProfiles={data.periodProfiles.map((item) => ({
                id: item.id,
                name: item.name,
              }))}
              courses={courses}
              events={events}
              semester={currentSemester}
              now={now}
              onRunAction={runAiAction}
              onNotify={notify}
            />
          ) : page === "profile" ? (
            <ProfilePage
              data={data}
              prefs={prefs}
              timetable={timetable}
              semester={semester}
              week={view.week}
              currentWeek={view.currentWeek}
              sessionCount={viewStats.sessionCount}
              eventCount={view.weekEvents.length}
              storageOk={store.storageOk}
              native={nativeApp}
              onOpenSettings={() => setSettingsOpen(true)}
              onManageTimetables={() => setTimetablesOpen(true)}
              onSwitchTimetable={actions.switchTimetable}
              onOpenWallpaper={() => setWallpaperOpen(true)}
              onChangeTheme={store.setTheme}
              onExportJson={actions.exportJson}
              onExportIcs={actions.exportIcs}
              onImportFile={actions.importFile}
              onPrint={printTimetable}
            />
          ) : (
            <CourseLibrary
              courses={courses}
              semester={viewSemester}
              showAliases={prefs.showAliases}
              hiddenCourseIds={
                new Set(
                  timetable.overrides
                    .filter((override) => override.action === "hide")
                    .map((override) => override.courseId),
                )
              }
              onAddCourse={() => openEditor()}
              onTextImport={() => setTextImportOpen(true)}
              onSelectCourse={openCourseDetail}
              onEditCourse={(course) => openEditor({ course })}
              onRestoreCourse={actions.restoreCourse}
            />
          )}

          <footer className="site-footer">
            <span>课序PLUS · 把一周，排成喜欢的样子。</span>
            <a href="https://github.com/ZKY-ai-ai/super-plus-schedule" target="_blank" rel="noreferrer">
              <ArrowUpRight size={14} />
              GitHub
            </a>
            <span className="footer-dot">·</span>
            <span>离线可用</span>
          </footer>
        </main>
      </div>

      {editorSeed ? (
        <CourseEditor
          key={editorSeed.course?.id ?? "new"}
          seed={editorSeed}
          semester={viewSemester}
          courses={courses}
          onClose={() => setEditorSeed(null)}
          onSave={handleSaveCourse}
        />
      ) : null}

      {detailCourse ? (
        <CourseDetail
          course={detailCourse}
          semester={viewSemester}
          overrides={timetable.overrides.filter(
            (override) => override.courseId === detailCourse.id,
          )}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setEditorSeed({ course: detailCourse });
          }}
          onDelete={() => handleDeleteCourse(detailCourse)}
          onRemoveOverride={actions.removeOverride}
        />
      ) : null}

      {importPreview ? (
        <ImportPreviewDialog
          draft={importPreview}
          currentTimetableCount={data.timetables.length}
          onReplace={() => {
            actions.replaceWithImport(importPreview);
            setImportPreview(null);
          }}
          onMerge={() => {
            const result = actions.mergeWithImport(importPreview);
            notify(result.message, result.ok ? "success" : "error");
            if (result.ok) setImportPreview(null);
          }}
          onKeepDraft={() => {
            const result = actions.saveDraftForLater(importPreview);
            notify(result.message, result.ok ? "success" : "info");
            setDraftRevision((value) => value + 1);
            setImportPreview(null);
          }}
        />
      ) : null}

      {textImportOpen ? (
        <TextImportDialog
          key={sharedCourseText || "text-import"}
          semester={viewSemester}
          initialText={sharedCourseText}
          onClose={() => {
            setTextImportOpen(false);
            setSharedCourseText("");
          }}
          onImport={(seeds) => {
            actions.addTextCourses(seeds);
            setTextImportOpen(false);
            setSharedCourseText("");
          }}
        />
      ) : null}

      {importScheduleOpen ? (
        <ImportScheduleDialog
          semester={viewSemester}
          onClose={() => setImportScheduleOpen(false)}
          onImport={(seeds) => {
            const added = actions.addTextCourses(seeds);
            setImportScheduleOpen(false);
            notify(`已导入 ${added.courses} 门课程、${added.slots} 个时段。`, "success");
          }}
          onOpenAiSettings={() => {
            setImportScheduleOpen(false);
            navigate("ai");
          }}
        />
      ) : null}

      {shareOpen ? (
        <TimetableShareDialog
          timetable={timetable}
          week={week}
          dateRange={formatWeekRange(viewDates)}
          weekDates={viewDates}
          days={viewDays}
          sessions={viewSessions}
          periods={viewPeriods}
          showAliases={prefs.showAliases}
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      {sessionMenu ? (
        <SessionOverrideDialog
          key={sessionMenu.session.id}
          session={sessionMenu.session}
          week={sessionMenu.week}
          periods={viewSemester.periods}
          overrides={timetable.overrides}
          showAliases={prefs.showAliases}
          onClose={() => setSessionMenu(null)}
          onCancelSession={() => {
            actions.cancelSession(sessionMenu.session, sessionMenu.week);
            setSessionMenu(null);
          }}
          onMoveSession={(toDay, toStart, toEnd) => {
            actions.moveSession(sessionMenu.session, sessionMenu.week, toDay, toStart, toEnd);
            setSessionMenu(null);
          }}
          onHideCourse={() => {
            actions.hideCourseFromWeek(sessionMenu.session.course.id, sessionMenu.week);
            setSessionMenu(null);
          }}
          onRestoreSession={() => {
            actions.restoreSession(sessionMenu.session, sessionMenu.week);
            setSessionMenu(null);
          }}
        />
      ) : null}

      {eventSeed ? (
        <EventEditor
          key={eventSeed.event?.id ?? `event-${eventSeed.date}`}
          seed={eventSeed}
          onClose={() => setEventSeed(null)}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsModal
          data={data}
          theme={prefs.theme}
          autoHolidays={prefs.autoHolidays}
          initialTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
          onSaveSemester={actions.saveSemester}
          onExportJson={actions.exportJson}
          onExportIcs={actions.exportIcs}
          onOpenImportSchedule={() => {
            setSettingsOpen(false);
            setImportScheduleOpen(true);
          }}
          onImportFile={actions.importFile}
          onApplyImportDraft={actions.applyImportDraft}
          onDiscardImportDraft={actions.discardImportDraft}
          onSaveTemplate={actions.saveCurrentAsTemplate}
          onApplyTemplate={actions.applyTemplate}
          onDeleteTemplate={actions.deleteTemplate}
          importDraftRevision={draftRevision}
          onPrint={printTimetable}
          onClearData={() => void actions.clearAll()}
          onToggleAutoHolidays={setAutoHolidays}
          onSetCalendarOverride={actions.setCalendarOverride}
          onRemoveCalendarOverride={actions.removeCalendarOverride}
          onRenameProfile={actions.renamePeriodProfile}
          onChangeTheme={store.setTheme}
          onOpenTimetableShare={() => {
            setSettingsOpen(false);
            setShareOpen(true);
          }}
          onImportCourseSeeds={actions.addTextCourses}
        />
      ) : null}

      {timetablesOpen ? (
        <TimetableManager
          data={data}
          onClose={() => setTimetablesOpen(false)}
          onSwitch={actions.switchTimetable}
          onCreate={actions.createTimetable}
          onRename={actions.renameTimetable}
          onDuplicate={actions.duplicateTimetable}
          onDelete={actions.requestDeleteTimetable}
        />
      ) : null}

      {weekPickerOpen ? (
        <WeekPickerModal
          week={view.week}
          currentWeek={view.currentWeek}
          totalWeeks={semester.totalWeeks}
          startDate={semester.startDate}
          weekStartsOn={semester.weekStartsOn ?? 1}
          onSelect={jumpToWeek}
          onClose={() => setWeekPickerOpen(false)}
        />
      ) : null}

      {wallpaperOpen ? (
        <WallpaperModal
          wallpaper={timetable.wallpaper}
          theme={prefs.theme}
          onClose={() => setWallpaperOpen(false)}
          onChange={actions.updateWallpaper}
        />
      ) : null}

      {confirmState ? (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          tone={confirmState.tone}
          onConfirm={() => settleConfirm(true)}
          onCancel={() => settleConfirm(false)}
        />
      ) : null}

      <Toast toast={toast} onClose={closeToast} />

      <CommandPalette
        open={paletteOpen}
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
      />

      {page === "timetable" ? <DesktopPet /> : null}

      {page === "timetable" && view.week !== view.currentWeek ? (
        <button className="week-back-fab" type="button" onClick={view.goToday}>
          <CalendarDays size={15} />
          回到本周
        </button>
      ) : null}

      <MobileTabBar page={page} onNavigate={navigate} />

      {page === "timetable" && courses.length > 0 ? (
        <button
          className="floating-add"
          type="button"
          onClick={() => openEditor()}
          aria-label="新建课程"
        >
          <Plus size={20} />
        </button>
      ) : null}
    </div>
  );
}
