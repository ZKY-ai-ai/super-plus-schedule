import { describe, expect, it } from "vitest";
import {
  NOTES_STORAGE_KEY,
  allTags,
  createChapter,
  createNote,
  deleteChapter,
  deleteNote,
  emptyNotes,
  fetchLinkPreview,
  groupNotesByChapter,
  linkNoteMarkdown,
  linkTitleFromUrl,
  loadNotes,
  moveNoteToChapter,
  normalizeNotes,
  normalizeTags,
  parseFirstUrl,
  saveNotes,
  searchNotes,
  togglePin,
  updateNote,
  upsertChapter,
  upsertNote,
} from "../lib/notes";
import type { NotesData } from "../lib/notes";
import { createMemoryStorage } from "./helpers";

const T0 = new Date("2026-11-16T08:00:00.000Z");
const T1 = new Date("2026-11-16T09:00:00.000Z");
const T2 = new Date("2026-11-16T10:00:00.000Z");

describe("note model", () => {
  it("derives a title from the body and normalizes tags", () => {
    const note = createNote(
      { body: "  极限与导数\n第二行", tags: "#数学 复习 复习  " },
      T0,
    );
    expect(note.title).toBe("极限与导数");
    expect(note.tags).toEqual(["数学", "复习"]);
    expect(note.source).toBe("manual");
    expect(note.createdAt).toBe(T0.toISOString());
  });

  it("keeps at most eight unique tags and strips hashes", () => {
    const tags = normalizeTags("#A #a B C D E F G H I");
    expect(tags).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("updates fields, falls back to a body title and clears the url", () => {
    const linked = createNote({ title: "资料", url: "https://example.com/doc" }, T0);
    const cleared = updateNote(linked, { title: "", url: "", body: "新的正文" }, T1);
    expect(cleared.title).toBe("新的正文");
    expect(cleared.url).toBeUndefined();
    expect(cleared.source).toBe("manual");
    expect(cleared.updatedAt).toBe(T1.toISOString());
  });

  it("upserts, pins, deletes and rejects empty notes", () => {
    let data: NotesData = emptyNotes(T0);
    const first = createNote({ title: "A" }, T0);
    const second = createNote({ title: "B" }, T0);
    data = upsertNote(data, first, T0);
    data = upsertNote(data, second, T0);
    expect(data.notes.map((note) => note.title)).toEqual(["B", "A"]);

    data = togglePin(data, first.id, T1);
    expect(data.notes.find((note) => note.id === first.id)?.pinned).toBe(true);

    data = deleteNote(data, second.id, T2);
    expect(data.notes).toHaveLength(1);

    expect(normalizeNotes({ notes: [{ title: "", body: "" }] }, T0).notes).toHaveLength(0);
  });
});

describe("notes normalization and storage", () => {
  it("drops duplicates, invalid entries and dangling chapter references", () => {
    const data = normalizeNotes(
      {
        notes: [
          { id: "a", title: "线代", body: "矩阵", chapterId: "ch1", pinned: true },
          { id: "a", title: "重复" },
          { id: "b", title: "外链", url: "javascript:alert(1)" },
          { id: "c", title: "悬空章节", chapterId: "missing" },
        ],
        chapters: [{ id: "ch1", title: "第一章", order: 2 }],
      },
      T0,
    );
    expect(data.notes).toHaveLength(3);
    expect(data.notes.find((note) => note.id === "a")?.chapterId).toBe("ch1");
    expect(data.notes.find((note) => note.id === "b")?.url).toBeUndefined();
    expect(data.notes.find((note) => note.id === "c")?.chapterId).toBeNull();
  });

  it("round-trips through an injected storage and recovers from corrupt json", () => {
    const storage = createMemoryStorage();
    const note = createNote({ title: "存储测试", body: "正文" }, T0);
    const data = upsertNote(emptyNotes(T0), note, T0);
    expect(saveNotes(data, storage)).toBe(true);
    expect(loadNotes(storage).notes[0]?.title).toBe("存储测试");

    storage.setItem(NOTES_STORAGE_KEY, "{not json");
    expect(loadNotes(storage).notes).toHaveLength(0);
  });
});

describe("note search", () => {
  const data = normalizeNotes(
    {
      notes: [
        {
          id: "math",
          title: "高数笔记",
          body: "极限与导数，考试重点",
          tags: ["数学", "考试"],
          pinned: true,
          courseId: "c1",
          updatedAt: T2.toISOString(),
        },
        {
          id: "english",
          title: "英语作文",
          body: "作文模板与常用句型",
          tags: ["英语"],
          courseId: "c2",
          updatedAt: T1.toISOString(),
        },
        {
          id: "linear",
          title: "线代",
          body: "矩阵与线性变换",
          tags: ["数学"],
          courseId: "c1",
          updatedAt: T0.toISOString(),
        },
      ],
    },
    T0,
  );

  it("matches all terms across title, body and tags", () => {
    const hits = searchNotes(data.notes, "数学 导数");
    expect(hits.map((hit) => hit.note.id)).toEqual(["math"]);
    expect(hits[0].excerpt).toContain("导数");
  });

  it("supports tag filters, course-name filters and course scoping", () => {
    expect(searchNotes(data.notes, "#数学").map((hit) => hit.note.id)).toEqual(["math", "linear"]);
    const byCourse = searchNotes(data.notes, "课程:高等数学", {
      courseNameById: { c1: "高等数学 A" },
    });
    expect(byCourse).toHaveLength(2);
    expect(searchNotes(data.notes, "", { courseId: "c2" }).map((hit) => hit.note.id)).toEqual([
      "english",
    ]);
  });

  it("puts pinned notes first and respects the limit", () => {
    expect(searchNotes(data.notes, "")[0]?.note.id).toBe("math");
    expect(searchNotes(data.notes, "", { limit: 1 })).toHaveLength(1);
  });

  it("aggregates tags by frequency", () => {
    expect(allTags(data.notes)[0]).toEqual({ tag: "数学", count: 2 });
  });
});

describe("chapters and kanban", () => {
  it("moves notes between chapters and clears them when a chapter is deleted", () => {
    const chapter = createChapter({ title: "第一章 极限", courseId: "c1", order: 1 }, T0);
    const other = createChapter({ title: "第二章 导数", courseId: "c1", order: 2 }, T0);
    const note = createNote({ title: "极限定义", courseId: "c1" }, T0);
    let data: NotesData = emptyNotes(T0);
    data = { ...data, notes: [note] };
    data = upsertChapter(data, chapter, T0);
    data = upsertChapter(data, other, T0);
    data = moveNoteToChapter(data, note.id, chapter.id, T1);
    expect(data.notes[0].chapterId).toBe(chapter.id);

    data = moveNoteToChapter(data, note.id, "missing", T2);
    expect(data.notes[0].chapterId).toBeNull();

    data = moveNoteToChapter(data, note.id, chapter.id, T2);
    data = deleteChapter(data, chapter.id, T2);
    expect(data.chapters).toHaveLength(1);
    expect(data.notes[0].chapterId).toBeNull();
  });

  it("groups by chapter order and keeps an unsorted bucket", () => {
    const chapter = createChapter({ id: "ch", title: "章节", courseId: "c1", order: 1 }, T0);
    const note = createNote({ title: "已归档", courseId: "c1", chapterId: chapter.id }, T0);
    const loose = createNote({ title: "未归档", courseId: "c1" }, T1);
    const groups = groupNotesByChapter([loose, note], [chapter], { courseId: "c1" });
    expect(groups.map((group) => group.chapter?.id ?? null)).toEqual([chapter.id, null]);
    expect(groups[0].notes[0].id).toBe(note.id);
    expect(groups[1].notes[0].id).toBe(loose.id);
  });
});

describe("link import", () => {
  it("extracts the first http(s) url and rejects other protocols", () => {
    expect(parseFirstUrl("看这个 https://example.com/a/b?x=1。")).toBe(
      "https://example.com/a/b?x=1",
    );
    expect(parseFirstUrl("javascript:alert(1)")).toBeNull();
    expect(parseFirstUrl("没有链接")).toBeNull();
  });

  it("derives a readable title from the url", () => {
    expect(linkTitleFromUrl("https://www.example.com/linear-algebra_notes.html")).toBe(
      "linear algebra notes",
    );
    expect(linkTitleFromUrl("https://www.example.com/")).toBe("example.com");
  });

  it("parses open graph metadata", async () => {
    const html = `<html><head><title>备用标题</title>
      <meta content="线性代数讲义" property="og:title">
      <meta name="description" content="矩阵与特征值">
      <meta property="og:site_name" content="课程站">
      </head></html>`;
    const preview = await fetchLinkPreview(
      "https://example.com/doc",
      async () => new Response(html, { status: 200 }),
      100,
    );
    expect(preview.fetched).toBe(true);
    expect(preview.title).toBe("线性代数讲义");
    expect(preview.description).toBe("矩阵与特征值");
    expect(preview.siteName).toBe("课程站");
  });

  it("falls back when fetching fails or returns an error status", async () => {
    const blocked = await fetchLinkPreview(
      "https://example.com/notes/intro",
      async () => {
        throw new Error("cors");
      },
      100,
    );
    expect(blocked.fetched).toBe(false);
    expect(blocked.title).toBe("intro");
    expect(blocked.error).toContain("抓取失败");

    const notFound = await fetchLinkPreview(
      "https://example.com/x",
      async () => new Response("", { status: 404 }),
      100,
    );
    expect(notFound.error).toContain("404");
  });

  it("builds markdown for sharing", () => {
    const note = createNote(
      { title: "讲义 [PDF]", body: "重点看第三章", url: "https://example.com/doc" },
      T0,
    );
    expect(linkNoteMarkdown(note)).toBe(
      "[讲义 \\[PDF\\]](https://example.com/doc)\n\n重点看第三章",
    );
  });
});
