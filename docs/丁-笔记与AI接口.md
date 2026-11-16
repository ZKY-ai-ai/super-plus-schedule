# 丁 · 笔记与 AI 接口文档

适用分工：[课序四人分工表](课序四人分工表.md) 丁的泳道（内容、智能与平台）。
本文件是阶段 0 的接口约定，后续实现以本文件为准；跨泳道调用只需依赖这里列出的签名。

## 一、职责与文件所有权

| 范围 | 文件 |
|---|---|
| 笔记、章节、链接 | `src/lib/notes.ts` |
| AI 查询、聊天、授权、人格 | `src/lib/ai.ts` |
| 笔记/AI 页面 | `src/components/notes/` |
| 笔记/AI 样式 | `src/styles/notes.css` |
| 测试基建与 CI | `src/test/helpers.ts`、`.github/workflows/ci.yml` |

不修改 `src/types.ts` 的数据 schema、`src/lib/schedule.ts` 等甲的文件。页面接入只做路由级改动，不新增数据耦合。

## 二、笔记模块 `lib/notes.ts`

### 2.1 数据模型

```ts
interface Note {
  id: string;
  title: string;
  body: string;
  courseId: string | null;   // 关联课程；课程库由甲维护
  chapterId: string | null;  // 关联章节；null 表示未归档
  tags: string[];            // 小写、去重、最多 8 个
  pinned: boolean;
  source: "manual" | "link";
  url?: string;              // source === "link" 时保存原始链接
  createdAt: string;
  updatedAt: string;
}

interface NoteChapter {
  id: string;
  courseId: string | null;
  title: string;
  order: number;
  createdAt: string;
}

interface NotesData {
  version: 1;
  notes: Note[];
  chapters: NoteChapter[];
  updatedAt: string;
}
```

存储键：`kexu:notes:v1`（与课表 `kexu:data:v2` 完全分离，清空课表不会误删笔记）。

### 2.2 公共函数

```ts
normalizeNotes(raw: unknown): NotesData
loadNotes(storage?: StorageLike): NotesData
saveNotes(data: NotesData, storage?: StorageLike): boolean

createNote(input: NoteInput, now?: Date): Note
updateNote(note: Note, patch: NotePatch, now?: Date): Note
upsertNote(data: NotesData, note: Note): NotesData
deleteNote(data: NotesData, id: string): NotesData
togglePin(data: NotesData, id: string): NotesData

searchNotes(notes: Note[], query: string, options?: { limit?: number }): NoteSearchHit[]
allTags(notes: Note[]): Array<{ tag: string; count: number }>

createChapter(input: { title: string; courseId?: string | null }, now?: Date): NoteChapter
upsertChapter(data: NotesData, chapter: NoteChapter): NotesData
deleteChapter(data: NotesData, id: string): NotesData  // 章节内笔记回到未归档
groupNotesByChapter(notes: Note[], chapters: NoteChapter[]): ChapterGroup[]
moveNoteToChapter(data: NotesData, noteId: string, chapterId: string | null): NotesData
```

`StorageLike` 只要求 `getItem/setItem/removeItem`，默认取 `globalThis.localStorage`；测试传入 `createMemoryStorage()`。

### 2.3 搜索规则

- 查询按空白分词，多个词为「与」关系。
- `#标签` 精确匹配标签；`课程:` 前缀匹配课程名；其余词匹配标题、正文、标签。
- 命中标题权重最高，其次标签、正文；置顶笔记排前，同分按 `updatedAt` 倒序。
- 返回 `{ note, score, excerpt }`，`excerpt` 为命中位置前后约 80 字。

### 2.4 链接导入（F104）

```ts
parseFirstUrl(text: string): string | null
linkTitleFromUrl(url: string): string
fetchLinkPreview(url: string, fetchImpl?: typeof fetch): Promise<LinkPreview>
linkNoteMarkdown(note: Note): string
```

只接受 `http/https`；抓取失败（CORS、离线、超时）时返回 `fetched: false`，用域名与路径生成标题，不阻塞用户保存。
`linkNoteMarkdown` 用于「复制分享」，输出 `[标题](链接)` + 备注正文。

## 三、AI 模块 `lib/ai.ts`

### 3.1 课表快照（跨泳道唯一入口）

