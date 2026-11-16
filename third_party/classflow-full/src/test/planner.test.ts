import { describe, expect, it } from "vitest";
import type { Course } from "../types";
import {
  alternativesFor,
  assessmentPressure,
  autoCombine,
  createEmptyCatalog,
  filterSections,
  graduationProgress,
  meetingsConflict,
  normalizeCatalog,
  planStats,
  rankAlternatives,
  sectionsConflict,
  sectionsFromCourses,
  withSectionAdded,
  withSectionRemoved,
  type SelectionMeeting,
  type SelectionSection,
} from "../lib/planner";

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

describe("课程时间冲突", () => {
  it("识别同一天同一时段的节次重叠", () => {
    expect(meetingsConflict(meeting({ start: 1, end: 2 }), meeting({ start: 2, end: 3 }))).toBe(true);
    expect(meetingsConflict(meeting({ start: 1, end: 2 }), meeting({ start: 3, end: 4 }))).toBe(false);
  });

  it("不同星期不冲突", () => {
    expect(meetingsConflict(meeting({ day: 2 }), meeting({ day: 1 }))).toBe(false);
  });

  it("单双周错开时不冲突", () => {
    const odd = meeting({ weekStart: 3, weekEnd: 15, pattern: "odd" });
    const even = meeting({ weekStart: 3, weekEnd: 15, pattern: "even" });
    expect(meetingsConflict(odd, even)).toBe(false);
    expect(meetingsConflict(odd, meeting({ weekStart: 3, weekEnd: 15 }))).toBe(true);
  });

  it("课程级冲突按全部节次判断", () => {
    const a = section({
      name: "A",
      meetings: [meeting({ day: 1 }), meeting({ day: 3, start: 5, end: 6 })],
    });
    const b = section({ name: "B", meetings: [meeting({ day: 3, start: 6, end: 7 })] });
    const c = section({ name: "C", meetings: [meeting({ day: 2 })] });
    expect(sectionsConflict(a, b)).toBe(true);
    expect(sectionsConflict(a, c)).toBe(false);
  });
});

describe("方案统计", () => {
  it("汇总学分、周课时、冲突与重复课程", () => {
    const a = section({ name: "高数", id: "a", credits: 4, meetings: [meeting({ day: 1, start: 1, end: 2 })] });
    const b = section({ name: "英语", id: "b", credits: 2, meetings: [meeting({ day: 1, start: 2, end: 3 })] });
    const c = section({ name: "高数", id: "c", credits: 4, meetings: [meeting({ day: 4, start: 1, end: 2 })] });
    const stats = planStats([a, b, c]);
    expect(stats.creditTotal).toBe(10);
    expect(stats.weeklyPeriods).toBe(6);
    expect(stats.conflictPairs).toEqual([["a", "b"]]);
    expect(stats.duplicateGroups).toEqual(["高数"]);
    expect(stats.earliestStart).toBe(1);
    expect(stats.latestEnd).toBe(3);
  });
});

describe("课程池筛选", () => {
  const pool = [
    section({ name: "高等数学", id: "m", category: "required", teacher: "张老师" }),
    section({ name: "大学英语", id: "e", category: "general", meetings: [meeting({ day: 2 })] }),
    section({ name: "羽毛球", id: "p", category: "pe", meetings: [meeting({ day: 5 })] }),
  ];

  it("按关键词、类别和星期筛选", () => {
    expect(filterSections(pool, { query: "英语" }).map((s) => s.id)).toEqual(["e"]);
    expect(filterSections(pool, { category: "pe" }).map((s) => s.id)).toEqual(["p"]);
    expect(filterSections(pool, { day: 5 }).map((s) => s.id)).toEqual(["p"]);
  });

  it("只看无冲突时剔除与已选重叠的课程", () => {
    const selected = [section({ name: "已选", id: "x", meetings: [meeting({ day: 1 })] })];
    expect(filterSections(pool, { freeOnly: true }, selected).map((s) => s.id)).toEqual(["e", "p"]);
  });

  it("候选排序把无冲突、学分高的排在前面", () => {
    const selected = [section({ name: "已选", id: "x" })];
    const ranked = rankAlternatives(pool, selected);
    expect(ranked[0].section.id).toBe("e");
    expect(ranked[0].conflicts).toEqual([]);
    expect(ranked[ranked.length - 1].section.id).toBe("m");
    expect(ranked[ranked.length - 1].conflicts).toEqual(["已选"]);
  });
});

