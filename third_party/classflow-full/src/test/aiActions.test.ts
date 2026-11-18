import { describe, expect, it } from "vitest";
import {
  describeAiAction,
  isDestructiveAction,
  parseAiActions,
  parseLocalCommand,
  validateAiAction,
  type AiAction,
  type AiActionContext,
} from "../lib/aiActions";
import { AI_ACTION_GUIDE } from "../lib/aiActions";
import { AI_MANUAL_INDEX, buildAiManualPrompt, findManualSection } from "../lib/aiManual";

const CONTEXT = {
  totalWeeks: 20,
  courses: [{ id: "course-math", name: "高等数学" }],
  tasks: [{ id: "task-1", title: "交作业" }],
  exams: [{ id: "exam-1", title: "期中" }],
  notes: [{ id: "note-1", title: "复习笔记" }],
  events: [{ id: "event-1", title: "组会" }],
  timetables: [{ id: "tt-1", name: "主课表" }],
};

describe("parseAiActions", () => {
  it("剥离 fenced 动作块并保留正文", () => {
    const raw = [
      "可以，先帮你建一个任务。",
      "```kexu-action",
      '[{"action":"create_task","args":{"title":"交高数作业","dueDate":"2026-11-20"}}]',
      "```",
    ].join("\n");
    const parsed = parseAiActions(raw);
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0].action).toBe("create_task");
    expect(parsed.text).toContain("先帮你建一个任务");
    expect(parsed.text).not.toContain("kexu-action");
    expect(parsed.errors).toEqual([]);
  });

  it("兼容 <kexu-action> 标签与 actions 包装", () => {
    const parsed = parseAiActions(
      '打开日程<kexu-action>{"actions":[{"action":"navigate","args":{"page":"agenda"}}]}</kexu-action>',
    );
    expect(parsed.text).toBe("打开日程");
    expect(parsed.actions).toEqual([{ action: "navigate", args: { page: "agenda" } }]);
  });

  it("忽略坏 JSON 并提示错误", () => {
    const parsed = parseAiActions("正文\n```kexu-action\nnot json\n```");
    expect(parsed.text).toBe("正文");
    expect(parsed.actions).toEqual([]);
    expect(parsed.errors[0]).toContain("JSON");
  });

  it("截断的未闭合动作块不会显示成原文", () => {
    const parsed = parseAiActions('准备导入。\n```kexu-action\n[{"action":"add_course","args":{"name":"微积分');
    expect(parsed.text).toBe("准备导入。");
    expect(parsed.actions).toEqual([]);
    expect(parsed.errors.some((error) => error.includes("截断"))).toBe(true);
    expect(parsed.text).not.toContain("kexu-action");
  });

  it("一次最多保留 40 个动作", () => {
    const list = Array.from({ length: 50 }, () => ({
      action: "navigate",
      args: { page: "notes" },
    }));
    const parsed = parseAiActions(`\`\`\`kexu-action\n${JSON.stringify(list)}\n\`\`\``);
    expect(parsed.actions).toHaveLength(40);
    expect(parsed.errors.some((error) => error.includes("40"))).toBe(true);
  });

  it("把多条导入动作合并成一次 add_courses_from_text", () => {
    const parsed = parseAiActions(
      `\`\`\`kexu-action\n${JSON.stringify([
        {
          action: "add_courses_from_text",
          args: { text: "高等数学 周一 第1-2节 1-16周" },
        },
        {
          action: "add_course",
          args: { name: "大学物理", slots: [{ day: 2, start: 3, end: 4 }] },
        },
      ])}\n\`\`\``,
    );
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0].action).toBe("add_courses_from_text");
    const text = String(parsed.actions[0].args.text);
    expect(text).toContain("高等数学");
    expect(text).toContain("大学物理");
    expect(text).toContain("周二");
  });
});

