import manualRaw from "../../docs/AI能力手册.md?raw";
import { AI_ACTION_GUIDE } from "./aiActions";

export interface ManualSection {
  id: string;
  title: string;
  body: string;
}

export const AI_MANUAL_RAW = manualRaw;

function parseManual(raw: string): ManualSection[] {
  const chunks = raw.split(/\r?\n##\s+/).slice(1);
  const sections: ManualSection[] = [];
  for (const chunk of chunks) {
    const newline = chunk.indexOf("\n");
    const heading = (newline >= 0 ? chunk.slice(0, newline) : chunk).trim();
    const body = (newline >= 0 ? chunk.slice(newline + 1) : "").trim();
    if (!heading) continue;
    const idMatch = /^(\d{2})\b/.exec(heading);
    const id = idMatch?.[1] ?? heading.toLocaleLowerCase().replace(/\s+/g, "-").slice(0, 24);
    sections.push({ id, title: heading, body });
  }
  return sections;
}

export const AI_MANUAL_SECTIONS = parseManual(manualRaw);

export const AI_MANUAL_INDEX = AI_MANUAL_SECTIONS.map(
  (section) => `${section.id} ${section.title}`,
).join("；");

export const AI_CAPABILITY_CARD = [
  "你是课序PLUS（基于 ClassFlow 二次开发）的内置 AI 助手「小序」。",
  "课序PLUS是本地优先的大学课表应用，页面：周课表、日程与单日、空档与规划（空档/学习/选课）、笔记与看板、AI 助手、课程库、我的。",
  "数据都在当前浏览器的 localStorage：课表 kexu:data:v2，笔记 kexu:notes:v1，任务 kexu:tasks:v1，考试 kexu:exams:v1，AI 设置/聊天/记忆 kexu:ai:*。",
"你默认可以查看本机全部结构化数据：课表清单（含 ID）、课程、日程、任务、考试、成绩、笔记、模板与偏好；需要改数据时，直接按动作协议生成 kexu-action 代码块，不要在文字里征求确认。普通操作由界面直接执行，删除、清空等不可逆操作会直接弹出一个确认框。动作手册已覆盖课序PLUS的全部功能，动作总数上限 40 个。",
  "导入课表（文本、Excel、CSV、ICS、Word、PDF、截图、附件）必须一次性完成：把所有课程合并进同一个 add_courses_from_text 的 text，禁止拆成多个动作或分批，也不要告诉用户「分两批」。",
  "用户可以在对话里拖入图片、Word、PDF、Excel/CSV、文本或 JSON。附件由本机解析，图片会随消息交给已配置的视觉模型；收到附件后先判断内容类型，再决定导入课程、建任务/考试/笔记或给出摘要。",
  "不要编造课程、任务、考试、笔记、课表的 ID；ID 只能来自上下文。找不到就让用户先打开对应页面。",
  "不要声称动作已经完成；不要在对话里问「要不要执行」，也不要要求用户打字回复「确认」。普通操作会直接执行，删除、清空等不可逆操作会直接弹一次确认框。删除、清空、覆盖导入必须由用户明确要求。",
  "外部服务（如系统日历）是否可用取决于当前环境和用户权限，不要假设一定成功。",
].join("\n");

const BASE_SECTION_IDS = ["00", "10", "11", "12"];
const FILL_SECTION_IDS = ["01", "02", "05", "06", "13", "15"];

const SYNONYMS: Record<string, string[]> = {
  作业: ["任务", "ddl"],
  待办: ["任务", "ddl"],
  截止: ["任务", "ddl"],
  建课: ["课程", "新建"],
  加课: ["课程", "新建"],
  课表: ["课程", "学期"],
  考试: ["考试", "成绩"],
  笔记: ["笔记", "章节"],
  资料: ["笔记", "搜索"],
  导入: ["导入", "文本", "excel", "备份"],
  导出: ["导出", "备份", "ics"],
  删除: ["删除", "高风险"],
  清空: ["清空", "高风险"],
  提醒: ["提醒", "通知"],
  空档: ["空档", "规划"],
  选课: ["选课", "规划"],
  番茄: ["学习", "专注"],
  设置: ["设置", "学期", "作息"],
  记录: ["笔记", "任务"],
  附件: ["附件", "文件", "导入", "表格"],
  文件: ["附件", "文件", "导入"],
  图片: ["图片", "截图", "视觉"],
  表格: ["excel", "表格", "导入", "csv"],
  word: ["附录", "文件", "导入", "docx"],
  pdf: ["附录", "文件", "导入"],
  拖入: ["附件", "文件", "拖入"],
};

function tokenize(input: string): string[] {
  const lower = input.toLocaleLowerCase();
  const tokens = new Set<string>();
  for (const match of lower.matchAll(/[a-z0-9_-]{2,}/g)) tokens.add(match[0]);
  for (const match of lower.matchAll(/[\u4e00-\u9fa5]+/g)) {
    const run = match[0];
    if (run.length >= 2) tokens.add(run);
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.add(run.slice(index, index + 2));
    }
  }
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (lower.includes(key)) {
      for (const value of values) tokens.add(value);
    }
  }
  return [...tokens].filter((token) => token.length >= 2);
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0 && count < 6) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function scoreSection(section: ManualSection, tokens: string[]): number {
  const title = section.title.toLocaleLowerCase();
  const body = section.body.toLocaleLowerCase();
  let score = 0;
  for (const token of tokens) {
    const weight = Math.min(token.length, 6);
    if (title.includes(token)) score += 8 * weight;
    score += occurrences(body, token) * weight;
  }
  return score;
}

