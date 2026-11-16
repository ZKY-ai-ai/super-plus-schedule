import { describe, expect, it } from "vitest";
import { createPeriods, makeCourse, makeSlot } from "../lib/factory";
import type { Session } from "../types";
import {
  createRoom,
  locationMatchesRoom,
  normalizeRooms,
  periodAt,
  roomAvailability,
  roomBuildings,
  type CampusRoom,
} from "../lib/campus";
import { estimateWalk, normalizeGapPreferences, walkKey } from "../lib/gaps";

const periods = createPeriods(12);

function session(
  name: string,
  location: string,
  day: number,
  start: number,
  end: number,
): Session {
  const course = makeCourse({
    name,
    location,
    slots: [makeSlot({ day, start, end })],
  });
  return { id: `${name}:${start}`, course, slot: course.slots[0], day, start, end };
}

const rooms: CampusRoom[] = [
  { id: "a101", name: "101", building: "教一", seats: 60, note: "" },
  { id: "a201", name: "201", building: "教一", seats: 120, note: "" },
  { id: "b101", name: "101", building: "教二", seats: 80, note: "" },
];

describe("空教室", () => {
  it("按节次把课表地点算作占用，并统计空座率", () => {
    const sessions = [session("高数", "教一 101", 1, 1, 2)];
    const result = roomAvailability(rooms, sessions, periods, 1, 1);
    expect(result.totalRooms).toBe(3);
    expect(result.freeRooms).toBe(2);
    expect(result.freeSeats).toBe(200);
    expect(result.totalSeats).toBe(260);
    expect(result.emptyRate).toBeCloseTo(200 / 260);
    const taken = result.rooms.find((state) => state.room.id === "a101");
    expect(taken?.free).toBe(false);
    expect(taken?.occupiedBy[0]?.course.name).toBe("高数");
  });

  it("只统计与目标节次重叠的课程", () => {
    const sessions = [session("物理", "教一 101", 1, 3, 4)];
    expect(roomAvailability(rooms, sessions, periods, 1, 1).freeRooms).toBe(3);
    expect(roomAvailability(rooms, sessions, periods, 1, 4).freeRooms).toBe(2);
    expect(roomAvailability(rooms, sessions, periods, 2, 3).freeRooms).toBe(3);
  });

  it("可以按楼栋筛选", () => {
    const result = roomAvailability(rooms, [], periods, 1, 2, "教一");
    expect(result.totalRooms).toBe(2);
    expect(result.freeRooms).toBe(2);
    expect(roomBuildings(rooms)).toEqual(["教一", "教二"]);
  });

  it("地点匹配支持带不带空格", () => {
    expect(locationMatchesRoom("教一101", rooms[0])).toBe(true);
    expect(locationMatchesRoom("教一 101", rooms[0])).toBe(true);
    expect(locationMatchesRoom("教二 101", rooms[0])).toBe(false);
    expect(locationMatchesRoom("", rooms[0])).toBe(false);
  });

  it("录入教室时纠正座位数并保留备注", () => {
    const room = createRoom({ name: " 305 ", building: "教二", seats: 0, note: "小班" });
    expect(room.name).toBe("305");
    expect(room.seats).toBe(40);
    expect(room.note).toBe("小班");
    const sanitized = normalizeRooms([
      { name: "", building: "教一", seats: 10 },
      { name: "101", building: "教一", seats: 9999 },
      "bad",
    ]);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].seats).toBe(999);
  });

  it("能把当前时间映射到节次", () => {
    const [first] = periods;
    const start = Number(first.start.slice(0, 2)) * 60 + Number(first.start.slice(3));
    expect(periodAt(periods, start + 1)).toBe(1);
    expect(periodAt(periods, 0)).toBe(1);
  });
});

describe("路网与无障碍", () => {
  it("自定义路线优先于内置坐标", () => {
    const prefs = normalizeGapPreferences({
      customWalks: { [walkKey("教一", "外语楼")]: 2 },
    });
    const walk = estimateWalk("教一 401", "外语楼 302", prefs);
    expect(walk.minutes).toBe(2);
    expect(walk.source).toBe("custom");
    expect(walk.known).toBe(true);
  });

  it("自定义路线对两个方向都生效", () => {
    const prefs = normalizeGapPreferences({ customWalks: { [walkKey("教一", "外语楼")]: 3 } });
    expect(estimateWalk("外语楼 302", "教一 401", prefs).minutes).toBe(3);
  });

  it("楼栋别名在估算前归一", () => {
    const walk = estimateWalk("一教 401", "二教 105", {
      aliases: { 一教: "教一", 二教: "教二" },
    });
    expect(walk.from).toBe("教一");
    expect(walk.to).toBe("教二");
    expect(walk.source).toBe("zone");
  });

  it("无障碍模式给跨楼步行增加预留时间", () => {
    const base = estimateWalk("教一 401", "外语楼 302").minutes;
    const accessible = estimateWalk("教一 401", "外语楼 302", {
      accessMode: true,
      accessibleExtra: 4,
    });
    expect(accessible.minutes).toBe(base + 4);
    expect(accessible.accessible).toBe(true);
    const same = estimateWalk("教一 401", "教一 105", { accessMode: true });
    expect(same.minutes).toBe(0);
    expect(same.accessible).toBe(false);
  });

  it("步行速度影响内置坐标估算", () => {
    const slow = estimateWalk("教一 401", "外语楼 302", { walkSpeed: 75 }).minutes;
    const fast = estimateWalk("教一 401", "外语楼 302", { walkSpeed: 150 }).minutes;
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeGreaterThanOrEqual(1);
  });

  it("非法路网数据被归一掉", () => {
    const prefs = normalizeGapPreferences({
      customWalks: { "教一|外语楼": 999, bad: 4, "a|b|c": 3 },
      aliases: { "": "教一", 一教: "教一" },
    });
    expect(prefs.customWalks[walkKey("教一", "外语楼")]).toBe(60);
    expect(Object.keys(prefs.customWalks)).toHaveLength(1);
    expect(prefs.aliases).toEqual({ 一教: "教一" });
    expect(prefs.accessMode).toBe(false);
  });
});
