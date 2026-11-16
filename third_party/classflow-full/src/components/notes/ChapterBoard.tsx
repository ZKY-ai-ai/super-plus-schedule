import { ExternalLink, FolderPlus, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { groupNotesByChapter } from "../../lib/notes";
import type { Note, NoteChapter, NotesData } from "../../lib/notes";
import type { CourseOption } from "./types";
import { excerptOf, formatNoteTime } from "./types";

interface ChapterBoardProps {
  data: NotesData;
  courses: CourseOption[];
  courseFilter: string;
  onMove: (noteId: string, chapterId: string | null) => void;
  onTogglePin: (id: string) => void;
  onOpenNote: (id: string) => void;
  onCreateNote: (chapter: NoteChapter | null) => void;
  onCreateChapter: (title: string, courseId: string | null) => void;
  onDeleteChapter: (chapter: NoteChapter) => void;
}

export function ChapterBoard({
  data,
  courses,
  courseFilter,
  onMove,
  onTogglePin,
  onOpenNote,
  onCreateNote,
  onCreateChapter,
  onDeleteChapter,
}: ChapterBoardProps) {
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterCourse, setChapterCourse] = useState(
    courseFilter !== "all" && courseFilter !== "none" ? courseFilter : "",
  );
  const scope =
    courseFilter === "all" ? {} : { courseId: courseFilter === "none" ? null : courseFilter };
  const groups = groupNotesByChapter(data.notes, data.chapters, scope);
  const courseNameById = Object.fromEntries(courses.map((course) => [course.id, course.name]));
  const totalNotes = groups.reduce((total, group) => total + group.notes.length, 0);

  const submitChapter = () => {
    const title = chapterTitle.trim();
    if (!title) return;
    onCreateChapter(title, chapterCourse || null);
    setChapterTitle("");
  };

  return (
    <div className="notes-board">
      <div className="notes-board-toolbar">
        <div>
          <h2>章节看板</h2>
          <p>按课程章节归档笔记，拖不动也没关系，用卡片上的下拉框移动。</p>
        </div>
        <span className="notes-board-count">{groups.length} 个章节 · {totalNotes} 条笔记</span>
      </div>

      <div className="notes-chapter-form">
        <input
          className="field-input"
          value={chapterTitle}
          onChange={(event) => setChapterTitle(event.target.value)}
          placeholder="新章节标题，例如：第一章 极限"
          maxLength={60}
          aria-label="新章节标题"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitChapter();
            }
          }}
        />
        <select
          className="field-input"
          value={chapterCourse}
          onChange={(event) => setChapterCourse(event.target.value)}
          aria-label="章节所属课程"
        >
          <option value="">未关联课程</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
        <button className="secondary-button" type="button" onClick={submitChapter} disabled={!chapterTitle.trim()}>
          <FolderPlus size={15} />
          新建章节
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="notes-board-empty">
          <p>还没有章节</p>
          <span>先建一个章节，再把笔记放进去。</span>
        </div>
      ) : (
        <div className="notes-board-scroll">
          {groups.map((group) => {
            const chapter = group.chapter;
            const title = chapter?.title ?? "未归档";
            const courseName = chapter?.courseId ? courseNameById[chapter.courseId] : undefined;
            return (
              <section className="notes-column" key={chapter?.id ?? "loose"} aria-label={title}>
                <header className="notes-column-head">
                  <div>
                    <h3>{title}</h3>
                    <span>
                      {group.notes.length} 条
                      {courseName ? ` · ${courseName}` : ""}
                    </span>
                  </div>
                  <div className="notes-column-actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => onCreateNote(chapter)}
                      aria-label={`在${title}新建笔记`}
                      title="新建笔记"
                    >
                      <Plus size={15} />
                    </button>
                    {chapter ? (
                      <button
                        className="icon-button notes-delete"
                        type="button"
                        onClick={() => onDeleteChapter(chapter)}
                        aria-label={`删除章节 ${title}`}
                        title="删除章节"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </header>

                <div className="notes-column-body">
                  {group.notes.length === 0 ? (
                    <p className="notes-column-empty">这一章还没有笔记。</p>
                  ) : (
                    group.notes.map((note: Note) => (
                      <article className="notes-board-card" key={note.id}>
                        <button
                          className="notes-board-card-title"
                          type="button"
                          onClick={() => onOpenNote(note.id)}
                        >
                          <span>{note.title}</span>
                          <ExternalLink size={13} />
                        </button>
                        {note.body ? <p>{excerptOf(note.body, 72)}</p> : null}
                        <div className="notes-board-card-meta">
                          {note.courseId && courseNameById[note.courseId] ? (
                            <span className="note-course-chip">{courseNameById[note.courseId]}</span>
                          ) : null}
                          {note.tags.map((tag) => (
                            <span className="note-tag note-tag--static" key={tag}>
                              #{tag}
                            </span>
                          ))}
                          <time dateTime={note.updatedAt}>{formatNoteTime(note.updatedAt)}</time>
                        </div>
                        <div className="notes-board-card-actions">
                          <button
                            className={`icon-button ${note.pinned ? "is-active" : ""}`}
                            type="button"
                            onClick={() => onTogglePin(note.id)}
                            aria-label={note.pinned ? "取消置顶" : "置顶笔记"}
                            title={note.pinned ? "取消置顶" : "置顶笔记"}
                          >
                            {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                          </button>
                          <label className="notes-move">
                            <span>移动到</span>
                            <select
                              className="field-input"
                              value={note.chapterId ?? ""}
                              onChange={(event) => onMove(note.id, event.target.value || null)}
                              aria-label={`移动 ${note.title}`}
                            >
                              <option value="">未归档</option>
                              {data.chapters
                                .filter((item) => item.id !== note.chapterId)
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.title}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