function clipSection(section: ManualSection, budget: number): string {
  const heading = `## ${section.title}`;
  if (budget <= heading.length + 20) return "";
  const body = section.body.length > budget - heading.length - 2
    ? `${section.body.slice(0, budget - heading.length - 20)}\n（本节已截断，可让助手用 read_manual 读取全文）`
    : section.body;
  return `${heading}\n${body}`;
}

export function findManualSection(idOrTitle: string): ManualSection | null {
  const value = idOrTitle.trim().toLocaleLowerCase();
  if (!value) return null;
  return (
    AI_MANUAL_SECTIONS.find((section) => section.id === value) ??
    AI_MANUAL_SECTIONS.find((section) => section.title.toLocaleLowerCase().includes(value)) ??
    AI_MANUAL_SECTIONS.find((section) => section.body.toLocaleLowerCase().includes(value)) ??
    null
  );
}

/**
 * 远程请求的 system prompt 只带能力卡、动作表和与本次问题相关的章节，
 * 避免每条消息都把整本手册塞进上下文。
 */
export function buildAiManualPrompt(question: string, maxChars = 9000): string {
  if (maxChars <= 0) return "";
  const head = [
    "【应用能力卡】",
    AI_CAPABILITY_CARD,
    "",
    "【动作协议】",
    AI_ACTION_GUIDE,
    "",
    "【手册目录】",
    AI_MANUAL_INDEX,
  ].join("\n");

  const remaining = Math.max(0, maxChars - head.length);
  if (remaining < 200) return head.slice(0, maxChars);

  const tokens = tokenize(question);
  const baseIds = new Set(BASE_SECTION_IDS);
  const ordered: ManualSection[] = [];
  for (const id of BASE_SECTION_IDS) {
    const section = AI_MANUAL_SECTIONS.find((item) => item.id === id);
    if (section) ordered.push(section);
  }

  const scored = AI_MANUAL_SECTIONS
    .filter((section) => !baseIds.has(section.id))
    .map((section) => ({ section, score: scoreSection(section, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  for (const item of scored) ordered.push(item.section);

  for (const id of FILL_SECTION_IDS) {
    const section = AI_MANUAL_SECTIONS.find((item) => item.id === id);
    if (section && !ordered.includes(section)) ordered.push(section);
  }

  const selected: string[] = [];
  let budget = remaining - 20;
  for (const section of ordered) {
    if (budget <= 0) break;
    const block = clipSection(section, budget);
    if (!block) continue;
    selected.push(block);
    budget -= block.length + 2;
  }

  return `${head}\n\n【本次相关手册章节】\n${selected.join("\n\n")}`.slice(0, maxChars);
}