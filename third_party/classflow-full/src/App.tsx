import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Plus,
  Printer,
  Redo2,
  Tag,
  Undo2,
} from "lucide-react";
import type { AppPage, Course, ImportDraft, ScheduleEvent, Session } from "./types";
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
import { ExcelImportDialog } from "./components/ExcelImportDialog";
import { DesktopPet } from "./components/DesktopPet";
import { EventEditor } from "./components/EventEditor";
import type { EventSeed } from "./components/EventEditor";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { Timetable } from "./components/Timetable";
import { ImportPreviewDialog } from "./components/ImportPreviewDialog";
import { SessionOverrideDialog } from "./components/SessionOverrideDialog";
import { TextImportDialog } from "./components/TextImportDialog";
import { ThirdPartyImportDialog } from "./components/ThirdPartyImportDialog";
import { ScreenshotImportDialog } from "./components/ScreenshotImportDialog";
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
import { loadGapPreferences, type GapPreferences } from "./lib/gaps";
import { loadTasks } from "./lib/tasks";
import { loadExams } from "./lib/exams";
import { toggleEventCheckIn } from "./lib/eventRepeat";

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "default";
}

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
  const [timetablesOpen, setTimetablesOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [editorSeed, setEditorSeed] = useState<EditorSeed | null>(null);
  const [eventSeed, setEventSeed] = useState<EventSeed | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sessionMenu, setSessionMenu] = useState<{ session: Session; week: number } | null>(null);
  const [textImportOpen, setTextImportOpen] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [thirdPartyImportOpen, setThirdPartyImportOpen] = useState(false);
  const [screenshotImportOpen, setScreenshotImportOpen] = useState(false);
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
              courses={courses}
              semester={currentSemester}
              now={now}
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
            <span>课序 · 把一周，排成喜欢的样子。</span>
            <a href="https://github.com/lcymxm/classflow" target="_blank" rel="noreferrer">
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

      {excelImportOpen ? (
        <ExcelImportDialog
          totalWeeks={semester.totalWeeks}
          onClose={() => setExcelImportOpen(false)}
          onImport={actions.addTextCourses}
        />
      ) : null}

      {thirdPartyImportOpen ? (
        <ThirdPartyImportDialog
          onClose={() => setThirdPartyImportOpen(false)}
          onPreview={actions.previewThirdParty}
        />
      ) : null}

      {screenshotImportOpen ? (
        <ScreenshotImportDialog
          totalWeeks={viewSemester.totalWeeks}
          onClose={() => setScreenshotImportOpen(false)}
          onImport={(seeds) => {
            actions.addTextCourses(seeds);
            setScreenshotImportOpen(false);
          }}
          onOpenAiSettings={() => {
            setScreenshotImportOpen(false);
            navigate("ai");
          }}
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
          onClose={() => setSettingsOpen(false)}
          onSaveSemester={actions.saveSemester}
          onExportJson={actions.exportJson}
          onExportIcs={actions.exportIcs}
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
          onOpenThirdPartyImport={() => {
            setSettingsOpen(false);
            setThirdPartyImportOpen(true);
          }}
          onOpenScreenshotImport={() => {
            setSettingsOpen(false);
            setScreenshotImportOpen(true);
          }}
          onOpenExcelImport={() => {
            setSettingsOpen(false);
            setExcelImportOpen(true);
          }}
          onOpenTimetableShare={() => {
            setSettingsOpen(false);
            setShareOpen(true);
          }}
          onRestoreWebDav={(next) =>
            actions.previewThirdParty(
              next,
              "WebDAV 备份.json",
              "已读取 WebDAV 备份，请选择替换或合并。",
            )
          }
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
