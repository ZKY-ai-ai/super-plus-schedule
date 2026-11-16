import { Check, Copy, ExternalLink, Link2, Pin, PinOff, Save, Trash2 } from "lucide-react";
import type { Note, NoteChapter } from "../../lib/notes";
import type { CourseOption, NoteFormState } from "./types";

interface NoteEditorProps {
  note: Note | null;
  form: NoteFormState;
  dirty: boolean;
  courses: CourseOption[];
  chapters: NoteChapter[];
  onChange: (patch: Partial<NoteFormState>) => void;
  onSave: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onCopyLink: () => void;
}

export function NoteEditor({
  note,
  form,
  dirty,
  courses,
  chapters,
  onChange,
  onSave,
  onDelete,
  onTogglePin,
  onCopyLink,
}: NoteEditorProps) {
  if (!note) {
    return (
      <div className="notes-editor-empty">
        <span className="notes-editor-mark">笔</span>
        <h2>选择一条笔记</h2>
        <p>从左侧挑一条，或者新建一条，把课堂上的想法先记下来。</p>
      </div>
    );
  }

  const chapterOptions = chapters.filter(
    (chapter) => !form.courseId || !chapter.courseId || chapter.courseId === form.courseId,
  );

  return (
    <div className="notes-editor">
      <header className="notes-editor-head">
        <div>
          <p className="eyebrow">NOTE</p>
          <div className="notes-editor-status">
            <span className={`notes-save-state ${dirty ? "is-dirty" : ""}`}>
              {dirty ? "有未保存修改" : <><Check size={12} /> 已保存</>}
            </span>
            <span className="notes-editor-time">更新于 {new Date(note.updatedAt).toLocaleString("zh-CN", { hour12: false })}</span>
          </div>
        </div>
        <div className="notes-editor-actions">
          <button
            className={`icon-button ${note.pinned ? "is-active" : ""}`}
            type="button"
            onClick={onTogglePin}
            aria-label={note.pinned ? "取消置顶" : "置顶笔记"}
            title={note.pinned ? "取消置顶" : "置顶笔记"}
          >
            {note.pinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
          {note.url ? (
            <button
              className="icon-button"
              type="button"
              onClick={onCopyLink}
              aria-label="复制链接"
              title="复制 Markdown 链接"
            >
              <Copy size={16} />
            </button>
          ) : null}
          <button className="icon-button notes-delete" type="button" onClick={onDelete} aria-label="删除笔记" title="删除笔记">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <input
        className="notes-title-input"
        value={form.title}
        onChange={(event) => onChange({ title: event.target.value })}
        placeholder="笔记标题"
        maxLength={120}
        aria-label="笔记标题"
      />

      <div className="notes-meta-row">
        <label className="notes-meta-field">
          <span>课程</span>
          <select
            className="field-input"
            value={form.courseId}
            onChange={(event) => {
              const courseId = event.target.value;
              const chapter = chapters.find((item) => item.id === form.chapterId);
              onChange({
                courseId,
                chapterId: chapter && chapter.courseId && chapter.courseId !== courseId ? "" : form.chapterId,
              });
            }}
          >
            <option value="">未关联课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>
        <label className="notes-meta-field">
          <span>章节</span>
          <select
            className="field-input"
            value={form.chapterId}
            onChange={(event) => onChange({ chapterId: event.target.value })}
          >
            <option value="">未归档</option>
            {chapterOptions.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title}
              </option>
            ))}
          </select>
        </label>
        <label className="notes-meta-field notes-meta-field--tags">
          <span>标签</span>
          <input
            className="field-input"
            value={form.tagsText}
            onChange={(event) => onChange({ tagsText: event.target.value })}
            placeholder="高数 复习 考试"
            maxLength={200}
          />
        </label>
      </div>

      {note.url ? (
        <a className="notes-link-chip" href={note.url} target="_blank" rel="noreferrer">
          <Link2 size={14} />
          <span>{note.url}</span>
          <ExternalLink size={13} />
        </a>
      ) : null}

      <textarea
        className="notes-body-input"
        value={form.body}
        onChange={(event) => onChange({ body: event.target.value })}
        placeholder="写下课堂摘要、公式推导、待办或复习提示…"
        rows={14}
        aria-label="笔记正文"
      />

      <footer className="notes-editor-foot">
        <span className="notes-editor-hint">支持 #标签 搜索，也可以按课程或章节筛选。</span>
        <button className="primary-button" type="button" onClick={onSave}>
          <Save size={15} />
          {dirty ? "保存笔记" : "已保存"}
        </button>
      </footer>
    </div>
  );
}
