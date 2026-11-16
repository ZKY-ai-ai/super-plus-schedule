# 课隙 CourseGap

大学生课表与课间空档规划工具。离线优先的 PWA：课表管理、单次调课、作业 DDL、考试倒计时、课间空档分析、AI 自然语言问答，全部数据只保存在本机浏览器。

为 **2026 Qoder 高校创造力大赛（AI 大模型赛）StudyHack 赛道** 开发，使用 Qoder 完成设计与实现，部署于 Qoder Sites。

- 在线体验：https://coursegap-94kvqohlzrh.qoder.zone （Qoder Sites 公开部署）
- 许可证：Mulan PSL v2（木兰宽松许可证 第2版，沿用仓库预先声明；本项目全部代码为原创）
- 无账号、无追踪、无云端同步

## 功能总览

| 视图 | 能力 |
|---|---|
| 今日 | 正在上课 / 下一节课与最晚出发时间、今日课程、今日与逾期 DDL、考试倒计时、今日空档摘要、周统计 |
| 课表 | 周网格 / 周列表 / 日视图；多课表多学期；起止周 + 单双周 + 逐周勾选；同一课程多时段；冲突红框与明细；点击课程块单次停课 / 单次调课 / 编辑整门课；拖拽调课；撤销 / 重做（Ctrl+Z / Ctrl+Y）；PNG 导出与打印 |
| 任务 | 作业 / 项目 / 实验按课程归类；截止日期、优先级、子任务、完成状态；逾期 / 今日 / 明日 / 本周 / 以后 / 已完成分组 |
| 考试 | 日期、时间、地点、座位号；倒计时；考前 1 / 3 天提醒 |
| 空档 | 自动识别课间空档；扣除楼栋间步行与收拾缓冲后的可用时间；空档去处建议；「去某地再回来是否来得及」往返可行性与最晚返回时间 |
| AI 助手 | 离线规则问答（查课、查考试、查 DDL、空档与往返可行性、周统计）；可选配置 OpenAI 兼容接口解锁自由问答；可选视觉模型截图识课（结果强制人工核对后导入） |
| 设置 | 学期 / 开学日期 / 教学周数 / 周起始；多套作息与按课时长度一键生成；楼栋列表与步行时间矩阵；课前 / DDL / 考试提醒；浅色 / 深色 / 跟随系统；AI 接口配置；完整备份导出 / 恢复；示例数据；清空 |

### 导入与导出

| 方向 | 格式 |
|---|---|
| 导入 | 本项目 JSON、WakeUp 风格 JSON（`courseInfos`）、CSV（列名别名映射）、ICS（RRULE / INTERVAL / UNTIL / EXDATE）；导入前预览，可选替换 / 追加 / 合并 |
| 导出 | 完整备份 JSON、课程 JSON、ICS（单双周用 `INTERVAL=2`，调课生成独立 VEVENT 与 EXDATE，可带 VALARM 课前提醒）、CSV 模板、周课表 PNG、打印 |

ICS 导入导出与 Apple / Google / Outlook 等日历互通；导出文件是静态快照，不等于双向同步。

### 空档分析模型

```
可用空档 = 空档总长 − 去程步行 − 回程步行 − 收拾缓冲
最晚出发 = 下一节开始 − 去程步行 − 缓冲
往返可行 = 空档总长 ≥ 去程 + 停留 + 回程 + 缓冲
```

步行时间优先查「楼栋 ↔ 楼栋」矩阵（教室字段按前缀匹配楼栋，如 `教一-201` → `教一`），未配置时用默认步行分钟数。所有估算公开参数、可在设置中调整，不假装是实时地图数据。

### AI 的两层设计

1. **离线层（默认）**：本地规则解析日期 / 星期 / 时段语义，直接查询本机课表、任务、考试与空档引擎。不联网、不需要密钥。
2. **增强层（可选）**：在设置中填写 OpenAI 兼容接口地址、密钥与模型名后，解锁自由问答与截图识课。密钥仅存本机 localStorage，请求只发往用户填写的地址；截图识课结果带「待核对」标记，必须经导入预览确认后才写入课表。

## 快速开始

无需安装依赖、无需构建（纯 HTML / CSS / ES Modules）。

