# 课序 · AI 能力手册

本手册同时给两类读者使用：

- **内置 AI 助手「小序」**：程序启动时打包本文件，按用户问题检索相关章节，并按下文动作协议调用应用接口。
- **开发者与高级用户**：了解页面、数据、存储键、接口和权限边界。

维护规则：功能发生变化时先改本文件，再改代码；动作名、参数、返回提示必须与 `src/lib/aiActions.ts` 和执行器保持一致。

---

## 00 使用须知与边界

1. 课序是**本地优先**的课表应用。课表、笔记、任务、考试、AI 设置都保存在当前浏览器的 `localStorage`，没有账号体系，也没有默认云同步。
2. AI 助手有三种运行方式：
   - **本地规则**：不联网，只回答课表/笔记/记忆相关问题，能识别少量固定指令。
   - **云端模型**：OpenAI、DeepSeek、智谱 GLM、通义千问、Kimi、硅基流动、OpenRouter 或自定义 OpenAI 兼容地址；填写 API Key 与模型名后启用。
   - **本地模型**：默认 Ollama（`http://localhost:11434/v1`），也可选 LM Studio 或自定义本地服务；API Key 通常可留空。
   三种方式都可在设置里点「测试连接」，用当前模型发送一条极短 ping，确认地址、密钥与模型是否可用。
3. AI **默认可以查看本机全部结构化数据**：课表清单（含每套课表的 id）、课程、日程、任务、考试、成绩、笔记、模板与偏好。分项授权仍可关闭；关闭后新的请求不再携带对应数据。
4. AI 不在正文里征求确认，也不要求用户打字回复「确认」或复述目标：意图明确就直接生成动作。普通操作由界面直接执行；删除、清空、覆盖导入等不可逆操作会直接弹出一次确认框。
5. AI 不应编造课程、任务、考试、笔记的 ID。只能使用上下文中提供的 ID；找不到就让用户先打开对应页面确认。
6. 外部服务（如原生系统日历）是否可用取决于浏览器权限、网络和用户自己的凭据，不能把「代码存在」当成「当前环境已验证」。

---

## 01 应用地图

启动入口：仓库根 `启动课序.cmd`，或在本目录执行 `npm run dev`（Vite，默认 `http://127.0.0.1:5173`）。入口链为 `index.html` → `src/main.tsx` → `src/App.tsx`。

| 页面 ID | 侧栏名称 | 主要能力 | 源码入口 |
|---|---|---|---|
| `timetable` | 周课表 | 周网格/列表、切周、回到今天、课程块、冲突提示、节假日、打印 | `src/App.tsx`、`src/components/Timetable.tsx`、`TimetableList.tsx` |
| `agenda` | 日程与单日 | 单日时间轴、课程与日程聚合、日程打卡 | `src/components/AgendaPage.tsx`、`DayView.tsx` |
| `plan` | 空档与规划 | 三个子页：空档评估、学习与统计、选课规划 | `src/components/planner/PlanPage.tsx` |
| `notes` | 笔记与看板 | 笔记增删改、章节看板、标签、全文搜索、链接导入 | `src/components/notes/NotesWorkspace.tsx` |
| `ai` | AI 助手 | 对话、目录提取、人格与授权、长期记忆 | `src/components/ai/AiWorkspace.tsx` |
| `courses` | 课程库 | 课程卡片、搜索、编辑、删除、恢复隐藏课程 | `src/components/CourseLibrary.tsx` |
| `profile` | 我的 | 课表信息、主题、壁纸、导入导出、打印、数据状态 | `src/components/ProfilePage.tsx` |

常用弹窗与入口：

- 新建/编辑课程：`CourseEditor`（快捷键 `N`）。
- 新建/编辑日程：`EventEditor`（快捷键 `E`）。
- 命令面板：`Ctrl/Cmd + K`，可搜索页面、课程和操作。
- 设置：`SettingsModal`，包含学期、作息、任务、成绩、提醒、日历、教务导入、数据、AI、QQQ 游乐场、木鱼。
- 文本导入、课表分享、多课表管理、壁纸、周次选择。

全局快捷键：`N` 新建课程，`E` 新建日程，`T` 回到今天，`←/→` 切换周，`Ctrl/Cmd+Z` 撤销，`Ctrl/Cmd+Shift+Z` 或 `Ctrl/Cmd+Y` 重做，`Ctrl/Cmd+K` 命令面板。

---

## 02 数据模型与存储

### 2.1 核心数据

课表数据保存在 `kexu:data:v2`，结构为 `ScheduleData`：

- `activeTimetableId`：当前课表 ID。
- `timetables`：多份课表，每份包含 `semester`、`courses`、`events`、`overrides`、`calendarOverrides`、`wallpaper`。
- `periodProfiles`：作息方案（节次时间表）。
- `periodRules`：按日期切换作息方案的规则。

课程 `Course` 的关键字段：

- `name`、`alias`、`teacher`、`location`、`tone`、`note`。
- `slots[]`：每个上课时段包含 `day`（1=周一…7=周日）、`start`/`end`（第几节）、`weekStart`/`weekEnd`、`pattern`（`all`/`odd`/`even`），可选 `weeks[]` 精确周次。

