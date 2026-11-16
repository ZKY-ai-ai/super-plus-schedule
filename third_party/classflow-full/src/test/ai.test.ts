import { describe, expect, it } from "vitest";
import {
  AI_CHAT_KEY,
  AI_SETTINGS_KEY,
  appendChat,
  answerScheduleQuestion,
  buildAiContext,
  buildAiScheduleSnapshot,
  buildSystemPrompt,
  complete,
  createChatMessage,
  DEFAULT_AI_SETTINGS,
  describePermissions,
  loadAiSettings,
  loadChat,
  normalizeAiSettings,
  saveAiSettings,
  saveChat,
  type AiCompletionRequest,
  type AiSettings,
  type FetchLike,
} from "../lib/ai";
import { createNote } from "../lib/notes";
import type { Note } from "../lib/notes";
import { createPeriods, makeCourse, makeSlot } from "../lib/factory";
import type { Course, Semester } from "../types";
import { createMemoryStorage, fixedNow } from "./helpers";

const NOW = fixedNow("2026-11-16T08:30:00+08:00")();
const SEMESTER: Semester = {
  name: "2026 秋",
  startDate: "2026-09-07",
  totalWeeks: 20,
  showWeekends: true,
  periods: createPeriods(12),
};

const courses: Course[] = [
  makeCourse({
    id: "c-math",
    name: "高等数学 A（上）",
    teacher: "张明远",
    location: "教一 401",
    slots: [makeSlot({ day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16 })],
  }),
  makeCourse({
    id: "c-english",
    name: "大学英语 III",
    teacher: "李珂",
    location: "外语楼 302",
    slots: [makeSlot({ day: 1, start: 3, end: 4, weekStart: 12, weekEnd: 20 })],
  }),
  makeCourse({
    id: "c-ds",
    name: "数据结构与算法",
    teacher: "陈屿",
    location: "计算机楼 205",
    slots: [makeSlot({ day: 2, start: 5, end: 6, weekStart: 1, weekEnd: 16 })],
  }),
  makeCourse({
    id: "c-prob",
    name: "概率论与数理统计",
    teacher: "赵文清",
    location: "教一 302",
    slots: [makeSlot({ day: 3, start: 7, end: 8, weekStart: 1, weekEnd: 16 })],
  }),
];

const snapshot = buildAiScheduleSnapshot({
  courses,
  semester: SEMESTER,
  week: 11,
  now: NOW,
});

function baseSettings(patch: Partial<AiSettings> = {}): AiSettings {
  return normalizeAiSettings({
    ...DEFAULT_AI_SETTINGS,
    ...patch,
    persona: { ...DEFAULT_AI_SETTINGS.persona, ...(patch.persona ?? {}) },
    permissions: { ...DEFAULT_AI_SETTINGS.permissions, ...(patch.permissions ?? {}) },
  });
}

function userRequest(content: string, notes?: Note[]): AiCompletionRequest {
  return { messages: [createChatMessage("user", content, NOW)], snapshot, notes };
}

describe("schedule snapshot", () => {
  it("loads the current week and the next week with resolved times", () => {
    expect(snapshot.days).toHaveLength(14);
    expect(snapshot.week).toBe(11);
    expect(snapshot.days[0].date).toBe("2026-11-16");
    const monday = snapshot.days.find((day) => day.isToday);
    expect(monday?.weekday).toBe(1);
    expect(monday?.sessions[0].startTime).toBe("08:00");
    expect(monday?.sessions[0].endTime).toBe("09:40");
    expect(snapshot.days.some((day) => day.week === 12 && day.date === "2026-11-23")).toBe(true);
  });

  it("picks the next session that has not ended", () => {
    expect(snapshot.nextSession?.courseName).toBe("高等数学 A（上）");
    const later = buildAiScheduleSnapshot({
      courses,
      semester: SEMESTER,
      week: 11,
      now: new Date("2026-11-16T12:00:00+08:00"),
    });
    expect(later.nextSession?.courseName).toBe("数据结构与算法");
    expect(later.nextSession?.date).toBe("2026-11-17");
  });

  it("clamps the week into the semester range", () => {
    const late = buildAiScheduleSnapshot({
      courses,
      semester: { ...SEMESTER, totalWeeks: 10 },
      week: 19,
      now: NOW,
    });
    expect(late.week).toBe(10);
    expect([...new Set(late.days.map((day) => day.week))]).toEqual([10]);
  });
});

