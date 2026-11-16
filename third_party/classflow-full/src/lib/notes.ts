/**
 * 丁 · 笔记与资料模块（F101 / F102 / F104 的纯逻辑层）
 *
 * 数据独立于课表备份：使用 kexu:notes:v1，清空课表不会误删笔记。
 * 所有读写函数都支持注入 StorageLike，便于在 node 环境做无副作用测试。
 */
import { uid } from "./factory";

export const NOTES_STORAGE_KEY = "kexu:notes:v1";
export const MAX_NOTES = 500;
export const MAX_CHAPTERS = 100;
export const MAX_TAGS = 8;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type NoteSource = "manual" | "link";

export interface Note {
  id: string;
  title: string;
  body: string;
  courseId: string | null;
  chapterId: string | null;
  tags: string[];
  pinned: boolean;
  source: NoteSource;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteChapter {
  id: string;
  courseId: string | null;
  title: string;
  order: number;
  createdAt: string;
}

export interface NotesData {
  version: 1;
  notes: Note[];
  chapters: NoteChapter[];
  updatedAt: string;
}

export interface NoteInput {
  title?: string;
  body?: string;
  courseId?: string | null;
  chapterId?: string | null;
  tags?: string[] | string;
  pinned?: boolean;
  source?: NoteSource;
  url?: string;
}

export type NotePatch = Partial<
  Pick<Note, "title" | "body" | "courseId" | "chapterId" | "tags" | "pinned" | "url">
>;

export interface NoteSearchHit {
  note: Note;
  score: number;
  excerpt: string;
}

export interface NoteSearchOptions {
  limit?: number;
  courseId?: string | null;
  courseNameById?: Record<string, string>;
}

export interface ChapterGroup {
  chapter: NoteChapter | null;
  notes: Note[];
}

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  siteName: string;
  fetched: boolean;
  error?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const NOTE_TITLE_MAX = 120;
const NOTE_BODY_MAX = 20_000;
const NOTE_URL_MAX = 2_000;
const CHAPTER_TITLE_MAX = 60;
const TAG_MAX = 24;
const URL_RE = /https?:\/\/[^\s<>"']+/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function singleLine(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function isoOr(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
}

function normalizeCourseId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null;
}