日程 `ScheduleEvent`：`title`、`date`、`allDay`、`start`、`end`、`note`、`tone`、`repeat`（`none`/`daily`/`weekly`/`monthly`）、`repeatUntil`、`checkIns[]`。

单次调整 `SessionOverride`：`action` 为 `cancel`（停课）、`move`（调课）、`hide`（从某周起隐藏），按 `courseId + slotId + week` 生效。

节假日覆盖 `CalendarOverride`：`kind` 为 `holiday`（放假）或 `workday`（补课），补课可指定 `borrowFrom` 借用某个星期几的课。

### 2.2 存储键

| 键 | 内容 |
|---|---|
| `kexu:data:v2` | 课表、课程、日程、作息、单次调整、节假日覆盖 |
| `kexu:prefs:v1` | 主题、视图模式、布局、别名开关、自动节假日 |
| `kexu:notes:v1` | 笔记与章节 |
| `kexu:tasks:v1` | 作业/任务，按 `timetableId` 分组 |
| `kexu:exams:v1` | 考试，按 `timetableId` 分组 |
| `kexu:grades:v1`、`kexu:grades:settings:v1` | 成绩与成绩隐私设置 |
| `kexu:ai:settings:v1` | AI 模型服务、密钥、模型、人格、分项授权 |
| `kexu:ai:chat:v1` | AI 对话记录（最多 120 条） |
| `kexu:ai:memory:v1` | AI 长期记忆（最多 30 条，每条 200 字） |
| `kexu:reminders:v1`、`kexu:reminders:sent:v1` | 提醒设置与已发送记录 |
| `kexu:templates:v1` | 课表模板 |
| `kexu:planner:*` | 选课规划、课程池、空档偏好、学习记录等 |
| `kexu:woodfish:v1` | 木鱼计数 |
| `kexu:study:focus:v1` | 专注计时状态 |

**注意**：`src/lib/tasks.ts` 的 `Task`（`kexu:tasks:v1`）才是用户作业/任务；`src/lib/stats.ts` 的 `PlannerTask`（`kexu:planner:tasks:v1`）只服务学习页旧面板，不要混用。

---

## 03 课表与课程

### 3.1 看课表

- 周视图按当前周显示七天网格；顶部可切周、回到今天、打开周次选择。
- 列表视图把同一周课程按天排列，适合手机窄屏。
- 冲突课程会有角标和明细提示；课程名可用别名显示。
- 节假日、调休和单次调课会同时影响网格、列表、提醒、导出与小组件。
- 「我的」页可打印课表、切换主题与壁纸、查看存储状态。

### 3.2 新建与编辑课程

入口：顶栏「新建课程」、命令面板「新建课程」、快捷键 `N`、课程库。

必填课程名；可选别名、教师、地点、备注、颜色。每个上课时段至少填写：

- 星期几（周一至周日）。
- 开始节次与结束节次。
- 起止周（默认第 1 周到学期总周数）。
- 单双周模式（全部/单周/双周）。

保存后写入当前课表的 `courses`。同名同教师的课程会被视为同一门课，批量导入时会合并时段而不是重复建课。

### 3.3 单次调课、停课与隐藏

在某周课程块上打开单次调整弹窗，可以：

- 取消这一次课（`cancel`）。
- 把这一次课改到另一天/其他节次（`move`）。
- 从当前周起隐藏整门课（`hide`）。

这些调整存进 `overrides`，可逐条撤销或在课程详情中恢复。它们不会修改课程本身的固定时段。

### 3.4 课程库

课程库展示当前课表全部课程，可搜索、查看详情、编辑、删除、恢复被隐藏课程。删除课程会同时清掉该课程的时段；执行器会先确认。

---

## 04 日程、节假日与单日视图

- 日程支持全天或定时，字段包括标题、日期、开始/结束时间、备注、颜色。
- 重复规则：不重复、每天、每周、每月；可设置重复截止日期。
- 重复日程的每一次 occurrence 可以单独打卡，打卡日期记录在 `checkIns`。
- 节假日与补课在设置页「日历」中维护；补课日可借用某个星期几的课表。
- 单日页把当天的课程和日程放在同一条时间轴上，并支持日程打卡。
- 提醒引擎读取课程与日程，生成今日/明日摘要和任务 DDL 提醒；浏览器通知需要页面保持打开并授予通知权限。

---

## 05 任务与考试

### 5.1 作业/任务

入口：设置 → 任务；学习页也会展示任务紧迫度。

任务字段：标题、关联课程、截止日期、截止时间、备注、重复规则、子任务、预计时长（分钟）。

- 分组：逾期、今天、明天、即将到来、以后、无日期。
- 完成非重复任务会标记完成；完成重复任务会把截止日期顺延到下一次并重置子任务。
- DDL 提醒默认在截止前 24 小时、3 小时、30 分钟规划（可在提醒设置中调整）。
- 任务按当前课表 ID 隔离；切换课表后看到的是该课表自己的任务。

### 5.2 考试与成绩

入口：设置 → 成绩。考试字段：标题、关联课程、类型（小测/期中/期末/实验/其他）、日期、开始/结束时间、地点、座位、备注。

- 考试有倒计时，支持按类型筛选。
- 成绩表支持录入分数、学分、绩点、重修/免修/旁听等状态，并可隐藏分数。
- 学期统计包含平均分、GPA、学分进度；没有单科排名和教务系统直连。

---

## 06 笔记