describe("自动组合与替代班次", () => {
  it("在学分和课时上限内避开冲突，同课程只选一个班次", () => {
    const pool = [
      section({ name: "高数 A 班", id: "a1", code: "MATH", credits: 4, meetings: [meeting({ day: 1 })] }),
      section({ name: "高数 B 班", id: "a2", code: "MATH", credits: 4, meetings: [meeting({ day: 4 })] }),
      section({ name: "英语", id: "e", credits: 2, meetings: [meeting({ day: 1, start: 3, end: 4 })] }),
      section({ name: "体育", id: "p", credits: 1, difficulty: 1, category: "pe", meetings: [meeting({ day: 1, start: 1, end: 2 })] }),
    ];
    const picked = autoCombine(pool, { maxCredits: 8, maxWeeklyPeriods: 12 });
    expect(picked).toContain("a1");
    expect(picked).not.toContain("a2");
    expect(picked).not.toContain("p");
    expect(picked).toContain("e");
  });

  it("替代班次只返回同课程的其他班次，并标出冲突", () => {
    const target = section({ name: "高数 A 班", id: "a1", code: "MATH", meetings: [meeting({ day: 1 })] });
    const alternative = section({ name: "高数 B 班", id: "a2", code: "MATH", meetings: [meeting({ day: 2 })] });
    const clash = section({ name: "高数 C 班", id: "a3", code: "MATH", meetings: [meeting({ day: 2 })] });
    const other = section({ name: "英语", id: "e", code: "ENG", meetings: [meeting({ day: 2 })] });
    const selected = [target, section({ name: "已选", id: "x", meetings: [meeting({ day: 2 })] })];
    const result = alternativesFor(target, [target, alternative, clash, other], selected);
    expect(result.map((item) => item.section.id).sort()).toEqual(["a2", "a3"]);
    expect(result.every((item) => item.conflicts.includes("已选"))).toBe(true);
  });
});

describe("考核压力与培养方案", () => {
  it("考试周撞车会抬高压力等级", () => {
    const light = [
      section({ name: "A", credits: 2, difficulty: 2, meetings: [meeting({ day: 1, start: 1, end: 2 })] }),
    ];
    const heavy = [
      section({ name: "A", credits: 4, difficulty: 5, examWeek: 16, meetings: [meeting({ day: 1, start: 1, end: 4 })] }),
      section({ name: "B", credits: 4, difficulty: 5, examWeek: 16, meetings: [meeting({ day: 2, start: 1, end: 4 })] }),
      section({ name: "C", credits: 4, difficulty: 5, examWeek: 16, meetings: [meeting({ day: 3, start: 1, end: 4 })] }),
    ];
    expect(assessmentPressure(light).level).toBe("light");
    expect(assessmentPressure(heavy).level).not.toBe("light");
    expect(assessmentPressure(heavy).examWeeks[0]).toEqual({ week: 16, count: 3 });
  });

  it("按类别统计毕业学分进度", () => {
    const progress = graduationProgress([
      section({ name: "A", category: "required", credits: 30 }),
      section({ name: "B", category: "pe", credits: 4 }),
      section({ name: "C", category: "pe", credits: 2 }),
    ]);
    const pe = progress.find((item) => item.category === "pe");
    const required = progress.find((item) => item.category === "required");
    expect(pe?.credits).toBe(6);
    expect(pe?.rate).toBe(75);
    expect(required?.rate).toBe(50);
  });
});

describe("目录状态", () => {
  it("规范化时丢弃无效数据并修正活动方案", () => {
    const state = normalizeCatalog({
      sections: [
        { name: "高数", meetings: [{ day: 1, start: 1, end: 2 }], credits: 4 },
        { name: "" },
      ],
      plans: [{ name: "方案 A", sectionIds: ["missing"] }],
      activePlanId: "unknown",
    });
    expect(state.sections).toHaveLength(1);
    expect(state.sections[0].credits).toBe(4);
    expect(state.plans[0].sectionIds).toEqual([]);
    expect(state.activePlanId).toBe(state.plans[0].id);
  });

  it("增删课程只影响当前方案", () => {
    const base = createEmptyCatalog();
    const withOne = withSectionAdded(base, "sec-1");
    expect(withOne.plans[0].sectionIds).toEqual(["sec-1"]);
    const removed = withSectionRemoved(withOne, "sec-1");
    expect(removed.plans[0].sectionIds).toEqual([]);
  });

  it("从课表课程生成候选课程并推断类别", () => {
    const course: Course = {
      id: "c1",
      name: "大学体育 · 羽毛球",
      teacher: "王老师",
      location: "风雨操场",
      tone: "clay",
      note: "",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      slots: [
        { id: "s1", day: 3, start: 5, end: 6, weekStart: 1, weekEnd: 16, pattern: "all" },
      ],
    };
    const [converted] = sectionsFromCourses([course]);
    expect(converted.id).toBe("sec-c1");
    expect(converted.category).toBe("pe");
    expect(converted.credits).toBe(1);
    expect(converted.meetings).toHaveLength(1);
  });
});
