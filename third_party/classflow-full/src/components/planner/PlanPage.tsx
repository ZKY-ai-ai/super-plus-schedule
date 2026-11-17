import { Compass, GraduationCap, Timer } from "lucide-react";
import type { Course, Period, ScheduleEvent, Session } from "../../types";
import type { GapPreferences } from "../../lib/gaps";
import { GapBoard } from "./GapBoard";
import { SelectionBoard } from "./SelectionBoard";
import { StudyPanel } from "./StudyPanel";

interface PlanPageProps {
  tab: PlanTab;
  onChangeTab: (tab: PlanTab) => void;
  now: Date;
  week: number;
  term: string;
  dates: Date[];
  periods: Period[];
  sessions: Session[];
  todaySessions: Session[];
  todayPeriods: Period[];
  courses: Course[];
  events: ScheduleEvent[];
  preferences: GapPreferences;
  onChangePreferences: (preferences: GapPreferences) => void;
  onSelectCourse: (course: Course) => void;
  onAddCourse: () => void;
}

export type PlanTab = "gaps" | "study" | "select";

const TABS: Array<{ id: PlanTab; label: string; hint: string; icon: typeof Compass }> = [
  { id: "gaps", label: "空档与规划", hint: "找空档、算步行、定出发", icon: Compass },
  { id: "study", label: "学习与统计", hint: "番茄钟、待办、热力图", icon: Timer },
  { id: "select", label: "选课规划", hint: "课程池、多方案、冲突替代", icon: GraduationCap },
];

export function PlanPage({
  now,
  week,
  term,
  dates,
  periods,
  sessions,
  todaySessions,
  todayPeriods,
  courses,
  events,
  preferences,
  onChangePreferences,
  tab,
  onChangeTab,
  onSelectCourse,
  onAddCourse,
}: PlanPageProps) {
  return (
    <div className="plan-page">
      <nav className="plan-tabs" role="tablist" aria-label="规划页视图">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              className={active ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChangeTab(item.id)}
            >
              <span className="plan-tab-icon">
                <Icon size={16} />
              </span>
              <span className="plan-tab-copy">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          );
        })}
      </nav>

      {tab === "gaps" ? (
        <GapBoard
          now={now}
          week={week}
          dates={dates}
          periods={periods}
          sessions={sessions}
          onSelectCourse={onSelectCourse}
          onAddCourse={onAddCourse}
          preferences={preferences}
          onChangePreferences={onChangePreferences}
        />
      ) : tab === "study" ? (
        <StudyPanel
          now={now}
          week={week}
          term={term}
          todaySessions={todaySessions}
          todayPeriods={todayPeriods}
          weekSessions={sessions}
          weekPeriods={periods}
          weekDates={dates}
          courses={courses}
          events={events}
          preferences={preferences}
          onSelectCourse={onSelectCourse}
        />
      ) : (
        <SelectionBoard courses={courses} periods={periods} />
      )}
    </div>
  );
}
