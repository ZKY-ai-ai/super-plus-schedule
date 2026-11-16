import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearImportDraft,
  loadImportDraft,
  loadTemplates,
  normalizeSchedule,
  removeTemplate,
  saveImportDraft,
  saveTemplate,
} from "../lib/storage";
import { instantiateTemplate } from "../lib/templates";
import { createDemoSchedule, createInitialData } from "../lib/factory";

describe("v2 schedule normalization", () => {
  it("keeps every timetable, profile and event", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    data.timetables[0].events.push({
      id: "event-1",
      title: "交作业",
      date: "2026-11-13",
      allDay: true,
      start: "09:00",
      end: "10:00",
      note: "",
      tone: "teal",
      repeat: "weekly",
      repeatUntil: "2026-12-31",
      checkIns: ["2026-11-13", "not-a-date", "2026-11-13"],
      createdAt: "",
      updatedAt: "",
    });
    data.timetables[0].wallpaper = { preset: "custom", dataUrl: "data:image/jpeg;base64,abc", dim: 30 };
    const normalized = normalizeSchedule({ data });
    expect(normalized?.timetables).toHaveLength(1);
    expect(normalized?.timetables[0].events[0].title).toBe("交作业");
    expect(normalized?.timetables[0].events[0].repeat).toBe("weekly");
    expect(normalized?.timetables[0].events[0].repeatUntil).toBe("2026-12-31");
    expect(normalized?.timetables[0].events[0].checkIns).toEqual(["2026-11-13"]);
    expect(normalized?.timetables[0].wallpaper.preset).toBe("custom");
    expect(normalized?.periodProfiles).toHaveLength(2);
  });

  it("fills repeat defaults for legacy events without losing original fields", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    data.timetables[0].events.push({
      id: "legacy-event",
      title: "旧日程",
      date: "2026-11-14",
      allDay: false,
      start: "12:00",
      end: "13:00",
      note: "保留备注",
      tone: "plum",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
    } as never);
    const normalized = normalizeSchedule({ data });
    const event = normalized?.timetables[0].events.find((item) => item.id === "legacy-event");
    expect(event?.note).toBe("保留备注");
    expect(event?.tone).toBe("plum");
    expect(event?.repeat).toBe("none");
    expect(event?.repeatUntil).toBe("");
    expect(event?.checkIns).toEqual([]);
    expect(event?.createdAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("drops an end date earlier than the event date", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    data.timetables[0].events.push({
      id: "bad-until",
      title: "错误结束日期",
      date: "2026-11-14",
      allDay: false,
      start: "12:00",
      end: "13:00",
      note: "",
      tone: "teal",
      repeat: "daily",
      repeatUntil: "2026-11-01",
      checkIns: [],
      createdAt: "",
      updatedAt: "",
    });
    const normalized = normalizeSchedule({ data });
    expect(normalized?.timetables[0].events[0].repeatUntil).toBe("");
  });

  it("migrates a real v1 schedule and discards the old demo", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    const timetable = data.timetables[0];
    const legacyReal = {
      semester: timetable.semester,
      courses: timetable.courses,
      isDemo: false,
      updatedAt: timetable.updatedAt,
    };
    const migrated = normalizeSchedule(legacyReal);
    expect(migrated?.timetables[0].courses).toHaveLength(8);
    expect(migrated?.periodProfiles).toHaveLength(2);
    expect(migrated?.timetables[0].semester.startDate).toBe(timetable.semester.startDate);

    const demo = normalizeSchedule({ ...legacyReal, isDemo: true });
    expect(demo?.timetables[0].courses).toHaveLength(0);
  });

  it("normalizes explicit week selections", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    data.timetables[0].courses[0].slots[0].weeks = [1, 2, 3, 7];
    data.timetables[0].courses[0].slots[0].weekStart = 1;
    data.timetables[0].courses[0].slots[0].weekEnd = 7;
    const normalized = normalizeSchedule({ data });
    expect(normalized?.timetables[0].courses[0].slots[0].weeks).toEqual([1, 2, 3, 7]);
    expect(normalized?.timetables[0].courses[0].slots[0].weekEnd).toBe(7);
  });

  it("keeps a trimmed course alias and drops blank aliases", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    data.timetables[0].courses[0].alias = "  数构  ";
    data.timetables[0].courses[1].alias = "   ";
    const normalized = normalizeSchedule({ data });
    expect(normalized?.timetables[0].courses[0].alias).toBe("数构");
    expect(normalized?.timetables[0].courses[1].alias).toBeUndefined();
  });

  it("keeps valid custom calendar days and drops duplicates", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    data.timetables[0].calendarOverrides = [
      { id: "c1", date: "2026-11-20", kind: "holiday", name: "校庆" },
      { id: "c2", date: "2026-11-20", kind: "workday", name: "重复" },
      { id: "c3", date: "2026-11-22", kind: "workday", name: "" },
      { id: "c4", date: "not-a-date", kind: "holiday", name: "错误" },
    ];
    const normalized = normalizeSchedule({ data });
    expect(normalized?.timetables[0].calendarOverrides).toEqual([
      { id: "c1", date: "2026-11-20", kind: "holiday", name: "校庆" },
      { id: "c3", date: "2026-11-22", kind: "workday", name: "补课日" },
    ]);
  });

  it("keeps at least two period profiles and one timetable", () => {
    const normalized = normalizeSchedule({
      version: 2,
      activeTimetableId: "missing",
      periodProfiles: [{ id: "only", name: "唯一方案", periods: [] }],
      timetables: [],
    });
    expect(normalized?.periodProfiles.length).toBeGreaterThanOrEqual(2);
    expect(normalized?.timetables).toHaveLength(1);
    expect(normalized?.activeTimetableId).toBe(normalized?.timetables[0].id);
    expect(createInitialData().periodProfiles).toHaveLength(2);
  });

  it("normalizes the week start day and re-aligns the start date", () => {
    const mondayStart = createDemoSchedule(new Date(2026, 10, 12));
    mondayStart.timetables[0].semester.startDate = "2026-11-09";
    mondayStart.timetables[0].semester.weekStartsOn = 7;
    const normalized = normalizeSchedule({ data: mondayStart });
    expect(normalized?.timetables[0].semester.weekStartsOn).toBe(7);
    expect(normalized?.timetables[0].semester.startDate).toBe("2026-11-08");

    mondayStart.timetables[0].semester.weekStartsOn = 9 as number;
    const clamped = normalizeSchedule({ data: mondayStart });
    expect(clamped?.timetables[0].semester.weekStartsOn).toBe(7);
    expect(clamped?.timetables[0].semester.startDate).toBe("2026-11-08");
  });
});