```bash
# 方式一：任意静态服务器
python -m http.server 8321 --bind 127.0.0.1 --directory web
# 打开 http://127.0.0.1:8321/

# 方式二：Node
npx serve web
```

首次打开建议点「加载示例数据体验」，熟悉后在「设置 → 数据与备份」清空并导入自己的课表。通过 http(s) 访问时自动注册 Service Worker，可安装为 PWA 并离线使用；`file://` 直接双击打开也能用核心功能（无 SW / 通知）。

提醒说明：Web 版提醒（课前、DDL 当天、考试临近）在页面打开期间生效；关闭页面后的后台推送需要原生 App 或服务器，不在本版范围内。

## 测试

```bash
node tests/smoke.mjs
```

24 项断言覆盖：单双周过滤、连堂时间、冲突检测、单次停课 / 调课与撤销、空档与往返可行性、ICS 导出（RRULE + INTERVAL=2 + EXDATE）、周字符串解析、CSV 与 WakeUp 导入、ICS 导入、AI 日期解析与本地回答、备份往返一致。

## 目录结构

```
web/                  站点根（Qoder Sites 发布目录）
  index.html          应用壳与七个视图容器
  css/style.css       设计系统（含 --site-* Nudge 变量消费）
  js/store.js         状态、localStorage 持久化、撤销栈、示例数据
  js/schedule.js      教学周映射、课次展开、冲突、空档与往返引擎
  js/importexport.js  JSON/CSV/ICS/WakeUp 导入导出、PNG、打印数据
  js/ai.js            离线规则问答 + 可选模型增强 + 截图识课
  js/editors.js       课程 / 课次 / 任务 / 考试编辑弹窗
  js/ui.js            DOM 工具、图标、toast、modal
  js/views/*.js       七个视图
  js/app.js           导航、主题、渲染调度、提醒、PWA 注册
  sw.js               Service Worker（网络优先、离线回退缓存）
  manifest.webmanifest
tests/smoke.mjs       Node 冒烟测试
docs/                 原创性与合规说明、大赛作品帖草稿
```

## 数据与隐私

- 全部业务数据存于浏览器 localStorage（键 `coursegap.v1`），无账号、无上传、无追踪。
- 完整备份 JSON 可换机迁移；清空数据不可恢复，请先备份。
- 配置 AI 后，仅向用户填写的接口发送问答所需的最小上下文（课程名、时间、地点等），不发送密钥以外的任何凭据；密钥只存本机。
- 示例数据为虚构课程与虚构教师，仅用于演示。

## 原创性与致谢

本项目 **全部代码为原创**，沿用仓库预先声明的 **Mulan PSL v2** 许可证。功能设计参考了下列开源项目的公开 README 与文档，**仅借鉴功能思路，未复制任何项目的代码、文本或素材**。功能思路不属于著作权保护客体；各项目许可证已于 2026-11-16 通过 GitHub API（`/repos/{owner}/{repo}/license`）逐一核验，记录如下：

