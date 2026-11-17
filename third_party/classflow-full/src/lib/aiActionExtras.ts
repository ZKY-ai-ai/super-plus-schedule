import type {
  AiAction,
  AiActionContext,
  AiActionDefinition,
  AiActionValidation,
} from "./aiActions";

const DIALOGS = [
  "text-import",
  "share",
  "timetables",
  "wallpaper",
  "week-picker",
  "command-palette",
] as const;
type DialogId = (typeof DIALOGS)[number];

const THEMES = ["light", "dark", "whale"] as const;

const WALLPAPER_PRESETS = ["paper", "sage", "dawn", "dusk", "whale-night"] as const;

const SCOPES = ["notes", "tasks", "exams", "grades", "planner", "woodfish"] as const;
type ClearScope = (typeof SCOPES)[number];

const CATEGORIES = ["required", "elective", "general", "pe", "lab", "other"] as const;
type CategoryId = (typeof CATEGORIES)[number];

const GRADE_STATUSES = ["normal", "retake", "exempt", "audit", "planned"] as const;

const AI_PROVIDERS = [
  "local",
  "openai",
  "deepseek",
  "zhipu",
  "qwen",
  "moonshot",
  "siliconflow",
  "openrouter",
  "openai-compatible",
  "ollama",
  "lmstudio",
  "custom-local",
] as const;

const AI_TONES = ["concise", "warm", "playful"] as const;

const TEMPLATE_IDS = ["blank", "stem", "humanities", "medical", "exam"] as const;

const STUDY_KINDS = ["pomodoro", "manual", "review"] as const;

const DIALOG_LABELS: Record<DialogId, string> = {
  "text-import": "文本导入",
  share: "课表分享",
  timetables: "多课表管理",
  wallpaper: "壁纸",
  "week-picker": "周次选择",
  "command-palette": "命令面板",
};

const SCOPE_LABELS: Record<ClearScope, string> = {
  notes: "笔记与章节",
  tasks: "当前课表的任务",
  exams: "当前课表的考试",
  grades: "当前课表的成绩",
  planner: "选课池、选课方案、学习记录与空档偏好",
  woodfish: "木鱼计数",
};

function def(
  name: AiAction["action"],
  category: string,
  summary: string,
  args: string,
  destructive = false,
): AiActionDefinition {
  return { name, category, summary, args, destructive };
}

