import { Link2, Pin } from "lucide-react";
import type { NoteSearchHit } from "../../lib/notes";
import { formatNoteTime } from "./types";

interface NoteListProps {
  hits: NoteSearchHit[];
  selectedId: string | null;
  courseNameById: Record<string, string>;
  onSelect: (id: string) => void;
  onTagClick: (tag: string) => void;
}

export function NoteList({
  hits,
  selectedId,
  courseNameById,
  onSelect,
  onTagClick,
}: NoteListProps) {
  if (hits.length === 0) {
    return (
      <div className="notes-list-empty">
        <p>没有找到笔记</p>
        <span>试试别的关键词，或点右上角新建一条。</span>
      </div>
    );
  }

  return (
    <ul className="notes-list" aria-label="笔记列表">
      {hits.map(({ note, excerpt }) => {
        const courseName = note.courseId ? courseNameById[note.courseId] : undefined;
        return (
          <li key={note.id}>
            <article
              className={`note-card ${selectedId === note.id ? "is-active" : ""}`}
              role="button"
              tabIndex={0}
              aria-current={selectedId === note.id ? "true" : undefined}
              onClick={() => onSelect(note.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(note.id);
                }
              }}
            >
              <header className="note-card-head">
                <span className="note-card-title">
                  {note.pinned ? <Pin size={12} className="note-pin" aria-label="已置顶" /> : null}
                  {note.source === "link" ? <Link2 size={12} aria-hidden="true" /> : null}
                  <span>{note.title}</span>
                </span>
                <time dateTime={note.updatedAt}>{formatNoteTime(note.updatedAt)}</time>
              </header>
              {excerpt ? <p className="note-card-excerpt">{excerpt}</p> : null}
              <footer className="note-card-meta">
                {courseName ? <span className="note-course-chip">{courseName}</span> : null}
                {note.tags.length > 0 ? (
                  <span className="note-tag-row">
                    {note.tags.map((tag) => (
                      <button
                        key={tag}
                        className="note-tag"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onTagClick(tag);
                        }}
                        title={`筛选标签 #${tag}`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </span>
                ) : null}
              </footer>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