入口：侧栏「笔记与看板」。

- 笔记字段：标题、正文、关联课程、所属章节、标签（最多 8 个，自动小写去重）、置顶、来源（手动/链接）、原始链接。
- 章节可按课程分组，笔记可在章节间移动；删除章节后笔记回到未归档。
- 搜索：空格分词为「与」关系；`#标签` 精确匹配标签；`课程:` 前缀匹配课程名；其余词匹配标题、正文、标签。标题权重最高，置顶优先，同分按更新时间倒序。
- 链接导入只接受 `http/https`；抓取失败（CORS、离线、超时）时仍保存，用域名和路径生成标题。
- 笔记与课表存储完全分离，清空课表不会删除笔记。

---

## 07 空档、学习与选课规划

`plan` 页有三个子页：

### 7.1 空档评估（Gapwise）

- 根据当天课程、步行时间、缓冲时间、午饭时段，找出课间空档并给出活动建议。
- 支持「最晚出发」、往返判定、无障碍额外时间、楼栋别名与手工教室占用估算。
- 空档偏好保存在 `kexu:planner:gaps:v1`；楼栋/教室数据来自 `kexu:planner:rooms:v1`。
- 这是估算，不是校园实时路网或空教室系统。

### 7.2 学习与统计（StudyDesk）

- 番茄钟/长休息计时，按课程记录专注时段。
- 复习排期会结合空档与学习记录给出时段，可手动改期。
- 统计包括完成率、按时率、91 天热力图、经验值/等级/连续天数。
- 计时状态保存在 `kexu:study:focus:v1`，学习记录在 `kexu:planner:study:v1`。

### 7.3 选课规划（Course Planner）

- 课程池：手工添加候选班次，字段含课程名、教师、教室、星期、节次、周次、学分、类别等。
- 支持关键词/类别/星期筛选、只看无冲突、冲突剔除、替代班次推荐。
- 自动组合会按学分上限生成方案；当前实现是启发式组合，不保证全局最优。
- 方案可新建、切换、删除；课程目录可粘贴纯文本后提取，提取结果可存为笔记。
- 相关存储：`kexu:planner:catalog:v1`、`kexu:planner:generator:v1`、`kexu:planner:shares:v1`。

---

## 08 导入、导出、分享与同步

### 8.1 文本建课

入口：新建课程旁「文本导入」或设置 → 数据。每行一门课/一个时段，示例：

```text
高等数学 周一 第1-2节 教一401 1-16周
大学物理;周二;3-4节;教二205;1-16周
英语 @李老师 周三 5-6节 地点：外语楼302 单周
```

支持：`周X/星期X`、`第1-2节/3-4节`、`1-16周`、`单周/双周`、`@老师`、`地点：...`、用空格/逗号/分号/竖线分隔。导入前会预览，确认后写入课程。

### 8.2 Excel / 表格导入

在 AI 助手对话里拖入 xlsx / csv / tsv 附件，本机会解析行列并生成课程草稿；「导入课表」的 CSV/TSV 通道也可直接读取表格。当前使用轻量 XLSX 解析，不执行宏。

### 8.3 JSON / ICS / 文件导入导出

- 导出 JSON：完整课表数据，可用于备份或迁移。
- 导出 ICS：日历文件，受当前节假日/调休过滤影响。
- 导入文件：支持本应用 JSON、ICS、CSV/TSV、TXT/MD/HTML 等文本格式；导入前生成草稿，可替换、合并或稍后继续。
- 模板：可把当前课表保存为模板，之后应用到新/现有课表。

### 8.4 分享

课表分享弹窗支持 PNG 图片、纯文字、Markdown、分享链接。图片渲染由 `src/lib/timetableImage.ts` 完成；分享链接读取后走文本导入预览。

### 8.5 同步与备份

- **系统日历**：原生应用优先写系统日历，Web 端回退到 ICS；真机行为需实际验证。
- 以上功能都不代表存在云端账号或跨设备实时同步。

---

## 09 设置页

| Tab | 能力 |
|---|---|
| 学期 | 学期名称、开学日期、总周数、周起始日、是否显示周末 |
| 作息 | 节次时间表、按上课时长和课间批量生成、按日期切换作息方案 |
| 任务 | 任务增删改、分组、子任务、JSON 导入 |
| 成绩 | 考试、成绩、GPA、隐私开关 |
| 提醒 | 今日/明日摘要时间、任务 DDL 提醒、通知权限 |
| 日历 | 放假/补课覆盖、自动节假日 |
| 教务导入 | 可配置适配器与学校档案；无预置学校、无登录流程 |
| 数据 | JSON/ICS/文件导入导出、模板、文本导入、清空数据 |
| AI | AI 模型服务（云端/本地）、密钥、模型、连接测试、人格、分项授权、长期记忆 |
| QQQ 游乐场 | 参考页面视觉复刻的小游戏/彩蛋 |
| 木鱼 | 3D 木雕风格木鱼与计数 |

---

## 10 AI 助手「小序」

### 10.1 运行方式