export function normalizeTags(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(/[,，、;；\s#]+/)
      : [];
  const tags: string[] = [];
  for (const item of raw) {
    const tag = item.trim().replace(/^#+/, "").toLocaleLowerCase().slice(0, TAG_MAX);
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.href.slice(0, NOTE_URL_MAX);
  } catch {
    return undefined;
  }
}

function fallbackTitle(body: string): string {
  const firstLine = body.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  return singleLine(firstLine, 48) || "未命名笔记";
}

function normalizeNote(value: unknown, nowIso: string): Note | null {
  if (!isRecord(value)) return null;
  const title = text(value.title, NOTE_TITLE_MAX);
  const body = text(value.body, NOTE_BODY_MAX);
  const url = normalizeUrl(value.url);
  const source: NoteSource = value.source === "link" || url ? "link" : "manual";
  if (!title && !body && !url) return null;
  return {
    id: text(value.id, 80) || uid("note"),
    title: title || fallbackTitle(body),
    body,
    courseId: normalizeCourseId(value.courseId),
    chapterId: typeof value.chapterId === "string" && value.chapterId.trim()
      ? value.chapterId.trim().slice(0, 80)
      : null,
    tags: normalizeTags(value.tags),
    pinned: value.pinned === true,
    source,
    ...(url ? { url } : {}),
    createdAt: isoOr(value.createdAt, nowIso),
    updatedAt: isoOr(value.updatedAt, nowIso),
  };
}

function normalizeChapter(value: unknown, nowIso: string): NoteChapter | null {
  if (!isRecord(value)) return null;
  const title = text(value.title, CHAPTER_TITLE_MAX);
  if (!title) return null;
  const order = Number(value.order);
  return {
    id: text(value.id, 80) || uid("chapter"),
    courseId: normalizeCourseId(value.courseId),
    title,
    order: Number.isFinite(order) ? Math.min(999, Math.max(0, Math.round(order))) : 0,
    createdAt: isoOr(value.createdAt, nowIso),
  };
}

export function emptyNotes(now = new Date()): NotesData {
  return {
    version: 1,
    notes: [],
    chapters: [],
    updatedAt: now.toISOString(),
  };
}

export function normalizeNotes(raw: unknown, now = new Date()): NotesData {
  const nowIso = now.toISOString();
  const candidate = isRecord(raw) && "data" in raw ? raw.data : raw;
  if (Array.isArray(candidate)) {
    return finalizeNotes({ notes: candidate, chapters: [] }, nowIso);
  }
  if (!isRecord(candidate)) return emptyNotes(now);
  return finalizeNotes(
    {
      notes: Array.isArray(candidate.notes) ? candidate.notes : [],
      chapters: Array.isArray(candidate.chapters) ? candidate.chapters : [],
    },
    nowIso,
  );
}

function finalizeNotes(
  input: { notes: unknown[]; chapters: unknown[] },
  nowIso: string,
): NotesData {
  const chapters: NoteChapter[] = [];
  const chapterIds = new Set<string>();
  for (const item of input.chapters.slice(0, MAX_CHAPTERS)) {
    const chapter = normalizeChapter(item, nowIso);
    if (!chapter || chapterIds.has(chapter.id)) continue;
    chapterIds.add(chapter.id);
    chapters.push(chapter);
  }
  chapters.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));

  const notes: Note[] = [];
  const noteIds = new Set<string>();
  for (const item of input.notes.slice(0, MAX_NOTES)) {
    const note = normalizeNote(item, nowIso);
    if (!note || noteIds.has(note.id)) continue;
    noteIds.add(note.id);
    if (note.chapterId && !chapterIds.has(note.chapterId)) note.chapterId = null;
    notes.push(note);
  }
  return {
    version: 1,
    notes,
    chapters,
    updatedAt: nowIso,
  };
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadNotes(
  storage: StorageLike | null = defaultStorage(),
  now = new Date(),
): NotesData {
  if (!storage) return emptyNotes(now);
  try {
    const raw = storage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return emptyNotes(now);
    return normalizeNotes(JSON.parse(raw), now);
  } catch {
    return emptyNotes(now);
  }
}

export function saveNotes(data: NotesData, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function createNote(input: NoteInput = {}, now = new Date()): Note {
  const timestamp = now.toISOString();
  const body = text(input.body, NOTE_BODY_MAX);
  const url = normalizeUrl(input.url);
  return {
    id: uid("note"),
    title: text(input.title, NOTE_TITLE_MAX) || fallbackTitle(body),
    body,
    courseId: normalizeCourseId(input.courseId),
    chapterId: typeof input.chapterId === "string" && input.chapterId.trim()
      ? input.chapterId.trim().slice(0, 80)
      : null,
    tags: normalizeTags(input.tags),
    pinned: input.pinned === true,
    source: input.source === "link" || url ? "link" : "manual",
    ...(url ? { url } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateNote(note: Note, patch: NotePatch, now = new Date()): Note {
  const body = patch.body === undefined ? note.body : text(patch.body, NOTE_BODY_MAX);
  const title = patch.title === undefined ? note.title : text(patch.title, NOTE_TITLE_MAX);
  const url = patch.url === undefined ? note.url : normalizeUrl(patch.url);
  const next: Note = {
    ...note,
    title: title || fallbackTitle(body),
    body,
    courseId: patch.courseId === undefined ? note.courseId : normalizeCourseId(patch.courseId),
    chapterId: patch.chapterId === undefined
      ? note.chapterId
      : typeof patch.chapterId === "string" && patch.chapterId.trim()
        ? patch.chapterId.trim().slice(0, 80)
        : null,
    tags: patch.tags === undefined ? note.tags : normalizeTags(patch.tags),
    pinned: patch.pinned === undefined ? note.pinned : patch.pinned,
    source: url ? "link" : note.source === "link" ? "manual" : note.source,
    updatedAt: now.toISOString(),
  };
  if (url) next.url = url;
  else delete next.url;
  return next;
}

export function upsertNote(data: NotesData, note: Note, now = new Date()): NotesData {
  const exists = data.notes.some((item) => item.id === note.id);
  const notes = exists
    ? data.notes.map((item) => (item.id === note.id ? note : item))
    : [note, ...data.notes].slice(0, MAX_NOTES);
  return { ...data, notes, updatedAt: now.toISOString() };
}

export function deleteNote(data: NotesData, id: string, now = new Date()): NotesData {
  return {
    ...data,
    notes: data.notes.filter((note) => note.id !== id),
    updatedAt: now.toISOString(),
  };
}

export function togglePin(data: NotesData, id: string, now = new Date()): NotesData {
  return {
    ...data,
    notes: data.notes.map((note) =>
      note.id === id ? { ...note, pinned: !note.pinned } : note,
    ),
    updatedAt: now.toISOString(),
  };
}

function courseToken(token: string): string | null {
  const match = /^课程[:：](.+)$/.exec(token);
  return match?.[1]?.trim() || null;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < 50) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function excerptFor(note: Note, tokens: string[]): string {
  const body = singleLine(note.body, 8000);
  if (!body) return "";
  const lower = body.toLocaleLowerCase();
  let hit = -1;
  for (const token of tokens) {
    const index = lower.indexOf(token);
    if (index !== -1 && (hit === -1 || index < hit)) hit = index;
  }
  if (hit === -1) {
    return body.length > 90 ? `${body.slice(0, 90)}…` : body;
  }
  const start = Math.max(0, hit - 30);
  const end = Math.min(body.length, hit + 60);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

export function searchNotes(
  notes: Note[],
  query: string,
  options: NoteSearchOptions = {},
): NoteSearchHit[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const hits: NoteSearchHit[] = [];

  for (const note of notes) {
    if (options.courseId !== undefined && note.courseId !== options.courseId) continue;
    const plainTokens: string[] = [];
    const titleLower = note.title.toLocaleLowerCase();
    const bodyLower = note.body.toLocaleLowerCase();
    const courseName = note.courseId
      ? options.courseNameById?.[note.courseId]?.toLocaleLowerCase() ?? ""
      : "";
    let score = 0;
    let matched = true;

    for (const token of tokens) {
      const wantedCourse = courseToken(token);
      if (token.startsWith("#")) {
        const tag = token.slice(1);
        if (tag && note.tags.includes(tag)) {
          score += 40;
          continue;
        }
        matched = false;
        break;
      }
      if (wantedCourse) {
        if (courseName.includes(wantedCourse)) {
          score += 35;
          continue;
        }
        matched = false;
        break;
      }
      plainTokens.push(token);
      let tokenScore = 0;
      if (titleLower === token) tokenScore = 100;
      else if (titleLower.includes(token)) tokenScore = 60;
      if (note.tags.some((tag) => tag === token)) tokenScore = Math.max(tokenScore, 45);
      const occurrences = countOccurrences(bodyLower, token);
      if (occurrences > 0) tokenScore = Math.max(tokenScore, 30 + Math.min(10, occurrences));
      if (tokenScore === 0) {
        matched = false;
        break;
      }
      score += tokenScore;
    }

    if (!matched) continue;
    if (note.pinned) score += 10;
    hits.push({ note, score, excerpt: excerptFor(note, plainTokens) });
  }

  hits.sort(
    (a, b) =>
      Number(b.note.pinned) - Number(a.note.pinned) ||
      b.score - a.score ||
      b.note.updatedAt.localeCompare(a.note.updatedAt),
  );
  const limit = options.limit ?? 100;
  return hits.slice(0, Math.max(1, limit));
}

export function allTags(notes: Note[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}

export function createChapter(
  input: { id?: string; title?: string; courseId?: string | null; order?: number } = {},
  now = new Date(),
): NoteChapter {
  const order = Number(input.order);
  return {
    id: input.id?.trim().slice(0, 80) || uid("chapter"),
    courseId: normalizeCourseId(input.courseId),
    title: text(input.title, CHAPTER_TITLE_MAX) || "未命名章节",
    order: Number.isFinite(order) ? Math.min(999, Math.max(0, Math.round(order))) : 0,
    createdAt: now.toISOString(),
  };
}

export function upsertChapter(data: NotesData, chapter: NoteChapter, now = new Date()): NotesData {
  const exists = data.chapters.some((item) => item.id === chapter.id);
  const chapters = exists
    ? data.chapters.map((item) => (item.id === chapter.id ? chapter : item))
    : [...data.chapters, chapter].slice(0, MAX_CHAPTERS);
  return { ...data, chapters, updatedAt: now.toISOString() };
}

export function deleteChapter(data: NotesData, id: string, now = new Date()): NotesData {
  return {
    ...data,
    chapters: data.chapters.filter((chapter) => chapter.id !== id),
    notes: data.notes.map((note) =>
      note.chapterId === id ? { ...note, chapterId: null } : note,
    ),
    updatedAt: now.toISOString(),
  };
}

export function moveNoteToChapter(
  data: NotesData,
  noteId: string,
  chapterId: string | null,
  now = new Date(),
): NotesData {
  const valid = chapterId && data.chapters.some((chapter) => chapter.id === chapterId)
    ? chapterId
    : null;
  return {
    ...data,
    notes: data.notes.map((note) =>
      note.id === noteId
        ? { ...note, chapterId: valid, updatedAt: now.toISOString() }
        : note,
    ),
    updatedAt: now.toISOString(),
  };
}

export function groupNotesByChapter(
  notes: Note[],
  chapters: NoteChapter[],
  options: { courseId?: string | null } = {},
): ChapterGroup[] {
  const scopedChapters = chapters
    .filter((chapter) => options.courseId === undefined || chapter.courseId === options.courseId)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  const sortNotes = (items: Note[]) =>
    [...items].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
    );
  const groups: ChapterGroup[] = scopedChapters.map((chapter) => ({
    chapter,
    notes: sortNotes(notes.filter((note) => note.chapterId === chapter.id)),
  }));
  const loose = notes.filter(
    (note) =>
      !note.chapterId &&
      (options.courseId === undefined || note.courseId === options.courseId),
  );
  if (loose.length > 0) groups.push({ chapter: null, notes: sortNotes(loose) });
  return groups;
}

/* ------------------------------ 链接（F104） ------------------------------ */

export function parseFirstUrl(value: string): string | null {
  const match = URL_RE.exec(value);
  if (!match) return null;
  let candidate = match[0].replace(/[),.;:!?，。；：！？）】」』]+$/u, "");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    candidate = parsed.href;
  } catch {
    return null;
  }
  return candidate.slice(0, NOTE_URL_MAX);
}

export function linkTitleFromUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) {
      const decoded = decodeURIComponent(last).replace(/\.(html?|php|aspx?)$/i, "");
      const cleaned = decoded.replace(/[-_+]+/g, " ").trim();
      if (cleaned) return cleaned.slice(0, 80);
    }
    return parsed.hostname.replace(/^www\./, "") || "未命名链接";
  } catch {
    return "未命名链接";
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code) || 32));
}

