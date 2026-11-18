/**
 * QQQ 游乐场的纯运动学逻辑（对齐 Qoder 原版彩蛋的手感）。
 *
 * 坐标一律用「泳池渲染像素」表示：原版彩蛋的追踪速度、漫游速度、
 * 涟漪间距都是固定像素值，不随泳池缩放，这里保持一致。
 * 小鸭雪碧图默认头朝下（俯视图），旋转角 = atan2(dy, dx)·180/π − 90
 * 让鸭头正好指向移动方向。
 */

export interface DuckPoint {
  /** 泳池宽度方向的像素，0 为最左。 */
  x: number;
  /** 泳池高度方向的像素，0 为最上。 */
  y: number;
}

export interface DuckPose extends DuckPoint {
  /** 鸭头朝向，单位为度；0 表示朝下。 */
  rotation: number;
  /** 小鸭是否已经入场（第一次移动后为 true）。 */
  visible: boolean;
}

/** 小鸭宽度占泳池宽度的比例（原版 137/1000）。 */
export const DUCK_SIZE_RATIO = 137 / 1000;

/** 追踪鼠标的基础速度（px/s），原版 eqt。 */
export const CHASE_BASE_SPEED = 980;

/** 追踪速度随距离的增益（1/px·px/s），原版 tqt：越远游得越快。 */
export const CHASE_GAIN = 3.6;

/** 没有鼠标时自主漫游的速度（px/s），原版 $Zt。 */
export const WANDER_SPEED = 46;

/** 距目标小于该像素数视为到达（原版 4px）。 */
export const ARRIVE_EPSILON = 4;

/** 单帧步长的最大时间片（秒），防止切后台回来瞬移，原版 0.08。 */
export const MAX_FRAME_SECONDS = 0.08;

/** 小鸭游动时每隔多少像素撒一圈涟漪（原版 24）。 */
export const DUCK_RIPPLE_SPACING = 24;

/** 鼠标划过水面时每隔多少像素撒一圈涟漪（原版 12）。 */
export const CURSOR_RIPPLE_SPACING = 12;

/** 小鸭路径涟漪的强度（相对鼠标涟漪），原版 0.58。 */
export const DUCK_RIPPLE_STRENGTH = 0.58;

/** 小鸭默认入场点（泳池宽高的比例），原版 48.95% / 57.24%。 */
export const DUCK_SPAWN = { x: 0.4895, y: 0.5724 };

/** 涟漪的可见寿命（秒），对应原版 500^(-age/2.4)。 */
export const RIPPLE_LIFETIME = 2.4;

/** 把帧间隔裁剪到安全区间，后台标签页回来时不会瞬移。 */
export function clampFrameSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(MAX_FRAME_SECONDS, seconds);
}

/** 由移动方向推导鸭头朝向；雪碧图默认朝下，所以统一减 90 度。 */
export function headingRotation(dx: number, dy: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI - 90;
}

export type ChaseStep =
  | { /** 已到达目标（距离小于 ARRIVE_EPSILON），朝向保持原样。 */
    arrived: true;
    next: DuckPoint }
  | { arrived: false; next: DuckPoint; rotation: number };

/**
 * 追踪的一步：速度 = 基础速度 + 距离×增益（追踪鼠标时），
 * 漫游时用固定的 WANDER_SPEED；单帧位移不会超过剩余距离（不越过目标）。
 * 到达时不返回朝向——调用方应保留小鸭原来的朝向。
 */
export function chaseStep(
  from: DuckPoint,
  target: DuckPoint,
  frameSeconds: number,
  chasing: boolean,
): ChaseStep {
  const dt = clampFrameSeconds(frameSeconds);
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < ARRIVE_EPSILON) {
    return { arrived: true, next: { x: from.x, y: from.y } };
  }
  const speed = chasing ? CHASE_BASE_SPEED + distance * CHASE_GAIN : WANDER_SPEED;
  const step = Math.min(distance, speed * dt);
  const next = {
    x: from.x + (dx / distance) * step,
    y: from.y + (dy / distance) * step,
  };
  return { arrived: false, next, rotation: headingRotation(dx, dy) };
}

/**
 * 挑一个漫游目标点：留出「半个鸭身 vs 泳池短边 18%（至少 24px）」的边距，
 * 在边距内随机取点；泳池太小退化为贴边 1px 的可用区域（原版 kM1）。
 */
export function wanderTarget(
  width: number,
  height: number,
  duckWidth: number,
  random: () => number = Math.random,
): DuckPoint {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const margin = Math.min(
    duckWidth * 0.5,
    Math.max(24, Math.min(safeWidth, safeHeight) * 0.18),
  );
  const spanX = Math.max(1, safeWidth - margin * 2);
  const spanY = Math.max(1, safeHeight - margin * 2);
  return {
    x: margin + random() * spanX,
    y: margin + random() * spanY,
  };
}

/**
 * 涟漪按距离撒放：与上一圈涟漪的位置间隔够远才撒新一圈。
 * last 为 null 表示刚重置过锚点（鼠标刚进入或刚移动），立即撒一圈。
 */
export function rippleDue(
  last: DuckPoint | null,
  next: DuckPoint,
  spacing: number,
): boolean {
  if (!last) return true;
  return Math.hypot(next.x - last.x, next.y - last.y) >= spacing;
}

/**
 * 泳池尺寸变化时按比例迁移鸭子和目标点的像素坐标，
 * 避免窗口缩放后鸭子悬在池外。
 */
export function rescalePoint(
  point: DuckPoint,
  from: { width: number; height: number },
  to: { width: number; height: number },
): DuckPoint {
  const scaleX = from.width > 0 ? to.width / from.width : 1;
  const scaleY = from.height > 0 ? to.height / from.height : 1;
  return {
    x: Math.max(0, Math.min(to.width, point.x * scaleX)),
    y: Math.max(0, Math.min(to.height, point.y * scaleY)),
  };
}