- **本地规则**（默认，零配置）：查今天/明天/周几/下周/第 N 周/下一节/今天还剩几节/某课在哪几点/课程数量；检索笔记（需授权）；长期记忆；少量固定动作指令。
- **云端模型**：OpenAI、DeepSeek、智谱 GLM、通义千问、Kimi、硅基流动、OpenRouter 和自定义 OpenAI 兼容服务；需要 API Key。
- **本地模型**：默认 Ollama，也可选 LM Studio 或自定义本地 OpenAI 兼容服务；API Key 可留空，模型需先在本机下载。
- 两种模型方式都使用 `POST {baseUrl}/chat/completions`，请求包含系统提示、授权上下文、最多 20 轮历史、长期记忆和本手册相关章节。密钥只存本机。
- 设置页的「测试连接」会用当前 Base URL、密钥和模型发送一条极短的 ping 请求，并显示延迟或具体错误；本地服务不可达时会提示检查服务是否启动与跨域设置。
- 对话气泡按 Markdown 渲染（标题、列表、表格、代码、链接）；单次输出上限普通对话 8000 tokens、带附件 6000 tokens，达到上限会提示「继续」补全。未闭合的动作代码块会被丢弃并提示截断，不会把 JSON 原文显示在对话里。

### 10.2 分项授权

默认全部开启，并额外注入课表清单（每套课表的 id、名称、学期、课程与日程数量），因此 AI 可以直接定位要切换或删除的课表。旧版本保存过的分项授权会在升级后一次性补全为全部开启，之后仍可逐项关闭。授权开关：

- `schedule`：课表与学期（课程、时间、教室、下一节）。
- `notes`：笔记正文。
- `noteTags`：只共享笔记标题和标签。
- `tasks`：任务与 DDL（需要任务详情）。
- `exams`：考试与成绩相关数据。

关闭的项不会进入系统提示，也不会出现在上下文预览里。动作执行不受授权影响，但执行器会再次校验当前数据是否存在。

### 10.3 人格与记忆

- 人格：名字（默认「小序」）、语气（简洁/温和/俏皮）、最多 500 字自定义提示。
- 长期记忆：用户说「记住……」或「以后叫我……」时保存；最多 30 条，每条 200 字；可逐条删除或清空。模型模式下记忆会随请求发送。
- 记忆是用户主动保存的偏好，不受分项授权裁剪。

### 10.4 目录提取

粘贴课程目录纯文本（自由行或 Markdown 表格），提取课程名、学分、先修、开课学期；只采纳能读到课程名且至少有一项元数据的行。结果可预览、复制 Markdown、保存为笔记。不联网、不上传。

---

## 11 动作协议（AI 执行接口）

### 11.1 回复格式

助手正常回答后，如果需要执行操作，在回复末尾追加**一个**如下代码块：

````text
```kexu-action
[
  { "action": "create_task", "args": { "title": "交高数作业", "dueDate": "2026-11-20", "courseId": "course-xxx" } }
]
```
````

规则：

1. 代码块语言必须是 `kexu-action`，内容必须是 JSON 数组（单个对象也接受）。
2. 代码块里的内容不会展示给用户：普通动作由界面直接执行，不可逆动作直接弹出确认框。AI 不应在正文里复述动作明细或再次征求确认。
3. 一次回复最多 40 个动作；有依赖关系的动作按数组顺序执行。
4. 导入课表（文本、Excel/CSV、ICS、Word、PDF、截图、分享链接、任何附件）**必须一次性完成**：把全部课程合并进**一个** `add_courses_from_text` 动作的 `text` 里，禁止拆成多个 `add_course` / `add_courses_from_text`，也不要告诉用户「分两批」。单个动作里的课程数量不设上限。
5. 只使用上下文里出现的 ID；找不到就让用户先确认或打开对应页面。
6. 不要用文字问用户「要不要执行」，也不要让用户回复「确认」：普通动作直接执行，删除、清空等不可逆动作直接弹一次确认框。不要声称「已完成」，执行结果会写回对话。
7. 删除、清空、覆盖导入只在用户明确要求时生成，并在 `reason` 里说明影响范围；删除类动作的 ID 直接从上下文取，不要反问用户要名称或确认。
8. 需要文件选择器、系统权限或 OAuth 的功能，用 `open_dialog` / `open_settings` 打开入口，由用户完成授权；不要假装已连接外部服务。
9. 无法完成时不要编造动作，直接说明缺少什么（例如「需要先配置 API Key」「需要先打开任务页确认任务名」）。

### 11.2 只读与导航

| action | 参数 | 说明 |
|---|---|---|
| `navigate` | `{ page: "timetable" \| "agenda" \| "plan" \| "notes" \| "ai" \| "courses" \| "profile", planTab?: "gaps" \| "study" \| "select" }` | 切换页面；`plan` 可指定子页 |
| `set_week` | `{ week: number }` | 跳到指定教学周并打开周课表 |
| `open_settings` | `{ tab?: "term" \| "periods" \| "tasks" \| "grades" \| "reminders" \| "calendar" \| "academic" \| "data" \| "ai" \| "playground" \| "woodfish" }` | 打开设置页 |
| `open_text_import` | `{ text: string }` | 打开文本导入并预填内容，由用户预览确认 |
| `open_dialog` | `{ dialog: "text-import" \| "share" \| "timetables" \| "wallpaper" \| "week-picker" \| "command-palette" }` | 打开对应弹窗或面板，由用户完成文件选择与授权 |
| `print` | `{}` | 打印当前课表 |
| `undo` | `{}` | 撤销上一次数据修改 |
| `redo` | `{}` | 重做被撤销的修改 |
| `read_manual` | `{ section: string }` | 读取本手册指定章节，用于补充细节 |

