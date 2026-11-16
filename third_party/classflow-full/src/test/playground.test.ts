import { describe, expect, it } from "vitest";
import {
  DUCK_BOUNDS,
  clampDuckPosition,
  duckTiltFromDelta,
  rippleRadius,
} from "../lib/playground";

describe("clampDuckPosition", () => {
  it("keeps a position inside the pool", () => {
    expect(clampDuckPosition(50, 50)).toEqual({ x: 50, y: 50 });
  });

  it("pulls positions back to the duck margins", () => {
    expect(clampDuckPosition(-40, 130)).toEqual({
      x: DUCK_BOUNDS.minX,
      y: DUCK_BOUNDS.maxY,
    });
    expect(clampDuckPosition(400, -10)).toEqual({
      x: DUCK_BOUNDS.maxX,
      y: DUCK_BOUNDS.minY,
    });
  });

  it("falls back to the center for non-finite input", () => {
    expect(clampDuckPosition(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      x: (DUCK_BOUNDS.minX + DUCK_BOUNDS.maxX) / 2,
      y: (DUCK_BOUNDS.minY + DUCK_BOUNDS.maxY) / 2,
    });
  });

  it("honours custom bounds", () => {
    const bounds = { minX: 20, maxX: 80, minY: 20, maxY: 80 };
    expect(clampDuckPosition(0, 0, bounds)).toEqual({ x: 20, y: 20 });
  });
});

describe("duckTiltFromDelta", () => {
  it("tilts clockwise when dragged right", () => {
    expect(duckTiltFromDelta(10, 0)).toBeGreaterThan(0);
  });

  it("tilts counter-clockwise when dragged left", () => {
    expect(duckTiltFromDelta(-10, 0)).toBeLessThan(0);
  });

  it("adds a little lean when dragged down", () => {
    expect(duckTiltFromDelta(0, 20)).toBeGreaterThan(0);
  });

  it("caps the angle in both directions", () => {
    expect(duckTiltFromDelta(10_000, 10_000)).toBe(46);
    expect(duckTiltFromDelta(-10_000, -10_000)).toBe(-46);
  });

  it("does not tilt for invalid deltas", () => {
    expect(duckTiltFromDelta(Number.NaN, 4)).toBe(0);
  });
});

describe("rippleRadius", () => {
  it("grows with the duck but never collapses", () => {
    expect(rippleRadius(72)).toBe(97);
    expect(rippleRadius(12)).toBe(54);
  });
});