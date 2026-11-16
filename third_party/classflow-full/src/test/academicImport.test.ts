import { describe, expect, it } from "vitest";
import {
  buildAcademicWeekSegments,
  createEmptyAcademicAdapter,
  formatAcademicSnippet,
  isValidJsonPath,
  mapAcademicResponse,
  parseAcademicPeriods,
  parseAcademicResponse,
  parseAcademicWeekday,
  parseAcademicWeeks,
  parseAdapterHeaders,
  readJsonPath,
  requestAcademicEndpoint,
  testAcademicAdapter,
  validateAdapterConfig,
  type AcademicAdapterConfig,
} from "../lib/academicImport";
import {
  SCHOOL_LIBRARY_KEY,
  createSchoolProfile,
  deleteSchoolProfile,
  exportSchoolLibrary,
  importSchoolLibrary,
  loadSchoolProfiles,
  parseSchoolLibraryJson,
  upsertSchoolProfile,
  validateSchoolProfile,
  type LibraryStorage,
  type SchoolProfile,
} from "../lib/schoolLibrary";

function memoryStorage(): LibraryStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function sampleAdapter(): AcademicAdapterConfig {
  const adapter = createEmptyAcademicAdapter();
  adapter.name = "示例适配器";
  adapter.url = "https://jw.example.edu/api/schedule";
  adapter.responsePath = "data.list";
  adapter.totalWeeks = 18;
  adapter.fields = {
    name: "courseName",
    weekday: "weekday",
    periods: "sections",
    periodStart: "",
    periodEnd: "",
    weeks: "weeks",
    weekStart: "",
    weekEnd: "",
    weekPattern: "weekType",
    teacher: "teacher",
    location: "room",
  };
  return adapter;
}