### 11.3 笔记

| action | 参数 | 说明 |
|---|---|---|
| `create_note` | `{ title: string, body?: string, tags?: string[], courseId?: string, pinned?: boolean }` | 新建笔记 |
| `update_note` | `{ id: string, title?: string, body?: string, tags?: string[], pinned?: boolean }` | 修改笔记 |
| `delete_note` | `{ id: string }` | 删除笔记 |

### 11.4 任务

| action | 参数 | 说明 |
|---|---|---|
| `create_task` | `{ title: string, dueDate?: "YYYY-MM-DD", dueTime?: "HH:MM", courseId?: string, note?: string, estimatedMinutes?: number, repeat?: "none" \| "daily" \| "weekly" \| "monthly" }` | 新建任务 |
| `complete_task` | `{ id: string }` | 标记完成（重复任务会顺延） |
| `delete_task` | `{ id: string }` | 删除任务 |

### 11.5 考试

| action | 参数 | 说明 |
|---|---|---|
| `create_exam` | `{ title: string, date: "YYYY-MM-DD", courseId?: string, type?: "quiz" \| "midterm" \| "final" \| "lab" \| "other", startTime?: "HH:MM", endTime?: "HH:MM", location?: string, seat?: string, note?: string }` | 新建考试 |
| `delete_exam` | `{ id: string }` | 删除考试 |

### 11.6 课程

| action | 参数 | 说明 |
|---|---|---|
| `add_course` | `{ name: string, teacher?: string, location?: string, note?: string, slots: Array<{ day: 1-7, start: number, end: number, weekStart?: number, weekEnd?: number, pattern?: "all" \| "odd" \| "even" }> }` | 新建课程，至少一个时段 |
| `update_course` | `{ id: string, name?: string, teacher?: string, location?: string, note?: string }` | 修改课程基本信息，不动时段 |
| `delete_course` | `{ id: string }` | 删除课程及其时段 |

### 11.7 日程

| action | 参数 | 说明 |
|---|---|---|
| `add_event` | `{ title: string, date: "YYYY-MM-DD", allDay?: boolean, start?: "HH:MM", end?: "HH:MM", note?: string, repeat?: "none" \| "daily" \| "weekly" \| "monthly", repeatUntil?: "YYYY-MM-DD" }` | 新建日程 |
| `delete_event` | `{ id: string }` | 删除日程 |

### 11.8 学期、课表与高风险动作

| action | 参数 | 说明 |
|---|---|---|
| `update_semester` | `{ name?: string, startDate?: "YYYY-MM-DD", totalWeeks?: number, showWeekends?: boolean }` | 修改当前学期设置，至少提供一项 |
| `switch_timetable` | `{ id: string }` | 切换到指定课表，ID 必须来自上下文 |
| `add_courses_from_text` | `{ text: string }` | 解析文本并批量建课；执行前会确认解析结果 |
| `clear_all` | `{}` | 清空当前课表数据（高风险，二次确认） |

### 11.9 全功能动作总表（v2）

以下动作覆盖课序的完整功能面。普通写动作由界面直接执行；删除、清空等不可逆动作直接弹确认框。没有 ID 时先用 `navigate` 打开对应页面，或让用户确认目标。

**偏好与界面**

| action | 参数 | 说明 |
|---|---|---|
| `set_preferences` | `{ theme?: "light" \| "dark" \| "whale", layout?: "grid" \| "list", showAliases?: boolean, autoHolidays?: boolean }` | 主题、课表布局、楼栋别名、自动节假日 |
| `set_wallpaper` | `{ preset: "paper" \| "sage" \| "dawn" \| "dusk" \| "whale-night", dim?: 0-80 }` | 设置课表壁纸 |

**笔记与章节**

| action | 参数 | 说明 |
|---|---|---|
| `create_chapter` | `{ title, courseId?, order? }` | 新建笔记章节 |
| `rename_chapter` | `{ id, title }` | 重命名章节 |
| `delete_chapter` | `{ id }` | 删除章节，笔记回到未归档 |
| `move_note` | `{ noteId, chapterId? }` | 把笔记移入章节；省略 `chapterId` 表示移出 |

**任务**

| action | 参数 | 说明 |
|---|---|---|
| `update_task` | `{ id, title?, dueDate?, dueTime?, courseId?, note?, estimatedMinutes?, repeat? }` | 修改任务；日期/时间传空字符串可清除 |
| `reopen_task` | `{ id }` | 已完成改回未完成 |
| `add_subtask` | `{ taskId, title }` | 添加子任务 |
| `toggle_subtask` | `{ taskId, subtaskId }` | 勾选/取消子任务 |
| `delete_subtask` | `{ taskId, subtaskId }` | 删除子任务 |

**考试与成绩**

| action | 参数 | 说明 |
|---|---|---|
| `update_exam` | `{ id, title?, date?, courseId?, type?, startTime?, endTime?, location?, seat?, note? }` | 修改考试 |
| `set_grade` | `{ courseId, score?, credits?, status? }` | 录入/修改成绩，`status` 为 `normal/retake/exempt/audit/planned` |
| `delete_grade` | `{ courseId }` | 删除一条成绩 |
| `update_grade_settings` | `{ hideScores?, requiredCredits? }` | 成绩隐私与毕业学分目标 |

