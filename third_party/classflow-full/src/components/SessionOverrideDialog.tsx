import { useState } from "react";
import { CalendarClock, EyeOff, Undo2 } from "lucide-react";
import type { Period, Session, SessionOverride } from "../types";
import { WEEKDAYS, weekdayLabel } from "../lib/date";
import { courseDisplayName } from "../lib/schedule";
import { Modal } from "./Modal";

interface SessionOverrideDialogProps {
  session: Session;
  week: number;
  periods: Period[];
  overrides: SessionOverride[];
  showAliases: boolean;
  onClose: () => void;
  onCancelSession: () => void;
  onMoveSession: (toDay: number, toStart: number, toEnd: number) => void;
  onHideCourse: () => void;
  onRestoreSession: () => void;
}

export function SessionOverrideDialog({
  session,
  week,
  periods,
  overrides,
  showAliases,
  onClose,
  onCancelSession,
  onMoveSession,
  onHideCourse,
  onRestoreSession,
}: SessionOverrideDialogProps) {
  const [day, setDay] = useState(session.day);
  const [start, setStart] = useState(session.start);
  const [end, setEnd] = useState(session.end);
  const occurrence = overrides.find(
    (item) =>
      item.action !== "hide" &&
      item.courseId === session.course.id &&
      item.slotId === session.slot.id &&
      item.week === week,
  );
  const name = courseDisplayName(session.course, showAliases);

  const handleMove = () => {
    onMoveSession(day, Math.min(start, end), Math.max(start, end));
    onClose();
  };

  return (
    <Modal
      title={`调整第 ${week} 周的「${name}」`}
      eyebrow="ONE-OFF CHANGE"
      className="override-modal"
      onClose={onClose}
    >
      <p className="override-summary">
        这次改动只影响第 {week} 周 {weekdayLabel(session.day)} 第 {session.start}
        {session.end !== session.start ? `–${session.end}` : ""} 节的这一次课，其他周不变。
      </p>

      {occurrence ? (
        <p className="inline-notice inline-notice--info" role="status">
          这一次课已{occurrence.action === "cancel" ? "停课" : "调课"}，可以撤销。
        </p>
      ) : null}

      <div className="override-section">
        <span className="override-section-title">
          <CalendarClock size={15} />
          调到别的时间
        </span>
        <div className="override-move-grid">
          <label>
            <span>星期</span>
            <select value={day} onChange={(event) => setDay(Number(event.target.value))}>
              {WEEKDAYS.map((item) => (
                <option key={item.index} value={item.index}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>开始节次</span>
            <select value={start} onChange={(event) => setStart(Number(event.target.value))}>
              {periods.map((period) => (
                <option key={period.index} value={period.index}>
                  第 {period.index} 节
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>结束节次</span>
            <select value={end} onChange={(event) => setEnd(Number(event.target.value))}>
              {periods.map((period) => (
                <option key={period.index} value={period.index}>
                  第 {period.index} 节
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary-button override-move-button" type="button" onClick={handleMove}>
          保存这次调课
        </button>
      </div>

      <div className="override-actions">
        <button className="ghost-button" type="button" onClick={onCancelSession}>
          本节课停课
        </button>
        <button className="ghost-button" type="button" onClick={onHideCourse}>
          <EyeOff size={14} />
          从本周起隐藏
        </button>
        {occurrence ? (
          <button className="danger-ghost-button" type="button" onClick={onRestoreSession}>
            <Undo2 size={14} />
            撤销本次调整
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
