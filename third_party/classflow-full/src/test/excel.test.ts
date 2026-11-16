import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readXlsxRows } from "../lib/xlsx";
import {
  detectHeaderRow,
  guessColumnMapping,
  mapCourseRows,
  mappingReady,
} from "../lib/excelMapping";

function loadFixture(): ArrayBuffer {
  const file = readFileSync(resolve(__dirname, "fixtures/course-table.xlsx"));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

describe("xlsx reader", () => {
  it("reads sheet names and inline string cells", async () => {
    const sheets = await readXlsxRows(loadFixture());
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("课表");
    expect(sheets[0].rows).toHaveLength(4);
    expect(sheets[0].rows[0]).toEqual([
      "课程名称",
      "星期",
      "节次",
      "周次",
      "教室",
      "教师",
      "班级",
    ]);
    expect(sheets[0].rows[1][0]).toBe("高等数学");
    expect(sheets[0].rows[3][1]).toBe("周五、周日");
  });

  it("rejects files that are not zip archives", async () => {
    await expect(readXlsxRows(new ArrayBuffer(32))).rejects.toThrow("不是有效的 xlsx 文件");
  });
});

describe("excel mapping", () => {
  it("detects the header row and maps column aliases", async () => {
    const [sheet] = await readXlsxRows(loadFixture());
    const headerRow = detectHeaderRow(sheet.rows);
    expect(headerRow).toBe(0);
    const mapping = guessColumnMapping(sheet.rows[headerRow]);
    expect(mapping).toMatchObject({
      name: 0,
      day: 1,
      period: 2,
      weeks: 3,
      location: 4,
      teacher: 5,
      section: 6,
    });
    expect(mappingReady(mapping)).toBe(true);
  });

  it("filters by section and expands multi-segment periods", async () => {
    const [sheet] = await readXlsxRows(loadFixture());
    const mapping = guessColumnMapping(sheet.rows[0]);
    const result = mapCourseRows(sheet.rows, mapping, {
      totalWeeks: 20,
      sectionKeyword: "2024级1班",
      startRow: 1,
    });
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(2);
    expect(result.courses.map((course) => course.name)).toEqual(["高等数学", "英语"]);

    const math = result.courses.find((course) => course.name === "高等数学");
    expect(math?.slots).toEqual([
      { day: 1, start: 1, end: 2, weekStart: 1, weekEnd: 16, pattern: "all" },
    ]);
    expect(math?.location).toBe("教一401");
    expect(math?.teacher).toBe("张老师");

    const english = result.courses.find((course) => course.name === "英语");
    expect(english?.slots).toHaveLength(4);
    expect(english?.slots.map((slot) => `${slot.day}:${slot.start}-${slot.end}`).sort()).toEqual([
      "5:5-6",
      "5:7-8",
      "7:5-6",
      "7:7-8",
    ]);
  });

  it("imports every section when no keyword is given", async () => {
    const [sheet] = await readXlsxRows(loadFixture());
    const mapping = guessColumnMapping(sheet.rows[0]);
    const result = mapCourseRows(sheet.rows, mapping, { totalWeeks: 20, startRow: 1 });
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(3);
    expect(result.courses).toHaveLength(3);
    const physics = result.courses.find((course) => course.name === "大学物理");
    expect(physics?.slots).toEqual([
      { day: 3, start: 3, end: 4, weekStart: 2, weekEnd: 18, pattern: "all" },
    ]);
  });

  it("uses separate start and end columns when there is no period column", () => {
    const rows = [
      ["课程", "星期", "开始节", "结束节", "周次"],
      ["线性代数", "周二", "3", "4", "1-8"],
    ];
    const mapping = guessColumnMapping(rows[0]);
    expect(mapping.period).toBe(-1);
    expect(mapping.start).toBe(2);
    expect(mapping.end).toBe(3);
    const result = mapCourseRows(rows, mapping, { totalWeeks: 20, startRow: 1 });
    expect(result.errors).toEqual([]);
    expect(result.courses[0].slots).toEqual([
      { day: 2, start: 3, end: 4, weekStart: 1, weekEnd: 8, pattern: "all" },
    ]);
  });
});
