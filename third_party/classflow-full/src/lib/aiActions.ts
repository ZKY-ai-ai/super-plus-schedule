import type { AppPage, SettingsTab } from "../types";
import { addDays, dateKey } from "./date";
import { parseCourseText } from "./textImport";
import {
  EXTRA_ACTION_DEFINITIONS,
  describeExtraAction,
  validateExtraAction,
} from "./aiActionExtras";

export type AiActionName =
  | "navigate"
  | "set_week"
  | "open_settings"
  | "open_text_import"
  | "read_manual"
  | "create_note"
  | "update_note"
  | "delete_note"
  | "create_task"
  | "complete_task"
  | "delete_task"
  | "create_exam"
  | "delete_exam"
  | "add_course"
  | "update_course"
  | "delete_course"
  | "add_event"
  | "delete_event"
  | "update_semester"
  | "switch_timetable"
  | "add_courses_from_text"
  | "clear_all"
  | "open_dialog"
  | "print"
  | "undo"
  | "redo"
  | "set_preferences"
  | "set_wallpaper"
  | "create_chapter"
  | "rename_chapter"
  | "delete_chapter"
  | "move_note"
  | "update_task"
  | "reopen_task"
  | "add_subtask"
  | "toggle_subtask"
  | "delete_subtask"
  | "update_exam"
  | "set_grade"
  | "delete_grade"
  | "update_grade_settings"
  | "set_course_slots"
  | "restore_course"
  | "override_session"
  | "remove_override"
  | "update_event"
  | "check_in_event"
  | "create_timetable"
  | "rename_timetable"
  | "duplicate_timetable"
  | "delete_timetable"
  | "set_periods"
  | "rename_period_profile"
  | "set_calendar_override"
  | "delete_calendar_override"
  | "update_reminders"
  | "save_template"
  | "apply_template"
  | "delete_template"
  | "export_data"
  | "sync_widget"
  | "clear_scope"
  | "update_gap_preferences"
  | "add_catalog_section"
  | "update_catalog_section"
  | "delete_catalog_section"
  | "select_catalog_section"
  | "unselect_catalog_section"
  | "create_selection_plan"
  | "switch_selection_plan"
  | "delete_selection_plan"
  | "auto_combine_plan"
  | "add_study_log"
  | "update_ai_settings"
  | "add_memory"
  | "delete_memory"
  | "clear_memory"
  | "tap_woodfish";

export interface AiAction {
  action: AiActionName;
  args: Record<string, unknown>;
  reason?: string;
}

export type AiPlanTab = "gaps" | "study" | "select";

export interface AiActionContext {
  totalWeeks?: number;
  courses?: Array<{ id: string; name: string }>;
  tasks?: Array<{ id: string; title: string; subtasks?: Array<{ id: string; title: string }> }>;
  exams?: Array<{ id: string; title: string }>;
  notes?: Array<{ id: string; title: string }>;
  events?: Array<{ id: string; title: string }>;
  timetables?: Array<{ id: string; name: string }>;
  chapters?: Array<{ id: string; title: string }>;
  overrides?: Array<{ id: string; label: string }>;
  calendarOverrides?: Array<{ id: string; name: string; date: string }>;
  periodProfiles?: Array<{ id: string; name: string }>;
  templates?: Array<{ id: string; name: string }>;
  catalogSections?: Array<{ id: string; name: string }>;
  selectionPlans?: Array<{ id: string; name: string }>;
}

export interface AiActionDefinition {
  name: AiActionName;
  category: string;
  summary: string;
  args: string;
  destructive: boolean;
}

const PAGES: AppPage[] = [
  "timetable",
  "agenda",
  "plan",
  "notes",
  "ai",
  "courses",
  "profile",
];

const PLAN_TABS: AiPlanTab[] = ["gaps", "study", "select"];

const SETTINGS_TABS: SettingsTab[] = [
  "term",
  "periods",
  "tasks",
  "grades",
  "reminders",
  "calendar",
  "academic",
  "data",
  "ai",
  "playground",
  "woodfish",
];

const TASK_REPEATS = ["none", "daily", "weekly", "monthly"] as const;
const EXAM_TYPES = ["quiz", "midterm", "final", "lab", "other"] as const;

const PAGE_LABELS: Record<AppPage, string> = {
  timetable: "周课表",
  agenda: "日程与单日",
  plan: "空档与规划",
  notes: "笔记与看板",
  ai: "AI 助手",
  courses: "课程库",
  profile: "我的",
};

const PLAN_LABELS: Record<AiPlanTab, string> = {
  gaps: "空档评估",
  study: "学习与统计",
  select: "选课规划",
};

const SETTINGS_LABELS: Record<SettingsTab, string> = {
  term: "学期",
  periods: "作息",
  tasks: "任务",
  grades: "成绩",
  reminders: "提醒",
  calendar: "日历",
  academic: "教务导入",
  data: "数据",
  ai: "AI",
  playground: "QQQ 游乐场",
  woodfish: "木鱼",
};

