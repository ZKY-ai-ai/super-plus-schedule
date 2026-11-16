import type { Period, Session } from "../types";
import { minutesToTime, timeToMinutes } from "./date";

/** 空档偏好：步行、收拾缓冲与午饭窗口。 */
export interface GapPreferences {
  /** 每分钟步行米数，用于把楼栋距离折算成分钟；默认 75 米/分。 */
  walkSpeed: number;
  /** 下课后收拾东西、走到门口的缓冲分钟。 */
  bufferMinutes: number;
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
  lunchMinutes: number;
}

export const DEFAULT_GAP_PREFERENCES: GapPreferences = {
  walkSpeed: 75,
  bufferMinutes: 3,
  lunchEnabled: true,
  lunchStart: "11:30",
  lunchEnd: "13:30",
  lunchMinutes: 40,
};

export const GAP_PREFS_KEY = "kexu:planner:gaps:v1";

export function loadGapPreferences(): GapPreferences {
  try {
    const raw = localStorage.getItem(GAP_PREFS_KEY);
    if (!raw) return { ...DEFAULT_GAP_PREFERENCES };
    return normalizeGapPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GAP_PREFERENCES };
  }
}

export function saveGapPreferences(preferences: GapPreferences): void {
  try {
    localStorage.setItem(GAP_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // 偏好不是关键数据，写入失败时保持当前会话可用。
  }
}

export function normalizeGapPreferences(raw: unknown): GapPreferences {
  const object =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const time = (value: unknown, fallback: string): string =>
    typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
  const number = (value: unknown, min: number, max: number, fallback: number): number => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  };
  const lunchStart = time(object.lunchStart, DEFAULT_GAP_PREFERENCES.lunchStart);
  const lunchEndRaw = time(object.lunchEnd, DEFAULT_GAP_PREFERENCES.lunchEnd);
  const lunchEnd = timeToMinutes(lunchEndRaw) > timeToMinutes(lunchStart) ? lunchEndRaw : "13:30";
  return {
    walkSpeed: number(object.walkSpeed, 30, 150, DEFAULT_GAP_PREFERENCES.walkSpeed),
    bufferMinutes: number(object.bufferMinutes, 0, 30, DEFAULT_GAP_PREFERENCES.bufferMinutes),
    lunchEnabled: typeof object.lunchEnabled === "boolean" ? object.lunchEnabled : true,
    lunchStart,
    lunchEnd,
    lunchMinutes: number(object.lunchMinutes, 10, 180, DEFAULT_GAP_PREFERENCES.lunchMinutes),
  };
}

/*
 * 内置楼栋表：没有校园路网数据时，用一张粗略分区表估算步行时间。
 * 每个楼栋给出平面坐标（单位约 100 米），两点曼哈顿距离 × 1.3 分钟。
 * 未知楼栋使用保守的 6 分钟，空地点按 5 分钟处理。
 */
const BUILDING_ZONES: Record<string, [number, number]> = {
  教一: [1, 2],
  教二: [2, 2],
  教三: [3, 2],
  教四: [4, 2],
  教五: [5, 2],
  教学楼: [3, 2],
  图书馆: [2, 5],
  实验楼: [6, 3],
  物理实验中心: [7, 3],
  计算机楼: [6, 4],
  信息楼: [6, 4],
  外语楼: [2, 4],
  行政楼: [1, 5],
  第一食堂: [3, 5],
  第二食堂: [5, 5],
  食堂: [3, 5],
  宿舍: [0, 7],
  体育场: [7, 6],
  风雨操场: [8, 6],
  体育馆: [8, 6],
};

const UNKNOWN_WALK_MINUTES = 6;
const BLANK_WALK_MINUTES = 5;

/** 从「教一 401」这样的地点文本里取出楼栋名。 */
export function extractBuilding(location: string): string {
  if (!location) return "";
  const cleaned = location
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/[0-9０-９]/g, " ")
    .replace(/[A-Za-z]\s*$/g, " ")
    .replace(/[·,，、/\\-]+/g, " ")
    .trim();
  return cleaned.split(/\s+/)[0] ?? "";
}

