/**
 * QQQ 游乐场的纯几何逻辑。
 *
 * 小鸭位置用百分比保存，拖动时只做边界裁剪与倾斜角计算，
 * 方便在任意尺寸的泳池里复现同一套手感，也便于单测。
 */

export interface DuckPosition {
  /** 泳池宽度方向的百分比，0 为最左，100 为最右。 */
  x: number;
  /** 泳池高度方向的百分比，0 为最上，100 为最下。 */
  y: number;
}

export interface DuckBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** 留出鸭身边距，避免鸭嘴或尾巴贴到池壁外面。 */
export const DUCK_BOUNDS: DuckBounds = {
  minX: 7,
  maxX: 93,
  minY: 17,
  maxY: 83,
};

export function clampDuckPosition(
  x: number,
  y: number,
  bounds: DuckBounds = DUCK_BOUNDS,
): DuckPosition {
  const safeX = Number.isFinite(x) ? x : (bounds.minX + bounds.maxX) / 2;
  const safeY = Number.isFinite(y) ? y : (bounds.minY + bounds.maxY) / 2;
  return {
    x: Math.min(Math.max(bounds.minX, safeX), bounds.maxX),
    y: Math.min(Math.max(bounds.minY, safeY), bounds.maxY),
  };
}

/**
 * 拖动时的倾斜角：向右/向下拖时鸭头顺着力道偏转，
 * 松手后保持当前角度，点一下才扶正（与 Qoder 的彩蛋一致）。
 */
export function duckTiltFromDelta(dx: number, dy: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  const raw = dx * 0.42 + dy * 0.16;
  return Math.min(Math.max(raw, -46), 46);
}

/** 点击后涟漪最多铺到鸭身外这么多像素。 */
export function rippleRadius(duckSize: number): number {
  return Math.round(Math.max(54, duckSize * 1.35));
}