**课程、时段与单次调整**

| action | 参数 | 说明 |
|---|---|---|
| `set_course_slots` | `{ courseId, slots: Array<{ day, start, end, weekStart?, weekEnd?, pattern?, weeks? }> }` | 整体替换一门课的全部时段 |
| `restore_course` | `{ courseId }` | 恢复被隐藏的课程 |
| `override_session` | `{ courseId, week, kind: "cancel" \| "move" \| "hide", slotId?, toDay?, toStart?, toEnd? }` | 停课、调课或从某周起隐藏 |
| `remove_override` | `{ id }` | 撤销一条单次调整 |

**日程**

| action | 参数 | 说明 |
|---|---|---|
| `update_event` | `{ id, title?, date?, allDay?, start?, end?, note?, repeat?, repeatUntil? }` | 修改日程 |
| `check_in_event` | `{ id, date }` | 切换某次日程打卡 |

**学期、课表与作息**

| action | 参数 | 说明 |
|---|---|---|
| `create_timetable` | `{ name, semesterName?, startDate?, totalWeeks?, showWeekends?, weekStartsOn?, periodProfileId?, templateId?: "blank" \| "stem" \| "humanities" \| "medical" \| "exam" }` | 新建一套课表 |
| `rename_timetable` | `{ id, name }` | 重命名课表 |
| `duplicate_timetable` | `{ id }` | 复制课表 |
| `delete_timetable` | `{ id }` | 删除课表及其数据（至少保留一套） |
| `set_periods` | `{ periods: Array<{ start: "HH:MM", end: "HH:MM" }>, profileId? }` | 整体替换每日作息 |
| `rename_period_profile` | `{ id, name }` | 重命名作息方案 |

**日历与提醒**

| action | 参数 | 说明 |
|---|---|---|
| `set_calendar_override` | `{ date, kind: "holiday" \| "workday", name?, borrowFrom? }` | 某天放假，或按周几补课 |
| `delete_calendar_override` | `{ id }` | 删除自定义放假/补课 |
| `update_reminders` | `{ enabled?, leadMinutes?, todaySummary?, todaySummaryTime?, tomorrowSummary?, tomorrowSummaryTime?, examReminders?, taskReminders? }` | 上课、考试与 DDL 提醒 |

**导入、模板、导出、备份与同步**

| action | 参数 | 说明 |
|---|---|---|
| `save_template` | `{ name }` | 当前课表存为模板 |
| `apply_template` | `{ id }` | 模板课程追加到当前课表 |
| `delete_template` | `{ id }` | 删除模板 |
| `export_data` | `{ format: "json" \| "ics" }` | 导出文件 |
| `sync_widget` | `{}` | 同步安卓桌面小组件 |
| `clear_scope` | `{ scope: "notes" \| "tasks" \| "exams" \| "grades" \| "planner" \| "woodfish" }` | 按范围清空；`planner` 含选课池、方案、学习记录和空档偏好 |

**空档与选课规划**

| action | 参数 | 说明 |
|---|---|---|
| `update_gap_preferences` | `{ walkSpeed?, bufferMinutes?, lunchEnabled?, lunchStart?, lunchEnd?, lunchMinutes?, accessMode?, accessibleExtra?, aliases?, customWalks? }` | 空档评估偏好；`aliases` 与 `customWalks` 会与现有值合并 |
| `add_catalog_section` | `{ name, credits, category: "required" \| "elective" \| "general" \| "pe" \| "lab" \| "other", day, start, end, teacher?, location?, code?, weekStart?, weekEnd?, pattern?, difficulty?, examWeek?, note? }` | 加入选课池并选中 |
| `update_catalog_section` | `{ id, name?, credits?, category?, teacher?, location?, code?, note?, difficulty?, examWeek? }` | 修改候选班次 |
| `delete_catalog_section` | `{ id }` | 从选课池删除 |
| `select_catalog_section` | `{ id }` | 加入当前方案 |
| `unselect_catalog_section` | `{ id }` | 移出当前方案 |
| `create_selection_plan` | `{ name? }` | 新建选课方案 |
| `switch_selection_plan` | `{ id }` | 切换方案 |
| `delete_selection_plan` | `{ id }` | 删除方案（至少保留一个） |
| `auto_combine_plan` | `{ maxCredits?, maxWeeklyPeriods?, categories? }` | 自动生成一套选课组合 |

**学习、AI 与彩蛋**

| action | 参数 | 说明 |
|---|---|---|
| `add_study_log` | `{ subject, minutes, courseId?, start?, kind?: "pomodoro" \| "manual" \| "review", note? }` | 手动补记学习时长 |
| `update_ai_settings` | `{ provider?: "local" \| "openai" \| "deepseek" \| "zhipu" \| "qwen" \| "moonshot" \| "siliconflow" \| "openrouter" \| "openai-compatible" \| "ollama" \| "lmstudio" \| "custom-local", baseUrl?, model?, personaName?, tone?: "concise" \| "warm" \| "playful", customPrompt?, permissions?: { schedule?, notes?, noteTags?, tasks?, exams? } }` | 修改 AI 设置；切换 provider 时未显式给出的 Base URL 与模型会套用该服务商默认值；**永远不接收或修改 API Key** |
| `add_memory` | `{ text }` | 新增长期记忆 |
| `delete_memory` | `{ id }` | 删除一条记忆 |
| `clear_memory` | `{}` | 清空长期记忆 |
| `tap_woodfish` | `{ times?: 1-100 }` | 敲木鱼 |