export interface WalkEstimate {
  minutes: number;
  from: string;
  to: string;
  known: boolean;
}

/**
 * 跨线接口：估算两个地点之间的步行分钟数。
 * 同一楼栋为 0；任一侧为空按 5 分钟；未知楼栋按 6 分钟。
 */
export function walkMinutes(from: string, to: string): number {
  return estimateWalk(from, to).minutes;
}

export function estimateWalk(from: string, to: string): WalkEstimate {
  const fromBuilding = extractBuilding(from);
  const toBuilding = extractBuilding(to);
  if (fromBuilding && toBuilding && fromBuilding === toBuilding) {
    return { minutes: 0, from: fromBuilding, to: toBuilding, known: true };
  }
  const start = BUILDING_ZONES[fromBuilding];
  const end = BUILDING_ZONES[toBuilding];
  if (start && end) {
    const distance = Math.abs(start[0] - end[0]) + Math.abs(start[1] - end[1]);
    return {
      minutes: Math.max(1, Math.round(distance * 1.3)),
      from: fromBuilding,
      to: toBuilding,
      known: true,
    };
  }
  if (!fromBuilding || !toBuilding) {
    return { minutes: BLANK_WALK_MINUTES, from: fromBuilding, to: toBuilding, known: false };
  }
  return { minutes: UNKNOWN_WALK_MINUTES, from: fromBuilding, to: toBuilding, known: false };
}

/** 可配置楼栋表，后续接入真实路网时由这里扩展。 */
export function knownBuildings(): Array<{ name: string; zone: [number, number] }> {
  return Object.entries(BUILDING_ZONES).map(([name, zone]) => ({ name, zone }));
}

export function sessionStartMinutes(session: Session, periods: Period[]): number {
  return timeToMinutes(periods[session.start - 1]?.start ?? "00:00");
}

export function sessionEndMinutes(session: Session, periods: Period[]): number {
  return timeToMinutes(periods[session.end - 1]?.end ?? "00:00");
}

export interface GapSuggestion {
  id: string;
  label: string;
  detail: string;
}

/** 阶段 1 · F085：按可用分钟数给出空档去处建议。 */
export function suggestGapActivities(usableMinutes: number): GapSuggestion[] {
  if (usableMinutes < 5) {
    return [
      { id: "breathe", label: "原地缓一缓", detail: "时间太短，接杯水、整理下节课要用的书就够了。" },
    ];
  }
  const tiers: Array<{ min: number; items: GapSuggestion[] }> = [
    {
      min: 60,
      items: [
        { id: "study", label: "去图书馆坐一会", detail: "时间够走一趟，找安静位置处理最费脑的任务。" },
        { id: "group", label: "约小组讨论", detail: "拉上同组同学，把分工和下一步定下来。" },
      ],
    },
    {
      min: 45,
      items: [
        { id: "review", label: "做一小块复习", detail: "挑一道题或一页笔记，设个 25 分钟计时器。" },
        { id: "nap", label: "闭眼休息 20 分钟", detail: "定好闹钟，别睡过头。" },
      ],
    },
    {
      min: 30,
      items: [
        { id: "meal", label: "错峰吃饭", detail: "人少、不用排队，回来还能提前几分钟进教室。" },
        { id: "exercise", label: "走两圈", detail: "到楼下或操场活动一下，久坐后脑子会清醒些。" },
      ],
    },
    {
      min: 15,
      items: [
        { id: "preview", label: "预习下一节", detail: "只看标题和小结，留个印象，上课更容易跟上。" },
        { id: "flash", label: "背 10 个单词", detail: "用碎片时间过一遍卡片，不追求一次记住。" },
      ],
    },
    {
      min: 5,
      items: [
        { id: "water", label: "接水 + 上洗手间", detail: "顺手把下一节的书翻到要讲的那页。" },
        { id: "inbox", label: "清一清消息", detail: "回几条消息，别让通知留到晚上。" },
      ],
    },
  ];
  return tiers
    .filter((tier) => usableMinutes >= tier.min)
    .flatMap((tier) => tier.items)
    .slice(0, 4);
}