describe("import drafts", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a draft and drops embedded wallpaper images", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    data.timetables[0].wallpaper = {
      preset: "custom",
      dataUrl: "data:image/png;base64,abc",
      dim: 20,
    };
    const saved = saveImportDraft({
      id: "draft-1",
      fileName: "我的备份.json",
      createdAt: "2026-11-16T10:00:00.000Z",
      data,
      message: "已读取 1 套课表。",
    });
    expect(saved?.data.timetables[0].wallpaper.dataUrl).toBe("");
    expect(saved?.data.timetables[0].wallpaper.preset).toBe("paper");

    const loaded = loadImportDraft();
    expect(loaded?.fileName).toBe("我的备份.json");
    expect(loaded?.data.timetables[0].courses.length).toBeGreaterThan(0);

    clearImportDraft();
    expect(loadImportDraft()).toBeNull();
  });
});

describe("course templates", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the current course set and reloads it", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    const active = data.timetables[0];
    const template = saveTemplate("我的模板", active.courses, active.semester.totalWeeks);
    expect(template?.courses).toHaveLength(active.courses.length);

    const templates = loadTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("我的模板");
    expect(templates[0].totalWeeks).toBe(active.semester.totalWeeks);

    removeTemplate(templates[0].id);
    expect(loadTemplates()).toHaveLength(0);
  });

  it("rejects empty course sets", () => {
    expect(saveTemplate("空模板", [], 20)).toBeNull();
    expect(loadTemplates()).toHaveLength(0);
  });

  it("clamps slots to the target semester when instantiated", () => {
    const data = createDemoSchedule(new Date(2026, 10, 12));
    const template = saveTemplate("我的模板", data.timetables[0].courses, 20);
    expect(template).not.toBeNull();
    const semester = {
      ...data.timetables[0].semester,
      totalWeeks: 16,
      periods: data.timetables[0].semester.periods.slice(0, 8),
    };
    const courses = instantiateTemplate(template!, semester);
    expect(courses).toHaveLength(template!.courses.length);
    for (const course of courses) {
      expect(course.slots.length).toBeGreaterThan(0);
      for (const slot of course.slots) {
        expect(slot.end).toBeLessThanOrEqual(8);
        expect(slot.weekStart).toBeGreaterThanOrEqual(1);
        expect(slot.weekEnd).toBeLessThanOrEqual(16);
        expect(slot.weekStart).toBeLessThanOrEqual(slot.weekEnd);
      }
    }
    expect(courses[0].id).not.toBe(template!.courses[0].id);
    expect(courses[0].slots[0].id).not.toBe(template!.courses[0].slots[0].id);
  });
});
