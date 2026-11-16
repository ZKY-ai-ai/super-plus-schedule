import { describe, expect, it } from "vitest";
import {
  MAX_COURSE_NAME_LENGTH,
  MAX_SCREENSHOT_COURSES,
  MAX_VISION_CONTENT_CHARS,
  buildScreenshotMessages,
  extractJsonPayload,
  parseScreenshotCourseJson,
  visionConfigFromAiSettings,
} from "../lib/screenshotImport";

function json(items: unknown[]): string {
  return JSON.stringify(items);
}

describe("extractJsonPayload", () => {
  it("unwraps a fenced JSON array", () => {
    expect(extractJsonPayload('```json\n[{"name":"高数"}]\n```')).toBe('[{"name":"高数"}]');
  });

  it("keeps pure JSON untouched and slices prose around it", () => {
    expect(extractJsonPayload('[{"name":"高数"}]')).toBe('[{"name":"高数"}]');
    expect(extractJsonPayload('结果如下：[{"name":"高数"}] 请核对')).toBe('[{"name":"高数"}]');
  });
});

describe("parseScreenshotCourseJson", () => {
  it("parses a fenced JSON array into ParsedCourseSeed", () => {
    const content = [
      "```json",
      json([
        {
          name: "高等数学",
          teacher: "张三",
          location: "教一401",
          day: 1,
          startPeriod: 1,
          endPeriod: 2,
          startWeek: 1,
          endWeek: 16,
          pattern: "all",
        },
      ]),
      "```",
    ].join("\n");
    const result = parseScreenshotCourseJson(content, 16);
    expect(result.errors).toEqual([]);
    expect(result.courses).toEqual([
      {
        name: "高等数学",
        teacher: "张三",
        location: "教一401",
        slots: [
          { day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16, pattern: "all" },
        ],
      },
    ]);
  });

  it("accepts { courses: [...] } wrappers and pure JSON", () => {
    const item = {
      name: "大学物理",
      day: 2,
      startPeriod: 3,
      endPeriod: 4,
      startWeek: 1,
      endWeek: 8,
    };
    expect(parseScreenshotCourseJson(json([item]), 20).courses).toHaveLength(1);
    expect(
      parseScreenshotCourseJson(JSON.stringify({ courses: [item] }), 20).courses,
    ).toHaveLength(1);
  });

  it("reads Chinese weekday, period and week text", () => {
    const result = parseScreenshotCourseJson(
      json([
        {
          name: "英语",
          teacher: "李老师",
          location: "外语楼302",
          day: "星期三",
          periods: "第5-6节",
          weeks: "1-16周",
        },
      ]),
      20,
    );
    expect(result.errors).toEqual([]);
    expect(result.courses[0].slots).toEqual([
      { day: 3, start: 5, end: 6, weekStart: 1, weekEnd: 16, pattern: "all" },
    ]);
  });

  it("reads single/even week patterns", () => {
    const odd = parseScreenshotCourseJson(
      json([
        { name: "体育", day: "周一", periods: "3-4", weeks: "1-16周 单周" },
      ]),
      16,
    );
    expect(odd.courses[0].slots[0].pattern).toBe("odd");
    const even = parseScreenshotCourseJson(
      json([
        { name: "体育", day: 1, start: 3, end: 4, startWeek: 1, endWeek: 16, pattern: "双" },
      ]),
      16,
    );
    expect(even.courses[0].slots[0].pattern).toBe("even");
  });

  it("merges the same course across several weekdays", () => {
    const result = parseScreenshotCourseJson(
      json([
        {
          name: "大学物理",
          teacher: "王老师",
          day: 2,
          startPeriod: 3,
          endPeriod: 4,
          startWeek: 1,
          endWeek: 8,
        },
        {
          name: "大学物理",
          teacher: "王老师",
          day: 4,
          startPeriod: 3,
          endPeriod: 4,
          startWeek: 1,
          endWeek: 8,
        },
      ]),
      8,
    );
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].slots.map((slot) => slot.day)).toEqual([2, 4]);
  });

  it("dedupes identical slots", () => {
    const item = {
      name: "体育",
      day: 1,
      startPeriod: 3,
      endPeriod: 4,
      startWeek: 1,
      endWeek: 16,
    };
    const result = parseScreenshotCourseJson(json([item, item]), 16);
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].slots).toHaveLength(1);
  });

  it("rejects an invalid weekday", () => {
    const result = parseScreenshotCourseJson(
      json([
        { name: "高数", day: 8, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16 },
      ]),
      16,
    );
    expect(result.courses).toHaveLength(0);
    expect(result.errors.some((error) => error.includes("星期"))).toBe(true);
  });

  it("rejects invalid periods", () => {
    const result = parseScreenshotCourseJson(
      json([
        { name: "高数", day: 1, startPeriod: 0, endPeriod: 0, startWeek: 1, endWeek: 16 },
      ]),
      16,
    );
    expect(result.courses).toHaveLength(0);
    expect(result.errors.some((error) => error.includes("节次 0–0 无效"))).toBe(true);
  });

  it("rejects a reversed week range", () => {
    const result = parseScreenshotCourseJson(
      json([
        { name: "高数", day: 1, startPeriod: 1, endPeriod: 2, startWeek: 17, endWeek: 8 },
      ]),
      20,
    );
    expect(result.courses).toHaveLength(0);
    expect(result.errors.some((error) => error.includes("周次 17–8 无效"))).toBe(true);
  });

  it("rejects items without a course name", () => {
    const result = parseScreenshotCourseJson(
      json([{ day: 1, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16 }]),
      16,
    );
    expect(result.courses).toHaveLength(0);
    expect(result.errors.some((error) => error.includes("缺少课程名"))).toBe(true);
  });

  it("rejects an overlong course name", () => {
    const result = parseScreenshotCourseJson(
      json([
        {
          name: "课".repeat(MAX_COURSE_NAME_LENGTH + 1),
          day: 1,
          startPeriod: 1,
          endPeriod: 2,
          startWeek: 1,
          endWeek: 16,
        },
      ]),
      16,
    );
    expect(result.courses).toHaveLength(0);
    expect(result.errors.some((error) => error.includes("课程名超过"))).toBe(true);
  });

  it("truncates overlong teacher and location fields with a warning", () => {
    const result = parseScreenshotCourseJson(
      json([
        {
          name: "体育",
          teacher: "王".repeat(45),
          location: "馆".repeat(45),
          day: 1,
          startPeriod: 1,
          endPeriod: 2,
          startWeek: 1,
          endWeek: 16,
        },
      ]),
      16,
    );
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].teacher).toHaveLength(40);
    expect(result.courses[0].location).toHaveLength(40);
    expect(result.errors.some((error) => error.includes("老师超过 40 个字符"))).toBe(true);
    expect(result.errors.some((error) => error.includes("教室超过 40 个字符"))).toBe(true);
  });

  it("defaults missing weeks to the semester length with a warning", () => {
    const result = parseScreenshotCourseJson(
      json([{ name: "高数", day: 1, startPeriod: 1, endPeriod: 2 }]),
      18,
    );
    expect(result.courses[0].slots[0]).toMatchObject({
      weekStart: 1,
      weekEnd: 18,
      pattern: "all",
    });
    expect(result.errors.some((error) => error.includes("未识别到周次"))).toBe(true);
  });

  it(`caps the list at ${MAX_SCREENSHOT_COURSES} courses`, () => {
    const items = Array.from({ length: MAX_SCREENSHOT_COURSES + 3 }, (_, index) => ({
      name: `课程${index + 1}`,
      day: (index % 7) + 1,
      startPeriod: 1,
      endPeriod: 2,
      startWeek: 1,
      endWeek: 16,
    }));
    const result = parseScreenshotCourseJson(json(items), 16);
    expect(result.courses).toHaveLength(MAX_SCREENSHOT_COURSES);
    expect(result.errors.some((error) => error.includes("超过 40 条上限"))).toBe(true);
  });

  it("rejects overlong model output", () => {
    const result = parseScreenshotCourseJson("a".repeat(MAX_VISION_CONTENT_CHARS + 1), 16);
    expect(result.courses).toHaveLength(0);
    expect(result.errors[0]).toContain("过长");
  });

  it("rejects non-array JSON and empty arrays", () => {
    const nonArray = parseScreenshotCourseJson('{"foo": 1}', 16);
    expect(nonArray.courses).toHaveLength(0);
    expect(nonArray.errors.some((error) => error.includes("不是课程数组"))).toBe(true);

    const empty = parseScreenshotCourseJson("[]", 16);
    expect(empty.courses).toHaveLength(0);
    expect(empty.errors.some((error) => error.includes("空"))).toBe(true);
  });

  it("rejects non-JSON text without inventing courses", () => {
    const result = parseScreenshotCourseJson("图片里有高数和英语", 16);
    expect(result.courses).toHaveLength(0);
    expect(result.errors.some((error) => error.includes("不是有效 JSON"))).toBe(true);
  });
});

