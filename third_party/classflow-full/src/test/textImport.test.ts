import { describe, expect, it } from "vitest";
import { parseCourseText } from "../lib/textImport";

describe("parseCourseText", () => {
  it("parses a space separated line with a period range and weeks", () => {
    const result = parseCourseText("高等数学 周一 第1-2节 教一401 1-16周");
    expect(result.errors).toEqual([]);
    expect(result.courses).toHaveLength(1);
    const course = result.courses[0];
    expect(course.name).toBe("高等数学");
    expect(course.location).toBe("教一401");
    expect(course.slots).toEqual([
      { day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16, pattern: "all" },
    ]);
  });

  it("accepts semicolons, multiple days and teacher markers", () => {
    const result = parseCourseText("大学物理;周二、周四;3-4节;教二205;1-8周;@王老师");
    expect(result.errors).toEqual([]);
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].teacher).toBe("王老师");
    expect(result.courses[0].slots.map((slot) => slot.day)).toEqual([2, 4]);
  });

  it("reads single/even week patterns and single period", () => {
    const result = parseCourseText("英语 星期三 第5节 图书馆 双周");
    expect(result.errors).toEqual([]);
    const slot = result.courses[0].slots[0];
    expect(slot.start).toBe(5);
    expect(slot.end).toBe(5);
    expect(slot.pattern).toBe("even");
    expect(result.courses[0].location).toBe("图书馆");
  });

  it("keeps names clean when weeks and pattern are written together", () => {
    const result = parseCourseText("英语 周三 第5-6节 外语楼302 1-16周 双周");
    expect(result.errors).toEqual([]);
    expect(result.courses[0].name).toBe("英语");
    expect(result.courses[0].slots[0].pattern).toBe("even");
    expect(result.courses[0].location).toBe("外语楼302");
  });

  it("does not read a week range as a weekday", () => {
    const result = parseCourseText("线性代数 周二 1-8周 3-4节");
    expect(result.errors).toEqual([]);
    expect(result.courses[0].slots).toEqual([
      { day: 2, start: 3, end: 4, weekStart: 1, weekEnd: 8, pattern: "all" },
    ]);
  });

  it("merges repeated courses into one entry with several slots", () => {
    const result = parseCourseText(
      ["体育 周一 3-4节 体育馆 1-16周", "体育 周三 3-4节 体育馆 1-16周"].join("\n"),
    );
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].slots).toHaveLength(2);
  });

  it("reports lines that miss a weekday or periods", () => {
    const result = parseCourseText("高等数学 1-2节 1-16周\n大学物理 周二 1-16周\n# 注释");
    expect(result.courses).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toContain("星期");
    expect(result.errors[1]).toContain("节次");
  });
});