export interface DayGap {
  id: string;
  day: number;
  from: Session;
  to: Session;
  /** 上一节下课（分钟，绝对时间）。 */
  start: number;
  /** 下一节上课（分钟）。 */
  end: number;
  minutes: number;
  fromLocation: string;
  toLocation: string;
  walkMinutes: number;
  walkKnown: boolean;
  bufferMinutes: number;
  /** 扣掉步行与收拾缓冲后真正能自由支配的时间。 */
  usableMinutes: number;
  overlapsLunch: boolean;
  isLunch: boolean;
  suggestions: GapSuggestion[];
}

/**
 * 阶段 1 · F081 / 阶段 2 · F082 / F083：识别同一天两节课之间的空档，
 * 并按楼栋步行与收拾缓冲折算可用时间。
 */
export function findDayGaps(
  sessions: Session[],
  periods: Period[],
  preferences: GapPreferences = DEFAULT_GAP_PREFERENCES,
): DayGap[] {
  const sorted = [...sessions].sort(
    (a, b) => sessionStartMinutes(a, periods) - sessionStartMinutes(b, periods),
  );
  const gaps: DayGap[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index];
    const to = sorted[index + 1];
    const start = sessionEndMinutes(from, periods);
    const end = sessionStartMinutes(to, periods);
    if (end <= start) continue;
    const walk = estimateWalk(from.course.location, to.course.location);
    const minutes = end - start;
    const usableMinutes = Math.max(
      0,
      minutes - walk.minutes - preferences.bufferMinutes,
    );
    const lunchStart = timeToMinutes(preferences.lunchStart);
    const lunchEnd = timeToMinutes(preferences.lunchEnd);
    const overlapsLunch = end > lunchStart && start < lunchEnd;
    const isLunch =
      preferences.lunchEnabled &&
      overlapsLunch &&
      Math.max(0, Math.min(end, lunchEnd) - Math.max(start, lunchStart)) >= preferences.lunchMinutes;
    gaps.push({
      id: `${from.id}->${to.id}`,
      day: from.day,
      from,
      to,
      start,
      end,
      minutes,
      fromLocation: from.course.location,
      toLocation: to.course.location,
      walkMinutes: walk.minutes,
      walkKnown: walk.known,
      bufferMinutes: preferences.bufferMinutes,
      usableMinutes,
      overlapsLunch,
      isLunch,
      suggestions: suggestGapActivities(usableMinutes),
    });
  }
  return gaps;
}

export function findGapsForDay(
  sessions: Session[],
  day: number,
  periods: Period[],
  preferences: GapPreferences = DEFAULT_GAP_PREFERENCES,
): DayGap[] {
  return findDayGaps(
    sessions.filter((session) => session.day === day),
    periods,
    preferences,
  );
}

export interface LatestDeparture {
  session: Session;
  /** 最晚出发（当天分钟数）。 */
  leaveBy: number;
  leaveByLabel: string;
  walkMinutes: number;
  bufferMinutes: number;
  /** 距离现在还有多少分钟；已错过时为负数。 */
  minutesLeft: number;
}

/**
 * 阶段 1 · F084：下一节开始时间减去步行与缓冲，得到最晚出发时间。
 */
export function latestDeparture(
  next: Session,
  periods: Period[],
  fromLocation: string,
  preferences: GapPreferences = DEFAULT_GAP_PREFERENCES,
  nowMinutes?: number,
): LatestDeparture {
  const walk = estimateWalk(fromLocation, next.course.location);
  const start = sessionStartMinutes(next, periods);
  const leaveBy = Math.max(0, start - walk.minutes - preferences.bufferMinutes);
  return {
    session: next,
    leaveBy,
    leaveByLabel: minutesToTime(leaveBy),
    walkMinutes: walk.minutes,
    bufferMinutes: preferences.bufferMinutes,
    minutesLeft: nowMinutes === undefined ? 0 : leaveBy - nowMinutes,
  };
}