| 编号 | 项目 | 核验许可证 | 借鉴的思路 |
|---|---|---|---|
| P01 | [Sleepy Android](https://github.com/lingion/sleepy) | GPL-3.0 | 多格式导入、单次调课、撤销重做、周视图 |
| P02 | [Sleepy iOS](https://github.com/lingion/sleepy-ios) | GPL-3.0 | 课次级操作、备份迁移、提醒分层 |
| P03 | [拾光课程表](https://github.com/ShiGuangSchedule/shiguangschedule) | Apache-2.0 | 多套作息绑定课表、节假日停课思路 |
| P04 | [破晓课程表](https://github.com/HF-CYGG/Dawn-Course) | GPL-3.0 | 多学期并存、备份还原 |
| P05 | [课序 ClassFlow](https://github.com/lcymxm/classflow) | MIT | 周列表 / 日视图、打印、本地免账号 |
| P06 | [贝壳课表](https://github.com/coderirse/BeikeSchedule) | 未找到 LICENSE | 考试座位号与倒计时、学分进度思路（仅思路） |
| P07 | [Uniplan / Course_Planner](https://github.com/Sira-pel/Course_Planner) | Apache-2.0 | 冲突剔除、ICS 导出、方案比较思路 |
| P08 | [HIAS-CSA](https://github.com/cty-cty/HIAS-CSA) | 未找到 LICENSE | 替代班次、考核压力分析思路（仅思路） |
| P09 | [Gapwise](https://github.com/GapwiseHQ/gapwise) | MIT | 课间空档扣除步行、往返可行性、最晚出发 |
| P10 | [AirCourse AI](https://github.com/Lounwb/AirCourse) | MIT | 截图识课 + 人工核对流程 |
| P11 | [StudyDesk](https://github.com/arun-v-p/StudyDesk) | MIT | 今日总览、DDL 分组、学期模板 |
| P12 | [StudySync](https://github.com/prayaghariyani/StudySync) | 未找到 LICENSE | 任务优先级 / 子任务、学习统计思路（仅思路） |
| P13 | [StudySky](https://github.com/suburb6/StudySky) | AGPL-3.0 | 章节组织思路（仅思路，未实现资料库） |
| P14 | [uni-course-scheduler](https://github.com/ez-hq/uni-course-scheduler) | 自定义（NOASSERTION） | 偏好排课思路（仅思路） |
| P15 | [Koishi course-schedule](https://github.com/VincentZyuApps/koishi-plugin-course-schedule) | 自定义（NOASSERTION） | 周课表图片导出思路 |
| P16 | [Miao-Yunzai classtable](https://github.com/Pimeng/classtable) | GPL-3.0 | WakeUp 分享格式兼容思路 |
| P17 | [QQ Reminder Bot](https://github.com/Spectrum-o/qq-reminder) | MIT | DDL 递进提醒、早报思路 |
| P18 | [西工大翱翔门户插件](https://github.com/qllokirin/nonebot-plugin-npu) | MIT | 新成绩 / 考试监控思路（仅思路） |
| P19 | [SJTU Agent](https://github.com/kuan-er/sjtu-agent) | MIT | 多平台 DDL 聚合、自然语言工具思路 |
| P20 | [JiangysBot](https://github.com/Jiangys-Crz/jiangysbot-public) | MIT | 调休联动、自然语言查课思路 |
| P21 | [OpenCLMS](https://github.com/xiaohuanshu/OpenCLMS) | AGPL-3.0 | 课堂辅助边界认知（仅思路，未实现） |
| P22 | [珞家 Luotopia](https://github.com/ClosedWHU/Luotopia) | 自定义（NOASSERTION） | 校园服务需求参考（仅思路，未实现） |

说明：

- 「未找到 LICENSE」与「自定义」的项目，本项目同样只参考其公开文档中的功能描述，不复制任何受保护表达；未确认许可证的项目不默认允许复用代码。
- GPL / AGPL 项目的代码与本项目完全隔离：本项目未引入其任何源码、片段或衍生实现，因此不存在 copyleft 传染问题。
- 详细合规边界见 [docs/原创性与合规说明.md](docs/原创性与合规说明.md)。

## 大赛信息

- 赛事：2026 Qoder 高校创造力大赛（AI 大模型赛），StudyHack 赛道
- 源码仓库：https://github.com/ZKY-ai-ai/super-plus-schedule
- 开发工具：Qoder（设计、实现、验证、部署全流程）
- 部署：Qoder Sites 公开访问
- 作品帖：天池论坛（草稿见 [docs/天池作品帖草稿.md](docs/天池作品帖草稿.md)）

## 协作

仓库在 GitHub 托管，私有库，克隆和推送都需要授权；采用分支 + PR 流程：

1. 从 `main` 切出功能分支，命名 `feat/<内容>` 或 `fix/<内容>`。
2. 提交信息用动词开头说清改动，一个提交只做一件事。
3. 发起 PR，由另一位协作者批准后合入 `main`，作者不给自己批准。PR 描述模板见 [.github/pull_request_template.md](.github/pull_request_template.md)。

`main` 目前没有技术层面的分支保护（GitHub 免费版私有库不开放 protected branches），靠上述约定维护。出问题用 `git revert` 回滚，不要 `--force` 改写已推送的历史。

## 许可

本仓库源码以[木兰宽松许可证 第2版（MulanPSL-2.0）](LICENSE)授权，条款原文见 [LICENSE](LICENSE)。仓库当前私有，任何人实际取得源码并再分发时（无论日后公开仓库或直接从协作者处获得副本），即受该许可证约束。

## License

[Mulan PSL v2](LICENSE)