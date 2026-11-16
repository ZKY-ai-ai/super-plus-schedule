import { describe, expect, it } from "vitest";
import { weeksForSlot } from "../lib/schedule";
import {
  detectThirdPartyShare,
  parseThirdPartySchedule,
  thirdPartyLabel,
} from "../lib/thirdPartyImport";

const TIME_TABLE = JSON.stringify([
  { node: 1, startTime: "08:00", endTime: "08:45" },
  { node: 2, startTime: "08:55", endTime: "09:40" },
  { node: 3, startTime: "10:00", endTime: "10:45" },
  { node: 4, startTime: "10:55", endTime: "11:40" },
]);
const TABLE_INFO = JSON.stringify({ startDate: "2026-09-07", tableName: "2026 秋" });
const COURSE_INFOS = JSON.stringify([
  { id: 1, courseName: "高等数学", teacher: "张老师" },
  { id: 2, courseName: "大学英语", teacher: "李老师" },
]);
const COURSE_DETAILS = JSON.stringify([
  { id: 1, day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, room: "教101" },
  { id: 2, day: 3, startNode: 3, step: 1, startWeek: 1, endWeek: 15, type: 1, room: "外语楼302" },
]);
const WAKEUP_PAYLOAD = [
  JSON.stringify({ version: 6, name: "WakeUp" }),
  TIME_TABLE,
  TABLE_INFO,
  COURSE_INFOS,
  COURSE_DETAILS,
].join("\n");

const STARLINK_JSON = {
  tableName: "星链课表",
  startDate: "2026-09-07",
  timeSlots: [
    { number: 1, startTime: "08:00", endTime: "08:45" },
    { number: 2, startTime: "08:55", endTime: "09:40" },
    { number: 3, startTime: "10:00", endTime: "10:45" },
  ],
  courses: [
    {
      name: "高等数学",
      teacher: "张老师",
      position: "教101",
      weekday: 1,
      startSection: 1,
      endSection: 2,
      weeks: [1, 2, 3, 4, 5, 6, 7, 8],
    },
    {
      name: "大学英语",
      teacher: "李老师",
      location: "外语楼302",
      weekday: 3,
      startSection: 3,
      endSection: 3,
      startWeek: 1,
      endWeek: 15,
    },
  ],
};

describe("third party timetable import", () => {
  it("parses a WakeUp five-line payload with info/detail rows", () => {
    const parsed = parseThirdPartySchedule(WAKEUP_PAYLOAD);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.source).toBe("wakeup");
    expect(parsed.name).toBe("2026 秋");
    expect(parsed.startDate).toBe("2026-09-07");
    expect(parsed.courseCount).toBe(2);
    expect(parsed.slotCount).toBe(2);

    const timetable = parsed.data.timetables[0];
    expect(timetable.semester.totalWeeks).toBe(20);
    expect(timetable.semester.periods[0]).toEqual({ index: 1, start: "08:00", end: "08:45" });
    expect(parsed.data.periodProfiles.at(-1)?.name).toBe("WakeUp作息");
    expect(timetable.periodProfileId).toBe(parsed.data.periodProfiles.at(-1)?.id);

    const math = timetable.courses.find((course) => course.name === "高等数学");
    expect(math?.teacher).toBe("张老师");
    expect(math?.location).toBe("教101");
    expect(math?.slots[0]?.day).toBe(1);
    expect(weeksForSlot(math!.slots[0]!)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));

    const english = timetable.courses.find((course) => course.name === "大学英语");
    expect(weeksForSlot(english!.slots[0]!)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
  });

  it("unwraps the WakeUp online API response", () => {
    const response = JSON.stringify({ status: 1, data: WAKEUP_PAYLOAD, message: "success" });
    const parsed = parseThirdPartySchedule(response);
    expect(parsed?.courseCount).toBe(2);
  });

  it("keeps explicit stepWeekList values instead of expanding a range", () => {
    const payload = JSON.stringify({
      tableName: "单双周",
      startDate: "2026-09-07",
      timeList: [{ node: 1, startTime: "08:00", endTime: "08:45" }],
      courseList: [
        {
          courseName: "离散数学",
          day: 2,
          room: "教201",
          teacher: "王老师",
          startNode: 1,
          step: 1,
          stepWeekList: [1, 2, 3, 5, 8],
        },
      ],
    });
    const parsed = parseThirdPartySchedule(payload);
    expect(parsed?.courseCount).toBe(1);
    expect(weeksForSlot(parsed!.data.timetables[0]!.courses[0]!.slots[0]!)).toEqual([
      1, 2, 3, 5, 8,
    ]);
  });

  it("parses Starlink JSON and its API wrapper", () => {
    const direct = parseThirdPartySchedule(JSON.stringify(STARLINK_JSON));
    expect(direct?.source).toBe("starlink");
    expect(direct?.name).toBe("星链课表");
    expect(direct?.courseCount).toBe(2);

    const wrapped = parseThirdPartySchedule(JSON.stringify({ data: STARLINK_JSON }));
    expect(wrapped?.courseCount).toBe(2);

    const math = direct!.data.timetables[0]!.courses.find((course) => course.name === "高等数学");
    expect(weeksForSlot(math!.slots[0]!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const english = direct!.data.timetables[0]!.courses.find(
      (course) => course.name === "大学英语",
    );
    expect(weeksForSlot(english!.slots[0]!)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
  });

  it("merges adjacent Starlink sections for the same course", () => {
    const payload = {
      startDate: "2026-09-07",
      courses: [
        { name: "线性代数", weekday: 1, startSection: 1, endSection: 1, weeks: [1, 2] },
        { name: "线性代数", weekday: 1, startSection: 2, endSection: 2, weeks: [1, 2] },
      ],
    };
    const parsed = parseThirdPartySchedule(JSON.stringify(payload));
    expect(parsed?.slotCount).toBe(1);
    expect(parsed!.data.timetables[0]!.courses[0]!.slots[0]).toMatchObject({
      day: 1,
      start: 1,
      end: 2,
    });
  });

  it("rejects unrelated text and objects", () => {
    expect(parseThirdPartySchedule("")).toBeNull();
    expect(parseThirdPartySchedule("高等数学 周一 1-2节")).toBeNull();
    expect(parseThirdPartySchedule('{"foo":"bar"}')).toBeNull();
  });

  it("detects share texts and bare codes", () => {
    expect(
      detectThirdPartyShare(
        "这是来自「WakeUp课程表」的课表分享，分享口令为「a02b3a50f6a74fa49ec592597cef8162」",
      ),
    ).toEqual({ source: "wakeup", code: "a02b3a50f6a74fa49ec592597cef8162" });
    expect(detectThirdPartyShare("a02b3a50f6a74fa49ec592597cef8162")).toEqual({
      source: "wakeup",
      code: "a02b3a50f6a74fa49ec592597cef8162",
    });
    expect(
      detectThirdPartyShare("我在「星链课表」分享了课表给你。打开课表页右上角「+」，输入：PABRdldk"),
    ).toEqual({ source: "starlink", code: "PABRdldk" });
    expect(detectThirdPartyShare("PABRdldk")).toEqual({ source: "starlink", code: "PABRdldk" });
    expect(detectThirdPartyShare('{"courses":[]}')).toBeNull();
    expect(thirdPartyLabel("wakeup")).toBe("WakeUp");
    expect(thirdPartyLabel("starlink")).toBe("星链");
  });
});
