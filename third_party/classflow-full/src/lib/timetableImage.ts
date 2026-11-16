import type { CourseSlot, Period, Session } from "../types";
import { toneColor } from "../types";
import { formatDuration, weekdayLabel } from "./date";
import { groupSessionsByDay, sessionMinutes } from "./schedule";

export interface WeekShareInput {
  title: string;
  term: string;
  week: number;
  dateRange: string;
  days: number[];
  dates: Date[];
  sessions: Session[];
  periods: Period[];
  showAliases?: boolean;
}

export interface RenderedTimetableImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  filename: string;
}

const WIDTH = 1600;
const MARGIN = 64;
const HEADER_HEIGHT = 190;
const DAY_HEADER_HEIGHT = 64;
const ROW_HEIGHT = 94;
const TIME_COLUMN_WIDTH = 112;
const FOOTER_HEIGHT = 68;
const PIXEL_RATIO = 2;

const PAPER = "#f7f2e7";
const PAPER_LIGHT = "#fffdf7";
const INK = "#2f342e";
const MUTED = "#7f7d6e";
const LINE = "#ded6c4";
const ACCENT = "#c5634b";
const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

function displayName(session: Session, showAliases = false): string {
  if (showAliases && session.course.alias) return session.course.alias;
  return session.course.name;
}

function shortDate(date: Date | undefined): string {
  if (!date) return "";
  return `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, "0")}`;
}

function sessionPeriodLabel(session: Session): string {
  return session.start === session.end
    ? `第 ${session.start} 节`
    : `第 ${session.start}–${session.end} 节`;
}

function courseCount(sessions: Session[]): number {
  return new Set(sessions.map((session) => session.course.id)).size;
}

function weekMinutes(sessions: Session[], periods: Period[]): number {
  return sessions.reduce((total, session) => total + sessionMinutes(periods, session), 0);
}

function cleanFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "课表";
}

export function timetableImageFilename(input: WeekShareInput): string {
  return `课序-${cleanFilename(input.title)}-第${input.week}周.png`;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const characters = [...text];
  const lines: string[] = [];
  let line = "";
  for (const character of characters) {
    const next = line + character;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const consumed = lines.join("").length;
    if (consumed < characters.length) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
    }
  }
  return lines;
}