### 11.10 动作返回

应用执行后返回：

```json
{ "ok": true, "message": "已创建任务《交高数作业》。" }
```

失败时 `ok: false`，`message` 会说明原因（数据不存在、参数不合法、用户取消、存储失败等）。失败不要自动重试写操作。

---

## 12 常见任务配方

| 用户说法 | 助手动作 |
|---|---|
| 「打开空档页」 | `navigate` → `{ page: "plan", planTab: "gaps" }` |
| 「跳到第 10 周」 | `set_week` → `{ week: 10 }` |
| 「帮我建个作业：周五交高数作业」 | 先按课程名匹配 `courseId`，再 `create_task` |
| 「把这条任务标记完成」 | 从任务上下文取 `id`，`complete_task` |
| 「加一门课：周三 3-4 节，1-16 周」 | `add_course`，`slots[0].day=3,start=3,end=4,weekStart=1,weekEnd=16` |
| 「把高数老师改成李老师」 | 从课程上下文取 `id`，`update_course` |
| 「记一条笔记：期中复习重点……」 | `create_note`，正文放在 `body` |
| 「加考试：12 月 20 日高数期末，教一 401」 | 匹配课程后 `create_exam` |
| 「把这段课表导进去」 | 只生成一个 `add_courses_from_text`，把所有行一次性写进 `text`；不再拆分批次 |
| 「拖入课表 Excel」 | 本地解析全部行后，合并成一个 `add_courses_from_text` 动作卡，不直接写入 |
| 「拖入课表 Word / PDF」 | 本地提取正文与表格文字后，合并成一个 `add_courses_from_text` 动作卡；PDF 扫描件提取不到文字时会提示改用图片附件 |
| 「看看这张成绩单图片」 | 远程视觉模型读图后，按内容生成 `create_note`、`create_exam` 或 `create_task` |
| 「清空所有数据」 | 只在用户明确确认影响后 `clear_all`，并提示不可恢复 |
| 「把成绩录一下」 | 匹配 `courseId` 后 `set_grade`；批量时逐个生成动作（最多 40 个） |
| 「这周高数停课」 | 找出课程与节次后 `override_session`，`kind: "cancel"` |
| 「下周三的课挪到周四」 | `override_session`，`kind: "move"` 并给出 `toDay/toStart/toEnd` |
| 「换深色主题」 | `set_preferences` → `{ theme: "dark" }` |
| 「自动配一套选课方案」 | `auto_combine_plan`；没有选课池时先提示用户添加候选班次 |

---

## 13 权限、安全与可靠性

- 密钥只保存在本机 `kexu:ai:settings:v1`；不要在其他页面、笔记或聊天里复述密钥。
- 模型模式只发送授权范围内的数据；默认不发送笔记正文、任务、考试。
- 动作参数必须按上表校验：日期 `YYYY-MM-DD`、时间 `HH:MM`、星期 1-7、节次 1-14、周次不超过学期总周数。
- 普通写动作由界面直接执行；删除、清空等不可逆动作只弹一个确认框，不再经过动作确认卡。
- 存储失败（隐私模式、配额满）时返回可读错误，不假装成功。
- 助手无法访问网络文件、系统凭据、其他浏览器标签页或未授权的 `localStorage` 键。
- 如果用户说「停/不要改」，立即停止生成写动作，只汇报当前状态。

---

## 14 开发者接口摘要

### 14.1 AI 模块 `src/lib/ai.ts`

```ts
buildAiScheduleSnapshot({ courses, semester, week, now }): AiScheduleSnapshot
answerScheduleQuestion(question, snapshot, now?): { text, intent, sessions }
complete(request, settings?, fetchImpl?, now?): Promise<{ content, provider, error? }>
aiComplete(prompt, context?, settings?): Promise<string>
buildSystemPrompt(settings, sources, memory?): string
buildAiContext(sources, permissions): string
loadAiSettings / saveAiSettings / normalizeAiSettings
loadChat / saveChat / appendChat / createChatMessage
loadMemory / saveMemory / addMemory / updateMemory / removeMemory / clearMemory
extractMemoryRequest(question): string | null
describePermissions(permissions): PermissionDescriptor[]
```

`complete` 的 `request` 支持 `messages`、`system`、`snapshot`、`notes`、`tasks`、`exams`、`memory`。新增数据源时必须同步 `AiContextSources` 与授权裁剪。

### 14.2 动作模块 `src/lib/aiActions.ts`

```ts
AI_ACTIONS: AiActionDefinition[]                 // 动作目录与参数说明
AI_ACTION_GUIDE: string                          // 注入系统提示的紧凑动作表
parseAiActions(content): { text, actions, errors }
validateAiAction(action, context?): { ok, error? }
describeAiAction(action, context?): string       // 动作说明文案
isDestructiveAction(action): boolean
parseLocalCommand(text, context): AiAction[]     // 本地规则模式的固定指令
```

### 14.3 手册模块 `src/lib/aiManual.ts`

