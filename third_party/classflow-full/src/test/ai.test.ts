import { describe, expect, it } from "vitest";
import {
  AI_CHAT_KEY,
  AI_MEMORY_KEY,
  AI_PROVIDER_PRESETS,
  AI_SETTINGS_KEY,
  addMemory,
  appendChat,
  answerScheduleQuestion,
  buildAiContext,
  buildAiScheduleSnapshot,
  buildSystemPrompt,
  clearMemory,
  complete,
  createChatMessage,
  DEFAULT_AI_SETTINGS,
  DEFAULT_PERSONA,
  describePermissions,
  extractMemoryRequest,
  isValidAiBaseUrl,
  loadAiSettings,
  loadChat,
  loadMemory,
  normalizeAiSettings,
  normalizeMemory,
  providerPreset,
  removeMemory,
  saveAiSettings,
  saveChat,
  saveMemory,
  testAiConnection,
  updateMemory,
  validateAiSettings,
  type AiCompletionRequest,
  type AiMemoryData,
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
  weekStartsOn: 1,
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
    provider: "local",
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

    const nearly = answerScheduleQuestion("今天还剩几节", snapshot, NOW);
    expect(nearly.intent).toBe("remaining");
    expect(nearly.text).toContain("还有 1 节");

    const later = new Date("2026-11-16T20:00:00+08:00");
    const done = answerScheduleQuestion("今天还剩几节", snapshot, later);
    expect(done.intent).toBe("remaining");
    expect(done.text).toContain("上完");
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
    const context = buildAiContext(
      { snapshot, notes: [note] },
      { schedule: true, notes: false, noteTags: false, tasks: false, exams: false },
    );
    expect(context).toContain("【课表】");
    expect(context).not.toContain("高数错题");
    expect(context).not.toContain("洛必达");
  });

  it("shares titles only when noteTags is on", () => {
    const context = buildAiContext(
      { snapshot, notes: [note] },
      { ...DEFAULT_AI_SETTINGS.permissions, notes: false, noteTags: true },
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
    const items = describePermissions({ ...DEFAULT_AI_SETTINGS.permissions, exams: false });
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
      baseSettings({
        persona: { name: "阿序", tone: "concise", customPrompt: "少用感叹号" },
        permissions: { schedule: true, notes: false, noteTags: false, tasks: false, exams: false },
      }),
      { snapshot, notes: [note] },
    );
    expect(prompt).toContain("阿序");
    expect(prompt).toContain("不超过三句话");
    expect(prompt).toContain("少用感叹号");
    expect(prompt).toContain("高等数学");
    expect(prompt).not.toContain("洛必达");
  });

  it("shows every timetable with its id so actions can target them", () => {
    const context = buildAiContext(
      {
        snapshot,
        inventory: {
          timetables: [
            {
              id: "tt-main",
              name: "我的课表",
              semesterName: "2026 秋",
              courseCount: 4,
              eventCount: 1,
              active: true,
            },
            {
              id: "tt-old",
              name: "旧课表",
              semesterName: "2026 春",
              courseCount: 6,
              eventCount: 0,
              active: false,
            },
          ],
          events: [],
          grades: [],
          periodProfiles: [],
          templates: [],
          catalogSections: [],
          selectionPlans: [],
          chapters: [],
        },
      },
      DEFAULT_AI_SETTINGS.permissions,
    );
    expect(context).toContain("【课表清单】");
    expect(context).toContain("id=tt-main");
    expect(context).toContain("id=tt-old");
    expect(context).toContain("旧课表");
  });
});