/** Draws a shareable PNG for the current week. Browser-only; returns the blob and preview URL. */
export async function renderTimetableImage(
  input: WeekShareInput,
): Promise<RenderedTimetableImage> {
  if (typeof document === "undefined") {
    throw new Error("当前环境不支持生成课表图片。");
  }
  const periods = [...input.periods].sort((a, b) => a.index - b.index);
  const rows = Math.max(1, periods.length);
  const days = input.days.length > 0 ? input.days : [1, 2, 3, 4, 5];
  const width = WIDTH;
  const height = HEADER_HEIGHT + DAY_HEADER_HEIGHT + rows * ROW_HEIGHT + FOOTER_HEIGHT + 28;

  const canvas = document.createElement("canvas");
  canvas.width = width * PIXEL_RATIO;
  canvas.height = height * PIXEL_RATIO;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前设备无法生成课表图片。");
  context.scale(PIXEL_RATIO, PIXEL_RATIO);

  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);

  const highlight = toneColor("clay");
  context.fillStyle = highlight;
  roundRect(context, MARGIN, 46, 10, 54, 5);
  context.fill();

  context.fillStyle = ACCENT;
  context.font = `600 14px ${FONT}`;
  context.fillText("课序 CLASSFLOW", MARGIN + 28, 64);

  context.fillStyle = INK;
  context.font = `700 42px ${FONT}`;
  context.fillText(input.title, MARGIN + 28, 106);

  context.fillStyle = MUTED;
  context.font = `400 17px ${FONT}`;
  context.fillText(
    `${input.term} · 第 ${input.week} 周 · ${input.dateRange}`,
    MARGIN + 28,
    136,
  );

  const stats = `${courseCount(input.sessions)} 门课程 · ${input.sessions.length} 节课 · ${formatDuration(weekMinutes(input.sessions, periods))}`;
  context.textAlign = "right";
  context.fillStyle = INK;
  context.font = `600 22px ${FONT}`;
  context.fillText(`第 ${input.week} 周`, width - MARGIN, 82);
  context.fillStyle = MUTED;
  context.font = `400 15px ${FONT}`;
  context.fillText(stats, width - MARGIN, 112);
  context.textAlign = "left";

  const gridX = MARGIN + TIME_COLUMN_WIDTH;
  const gridWidth = width - MARGIN * 2 - TIME_COLUMN_WIDTH;
  const columnWidth = gridWidth / days.length;
  const gridTop = HEADER_HEIGHT;
  const bodyTop = gridTop + DAY_HEADER_HEIGHT;
  const bodyBottom = bodyTop + rows * ROW_HEIGHT;

  context.fillStyle = PAPER_LIGHT;
  roundRect(context, MARGIN, gridTop, width - MARGIN * 2, bodyBottom - gridTop, 18);
  context.fill();

  context.fillStyle = INK;
  context.font = `600 18px ${FONT}`;
  days.forEach((day, index) => {
    const x = gridX + index * columnWidth + columnWidth / 2;
    context.textAlign = "center";
    context.fillText(weekdayLabel(day), x, gridTop + 28);
    context.fillStyle = MUTED;
    context.font = `400 14px ${FONT}`;
    context.fillText(shortDate(input.dates[day - 1]), x, gridTop + 49);
    context.fillStyle = INK;
    context.font = `600 18px ${FONT}`;
  });
  context.textAlign = "left";

  context.strokeStyle = LINE;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(MARGIN, gridTop + DAY_HEADER_HEIGHT);
  context.lineTo(width - MARGIN, gridTop + DAY_HEADER_HEIGHT);
  context.stroke();

  for (let row = 0; row < rows; row += 1) {
    const top = bodyTop + row * ROW_HEIGHT;
    if (row % 2 === 1) {
      context.fillStyle = "rgba(217, 207, 186, 0.16)";
      context.fillRect(MARGIN, top, width - MARGIN * 2, ROW_HEIGHT);
    }
    context.strokeStyle = LINE;
    context.beginPath();
    context.moveTo(MARGIN, top);
    context.lineTo(width - MARGIN, top);
    context.stroke();

    const period = periods[row];
    context.fillStyle = INK;
    context.font = `600 18px ${FONT}`;
    context.textAlign = "center";
    context.fillText(String(period?.index ?? row + 1), MARGIN + TIME_COLUMN_WIDTH / 2, top + 36);
    context.fillStyle = MUTED;
    context.font = `400 12px ${FONT}`;
    if (period) {
      context.fillText(period.start, MARGIN + TIME_COLUMN_WIDTH / 2, top + 57);
      context.fillText(period.end, MARGIN + TIME_COLUMN_WIDTH / 2, top + 73);
    }
    context.textAlign = "left";
  }

  context.strokeStyle = LINE;
  for (let index = 1; index < days.length; index += 1) {
    const x = gridX + index * columnWidth;
    context.beginPath();
    context.moveTo(x, bodyTop);
    context.lineTo(x, bodyBottom);
    context.stroke();
  }

  const rowOf = (periodIndex: number): number => {
    const index = periods.findIndex((period) => period.index === periodIndex);
    return index >= 0 ? index : periodIndex - 1;
  };
  const grouped = groupSessionsByDay(input.sessions);
  days.forEach((day, dayIndex) => {
    const daySessions = grouped[day] ?? [];
    for (const session of daySessions) {
      const startRow = Math.max(0, rowOf(session.start));
      const endRow = Math.min(rows - 1, rowOf(session.end));
      const top = bodyTop + startRow * ROW_HEIGHT + 5;
      const height = Math.max(32, (endRow - startRow + 1) * ROW_HEIGHT - 10);
      const laneWidth = (columnWidth - 12) / Math.max(1, session.columns);
      const x = gridX + dayIndex * columnWidth + 6 + session.column * laneWidth;
      const blockWidth = laneWidth - 5;
      const tone = toneColor(session.course.tone);

      context.save();
      context.globalAlpha = 0.18;
      context.fillStyle = tone;
      roundRect(context, x, top, blockWidth, height, 8);
      context.fill();
      context.restore();

      context.strokeStyle = tone;
      context.lineWidth = 1;
      roundRect(context, x, top, blockWidth, height, 8);
      context.stroke();

      context.fillStyle = tone;
      roundRect(context, x, top, 5, height, 3);
      context.fill();

      const padding = 12;
      const textWidth = blockWidth - padding * 2;
      context.fillStyle = INK;
      context.font = `600 16px ${FONT}`;
      const titleLines = wrapLines(
        context,
        displayName(session, input.showAliases),
        textWidth,
        height > 60 ? 2 : 1,
      );
      titleLines.forEach((line, index) => {
        context.fillText(line, x + padding, top + 26 + index * 20);
      });

      const detailTop = top + 26 + titleLines.length * 20 + 4;
      if (height > 64 && detailTop < top + height - 12) {
        context.fillStyle = MUTED;
        context.font = `400 12px ${FONT}`;
        const details = [session.course.location, session.course.teacher].filter(Boolean);
        if (details.length > 0) {
          context.fillText(
            details.join(" · ").slice(0, 22),
            x + padding,
            Math.min(top + height - 12, detailTop),
          );
        }
      }
    }
  });

  if (input.sessions.length === 0) {
    context.fillStyle = MUTED;
    context.font = `400 18px ${FONT}`;
    context.textAlign = "center";
    context.fillText("这一周还没有排课", gridX + gridWidth / 2, bodyTop + ROW_HEIGHT / 2);
    context.textAlign = "left";
  }

  context.strokeStyle = LINE;
  context.beginPath();
  context.moveTo(MARGIN, bodyBottom);
  context.lineTo(width - MARGIN, bodyBottom);
  context.stroke();

  context.fillStyle = MUTED;
  context.font = `400 13px ${FONT}`;
  context.fillText("课序 ClassFlow · 把一周，排成喜欢的样子", MARGIN, bodyBottom + 42);
  context.textAlign = "right";
  context.fillText("LOCAL FIRST", width - MARGIN, bodyBottom + 42);
  context.textAlign = "left";

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png");
  });
  if (!blob) throw new Error("生成图片失败，请重试。");

  return {
    blob,
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
    filename: timetableImageFilename(input),
  };
}