export const AI_ACTION_DEFINITIONS: AiActionDefinition[] = [
  {
    name: "navigate",
    category: "只读与导航",
    summary: "切换页面",
    args: "page, planTab?",
    destructive: false,
  },
  {
    name: "set_week",
    category: "只读与导航",
    summary: "跳到指定教学周",
    args: "week",
    destructive: false,
  },
  {
    name: "open_settings",
    category: "只读与导航",
    summary: "打开设置页",
    args: "tab?",
    destructive: false,
  },
  {
    name: "open_text_import",
    category: "只读与导航",
    summary: "打开文本导入并预填",
    args: "text",
    destructive: false,
  },
  {
    name: "read_manual",
    category: "只读与导航",
    summary: "读取能力手册章节",
    args: "section",
    destructive: false,
  },
  {
    name: "create_note",
    category: "笔记",
    summary: "新建笔记",
    args: "title, body?, tags?, courseId?, pinned?",
    destructive: false,
  },
  {
    name: "update_note",
    category: "笔记",
    summary: "修改笔记",
    args: "id, title?, body?, tags?, pinned?",
    destructive: false,
  },
  {
    name: "delete_note",
    category: "笔记",
    summary: "删除笔记",
    args: "id",
    destructive: true,
  },
  {
    name: "create_task",
    category: "任务",
    summary: "新建任务/作业",
    args: "title, dueDate?, dueTime?, courseId?, note?, estimatedMinutes?, repeat?",
    destructive: false,
  },
  {
    name: "complete_task",
    category: "任务",
    summary: "标记任务完成",
    args: "id",
    destructive: false,
  },
  {
    name: "delete_task",
    category: "任务",
    summary: "删除任务",
    args: "id",
    destructive: true,
  },
  {
    name: "create_exam",
    category: "考试",
    summary: "新建考试",
    args: "title, date, courseId?, type?, startTime?, endTime?, location?, seat?, note?",
    destructive: false,
  },
  {
    name: "delete_exam",
    category: "考试",
    summary: "删除考试",
    args: "id",
    destructive: true,
  },
  {
    name: "add_course",
    category: "课程",
    summary: "新建课程",
    args: "name, teacher?, location?, note?, slots[]",
    destructive: false,
  },
  {
    name: "update_course",
    category: "课程",
    summary: "修改课程基本信息",
    args: "id, name?, teacher?, location?, note?",
    destructive: false,
  },
  {
    name: "delete_course",
    category: "课程",
    summary: "删除课程",
    args: "id",
    destructive: true,
  },
  {
    name: "add_event",
    category: "日程",
    summary: "新建日程",
    args: "title, date, allDay?, start?, end?, note?, repeat?, repeatUntil?",
    destructive: false,
  },
  {
    name: "delete_event",
    category: "日程",
    summary: "删除日程",
    args: "id",
    destructive: true,
  },
  {
    name: "update_semester",
    category: "学期与课表",
    summary: "修改当前学期设置",
    args: "name?, startDate?, totalWeeks?, showWeekends?",
    destructive: false,
  },
  {
    name: "switch_timetable",
    category: "学期与课表",
    summary: "切换课表",
    args: "id",
    destructive: false,
  },
  {
    name: "add_courses_from_text",
    category: "导入",
    summary: "解析文本并批量建课",
    args: "text",
    destructive: false,
  },
  {
    name: "clear_all",
    category: "高风险",
    summary: "清空当前课表数据",
    args: "无",
    destructive: true,
  },
  ...EXTRA_ACTION_DEFINITIONS,
];

export const AI_ACTION_GUIDE = [
  "可执行动作（只能使用下列 action 名和参数；ID 必须来自上下文）：",
  ...AI_ACTION_DEFINITIONS.map(
    (item) =>
      `- ${item.name} {${item.args}}：${item.summary}${item.destructive ? "（高风险）" : ""}`,
  ),
  "输出格式：正常回答后，在末尾追加一个 ```kexu-action 代码块，内容是 JSON 数组，例如",
  '```kexu-action',
  '[{"action":"create_task","args":{"title":"交高数作业","dueDate":"2026-11-20","courseId":"course-xxx"}}]',
  "```",
  "一次回复最多 40 个动作。不要用文字征求确认，也不要让用户回复「确认」、复述目标或提供上下文中已有的 ID：意图明确时直接生成动作，普通动作由界面直接执行；删除、清空等不可逆操作会直接弹出一个确认框。不要说“已完成”，执行结果会写回对话。",
  "导入课表（含附件、Excel、CSV、ICS、截图或文本）必须只生成一个 add_courses_from_text：把所有课程行合并进同一个 text，禁止拆成多个 add_course / add_courses_from_text，也不要说“分两批”。单个动作里的课程数量不设上限。",
  "正文只做简短概述，不要把动作里的完整明细再重复一遍（尤其是长表格）；详细内容放进动作 JSON，并确保代码块完整闭合。",
  "删除、清空、批量导入只在用户明确要求时生成，并在 reason 中说明影响范围；删除类动作的 ID 直接从上下文取，不要反问用户要名称或确认。",
  "需要文件选择器、系统权限或 OAuth 的功能用 open_dialog / open_settings 打开入口，由用户完成授权；不要假装已连接外部服务。",
  "没有可用 ID 或缺少必要参数时，不使用动作，直接向用户说明缺什么。",
].join("\n");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asOptionalString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function asDate(value: unknown): string | null {
  const raw = asString(value, 10);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateKey(parsed) === raw ? raw : null;
}

function asTime(value: unknown): string | null {
  const raw = asString(value, 5);
  if (!raw || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return null;
  return raw;
}

function asOptionalDate(value: unknown): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : asDate(value) ?? undefined;
}

function asOptionalTime(value: unknown): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : asTime(value) ?? undefined;
}

function asPattern(value: unknown): "all" | "odd" | "even" {
  return value === "odd" || value === "even" ? value : "all";
}

function asRepeat(value: unknown): (typeof TASK_REPEATS)[number] {
  return TASK_REPEATS.includes(value as (typeof TASK_REPEATS)[number])
    ? (value as (typeof TASK_REPEATS)[number])
    : "none";
}

