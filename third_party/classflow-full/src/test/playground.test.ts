import { describe, expect, it } from "vitest";
import {
  ARRIVE_EPSILON,
  CHASE_BASE_SPEED,
  CHASE_GAIN,
  DUCK_RIPPLE_SPACING,
  DUCK_SPAWN,
  MAX_FRAME_SECONDS,
  WANDER_SPEED,
  chaseStep,
  clampFrameSeconds,
  headingRotation,
  rescalePoint,
  rippleDue,
  wanderTarget,
  type DuckPoint,
} from "../lib/playground";

const ORIGIN: DuckPoint = { x: 0, y: 0 };

describe("headingRotation", () => {
  it("points the duck's head along the movement direction", () => {
    // 雪碧图默认头朝下：向右游时旋转 -90°，向下游时 0°。
    expect(headingRotation(10, 0)).toBeCloseTo(-90);
    expect(headingRotation(0, 10)).toBeCloseTo(0);
    expect(headingRotation(-10, 0)).toBeCloseTo(90);
    expect(headingRotation(0, -10)).toBeCloseTo(-180);
  });

  it("stays level for invalid or zero deltas", () => {
    expect(headingRotation(Number.NaN, 4)).toBe(0);
    expect(headingRotation(0, 0)).toBe(0);
  });
});

describe("clampFrameSeconds", () => {
  it("clamps the frame delta to the safe window", () => {
    expect(clampFrameSeconds(1 / 60)).toBeCloseTo(1 / 60);
    expect(clampFrameSeconds(5)).toBe(MAX_FRAME_SECONDS);
    expect(clampFrameSeconds(-1)).toBe(0);
    expect(clampFrameSeconds(Number.NaN)).toBe(0);
  });
});

describe("chaseStep", () => {
  it("moves the duck towards the cursor at base speed plus gain", () => {
    const target: DuckPoint = { x: 1000, y: 0 };
    const step = chaseStep(ORIGIN, target, 0.05, true);
    const expected = Math.min(1000, (CHASE_BASE_SPEED + 1000 * CHASE_GAIN) * 0.05);
    expect(step.arrived).toBe(false);
    expect(step.next.x).toBeCloseTo(expected);
    expect(step.next.y).toBeCloseTo(0);
  });

  it("never overshoots the target in a single frame", () => {
    const target: DuckPoint = { x: 30, y: 0 };
    const step = chaseStep(ORIGIN, target, 0.08, true);
    expect(step.next.x).toBeLessThanOrEqual(30);
  });

  it("crawls at wander speed when the cursor is away", () => {
    const target: DuckPoint = { x: 460, y: 0 };
    const step = chaseStep(ORIGIN, target, 1, false);
    expect(step.next.x).toBeCloseTo(WANDER_SPEED * MAX_FRAME_SECONDS);
  });

  it("reports arrival within the epsilon and holds position", () => {
    const target: DuckPoint = { x: ARRIVE_EPSILON - 1, y: 0 };
    const step = chaseStep(ORIGIN, target, 0.1, true);
    expect(step.arrived).toBe(true);
    expect(step.next).toEqual(ORIGIN);
  });

  it("ignores frame deltas beyond the clamp window", () => {
    const step = chaseStep(ORIGIN, { x: 10000, y: 0 }, 10, true);
    expect(step.next.x).toBeCloseTo((CHASE_BASE_SPEED + 10000 * CHASE_GAIN) * MAX_FRAME_SECONDS);
  });
});

describe("wanderTarget", () => {
  it("stays inside the duck margins", () => {
    // 泳池 1000x380，鸭宽 137：边距 = min(68.5, max(24, 380*0.18=68.4)) = 68.4
    const point = wanderTarget(1000, 380, 137, () => 1);
    expect(point.x).toBeLessThanOrEqual(1000 - 68.4 + 1e-9);
    expect(point.y).toBeLessThanOrEqual(380 - 68.4 + 1e-9);
  });

  it("keeps at least a 24px margin", () => {
    const point = wanderTarget(200, 80, 200, () => 0.5);
    expect(point.x).toBeGreaterThanOrEqual(24 - 1e-9);
    expect(point.y).toBeGreaterThanOrEqual(24 - 1e-9);
  });

  it("stays usable for degenerate pond sizes", () => {
    const point = wanderTarget(2, 2, 100, () => 0);
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});

describe("rippleDue", () => {
  it("emits immediately after the anchor resets", () => {
    expect(rippleDue(null, { x: 0, y: 0 }, DUCK_RIPPLE_SPACING)).toBe(true);
  });

  it("waits until the duck travelled far enough", () => {
    const last: DuckPoint = { x: 0, y: 0 };
    expect(rippleDue(last, { x: 20, y: 0 }, DUCK_RIPPLE_SPACING)).toBe(false);
    expect(rippleDue(last, { x: 24, y: 0 }, DUCK_RIPPLE_SPACING)).toBe(true);
  });
});

describe("rescalePoint", () => {
  it("maps pond pixels proportionally when the pond resizes", () => {
    const point = rescalePoint({ x: 500, y: 190 }, { width: 1000, height: 380 }, { width: 500, height: 190 });
    expect(point).toEqual({ x: 250, y: 95 });
  });

  it("clamps back into the pond", () => {
    const point = rescalePoint({ x: -10, y: 400 }, { width: 1000, height: 380 }, { width: 1000, height: 380 });
    expect(point).toEqual({ x: 0, y: 380 });
  });
});

describe("duck spawn", () => {
  it("matches the original easter egg entry point", () => {
    expect(DUCK_SPAWN.x).toBeCloseTo(0.4895);
    expect(DUCK_SPAWN.y).toBeCloseTo(0.5724);
  });
});