```ts
interface AiScheduleSnapshot {
  generatedAt: string;
  semesterName: string;
  week: number;
  totalWeeks: number;
  days: AiDay[];              // 当前周 + 下一周，按日期升序
  courses: AiCourse[];
  nextSession: AiSession | null;
}

interface AiDay {
  date: string;               // YYYY-MM-DD
  weekday: number;            // 1=周一
  week: number;
  isToday: boolean;
  sessions: AiSession[];
}

interface AiSession {
  id: string;
  date: string;
  week: number;
  weekday: number;
  courseId: string;
  courseName: string;
  teacher: string;
  location: string;
  startPeriod: number;
  endPeriod: number;
  startTime: string;
  endTime: string;
}

buildAiScheduleSnapshot(input: {
  semester: Semester;
  week: number;
  now: Date;
}): AiScheduleSnapshot
```

实现内部只调用 `buildSessions`、`getWeekDates`、`dateKey` 等现有只读函数，不新增课表字段。等甲的 `resolveSessions(date)` 落地后，替换快照内部的课次来源即可，调用方无需改动。

### 3.2 自然语言查课（F111）

```ts
type ScheduleIntent =
  | "today" | "tomorrow" | "weekday" | "next" | "course" | "count" | "unknown";

answerScheduleQuestion(
  question: string,
  snapshot: AiScheduleSnapshot,
): { text: string; intent: ScheduleIntent; sessions: AiSession[] }
```

覆盖说法：今天/今日/现在、明天/明日、周三/礼拜三/下周三、第 N 周、下一节/接下来、某门课/某老师、在哪/几点/几节/几门课。
「考试」相关查询在乙的 `Exam` 模型接入前返回占位说明，不伪造数据。

### 3.3 聊天与人格（F117）

```ts
interface AiPersona {
  name: string;
  tone: "concise" | "warm" | "playful";
  customPrompt: string;       // 追加到系统提示，最多 500 字
}

interface AiSettings {
  provider: "local" | "openai-compatible";
  baseUrl: string;            // 例如 https://api.example.com/v1
  apiKey: string;
  model: string;
  persona: AiPersona;
  permissions: AiPermissions;
}

complete(request: {
  messages: AiChatMessage[];
  system?: string;
  snapshot?: AiScheduleSnapshot;
  notes?: Note[];
}, settings: AiSettings, fetchImpl?: typeof fetch): Promise<{ content: string; provider: string }>
```

- `local`：不联网，用 `answerScheduleQuestion` + 人格文案作答，保证无密钥可用。
- `openai-compatible`：`POST {baseUrl}/chat/completions`，兼容 OpenAI 协议；密钥只存本机，设置页明确提示。
- 请求失败返回可读错误，不抛出网络细节；UI 保留用户消息。

存储键：`kexu:ai:settings:v1`、`kexu:ai:chat:v1`。加载时做白名单归一化，非法 provider/权限回落到安全默认值。

### 3.4 分项授权（F118）

```ts
interface AiPermissions {
  schedule: boolean;   // 课表与学期信息（默认开）
  notes: boolean;      // 笔记正文（默认关）
  noteTags: boolean;   // 笔记标签与标题（默认关）
  tasks: boolean;      // 乙的任务模块（默认关，未接入）
  exams: boolean;      // 乙的考试模块（默认关，未接入）
}

buildAiContext(sources: {
  snapshot?: AiScheduleSnapshot;
  notes?: Note[];
  tasks?: unknown[];
  exams?: unknown[];
}, permissions: AiPermissions): string

describePermissions(permissions: AiPermissions): Array<{ key; label; enabled; hint }>
```

`buildAiContext` 只在对应开关开启时拼接数据；关闭时既不发送也不在预览中出现。设置页提供「本次会发送什么」的真实预览。

## 四、跨泳道约定

| 接口 | 提供方 | 丁的使用方式 |
|---|---|---|
| `Course` / `Period` / `Semester` | 甲 | 只读，不写入 |
| `buildSessions` / `getWeekDates` | 甲 | 快照内部调用 |
| `Task` / `Exam` | 乙 | 先留可选数组参数，接入后填充 |
| `renderTimetableImage(week)` | 甲 | 后续分享到群时调用，本期不实现 |
| `ai.complete(prompt, context)` | 丁 | 已导出，甲（F114）、丙（F116）可直接调用 |

## 五、验收与测试

```bash
cd third_party/classflow-full
pnpm test
pnpm typecheck
pnpm build
```

测试要求：

- 笔记：归一化容错、标签清洗、分词搜索、置顶排序、章节移动、存储往返。
- 链接：URL 提取与非法协议拒绝、CORS 失败降级、Markdown 分享。
- AI：今日/明日/周几/下一节/某课/计数意图、跨周边界、授权裁剪、OpenAI 兼容请求体与错误分支使用注入的 fake fetch。
- 所有用例不依赖真实网络与系统时间。
