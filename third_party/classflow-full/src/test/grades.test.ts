import { describe, expect, it } from "vitest";
import {
  formatScore,
  isFailed,
  normalizeGrades,
  normalizeGradeSettings,
} from "../lib/grades";

describe("grade normalization", () => {
  it("keeps valid scores, clamps ranges and dedupes by course", () => {
    const records = normalizeGrades([
      { courseId: "c1", score: 59.44 },
      { courseId: "c1", score: 90 },
      { courseId: "c2", score: 105 },
      { courseId: "c3", score: "88" },
      { courseId: "c4", score: "abc" },
      { courseId: " ", score: 70 },
    ]);
    expect(records).toHaveLength(4);
    expect(records[0].score).toBe(59.4);
    expect(records[1].score).toBe(100);
    expect(records[2].score).toBe(88);
    expect(records[3].score).toBeNull();
  });

  it("accepts the versioned wrapper and defaults privacy off", () => {
    expect(normalizeGrades({ grades: [{ courseId: "c1", score: 60 }] })).toHaveLength(1);
    expect(normalizeGradeSettings(null)).toEqual({ hideScores: false });
    expect(normalizeGradeSettings({ hideScores: true })).toEqual({ hideScores: true });
  });
});

describe("failure marking and privacy mask", () => {
  it("marks only entered scores below 60 as failed", () => {
    expect(isFailed({ courseId: "c1", score: 59, updatedAt: "" })).toBe(true);
    expect(isFailed({ courseId: "c1", score: 60, updatedAt: "" })).toBe(false);
    expect(isFailed({ courseId: "c1", score: null, updatedAt: "" })).toBe(false);
  });

  it("hides scores behind dots when privacy is on", () => {
    const record = { courseId: "c1", score: 58, updatedAt: "" };
    expect(formatScore(record, false)).toBe("58");
    expect(formatScore(record, true)).toBe("••");
    expect(formatScore(undefined, false)).toBe("未录入");
  });
});