```ts
AI_MANUAL_SECTIONS: ManualSection[]              // 标题、ID、正文
buildAiManualPrompt(question, maxChars?): string // 能力卡 + 动作表 + 相关章节
findManualSection(idOrTitle): ManualSection | null
```

### 14.4 数据接口

- 笔记：`src/lib/notes.ts` 的 `loadNotes`、`saveNotes`、`createNote`、`updateNote`、`upsertNote`、`deleteNote`、`searchNotes`。
- 任务：`src/lib/tasks.ts` 的 `loadTasks`、`saveTasks`、`makeTask`、`completeTask`、`groupTasks`。
- 考试：`src/lib/exams.ts` 的 `loadExams`、`saveExams`、`makeExam`。
- 课程/日程：`src/lib/factory.ts` 的 `makeCourse`、`makeSlot`、`makeEvent`；写入通过 `src/hooks/useScheduleActions.ts` 的 `saveCourse`、`saveEvent`、`saveSemester`、`clearAll` 等。
- 课表实体：`src/types.ts` 的 `Course`、`CourseSlot`、`Semester`、`ScheduleEvent`、`Timetable`、`ScheduleData`。

---

## 15 故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| AI 只回答固定几句 | 仍在旧的本地规则配置 | 设置 → AI 助手 → 选择云端或本地模型，并填写密钥/模型后保存 |
| 模型请求失败 | Base URL、模型名、密钥、本地服务或网络问题 | 先点「测试连接」看延迟或错误码；确认 `/chat/completions` 兼容 OpenAI |
| Ollama 连接失败 | 服务未启动、模型未下载或跨域被拦截 | 运行 `ollama serve` 与 `ollama pull <模型>`；必要时设置 `OLLAMA_ORIGINS` |
| 动作卡不出现 | 模型没有按协议输出 `kexu-action` 代码块 | 换支持指令跟随的模型；或在本地模式使用固定指令 |
| 动作执行提示「数据不存在」 | 页面数据已变化或 ID 过期 | 重新打开对应页面后让助手重试 |
| 任务/考试看不到 | 当前课表 ID 与数据所属课表不同 | 确认当前课表；任务/考试按课表隔离 |
| 提醒不触发 | 页面未打开或未授权通知 | 保持页面打开，允许浏览器通知 |
| 导入失败 | 文件格式/列映射/编码不匹配 | 先导出 JSON 备份；用文本导入逐行排查 |
| 数据丢失 | 清空、覆盖导入或浏览器清理存储 | 从导出的 JSON 备份恢复；高风险操作前先备份 |

---

## 16 版本与来源

- 底座：ClassFlow v1.11.1（MIT，上游提交 `30c466a`），本项目在 `third_party/classflow-full` 内二次开发。
- 复用模块：P07 Course_Planner（Apache-2.0）、P09 Gapwise（MIT）、P11 StudyDesk（MIT）；许可证与 NOTICE 随代码保留。
- 本手册不替代上游文档；功能冲突时以当前源码和界面为准。

---

## 17 万能附件（拖入文件）

入口：AI 助手「对话」页，把文件直接拖进对话框，或点输入框左侧回形针选择。一次最多 6 个附件，其中图片最多 4 张，单个不超过 15 MB。

| 类型 | 扩展名 | 处理方式 |
|---|---|---|
| 图片 | png / jpg / webp / gif | 压缩到最长边 1600px 后，随消息发送给已配置的云端或本地视觉模型；模型必须支持图片输入。第一次请求失败或返回空内容时，会自动改用精简视觉请求重试一次 |
| 表格 | xlsx / csv / tsv | 本地解析行列，兼容带 `x:row` 命名空间前缀的 xlsx；列名能匹配「课程名 / 星期 / 节次 / 周次」时，同时生成课程草稿和「导入 N 门课」按钮 |
| Word | docx | 本地解压并读取正文与表格；Word 表格列名匹配时同样生成课程草稿。旧版 .doc 需另存为 .docx |
| PDF | pdf | 本地用 pdf.js 提取文字并按坐标还原行与列，最多读取前 20 页；扫描件或纯图片 PDF 提取不到文字时会提示改用图片附件 |
| 日历 | ics | 解析全部 VEVENT，按「课程/系列」归并后输出完整摘要（星期、时间、地点、教师、周次、次数），不再按原文截断 |
| 文本 | txt / md / json / html 等 UTF-8 文本 | 本地读取并截断过长内容；能识别出课表行时同样生成课程草稿 |
| 其他 | xls / doc / ppt / zip 等 | 暂不支持，直接提示转换格式，不会静默失败 |

规则：

- 原始文件不会写入 `localStorage`。聊天记录只保留文件名、类型和大小；正文摘要只在本轮请求里使用。
- 本地规则模式不联网，也不能读图；拖入课程表文本/表格会生成课程导入动作，其他附件会提示切换到云端或本地模型。
- 模型模式只发送本轮附件内容和用户消息；图片单独走视觉输入，不进入长期记忆。
- 附件是课表时优先输出 `add_courses_from_text`；任务清单用 `create_task`，考试安排用 `create_exam`，资料用 `create_note`。
- 不确定附件用途时，先概括内容并询问用户；不要擅自清空、覆盖或批量删除已有数据。
- 普通写操作直接执行；删除、清空等不可逆操作只弹一个确认框。