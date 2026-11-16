import { useMemo, useState } from "react";
import { FileText, TriangleAlert } from "lucide-react";
import type { Semester } from "../types";
import { parseCourseText } from "../lib/textImport";
import type { ParsedCourseSeed } from "../lib/textImport";
import { weekdayLabel } from "../lib/date";
import { Modal } from "./Modal";

const SAMPLE = [
  "高等数学 周一 第1-2节 教一401 1-16周",
  "大学物理;周二、周四;3-4节;教二205;1-16周;@王老师",
  "英语 周三 第5-6节 外语楼302 1-16周 双周",
].join("\n");

interface TextImportDialogProps {
  semester: Semester;
  onClose: () => void;
  onImport: (seeds: ParsedCourseSeed[]) => void;
}

function slotLabel(slot: ParsedCourseSeed["slots"][number]): string {
  const periods =
    slot.start === slot.end ? `第 ${slot.start} 节` : `第 ${slot.start}–${slot.end} 节`;
  const weeks =
    slot.weekStart === slot.weekEnd
      ? `第 ${slot.weekStart} 周`
      : `第 ${slot.weekStart}–${slot.weekEnd} 周`;
  const pattern =
    slot.pattern === "odd" ? " · 单周" : slot.pattern === "even" ? " · 双周" : "";
  return `${weekdayLabel(slot.day)} ${periods} · ${weeks}${pattern}`;
}

export function TextImportDialog({ semester, onClose, onImport }: TextImportDialogProps) {
  const [text, setText] = useState("");
  const parsed = useMemo(
    () => parseCourseText(text, semester.totalWeeks),
    [text, semester.totalWeeks],
  );
  const totalSlots = parsed.courses.reduce((total, course) => total + course.slots.length, 0);

  return (
    <Modal
      className="text-import-modal"
      eyebrow="QUICK ADD"
      title="文本建课"
      onClose={onClose}
      footer={
        <>
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={parsed.courses.length === 0}
            onClick={() => onImport(parsed.courses)}
          >
            <FileText size={15} />
            加入课表
          </button>
        </>
      }
    >
      <p className="text-import-hint">
        每行一门课，写出课程名、星期、节次，可选周次、教室和老师。已存在的同名课程会自动合并时间段。
      </p>

      <label className="text-import-field">
        <span>课程文本</span>
        <textarea
          value={text}
          rows={7}
          spellCheck={false}
          placeholder={SAMPLE}
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="text-import-actions">
        <button
          className="ghost-button"
          type="button"
          onClick={() => setText(SAMPLE)}
        >
          填入示例
        </button>
        {text ? (
          <button className="ghost-button" type="button" onClick={() => setText("")}>
            清空
          </button>
        ) : null}
        <span className="text-import-summary">
          {parsed.courses.length} 门课程 · {totalSlots} 个时间段
        </span>
      </div>

      {parsed.errors.length > 0 ? (
        <ul className="text-import-errors">
          {parsed.errors.map((error) => (
            <li key={error}>
              <TriangleAlert size={13} />
              {error}
            </li>
          ))}
        </ul>
      ) : null}

      {parsed.courses.length > 0 ? (
        <ul className="text-import-preview">
          {parsed.courses.map((course) => (
            <li key={`${course.name}|${course.teacher}`}>
              <div className="text-import-course-head">
                <strong>{course.name}</strong>
                <span>
                  {[course.teacher ? `@${course.teacher}` : "", course.location]
                    .filter(Boolean)
                    .join(" · ") || "未填写老师和教室"}
                </span>
              </div>
              <div className="text-import-slots">
                {course.slots.map((slot) => (
                  <em key={slotLabel(slot)}>{slotLabel(slot)}</em>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}