describe("settings and chat storage", () => {
  it("normalizes unsafe settings", () => {
    const settings = normalizeAiSettings({
      provider: "custom",
      baseUrl: "file:///etc/passwd",
      apiKey: "  sk-test  ",
      model: "",
      persona: { name: "  ", tone: "playful", customPrompt: 42 },
      permissions: { notes: true, noteTags: "yes" },
    });
    expect(settings.provider).toBe("custom");
    expect(settings.baseUrl).toBe("https://api.openai.com/v1");
    expect(settings.apiKey).toBe("sk-test");
    expect(settings.model).toBe("gpt-4o-mini");
    expect(settings.persona.name).toBe(DEFAULT_AI_SETTINGS.persona.name);
    expect(settings.persona.tone).toBe("playful");
    expect(settings.persona.customPrompt).toBe("");
    expect(settings.permissions.schedule).toBe(true);
    expect(settings.permissions.notes).toBe(true);
    expect(settings.permissions.noteTags).toBe(true);
  });

  it("round-trips settings and falls back on corrupt data", () => {
    const storage = createMemoryStorage();
    const saved = baseSettings({
      provider: "custom",
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
    expect(loadAiSettings(storage).provider).toBe("ollama");
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

  it("keeps attachment metadata without storing file contents", () => {
    const storage = createMemoryStorage();
    const message = createChatMessage("user", "看看附件", NOW, [
      { name: "课表.xlsx", kind: "spreadsheet", size: 2048 },
      { name: "课表.png", kind: "image", size: 4096 },
    ]);
    expect(message.attachments).toEqual([
      { name: "课表.xlsx", kind: "spreadsheet", size: 2048 },
      { name: "课表.png", kind: "image", size: 4096 },
    ]);
    const chat = appendChat(loadChat(storage, NOW), message, NOW);
    expect(saveChat(chat, storage)).toBe(true);
    const reloaded = loadChat(storage, NOW);
    expect(reloaded.messages[0].attachments).toHaveLength(2);
    expect(JSON.stringify(reloaded)).not.toContain("data:image");
  });
});

describe("local provider", () => {
  it("answers schedule questions without network access", async () => {
    const result = await complete(userRequest("高数在哪上"), baseSettings(), undefined, NOW);
    expect(result.provider).toBe("local");
    expect(result.content).toContain("教一 401");
  });

  it("explains that images and attachments need the remote provider", async () => {
    const image = await complete(
      { ...userRequest("看看这张图"), images: ["data:image/png;base64,AAAA"] },
      baseSettings(),
      undefined,
      NOW,
    );
    expect(image.error).toBe("vision-requires-remote");
    expect(image.content).toContain("不能读图");

    const file = await complete(
      { ...userRequest("看看附件"), hasAttachments: true },
      baseSettings(),
      undefined,
      NOW,
    );
    expect(file.error).toBe("attachments-require-remote");
    expect(file.content).toContain("本地规则模式");
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
      baseSettings({ permissions: { ...DEFAULT_AI_SETTINGS.permissions, notes: false, noteTags: false } }),
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
    provider: "custom",
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

  it("raises the output budget and flags length-truncated replies", async () => {
    let body: { max_tokens: number } | null = null;
    const fetchImpl: FetchLike = async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ finish_reason: "length", message: { content: "前面这部分还在。" } }],
          }),
      } as unknown as Response;
    };
    const result = await complete(userRequest("把所有课列出来"), remoteSettings, fetchImpl, NOW);
    expect(body!.max_tokens).toBe(8000);
    expect(result.content).toBe("前面这部分还在。");
    expect(result.truncated).toBe(true);
  });

  it("sends image attachments as vision content parts", async () => {
    let body: {
      messages: Array<{ role: string; content: unknown }>;
      max_tokens: number;
    } | null = null;
    const fetchImpl: FetchLike = async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content: "看到课表了。" } }] }),
      } as unknown as Response;
    };
    const result = await complete(
      {
        ...userRequest("看看这张课表"),
        images: ["data:image/png;base64,AAAA"],
        hasAttachments: true,
      },
      remoteSettings,
      fetchImpl,
      NOW,
    );
    expect(result.content).toBe("看到课表了。");
    expect(body).not.toBeNull();
    const last = body!.messages.at(-1)!;
    expect(last.role).toBe("user");
    expect(Array.isArray(last.content)).toBe(true);
    const parts = last.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts[0]).toEqual({ type: "text", text: "看看这张课表" });
    expect(parts[1].type).toBe("image_url");
    expect(parts[1].image_url?.url).toBe("data:image/png;base64,AAAA");
    expect(body!.max_tokens).toBe(6000);
  });

  it("returns readable errors instead of throwing", async () => {
    const noKey = await complete(
      userRequest("你好"),
      baseSettings({ provider: "deepseek", apiKey: "" }),
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
    expect(network.error).toBe("network-fallback");
    expect(network.provider).toBe("local");
    expect(network.content).toContain("模型连不上");
  });

  it("surfaces an empty response", async () => {
    const empty: FetchLike = async () =>
      ({ ok: true, status: 200, text: async () => "{}" }) as unknown as Response;
    const result = await complete(userRequest("你好"), remoteSettings, empty, NOW);
    expect(result.error).toBe("empty-content");
  });

  it("retries images with a lean vision request when the full prompt fails", async () => {
    const bodies: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: { message: "context too long" } }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: "图片里是周三的课。" } }] }),
      } as unknown as Response;
    };
    const result = await complete(
      {
        ...userRequest("看看这张课表"),
        images: ["data:image/png;base64,AAAA"],
        hasAttachments: true,
      },
      remoteSettings,
      fetchImpl,
      NOW,
    );
    expect(result.error).toBeUndefined();
    expect(result.content).toBe("图片里是周三的课。");
    expect(bodies).toHaveLength(2);
    expect(bodies[1].messages).toHaveLength(2);
    expect(String(bodies[1].messages[0].content)).not.toContain("【手册目录】");
    expect(Array.isArray(bodies[1].messages[1].content)).toBe(true);
  });

  it("reports provider errors returned with HTTP 200", async () => {
    const providerError: FetchLike = async () =>
      ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            error: { message: "model does not support image input", code: "invalid_request" },
          }),
      }) as unknown as Response;
    const result = await complete(
      {
        ...userRequest("看看这张课表"),
        images: ["data:image/png;base64,AAAA"],
        hasAttachments: true,
      },
      remoteSettings,
      providerError,
      NOW,
    );
    expect(result.error).toBe("provider-error");
    expect(result.content).toContain("does not support image input");
    expect(result.content).toContain("invalid_request");
  });

  it("explains truncated or non-visual empty image responses", async () => {
    const truncated: FetchLike = async () =>
      ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "" } }] }),
      }) as unknown as Response;
    const truncatedResult = await complete(
      {
        ...userRequest("看看这张课表"),
        images: ["data:image/png;base64,AAAA"],
        hasAttachments: true,
      },
      remoteSettings,
      truncated,
      NOW,
    );
    expect(truncatedResult.error).toBe("empty-content");
    expect(truncatedResult.content).toContain("finish_reason=length");
    expect(truncatedResult.content).toContain("推理");

    const noVision: FetchLike = async () =>
      ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "" } }] }),
      }) as unknown as Response;
    const noVisionResult = await complete(
      {
        ...userRequest("看看这张课表"),
        images: ["data:image/png;base64,AAAA"],
        hasAttachments: true,
      },
      remoteSettings,
      noVision,
      NOW,
    );
    expect(noVisionResult.error).toBe("empty-content");
    expect(noVisionResult.content).toContain("支持图片输入");
  });
});

