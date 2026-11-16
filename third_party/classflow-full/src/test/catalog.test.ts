import { describe, expect, it } from "vitest";
import {
  catalogStats,
  catalogToMarkdown,
  parseCatalog,
} from "../lib/catalog";

describe("catalog extraction (F115)", () => {
  it("parses free-form catalog lines", () => {
    const result = parseCatalog(
      [
        "高等数学 A（上） 5学分 先修：无 第1学期",
        "- 数据结构与算法 4 学分 先修课程：程序设计基础、离散数学 开课：第3学期",
        "1. 大学英语 III（3学分），第 2 学期开课",
      ].join("\n"),
    );
    expect(result.courses).toHaveLength(3);
    const [math, ds, english] = result.courses;
    expect(math).toMatchObject({ name: "高等数学 A（上）", credits: 5, semester: 1 });
    expect(math.prerequisites).toEqual([]);
    expect(ds.name).toBe("数据结构与算法");
    expect(ds.credits).toBe(4);
    expect(ds.prerequisites).toEqual(["程序设计基础", "离散数学"]);
    expect(ds.semester).toBe(3);
    expect(english.name).toBe("大学英语 III");
    expect(english.credits).toBe(3);
    expect(english.semester).toBe(2);
  });

  it("reads table rows and skips headers and dividers", () => {
    const result = parseCatalog(
      [
        "| 课程 | 学分 | 先修 | 开课学期 |",
        "| --- | --- | --- | --- |",
        "| 概率论与数理统计 | 3 | 高等数学 | 第 4 学期 |",
        "| 线性代数 | 2.5 | 无 | 第 2 学期 |",
      ].join("\n"),
    );
    expect(result.courses.map((course) => course.name)).toEqual([
      "概率论与数理统计",
      "线性代数",
    ]);
    expect(result.courses[0].credits).toBe(3);
    expect(result.courses[0].semester).toBe(4);
    expect(result.courses[1].credits).toBe(2.5);
    expect(result.skipped).toBe(2);
  });

  it("ignores text without course metadata and duplicates", () => {
    const result = parseCatalog(
      [
        "2026 级计算机科学与技术专业培养方案",
        "本专业总学分 160 学分，其中必修 120 学分。",
        "高等数学 5 学分",
        "高等数学 5 学分",
        "先修课程：程序设计基础",
      ].join("\n"),
    );
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].name).toBe("高等数学");
    expect(result.skipped).toBe(4);
  });

  it("renders a markdown table and stats", () => {
    const { courses } = parseCatalog(
      "高等数学 5 学分 先修：无 第 1 学期\n数据结构 4 学分 先修：程序设计基础 第 3 学期",
    );
    const markdown = catalogToMarkdown(courses);
    expect(markdown).toContain("| 课程 | 学分 | 先修 | 开课学期 |");
    expect(markdown).toContain("| 高等数学 | 5 | — | 第 1 学期 |");
    expect(markdown).toContain("程序设计基础");
    expect(catalogStats(courses)).toEqual({ total: 2, credits: 9, withPrerequisites: 1 });
    expect(catalogToMarkdown([])).toBe("");
  });
});