export interface RoundTripCheck {
  feasible: boolean;
  walkOutMinutes: number;
  walkBackMinutes: number;
  maxStayMinutes: number;
  totalMinutes: number;
  reason: string;
}

/**
 * 阶段 2 · F086：去程 + 停留 + 回程 + 缓冲是否放得进空档。
 */
export function checkRoundTrip(
  usableMinutes: number,
  fromLocation: string,
  toLocation: string,
  preferences: GapPreferences = DEFAULT_GAP_PREFERENCES,
  minStayMinutes = 5,
): RoundTripCheck {
  const outbound = estimateWalk(fromLocation, toLocation).minutes;
  const inbound = estimateWalk(toLocation, fromLocation).minutes;
  const maxStay = usableMinutes - outbound - inbound - preferences.bufferMinutes;
  const total = Math.max(0, maxStay) + outbound + inbound + preferences.bufferMinutes;
  if (maxStay >= minStayMinutes) {
    return {
      feasible: true,
      walkOutMinutes: outbound,
      walkBackMinutes: inbound,
      maxStayMinutes: maxStay,
      totalMinutes: total,
      reason: `来得及，最多可停留 ${maxStay} 分钟。`,
    };
  }
  return {
    feasible: false,
    walkOutMinutes: outbound,
    walkBackMinutes: inbound,
    maxStayMinutes: Math.max(0, maxStay),
    totalMinutes: total,
    reason:
      maxStay > 0
        ? `路上要 ${outbound + inbound} 分钟，只剩 ${maxStay} 分钟，太赶了。`
        : `往返要 ${outbound + inbound} 分钟，时间太赶，放不进这个空档。`,
  };
}

export interface LunchWindow {
  start: number;
  end: number;
  minutes: number;
  source: "gap" | "free";
  gap: DayGap | null;
}

export interface LunchAssessment {
  status: "available" | "short" | "none" | "disabled";
  windows: LunchWindow[];
  best: LunchWindow | null;
  message: string;
}

/**
 * 阶段 1 · F036：在午饭窗口内寻找可用时段，并判断时长是否足够。
 */
export function assessLunch(
  sessions: Session[],
  periods: Period[],
  preferences: GapPreferences = DEFAULT_GAP_PREFERENCES,
): LunchAssessment {
  if (!preferences.lunchEnabled) {
    return { status: "disabled", windows: [], best: null, message: "午饭空档提醒已关闭。" };
  }
  const lunchStart = timeToMinutes(preferences.lunchStart);
  const lunchEnd = timeToMinutes(preferences.lunchEnd);
  const windows: LunchWindow[] = [];

  for (const gap of findDayGaps(sessions, periods, preferences)) {
    const start = Math.max(gap.start, lunchStart);
    const end = Math.min(gap.end, lunchEnd);
    if (end <= start) continue;
    windows.push({ start, end, minutes: end - start, source: "gap", gap });
  }

  // 全天没课或午饭完全在课外时，也要给出可用时段。
  const daySessions = [...sessions].sort(
    (a, b) => sessionStartMinutes(a, periods) - sessionStartMinutes(b, periods),
  );
  let cursor = lunchStart;
  for (const session of daySessions) {
    const start = sessionStartMinutes(session, periods);
    const end = sessionEndMinutes(session, periods);
    if (end <= cursor) continue;
    if (start > cursor) {
      const freeEnd = Math.min(start, lunchEnd);
      if (freeEnd > cursor) {
        windows.push({ start: cursor, end: freeEnd, minutes: freeEnd - cursor, source: "free", gap: null });
      }
    }
    cursor = Math.max(cursor, end);
    if (cursor >= lunchEnd) break;
  }
  if (cursor < lunchEnd) {
    windows.push({ start: cursor, end: lunchEnd, minutes: lunchEnd - cursor, source: "free", gap: null });
  }

  const unique = windows
    .filter((window) => window.minutes > 0)
    .filter(
      (window, index, list) =>
        list.findIndex((item) => item.start === window.start && item.end === window.end) === index,
    )
    .sort((a, b) => b.minutes - a.minutes);
  const best = unique[0] ?? null;
  if (!best) {
    return { status: "none", windows: [], best: null, message: "午饭时段都被课占满了。" };
  }
  if (best.minutes < preferences.lunchMinutes) {
    return {
      status: "short",
      windows: unique,
      best,
      message: `午饭最多只有 ${best.minutes} 分钟，少于设定的 ${preferences.lunchMinutes} 分钟。`,
    };
  }
  return {
    status: "available",
    windows: unique,
    best,
    message: `午饭可用 ${best.minutes} 分钟（${minutesToTime(best.start)}–${minutesToTime(best.end)}）。`,
  };
}