describe("natural-language schedule answers", () => {
  it("answers today and tomorrow", () => {
    const today = answerScheduleQuestion("今天有什么课", snapshot, NOW);
    expect(today.intent).toBe("today");
    expect(today.text).toContain("高等数学");
    const tomorrow = answerScheduleQuestion("明天几点上课", snapshot, NOW);
    expect(tomorrow.intent).toBe("tomorrow");
    expect(tomorrow.text).toContain("数据结构");
  });

  it("answers weekday questions including next week", () => {
    const wed = answerScheduleQuestion("周三有什么课", snapshot, NOW);
    expect(wed.intent).toBe("weekday");
    expect(wed.text).toContain("概率论");

    const nextMon = answerScheduleQuestion("下周一有课吗", snapshot, NOW);
    expect(nextMon.intent).toBe("weekday");
    expect(nextMon.text).toContain("大学英语");
    expect(nextMon.text).toContain("11月23日");
  });

  it("explains when a week is outside the loaded window", () => {
    const answer = answerScheduleQuestion("第18周有几节课", snapshot, NOW);
    expect(answer.intent).toBe("week");
    expect(answer.text).toContain("没有找到第 18 周");
  });

  it("answers the next session and what is left today", () => {
    const next = answerScheduleQuestion("下一节是什么", snapshot, NOW);
    expect(next.intent).toBe("next");
    expect(next.text).toContain("高等数学");

    const remaining = answerScheduleQuestion("今天还有几节课", snapshot, NOW);
    expect(remaining.intent).toBe("remaining");
    expect(remaining.text).toContain("还有 1 节");
  });

  it("answers course questions with a short alias", () => {
    const where = answerScheduleQuestion("高数在哪上", snapshot, NOW);
    expect(where.intent).toBe("course");
    expect(where.text).toContain("教一 401");
    const when = answerScheduleQuestion("英语什么时候上", snapshot, NOW);
    expect(when.text).toContain("11月23日");
  });

  it("answers counts and falls back gracefully", () => {
    const count = answerScheduleQuestion("这周一共几节课", snapshot, NOW);
    expect(count.intent).toBe("count");
    expect(count.text).toContain("4 门课");

    const unknown = answerScheduleQuestion("今天天气怎么样", snapshot, NOW);
    expect(unknown.intent).toBe("unknown");

    const exam = answerScheduleQuestion("下周有考试吗", snapshot, NOW);
    expect(exam.text).toContain("乙的泳道");
  });
});

describe("permissions and context", () => {
  const note = createNote(
    {
      title: "高数错题",
      body: "极限复习的三种解法，注意洛必达条件。",
      tags: ["数学", "复习"],
      courseId: "c-math",
    },
    NOW,
  );

  it("never leaks notes when the permission is off", () => {
    const context = buildAiContext({ snapshot, notes: [note] }, { ...DEFAULT_AI_SETTINGS.permissions });
    expect(context).toContain("【课表】");
    expect(context).not.toContain("高数错题");
    expect(context).not.toContain("洛必达");
  });

  it("shares titles only when noteTags is on", () => {
    const context = buildAiContext(
      { snapshot, notes: [note] },
      { ...DEFAULT_AI_SETTINGS.permissions, noteTags: true },
    );
    expect(context).toContain("高数错题");
    expect(context).toContain("#数学");
    expect(context).not.toContain("洛必达");
  });

  it("shares the body when notes is on", () => {
    const context = buildAiContext(
      { snapshot, notes: [note] },
      { ...DEFAULT_AI_SETTINGS.permissions, notes: true },
    );
    expect(context).toContain("洛必达");
  });

  it("describes each permission switch", () => {
    const items = describePermissions({ ...DEFAULT_AI_SETTINGS.permissions, notes: true });
    expect(items.map((item) => item.key)).toEqual([
      "schedule",
      "notes",
      "noteTags",
      "tasks",
      "exams",
    ]);
    expect(items.find((item) => item.key === "notes")?.enabled).toBe(true);
    expect(items.find((item) => item.key === "exams")?.enabled).toBe(false);
  });

  it("puts the persona and authorized context into the system prompt", () => {
    const prompt = buildSystemPrompt(
      baseSettings({ persona: { name: "阿序", tone: "concise", customPrompt: "少用感叹号" } }),
      { snapshot, notes: [note] },
    );
    expect(prompt).toContain("阿序");
    expect(prompt).toContain("不超过三句话");
    expect(prompt).toContain("少用感叹号");
    expect(prompt).toContain("高等数学");
    expect(prompt).not.toContain("洛必达");
  });
});