function asExamType(value: unknown): (typeof EXAM_TYPES)[number] {
  return EXAM_TYPES.includes(value as (typeof EXAM_TYPES)[number])
    ? (value as (typeof EXAM_TYPES)[number])
    : "other";
}

function asTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = [...new Set(
    value
      .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
      .filter(Boolean),
  )].slice(0, 8);
  return tags.length > 0 ? tags : undefined;
}

function findName(
  list: Array<{ id: string; name?: string; title?: string }> | undefined,
  id: string,
): string | undefined {
  const hit = list?.find((item) => item.id === id);
  return hit?.name ?? hit?.title;
}

function knownId(
  list: Array<{ id: string }> | undefined,
  id: string,
): boolean | null {
  if (!list || list.length === 0) return null;
  return list.some((item) => item.id === id);
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function ok(action: AiAction): { ok: true; action: AiAction } {
  return { ok: true, action };
}

export type AiActionValidation =
  | { ok: true; action: AiAction }
  | { ok: false; error: string };

export function validateAiAction(
  input: AiAction,
  context: AiActionContext = {},
): AiActionValidation {
  const args = isRecord(input.args) ? input.args : {};
  const reason = asOptionalString(input.reason, 200);

  switch (input.action) {
    case "navigate": {
      const page = asString(args.page, 20) as AppPage | null;
      if (!page || !PAGES.includes(page)) {
        return fail("navigate 需要合法 page：timetable/agenda/plan/notes/ai/courses/profile。");
      }
      const rawTab = asString(args.planTab, 10) as AiPlanTab | null;
      const planTab = page === "plan" && rawTab && PLAN_TABS.includes(rawTab) ? rawTab : undefined;
      return ok({ action: "navigate", args: { page, ...(planTab ? { planTab } : {}) }, ...(reason ? { reason } : {}) });
    }

    case "set_week": {
      const week = asInt(args.week);
      if (week === null || week < 1) return fail("set_week 需要正整数 week。");
      if (context.totalWeeks && week > context.totalWeeks) {
        return fail(`week 超出学期总周数 ${context.totalWeeks}。`);
      }
      return ok({ action: "set_week", args: { week }, ...(reason ? { reason } : {}) });
    }

    case "open_settings": {
      const rawTab = asString(args.tab, 30) as SettingsTab | null;
      const tab = rawTab && SETTINGS_TABS.includes(rawTab) ? rawTab : undefined;
      return ok({ action: "open_settings", args: tab ? { tab } : {}, ...(reason ? { reason } : {}) });
    }

    case "open_text_import": {
      const text = asString(args.text, 20_000);
      if (!text) return fail("open_text_import 需要非空 text。");
      return ok({ action: "open_text_import", args: { text }, ...(reason ? { reason } : {}) });
    }

    case "read_manual": {
      const section = asString(args.section, 80);
      if (!section) return fail("read_manual 需要 section。");
      return ok({ action: "read_manual", args: { section }, ...(reason ? { reason } : {}) });
    }

    case "create_note": {
      const title = asString(args.title, 100);
      if (!title) return fail("create_note 需要非空 title。");
      const body = asOptionalString(args.body, 20_000) ?? "";
      const tags = asTags(args.tags);
      const courseId = asOptionalString(args.courseId, 80);
      if (courseId && knownId(context.courses, courseId) === false) {
        return fail(`courseId「${courseId}」不在当前课程上下文中。`);
      }
      const pinned = asBoolean(args.pinned);
      return ok({
        action: "create_note",
        args: {
          title,
          ...(body ? { body } : {}),
          ...(tags ? { tags } : {}),
          ...(courseId ? { courseId } : {}),
          ...(pinned !== undefined ? { pinned } : {}),
        },
        ...(reason ? { reason } : {}),
      });
    }

    case "update_note": {
      const id = asString(args.id, 80);
      if (!id) return fail("update_note 需要 id。");
      if (knownId(context.notes, id) === false) return fail(`笔记「${id}」不存在。`);
      const title = asOptionalString(args.title, 100);
      const body = asOptionalString(args.body, 20_000);
      const tags = asTags(args.tags);
      const pinned = asBoolean(args.pinned);
      if (title === undefined && body === undefined && tags === undefined && pinned === undefined) {
        return fail("update_note 至少提供 title/body/tags/pinned 之一。");
      }
      return ok({
        action: "update_note",
        args: {
          id,
          ...(title !== undefined ? { title } : {}),
          ...(body !== undefined ? { body } : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(pinned !== undefined ? { pinned } : {}),
        },
        ...(reason ? { reason } : {}),
      });
    }

    case "delete_note": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_note 需要 id。");
      if (knownId(context.notes, id) === false) return fail(`笔记「${id}」不存在。`);
      return ok({ action: "delete_note", args: { id }, ...(reason ? { reason } : {}) });
    }

    case "create_task": {
      const title = asString(args.title, 80);
      if (!title) return fail("create_task 需要非空 title。");
      const dueDate = asOptionalDate(args.dueDate);
      if (args.dueDate && !dueDate) return fail("dueDate 必须是 YYYY-MM-DD。");
      const dueTime = asOptionalTime(args.dueTime);
      if (args.dueTime && !dueTime) return fail("dueTime 必须是 HH:MM。");
      if (dueTime && !dueDate) return fail("设置 dueTime 时必须同时提供 dueDate。");
      const courseId = asOptionalString(args.courseId, 80);
      if (courseId && knownId(context.courses, courseId) === false) {
        return fail(`courseId「${courseId}」不在当前课程上下文中。`);
      }
      const note = asOptionalString(args.note, 300);
      const estimated = asInt(args.estimatedMinutes);
      if (args.estimatedMinutes !== undefined && (estimated === null || estimated < 0 || estimated > 525_600)) {
        return fail("estimatedMinutes 必须是 0-525600 的整数。");
      }
      return ok({
        action: "create_task",
        args: {
          title,
          ...(dueDate ? { dueDate } : {}),
          ...(dueTime ? { dueTime } : {}),
          ...(courseId ? { courseId } : {}),
          ...(note ? { note } : {}),
          ...(estimated ? { estimatedMinutes: estimated } : {}),
          ...(dueDate && args.repeat ? { repeat: asRepeat(args.repeat) } : {}),
        },
        ...(reason ? { reason } : {}),
      });
    }

    case "complete_task": {
      const id = asString(args.id, 80);
      if (!id) return fail("complete_task 需要 id。");
      if (knownId(context.tasks, id) === false) return fail(`任务「${id}」不存在。`);
      return ok({ action: "complete_task", args: { id }, ...(reason ? { reason } : {}) });
    }

    case "delete_task": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_task 需要 id。");
      if (knownId(context.tasks, id) === false) return fail(`任务「${id}」不存在。`);
      return ok({ action: "delete_task", args: { id }, ...(reason ? { reason } : {}) });
    }

    case "create_exam": {
      const title = asString(args.title, 80);
      const date = asDate(args.date);
      if (!title) return fail("create_exam 需要非空 title。");
      if (!date) return fail("create_exam 需要合法 date（YYYY-MM-DD）。");
      const courseId = asOptionalString(args.courseId, 80);
      if (courseId && knownId(context.courses, courseId) === false) {
        return fail(`courseId「${courseId}」不在当前课程上下文中。`);
      }
      const startTime = asOptionalTime(args.startTime);
      const endTime = asOptionalTime(args.endTime);
      if (args.startTime && !startTime) return fail("startTime 必须是 HH:MM。");
      if (args.endTime && !endTime) return fail("endTime 必须是 HH:MM。");
      return ok({
        action: "create_exam",
        args: {
          title,
          date,
          ...(courseId ? { courseId } : {}),
          ...(args.type ? { type: asExamType(args.type) } : {}),
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
          ...(asOptionalString(args.location, 80) ? { location: asOptionalString(args.location, 80) } : {}),
          ...(asOptionalString(args.seat, 40) ? { seat: asOptionalString(args.seat, 40) } : {}),
          ...(asOptionalString(args.note, 300) ? { note: asOptionalString(args.note, 300) } : {}),
        },
        ...(reason ? { reason } : {}),
      });
    }

    case "delete_exam": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_exam 需要 id。");
      if (knownId(context.exams, id) === false) return fail(`考试「${id}」不存在。`);
      return ok({ action: "delete_exam", args: { id }, ...(reason ? { reason } : {}) });
    }

    case "add_course": {
      const name = asString(args.name, 80);
      if (!name) return fail("add_course 需要非空 name。");
      if (!Array.isArray(args.slots) || args.slots.length === 0) {
        return fail("add_course 至少需要一个 slots 时段。");
      }
      if (args.slots.length > 20) return fail("add_course 最多 20 个时段。");
      const maxWeek = Math.max(1, Math.min(context.totalWeeks ?? 30, 30));
      const slots: Array<Record<string, unknown>> = [];
      for (const raw of args.slots) {
        if (!isRecord(raw)) return fail("slots 的每一项必须是对象。");
        const day = asInt(raw.day);
        const start = asInt(raw.start);
        const end = asInt(raw.end);
        if (day === null || day < 1 || day > 7) return fail("slots.day 必须是 1-7。");
        if (start === null || start < 1 || start > 14) return fail("slots.start 必须是 1-14。");
        if (end === null || end < start || end > 14) return fail("slots.end 必须 >= start 且 <= 14。");
        const weekStart = asInt(raw.weekStart) ?? 1;
        const weekEnd = asInt(raw.weekEnd) ?? maxWeek;
        if (weekStart < 1 || weekEnd < weekStart || weekEnd > maxWeek) {
          return fail(`slots 周次必须在 1-${maxWeek} 且 weekStart <= weekEnd。`);
        }
        slots.push({
          day,
          start,
          end,
          weekStart,
          weekEnd,
          pattern: asPattern(raw.pattern),
        });
      }
      return ok({
        action: "add_course",
        args: {
          name,
          ...(asOptionalString(args.teacher, 80) ? { teacher: asOptionalString(args.teacher, 80) } : {}),
          ...(asOptionalString(args.location, 80) ? { location: asOptionalString(args.location, 80) } : {}),
          ...(asOptionalString(args.note, 300) ? { note: asOptionalString(args.note, 300) } : {}),
          slots,
        },
        ...(reason ? { reason } : {}),
      });
    }

    case "update_course": {
      const id = asString(args.id, 80);
      if (!id) return fail("update_course 需要 id。");
      if (knownId(context.courses, id) === false) return fail(`课程「${id}」不存在。`);
      const patch: Record<string, unknown> = {};
      const name = asOptionalString(args.name, 80);
      const teacher = asOptionalString(args.teacher, 80);
      const location = asOptionalString(args.location, 80);
      const note = asOptionalString(args.note, 300);
      if (name !== undefined) patch.name = name;
      if (teacher !== undefined) patch.teacher = teacher;
      if (location !== undefined) patch.location = location;
      if (note !== undefined) patch.note = note;
      if (Object.keys(patch).length === 0) {
        return fail("update_course 至少提供 name/teacher/location/note 之一。");
      }
      return ok({ action: "update_course", args: { id, ...patch }, ...(reason ? { reason } : {}) });
    }

    case "delete_course": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_course 需要 id。");
      if (knownId(context.courses, id) === false) return fail(`课程「${id}」不存在。`);
      return ok({ action: "delete_course", args: { id }, ...(reason ? { reason } : {}) });
    }

    case "add_event": {
      const title = asString(args.title, 80);
      const date = asDate(args.date);
      if (!title) return fail("add_event 需要非空 title。");
      if (!date) return fail("add_event 需要合法 date（YYYY-MM-DD）。");
      const start = asOptionalTime(args.start);
      const end = asOptionalTime(args.end);
      const allDay = asBoolean(args.allDay) ?? false;
      if (!allDay && args.start && !start) return fail("start 必须是 HH:MM。");
      if (!allDay && args.end && !end) return fail("end 必须是 HH:MM。");
      const repeat = asRepeat(args.repeat);
      const repeatUntil = asOptionalDate(args.repeatUntil);
      return ok({
        action: "add_event",
        args: {
          title,
          date,
          allDay,
          ...(start ? { start } : {}),
          ...(end ? { end } : {}),
          ...(asOptionalString(args.note, 300) ? { note: asOptionalString(args.note, 300) } : {}),
          ...(args.repeat ? { repeat } : {}),
          ...(repeat !== "none" && repeatUntil ? { repeatUntil } : {}),
        },
        ...(reason ? { reason } : {}),
      });
    }

    case "delete_event": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_event 需要 id。");
      if (knownId(context.events, id) === false) return fail(`日程「${id}」不存在。`);
      return ok({ action: "delete_event", args: { id }, ...(reason ? { reason } : {}) });
    }

    case "update_semester": {
      const patch: Record<string, unknown> = {};
      const name = asOptionalString(args.name, 40);
      const startDate = asOptionalDate(args.startDate);
      if (args.startDate && !startDate) return fail("startDate 必须是 YYYY-MM-DD。");
      const totalWeeks = args.totalWeeks === undefined ? undefined : asInt(args.totalWeeks);
      if (args.totalWeeks !== undefined && (totalWeeks === null || totalWeeks === undefined || totalWeeks < 1 || totalWeeks > 60)) {
        return fail("totalWeeks 必须是 1-60 的整数。");
      }
      const showWeekends = asBoolean(args.showWeekends);
      if (name !== undefined) patch.name = name;
      if (startDate !== undefined) patch.startDate = startDate;
      if (totalWeeks !== null && totalWeeks !== undefined) patch.totalWeeks = totalWeeks;
      if (showWeekends !== undefined) patch.showWeekends = showWeekends;
      if (Object.keys(patch).length === 0) {
        return fail("update_semester 至少提供 name/startDate/totalWeeks/showWeekends 之一。");
      }
      return ok({ action: "update_semester", args: patch, ...(reason ? { reason } : {}) });
    }

    case "switch_timetable": {
      const id = asString(args.id, 80);
      if (!id) return fail("switch_timetable 需要 id。");
      if (knownId(context.timetables, id) === false) return fail(`课表「${id}」不存在。`);
      return ok({ action: "switch_timetable", args: { id }, ...(reason ? { reason } : {}) });
    }

    case "add_courses_from_text": {
      const text = asString(args.text, 20_000);
      if (!text) return fail("add_courses_from_text 需要非空 text。");
      const parsed = parseCourseText(text, context.totalWeeks ?? 20);
      if (parsed.courses.length === 0) return fail("文本里没有解析出可用课程。");
      return ok({
        action: "add_courses_from_text",
        args: { text, parsedCount: parsed.courses.length },
        ...(reason ? { reason } : {}),
      });
    }

    case "clear_all":
      return ok({ action: "clear_all", args: {}, ...(reason ? { reason } : {}) });

    default:
      return validateExtraAction(input, context) ?? fail(`不支持的动作「${(input as AiAction).action}」。`);
  }
}

