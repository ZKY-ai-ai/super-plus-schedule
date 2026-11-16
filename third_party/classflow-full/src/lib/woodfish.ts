/**
 * 丁 · 敲木鱼（设置页彩蛋的纯逻辑层）
 *
 * 只落盘三件事：累计敲击、当日敲击与声音开关；
 * 点击速度不落盘，由界面用最近 1.5 秒的敲击时间戳实时算出。
 * 读写支持注入 StorageLike，方便在 node 环境做无副作用测试。
 */
import { dateKey } from "./date";

export const WOODFISH_STORAGE_KEY = "kexu:woodfish:v1";
/** 实时手速的统计窗口：最近 1.5 秒。 */
export const SPEED_WINDOW_MS = 1500;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WoodfishStats {
  /** 累计敲击次数，跨天不清零。 */
  total: number;
  /** 当日次数所属的本地日期，形如 2026-11-16。 */
  day: string;
  /** 当日敲击次数，跨天自动归零。 */
  dayCount: number;
  /** 敲击音效开关，默认开启。 */
  soundOn: boolean;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function emptyWoodfish(now: Date = new Date()): WoodfishStats {
  return { total: 0, day: dateKey(now), dayCount: 0, soundOn: true };
}

function normalize(raw: unknown, now: Date): WoodfishStats {
  const base = emptyWoodfish(now);
  if (!raw || typeof raw !== "object") return base;
  const source = raw as Partial<WoodfishStats>;
  const total = toCount(source.total);
  const storedDay =
    typeof source.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.day) ? source.day : base.day;
  const sameDay = storedDay === base.day;
  return {
    total,
    day: base.day,
    // 换了天就只保留累计次数；同日数据即使损坏也不超过总数。
    dayCount: sameDay ? Math.min(toCount(source.dayCount), total) : 0,
    soundOn: typeof source.soundOn === "boolean" ? source.soundOn : true,
  };
}

/** 读取本地统计；数据缺失或损坏时回落到全新的木鱼。 */
export function loadWoodfish(
  storage: StorageLike | null = defaultStorage(),
  now: Date = new Date(),
): WoodfishStats {
  if (!storage) return emptyWoodfish(now);
  try {
    const raw = storage.getItem(WOODFISH_STORAGE_KEY);
    if (!raw) return emptyWoodfish(now);
    return normalize(JSON.parse(raw), now);
  } catch {
    return emptyWoodfish(now);
  }
}

/** 保存本地统计；存储不可用（隐私模式、配额满）时安静跳过。 */
export function saveWoodfish(
  stats: WoodfishStats,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(WOODFISH_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // 木鱼照敲，只是这次不落盘。
  }
}

/**
 * 跨天时把当日次数归零；同一天原样返回同一个对象，
 * 调用方可以直接用引用是否变化判断要不要重渲染。
 */
export function rollWoodfishDay(stats: WoodfishStats, now: Date = new Date()): WoodfishStats {
  const today = dateKey(now);
  if (stats.day === today) return stats;
  return { ...stats, day: today, dayCount: 0 };
}

/** 敲一下：先处理跨天，再给总计与当日各加一。 */
export function tapWoodfish(stats: WoodfishStats, now: Date = new Date()): WoodfishStats {
  const current = rollWoodfishDay(stats, now);
  return { ...current, total: current.total + 1, dayCount: current.dayCount + 1 };
}

/** 数一数窗口内还剩几次敲击；时间戳不要求排序。 */
export function countTapsInWindow(
  taps: readonly number[],
  now: number,
  windowMs: number = SPEED_WINDOW_MS,
): number {
  if (!(windowMs > 0)) return 0;
  let count = 0;
  for (const at of taps) {
    if (Number.isFinite(at) && now - at <= windowMs) count += 1;
  }
  return count;
}

/** 丢掉窗口之外的时间戳，避免连点后数组无限增长。 */
export function pruneTaps(
  taps: readonly number[],
  now: number,
  windowMs: number = SPEED_WINDOW_MS,
): number[] {
  if (!(windowMs > 0)) return [];
  return taps.filter((at) => Number.isFinite(at) && now - at <= windowMs);
}

/**
 * 实时手速（次/秒）：窗口内敲击数除以固定窗口长度。
 * 固定分母让显示更稳，停手后随窗口滑空自然回到 0。
 */
export function tapSpeed(
  taps: readonly number[],
  now: number,
  windowMs: number = SPEED_WINDOW_MS,
): number {
  if (!(windowMs > 0)) return 0;
  const count = countTapsInWindow(taps, now, windowMs);
  return Math.round((count * 1000 * 10) / windowMs) / 10;
}
