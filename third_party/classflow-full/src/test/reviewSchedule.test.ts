import { describe, expect, it } from "vitest";
import { generateReviewSchedule } from "../lib/study/reviewSchedule";

const today = new Date(2026, 10, 17, 8, 0);

describe("review schedule", () => {
  it("spreads one review per course across the days before the exam", () => {
    const result = generateReviewSchedule(
      ["math", "english", "physics"],
      "2026-11-27T09:00",
      today,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sessions.map((session) => session.subjectId)).toEqual([
      "math",
      "english",
      "physics",
    ]);
    expect(result.sessions[0].scheduledDate).toBe("2026-11-17");
    expect(result.sessions[2].scheduledDate).toBe("2026-11-26");
    expect(new Set(result.sessions.map((session) => session.scheduledDate)).size).toBe(3);
  });

  it("rejects an exam that is today", () => {
    expect(generateReviewSchedule(["math"], "2026-11-17T15:00", today)).toEqual({
      ok: false,
      reason: "exam-today",
      availableDays: 0,
    });
  });

  it("rejects a past exam date", () => {
    expect(generateReviewSchedule(["math"], "2026-11-10T09:00", today)).toMatchObject({
      ok: false,
      reason: "past-exam",
    });
  });

  it("reports how many days are available when courses outnumber them", () => {
    expect(
      generateReviewSchedule(["a", "b", "c"], "2026-11-19T09:00", today),
    ).toEqual({ ok: false, reason: "insufficient-days", availableDays: 2 });
  });
});