function metaContent(html: string, name: string): string {
  const quoted = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${quoted}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${quoted}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return singleLine(decodeEntities(match[1]), 240);
  }
  return "";
}

export async function fetchLinkPreview(
  url: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = 5_000,
): Promise<LinkPreview> {
  const safeUrl = parseFirstUrl(url) ?? normalizeUrl(url) ?? "";
  const fallback: LinkPreview = {
    url: safeUrl,
    title: safeUrl ? linkTitleFromUrl(safeUrl) : "未命名链接",
    description: "",
    siteName: "",
    fetched: false,
  };
  if (!safeUrl) {
    return { ...fallback, error: "仅支持 http/https 链接" };
  }

  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = setTimeout(() => controller?.abort(), Math.max(500, timeoutMs));
  try {
    const response = await fetchImpl(safeUrl, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) {
      return { ...fallback, error: `链接返回 ${response.status}` };
    }
    const html = (await response.text()).slice(0, 400_000);
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title =
      metaContent(html, "og:title") ||
      singleLine(decodeEntities(titleMatch?.[1] ?? ""), 120) ||
      fallback.title;
    return {
      url: safeUrl,
      title,
      description: metaContent(html, "og:description") || metaContent(html, "description"),
      siteName: metaContent(html, "og:site_name"),
      fetched: true,
    };
  } catch {
    return { ...fallback, error: "抓取失败，已保留链接与标题" };
  } finally {
    clearTimeout(timer);
  }
}

export function linkNoteMarkdown(note: Note): string {
  if (!note.url) return note.body;
  const label = note.title.replace(/[[\]]/g, "\\$&");
  const head = `[${label}](${note.url})`;
  return note.body.trim() ? `${head}\n\n${note.body}` : head;
}
