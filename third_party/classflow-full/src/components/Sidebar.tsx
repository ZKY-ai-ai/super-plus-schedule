import {
  BookOpen,
  CalendarDays,
  Compass,
  Drum,
  LayoutGrid,
  Moon,
  NotebookPen,
  Settings2,
  Sparkles,
  Sun,
  Waves,
} from "lucide-react";
import type { AppPage, Theme } from "../types";
import { WhaleMascot } from "./WhaleMascot";

interface SidebarProps {
  open: boolean;
  page: AppPage;
  timetableName: string;
  timetableCount: number;
  semesterName: string;
  currentWeek: number;
  totalWeeks: number;
  courseCount: number;
  sessionCount: number;
  agendaCount: number;
  theme: Theme;
  onNavigate: (page: AppPage) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onManageTimetables: () => void;
}

export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span className="logo-cell" />
      <span className="logo-cell logo-cell--accent" />
      <span className="logo-cell logo-cell--soft" />
      <span className="logo-cell logo-cell--line" />
    </span>
  );
}

export function Sidebar({
  open,
  page,
  timetableName,
  timetableCount,
  semesterName,
  currentWeek,
  totalWeeks,
  courseCount,
  sessionCount,
  agendaCount,
  theme,
  onNavigate,
  onToggleTheme,
  onOpenSettings,
  onManageTimetables,
}: SidebarProps) {
  const progress = Math.min(100, Math.max(0, (currentWeek / Math.max(totalWeeks, 1)) * 100));

  return (
    <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="主导航">
      <div className="brand">
        <LogoMark />
        <div className="brand-copy">
          <span className="brand-name">课序PLUS</span>
          <span className="brand-en">CLASSFLOW</span>
        </div>
      </div>

      <section className="term-card" aria-label="当前课表">
        <button
          className="term-card-hit"
          type="button"
          onClick={onManageTimetables}
          aria-label={`管理课表：${timetableName}`}
          title="管理课表"
        />
        <div className="term-card-top">
          <span className="micro-label">TIMETABLE</span>
        </div>
        <div className="term-name-row">
          <h2>{timetableName}</h2>
          {timetableCount > 1 ? <span className="mini-tag">{timetableCount} 套</span> : null}
        </div>
        <p className="term-sub">{semesterName}</p>
        <div className="term-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="term-meta">
          <span>学期进度</span>
          <span>共 {totalWeeks} 周</span>
        </div>
      </section>

      <nav className="main-nav" aria-label="页面">
        <span className="nav-label">工作台</span>
        <button
          className={`nav-item ${page === "timetable" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("timetable")}
          aria-current={page === "timetable" ? "page" : undefined}
        >
          <LayoutGrid size={17} strokeWidth={1.8} />
          <span>周课表</span>
        </button>
        <button
          className={`nav-item ${page === "agenda" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("agenda")}
          aria-current={page === "agenda" ? "page" : undefined}
        >
          <CalendarDays size={17} strokeWidth={1.8} />
          <span>日程与单日</span>
          <span className="nav-count">{agendaCount}</span>
        </button>
        <button
          className={`nav-item ${page === "plan" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("plan")}
          aria-current={page === "plan" ? "page" : undefined}
        >
          <Compass size={17} strokeWidth={1.8} />
          <span>空档与规划</span>
        </button>
        <button
          className={`nav-item ${page === "notes" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("notes")}
          aria-current={page === "notes" ? "page" : undefined}
        >
          <NotebookPen size={17} strokeWidth={1.8} />
          <span>笔记与看板</span>
        </button>
        <button
          className={`nav-item ${page === "ai" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("ai")}
          aria-current={page === "ai" ? "page" : undefined}
        >
          <Sparkles size={17} strokeWidth={1.8} />
          <span>AI 助手</span>
        </button>
        <button
          className={`nav-item ${page === "courses" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("courses")}
          aria-current={page === "courses" ? "page" : undefined}
        >
          <BookOpen size={17} strokeWidth={1.8} />
          <span>课程库</span>
          <span className="nav-count">{courseCount}</span>
        </button>
      </nav>

      <nav className="main-nav main-nav--play" aria-label="游乐场">
        <span className="nav-label">游乐场</span>
        <button
          className={`nav-item ${page === "playground" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("playground")}
          aria-current={page === "playground" ? "page" : undefined}
        >
          <Waves size={17} strokeWidth={1.8} />
          <span>QQQ 游乐场</span>
        </button>
        <button
          className={`nav-item ${page === "woodfish" ? "is-active" : ""}`}
          type="button"
          onClick={() => onNavigate("woodfish")}
          aria-current={page === "woodfish" ? "page" : undefined}
        >
          <Drum size={17} strokeWidth={1.8} />
          <span>敲木鱼</span>
        </button>
      </nav>

      <div className="sidebar-stats" aria-label="本学期概览">
        <div>
          <strong>{courseCount}</strong>
          <span>门课程</span>
        </div>
        <span className="sidebar-stats-divider" />
        <div>
          <strong>{sessionCount}</strong>
          <span>节 / 本周</span>
        </div>
      </div>

      {theme === "whale" ? (
        <div className="whale-note">
          <WhaleMascot size={62} />
          <div>
            <strong>DeepSeek 鲸鱼娘</strong>
            <span>深海模式已开启，今天也要好好上课呀。</span>
          </div>
        </div>
      ) : null}

      <div className="sidebar-bottom">
        <div className="sidebar-actions">
          <button
            className="sidebar-icon-btn"
            type="button"
            onClick={onToggleTheme}
            aria-label="切换主题"
            title="切换主题"
          >
            {theme === "light" ? (
              <Moon size={16} />
            ) : theme === "dark" ? (
              <Waves size={16} />
            ) : (
              <Sun size={16} />
            )}
            <span>{theme === "light" ? "夜读" : theme === "dark" ? "鲸鱼娘" : "亮色"}</span>
          </button>
          <button className="sidebar-icon-btn" type="button" onClick={onOpenSettings} aria-label="打开设置">
            <Settings2 size={16} />
            <span>设置</span>
          </button>
        </div>
        <p className="local-note">
          <span className="status-dot" aria-hidden="true" />
          数据只保存在本机
        </p>
        <p className="sidebar-signature">把一周，排成喜欢的样子。</p>
      </div>
    </aside>
  );
}
