import { describe, expect, it } from "vitest";
import { buildIcs, parseCsvCourses, parseIcsEvents, readScheduleFile } from "../lib/transfer";
import { createDemoSchedule } from "../lib/factory";
import { normalizeSchedule } from "../lib/storage";

describe("calendar export", () => {
  it("creates one calendar event per active session and escapes fields", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    data.timetables[0].courses[0].location = "教一 401, 东侧";
    const { content, count } = buildIcs(data);
    expect(count).toBeGreaterThan(20);
    expect(content).toContain("BEGIN:VCALENDAR\r\n");
    expect(content).toContain("SUMMARY:高等数学 A（上）");
    expect(content).toContain("LOCATION:教一 401\\, 东侧");
    expect(content).toContain("DTSTART:20260907T080000");
    expect(content).not.toContain("\n\n");
  });
});

describe("multi-format import", () => {
  it("reads ICS events and expands weekly repeats", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "SUMMARY:高等数学",
      "DTSTART;TZID=Asia/Shanghai:20260907T080000",
      "DTEND;TZID=Asia/Shanghai:20260907T094000",
      "LOCATION:教一401",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:校庆",
      "DTSTART;VALUE=DATE:20261001",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcsEvents(ics);
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      title: "高等数学",
      date: "2026-09-07",
      start: "08:00",
      end: "09:40",
      allDay: false,
    });
    expect(events[0].note).toContain("地点：教一401");
    expect(events.map((event) => event.date).slice(0, 3)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
    expect(events[3]).toMatchObject({ title: "校庆", date: "2026-10-01", allDay: true });
  });

  it("maps CSV headers, quotes and multiple weekdays", () => {
    const csv = [
      "课程名,星期,开始节,结束节,开始周,结束周,教室,老师,单双周",
      '"大学物理",周二、周四,3,4,1,16,教二205,王老师,',
      "英语,周三,5,6,1,16,外语楼302,李老师,双",
    ].join("\n");
    const courses = parseCsvCourses(csv);
    expect(courses).toHaveLength(2);
    expect(courses[0].name).toBe("大学物理");
    expect(courses[0].slots.map((slot) => slot.day)).toEqual([2, 4]);
    expect(courses[0].teacher).toBe("王老师");
    expect(courses[1].slots[0].pattern).toBe("even");
  });

  it("imports a text file through readScheduleFile", async () => {
    const file = new File(["高等数学 周一 第1-2节 教一401 1-16周"], "课表.txt", {
      type: "text/plain",
    });
    const result = await readScheduleFile(file);
    expect(result.data).not.toBeNull();
    expect(result.message).toContain("1 门课程");
    expect(result.data?.timetables[0].courses[0].name).toBe("高等数学");
  });
});

describe("import normalization", () => {  it("accepts an exported v2 envelope", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    const normalized = normalizeSchedule({ data });
    expect(normalized?.timetables[0].courses).toHaveLength(8);
    expect(normalized?.timetables[0].semester.startDate).toBe(data.timetables[0].semester.startDate);
  });

  it("drops invalid slots and invalid courses", () => {
    const normalized = normalizeSchedule({
      semester: { name: "测试", startDate: "2026-09-07", totalWeeks: 16 },
      courses: [
        { id: "ok", name: "好课", slots: [{ day: 1, start: 1, end: 2 }] },
        { id: "bad", name: "", slots: [{ day: 1, start: 1, end: 2 }] },
        { id: "no-slots", name: "空课", slots: [] },
      ],
    });
    expect(normalized?.timetables[0].courses.map((course) => course.id)).toEqual(["ok"]);
  });
});
