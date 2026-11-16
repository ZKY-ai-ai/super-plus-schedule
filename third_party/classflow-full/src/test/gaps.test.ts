import { describe, expect, it } from "vitest";
import { createPeriods, makeCourse, makeSlot } from "../lib/factory";
import type { Session } from "../types";
import {
  DEFAULT_GAP_PREFERENCES,
  assessLunch,
  buildDayTimeline,
  checkRoundTrip,
  estimateWalk,
  extractBuilding,
  findDayGaps,
  latestDeparture,
  normalizeGapPreferences,
  sessionEndMinutes,
  sessionStartMinutes,
  suggestGapActivities,
  walkMinutes,
} from "../lib/gaps";

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
  return {
    id: `${name}:${start}`,
    course,
    slot: course.slots[0],
    day,
    start,
    end,
  };
}

describe("gap engine", () => {
  it("识别两节课之间的空档并扣除缓冲", () => {
    const sessions = [
      session("高等数学", "教一 401", 1, 1, 2),
      session("大学英语", "教一 302", 1, 3, 4),
    ];
    const gaps = findDayGaps(sessions, periods);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].minutes).toBe(20);
    expect(gaps[0].walkMinutes).toBe(0);
    expect(gaps[0].usableMinutes).toBe(17);
  });

  it("跨楼栋步行时间进入可用时间计算", () => {
    const sessions = [
      session("高等数学", "教一 401", 2, 1, 2),
      session("大学英语", "外语楼 302", 2, 3, 4),
    ];
    const gap = findDayGaps(sessions, periods)[0];
    expect(gap.walkMinutes).toBe(4);
    expect(gap.walkKnown).toBe(true);
    expect(gap.usableMinutes).toBe(20 - 4 - 3);
  });

  it("同楼栋或空地点按规则估算步行", () => {
    expect(walkMinutes("教一 401", "教一 105")).toBe(0);
    expect(walkMinutes("", "教一 105")).toBe(5);
    expect(walkMinutes("不存在的楼 A", "教一 105")).toBe(6);
    expect(estimateWalk("教一 401", "外语楼 302").known).toBe(true);
    expect(extractBuilding("教一 401")).toBe("教一");
    expect(extractBuilding("物理实验中心 B")).toBe("物理实验中心");
  });

  it("最晚出发时间等于上课时间减步行与缓冲", () => {
    const next = session("大学英语", "外语楼 302", 3, 3, 4);
    const result = latestDeparture(next, periods, "教一 401");
    expect(sessionStartMinutes(next, periods)).toBe(600);
    expect(result.walkMinutes).toBe(4);
    expect(result.leaveBy).toBe(600 - 4 - 3);
    expect(result.leaveByLabel).toBe("09:53");
  });

  it("往返可行性给出最多可停留时间", () => {
    const feasible = checkRoundTrip(60, "教一 401", "图书馆 2F");
    expect(feasible.feasible).toBe(true);
    expect(feasible.maxStayMinutes).toBeGreaterThan(0);

    const tight = checkRoundTrip(8, "宿舍 3 栋", "体育场", DEFAULT_GAP_PREFERENCES);
    expect(tight.feasible).toBe(false);
    expect(tight.reason).toContain("太赶");
  });

  it("空档建议随时长变化", () => {
    expect(suggestGapActivities(3)[0].id).toBe("breathe");
    expect(suggestGapActivities(20).some((item) => item.id === "preview")).toBe(true);
    expect(suggestGapActivities(70).some((item) => item.id === "study")).toBe(true);
  });

  it("午饭空档可用时长与状态", () => {
    const sessions = [
      session("上午课", "教一 401", 1, 1, 4),
      session("下午课", "教三 201", 1, 5, 6),
    ];
    const result = assessLunch(sessions, periods);
    expect(result.status).toBe("available");
    expect(result.best?.minutes).toBe(110);
    expect(result.best?.start).toBe(11 * 60 + 40);
    expect(result.message).toContain("110 分钟");
  });

  it("午饭空档不足时给出 short 状态", () => {
    const tight = {
      ...DEFAULT_GAP_PREFERENCES,
      lunchStart: "11:40",
      lunchEnd: "12:10",
      lunchMinutes: 40,
    };
    const sessions = [
      session("上午课", "教一 401", 2, 1, 4),
      session("午间课", "教一 401", 2, 5, 6),
    ];
    expect(assessLunch(sessions, periods, tight).status).toBe("short");
  });

  it("时间轴连续覆盖下课与重新上课", () => {
    const sessions = [
      session("高等数学", "教一 401", 1, 1, 2),
      session("大学英语", "外语楼 302", 1, 3, 4),
    ];
    const timeline = buildDayTimeline(sessions, periods, DEFAULT_GAP_PREFERENCES, {
      start: "07:30",
      end: "12:00",
    });
    expect(timeline[0].kind).toBe("free");
    for (let index = 0; index < timeline.length - 1; index += 1) {
      expect(timeline[index].end).toBe(timeline[index + 1].start);
    }
    expect(timeline.some((entry) => entry.kind === "gap")).toBe(true);
    expect(timeline.some((entry) => entry.kind === "class")).toBe(true);
    expect(sessionEndMinutes(sessions[0], periods)).toBe(timeline[1].end);
  });

  it("偏好设置会做范围与顺序校验", () => {
    const prefs = normalizeGapPreferences({
      walkSpeed: 999,
      bufferMinutes: -3,
      lunchStart: "13:30",
      lunchEnd: "11:30",
      lunchMinutes: 10,
      lunchEnabled: false,
    });
    expect(prefs.walkSpeed).toBe(150);
    expect(prefs.bufferMinutes).toBe(0);
    expect(prefs.lunchEnd).toBe("13:30");
    expect(prefs.lunchEnabled).toBe(false);
  });
});