describe("persona memory (F119)", () => {
  const empty: AiMemoryData = { version: 1, entries: [], updatedAt: NOW.toISOString() };

  it("extracts explicit remember requests and ignores questions", () => {
    expect(extractMemoryRequest("记住我周三下午没空")).toBe("我周三下午没空");
    expect(extractMemoryRequest("帮我记一下：喜欢靠窗的位置。")).toBe("喜欢靠窗的位置");
    expect(extractMemoryRequest("以后叫我小张")).toBe("以后称呼我「小张」");
    expect(extractMemoryRequest("你记得周三有课吗？")).toBeNull();
    expect(extractMemoryRequest("记住")).toBeNull();
    expect(extractMemoryRequest("今天有什么课")).toBeNull();
  });

  it("adds, dedupes, updates, removes and clears entries", () => {
    const added = addMemory(empty, "  周三下午没空  ", NOW);
    expect(added.entries).toHaveLength(1);
    expect(added.entries[0].text).toBe("周三下午没空");

    const duplicate = addMemory(added, "周三下午没空", new Date(NOW.getTime() + 1000));
    expect(duplicate.entries).toHaveLength(1);

    const id = added.entries[0].id;
    const renamed = updateMemory(added, id, "周三晚上没空", NOW);
    expect(renamed.entries[0].text).toBe("周三晚上没空");

    const cleared = removeMemory(renamed, id, NOW);
    expect(cleared.entries).toHaveLength(0);
    expect(clearMemory(added).entries).toHaveLength(0);
  });

  it("normalizes corrupt storage and round-trips", () => {
    expect(normalizeMemory(null).entries).toHaveLength(0);
    expect(
      normalizeMemory({ entries: [{ text: "  " }, { text: "偏好靠窗" }, { text: "偏好靠窗" }] })
        .entries,
    ).toHaveLength(1);

    const storage = createMemoryStorage();
    expect(saveMemory(addMemory(empty, "周三下午没空", NOW), storage)).toBe(true);
    expect(loadMemory(storage).entries[0].text).toBe("周三下午没空");

    storage.setItem(AI_MEMORY_KEY, "{broken");
    expect(loadMemory(storage).entries).toHaveLength(0);
  });

  it("injects memory into the system prompt", () => {
    const withMemory = buildSystemPrompt(
      baseSettings(),
      { snapshot },
      addMemory(empty, "周三下午没空", NOW).entries,
    );
    expect(withMemory).toContain("【长期记忆】");
    expect(withMemory).toContain("周三下午没空");
    expect(buildSystemPrompt(baseSettings(), { snapshot })).not.toContain("【长期记忆】");
  });

  it("acknowledges and recalls memory in local mode", async () => {
    const remembered = addMemory(empty, "周三下午没空", NOW).entries;
    const request = userRequest("记住我喜欢靠窗的位置");
    request.memory = remembered;
    const ack = await complete(request, baseSettings(), undefined, NOW);
    expect(ack.content).toContain("记下了");
    expect(ack.content).toContain("喜欢靠窗的位置");

    const recall = userRequest("你记得什么");
    recall.memory = remembered;
    const recalled = await complete(recall, baseSettings(), undefined, NOW);
    expect(recalled.content).toContain("周三下午没空");

    const none = await complete(userRequest("你记得什么"), baseSettings(), undefined, NOW);
    expect(none.content).toContain("还没有保存任何记忆");
  });

  it("sends memory only as part of the remote system prompt", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: "好" } }] }),
      } as unknown as Response;
    };
    const settings = baseSettings({
      provider: "custom",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
    });
    const request = userRequest("周三下午有课吗");
    request.memory = addMemory(empty, "周三下午没空", NOW).entries;
    await complete(request, settings, fetchImpl, NOW);
    const body = JSON.parse(String(requests[0].init?.body));
    expect(body.messages[0].content).toContain("周三下午没空");
  });
});