function sampleProfile(id = "school-test"): SchoolProfile {
  return {
    id,
    name: "测试档案",
    adapter: { ...sampleAdapter(), name: "测试档案" },
    lastTest: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

const SAMPLE_PAYLOAD = {
  data: {
    list: [
      {
        courseName: "高等数学",
        teacher: "张老师",
        room: "教101",
        weekday: 1,
        sections: "1-2",
        weeks: "1-16周",
        weekType: "",
      },
      {
        courseName: "大学英语",
        teacher: "李老师",
        room: "外语楼302",
        weekday: "周三",
        sections: "3-4",
        weeks: ["1", "3", "5", "7"],
        weekType: "",
      },
    ],
  },
};

describe("JSON 路径", () => {
  it("读取点路径、数组下标与 $ 前缀", () => {
    const payload = {
      data: { list: [{ course: { title: "高等数学" }, "room-code": "A101" }] },
    };
    expect(readJsonPath(payload, "data.list[0].course.title")).toBe("高等数学");
    expect(readJsonPath(payload, "$.data.list[0].room-code")).toBe("A101");
    expect(readJsonPath(payload, "")).toBe(payload);
    expect(readJsonPath(payload, "$")).toBe(payload);
  });

  it("缺失或类型不匹配时返回 undefined", () => {
    const payload = { data: { list: [] as unknown[] } };
    expect(readJsonPath(payload, "data.missing")).toBeUndefined();
    expect(readJsonPath(payload, "data.list[0]")).toBeUndefined();
    expect(readJsonPath(payload, "data.list.first")).toBeUndefined();
    expect(readJsonPath(null, "data")).toBeUndefined();
  });

  it("拒绝不合法路径", () => {
    expect(isValidJsonPath("data..list")).toBe(false);
    expect(isValidJsonPath("data[")).toBe(false);
    expect(isValidJsonPath("data[abc]")).toBe(false);
    expect(isValidJsonPath(".data")).toBe(false);
    expect(isValidJsonPath("data.")).toBe(false);
    expect(isValidJsonPath("data.list[0].course")).toBe(true);
    expect(isValidJsonPath("")).toBe(true);
  });
});

describe("星期解析", () => {
  it("自动识别数字、中文与英文", () => {
    expect(parseAcademicWeekday(3)).toBe(3);
    expect(parseAcademicWeekday("7")).toBe(7);
    expect(parseAcademicWeekday("周一")).toBe(1);
    expect(parseAcademicWeekday("星期天")).toBe(7);
    expect(parseAcademicWeekday("Mon")).toBe(1);
    expect(parseAcademicWeekday("sunday")).toBe(7);
  });

  it("按指定格式严格解析", () => {
    expect(parseAcademicWeekday("周一", "number")).toBeNull();
    expect(parseAcademicWeekday(1, "chinese")).toBeNull();
    expect(parseAcademicWeekday("星期一", "english")).toBeNull();
    expect(parseAcademicWeekday("星期五", "chinese")).toBe(5);
  });

  it("越界与非法值返回 null", () => {
    expect(parseAcademicWeekday(0)).toBeNull();
    expect(parseAcademicWeekday(8)).toBeNull();
    expect(parseAcademicWeekday("")).toBeNull();
    expect(parseAcademicWeekday({ day: 1 })).toBeNull();
  });
});

describe("节次解析", () => {
  it("解析范围、单节、数组与带文字格式", () => {
    expect(parseAcademicPeriods("3-4")).toEqual({ start: 3, end: 4 });
    expect(parseAcademicPeriods("第5节")).toEqual({ start: 5, end: 5 });
    expect(parseAcademicPeriods(6)).toEqual({ start: 6, end: 6 });
    expect(parseAcademicPeriods([1, 2])).toEqual({ start: 1, end: 2 });
    expect(parseAcademicPeriods("5~3")).toEqual({ start: 3, end: 5 });
  });

  it("数字格式只接受单节", () => {
    expect(parseAcademicPeriods("3", "number")).toEqual({ start: 3, end: 3 });
    expect(parseAcademicPeriods("3-4", "number")).toBeNull();
    expect(parseAcademicPeriods("第3节", "label")).toEqual({ start: 3, end: 3 });
  });

  it("越界返回 null", () => {
    expect(parseAcademicPeriods("0")).toBeNull();
    expect(parseAcademicPeriods("15")).toBeNull();
    expect(parseAcademicPeriods("1-15")).toBeNull();
  });
});

describe("周次解析", () => {
  it("解析范围、单周、中文标签与单双周", () => {
    expect(parseAcademicWeeks("1-4周")).toEqual({
      weeks: [1, 2, 3, 4],
      pattern: "all",
    });
    expect(parseAcademicWeeks("第3周")).toEqual({ weeks: [3], pattern: "all" });
    expect(parseAcademicWeeks("第1-7周(单)")).toEqual({
      weeks: [1, 2, 3, 4, 5, 6, 7],
      pattern: "odd",
    });
    expect(parseAcademicWeeks("2-8周（双）")).toEqual({
      weeks: [2, 3, 4, 5, 6, 7, 8],
      pattern: "even",
    });
  });

  it("解析列表与数组", () => {
    expect(parseAcademicWeeks("1,3,5", "list")).toEqual({
      weeks: [1, 3, 5],
      pattern: "all",
    });
    expect(parseAcademicWeeks([1, 3, 5])).toEqual({
      weeks: [1, 3, 5],
      pattern: "all",
    });
    expect(parseAcademicWeeks("1-2,5", "auto")).toEqual({
      weeks: [1, 2, 5],
      pattern: "all",
    });
  });

  it("数字格式只接受单周", () => {
    expect(parseAcademicWeeks("3", "number")).toEqual({ weeks: [3], pattern: "all" });
    expect(parseAcademicWeeks("1-4", "number")).toBeNull();
  });

  it("越界或空值返回 null", () => {
    expect(parseAcademicWeeks("0")).toBeNull();
    expect(parseAcademicWeeks("61")).toBeNull();
    expect(parseAcademicWeeks("")).toBeNull();
    expect(parseAcademicWeeks("第一周")).toBeNull();
  });

  it("把周次列表压缩为范围与单双周", () => {
    expect(buildAcademicWeekSegments([1, 2, 3, 5])).toEqual([
      { weekStart: 1, weekEnd: 3, pattern: "all" },
      { weekStart: 5, weekEnd: 5, pattern: "all" },
    ]);
    expect(buildAcademicWeekSegments([1, 3, 5, 7])).toEqual([
      { weekStart: 1, weekEnd: 7, pattern: "odd" },
    ]);
    expect(buildAcademicWeekSegments([2, 4, 6])).toEqual([
      { weekStart: 2, weekEnd: 6, pattern: "even" },
    ]);
  });
});

describe("请求头解析", () => {
  it("接受空值与合法 JSON 对象", () => {
    expect(parseAdapterHeaders("")).toEqual({ ok: true, headers: {} });
    expect(parseAdapterHeaders('{"Cookie":"a=1","X-Token":2}')).toEqual({
      ok: true,
      headers: { Cookie: "a=1", "X-Token": "2" },
    });
  });

  it("拒绝数组、非法头名与换行注入", () => {
    expect(parseAdapterHeaders("[]").ok).toBe(false);
    expect(parseAdapterHeaders('{"Bad Header":"x"}').ok).toBe(false);
    expect(parseAdapterHeaders('{"X-Test":"a\\r\\nInjected: 1"}').ok).toBe(false);
    expect(parseAdapterHeaders("{not json}").ok).toBe(false);
  });
});

describe("适配器校验", () => {
  it("完整配置通过校验", () => {
    const result = validateAdapterConfig(sampleAdapter());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("拦截名称、URL、请求体与字段缺失", () => {
    expect(validateAdapterConfig({ ...sampleAdapter(), name: "" }).ok).toBe(false);
    expect(validateAdapterConfig({ ...sampleAdapter(), url: "ftp://example.com" }).ok).toBe(false);
    expect(
      validateAdapterConfig({ ...sampleAdapter(), method: "POST", body: "{bad" }).ok,
    ).toBe(false);
    expect(
      validateAdapterConfig({ ...sampleAdapter(), method: "GET", body: "{}" }).ok,
    ).toBe(false);
    expect(
      validateAdapterConfig({ ...sampleAdapter(), responsePath: "data..list" }).ok,
    ).toBe(false);

    const noPeriods = sampleAdapter();
    noPeriods.fields.periods = "";
    expect(validateAdapterConfig(noPeriods).ok).toBe(false);

    const partialWeeks = sampleAdapter();
    partialWeeks.fields.weeks = "";
    partialWeeks.fields.weekStart = "startWeek";
    expect(validateAdapterConfig(partialWeeks).ok).toBe(false);

    expect(validateAdapterConfig({ ...sampleAdapter(), totalWeeks: 0 }).ok).toBe(false);
  });
});

describe("响应映射", () => {
  it("按字段路径生成 ParsedCourseSeed 并合并同名课程", () => {
    const result = mapAcademicResponse(SAMPLE_PAYLOAD, sampleAdapter());
    expect(result.totalItems).toBe(2);
    expect(result.validItems).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.courses).toHaveLength(2);

    const math = result.courses.find((course) => course.name === "高等数学");
    expect(math).toBeDefined();
    expect(math?.teacher).toBe("张老师");
    expect(math?.location).toBe("教101");
    expect(math?.slots).toEqual([
      { day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16, pattern: "all" },
    ]);

    const english = result.courses.find((course) => course.name === "大学英语");
    expect(english?.slots).toEqual([
      { day: 3, start: 3, end: 4, weekStart: 1, weekEnd: 7, pattern: "odd" },
    ]);
  });

  it("支持开始节 / 结束节字段", () => {
    const adapter = sampleAdapter();
    adapter.fields.periods = "";
    adapter.fields.periodStart = "startSection";
    adapter.fields.periodEnd = "endSection";
    adapter.fields.weekStart = "startWeek";
    adapter.fields.weekEnd = "endWeek";

    const result = mapAcademicResponse(
      {
        data: {
          list: [
            {
              courseName: "线性代数",
              weekday: 2,
              startSection: 3,
              endSection: 4,
              startWeek: 2,
              endWeek: 6,
            },
          ],
        },
      },
      adapter,
    );
    expect(result.errors).toEqual([]);
    expect(result.courses[0]?.slots).toEqual([
      { day: 2, start: 3, end: 4, weekStart: 2, weekEnd: 6, pattern: "all" },
    ]);
  });

  it("单双周字段会过滤周次", () => {
    const payload = {
      data: {
        list: [
          {
            courseName: "概率论",
            weekday: 4,
            sections: "5-6",
            weeks: "1-8",
            weekType: 2,
          },
        ],
      },
    };
    const result = mapAcademicResponse(payload, sampleAdapter());
    expect(result.courses[0]?.slots).toEqual([
      { day: 4, start: 5, end: 6, weekStart: 2, weekEnd: 8, pattern: "even" },
    ]);
  });

  it("跳过无效记录并保留错误信息", () => {
    const payload = {
      data: {
        list: [
          ...SAMPLE_PAYLOAD.data.list,
          { courseName: "大学物理", weekday: "", sections: "5-6", weeks: "1-16" },
          { courseName: "", weekday: 5, sections: "5-6", weeks: "1-16" },
        ],
      },
    };
    const result = mapAcademicResponse(payload, sampleAdapter());
    expect(result.totalItems).toBe(4);
    expect(result.validItems).toBe(2);
    expect(result.courses).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("大学物理");
    expect(result.errors[1]).toContain("缺少课程名称");
  });

  it("空数组给出明确提示", () => {
    const result = mapAcademicResponse({ data: { list: [] } }, sampleAdapter());
    expect(result.courses).toEqual([]);
    expect(result.errors[0]).toContain("为空");
  });

  it("路径缺失或不是数组时给出明确提示", () => {
    expect(
      mapAcademicResponse({ data: {} }, sampleAdapter()).errors[0],
    ).toContain("找不到路径");
    expect(
      mapAcademicResponse({ data: { list: "oops" } }, sampleAdapter()).errors[0],
    ).toContain("不是数组");
  });

  it("拒绝非 JSON 响应", () => {
    const result = parseAcademicResponse("<html>login</html>", sampleAdapter());
    expect(result.courses).toEqual([]);
    expect(result.errors[0]).toContain("不是有效的 JSON");
  });
});

describe("请求错误分类", () => {
  it("HTTP 错误会带上状态码和接口消息", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ message: "登录已过期" }), { status: 403 })) as typeof fetch;
    const result = await requestAcademicEndpoint(sampleAdapter(), {
      native: false,
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("http");
    expect(result.status).toBe(403);
    expect(result.message).toContain("403");
    expect(result.message).toContain("登录已过期");
    expect(result.message).toContain("Cookie");
  });

  it("非 JSON 响应归类为 json", async () => {
    const fetchImpl = (async () =>
      new Response("<html>登录页</html>", { status: 200 })) as typeof fetch;
    const result = await requestAcademicEndpoint(sampleAdapter(), {
      native: false,
      fetchImpl,
    });
    expect(result.kind).toBe("json");
    expect(result.message).toContain("不是 JSON");
  });

  it("空响应归类为 empty", async () => {
    const fetchImpl = (async () => new Response("", { status: 200 })) as typeof fetch;
    const result = await requestAcademicEndpoint(sampleAdapter(), {
      native: false,
      fetchImpl,
    });
    expect(result.kind).toBe("empty");
  });

  it("浏览器 TypeError 归类为 CORS 并提示 Web 限制", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const result = await requestAcademicEndpoint(sampleAdapter(), {
      native: false,
      fetchImpl,
    });
    expect(result.kind).toBe("cors");
    expect(result.message).toContain("CORS");
    expect(result.message).toContain("App");
  });

  it("超时归类为 timeout", async () => {
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })) as typeof fetch;
    const result = await requestAcademicEndpoint(sampleAdapter(), {
      native: false,
      fetchImpl,
      timeoutMs: 100,
    });
    expect(result.kind).toBe("timeout");
  });

  it("成功请求返回 JSON 与原始文本", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(SAMPLE_PAYLOAD), { status: 200 })) as typeof fetch;
    const result = await requestAcademicEndpoint(sampleAdapter(), {
      native: false,
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.rawText).toContain("高等数学");
  });
});