function formatSlots(action: AiAction): string {
  const slots = action.args.slots;
  if (!Array.isArray(slots)) return "";
  const weekdays = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return slots
    .map((raw) => {
      if (!isRecord(raw)) return "";
      const day = Number(raw.day);
      const start = Number(raw.start);
      const end = Number(raw.end);
      const weekStart = Number(raw.weekStart ?? 1);
      const weekEnd = Number(raw.weekEnd ?? 0);
      const pattern = raw.pattern === "odd" ? "单周" : raw.pattern === "even" ? "双周" : "";
      return `${weekdays[day] ?? "周?"} 第${start}-${end}节 ${weekStart}-${weekEnd}周${pattern ? ` ${pattern}` : ""}`;
    })
    .filter(Boolean)
    .join("；");
}

export function describeAiAction(
  action: AiAction,
  context: AiActionContext = {},
): string {
  const args = action.args;
  switch (action.action) {
    case "navigate": {
      const page = String(args.page) as AppPage;
      const planTab = args.planTab as AiPlanTab | undefined;
      return `打开「${PAGE_LABELS[page] ?? page}」${planTab ? ` · ${PLAN_LABELS[planTab]}` : ""}`;
    }
    case "set_week":
      return `跳到第 ${args.week} 周`;
    case "open_settings":
      return `打开设置${args.tab ? ` · ${SETTINGS_LABELS[args.tab as SettingsTab] ?? args.tab}` : ""}`;
    case "open_text_import":
      return `打开文本导入并预填 ${String(args.text ?? "").length} 个字`;
    case "read_manual":
      return `阅读能力手册「${args.section}」`;
    case "create_note":
      return `新建笔记《${args.title}》`;
    case "update_note":
      return `修改笔记《${findName(context.notes, String(args.id)) ?? args.id}》`;
    case "delete_note":
      return `删除笔记《${findName(context.notes, String(args.id)) ?? args.id}》`;
    case "create_task":
      return `新建任务《${args.title}》${args.dueDate ? `，截止 ${args.dueDate}${args.dueTime ? ` ${args.dueTime}` : ""}` : ""}${args.courseId ? `，关联课程「${findName(context.courses, String(args.courseId)) ?? args.courseId}」` : ""}`;
    case "complete_task":
      return `标记任务《${findName(context.tasks, String(args.id)) ?? args.id}》完成`;
    case "delete_task":
      return `删除任务《${findName(context.tasks, String(args.id)) ?? args.id}》`;
    case "create_exam":
      return `新建考试《${args.title}》${args.date ? `，${args.date}` : ""}${args.location ? `，地点 ${args.location}` : ""}`;
    case "delete_exam":
      return `删除考试《${findName(context.exams, String(args.id)) ?? args.id}》`;
    case "add_course":
      return `新建课程《${args.name}》：${formatSlots(action)}`;
    case "update_course":
      return `修改课程《${findName(context.courses, String(args.id)) ?? args.id}》的基本信息`;
    case "delete_course":
      return `删除课程《${findName(context.courses, String(args.id)) ?? args.id}》及其全部时段`;
    case "add_event":
      return `新建日程《${args.title}》${args.date ? `，${args.date}` : ""}${args.start ? ` ${args.start}-${args.end ?? ""}` : ""}`;
    case "delete_event":
      return `删除日程《${findName(context.events, String(args.id)) ?? args.id}》`;
    case "update_semester":
      return "修改当前学期设置";
    case "switch_timetable":
      return `切换到课表「${findName(context.timetables, String(args.id)) ?? args.id}」`;
    case "add_courses_from_text":
      return `解析文本并批量创建 ${args.parsedCount ?? ""} 门课程`;
    case "clear_all":
      return "清空当前课表的全部数据（课程、日程、学期设置、单次调整，不可恢复）";
    default:
      return describeExtraAction(action, context) ?? "执行一个未知操作";
  }
}

