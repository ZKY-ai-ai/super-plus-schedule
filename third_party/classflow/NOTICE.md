# 第三方代码归属：课序 ClassFlow

本目录存放从 [lcymxm/classflow](https://github.com/lcymxm/classflow) 引入的源码子集，用于向课隙 CourseGap 移植功能。

## 许可证

上游许可证为 **MIT**，原文见同目录 [LICENSE](LICENSE)，版权归上游作者所有。引入的代码及其改写版本均须保留该版权声明与许可证文本。

课隙 CourseGap 自身以 Apache-2.0 发布。MIT 与 Apache-2.0 兼容：本目录内的文件继续受 MIT 约束，不改变仓库其余原创部分的许可证。

## 引入版本

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/lcymxm/classflow |
| 固定 commit | `30c466a5c456b7dde01cfc42a3178f83e87de7a6` |
| commit 日期 | 2026-11-13 |
| 引入日期 | 2026-11-16 |
| 引入方式 | `raw.githubusercontent.com` 按上述 commit 逐文件下载，未做修改 |

## 引入文件与用途

| 上游文件 | 在本项目中的用途 |
|---|---|
| `src/lib/periods.ts` | 作息按「月-日」每年循环的规则归一化与生效判定，移植为 `web/js/periods.js`（F023） |
| `src/lib/holidays.ts` | 2026/2027 年法定节假日与调休上班日数据、节假日停课与周末可见性判定，移植为 `web/js/calendar.js`（F026） |
| `src/lib/templates.ts` | 预设课表模板的课程种子数据与生成逻辑，移植为 `web/js/templates.js`（F130） |
| `src/lib/wallpaper.ts` | 壁纸预设、遮罩透明度换算、图片压缩为 dataURL 的逻辑，移植为 `web/js/appearance.js`（F133/F134） |
| `src/lib/date.ts` | 日期键与周次工具，仅作对照参考 |
| `src/types.ts` | 上游数据结构定义，仅作对照参考 |
| `src/test/periods.test.ts`、`src/test/holidays.test.ts`、`src/test/templates.test.ts` | 上游断言，用于校验移植后的行为一致性 |

## 明确未引入的部分

- **桌宠与主题素材**：上游 `src/components/DesktopPet.tsx`、`WhaleMascot.tsx` 及 `wallpapers/whale-night.svg` 使用 [dsh-pet](https://github.com/zhu1090093659/dsh-pet) 的 `whale-girl-refined` 素材与「DeepSeek 鲸鱼娘」主题。上游 README 自陈这些素材「仅用于免费非商业项目」，且 DeepSeek 名称与标志归 DeepSeek 官方。本项目为参赛公开发布作品，**不引入上述素材与相关组件**，桌宠（F136）改用原创 SVG 实现。
- **`wallpaper.ts` 中的 `whale-night` 预设**：因其绑定上述受限素材，移植时剔除，仅保留纯 CSS 渐变预设。
- **React / Vite / Capacitor 工程与构建链**：上游为 React 19 + TypeScript + Vite 8 + Capacitor 8，本项目为零构建静态 ES Modules PWA，只移植纯逻辑，不引入其组件、样式表与构建配置。
- **Android 桌面小组件**（`src/lib/widget.ts`）：依赖 Capacitor 原生壳，本项目无原生壳，未引入（F068/F069 未实现）。

## 移植说明

移植不是逐行复制：上游为 TypeScript + React 数据模型（`Timetable` / `PeriodProfile` / `Session`），本项目为原生 ES Modules + 自有数据模型（`schedules` / `periodSets` / `sessionsOn`）。`web/js/` 下对应文件是按上游算法与数据改写的实现，文件头部标注了来源与 MIT 归属。

节假日日期数据本身是政府公开安排的事实信息，上游文件注明其来源为国务院办公厅 2026 年（2025-11-04 发布）与 2027 年（2026-11-05 发布）节假日安排通知；本项目转引该数据，**未独立核验政府原文**，用户可在「设置 → 校历与假日」逐日覆盖。