describe("validateAiAction", () => {
  const valid = (action: AiAction) => {
    const result = validateAiAction(action, CONTEXT);
    if (!result.ok) throw new Error(result.error);
    return result.action;
  };

  it("接受合法的建任务并保留关联课程", () => {
    const action = valid({
      action: "create_task",
      args: {
        title: "交高数作业",
        dueDate: "2026-11-20",
        dueTime: "18:30",
        courseId: "course-math",
        estimatedMinutes: 90,
        repeat: "weekly",
      },
    });
    expect(action.args).toMatchObject({
      title: "交高数作业",
      dueDate: "2026-11-20",
      dueTime: "18:30",
      courseId: "course-math",
      estimatedMinutes: 90,
      repeat: "weekly",
    });
  });

  it("拒绝不存在的课程 ID 和坏日期", () => {
    expect(
      validateAiAction(
        { action: "create_task", args: { title: "x", courseId: "missing" } },
        CONTEXT,
      ).ok,
    ).toBe(false);
    expect(
      validateAiAction(
        { action: "create_task", args: { title: "x", dueDate: "2026-02-30" } },
        CONTEXT,
      ).ok,
    ).toBe(false);
    expect(
      validateAiAction({ action: "create_task", args: { title: "x", dueTime: "09:00" } }, CONTEXT)
        .ok,
    ).toBe(false);
  });

  it("校验课程时段边界", () => {
    const result = validateAiAction(
      {
        action: "add_course",
        args: {
          name: "编译原理",
          slots: [{ day: 2, start: 3, end: 4, weekStart: 1, weekEnd: 16 }],
        },
      },
      CONTEXT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action.args.slots).toEqual([
        { day: 2, start: 3, end: 4, weekStart: 1, weekEnd: 16, pattern: "all" },
      ]);
    }
    expect(
      validateAiAction(
        { action: "add_course", args: { name: "x", slots: [{ day: 9, start: 1, end: 2 }] } },
        CONTEXT,
      ).ok,
    ).toBe(false);
    expect(
      validateAiAction(
        { action: "add_course", args: { name: "x", slots: [{ day: 1, start: 1, end: 2, weekEnd: 8 }] } },
        { ...CONTEXT, totalWeeks: 4 },
      ).ok,
    ).toBe(false);
  });

  it("拒绝修改不存在的任务，并识别高风险动作", () => {
    expect(validateAiAction({ action: "complete_task", args: { id: "nope" } }, CONTEXT).ok).toBe(
      false,
    );
    expect(isDestructiveAction({ action: "clear_all", args: {} })).toBe(true);
    expect(isDestructiveAction({ action: "create_note", args: { title: "x" } })).toBe(false);
  });

  it("update_semester 只接受合法字段", () => {
    const action = valid({
      action: "update_semester",
      args: { name: "春季学期", totalWeeks: 18, showWeekends: false },
    });
    expect(action.args).toEqual({ name: "春季学期", totalWeeks: 18, showWeekends: false });
    expect(validateAiAction({ action: "update_semester", args: {} }, CONTEXT).ok).toBe(false);
  });
});

describe("describeAiAction", () => {
  it("用上下文补全名称", () => {
    expect(
      describeAiAction({ action: "delete_course", args: { id: "course-math" } }, CONTEXT),
    ).toContain("高等数学");
    expect(
      describeAiAction(
        {
          action: "add_course",
          args: {
            name: "编译原理",
            slots: [{ day: 2, start: 3, end: 4, weekStart: 1, weekEnd: 16, pattern: "odd" }],
          },
        },
        CONTEXT,
      ),
    ).toContain("周二 第3-4节 1-16周 单周");
  });
});

describe("parseLocalCommand", () => {
  it("识别导航与设置", () => {
    expect(parseLocalCommand("打开空档评估")).toEqual([
      { action: "navigate", args: { page: "plan", planTab: "gaps" } },
    ]);
    expect(parseLocalCommand("帮我打开设置里的提醒")).toEqual([
      { action: "open_settings", args: { tab: "reminders" } },
    ]);
    expect(parseLocalCommand("跳到第 8 周")[0]).toEqual({
      action: "set_week",
      args: { week: 8 },
    });
    expect(parseLocalCommand("打开运行模式")).toEqual([
      { action: "navigate", args: { page: "models" } },
    ]);
    expect(parseLocalCommand("打开人格与授权")).toEqual([
      { action: "navigate", args: { page: "persona" } },
    ]);
  });

  it("识别新建任务并提取日期、时长和课程", () => {
    const [action] = parseLocalCommand(
      "新建任务：明天交 高等数学 作业 18:30 30分钟",
      CONTEXT,
      new Date("2026-11-17T10:00:00"),
    );
    expect(action.action).toBe("create_task");
    expect(action.args).toMatchObject({
      dueDate: "2026-11-18",
      dueTime: "18:30",
      estimatedMinutes: 30,
      courseId: "course-math",
    });
  });

  it("识别新建笔记与考试", () => {
    const [note] = parseLocalCommand("记一条笔记：线代复习 #期末");
    expect(note.action).toBe("create_note");
    expect(note.args.tags).toEqual(["期末"]);

    const [exam] = parseLocalCommand(
      "新建考试：高等数学期中 明天 09:00 地点：教一401",
      CONTEXT,
      new Date("2026-11-17T10:00:00"),
    );
    expect(exam.action).toBe("create_exam");
    expect(exam.args).toMatchObject({
      date: "2026-11-18",
      startTime: "09:00",
      location: "教一401",
      courseId: "course-math",
    });
  });

  it("普通问句不会误触发写操作", () => {
    expect(parseLocalCommand("今天有什么课？")).toEqual([]);
    expect(parseLocalCommand("高数作业什么时候交")).toEqual([]);
  });
});