describe("测试流程", () => {
  it("真实响应通过映射后才算测试通过", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(SAMPLE_PAYLOAD), { status: 200 })) as typeof fetch;
    const outcome = await testAcademicAdapter(sampleAdapter(), {
      native: false,
      fetchImpl,
    });
    expect(outcome.status).toBe("ok");
    expect(outcome.courseCount).toBe(2);
    expect(outcome.slotCount).toBe(2);
    expect(outcome.courses).toHaveLength(2);
    expect(outcome.rawSnippet).toContain("大学英语");
  });

  it("接口成功但无法映射时测试失败", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: { list: [] } }), { status: 200 })) as typeof fetch;
    const outcome = await testAcademicAdapter(sampleAdapter(), {
      native: false,
      fetchImpl,
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.courseCount).toBe(0);
    expect(outcome.message).toContain("空");
  });

  it("配置不完整时不发请求", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const outcome = await testAcademicAdapter(
      { ...sampleAdapter(), url: "" },
      { native: false, fetchImpl },
    );
    expect(outcome.status).toBe("failed");
    expect(called).toBe(false);
  });

  it("响应片段超长时截断", () => {
    const snippet = formatAcademicSnippet("x".repeat(3000), 100);
    expect(snippet.startsWith("x".repeat(100))).toBe(true);
    expect(snippet).toContain("已截断");
  });
});

