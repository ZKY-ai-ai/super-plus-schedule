import { describe, expect, it } from "vitest";
import {
  courseStatusLabel,
  formatScore,
  gpaForScore,
  isFailed,
  normalizeGrades,
  normalizeGradeSettings,
  semesterStats,
  type GradeRecord,
} from "../lib/grades";

const record = (patch: Partial<GradeRecord> = {}): GradeRecord => ({
  courseId: "c1",
  score: 80,
  credits: 3,
  status: "normal",
  updatedAt: "",
  ...patch,
});

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

  it("normalizes credits and course status", () => {
    const [kept, invalid] = normalizeGrades([
      { courseId: "c1", score: 90, credits: "3.54", status: "retake" },
      { courseId: "c2", score: 70, credits: -2, status: "unknown" },
    ]);
    expect(kept.credits).toBe(3.5);
    expect(kept.status).toBe("retake");
    expect(invalid.credits).toBeNull();
    expect(invalid.status).toBe("normal");
  });

  it("accepts the versioned wrapper and defaults settings", () => {
    expect(normalizeGrades({ grades: [{ courseId: "c1", score: 60 }] })).toHaveLength(1);
    expect(normalizeGradeSettings(null)).toEqual({ hideScores: false, requiredCredits: 0 });
    expect(normalizeGradeSettings({ hideScores: true, requiredCredits: 160.4 })).toEqual({
      hideScores: true,
      requiredCredits: 160,
    });
    expect(normalizeGradeSettings({ requiredCredits: -3 }).requiredCredits).toBe(0);
  });
});

describe("failure marking and privacy mask", () => {
  it("marks only entered scores below 60 as failed", () => {
    expect(isFailed(record({ score: 59 }))).toBe(true);
    expect(isFailed(record({ score: 60 }))).toBe(false);
    expect(isFailed(record({ score: null }))).toBe(false);
  });

  it("hides scores behind dots when privacy is on", () => {
    expect(formatScore(record({ score: 58 }), false)).toBe("58");
    expect(formatScore(record({ score: 58 }), true)).toBe("••");
    expect(formatScore(undefined, false)).toBe("未录入");
  });

  it("labels course statuses", () => {
    expect(courseStatusLabel("normal")).toBe("正常修读");
    expect(courseStatusLabel("exempt")).toBe("免修");
  });
});

describe("GPA and semester statistics", () => {
  it("maps scores to the 4.0 scale", () => {
    expect(gpaForScore(90)).toBe(4);
    expect(gpaForScore(85)).toBe(3.7);
    expect(gpaForScore(82)).toBe(3.3);
    expect(gpaForScore(78)).toBe(3);
    expect(gpaForScore(75)).toBe(2.7);
    expect(gpaForScore(72)).toBe(2.3);
    expect(gpaForScore(68)).toBe(2);
    expect(gpaForScore(64)).toBe(1.5);
    expect(gpaForScore(60)).toBe(1);
    expect(gpaForScore(59.9)).toBe(0);
  });

  it("weights the average and GPA by credits", () => {
    const stats = semesterStats([
      record({ courseId: "a", score: 90, credits: 4 }),
      record({ courseId: "b", score: 70, credits: 1 }),
    ]);
    expect(stats.weightedAverage).toBe(86);
    expect(stats.gpa).toBe(3.6);
    expect(stats.creditTotal).toBe(5);
    expect(stats.earnedCredits).toBe(5);
  });

  it("counts failed courses without earned credits", () => {
    const stats = semesterStats([
      record({ courseId: "a", score: 55, credits: 3 }),
      record({ courseId: "b", score: null, credits: 2 }),
    ]);
    expect(stats.enteredCount).toBe(1);
    expect(stats.failedCount).toBe(1);
    expect(stats.passedCount).toBe(0);
    expect(stats.earnedCredits).toBe(0);
    expect(stats.creditTotal).toBe(3);
    expect(stats.gpa).toBe(0);
  });

  it("falls back to counting each course as one unit without credits", () => {
    const stats = semesterStats([
      record({ courseId: "a", score: 80, credits: null }),
      record({ courseId: "b", score: 60, credits: null }),
    ]);
    expect(stats.weightedAverage).toBe(70);
    expect(stats.gpa).toBe(2);
    expect(stats.creditTotal).toBe(0);
  });

  it("returns nulls when no score is entered", () => {
    const stats = semesterStats([record({ score: null })]);
    expect(stats.weightedAverage).toBeNull();
    expect(stats.gpa).toBeNull();
  });
});