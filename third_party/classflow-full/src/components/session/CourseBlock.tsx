import type { CSSProperties } from "react";
import type { LaidOutSession } from "../../types";
import { toneColor } from "../../types";
import { formatWeeks } from "../../lib/schedule";

/** 周网格单行高度，空档/时间轴视图复用同一节奏。 */
export const GRID_ROW_HEIGHT = 58;

export function courseBlockStyle(session: LaidOutSession): CSSProperties {
  const top = (session.start - 1) * GRID_ROW_HEIGHT + 2;
  const height = (session.end - session.start + 1) * GRID_ROW_HEIGHT - 4;
  const left = `calc(${(session.column / session.columns) * 100}% + 3px)`;
  const width = `calc(${100 / session.columns}% - 6px)`;
  return {
    top,
    height,
    left,
    width,
    "--tone": toneColor(session.course.tone),
  } as CSSProperties;
}

interface CourseBlockProps {
  session: LaidOutSession;
  ongoing: boolean;
  onSelect: (session: LaidOutSession) => void;
}

/** 周网格里的课程块：负责并排冲突、进行中与周次信息。 */
export function CourseBlock({ session, ongoing, onSelect }: CourseBlockProps) {
  const conflict = session.columns > 1;
  const single = session.start === session.end;
  return (
    <button
      className={`course-block ${ongoing ? "is-ongoing" : ""} ${
        conflict ? "is-conflict" : ""
      } ${single ? "is-single" : ""}`}
      type="button"
      style={courseBlockStyle(session)}
      onClick={() => onSelect(session)}
      title={`${session.course.name}｜${session.course.location || "未填地点"}`}
    >
      <span className="course-block-top">
        <span className="course-block-name">{session.course.name}</span>
        {conflict ? (
          <span className="conflict-mark" title="时间冲突">
            !
          </span>
        ) : null}
        {ongoing && !conflict ? <span className="live-dot" /> : null}
      </span>
      <span className="course-block-meta">
        {session.course.location || "地点待定"}
      </span>
      {session.course.teacher ? (
        <span className="course-block-teacher">@{session.course.teacher}</span>
      ) : null}
      <span className="course-block-weeks">
        {formatWeeks(session.slot)} · 第 {session.start}
        {session.end !== session.start ? `–${session.end}` : ""} 节
      </span>
    </button>
  );
}