export const EXTRA_ACTION_DEFINITIONS: AiActionDefinition[] = [
  def("open_dialog", "只读与导航", "打开导入/分享/壁纸等弹窗", "dialog", false),
  def("print", "只读与导航", "打印当前课表", "无", false),
  def("undo", "只读与导航", "撤销上一次数据修改", "无", false),
  def("redo", "只读与导航", "重做被撤销的修改", "无", false),
  def("set_preferences", "偏好", "切换主题、布局、别名与自动节假日", "theme?, layout?, showAliases?, autoHolidays?", false),
  def("set_wallpaper", "偏好", "设置课表壁纸", "preset, dim?", false),
  def("create_chapter", "笔记", "新建笔记章节", "title, courseId?, order?", false),
  def("rename_chapter", "笔记", "重命名笔记章节", "id, title", false),
  def("delete_chapter", "笔记", "删除笔记章节（笔记回到未归档）", "id", true),
  def("move_note", "笔记", "把笔记移入/移出章节", "noteId, chapterId?", false),
  def("update_task", "任务", "修改任务", "id, title?, dueDate?, dueTime?, courseId?, note?, estimatedMinutes?, repeat?", false),
  def("reopen_task", "任务", "把已完成任务改回未完成", "id", false),
  def("add_subtask", "任务", "给任务加子任务", "taskId, title", false),
  def("toggle_subtask", "任务", "勾选/取消子任务", "taskId, subtaskId", false),
  def("delete_subtask", "任务", "删除子任务", "taskId, subtaskId", true),
  def("update_exam", "考试", "修改考试", "id, title?, date?, courseId?, type?, startTime?, endTime?, location?, seat?, note?", false),
  def("set_grade", "成绩", "录入或修改成绩", "courseId, score?, credits?, status?", false),
  def("delete_grade", "成绩", "删除一条成绩", "courseId", true),
  def("update_grade_settings", "成绩", "修改成绩隐私与毕业学分", "hideScores?, requiredCredits?", false),
  def("set_course_slots", "课程", "整体替换课程的上课时段", "courseId, slots[]", false),
  def("restore_course", "课程", "恢复被隐藏的课程", "courseId", false),
  def("override_session", "单次调整", "停课/调课/从某周起隐藏", "courseId, week, kind, slotId?, toDay?, toStart?, toEnd?", false),
  def("remove_override", "单次调整", "撤销一条单次调整", "id", false),
  def("update_event", "日程", "修改日程", "id, title?, date?, allDay?, start?, end?, note?, repeat?, repeatUntil?", false),
  def("check_in_event", "日程", "切换某次日程打卡", "id, date", false),
  def("create_timetable", "学期与课表", "新建一套课表", "name, semesterName?, startDate?, totalWeeks?, showWeekends?, weekStartsOn?, periodProfileId?, templateId?", false),
  def("rename_timetable", "学期与课表", "重命名课表", "id, name", false),
  def("duplicate_timetable", "学期与课表", "复制一套课表", "id", false),
  def("delete_timetable", "学期与课表", "删除一套课表", "id", true),
  def("set_periods", "学期与课表", "整体替换每日作息时间", "periods[], profileId?", false),
  def("rename_period_profile", "学期与课表", "重命名作息方案", "id, name", false),
  def("set_calendar_override", "日历与提醒", "把某天设为放假或补课", "date, kind, name?, borrowFrom?", false),
  def("delete_calendar_override", "日历与提醒", "删除某天的放假/补课调整", "id", false),
  def("update_reminders", "日历与提醒", "修改上课、考试与 DDL 提醒", "enabled?, leadMinutes?, todaySummary?, todaySummaryTime?, tomorrowSummary?, tomorrowSummaryTime?, examReminders?, taskReminders?", false),
  def("save_template", "导入导出与备份", "把当前课表存为模板", "name", false),
  def("apply_template", "导入导出与备份", "把模板课程追加到当前课表", "id", false),
  def("delete_template", "导入导出与备份", "删除课表模板", "id", true),
  def("export_data", "导入导出与备份", "导出 JSON/ICS 文件", "format", false),
  def("sync_widget", "导入导出与备份", "同步桌面小组件（原生端）", "无", false),
  def("clear_scope", "高风险", "按范围清空本地数据", "scope", true),
  def("update_gap_preferences", "空档与选课", "修改空档评估的步行、缓冲与午饭偏好", "walkSpeed?, bufferMinutes?, lunchEnabled?, lunchStart?, lunchEnd?, lunchMinutes?, accessMode?, accessibleExtra?, aliases?, customWalks?", false),
  def("add_catalog_section", "空档与选课", "向选课课程池添加候选班次", "name, credits, category, day, start, end, teacher?, location?, code?, weekStart?, weekEnd?, pattern?, difficulty?, examWeek?, note?", false),
  def("update_catalog_section", "空档与选课", "修改课程池里的候选班次", "id, name?, credits?, category?, teacher?, location?, code?, difficulty?, note?, examWeek?", false),
  def("delete_catalog_section", "空档与选课", "从课程池删除候选班次", "id", true),
  def("select_catalog_section", "空档与选课", "把候选班次加入当前选课方案", "id", false),
  def("unselect_catalog_section", "空档与选课", "从当前选课方案移除班次", "id", false),
  def("create_selection_plan", "空档与选课", "新建选课方案", "name?", false),
  def("switch_selection_plan", "空档与选课", "切换选课方案", "id", false),
  def("delete_selection_plan", "空档与选课", "删除选课方案", "id", true),
  def("auto_combine_plan", "空档与选课", "自动生成一套选课组合", "maxCredits?, maxWeeklyPeriods?, categories?", false),
  def("add_study_log", "学习", "手动补记一段学习时长", "subject, minutes, courseId?, start?, kind?, note?", false),
  def("update_ai_settings", "AI 助手", "修改 AI 提供方、人格与分项授权（不接收密钥）", "provider?, baseUrl?, model?, personaName?, tone?, customPrompt?, permissions?", false),
  def("add_memory", "AI 助手", "新增长期记忆", "text", false),
  def("delete_memory", "AI 助手", "删除一条长期记忆", "id", true),
  def("clear_memory", "AI 助手", "清空长期记忆", "无", true),
  def("tap_woodfish", "彩蛋", "敲木鱼", "times?", false),
];

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
  if (value === null || value === undefined) return undefined;
  return asString(value, max) ?? undefined;
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
  const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate(),
  ).padStart(2, "0")}`;
  return key === raw ? raw : null;
}

function asTime(value: unknown): string | null {
  const raw = asString(value, 5);
  if (!raw || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return null;
  return raw;
}

function asOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): T | undefined {
  return options.includes(value as T) ? (value as T) : undefined;
}

function knownId(
  list: Array<{ id: string }> | undefined,
  id: string,
): boolean | null {
  if (!list || list.length === 0) return null;
  return list.some((item) => item.id === id);
}

function findName(
  list: Array<{ id: string; name?: string; title?: string }> | undefined,
  id: string,
): string | undefined {
  const hit = list?.find((item) => item.id === id);
  return hit?.name ?? hit?.title;
}

function fail(error: string): AiActionValidation {
  return { ok: false, error };
}

function ok(
  action: AiAction,
  args: Record<string, unknown>,
  reason?: string,
): AiActionValidation {
  return { ok: true, action: { action: action.action, args, ...(reason ? { reason } : {}) } };
}

function validateSlots(
  raw: unknown,
  maxWeek: number,
): { ok: true; slots: Array<Record<string, unknown>> } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "至少需要一个 slots 时段。" };
  }
  if (raw.length > 20) return { ok: false, error: "最多 20 个时段。" };
  const slots: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    if (!isRecord(item)) return { ok: false, error: "slots 的每一项必须是对象。" };
    const day = asInt(item.day);
    const start = asInt(item.start);
    const end = asInt(item.end);
    if (day === null || day < 1 || day > 7) return { ok: false, error: "slots.day 必须是 1-7。" };
    if (start === null || start < 1 || start > 14) return { ok: false, error: "slots.start 必须是 1-14。" };
    if (end === null || end < start || end > 14) return { ok: false, error: "slots.end 必须 >= start 且 <= 14。" };
    const weekStart = asInt(item.weekStart) ?? 1;
    const weekEnd = asInt(item.weekEnd) ?? maxWeek;
    if (weekStart < 1 || weekEnd < weekStart || weekEnd > maxWeek) {
      return { ok: false, error: `slots 周次必须在 1-${maxWeek} 且 weekStart <= weekEnd。` };
    }
    const weeks = Array.isArray(item.weeks)
      ? [...new Set(item.weeks.map((value) => asInt(value)).filter((value): value is number => value !== null && value >= 1 && value <= maxWeek))].sort((a, b) => a - b)
      : undefined;
    slots.push({
      day,
      start,
      end,
      weekStart,
      weekEnd,
      pattern: asOneOf(item.pattern, ["all", "odd", "even"] as const) ?? "all",
      ...(weeks && weeks.length > 0 ? { weeks } : {}),
    });
  }
  return { ok: true, slots };
}

export function validateExtraAction(
  input: AiAction,
  context: AiActionContext = {},
): AiActionValidation | null {
  const args = isRecord(input.args) ? input.args : {};
  const reason = asOptionalString(input.reason, 200);
  const maxWeek = Math.max(1, Math.min(context.totalWeeks ?? 30, 30));

  switch (input.action) {
    case "open_dialog": {
      const dialog = asOneOf(args.dialog, DIALOGS);
      if (!dialog) return fail(`open_dialog 需要合法 dialog：${DIALOGS.join("/")}。`);
      return ok(input, { dialog }, reason);
    }

    case "print":
    case "undo":
    case "redo":
    case "sync_widget":
    case "clear_memory":
      return ok(input, {}, reason);

    case "set_preferences": {
      const patch: Record<string, unknown> = {};
      const theme = asOneOf(args.theme, THEMES);
      if (args.theme !== undefined && !theme) return fail("theme 必须是 light/dark/whale。");
      const layout = asOneOf(args.layout, ["grid", "list"] as const);
      if (args.layout !== undefined && !layout) return fail("layout 必须是 grid/list。");
      const showAliases = asBoolean(args.showAliases);
      const autoHolidays = asBoolean(args.autoHolidays);
      if (theme) patch.theme = theme;
      if (layout) patch.layout = layout;
      if (showAliases !== undefined) patch.showAliases = showAliases;
      if (autoHolidays !== undefined) patch.autoHolidays = autoHolidays;
      if (Object.keys(patch).length === 0) {
        return fail("set_preferences 至少提供 theme/layout/showAliases/autoHolidays 之一。");
      }
      return ok(input, patch, reason);
    }

    case "set_wallpaper": {
      const preset = asOneOf(args.preset, WALLPAPER_PRESETS);
      if (!preset) return fail(`preset 必须是 ${WALLPAPER_PRESETS.join("/")}。`);
      const dim = args.dim === undefined ? 20 : asInt(args.dim);
      if (dim === null || dim < 0 || dim > 80) return fail("dim 必须是 0-80 的整数。");
      return ok(input, { preset, dim }, reason);
    }

    case "create_chapter": {
      const title = asString(args.title, 60);
      if (!title) return fail("create_chapter 需要非空 title。");
      const courseId = asOptionalString(args.courseId, 80);
      if (courseId && knownId(context.courses, courseId) === false) {
        return fail(`courseId「${courseId}」不在当前课程上下文中。`);
      }
      const order = args.order === undefined ? null : asInt(args.order);
      if (args.order !== undefined && (order === null || order < 0 || order > 999)) {
        return fail("order 必须是 0-999 的整数。");
      }
      return ok(input, { title, ...(courseId ? { courseId } : {}), ...(typeof order === "number" ? { order } : {}) }, reason);
    }

    case "rename_chapter": {
      const id = asString(args.id, 80);
      const title = asString(args.title, 60);
      if (!id) return fail("rename_chapter 需要 id。");
      if (!title) return fail("rename_chapter 需要非空 title。");
      if (knownId(context.chapters, id) === false) return fail(`章节「${id}」不存在。`);
      return ok(input, { id, title }, reason);
    }

    case "delete_chapter": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_chapter 需要 id。");
      if (knownId(context.chapters, id) === false) return fail(`章节「${id}」不存在。`);
      return ok(input, { id }, reason);
    }

    case "move_note": {
      const noteId = asString(args.noteId, 80);
      if (!noteId) return fail("move_note 需要 noteId。");
      if (knownId(context.notes, noteId) === false) return fail(`笔记「${noteId}」不存在。`);
      const chapterId = asOptionalString(args.chapterId, 80);
      if (chapterId && knownId(context.chapters, chapterId) === false) {
        return fail(`章节「${chapterId}」不存在。`);
      }
      return ok(input, { noteId, ...(chapterId ? { chapterId } : {}) }, reason);
    }

    case "update_task": {
      const id = asString(args.id, 80);
      if (!id) return fail("update_task 需要 id。");
      if (knownId(context.tasks, id) === false) return fail(`任务「${id}」不存在。`);
      const patch: Record<string, unknown> = {};
      const title = asOptionalString(args.title, 80);
      if (title !== undefined) patch.title = title;
      if (args.dueDate !== undefined) {
        if (args.dueDate === "" || args.dueDate === null) patch.dueDate = "";
        else {
          const date = asDate(args.dueDate);
          if (!date) return fail("dueDate 必须是 YYYY-MM-DD，或传空字符串清除。");
          patch.dueDate = date;
        }
      }
      if (args.dueTime !== undefined) {
        if (args.dueTime === "" || args.dueTime === null) patch.dueTime = "";
        else {
          const time = asTime(args.dueTime);
          if (!time) return fail("dueTime 必须是 HH:MM，或传空字符串清除。");
          patch.dueTime = time;
        }
      }
      if (patch.dueTime && !patch.dueDate) return fail("修改 dueTime 时必须同时提供 dueDate。");
      if (args.courseId !== undefined) {
        if (args.courseId === "" || args.courseId === null) patch.courseId = null;
        else {
          const courseId = asString(args.courseId, 80);
          if (!courseId) return fail("courseId 不合法。");
          if (knownId(context.courses, courseId) === false) return fail(`课程「${courseId}」不存在。`);
          patch.courseId = courseId;
        }
      }
      if (args.note !== undefined) patch.note = typeof args.note === "string" ? args.note.slice(0, 300) : "";
      if (args.estimatedMinutes !== undefined) {
        const minutes = asInt(args.estimatedMinutes);
        if (minutes === null || minutes < 0 || minutes > 525_600) {
          return fail("estimatedMinutes 必须是 0-525600 的整数。");
        }
        patch.estimatedMinutes = minutes;
      }
      const repeat = asOneOf(args.repeat, ["none", "daily", "weekly", "monthly"] as const);
      if (args.repeat !== undefined && !repeat) return fail("repeat 必须是 none/daily/weekly/monthly。");
      if (repeat) patch.repeat = repeat;
      if (Object.keys(patch).length === 0) return fail("update_task 至少提供一项要修改的字段。");
      return ok(input, { id, ...patch }, reason);
    }

    case "reopen_task": {
      const id = asString(args.id, 80);
      if (!id) return fail("reopen_task 需要 id。");
      if (knownId(context.tasks, id) === false) return fail(`任务「${id}」不存在。`);
      return ok(input, { id }, reason);
    }

    case "add_subtask": {
      const taskId = asString(args.taskId, 80);
      const title = asString(args.title, 80);
      if (!taskId || !title) return fail("add_subtask 需要 taskId 和 title。");
      if (knownId(context.tasks, taskId) === false) return fail(`任务「${taskId}」不存在。`);
      return ok(input, { taskId, title }, reason);
    }

    case "toggle_subtask":
    case "delete_subtask": {
      const taskId = asString(args.taskId, 80);
      const subtaskId = asString(args.subtaskId, 80);
      if (!taskId || !subtaskId) return fail(`${input.action} 需要 taskId 和 subtaskId。`);
      if (knownId(context.tasks, taskId) === false) return fail(`任务「${taskId}」不存在。`);
      return ok(input, { taskId, subtaskId }, reason);
    }

    case "update_exam": {
      const id = asString(args.id, 80);
      if (!id) return fail("update_exam 需要 id。");
      if (knownId(context.exams, id) === false) return fail(`考试「${id}」不存在。`);
      const patch: Record<string, unknown> = {};
      const title = asOptionalString(args.title, 80);
      if (title !== undefined) patch.title = title;
      if (args.date !== undefined) {
        const date = asDate(args.date);
        if (!date) return fail("date 必须是 YYYY-MM-DD。");
        patch.date = date;
      }
      if (args.courseId !== undefined) {
        if (args.courseId === "" || args.courseId === null) patch.courseId = null;
        else {
          const courseId = asString(args.courseId, 80);
          if (!courseId) return fail("courseId 不合法。");
          if (knownId(context.courses, courseId) === false) return fail(`课程「${courseId}」不存在。`);
          patch.courseId = courseId;
        }
      }
      const type = asOneOf(args.type, ["quiz", "midterm", "final", "lab", "other"] as const);
      if (args.type !== undefined && !type) return fail("type 不合法。");
      if (type) patch.type = type;
      for (const field of ["startTime", "endTime"] as const) {
        if (args[field] === undefined) continue;
        if (args[field] === "" || args[field] === null) {
          patch[field] = "";
          continue;
        }
        const time = asTime(args[field]);
        if (!time) return fail(`${field} 必须是 HH:MM。`);
        patch[field] = time;
      }
      for (const field of ["location", "seat", "note"] as const) {
        if (args[field] !== undefined) {
          patch[field] = typeof args[field] === "string" ? String(args[field]).slice(0, 300) : "";
        }
      }
      if (Object.keys(patch).length === 0) return fail("update_exam 至少提供一项要修改的字段。");
      return ok(input, { id, ...patch }, reason);
    }

    case "set_grade": {
      const courseId = asString(args.courseId, 80);
      if (!courseId) return fail("set_grade 需要 courseId。");
      if (knownId(context.courses, courseId) === false) return fail(`课程「${courseId}」不存在。`);
      const patch: Record<string, unknown> = { courseId };
      if (args.score !== undefined) {
        if (args.score === null || args.score === "") patch.score = null;
        else {
          const score = Number(args.score);
          if (!Number.isFinite(score) || score < 0 || score > 100) return fail("score 必须是 0-100 或 null。");
          patch.score = Math.round(score * 10) / 10;
        }
      }
      if (args.credits !== undefined) {
        if (args.credits === null || args.credits === "") patch.credits = null;
        else {
          const credits = Number(args.credits);
          if (!Number.isFinite(credits) || credits < 0.5 || credits > 30) return fail("credits 必须在 0.5-30 之间或为 null。");
          patch.credits = Math.round(credits * 10) / 10;
        }
      }
      if (args.status !== undefined) {
        const status = asOneOf(args.status, GRADE_STATUSES);
        if (!status) return fail(`status 必须是 ${GRADE_STATUSES.join("/")}。`);
        patch.status = status;
      }
      if (Object.keys(patch).length === 1) return fail("set_grade 至少提供 score/credits/status 之一。");
      return ok(input, patch, reason);
    }

    case "delete_grade": {
      const courseId = asString(args.courseId, 80);
      if (!courseId) return fail("delete_grade 需要 courseId。");
      if (knownId(context.courses, courseId) === false) return fail(`课程「${courseId}」不存在。`);
      return ok(input, { courseId }, reason);
    }

    case "update_grade_settings": {
      const patch: Record<string, unknown> = {};
      const hideScores = asBoolean(args.hideScores);
      if (args.hideScores !== undefined && hideScores === undefined) return fail("hideScores 必须是布尔值。");
      if (hideScores !== undefined) patch.hideScores = hideScores;
      if (args.requiredCredits !== undefined) {
        const credits = Number(args.requiredCredits);
        if (!Number.isFinite(credits) || credits < 0 || credits > 300) return fail("requiredCredits 必须是 0-300。");
        patch.requiredCredits = Math.round(credits * 10) / 10;
      }
      if (Object.keys(patch).length === 0) return fail("update_grade_settings 至少提供一项。");
      return ok(input, patch, reason);
    }

    case "set_course_slots": {
      const courseId = asString(args.courseId, 80);
      if (!courseId) return fail("set_course_slots 需要 courseId。");
      if (knownId(context.courses, courseId) === false) return fail(`课程「${courseId}」不存在。`);
      const slots = validateSlots(args.slots, maxWeek);
      if (!slots.ok) return fail(slots.error);
      return ok(input, { courseId, slots: slots.slots }, reason);
    }

    case "restore_course": {
      const courseId = asString(args.courseId, 80);
      if (!courseId) return fail("restore_course 需要 courseId。");
      if (knownId(context.courses, courseId) === false) return fail(`课程「${courseId}」不存在。`);
      return ok(input, { courseId }, reason);
    }

    case "override_session": {
      const courseId = asString(args.courseId, 80);
      if (!courseId) return fail("override_session 需要 courseId。");
      if (knownId(context.courses, courseId) === false) return fail(`课程「${courseId}」不存在。`);
      const week = asInt(args.week);
      if (week === null || week < 1 || week > maxWeek) return fail(`week 必须在 1-${maxWeek}。`);
      const kind = asOneOf(args.kind, ["cancel", "move", "hide"] as const);
      if (!kind) return fail("kind 必须是 cancel/move/hide。");
      if (kind === "hide") {
        return ok(input, { courseId, week, kind }, reason);
      }
      const slotId = asString(args.slotId, 80);
      if (!slotId) return fail(`${kind} 需要 slotId。`);
      if (kind === "cancel") return ok(input, { courseId, slotId, week, kind }, reason);
      const toDay = asInt(args.toDay);
      const toStart = asInt(args.toStart);
      const toEnd = asInt(args.toEnd) ?? toStart;
      if (toDay === null || toDay < 1 || toDay > 7) return fail("toDay 必须是 1-7。");
      if (toStart === null || toStart < 1 || toStart > 14) return fail("toStart 必须是 1-14。");
      if (toEnd === null || toEnd < toStart || toEnd > 14) return fail("toEnd 必须 >= toStart 且 <= 14。");
      return ok(input, { courseId, slotId, week, kind, toDay, toStart, toEnd }, reason);
    }

    case "remove_override": {
      const id = asString(args.id, 80);
      if (!id) return fail("remove_override 需要 id。");
      if (knownId(context.overrides, id) === false) return fail(`单次调整「${id}」不存在。`);
      return ok(input, { id }, reason);
    }

    case "update_event": {
      const id = asString(args.id, 80);
      if (!id) return fail("update_event 需要 id。");
      if (knownId(context.events, id) === false) return fail(`日程「${id}」不存在。`);
      const patch: Record<string, unknown> = {};
      const title = asOptionalString(args.title, 80);
      if (title !== undefined) patch.title = title;
      if (args.date !== undefined) {
        const date = asDate(args.date);
        if (!date) return fail("date 必须是 YYYY-MM-DD。");
        patch.date = date;
      }
      const allDay = asBoolean(args.allDay);
      if (args.allDay !== undefined && allDay === undefined) return fail("allDay 必须是布尔值。");
      if (allDay !== undefined) patch.allDay = allDay;
      for (const field of ["start", "end"] as const) {
        if (args[field] === undefined) continue;
        if (args[field] === "" || args[field] === null) {
          patch[field] = "";
          continue;
        }
        const time = asTime(args[field]);
        if (!time) return fail(`${field} 必须是 HH:MM。`);
        patch[field] = time;
      }
      if (args.note !== undefined) patch.note = typeof args.note === "string" ? args.note.slice(0, 300) : "";
      const repeat = asOneOf(args.repeat, ["none", "daily", "weekly", "monthly"] as const);
      if (args.repeat !== undefined && !repeat) return fail("repeat 不合法。");
      if (repeat) patch.repeat = repeat;
      if (args.repeatUntil !== undefined) {
        if (args.repeatUntil === "" || args.repeatUntil === null) patch.repeatUntil = "";
        else {
          const until = asDate(args.repeatUntil);
          if (!until) return fail("repeatUntil 必须是 YYYY-MM-DD。");
          patch.repeatUntil = until;
        }
      }
      if (Object.keys(patch).length === 0) return fail("update_event 至少提供一项要修改的字段。");
      return ok(input, { id, ...patch }, reason);
    }

    case "check_in_event": {
      const id = asString(args.id, 80);
      const date = asDate(args.date);
      if (!id) return fail("check_in_event 需要 id。");
      if (!date) return fail("check_in_event 需要合法 date。");
      if (knownId(context.events, id) === false) return fail(`日程「${id}」不存在。`);
      return ok(input, { id, date }, reason);
    }

    case "create_timetable": {
      const name = asString(args.name, 60);
      if (!name) return fail("create_timetable 需要非空 name。");
      const patch: Record<string, unknown> = { name };
      const semesterName = asOptionalString(args.semesterName, 40);
      if (semesterName) patch.semesterName = semesterName;
      if (args.startDate !== undefined) {
        const startDate = asDate(args.startDate);
        if (!startDate) return fail("startDate 必须是 YYYY-MM-DD。");
        patch.startDate = startDate;
      }
      if (args.totalWeeks !== undefined) {
        const totalWeeks = asInt(args.totalWeeks);
        if (totalWeeks === null || totalWeeks < 1 || totalWeeks > 30) return fail("totalWeeks 必须是 1-30。");
        patch.totalWeeks = totalWeeks;
      }
      const showWeekends = asBoolean(args.showWeekends);
      if (args.showWeekends !== undefined && showWeekends === undefined) return fail("showWeekends 必须是布尔值。");
      if (showWeekends !== undefined) patch.showWeekends = showWeekends;
      if (args.weekStartsOn !== undefined) {
        const day = asInt(args.weekStartsOn);
        if (day === null || day < 1 || day > 7) return fail("weekStartsOn 必须是 1-7。");
        patch.weekStartsOn = day;
      }
      const profileId = asOptionalString(args.periodProfileId, 80);
      if (profileId && knownId(context.periodProfiles, profileId) === false) {
        return fail(`作息方案「${profileId}」不存在。`);
      }
      if (profileId) patch.periodProfileId = profileId;
      const templateId = asOneOf(args.templateId, TEMPLATE_IDS);
      if (args.templateId !== undefined && !templateId) {
        return fail(`templateId 必须是 ${TEMPLATE_IDS.join("/")}。`);
      }
      if (templateId) patch.templateId = templateId;
      return ok(input, patch, reason);
    }

    case "rename_timetable": {
      const id = asString(args.id, 80);
      const name = asString(args.name, 60);
      if (!id || !name) return fail("rename_timetable 需要 id 和 name。");
      if (knownId(context.timetables, id) === false) return fail(`课表「${id}」不存在。`);
      return ok(input, { id, name }, reason);
    }

    case "duplicate_timetable":
    case "delete_timetable": {
      const id = asString(args.id, 80);
      if (!id) return fail(`${input.action} 需要 id。`);
      if (knownId(context.timetables, id) === false) return fail(`课表「${id}」不存在。`);
      if (context.timetables && context.timetables.length <= 1 && input.action === "delete_timetable") {
        return fail("至少保留一套课表。");
      }
      return ok(input, { id }, reason);
    }

    case "set_periods": {
      if (!Array.isArray(args.periods) || args.periods.length === 0) {
        return fail("set_periods 需要非空 periods 数组。");
      }
      if (args.periods.length > 14) return fail("最多 14 节课。");
      const periods: Array<{ index: number; start: string; end: string }> = [];
      for (const [index, item] of args.periods.entries()) {
        if (!isRecord(item)) return fail("periods 的每一项必须是对象。");
        const start = asTime(item.start);
        const end = asTime(item.end);
        if (!start || !end) return fail(`第 ${index + 1} 节时间必须是 HH:MM。`);
        if (end <= start) return fail(`第 ${index + 1} 节的结束时间必须晚于开始时间。`);
        periods.push({ index: index + 1, start, end });
      }
      const profileId = asOptionalString(args.profileId, 80);
      if (profileId && knownId(context.periodProfiles, profileId) === false) {
        return fail(`作息方案「${profileId}」不存在。`);
      }
      return ok(input, { periods, ...(profileId ? { profileId } : {}) }, reason);
    }

    case "rename_period_profile": {
      const id = asString(args.id, 80);
      const name = asString(args.name, 40);
      if (!id || !name) return fail("rename_period_profile 需要 id 和 name。");
      if (knownId(context.periodProfiles, id) === false) return fail(`作息方案「${id}」不存在。`);
      return ok(input, { id, name }, reason);
    }

    case "set_calendar_override": {
      const date = asDate(args.date);
      if (!date) return fail("set_calendar_override 需要合法 date。");
      const kind = asOneOf(args.kind, ["holiday", "workday"] as const);
      if (!kind) return fail("kind 必须是 holiday/workday。");
      const name = asOptionalString(args.name, 20);
      const borrowFrom = args.borrowFrom === undefined ? undefined : asInt(args.borrowFrom);
      if (borrowFrom !== undefined && (borrowFrom === null || borrowFrom < 1 || borrowFrom > 7)) {
        return fail("borrowFrom 必须是 1-7。");
      }
      return ok(
        input,
        {
          date,
          kind,
          ...(name ? { name } : {}),
          ...(kind === "workday" && borrowFrom ? { borrowFrom } : {}),
        },
        reason,
      );
    }

    case "delete_calendar_override": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_calendar_override 需要 id。");
      if (knownId(context.calendarOverrides, id) === false) return fail(`日期调整「${id}」不存在。`);
      return ok(input, { id }, reason);
    }

    case "update_reminders": {
      const patch: Record<string, unknown> = {};
      for (const field of ["enabled", "todaySummary", "tomorrowSummary", "examReminders", "taskReminders"] as const) {
        const value = asBoolean(args[field]);
        if (args[field] !== undefined && value === undefined) return fail(`${field} 必须是布尔值。`);
        if (value !== undefined) patch[field] = value;
      }
      if (args.leadMinutes !== undefined) {
        const lead = asInt(args.leadMinutes);
        if (lead === null || lead < 1 || lead > 120) return fail("leadMinutes 必须是 1-120。");
        patch.leadMinutes = lead;
      }
      for (const field of ["todaySummaryTime", "tomorrowSummaryTime"] as const) {
        if (args[field] === undefined) continue;
        const time = asTime(args[field]);
        if (!time) return fail(`${field} 必须是 HH:MM。`);
        patch[field] = time;
      }
      if (Object.keys(patch).length === 0) return fail("update_reminders 至少提供一项。");
      return ok(input, patch, reason);
    }

    case "save_template": {
      const name = asString(args.name, 40);
      if (!name) return fail("save_template 需要非空 name。");
      return ok(input, { name }, reason);
    }

    case "apply_template":
    case "delete_template": {
      const id = asString(args.id, 80);
      if (!id) return fail(`${input.action} 需要 id。`);
      if (knownId(context.templates, id) === false) return fail(`模板「${id}」不存在。`);
      return ok(input, { id }, reason);
    }

    case "export_data": {
      const format = asOneOf(args.format, ["json", "ics"] as const);
      if (!format) return fail("format 必须是 json/ics。");
      return ok(input, { format }, reason);
    }

    case "clear_scope": {
      const scope = asOneOf(args.scope, SCOPES);
      if (!scope) return fail(`scope 必须是 ${SCOPES.join("/")}。`);
      return ok(input, { scope }, reason);
    }

    case "update_gap_preferences": {
      const patch: Record<string, unknown> = {};
      if (args.walkSpeed !== undefined) {
        const value = Number(args.walkSpeed);
        if (!Number.isFinite(value) || value < 30 || value > 200) return fail("walkSpeed 必须是 30-200。");
        patch.walkSpeed = Math.round(value);
      }
      if (args.bufferMinutes !== undefined) {
        const value = Number(args.bufferMinutes);
        if (!Number.isFinite(value) || value < 0 || value > 30) return fail("bufferMinutes 必须是 0-30。");
        patch.bufferMinutes = Math.round(value);
      }
      const lunchEnabled = asBoolean(args.lunchEnabled);
      if (args.lunchEnabled !== undefined && lunchEnabled === undefined) return fail("lunchEnabled 必须是布尔值。");
      if (lunchEnabled !== undefined) patch.lunchEnabled = lunchEnabled;
      for (const field of ["lunchStart", "lunchEnd"] as const) {
        if (args[field] === undefined) continue;
        const time = asTime(args[field]);
        if (!time) return fail(`${field} 必须是 HH:MM。`);
        patch[field] = time;
      }
      if (args.lunchMinutes !== undefined) {
        const value = Number(args.lunchMinutes);
        if (!Number.isFinite(value) || value < 10 || value > 120) return fail("lunchMinutes 必须是 10-120。");
        patch.lunchMinutes = Math.round(value);
      }
      const accessMode = asBoolean(args.accessMode);
      if (args.accessMode !== undefined && accessMode === undefined) return fail("accessMode 必须是布尔值。");
      if (accessMode !== undefined) patch.accessMode = accessMode;
      if (args.accessibleExtra !== undefined) {
        const value = Number(args.accessibleExtra);
        if (!Number.isFinite(value) || value < 0 || value > 30) return fail("accessibleExtra 必须是 0-30。");
        patch.accessibleExtra = Math.round(value);
      }
      if (isRecord(args.aliases)) {
        const aliases: Record<string, string> = {};
        for (const [key, value] of Object.entries(args.aliases).slice(0, 50)) {
          const k = key.trim().slice(0, 40);
          const v = typeof value === "string" ? value.trim().slice(0, 40) : "";
          if (k && v) aliases[k] = v;
        }
        patch.aliases = aliases;
      }
      if (isRecord(args.customWalks)) {
        const walks: Record<string, number> = {};
        for (const [key, value] of Object.entries(args.customWalks).slice(0, 100)) {
          const minutes = Number(value);
          if (!key.includes("|") || !Number.isFinite(minutes) || minutes < 0 || minutes > 180) continue;
          walks[key.trim()] = Math.round(minutes);
        }
        patch.customWalks = walks;
      }
      if (Object.keys(patch).length === 0) return fail("update_gap_preferences 至少提供一项。");
      return ok(input, patch, reason);
    }

    case "add_catalog_section": {
      const name = asString(args.name, 80);
      if (!name) return fail("add_catalog_section 需要非空 name。");
      const credits = Number(args.credits);
      if (!Number.isFinite(credits) || credits < 0.5 || credits > 12) return fail("credits 必须在 0.5-12。");
      const category = asOneOf(args.category, CATEGORIES);
      if (!category) return fail(`category 必须是 ${CATEGORIES.join("/")}。`);
      const day = asInt(args.day);
      const start = asInt(args.start);
      const end = asInt(args.end);
      if (day === null || day < 1 || day > 7) return fail("day 必须是 1-7。");
      if (start === null || start < 1 || start > 14) return fail("start 必须是 1-14。");
      if (end === null || end < start || end > 14) return fail("end 必须 >= start 且 <= 14。");
      const weekStart = asInt(args.weekStart) ?? 1;
      const weekEnd = asInt(args.weekEnd) ?? maxWeek;
      if (weekStart < 1 || weekEnd < weekStart || weekEnd > maxWeek) {
        return fail(`周次必须在 1-${maxWeek} 且 weekStart <= weekEnd。`);
      }
      const difficulty = args.difficulty === undefined ? 3 : asInt(args.difficulty);
      if (difficulty === null || difficulty < 1 || difficulty > 5) return fail("difficulty 必须是 1-5。");
      const examWeek = args.examWeek === undefined ? undefined : asInt(args.examWeek);
      if (examWeek !== undefined && (examWeek === null || examWeek < 1 || examWeek > maxWeek)) {
        return fail(`examWeek 必须在 1-${maxWeek}。`);
      }
      const pattern = asOneOf(args.pattern, ["all", "odd", "even"] as const);
      return ok(
        input,
        {
          name,
          credits,
          category,
          day,
          start,
          end,
          weekStart,
          weekEnd,
          difficulty,
          ...(pattern && pattern !== "all" ? { pattern } : {}),
          ...(asOptionalString(args.teacher, 40) ? { teacher: asOptionalString(args.teacher, 40) } : {}),
          ...(asOptionalString(args.location, 60) ? { location: asOptionalString(args.location, 60) } : {}),
          ...(asOptionalString(args.code, 40) ? { code: asOptionalString(args.code, 40) } : {}),
          ...(examWeek !== null && examWeek !== undefined ? { examWeek } : {}),
          ...(asOptionalString(args.note, 300) ? { note: asOptionalString(args.note, 300) } : {}),
        },
        reason,
      );
    }

    case "update_catalog_section": {
      const id = asString(args.id, 80);
      if (!id) return fail("update_catalog_section 需要 id。");
      if (knownId(context.catalogSections, id) === false) return fail(`班次「${id}」不存在。`);
      const patch: Record<string, unknown> = {};
      const name = asOptionalString(args.name, 80);
      if (name) patch.name = name;
      if (args.credits !== undefined) {
        const credits = Number(args.credits);
        if (!Number.isFinite(credits) || credits < 0.5 || credits > 12) return fail("credits 必须在 0.5-12。");
        patch.credits = credits;
      }
      if (args.category !== undefined) {
        const category = asOneOf(args.category, CATEGORIES);
        if (!category) return fail("category 不合法。");
        patch.category = category;
      }
      for (const field of ["teacher", "location", "code", "note"] as const) {
        if (args[field] !== undefined) patch[field] = typeof args[field] === "string" ? args[field].slice(0, 300) : "";
      }
      if (args.difficulty !== undefined) {
        const difficulty = asInt(args.difficulty);
        if (difficulty === null || difficulty < 1 || difficulty > 5) return fail("difficulty 必须是 1-5。");
        patch.difficulty = difficulty;
      }
      if (args.examWeek !== undefined) {
        const examWeek = asInt(args.examWeek);
        if (examWeek === null || examWeek < 1 || examWeek > maxWeek) return fail(`examWeek 必须在 1-${maxWeek}。`);
        patch.examWeek = examWeek;
      }
      if (Object.keys(patch).length === 0) return fail("update_catalog_section 至少提供一项。");
      return ok(input, { id, ...patch }, reason);
    }

    case "delete_catalog_section": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_catalog_section 需要 id。");
      if (knownId(context.catalogSections, id) === false) return fail(`班次「${id}」不存在。`);
      return ok(input, { id }, reason);
    }

    case "select_catalog_section":
    case "unselect_catalog_section": {
      const id = asString(args.id, 80);
      if (!id) return fail(`${input.action} 需要 id。`);
      if (knownId(context.catalogSections, id) === false) return fail(`班次「${id}」不存在。`);
      return ok(input, { id }, reason);
    }

    case "create_selection_plan": {
      const name = asOptionalString(args.name, 40) ?? "新方案";
      return ok(input, { name }, reason);
    }

    case "switch_selection_plan":
    case "delete_selection_plan": {
      const id = asString(args.id, 80);
      if (!id) return fail(`${input.action} 需要 id。`);
      if (knownId(context.selectionPlans, id) === false) return fail(`选课方案「${id}」不存在。`);
      if (input.action === "delete_selection_plan" && context.selectionPlans && context.selectionPlans.length <= 1) {
        return fail("至少保留一个选课方案。");
      }
      return ok(input, { id }, reason);
    }

    case "auto_combine_plan": {
      const patch: Record<string, unknown> = {};
      if (args.maxCredits !== undefined) {
        const value = Number(args.maxCredits);
        if (!Number.isFinite(value) || value < 1 || value > 60) return fail("maxCredits 必须是 1-60。");
        patch.maxCredits = Math.round(value * 10) / 10;
      }
      if (args.maxWeeklyPeriods !== undefined) {
        const value = Number(args.maxWeeklyPeriods);
        if (!Number.isFinite(value) || value < 1 || value > 100) return fail("maxWeeklyPeriods 必须是 1-100。");
        patch.maxWeeklyPeriods = Math.round(value);
      }
      if (args.categories !== undefined) {
        if (!Array.isArray(args.categories)) return fail("categories 必须是数组。");
        const categories = args.categories
          .map((item) => asOneOf(item, CATEGORIES))
          .filter((item): item is CategoryId => Boolean(item));
        if (categories.length === 0) return fail("categories 里没有合法类别。");
        patch.categories = [...new Set(categories)];
      }
      return ok(input, patch, reason);
    }

    case "add_study_log": {
      const subject = asString(args.subject, 80);
      if (!subject) return fail("add_study_log 需要 subject。");
      const minutes = asInt(args.minutes);
      if (minutes === null || minutes < 1 || minutes > 1440) return fail("minutes 必须是 1-1440。");
      const courseId = asOptionalString(args.courseId, 80);
      if (courseId && knownId(context.courses, courseId) === false) {
        return fail(`课程「${courseId}」不存在。`);
      }
      const kind = asOneOf(args.kind, STUDY_KINDS);
      if (args.kind !== undefined && !kind) return fail(`kind 必须是 ${STUDY_KINDS.join("/")}。`);
      return ok(
        input,
        {
          subject,
          minutes,
          ...(courseId ? { courseId } : {}),
          ...(asOptionalString(args.start, 40) ? { start: asOptionalString(args.start, 40) } : {}),
          ...(kind ? { kind } : {}),
          ...(asOptionalString(args.note, 300) ? { note: asOptionalString(args.note, 300) } : {}),
        },
        reason,
      );
    }

    case "update_ai_settings": {
      const patch: Record<string, unknown> = {};
      if (args.provider !== undefined) {
        const provider = asOneOf(args.provider, AI_PROVIDERS);
        if (!provider) {
          return fail(`provider 必须是 ${AI_PROVIDERS.join("/")}。`);
        }
        patch.provider = provider;
      }
      if (args.baseUrl !== undefined) {
        const baseUrl = asString(args.baseUrl, 300);
        if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return fail("baseUrl 必须是 http(s) 地址。");
        patch.baseUrl = baseUrl;
      }
      if (args.model !== undefined) {
        const model = asString(args.model, 100);
        if (!model) return fail("model 不能为空。");
        patch.model = model;
      }
      const persona: Record<string, unknown> = {};
      if (args.personaName !== undefined) {
        const name = asString(args.personaName, 20);
        if (!name) return fail("personaName 不能为空。");
        persona.name = name;
      }
      if (args.tone !== undefined) {
        const tone = asOneOf(args.tone, AI_TONES);
        if (!tone) return fail("tone 必须是 concise/warm/playful。");
        persona.tone = tone;
      }
      if (args.customPrompt !== undefined) {
        persona.customPrompt =
          typeof args.customPrompt === "string" ? args.customPrompt.slice(0, 500) : "";
      }
      if (Object.keys(persona).length > 0) patch.persona = persona;
      if (args.permissions !== undefined) {
        if (!isRecord(args.permissions)) return fail("permissions 必须是对象。");
        const permissions: Record<string, boolean> = {};
        for (const field of ["schedule", "notes", "noteTags", "tasks", "exams"] as const) {
          const value = asBoolean(args.permissions[field]);
          if (args.permissions[field] !== undefined && value === undefined) {
            return fail(`permissions.${field} 必须是布尔值。`);
          }
          if (value !== undefined) permissions[field] = value;
        }
        if (Object.keys(permissions).length === 0) return fail("permissions 里没有合法字段。");
        patch.permissions = permissions;
      }
      if (Object.keys(patch).length === 0) return fail("update_ai_settings 至少提供一项（密钥只能在设置页填写）。");
      return ok(input, patch, reason);
    }

    case "add_memory": {
      const text = asString(args.text, 200);
      if (!text) return fail("add_memory 需要 1-200 字的 text。");
      return ok(input, { text }, reason);
    }

    case "delete_memory": {
      const id = asString(args.id, 80);
      if (!id) return fail("delete_memory 需要 id。");
      return ok(input, { id }, reason);
    }

    case "tap_woodfish": {
      const times = args.times === undefined ? 1 : asInt(args.times);
      if (times === null || times < 1 || times > 100) return fail("times 必须是 1-100。");
      return ok(input, { times }, reason);
    }

    default:
      return null;
  }
}

export function describeExtraAction(
  action: AiAction,
  context: AiActionContext = {},
): string | null {
  const args = action.args;
  switch (action.action) {
    case "open_dialog":
      return `打开「${DIALOG_LABELS[args.dialog as DialogId] ?? args.dialog}」`;
    case "print":
      return "打印当前课表";
    case "undo":
      return "撤销上一次修改";
    case "redo":
      return "重做被撤销的修改";
    case "set_preferences":
      return "修改界面与节假日偏好";
    case "set_wallpaper":
      return `把壁纸设为「${args.preset}」`;
    case "create_chapter":
      return `新建笔记章节《${args.title}》`;
    case "rename_chapter":
      return `重命名章节《${findName(context.chapters, String(args.id)) ?? args.id}》`;
    case "delete_chapter":
      return `删除章节《${findName(context.chapters, String(args.id)) ?? args.id}》，其中的笔记会回到未归档`;
    case "move_note":
      return `把笔记《${findName(context.notes, String(args.noteId)) ?? args.noteId}》移到${
        args.chapterId ? `《${findName(context.chapters, String(args.chapterId)) ?? args.chapterId}》` : "未归档"
      }`;
    case "update_task":
      return `修改任务《${findName(context.tasks, String(args.id)) ?? args.id}》`;
    case "reopen_task":
      return `把任务《${findName(context.tasks, String(args.id)) ?? args.id}》改回未完成`;
    case "add_subtask":
      return `给《${findName(context.tasks, String(args.taskId)) ?? args.taskId}》添加子任务「${args.title}」`;
    case "toggle_subtask":
      return `切换《${findName(context.tasks, String(args.taskId)) ?? args.taskId}》的一个子任务`;
    case "delete_subtask":
      return `删除《${findName(context.tasks, String(args.taskId)) ?? args.taskId}》的一个子任务`;
    case "update_exam":
      return `修改考试《${findName(context.exams, String(args.id)) ?? args.id}》`;
    case "set_grade":
      return `录入《${findName(context.courses, String(args.courseId)) ?? args.courseId}》的成绩`;
    case "delete_grade":
      return `删除《${findName(context.courses, String(args.courseId)) ?? args.courseId}》的成绩`;
    case "update_grade_settings":
      return "修改成绩隐私与毕业学分设置";
    case "set_course_slots":
      return `替换《${findName(context.courses, String(args.courseId)) ?? args.courseId}》的全部时段`;
    case "restore_course":
      return `恢复显示《${findName(context.courses, String(args.courseId)) ?? args.courseId}》`;
    case "override_session": {
      const course = findName(context.courses, String(args.courseId)) ?? args.courseId;
      if (args.kind === "hide") return `从第 ${args.week} 周起隐藏《${course}》`;
      if (args.kind === "cancel") return `停掉第 ${args.week} 周《${course}》的这一次课`;
      return `把第 ${args.week} 周《${course}》调到周${args.toDay}第 ${args.toStart}-${args.toEnd} 节`;
    }
    case "remove_override":
      return `撤销单次调整「${args.id}」`;
    case "update_event":
      return `修改日程《${findName(context.events, String(args.id)) ?? args.id}》`;
    case "check_in_event":
      return `切换《${findName(context.events, String(args.id)) ?? args.id}》在 ${args.date} 的打卡`;
    case "create_timetable":
      return `新建课表《${args.name}》`;
    case "rename_timetable":
      return `把课表「${findName(context.timetables, String(args.id)) ?? args.id}」改名为「${args.name}」`;
    case "duplicate_timetable":
      return `复制课表「${findName(context.timetables, String(args.id)) ?? args.id}」`;
    case "delete_timetable":
      return `删除课表「${findName(context.timetables, String(args.id)) ?? args.id}」及其全部数据`;
    case "set_periods":
      return `替换每日作息为 ${Array.isArray(args.periods) ? args.periods.length : 0} 节`;
    case "rename_period_profile":
      return `重命名作息方案「${findName(context.periodProfiles, String(args.id)) ?? args.id}」`;
    case "set_calendar_override":
      return `把 ${args.date} 设为${args.kind === "holiday" ? "放假" : "补课"}${
        args.borrowFrom ? `（上周${args.borrowFrom}的课）` : ""
      }`;
    case "delete_calendar_override":
      return "删除一条自定义放假/补课";
    case "update_reminders":
      return "修改提醒设置";
    case "save_template":
      return `把当前课表存为模板《${args.name}》`;
    case "apply_template":
      return `套用模板「${findName(context.templates, String(args.id)) ?? args.id}」`;
    case "delete_template":
      return `删除模板「${findName(context.templates, String(args.id)) ?? args.id}」`;
    case "export_data":
      return `导出 ${String(args.format).toUpperCase()} 文件`;
    case "sync_widget":
      return "同步桌面小组件";
    case "clear_scope":
      return `清空${SCOPE_LABELS[args.scope as ClearScope] ?? args.scope}（不可恢复）`;
    case "update_gap_preferences":
      return "修改空档评估偏好";
    case "add_catalog_section":
      return `把《${args.name}》加入选课课程池`;
    case "update_catalog_section":
      return `修改课程池班次「${findName(context.catalogSections, String(args.id)) ?? args.id}」`;
    case "delete_catalog_section":
      return `从课程池删除「${findName(context.catalogSections, String(args.id)) ?? args.id}」`;
    case "select_catalog_section":
      return `把「${findName(context.catalogSections, String(args.id)) ?? args.id}」加入当前选课方案`;
    case "unselect_catalog_section":
      return `把「${findName(context.catalogSections, String(args.id)) ?? args.id}」移出当前选课方案`;
    case "create_selection_plan":
      return `新建选课方案《${args.name}》`;
    case "switch_selection_plan":
      return `切换到选课方案「${findName(context.selectionPlans, String(args.id)) ?? args.id}」`;
    case "delete_selection_plan":
      return `删除选课方案「${findName(context.selectionPlans, String(args.id)) ?? args.id}」`;
    case "auto_combine_plan":
      return "自动生成一套选课组合";
    case "add_study_log":
      return `补记 ${args.minutes} 分钟「${args.subject}」学习`;
    case "update_ai_settings":
      return "修改 AI 提供方、人格或分项授权（不修改密钥）";
    case "add_memory":
      return `记住「${args.text}」`;
    case "delete_memory":
      return "删除一条长期记忆";
    case "clear_memory":
      return "清空长期记忆";
    case "tap_woodfish":
      return `敲木鱼 ${args.times ?? 1} 下`;
    default:
      return null;
  }
}
