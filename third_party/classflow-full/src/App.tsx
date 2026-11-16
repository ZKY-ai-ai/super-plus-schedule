import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Image as ImageIcon,
  LayoutGrid,
  Plus,
  Printer,
  Tag,
} from "lucide-react";
import type { AppPage, Course, ScheduleEvent } from "./types";
import { dateKey } from "./lib/date";
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
import { TimetableManager } from "./components/TimetableManager";
import { Toast } from "./components/Toast";
import type { ToastState } from "./components/Toast";
import { Topbar } from "./components/Topbar";
import { WallpaperModal } from "./components/WallpaperModal";
import { WeekHero } from "./components/WeekHero";
import { WeekPickerModal } from "./components/WeekPickerModal";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timetablesOpen, setTimetablesOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [editorSeed, setEditorSeed] = useState<EditorSeed | null>(null);
  const [eventSeed, setEventSeed] = useState<EventSeed | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  const confirmResolve = useRef<((value: boolean) => void) | null>(null);

  const { timetable, semester, courses, prefs, data } = store;
  const { viewDates, viewDays, viewSessions, viewStats, viewSemester } = view;
  const detailCourse = detailId ? courses.find((course) => course.id === detailId) ?? null : null;
  const nativeApp = isNativeApp();

  const notify = useCallback((message: string, tone: ToastState["tone"] = "success") => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, tone });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

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

  const actions = useScheduleActions({
    store,
    view,
    notify,
    askConfirm,
    onOpenTimetable,
    onSettingsClosed,
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
      if (event.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      if (document.querySelector("dialog[open]") || isTypingTarget(event.target)) return;
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
  }, [sidebarOpen, page, semester.totalWeeks, view, viewDates, viewDays, now]);

  const setAutoHolidays = (value: boolean) => {
    store.setAutoHolidays(value);
    notify(value ? "已开启节假日与调休识别。" : "已关闭节假日识别。");
  };

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
                      <LayoutGrid size={15} />
                      <span>周全网格</span>
                    </div>
                    <div className="board-toolbar-right">
                      <span className="board-meta">
                        {viewStats.sessionCount} 节 · {viewStats.courseCount} 门
                      </span>
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
                    onPrevWeek={() => view.goToWeek(view.week - 1)}
                    onNextWeek={() => view.goToWeek(view.week + 1)}
                    onAddAt={(day, start) => openEditor({ prefill: { day, start } })}
                    onAddCourse={() => openEditor()}
                  />
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
              onPrevWeek={() => view.goToWeek(view.week - 1)}
              onNextWeek={() => view.goToWeek(view.week + 1)}
              onToday={view.goToday}
              onSelectDay={view.setSelectedDay}
              onSelectCourse={openCourseDetail}
              onAddAt={(day, start) => openEditor({ prefill: { day, start } })}
              onAddEventAt={(date) => openEventEditor({ date: date || dateKey(now) })}
              onSelectEvent={(event) => openEventEditor({ event })}
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
              onAddCourse={() => openEditor()}
              onSelectCourse={openCourseDetail}
              onEditCourse={(course) => openEditor({ course })}
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
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setEditorSeed({ course: detailCourse });
          }}
          onDelete={() => handleDeleteCourse(detailCourse)}
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
          onPrint={printTimetable}
          onClearData={() => void actions.clearAll()}
          onToggleAutoHolidays={setAutoHolidays}
          onRenameProfile={actions.renamePeriodProfile}
          onChangeTheme={store.setTheme}
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
