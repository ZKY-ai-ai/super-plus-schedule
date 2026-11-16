import { normalizeTags } from "../../lib/notes";
import type { Note, NotePatch } from "../../lib/notes";

export interface CourseOption {
  id: string;
  name: string;
  tone?: string;
}

export interface NoteFormState {
  title: string;
  body: string;
  tagsText: string;
  courseId: string;
  chapterId: string;
  url: string;
}

export function toFormState(note: Note | null): NoteFormState {
  if (!note) {
    return { title: "", body: "", tagsText: "", courseId: "", chapterId: "", url: "" };
  }
  return {
    title: note.title,
    body: note.body,
    tagsText: note.tags.join(" "),
    courseId: note.courseId ?? "",
    chapterId: note.chapterId ?? "",
    url: note.url ?? "",
  };
}

export function toNotePatch(form: NoteFormState): NotePatch {
  return {
    title: form.title,
    body: form.body,
    tags: normalizeTags(form.tagsText),
    courseId: form.courseId || null,
    chapterId: form.chapterId || null,
    url: form.url,
  };
}

export function formatNoteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return date.getFullYear() === now.getFullYear() ? `${month}月${day}日 ${time}` : `${date.getFullYear()}年${month}月${day}日`;
}

export function excerptOf(value: string, max = 80): string {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}
