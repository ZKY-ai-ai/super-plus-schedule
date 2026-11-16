import { describe, expect, it } from "vitest";
import {
  decodeShare,
  encodeShare,
  normalizeShare,
  rankShares,
  shareScore,
  shareToText,
  type WeeklyShare,
} from "../lib/share";

function share(patch: Partial<WeeklyShare> = {}): WeeklyShare {
  return {
    id: "me",
    name: "小林",
    week: 8,
    term: "2026 秋季学期",
    courseCount: 6,
    classMinutes: 720,
    studyMinutes: 300,
    tasksDone: 4,
    createdAt: "2026-11-16T10:00:00.000Z",
    ...patch,
  };
}

describe("周报分享口令", () => {
  it("编码后可以完整还原中文昵称与数据", () => {
    const original = share();
    const decoded = decodeShare(encodeShare(original));
    expect(decoded).not.toBeNull();
    expect(decoded?.name).toBe("小林");
    expect(decoded?.week).toBe(8);
    expect(decoded?.studyMinutes).toBe(300);
    expect(decoded?.term).toBe("2026 秋季学期");
  });

  it("拒绝空串、随意文本和错误前缀", () => {
    expect(decodeShare("")).toBeNull();
    expect(decodeShare("随便一段话")).toBeNull();
    expect(decodeShare("KEXUSHARE1:not-base64")).toBeNull();
  });

  it("规范化时裁剪越界数值并补齐昵称", () => {
    const normalized = normalizeShare({ week: 999, studyMinutes: -5, name: "" });
    expect(normalized?.week).toBe(60);
    expect(normalized?.studyMinutes).toBe(0);
    expect(normalized?.name).toBe("同学");
  });
});

describe("周报排行", () => {
  it("专注分综合自习、待办与课时", () => {
    expect(shareScore(share({ studyMinutes: 120, tasksDone: 2, classMinutes: 600 }))).toBe(240);
  });

  it("按专注分从高到低排序，同分时自习多者在前", () => {
    const a = share({ id: "a", name: "A", studyMinutes: 300, tasksDone: 0, classMinutes: 0 });
    const b = share({ id: "b", name: "B", studyMinutes: 250, tasksDone: 2, classMinutes: 0 });
    const c = share({ id: "c", name: "C", studyMinutes: 300, tasksDone: 0, classMinutes: 0 });
    expect(rankShares([b, a, c]).map((item) => item.id)).toEqual(["a", "c", "b"]);
  });

  it("分享文案包含周次、昵称和口令", () => {
    const text = shareToText(share(), "KEXUSHARE1:abc");
    expect(text).toContain("第 8 周");
    expect(text).toContain("小林");
    expect(text).toContain("KEXUSHARE1:abc");
  });
});
