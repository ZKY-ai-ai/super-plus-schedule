import { useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  FileSpreadsheet,
  FileText,
  FileUp,
  Image as ImageIcon,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import type { Semester } from "../types";
import { loadAiSettings } from "../lib/ai";
import {
  AI_ATTACHMENT_ACCEPT,
  MAX_AI_ATTACHMENTS,
  MAX_AI_ATTACHMENT_IMAGES,
  attachmentKindLabel,
  classifyAttachment,
  createPendingAttachment,
  extractAiAttachment,
  formatAttachmentSize,
  type AiAttachment,
} from "../lib/aiAttachments";
import { weekdayLabel } from "../lib/date";
import {
  aiConvertAttachmentsToCourses,
  courseSeedsFromIcs,
  isAiImportReady,
  isIcsFile,
  mergeCourseSeeds,
} from "../lib/scheduleImport";
import type { ParsedCourseSeed } from "../lib/textImport";
import { Modal } from "./Modal";

interface ImportScheduleDialogProps {
  semester: Semester;
  onClose: () => void;
  onImport: (seeds: ParsedCourseSeed[]) => void;
  onOpenAiSettings?: () => void;
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

function attachmentIcon(kind: AiAttachment["kind"]) {
  if (kind === "image") return <ImageIcon size={14} />;
  if (kind === "spreadsheet") return <FileSpreadsheet size={14} />;
  return <FileText size={14} />;
}

export function ImportScheduleDialog({
  semester,
  onClose,
  onImport,
  onOpenAiSettings,
}: ImportScheduleDialogProps) {
  const [settings] = useState(() => loadAiSettings());
  const aiReady = isAiImportReady(settings);
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [seeds, setSeeds] = useState<ParsedCourseSeed[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const totalSlots = seeds.reduce((total, course) => total + course.slots.length, 0);

  const handleFiles = async (input: FileList | File[] | null | undefined) => {
    if (!input || busy) return;
    const list = Array.from(input);
    if (list.length === 0) return;
    const room = MAX_AI_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setNotice({ tone: "error", text: `一次最多 ${MAX_AI_ATTACHMENTS} 个文件，请先移除一些。` });
      return;
    }

    let images = attachments.filter((attachment) => attachment.kind === "image").length;
    let skippedFormat = 0;
    let skippedImages = 0;
    const accepted: File[] = [];
    for (const file of list) {
      if (accepted.length >= room) break;
      if (!aiReady && !isIcsFile(file.name)) {
        skippedFormat += 1;
        continue;
      }
      const kind = classifyAttachment(file.name, file.type);
      if (kind === "image") {
        if (images >= MAX_AI_ATTACHMENT_IMAGES) {
          skippedImages += 1;
          continue;
        }
        images += 1;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) {
      setNotice({
        tone: "error",
        text: aiReady
          ? "这些文件暂时不能导入，请换一个文件试试。"
          : "未接入 AI，只能导入 .ics 文件。接入 AI 后可用图片、Word、PDF、Excel、CSV、文本自动转换。",
      });
      return;
    }

    const pending = accepted.map((file) => createPendingAttachment(file));
    setAttachments((current) => [...current, ...pending]);
    setNotice(null);
    setBusy(true);
    setStage("正在本地解析文件…");

    const icsSeeds: ParsedCourseSeed[] = [];
    const aiAttachments: AiAttachment[] = [];
    const problems: string[] = [];

    await Promise.all(
      accepted.map(async (file, index) => {
        const base = pending[index];
        const done = await extractAiAttachment(file, {
          id: base.id,
          totalWeeks: semester.totalWeeks,
        });
        setAttachments((current) =>
          current.map((item) => (item.id === base.id ? done : item)),
        );
        if (done.status !== "ready") {
          problems.push(`${done.name}：${done.error ?? "读取失败"}`);
          return;
        }
        if (isIcsFile(done.name)) {
          try {
            icsSeeds.push(...courseSeedsFromIcs(await file.text(), semester));
          } catch {
            problems.push(`${done.name}：ICS 读取失败。`);
          }
          return;
        }
        aiAttachments.push(done);
      }),
    );

    let aiSeeds: ParsedCourseSeed[] = [];
    const aiNotes: string[] = [];
    if (aiAttachments.length > 0) {
      setStage("正在让 AI 转换课程…");
      const converted = await aiConvertAttachmentsToCourses(aiAttachments, settings, semester);
      aiSeeds = converted.seeds;
      aiNotes.push(...converted.notes);
    }

    const batch = mergeCourseSeeds([...icsSeeds, ...aiSeeds]);
    if (batch.length > 0) {
      setSeeds((current) => mergeCourseSeeds([...current, ...batch]));
    }

    if (skippedFormat > 0) {
      setNotice({
        tone: "error",
        text: `未接入 AI，已跳过 ${skippedFormat} 个非 ICS 文件；当前只能导入 .ics。`,
      });
    } else if (skippedImages > 0) {
      setNotice({
        tone: "error",
        text: `一次最多 ${MAX_AI_ATTACHMENT_IMAGES} 张图片，多出的 ${skippedImages} 张已跳过。`,
      });
    } else if (batch.length === 0) {
      setNotice({
        tone: "error",
        text: problems[0] ?? aiNotes[0] ?? "没有从文件里识别出课程，请检查文件内容。",
      });
    } else if (problems.length > 0 || aiNotes.length > 0) {
      setNotice({
        tone: "info",
        text: [...problems, ...aiNotes, `本次识别出 ${batch.length} 门课程。`].join(" "),
      });
    } else {
      setNotice({
        tone: "info",
        text: `已从 ${accepted.length} 个文件识别出 ${batch.length} 门课程。`,
      });
    }

    setBusy(false);
    setStage("");
  };

  const removeAttachment = (id: string) => {
    if (busy) return;
    setAttachments((current) => current.filter((item) => item.id !== id));
    if (seeds.length > 0) {
      setSeeds([]);
      setNotice({ tone: "info", text: "文件已移除，请重新拖入文件以重新识别课程。" });
    }
  };

  return (
    <Modal
      className="import-schedule-modal"
      eyebrow="SMART IMPORT"
      title="导入课表"
      onClose={onClose}
      footer={
        <>
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <span className="modal-foot-spacer" />
          <button
            className="primary-button"
            type="button"
            disabled={busy || seeds.length === 0}
            onClick={() => onImport(seeds)}
          >
            <FileUp size={15} />
            {seeds.length > 0 ? `导入 ${seeds.length} 门课程` : "导入课程"}
          </button>
        </>
      }
    >
      <div className={`import-schedule-status ${aiReady ? "is-ready" : ""}`}>
        <span className="import-schedule-status-icon" aria-hidden="true">
          {aiReady ? <Sparkles size={16} /> : <TriangleAlert size={16} />}
        </span>
        <div>
          <strong>{aiReady ? `AI 已就绪 · ${settings.model}` : "未接入 AI"}</strong>
          <span>
            {aiReady
              ? "支持图片、Word、PDF、Excel / CSV、文本和 ICS，拖入后由 AI 转换课程。"
              : "目前只能导入 .ics 文件。接入 AI 后，图片、Word、PDF、Excel / CSV、文本都能自动转换。"}
          </span>
        </div>
        {!aiReady && onOpenAiSettings ? (
          <button className="ghost-button" type="button" onClick={onOpenAiSettings}>
            去接入
          </button>
        ) : null}
      </div>

      <button
        className={`import-schedule-drop ${dragging ? "is-dragging" : ""}`}
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragEnter={(event: DragEvent<HTMLElement>) => {
          if (busy || !Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event: DragEvent<HTMLElement>) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event: DragEvent<HTMLElement>) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        disabled={busy}
      >
        {busy ? <LoaderCircle className="is-spinning" size={24} /> : <UploadCloud size={24} />}
        <strong>{busy ? stage : dragging ? "松开即可开始识别" : "拖入文件，或点击选择"}</strong>
        <span>
          {aiReady
            ? "图片 / Word / PDF / Excel / CSV / 文本 / ICS · 单个不超过 15 MB"
            : "未接入 AI 时只支持 .ics 文件"}
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept={aiReady ? AI_ATTACHMENT_ACCEPT : ".ics,text/calendar"}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void handleFiles(files);
        }}
      />

      {notice ? (
        <p className={`import-schedule-notice ${notice.tone === "error" ? "is-error" : ""}`}>
          {notice.text}
        </p>
      ) : null}

      {attachments.length > 0 ? (
        <ul className="import-schedule-files">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <span className="import-schedule-file-icon">{attachmentIcon(attachment.kind)}</span>
              <div>
                <strong>{attachment.name}</strong>
                <small>
                  {attachmentKindLabel(attachment.kind)} · {formatAttachmentSize(attachment.size)}
                  {attachment.status === "error"
                    ? ` · ${attachment.error ?? "读取失败"}`
                    : attachment.summary
                      ? ` · ${attachment.summary}`
                      : ""}
                </small>
              </div>
              {attachment.status === "reading" ? (
                <LoaderCircle className="is-spinning" size={14} />
              ) : (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`移除 ${attachment.name}`}
                  title="移除文件"
                  disabled={busy}
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {seeds.length > 0 ? (
        <ul className="text-import-preview">
          {seeds.map((course) => (
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

      {seeds.length > 0 ? (
        <p className="import-schedule-summary">
          共 {seeds.length} 门课程 · {totalSlots} 个时间段，导入后会与同名同老师的课程合并。
        </p>
      ) : null}
    </Modal>
  );
}