describe("buildScreenshotMessages", () => {
  it("asks for strict JSON and attaches the image data URL", () => {
    const messages = buildScreenshotMessages("data:image/png;base64,abc", 16);
    expect(messages[0].role).toBe("system");
    expect(String(messages[0].content)).toContain("JSON");
    const user = messages[1];
    expect(Array.isArray(user.content)).toBe(true);
    const parts = user.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts[1].type).toBe("image_url");
    expect(parts[1].image_url?.url).toBe("data:image/png;base64,abc");
  });
});

describe("visionConfigFromAiSettings", () => {
  it("rejects local mode and incomplete configs", () => {
    expect(
      visionConfigFromAiSettings({
        provider: "local",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        model: "gpt-4o-mini",
      }),
    ).toBeNull();
    expect(
      visionConfigFromAiSettings({
        provider: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4o-mini",
      }),
    ).toBeNull();
    expect(
      visionConfigFromAiSettings({
        provider: "openai-compatible",
        baseUrl: "ftp://example.com",
        apiKey: "sk-test",
        model: "gpt-4o-mini",
      }),
    ).toBeNull();
  });

  it("normalizes a usable OpenAI-compatible config", () => {
    expect(
      visionConfigFromAiSettings({
        provider: "openai-compatible",
        baseUrl: " https://api.example.com/v1/ ",
        apiKey: " sk-test ",
        model: " gpt-4o-mini ",
      }),
    ).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    });
  });
});