export function isDestructiveAction(action: AiAction): boolean {
  return AI_ACTION_DEFINITIONS.find((item) => item.name === action.action)?.destructive ?? false;
}

export function isKnownAction(value: string): value is AiActionName {
  return AI_ACTION_DEFINITIONS.some((item) => item.name === value);
}

function normalizeRawAction(value: unknown): AiAction | null {
  if (!isRecord(value)) return null;
  const name = typeof value.action === "string" ? value.action.trim() : "";
  if (!name || !isKnownAction(name)) return null;
  const args = isRecord(value.args)
    ? value.args
    : isRecord(value.arguments)
      ? value.arguments
      : isRecord(value.params)
        ? value.params
        : {};
  const reason = asOptionalString(value.reason, 200);
  return { action: name, args, ...(reason ? { reason } : {}) };
}

export interface ParsedAiActions {
  text: string;
  actions: AiAction[];
  errors: string[];
}

const WEEKDAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function addCourseActionToText(action: AiAction): string {
  const args = action.args;
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const teacher = typeof args.teacher === "string" ? args.teacher.trim() : "";
  const location = typeof args.location === "string" ? args.location.trim() : "";
  const slots = Array.isArray(args.slots) ? args.slots : [];
  if (!name || slots.length === 0) return "";
  const lines: string[] = [];
  for (const raw of slots) {
    if (!isRecord(raw)) continue;
    const day = Number(raw.day);
    const start = Number(raw.start);
    const end = Number(raw.end);
    if (!Number.isFinite(day) || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    const weekStart = Number(raw.weekStart ?? 1);
    const weekEnd = Number(raw.weekEnd ?? 20);
    const pattern = raw.pattern === "odd" ? " 单周" : raw.pattern === "even" ? " 双周" : "";
    const weeks = Array.isArray(raw.weeks)
      ? raw.weeks.filter((value): value is number => typeof value === "number")
      : [];
    const suffix = [
      teacher ? ` @${teacher}` : "",
      location ? ` 地点：${location}` : "",
    ].join("");
    if (weeks.length > 0) {
      for (const week of weeks) {
        lines.push(`${name}${suffix} ${WEEKDAY_LABELS[day] ?? ""} 第${start}-${end}节 第${week}周${pattern}`);
      }
    } else {
      lines.push(
        `${name}${suffix} ${WEEKDAY_LABELS[day] ?? ""} 第${start}-${end}节 ${weekStart}-${weekEnd}周${pattern}`,
      );
    }
  }
  return lines.join("\n");
}

function mergeTimetableImports(actions: AiAction[]): AiAction[] {
  const importIndexes: number[] = [];
  const courseIndexes: number[] = [];
  actions.forEach((action, index) => {
    if (action.action === "add_courses_from_text") importIndexes.push(index);
    else if (action.action === "add_course") courseIndexes.push(index);
  });
  const shouldMerge = importIndexes.length + courseIndexes.length > 1;
  if (!shouldMerge || (importIndexes.length === 0 && courseIndexes.length < 2)) return actions;

  const texts: string[] = [];
  for (const index of importIndexes) {
    const text = actions[index].args.text;
    if (typeof text === "string" && text.trim()) texts.push(text.trim());
  }
  for (const index of courseIndexes) {
    const text = addCourseActionToText(actions[index]);
    if (text) texts.push(text);
  }
  if (texts.length === 0) return actions;

  const baseIndex = importIndexes[0] ?? courseIndexes[0];
  const merged: AiAction = {
    action: "add_courses_from_text",
    args: { text: texts.join("\n") },
    reason: actions[baseIndex].reason ?? "用户要求一次性导入整份课表",
  };
  const result: AiAction[] = [];
  let inserted = false;
  actions.forEach((action, index) => {
    if (importIndexes.includes(index) || courseIndexes.includes(index)) {
      if (!inserted && index === baseIndex) {
        result.push(merged);
        inserted = true;
      }
      return;
    }
    result.push(action);
  });
  return result;
}

export function parseAiActions(content: string): ParsedAiActions {
  const errors: string[] = [];
  const blocks: string[] = [];
  const actionBlockRe = /```kexu-action[^\S\r\n]*\r?\n?([\s\S]*?)```/gi;
  const tagBlockRe = /<kexu-action>([\s\S]*?)<\/kexu-action>/gi;
  let text = content.replace(actionBlockRe, (_match, body: string) => {
    blocks.push(body);
    return "";
  });
  text = text.replace(tagBlockRe, (_match, body: string) => {
    blocks.push(body);
    return "";
  });
  const unfinishedActionRe = /```kexu-action[\s\S]*$/i;
  const unfinishedTagRe = /<kexu-action>[\s\S]*$/i;
  if (unfinishedActionRe.test(text) || unfinishedTagRe.test(text)) {
    text = text.replace(unfinishedActionRe, "").replace(unfinishedTagRe, "");
    errors.push("动作代码块在回复末尾被截断（可能达到输出长度上限），本次没有可执行的动作。请让助手重新生成，并把课表合并为单个 add_courses_from_text 动作。");
  }

  let actions: AiAction[] = [];
  for (const block of blocks) {
    const raw = block.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      errors.push("动作代码块不是合法 JSON，已忽略。");
      continue;
    }
    const candidates = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.actions)
        ? parsed.actions
        : [parsed];
    for (const candidate of candidates) {
      const action = normalizeRawAction(candidate);
      if (!action) {
        errors.push("动作代码块里含有未知或缺少 action 的项，已忽略。");
        continue;
      }
      actions.push(action);
    }
  }

  actions = mergeTimetableImports(actions);

  if (actions.length > 40) {
    errors.push("一次最多执行 40 个动作，多出的动作已忽略。");
    actions.splice(40);
  }

  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), actions, errors };
}

function normalizeLocalDate(value: string, now: Date): string | null {
  if (value === "今天") return dateKey(now);
  if (value === "明天") return dateKey(addDays(now, 1));
  return asDate(value);
}

function localTitle(text: string): string {
  const bracket = /《([^》]+)》/.exec(text);
  if (bracket) return bracket[1].trim().slice(0, 80);
  return text
    .split(/[，,。；;\n]/)[0]
    .replace(/(截止|地点|内容|备注)[：:].*$/, "")
    .trim()
    .slice(0, 80);
}

function localTags(text: string): string[] | undefined {
  const tags = [...text.matchAll(/#([\p{L}\p{N}_-]{1,20})/gu)].map((match) =>
    match[1].toLowerCase(),
  );
  return tags.length > 0 ? [...new Set(tags)].slice(0, 8) : undefined;
}

function matchCourse(text: string, context: AiActionContext): string | undefined {
  const normalized = text.replace(/[（(].*?[)）]/g, "").replace(/\s+/g, "").toLowerCase();
  return context.courses?.find((course) => {
    const name = course.name.replace(/[（(].*?[)）]/g, "").replace(/\s+/g, "").toLowerCase();
    return name.length >= 2 && normalized.includes(name);
  })?.id;
}

/**
 * 本地规则模式只识别明确的固定指令，避免把普通问句误判成写操作。
 */
export function parseLocalCommand(
  text: string,
  context: AiActionContext = {},
  now = new Date(),
): AiAction[] {
  const input = text.trim();
  if (!input || input.length > 800) return [];

  const weekOnly = /^(?:请|帮我)?\s*(?:跳到|跳转|切到|切换到|去|打开)?\s*第?\s*(\d{1,2})\s*周(?:课表)?[。.!！]?$/.exec(input);
  if (weekOnly) {
    return [{ action: "set_week", args: { week: Number(weekOnly[1]) } }];
  }

  if (/^(?:请|帮我)?\s*(?:打开|去|进入|切换到|切到|查看|看看)/.test(input)) {
    if (/空档|课间/.test(input)) {
      return [{ action: "navigate", args: { page: "plan", planTab: "gaps" } }];
    }
    if (/选课/.test(input)) {
      return [{ action: "navigate", args: { page: "plan", planTab: "select" } }];
    }
    if (/学习|统计|番茄|复习/.test(input)) {
      return [{ action: "navigate", args: { page: "plan", planTab: "study" } }];
    }
    if (/设置/.test(input)) {
      const tab: SettingsTab | undefined =
        /学期/.test(input) ? "term"
          : /作息|节次/.test(input) ? "periods"
            : /任务/.test(input) ? "tasks"
              : /成绩|考试/.test(input) ? "grades"
                : /提醒/.test(input) ? "reminders"
                  : /日历|节假日/.test(input) ? "calendar"
                    : /数据|导入|导出/.test(input) ? "data"
                      : /ai|助手/i.test(input) ? "ai"
                        : /木鱼/.test(input) ? "woodfish"
                          : /游乐场|qqq/i.test(input) ? "playground"
                            : undefined;
      return [{ action: "open_settings", args: tab ? { tab } : {} }];
    }
    const weekMatch = /第?\s*(\d{1,2})\s*周/.exec(input);
    if (weekMatch && /周/.test(input)) {
      return [{ action: "set_week", args: { week: Number(weekMatch[1]) } }];
    }
    if (/笔记/.test(input)) return [{ action: "navigate", args: { page: "notes" } }];
    if (/课程库|课程/.test(input)) return [{ action: "navigate", args: { page: "courses" } }];
    if (/日程|单日/.test(input)) return [{ action: "navigate", args: { page: "agenda" } }];
    if (/我的|个人/.test(input)) return [{ action: "navigate", args: { page: "profile" } }];
    if (/ai|助手/i.test(input)) return [{ action: "navigate", args: { page: "ai" } }];
    if (/课表/.test(input)) return [{ action: "navigate", args: { page: "timetable" } }];
  }

  const noteMatch = /^(?:请|帮我)?\s*(?:新建|添加|创建|记一条|记个)\s*(?:一条|一个|个)?\s*笔记\s*[：:，,]?\s*([\s\S]+)$/.exec(input);
  if (noteMatch) {
    const rest = noteMatch[1];
    const contentMatch = /内容[：:]\s*([\s\S]+)$/.exec(rest);
    const title = contentMatch ? localTitle(rest.slice(0, contentMatch.index)) : localTitle(rest);
    if (!title) return [];
    return [{
      action: "create_note",
      args: {
        title,
        ...(contentMatch ? { body: contentMatch[1].trim() } : {}),
        ...(localTags(rest) ? { tags: localTags(rest) } : {}),
      },
    }];
  }

  const taskMatch = /^(?:请|帮我)?\s*(?:新建|添加|创建)\s*(?:一个|个)?\s*(?:任务|作业)\s*[：:，,]?\s*([\s\S]+)$/.exec(input);
  if (taskMatch) {
    const rest = taskMatch[1];
    const dateMatch = /(?:截止|due)?\s*(今天|明天|\d{4}-\d{1,2}-\d{1,2})/.exec(rest);
    const dueDate = dateMatch ? normalizeLocalDate(dateMatch[1], now) ?? undefined : undefined;
    const timeMatch = /(\d{1,2}:\d{2})/.exec(rest);
    const estimatedMatch = /(\d+)\s*分钟/.exec(rest);
    const title = localTitle(rest.replace(dateMatch?.[0] ?? "", "").replace(timeMatch?.[0] ?? "", ""));
    if (!title) return [];
    const courseId = matchCourse(rest, context);
    return [{
      action: "create_task",
      args: {
        title,
        ...(dueDate ? { dueDate } : {}),
        ...(dueDate && timeMatch ? { dueTime: timeMatch[1].padStart(5, "0") } : {}),
        ...(courseId ? { courseId } : {}),
        ...(estimatedMatch ? { estimatedMinutes: Number(estimatedMatch[1]) } : {}),
      },
    }];
  }

  const examMatch = /^(?:请|帮我)?\s*(?:新建|添加|创建)\s*(?:一个|个)?\s*考试\s*[：:，,]?\s*([\s\S]+)$/.exec(input);
  if (examMatch) {
    const rest = examMatch[1];
    const dateMatch = /(今天|明天|\d{4}-\d{1,2}-\d{1,2})/.exec(rest);
    const date = dateMatch ? normalizeLocalDate(dateMatch[1], now) : null;
    if (!date) return [];
    const timeMatch = /(\d{1,2}:\d{2})/.exec(rest);
    const locationMatch = /(?:地点|教室)[：:]\s*([^\s，,。;；]+)/.exec(rest);
    const title = localTitle(rest.replace(dateMatch?.[0] ?? "", "").replace(timeMatch?.[0] ?? "", ""));
    if (!title) return [];
    const courseId = matchCourse(rest, context);
    return [{
      action: "create_exam",
      args: {
        title,
        date,
        ...(courseId ? { courseId } : {}),
        ...(timeMatch ? { startTime: timeMatch[1].padStart(5, "0") } : {}),
        ...(locationMatch ? { location: locationMatch[1] } : {}),
      },
    }];
  }

  const eventMatch = /^(?:请|帮我)?\s*(?:新建|添加|创建)\s*(?:一个|个)?\s*(?:日程|事件)\s*[：:，,]?\s*([\s\S]+)$/.exec(input);
  if (eventMatch) {
    const rest = eventMatch[1];
    const dateMatch = /(今天|明天|\d{4}-\d{1,2}-\d{1,2})/.exec(rest);
    const date = dateMatch ? normalizeLocalDate(dateMatch[1], now) : null;
    if (!date) return [];
    const timeMatch = /(\d{1,2}:\d{2})/.exec(rest);
    const title = localTitle(rest.replace(dateMatch?.[0] ?? "", "").replace(timeMatch?.[0] ?? "", ""));
    if (!title) return [];
    return [{
      action: "add_event",
      args: {
        title,
        date,
        ...(timeMatch ? { start: timeMatch[1].padStart(5, "0") } : {}),
      },
    }];
  }

  const courseMatch = /^(?:请|帮我)?\s*(?:新建|添加|创建)\s*(?:一门|门)?\s*课程\s*[：:，,]?\s*([\s\S]+)$/.exec(input);
  if (courseMatch) {
    const parsed = parseCourseText(courseMatch[1], context.totalWeeks ?? 20);
    const course = parsed.courses[0];
    if (!course) return [];
    return [{
      action: "add_course",
      args: {
        name: course.name,
        teacher: course.teacher,
        location: course.location,
        slots: course.slots,
      },
    }];
  }

  return [];
}