describe("学校档案库", () => {
  it("校验档案与适配器", () => {
    expect(validateSchoolProfile(sampleProfile()).ok).toBe(true);
    expect(validateSchoolProfile({ ...sampleProfile(), name: "" }).ok).toBe(false);
    expect(validateSchoolProfile({ ...sampleProfile(), adapter: null }).ok).toBe(false);
    expect(
      validateSchoolProfile({
        ...sampleProfile(),
        lastTest: { testedAt: "not-a-date", status: "ok" },
      }).ok,
    ).toBe(false);
  });

  it("没有内置学校：空存储返回空数组", () => {
    const storage = memoryStorage();
    expect(loadSchoolProfiles(storage)).toEqual([]);
    expect(loadSchoolProfiles(null)).toEqual([]);
  });

  it("档案增删改查持久化到本机存储", () => {
    const storage = memoryStorage();
    const profile = sampleProfile();
    const created = upsertSchoolProfile(profile, storage);
    expect(created.ok).toBe(true);
    expect(loadSchoolProfiles(storage)).toHaveLength(1);
    expect(loadSchoolProfiles(storage)[0]?.name).toBe("测试档案");

    const renamed = upsertSchoolProfile({ ...profile, name: "更新后的档案" }, storage);
    expect(renamed.ok).toBe(true);
    const loaded = loadSchoolProfiles(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.name).toBe("更新后的档案");

    const afterDelete = deleteSchoolProfile(profile.id, storage);
    expect(afterDelete.ok).toBe(true);
    expect(afterDelete.profiles).toEqual([]);
    expect(loadSchoolProfiles(storage)).toEqual([]);
    expect(storage.getItem(SCHOOL_LIBRARY_KEY)).not.toBeNull();
  });

  it("无效档案无法写入", () => {
    const storage = memoryStorage();
    const result = upsertSchoolProfile(
      { ...sampleProfile(), adapter: { ...sampleAdapter(), url: "" } },
      storage,
    );
    expect(result.ok).toBe(false);
    expect(loadSchoolProfiles(storage)).toEqual([]);
  });

  it("导出并重新解析档案 JSON", () => {
    const json = exportSchoolLibrary([sampleProfile()]);
    expect(json).toContain("kexu-school-library");
    const parsed = parseSchoolLibraryJson(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.profiles[0]?.adapter.responsePath).toBe("data.list");
  });

  it("导入时合并、覆盖与跳过非法档案", () => {
    const storage = memoryStorage();
    const first = importSchoolLibrary(
      exportSchoolLibrary([sampleProfile("school-a")]),
      "merge",
      storage,
    );
    expect(first.ok).toBe(true);
    expect(first.added).toBe(1);
    expect(loadSchoolProfiles(storage)).toHaveLength(1);

    const second = importSchoolLibrary(
      exportSchoolLibrary([
        { ...sampleProfile("school-a"), name: "覆盖后的档案" },
        sampleProfile("school-b"),
      ]),
      "merge",
      storage,
    );
    expect(second.ok).toBe(true);
    expect(second.added).toBe(1);
    expect(second.updated).toBe(1);
    const loaded = loadSchoolProfiles(storage);
    expect(loaded).toHaveLength(2);
    expect(loaded.find((item) => item.id === "school-a")?.name).toBe("覆盖后的档案");

    const replace = importSchoolLibrary(
      exportSchoolLibrary([sampleProfile("school-c")]),
      "replace",
      storage,
    );
    expect(replace.ok).toBe(true);
    expect(loadSchoolProfiles(storage).map((item) => item.id)).toEqual(["school-c"]);

    const broken = importSchoolLibrary(
      JSON.stringify({
        profiles: [sampleProfile("school-d"), { name: "坏档案" }],
      }),
      "merge",
      storage,
    );
    expect(broken.ok).toBe(true);
    expect(broken.added).toBe(1);
    expect(broken.skipped).toBe(1);
    expect(broken.errors).toHaveLength(1);
  });

  it("拒绝损坏的档案 JSON", () => {
    expect(parseSchoolLibraryJson("not json").ok).toBe(false);
    expect(parseSchoolLibraryJson('{"foo":1}').ok).toBe(false);
    const storage = memoryStorage();
    const result = importSchoolLibrary("not json", "merge", storage);
    expect(result.ok).toBe(false);
    expect(loadSchoolProfiles(storage)).toEqual([]);
  });

  it("新建档案含空适配器且未测试", () => {
    const profile = createSchoolProfile("我的学校");
    expect(profile.name).toBe("我的学校");
    expect(profile.lastTest).toBeNull();
    expect(profile.adapter.url).toBe("");
    expect(validateSchoolProfile(profile).ok).toBe(false);
  });
});
