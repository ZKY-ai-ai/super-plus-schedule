import { ArrowDownToLine, FileStack, GitMerge } from "lucide-react";
import type { ImportDraft } from "../types";
import { Modal } from "./Modal";

interface ImportPreviewDialogProps {
  draft: ImportDraft;
  currentTimetableCount: number;
  onReplace: () => void;
  onMerge: () => void;
  onKeepDraft: () => void;
}

export function ImportPreviewDialog({
  draft,
  currentTimetableCount,
  onReplace,
  onMerge,
  onKeepDraft,
}: ImportPreviewDialogProps) {
  const courseCount = draft.data.timetables.reduce(
    (total, timetable) => total + timetable.courses.length,
    0,
  );
  const eventCount = draft.data.timetables.reduce(
    (total, timetable) => total + timetable.events.length,
    0,
  );

  return (
    <Modal
      title="导入预览"
      eyebrow="IMPORT PREVIEW"
      className="import-preview-modal"
      onClose={onKeepDraft}
      footer={
        <>
          <button className="ghost-button" type="button" onClick={onKeepDraft}>
            留作草稿
          </button>
          <span className="modal-foot-spacer" />
          <button className="secondary-button" type="button" onClick={onMerge}>
            <GitMerge size={15} />
            合并到当前课表
          </button>
          <button className="primary-button" type="button" onClick={onReplace}>
            <ArrowDownToLine size={15} />
            替换全部课表
          </button>
        </>
      }
    >
      <p className="import-preview-file">
        <FileStack size={15} />
        <span>
          <strong>{draft.fileName}</strong>
          <small>{draft.message}</small>
        </span>
      </p>

      <ul className="import-preview-list">
        {draft.data.timetables.map((timetable) => {
          const slots = timetable.courses.reduce(
            (total, course) => total + course.slots.length,
            0,
          );
          return (
            <li key={timetable.id}>
              <div>
                <strong>{timetable.name}</strong>
                <small>
                  {timetable.semester.name} · {timetable.semester.totalWeeks} 周
                </small>
              </div>
              <span>
                {timetable.courses.length} 门课 · {slots} 个时间段
                {timetable.events.length > 0 ? ` · ${timetable.events.length} 条日程` : ""}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="import-preview-hint">
        文件里共有 {draft.data.timetables.length} 套课表、{courseCount} 门课程
        {eventCount > 0 ? `、${eventCount} 条日程` : ""}。 合并只会把课程和日程追加到当前课表，
        同名同老师的课程会跳过；替换会用文件内容完全覆盖当前的 {currentTimetableCount} 套课表。
      </p>
    </Modal>
  );
}
