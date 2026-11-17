import { describe, expect, it, vi } from "vitest";
import type { Semester } from "../types";
import { DEFAULT_AI_SETTINGS } from "../lib/ai";
import type { AiAttachment } from "../lib/aiAttachments";
import {
  aiConvertAttachmentsToCourses,
  courseSeedsFromIcs,
  isAiImportReady,
  mergeCourseSeeds,
} from "../lib/scheduleImport";

const semester: Semester = {
  name: "测试学期",
  startDate: "2026-08-31",
  totalWeeks: 20,
  showWeekends: true,
  weekStartsOn: 1,
  periods: [
    { index: 1, start: "08:00", end: "08:45" },
    { index: 2, start: "08:55", end: "09:40" },
    { index: 3, start: "10:00", end: "10:45" },
    { index: 4, start: "10:55", end: "11:40" },
  ],
};

function icsEvent(input: {
  title: string;
  start: string;
  end: string;
  location?: string;
  description: string;
}): string[] {
  return [
    "BEGIN:VEVENT",
    `SUMMARY:${input.title}`,
    `DTSTART;TZID=Asia/Shanghai:${input.start}`,
    `DTEND;TZID=Asia/Shanghai:${input.end}`,
    ...(input.location ? [`LOCATION:${input.location}`] : []),
    `DESCRIPTION:${input.description.replace(/\n/g, "\\n")}`,
    "END:VEVENT",
  ];
}

describe("schedule import", () => {
  it("only treats a remote provider with key and model as AI-ready", () => {
    expect(isAiImportReady(DEFAULT_AI_SETTINGS)).toBe(false);
    expect(
      isAiImportReady({
        ...DEFAULT_AI_SETTINGS,
        provider: "openai-compatible",
        apiKey: "",
      }),
    ).toBe(false);
    expect(
      isAiImportReady({
        ...DEFAULT_AI_SETTINGS,
        provider: "openai-compatible",
        apiKey: "sk-test",
      }),
    ).toBe(true);
    expect(
      isAiImportReady({
        ...DEFAULT_AI_SETTINGS,
        provider: "ollama",
        apiKey: "",
        model: "qwen2.5:7b",
      }),
    ).toBe(true);
    expect(
      isAiImportReady({
        ...DEFAULT_AI_SETTINGS,
        provider: "ollama",
        apiKey: "",
        model: "",
      }),
    ).toBe(false);
  });

  it("converts ICS events into course seeds with weeks and periods", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      ...icsEvent({
        title: "高等数学",
        start: "20260831T080000",
        end: "20260831T094000",
        location: "教一401",
        description: "高等数学\n教师：王老师\n第 1 周 · 第 1–2 节",
      }),
      ...icsEvent({
        title: "高等数学",
        start: "20260907T080000",
        end: "20260907T094000",
        location: "教一401",
        description: "高等数学\n教师：王老师\n第 2 周 · 第 1–2 节",
      }),
      ...icsEvent({
        title: "高等数学",
        start: "20260914T080000",
        end: "20260914T094000",
        location: "教一401",
        description: "高等数学\n教师：王老师\n第 3 周 · 第 1–2 节",
      }),
      ...icsEvent({
        title: "英语",
        start: "20260831T100000",
        end: "20260831T114000",
        description: "英语\n第 1 周 · 第 3–4 节",
      }),
      ...icsEvent({
        title: "英语",
        start: "20260914T100000",
        end: "20260914T114000",
        description: "英语\n第 3 周 · 第 3–4 节",
      }),
      "END:VCALENDAR",
    ].join("\r\n");

    const seeds = courseSeedsFromIcs(ics, semester);
    expect(seeds).toHaveLength(2);

    const math = seeds.find((seed) => seed.name === "高等数学");
    expect(math).toMatchObject({ teacher: "王老师", location: "教一401" });
    expect(math?.slots).toEqual([
      { day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 3, pattern: "all" },
    ]);

    const english = seeds.find((seed) => seed.name === "英语");
    expect(english?.slots).toEqual([
      { day: 1, start: 3, end: 4, weekStart: 1, weekEnd: 3, pattern: "odd" },
    ]);
  });

  it("maps ICS times to periods when the file has no period labels", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      ...icsEvent({
        title: "大学物理",
        start: "20260901T085500",
        end: "20260901T094000",
        location: "教二205",
        description: "大学物理\n第 2 周",
      }),
      "END:VCALENDAR",
    ].join("\r\n");

    const seeds = courseSeedsFromIcs(ics, semester);
    expect(seeds[0]).toMatchObject({ name: "大学物理", location: "教二205" });
    expect(seeds[0].slots[0]).toMatchObject({ day: 2, start: 2, end: 2, weekStart: 2 });
  });

  it("merges same course seeds and keeps distinct slots", () => {    const merged = mergeCourseSeeds([
      {
        name: "线性代数",
        teacher: "李老师",
        location: "",
        slots: [{ day: 2, start: 1, end: 2, weekStart: 1, weekEnd: 8, pattern: "all" }],
      },
      {
        name: "线性代数",
        teacher: "李老师",
        location: "教三101",
        slots: [
          { day: 2, start: 1, end: 2, weekStart: 1, weekEnd: 8, pattern: "all" },
          { day: 4, start: 3, end: 4, weekStart: 1, weekEnd: 8, pattern: "all" },
        ],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].location).toBe("教三101");
    expect(merged[0].slots).toHaveLength(2);
  });

  it("converts attachments through the AI action protocol", async () => {
    const content = [
      "已经整理好课程。",
      "```kexu-action",
      JSON.stringify([
        {
          action: "add_courses_from_text",
          args: { text: "AI转换课 周二 第3-4节 1-8周 地点：教十 @AI老师" },
        },
      ]),
      "```",
    ].join("\n");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const attachment: AiAttachment = {
      id: "att-1",
      name: "课表.txt",
      size: 12,
      mime: "text/plain",
      kind: "text",
      status: "ready",
      summary: "文本",
      text: "课表原始文本",
    };
    const settings = {
      ...DEFAULT_AI_SETTINGS,
      provider: "openai-compatible" as const,
      apiKey: "sk-test",
      model: "test-model",
    };
    const result = await aiConvertAttachmentsToCourses([attachment], settings, semester);
    vi.unstubAllGlobals();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.seeds).toHaveLength(1);
    expect(result.seeds[0]).toMatchObject({
      name: "AI转换课",
      teacher: "AI老师",
      location: "教十",
    });
    expect(result.seeds[0].slots[0]).toMatchObject({
      day: 2,
      start: 3,
      end: 4,
      weekStart: 1,
      weekEnd: 8,
    });
  });
});