describe("手册检索", () => {
  it("按编号和关键词找到章节", () => {
    expect(findManualSection("05")?.title).toContain("任务与考试");
    expect(findManualSection("笔记")?.id).toBe("06");
    expect(findManualSection("不存在的章节")).toBeNull();
  });

  it("提示中带能力卡、动作协议、目录和相关章节", () => {
    const prompt = buildAiManualPrompt("作业截止提醒怎么设置", 9000);
    expect(prompt).toContain("【应用能力卡】");
    expect(prompt).toContain("【动作协议】");
    expect(prompt).toContain(AI_MANUAL_INDEX);
    expect(prompt).toContain(AI_ACTION_GUIDE.split("\n")[0]);
    expect(prompt).toContain("05 任务与考试");
    expect(prompt.length).toBeLessThanOrEqual(9000);
  });

  it("预算过小时只返回头部", () => {
    const prompt = buildAiManualPrompt("今天有什么课", 800);
    expect(prompt).toContain("【应用能力卡】");
    expect(prompt.length).toBeLessThanOrEqual(800);
  });
});
describe("全功能动作", () => {
  const validate = (action: AiAction, context: AiActionContext = CONTEXT) =>
    validateAiAction(action, context);

  it("接受界面、壁纸与偏好动作", () => {
    expect(validate({ action: "open_dialog", args: { dialog: "text-import" } }).ok).toBe(true);
    expect(validate({ action: "set_preferences", args: { theme: "dark" } }).ok).toBe(true);
    expect(validate({ action: "set_wallpaper", args: { preset: "dawn", dim: 30 } }).ok).toBe(true);
    expect(validate({ action: "open_dialog", args: { dialog: "nope" } }).ok).toBe(false);
  });

  it("校验单次调课与整体替换时段", () => {
    const slots = validate({
      action: "set_course_slots",
      args: {
        courseId: "course-math",
        slots: [{ day: 3, start: 3, end: 4, weekStart: 1, weekEnd: 16 }],
      },
    });
    expect(slots.ok).toBe(true);

    expect(
      validate({
        action: "override_session",
        args: { courseId: "course-math", week: 2, kind: "cancel" },
      }).ok,
    ).toBe(false);
    expect(
      validate({
        action: "override_session",
        args: {
          courseId: "course-math",
          week: 2,
          kind: "move",
          slotId: "slot-1",
          toDay: 4,
          toStart: 5,
          toEnd: 6,
        },
      }).ok,
    ).toBe(true);
  });

  it("成绩、任务与课表动作能用上下文名称生成说明", () => {
    const grade = validate({
      action: "set_grade",
      args: { courseId: "course-math", score: 92, credits: 4 },
    });
    expect(grade.ok).toBe(true);
    if (grade.ok) {
      expect(describeAiAction(grade.action, CONTEXT)).toContain("高等数学");
    }

    const task = validate({
      action: "update_task",
      args: { id: "task-1", title: "交高数作业（改）" },
    });
    expect(task.ok).toBe(true);

    const timetable = validate({
      action: "create_timetable",
      args: { name: "下学期", templateId: "stem" },
    });
    expect(timetable.ok).toBe(true);
  });

  it("选课池与方案动作通过校验", () => {
    const section = validate({
      action: "add_catalog_section",
      args: {
        name: "线性代数",
        credits: 3,
        category: "required",
        day: 2,
        start: 1,
        end: 2,
      },
    });
    expect(section.ok).toBe(true);
    expect(validate({ action: "auto_combine_plan", args: { maxCredits: 20 } }).ok).toBe(true);
    expect(
      validate({ action: "delete_selection_plan", args: { id: "plan-1" } }, {
        ...CONTEXT,
        selectionPlans: [{ id: "plan-1", name: "方案 A" }],
      }).ok,
    ).toBe(false);
  });

  it("AI 设置动作不接收密钥", () => {
    expect(
      validate({
        action: "update_ai_settings",
        args: { provider: "ollama", model: "qwen2.5:7b" },
      }).ok,
    ).toBe(true);
    expect(
      validate({
        action: "update_ai_settings",
        args: { provider: "ollama", model: "qwen2.5:7b" },
      }).ok,
    ).toBe(true);
    expect(
      validate({ action: "update_ai_settings", args: { provider: "unknown-provider" } }).ok,
    ).toBe(false);
    expect(
      validate({ action: "update_ai_settings", args: { apiKey: "sk-secret" } }).ok,
    ).toBe(false);
  });

  it("清空范围只接受白名单", () => {
    expect(validate({ action: "clear_scope", args: { scope: "planner" } }).ok).toBe(true);
    expect(validate({ action: "clear_scope", args: { scope: "everything" } }).ok).toBe(false);
  });

  it("动作手册要求一次性导入且上限为 40", () => {
    expect(AI_ACTION_GUIDE).toContain("40 个动作");
    expect(AI_ACTION_GUIDE).toContain("必须只生成一个 add_courses_from_text");
  });
});
