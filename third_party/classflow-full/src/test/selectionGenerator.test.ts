import { describe, expect, it } from "vitest";
import { autoCombine, type SelectionMeeting, type SelectionSection } from "../lib/planner";
import { generateSelectionPlan } from "../lib/selectionGenerator";

function meeting(patch: Partial<SelectionMeeting> = {}): SelectionMeeting {
  return { day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16, ...patch };
}

function section(
  patch: Partial<SelectionSection> & { name: string },
): SelectionSection {
  return {
    id: patch.id ?? patch.name,
    code: "",
    teacher: "",
    location: "",
    credits: 2,
    category: "required",
    difficulty: 3,
    meetings: [meeting()],
    createdAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  };
}

describe("P07 选课组合适配器", () => {
  it("同一课程码只选一个班次，并避开时间冲突", () => {
    const pool = [
      section({ name: "高数 A 班", id: "a1", code: "MATH", credits: 4, meetings: [meeting({ day: 1 })] }),
      section({ name: "高数 B 班", id: "a2", code: "MATH", credits: 4, meetings: [meeting({ day: 4 })] }),
      section({ name: "英语", id: "e", code: "ENG", credits: 2, meetings: [meeting({ day: 2 })] }),
    ];
    const result = generateSelectionPlan(pool, { maxCredits: 8 });
    expect(result.sectionIds).toHaveLength(2);
    expect(result.sectionIds.filter((id) => id === "a1" || id === "a2")).toHaveLength(1);
    expect(result.sectionIds).toContain("e");
  });

  it("全部课程互相冲突时返回空方案和原因", () => {
    const pool = [
      section({ name: "A", id: "a", code: "A" }),
      section({ name: "B", id: "b", code: "B" }),
      section({ name: "C", id: "c", code: "C" }),
    ];
    const result = generateSelectionPlan(pool, { maxCredits: 8 });
    expect(result.sectionIds).toEqual([]);
    expect(result.emptyReason).toBeTruthy();
  });

  it("超出学分上限时不硬塞课程", () => {
    const pool = [
      section({ name: "A", id: "a", code: "A", credits: 4, meetings: [meeting({ day: 1 })] }),
      section({ name: "B", id: "b", code: "B", credits: 4, meetings: [meeting({ day: 2 })] }),
    ];
    expect(generateSelectionPlan(pool, { maxCredits: 3 }).sectionIds).toEqual([]);
  });

  it("按类别过滤候选课程", () => {
    const pool = [
      section({ name: "高数", id: "m", code: "MATH", meetings: [meeting({ day: 1 })] }),
      section({ name: "羽毛球", id: "p", code: "PE", category: "pe", meetings: [meeting({ day: 2 })] }),
    ];
    expect(generateSelectionPlan(pool, { categories: ["pe"] }).sectionIds).toEqual([]);
    expect(
      generateSelectionPlan(pool, { categories: ["required"] }).sectionIds,
    ).toEqual([]);
  });
});

describe("autoCombine 兜底", () => {
  it("只有一门课时 P07 拒绝组合，退回原贪心实现", () => {
    const pool = [section({ name: "唯一课程", id: "only", code: "ONE", credits: 3 })];
    expect(autoCombine(pool, { maxCredits: 8 })).toEqual(["only"]);
  });
});
