import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link2,
  NotebookPen,
  Plus,
  Search,
  StickyNote,
} from "lucide-react";
import type { Course } from "../../types";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  allTags,
  createChapter,
  createNote,
  deleteChapter,
  deleteNote,
  linkNoteMarkdown,
  loadNotes,
  moveNoteToChapter,
  saveNotes,
  searchNotes,
  togglePin,
  updateNote,
  upsertChapter,
  upsertNote,
} from "../../lib/notes";
import type { NoteChapter, NotesData } from "../../lib/notes";
import { ChapterBoard } from "./ChapterBoard";
import { LinkImportDialog } from "./LinkImportDialog";
import { NoteEditor } from "./NoteEditor";
import { NoteList } from "./NoteList";
import { toFormState, toNotePatch } from "./types";
import type { CourseOption, NoteFormState } from "./types";
import "../../styles/notes.css";

interface NotesWorkspaceProps {
  courses: Course[];
  onNotify: (message: string, tone?: "success" | "error") => void;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

type NotesTab = "notes" | "board";

export function NotesWorkspace({ courses, onNotify }: NotesWorkspaceProps) {
  const [data, setData] = useState<NotesData>(() => loadNotes());
  const [tab, setTab] = useState<NotesTab>("notes");
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<NoteFormState>(() => toFormState(null));
  const [dirty, setDirty] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const saveFailed = useRef(false);
  const notifyRef = useRef(onNotify);
  notifyRef.current = onNotify;

  const courseOptions: CourseOption[] = useMemo(
    () => courses.map((course) => ({ id: course.id, name: course.name, tone: course.tone })),
    [courses],
  );
  const courseNameById = useMemo(
    () => Object.fromEntries(courses.map((course) => [course.id, course.name])),
    [courses],
  );
  const filterValue = courseFilter === "all" ? undefined : courseFilter === "none" ? null : courseFilter;
  const hits = useMemo(
    () =>
      searchNotes(data.notes, query, {
        courseId: filterValue,
        courseNameById,
        limit: 300,
      }),
    [data.notes, query, filterValue, courseNameById],
  );
  const tags = useMemo(() => allTags(data.notes), [data.notes]);
  const selected = data.notes.find((note) => note.id === selectedId) ?? null;

  useEffect(() => {
    const ok = saveNotes(data);
    if (!ok && !saveFailed.current) {
      saveFailed.current = true;
      notifyRef.current("笔记保存失败，浏览器存储可能已满。", "error");
    }
    if (ok) saveFailed.current = false;
  }, [data]);

  useEffect(() => {
    const note = data.notes.find((item) => item.id === selectedId) ?? null;
    setForm(toFormState(note));
    setDirty(false);
    // 只在切换笔记时重置表单，避免编辑过程中被外部更新打断。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (data.notes.length > 0) {
      setSelectedId(data.notes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCurrent = useCallback(
    (silent = false) => {
      if (!selected || !dirty) return;
      const updated = updateNote(selected, toNotePatch(form));
      setData((current) => upsertNote(current, updated));
      setDirty(false);
      if (!silent) notifyRef.current("笔记已保存。");
    },
    [selected, form, dirty],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveCurrent();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveCurrent]);

  const selectNote = (id: string) => {
    if (id === selectedId) return;
    saveCurrent(true);
    setSelectedId(id);
    setTab("notes");
  };

  const newNote = (chapter: NoteChapter | null = null) => {
    saveCurrent(true);
    const courseId =
      chapter?.courseId ??
      (courseFilter !== "all" && courseFilter !== "none" ? courseFilter : null);
    const note = createNote({ courseId, chapterId: chapter?.id ?? null });
    setData((current) => upsertNote(current, note));
    setSelectedId(note.id);
    setForm(toFormState(note));
    setDirty(false);
    setTab("notes");
    notifyRef.current("已新建一条笔记。");
  };

  const removeNote = () => {
    if (!selected) return;
    setConfirm({
      title: "删除这条笔记？",
      message: `“${selected.title}”将被永久删除，无法撤销。`,
      confirmLabel: "删除笔记",
      onConfirm: () => {
        setData((current) => deleteNote(current, selected.id));
        setSelectedId(null);
        setForm(toFormState(null));
        setDirty(false);
        setConfirm(null);
        notifyRef.current("笔记已删除。");
      },
    });
  };

  const pinNote = (id: string) => {
    setData((current) => togglePin(current, id));
  };

  const moveNote = (noteId: string, chapterId: string | null) => {
    setData((current) => moveNoteToChapter(current, noteId, chapterId));
  };

  const addChapter = (title: string, courseId: string | null) => {
    const order = data.chapters.reduce((max, chapter) => Math.max(max, chapter.order), 0) + 1;
    setData((current) =>
      upsertChapter(current, createChapter({ title, courseId, order })),
    );
    notifyRef.current("章节已创建。");
  };

  const requestDeleteChapter = (chapter: NoteChapter) => {
    setConfirm({
      title: `删除「${chapter.title}」？`,
      message: "章节里的笔记会回到「未归档」，笔记本身不会被删除。",
      confirmLabel: "删除章节",
      onConfirm: () => {
        setData((current) => deleteChapter(current, chapter.id));
        if (form.chapterId === chapter.id) {
          setForm((current) => ({ ...current, chapterId: "" }));
        }
        setConfirm(null);
        notifyRef.current("章节已删除，笔记已回到未归档。");
      },
    });
  };

  const copyLink = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(linkNoteMarkdown(selected));
      notifyRef.current("已复制 Markdown 链接。");
    } catch {
      notifyRef.current("复制失败，请手动选择链接。", "error");
    }
  };

  const saveLink = (input: { title: string; body: string; tags: string; url: string }) => {
    const note = createNote({
      title: input.title,
      body: input.body,
      tags: input.tags,
      url: input.url,
      source: "link",
    });
    setData((current) => upsertNote(current, note));
    setSelectedId(note.id);
    setForm(toFormState(note));
    setDirty(false);
    setLinkOpen(false);
    setTab("notes");
    notifyRef.current("学习链接已保存为笔记。");
  };

  const closeConfirm = () => setConfirm(null);

  return (
    <section className="notes-page">
      <header className="notes-hero">
        <div>
          <p className="eyebrow">NOTES & KNOWLEDGE</p>
          <h1>笔记与资料</h1>
          <p>把课堂摘要、课件链接和复习线索收在一起，考试周不用再翻聊天记录。</p>
        </div>
        <div className="notes-hero-actions">
          <button className="secondary-button" type="button" onClick={() => setLinkOpen(true)}>
            <Link2 size={15} />
            导入链接
          </button>
          <button className="primary-button" type="button" onClick={() => newNote()}>
            <Plus size={16} />
            新建笔记
          </button>
        </div>
      </header>

      <div className="notes-summary">
        <div>
          <StickyNote size={16} />
          <strong>{data.notes.length}</strong>
          <span>条笔记</span>
        </div>
        <div>
          <NotebookPen size={16} />
          <strong>{data.chapters.length}</strong>
          <span>个章节</span>
        </div>
        <div>
          <strong>{tags.length}</strong>
          <span>个标签</span>
        </div>
        <p>笔记独立保存在本机，清空课表不会影响这里。</p>
      </div>

      <nav className="notes-tabs" aria-label="笔记视图">
        <button
          className={tab === "notes" ? "is-active" : ""}
          type="button"
          onClick={() => setTab("notes")}
          aria-current={tab === "notes" ? "page" : undefined}
        >
          <StickyNote size={15} />
          笔记列表
        </button>
        <button
          className={tab === "board" ? "is-active" : ""}
          type="button"
          onClick={() => setTab("board")}
          aria-current={tab === "board" ? "page" : undefined}
        >
          <NotebookPen size={15} />
          章节看板
        </button>
      </nav>

      {tab === "notes" ? (
        <div className="notes-layout">
          <aside className="notes-list-pane" aria-label="笔记筛选与列表">
            <div className="notes-list-toolbar">
              <label className="notes-search">
                <Search size={15} />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索标题、正文或 #标签"
                  aria-label="搜索笔记"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label="清空搜索">
                    清空
                  </button>
                ) : null}
              </label>
              <select
                className="field-input notes-course-filter"
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
                aria-label="按课程筛选笔记"
              >
                <option value="all">全部课程</option>
                <option value="none">未关联课程</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="notes-list-count">
              {query || courseFilter !== "all" ? `${hits.length} 个结果` : `共 ${data.notes.length} 条`}
            </div>
            <NoteList
              hits={hits}
              selectedId={selectedId}
              courseNameById={courseNameById}
              onSelect={selectNote}
              onTagClick={(tag) => setQuery(`#${tag}`)}
            />
          </aside>

          <section className="notes-editor-pane" aria-label="笔记编辑">
            <NoteEditor
              note={selected}
              form={form}
              dirty={dirty}
              courses={courseOptions}
              chapters={data.chapters}
              onChange={(patch) => {
                setForm((current) => ({ ...current, ...patch }));
                setDirty(true);
              }}
              onSave={() => saveCurrent()}
              onDelete={removeNote}
              onTogglePin={() => selected && pinNote(selected.id)}
              onCopyLink={() => { void copyLink(); }}
            />
          </section>
        </div>
      ) : (
        <ChapterBoard
          data={data}
          courses={courseOptions}
          courseFilter={courseFilter}
          onMove={moveNote}
          onTogglePin={pinNote}
          onOpenNote={selectNote}
          onCreateNote={newNote}
          onCreateChapter={addChapter}
          onDeleteChapter={requestDeleteChapter}
        />
      )}

      {linkOpen ? (
        <LinkImportDialog onClose={() => setLinkOpen(false)} onSave={saveLink} />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={closeConfirm}
        />
      ) : null}
    </section>
  );
}