function dayHeading(day: number, date: Date | undefined): string {
  return `${weekdayLabel(day)} ${shortDate(date)}`.trim();
}

export function buildWeekText(input: WeekShareInput): string {
  const lines = [
    `课序 · ${input.term}`,
    `第 ${input.week} 周 · ${input.dateRange}`,
    "",
  ];
  const grouped = groupSessionsByDay(input.sessions);
  const days = input.days.length > 0 ? input.days : [1, 2, 3, 4, 5];
  let hasSessions = false;
  for (const day of days) {
    const sessions = [...(grouped[day] ?? [])].sort((a, b) => a.start - b.start);
    if (sessions.length === 0) continue;
    hasSessions = true;
    lines.push(dayHeading(day, input.dates[day - 1]));
    for (const session of sessions) {
      const details = [
        displayName(session, input.showAliases),
        session.course.location,
        session.course.teacher ? `@${session.course.teacher}` : "",
      ].filter(Boolean);
      lines.push(`  ${sessionPeriodLabel(session)}  ${details.join(" · ")}`);
    }
    lines.push("");
  }
  if (!hasSessions) lines.push("这一周还没有排课。");
  return lines.join("\n").trim();
}

export function buildWeekMarkdown(input: WeekShareInput): string {
  const lines = [
    `## 第 ${input.week} 周课表 · ${input.term}`,
    "",
    `**${input.dateRange}** · ${courseCount(input.sessions)} 门课程 · ${formatDuration(weekMinutes(input.sessions, input.periods))}`,
    "",
  ];
  const grouped = groupSessionsByDay(input.sessions);
  const days = input.days.length > 0 ? input.days : [1, 2, 3, 4, 5];
  let hasSessions = false;
  for (const day of days) {
    const sessions = [...(grouped[day] ?? [])].sort((a, b) => a.start - b.start);
    if (sessions.length === 0) continue;
    hasSessions = true;
    lines.push(`### ${dayHeading(day, input.dates[day - 1])}`, "");
    for (const session of sessions) {
      const details = [
        displayName(session, input.showAliases),
        session.course.location,
        session.course.teacher ? `@${session.course.teacher}` : "",
      ].filter(Boolean);
      lines.push(`- **${sessionPeriodLabel(session)}** ${details.join(" · ")}`);
    }
    lines.push("");
  }
  if (!hasSessions) lines.push("这一周还没有排课。");
  return lines.join("\n").trim();
}

function weekRuns(slot: CourseSlot): string[] {
  if (slot.weeks && slot.weeks.length > 0) {
    const sorted = [...new Set(slot.weeks)].filter((week) => week > 0).sort((a, b) => a - b);
    const runs: string[] = [];
    let start = sorted[0];
    let end = sorted[0];
    for (const week of sorted.slice(1)) {
      if (week === end + 1) {
        end = week;
        continue;
      }
      runs.push(start === end ? `${start}周` : `${start}-${end}周`);
      start = week;
      end = week;
    }
    if (start !== undefined && end !== undefined) {
      runs.push(start === end ? `${start}周` : `${start}-${end}周`);
    }
    return runs;
  }
  const suffix = slot.pattern === "odd" ? "单" : slot.pattern === "even" ? "双" : "";
  return [
    slot.weekStart === slot.weekEnd
      ? `${slot.weekStart}周${suffix}`
      : `${slot.weekStart}-${slot.weekEnd}周${suffix}`,
  ];
}

/** Converts the whole timetable into lines accepted by the text importer. */
export function buildCourseShareText(courses: { name: string; teacher: string; location: string; slots: CourseSlot[] }[]): string {
  const lines = ["# 课序课表分享", "# 打开课序后粘贴到「文本建课」，即可还原课程与全部时间段", ""];
  for (const course of courses) {
    const name = course.name.replace(/\s+/g, " ").trim() || "未命名课程";
    for (const slot of course.slots) {
      const periods =
        slot.start === slot.end ? `第${slot.start}节` : `第${slot.start}-${slot.end}节`;
      for (const weeks of weekRuns(slot)) {
        lines.push(
          [
            name,
            weekdayLabel(slot.day),
            periods,
            weeks,
            course.location ? `地点：${course.location}` : "",
            course.teacher ? `@${course.teacher}` : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    }
  }
  return lines.join("\n").trim();
}