export interface TimelineEntry {
  id: string;
  kind: "class" | "gap" | "free" | "lunch";
  start: number;
  end: number;
  minutes: number;
  label: string;
  detail: string;
  session?: Session;
  gap?: DayGap;
}

/**
 * 阶段 2 · F089：把一天排成一条连续时间轴，空档与没课的时间都能回放。
 */
export function buildDayTimeline(
  sessions: Session[],
  periods: Period[],
  preferences: GapPreferences = DEFAULT_GAP_PREFERENCES,
  range: { start: string; end: string } = { start: "07:30", end: "22:30" },
): TimelineEntry[] {
  const dayStart = timeToMinutes(range.start);
  const dayEnd = timeToMinutes(range.end);
  const sorted = [...sessions].sort(
    (a, b) => sessionStartMinutes(a, periods) - sessionStartMinutes(b, periods),
  );
  const gaps = findDayGaps(sorted, periods, preferences);
  const entries: TimelineEntry[] = [];
  let cursor = dayStart;

  for (const session of sorted) {
    const start = Math.max(dayStart, sessionStartMinutes(session, periods));
    const end = Math.min(dayEnd, sessionEndMinutes(session, periods));
    if (start > cursor) {
      const gap = gaps.find((item) => item.start === cursor && item.to.id === session.id) ?? null;
      const lunchStart = timeToMinutes(preferences.lunchStart);
      const lunchEnd = timeToMinutes(preferences.lunchEnd);
      const isLunch =
        preferences.lunchEnabled && end > lunchStart && cursor < lunchEnd && Math.min(end, lunchEnd) - Math.max(cursor, lunchStart) >= preferences.lunchMinutes;
      entries.push({
        id: `free-${cursor}-${start}`,
        kind: isLunch ? "lunch" : gap ? "gap" : "free",
        start: cursor,
        end: start,
        minutes: start - cursor,
        label: isLunch ? "午饭时间" : gap ? "课间空档" : "空闲",
        detail: gap
          ? `去 ${session.course.location || "下一间教室"} 约 ${gap.walkMinutes} 分钟，可自由支配 ${gap.usableMinutes} 分钟。`
          : isLunch
            ? "这段时间没有被课占住，可以安心吃饭。"
            : "还没有安排，可以休息或自习。",
        gap: gap ?? undefined,
      });
    }
    if (end > start) {
      entries.push({
        id: session.id,
        kind: "class",
        start,
        end,
        minutes: end - start,
        label: session.course.name,
        detail: `${session.course.location || "地点待定"} · 第 ${session.start}${
          session.end !== session.start ? `–${session.end}` : ""
        } 节`,
        session,
      });
    }
    cursor = Math.max(cursor, end);
  }

  if (cursor < dayEnd) {
    entries.push({
      id: `free-${cursor}-${dayEnd}`,
      kind: "free",
      start: cursor,
      end: dayEnd,
      minutes: dayEnd - cursor,
      label: "课后时间",
      detail: "今天的课已经结束，剩下的时间自己安排。",
    });
  }

  return entries.sort((a, b) => a.start - b.start);
}