describe("model providers and connection test", () => {
  it("defaults to Ollama and migrates legacy openai-compatible", () => {
    expect(DEFAULT_AI_SETTINGS.provider).toBe("ollama");
    expect(DEFAULT_AI_SETTINGS.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(providerPreset("ollama").keyRequired).toBe(false);
    expect(providerPreset("deepseek").keyRequired).toBe(true);
    expect(AI_PROVIDER_PRESETS.some((preset) => preset.id === "local")).toBe(true);
    expect(isValidAiBaseUrl("http://127.0.0.1:11434/v1")).toBe(true);
    expect(isValidAiBaseUrl("file:///etc/passwd")).toBe(false);

    const legacy = normalizeAiSettings({
      provider: "custom",
      baseUrl: "https://x.example/v1",
      apiKey: "sk-1",
      model: "m",
    });
    expect(legacy.provider).toBe("custom");
    expect(legacy.baseUrl).toBe("https://x.example/v1");
    expect(legacy.model).toBe("m");
  });

  it("validates settings by provider key requirements", () => {
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, persona: { ...DEFAULT_PERSONA, name: " " } })).toContain("名字");
    expect(validateAiSettings(DEFAULT_AI_SETTINGS)).toBeNull();
    expect(validateAiSettings(normalizeAiSettings({ provider: "local" }))).toBeNull();
    expect(
      validateAiSettings(normalizeAiSettings({ provider: "deepseek", apiKey: "", baseUrl: "https://api.deepseek.com/v1" })),
    ).toContain("API Key");
    expect(
      validateAiSettings({ ...DEFAULT_AI_SETTINGS, provider: "custom", baseUrl: "notaurl", apiKey: "sk-1" }),
    ).toContain("Base URL");
  });

  it("keeps per-provider keys in the vault and supports clearing", () => {
    const storage = createMemoryStorage();
    saveAiSettings(
      normalizeAiSettings({ provider: "deepseek", apiKey: "sk-a", model: "deepseek-chat" }),
      storage,
    );
    saveAiSettings(
      normalizeAiSettings({
        ...loadAiSettings(storage),
        provider: "openai",
        apiKey: "sk-b",
        model: "gpt-4o-mini",
      }),
      storage,
    );
    const loaded = loadAiSettings(storage);
    expect(loaded.keyVault.deepseek).toBe("sk-a");
    expect(loaded.keyVault.openai).toBe("sk-b");

    const back = normalizeAiSettings({ ...loaded, provider: "deepseek", apiKey: "" });
    expect(back.apiKey).toBe("sk-a");

    saveAiSettings({ ...loaded, provider: "deepseek", apiKey: "" }, storage);
    expect(loadAiSettings(storage).keyVault.deepseek).toBeUndefined();
  });

  it("probes ollama /api/tags without a key", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: "qwen2.5:7b" }, { name: "llama3:8b" }] }),
      } as unknown as Response;
    };
    const result = await testAiConnection(normalizeAiSettings({ provider: "ollama" }), fetchImpl);
    expect(result.ok).toBe(true);
    expect(calls[0]).toBe("http://127.0.0.1:11434/api/tags");
    expect(result.models).toEqual(["qwen2.5:7b", "llama3:8b"]);
    expect(result.message).toContain("2 个模型");
  });

  it("probes openai-compatible /models with bearer auth", async () => {
    let headers: Record<string, string> = {};
    let seenUrl = "";
    const fetchImpl: FetchLike = async (url, init) => {
      seenUrl = url;
      headers = (init?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "gpt-4o-mini" }] }),
      } as unknown as Response;
    };
    const result = await testAiConnection(
      normalizeAiSettings({ provider: "openai", apiKey: "sk-x" }),
      fetchImpl,
    );
    expect(result.ok).toBe(true);
    expect(seenUrl).toBe("https://api.openai.com/v1/models");
    expect(headers.Authorization).toBe("Bearer sk-x");
    expect(result.models).toEqual(["gpt-4o-mini"]);
  });

  it("reports 401 and local network failures with actionable hints", async () => {
    const unauthorized: FetchLike = async () =>
      ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response;
    const bad = await testAiConnection(
      normalizeAiSettings({ provider: "deepseek", apiKey: "sk-bad" }),
      unauthorized,
    );
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("API Key");

    const offline: FetchLike = async () => {
      throw new Error("offline");
    };
    const down = await testAiConnection(normalizeAiSettings({ provider: "ollama" }), offline);
    expect(down.ok).toBe(false);
    expect(down.message).toContain("OLLAMA_ORIGINS");

    const local = await testAiConnection(normalizeAiSettings({ provider: "local" }), offline);
    expect(local.ok).toBe(true);
  });

  it("auto-selects the first ollama model when none is configured", async () => {
    const bodies: Array<{ model: string }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.endsWith("/api/tags")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ models: [{ name: "qwen2.5:7b" }] }),
        } as unknown as Response;
      }
      bodies.push(JSON.parse(String(init?.body)));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: "本地模型答。" } }] }),
      } as unknown as Response;
    };
    const result = await complete(
      userRequest("明天有课吗"),
      normalizeAiSettings({ provider: "ollama" }),
      fetchImpl,
      NOW,
    );
    expect(result.content).toBe("本地模型答。");
    expect(bodies[0].model).toBe("qwen2.5:7b");
  });

  it("falls back to local rules when ollama is unreachable", async () => {
    const offline: FetchLike = async () => {
      throw new Error("offline");
    };
    const result = await complete(
      userRequest("高数在哪上"),
      normalizeAiSettings({ provider: "ollama" }),
      offline,
      NOW,
    );
    expect(result.provider).toBe("local");
    expect(result.content).toContain("教一 401");
  });
});
