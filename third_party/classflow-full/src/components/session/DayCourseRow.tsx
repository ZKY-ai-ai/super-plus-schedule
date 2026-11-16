import { ChevronRight, Clock, MapPin, User } from "lucide-react";
import type { CSSProperties } from "react";
import type { Period, Session } from "../../types";
import { toneColor } from "../../types";
import { courseDisplayName, formatWeeks } from "../../lib/schedule";

interface DayCourseRowProps {
  session: Session;
  periods: Period[];
  ongoing: boolean;
  showAliases?: boolean;
  onSelect: (session: Session) => void;
}

/** 单日列表里的课次行：时间、地点、教师与周次。 */
export function DayCourseRow({
  session,
  periods,
  ongoing,
  showAliases = false,
  onSelect,
}: DayCourseRowProps) {
  const start = periods[session.start - 1]?.start ?? "";
  const end = periods[session.end - 1]?.end ?? "";
  return (
    <button
      className={`day-course ${ongoing ? "is-ongoing" : ""}`}
      type="button"
      style={{ "--tone": toneColor(session.course.tone) } as CSSProperties}
      onClick={() => onSelect(session)}
    >
      <span className="day-course-time">
        <strong>{start}</strong>
        <span>{end}</span>
        <em>
          第 {session.start}
          {session.end !== session.start ? `–${session.end}` : ""} 节
        </em>
      </span>
      <span className="day-course-body">
        <span className="day-course-topline">
          <span className="day-course-name">
            {courseDisplayName(session.course, showAliases)}
          </span>
          {ongoing ? <span className="live-badge">进行中</span> : null}
        </span>
        <span className="day-course-details">
          {session.course.location ? (
            <span>
              <MapPin size={12} />
              {session.course.location}
            </span>
          ) : null}
          {session.course.teacher ? (
            <span>
              <User size={12} />
              {session.course.teacher}
            </span>
          ) : null}
          <span>
            <Clock size={12} />
            {formatWeeks(session.slot)}
          </span>
        </span>
      </span>
      <span className="day-course-more" aria-hidden="true">
        <ChevronRight size={16} />
      </span>
    </button>
  );
}