describe("settings and chat storage", () => {
  it("normalizes unsafe settings", () => {
    const settings = normalizeAiSettings({
      provider: "openai-compatible",
      baseUrl: "file:///etc/passwd",
      apiKey: "  sk-test  ",
      model: "",
      persona: { name: "  ", tone: "playful", customPrompt: 42 },
      permissions: { notes: true, noteTags: "yes" },
    });
    expect(settings.provider).toBe("openai-compatible");
    expect(settings.baseUrl).toBe(DEFAULT_AI_SETTINGS.baseUrl);
    expect(settings.apiKey).toBe("sk-test");
    expect(settings.model).toBe(DEFAULT_AI_SETTINGS.model);
    expect(settings.persona.name).toBe(DEFAULT_AI_SETTINGS.persona.name);
    expect(settings.persona.tone).toBe("playful");
    expect(settings.persona.customPrompt).toBe("");
    expect(settings.permissions.schedule).toBe(true);
    expect(settings.permissions.notes).toBe(true);
    expect(settings.permissions.noteTags).toBe(false);
  });

  it("round-trips settings and falls back on corrupt data", () => {
    const storage = createMemoryStorage();
    const saved = baseSettings({
      provider: "openai-compatible",
      baseUrl: "https://api.example.com/v1/",
      apiKey: "sk-1",
      permissions: { ...DEFAULT_AI_SETTINGS.permissions, notes: true },
    });
    expect(saveAiSettings(saved, storage)).toBe(true);
    expect(storage.getItem(AI_SETTINGS_KEY)).toBeTruthy();
    const loaded = loadAiSettings(storage);
    expect(loaded.baseUrl).toBe("https://api.example.com/v1");
    expect(loaded.permissions.notes).toBe(true);

    storage.setItem(AI_SETTINGS_KEY, "{oops");
    expect(loadAiSettings(storage).provider).toBe("local");
  });

  it("stores a bounded chat history", () => {
    const storage = createMemoryStorage();
    let chat = loadChat(storage, NOW);
    expect(chat.messages).toEqual([]);
    chat = appendChat(chat, createChatMessage("user", "你好", NOW), NOW);
    chat = appendChat(chat, createChatMessage("assistant", "在的", NOW), NOW);
    expect(saveChat(chat, storage)).toBe(true);
    expect(storage.getItem(AI_CHAT_KEY)).toBeTruthy();
    expect(loadChat(storage, NOW).messages).toHaveLength(2);

    storage.setItem(AI_CHAT_KEY, JSON.stringify({ version: 1, messages: "nope" }));
    expect(loadChat(storage, NOW).messages).toEqual([]);
  });
});

describe("local provider", () => {
  it("answers schedule questions without network access", async () => {
    const result = await complete(userRequest("高数在哪上"), baseSettings(), undefined, NOW);
    expect(result.provider).toBe("local");
    expect(result.content).toContain("教一 401");
  });

  it("respects the notes permission", async () => {
    const note = createNote(
      { title: "线代复习", body: "复习特征值与行列式", tags: ["数学"] },
      NOW,
    );
    const unrelated = createNote(
      { title: "英语课堂展示", body: "下周准备三分钟展示", tags: ["英语"] },
      NOW,
    );
    const denied = await complete(
      userRequest("帮我找一下复习笔记", [note, unrelated]),
      baseSettings({ permissions: { ...DEFAULT_AI_SETTINGS.permissions, notes: false } }),
      undefined,
      NOW,
    );
    expect(denied.content).not.toContain("线代复习");

    const allowed = await complete(
      userRequest("帮我找一下复习笔记", [note, unrelated]),
      baseSettings({ permissions: { ...DEFAULT_AI_SETTINGS.permissions, notes: true } }),
      undefined,
      NOW,
    );
    expect(allowed.content).toContain("线代复习");
    expect(allowed.content).not.toContain("英语课堂展示");
  });

  it("introduces itself with the configured persona", async () => {
    const result = await complete(
      userRequest("你是谁"),
      baseSettings({ persona: { name: "小鲸", tone: "playful", customPrompt: "" } }),
      undefined,
      NOW,
    );
    expect(result.content).toContain("小鲸");
  });
});

describe("OpenAI-compatible provider", () => {
  const remoteSettings = baseSettings({
    provider: "openai-compatible",
    baseUrl: "https://api.example.com/v1/",
    apiKey: "sk-test",
    model: "demo-model",
  });

  it("posts an authorized system prompt and the chat history", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content: "明天上午有课。" } }] }),
      } as unknown as Response;
    };
    const result = await complete(userRequest("明天有课吗"), remoteSettings, fetchImpl, NOW);
    expect(result.content).toBe("明天上午有课。");
    expect(result.error).toBeUndefined();
    expect(requests).toHaveLength(1);
    const [captured] = requests;
    expect(captured.url).toBe("https://api.example.com/v1/chat/completions");
    expect(captured.init?.method).toBe("POST");
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(captured.init?.body));
    expect(body.model).toBe("demo-model");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("高等数学");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "明天有课吗" });
  });

  it("returns readable errors instead of throwing", async () => {
    const noKey = await complete(
      userRequest("你好"),
      baseSettings({ provider: "openai-compatible", apiKey: "" }),
      undefined,
      NOW,
    );
    expect(noKey.error).toBe("missing-api-key");

    const unauthorized: FetchLike = async () =>
      ({ ok: false, status: 401, text: async () => "no" }) as unknown as Response;
    const http = await complete(userRequest("你好"), remoteSettings, unauthorized, NOW);
    expect(http.error).toBe("http-401");

    const broken: FetchLike = async () => {
      throw new Error("offline");
    };
    const network = await complete(userRequest("你好"), remoteSettings, broken, NOW);
    expect(network.error).toBe("network");
    expect(network.content).toContain("网络请求失败");
  });

  it("surfaces an empty response", async () => {
    const empty: FetchLike = async () =>
      ({ ok: true, status: 200, text: async () => "{}" }) as unknown as Response;
    const result = await complete(userRequest("你好"), remoteSettings, empty, NOW);
    expect(result.error).toBe("empty-content");
  });
});
