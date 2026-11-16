import { describe, expect, it } from "vitest";
import {
  SPEED_WINDOW_MS,
  WOODFISH_STORAGE_KEY,
  countTapsInWindow,
  emptyWoodfish,
  loadWoodfish,
  pruneTaps,
  rollWoodfishDay,
  saveWoodfish,
  tapSpeed,
  tapWoodfish,
  type StorageLike,
} from "../lib/woodfish";

function memoryStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(WOODFISH_STORAGE_KEY, initial);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const DAY = new Date(2026, 10, 16, 9, 30);
const NEXT_DAY = new Date(2026, 10, 17, 0, 5);

describe("tapWoodfish", () => {
  it("counts a tap in both the lifetime and today's totals", () => {
    const once = tapWoodfish(emptyWoodfish(DAY), DAY);
    const twice = tapWoodfish(once, DAY);
    expect(twice.total).toBe(2);
    expect(twice.dayCount).toBe(2);
    expect(twice.day).toBe("2026-11-16");
  });

  it("keeps the lifetime total but resets today's count after midnight", () => {
    let stats = emptyWoodfish(DAY);
    for (let i = 0; i < 3; i++) stats = tapWoodfish(stats, DAY);
    const nextDay = tapWoodfish(stats, NEXT_DAY);
    expect(nextDay.total).toBe(4);
    expect(nextDay.dayCount).toBe(1);
    expect(nextDay.day).toBe("2026-11-17");
  });

  it("keeps the sound preference across days", () => {
    const muted = { ...emptyWoodfish(DAY), soundOn: false };
    expect(tapWoodfish(muted, NEXT_DAY).soundOn).toBe(false);
  });
});

describe("rollWoodfishDay", () => {
  it("returns the same object within one day", () => {
    const stats = tapWoodfish(emptyWoodfish(DAY), DAY);
    expect(rollWoodfishDay(stats, DAY)).toBe(stats);
  });

  it("only clears today's count when the day changes", () => {
    const stats = { total: 12, day: "2026-11-16", dayCount: 5, soundOn: true };
    expect(rollWoodfishDay(stats, NEXT_DAY)).toEqual({
      total: 12,
      day: "2026-11-17",
      dayCount: 0,
      soundOn: true,
    });
  });
});

describe("loadWoodfish", () => {
  it("starts fresh without storage or saved data", () => {
    expect(loadWoodfish(null, DAY)).toEqual(emptyWoodfish(DAY));
    expect(loadWoodfish(memoryStorage(), DAY)).toEqual(emptyWoodfish(DAY));
  });

  it("restores saved totals", () => {
    const storage = memoryStorage(
      JSON.stringify({ total: 42, day: "2026-11-16", dayCount: 9, soundOn: false }),
    );
    expect(loadWoodfish(storage, DAY)).toEqual({
      total: 42,
      day: "2026-11-16",
      dayCount: 9,
      soundOn: false,
    });
  });

  it("clears today's count when the saved day is stale", () => {
    const storage = memoryStorage(JSON.stringify({ total: 42, day: "2026-11-15", dayCount: 9 }));
    expect(loadWoodfish(storage, DAY)).toEqual({
      total: 42,
      day: "2026-11-16",
      dayCount: 0,
      soundOn: true,
    });
  });

  it("repairs corrupt or impossible values", () => {
    const corrupt = memoryStorage("{not json");
    expect(loadWoodfish(corrupt, DAY)).toEqual(emptyWoodfish(DAY));

    const weird = memoryStorage(
      JSON.stringify({ total: -3, day: 42, dayCount: 99.9, soundOn: "yes" }),
    );
    expect(loadWoodfish(weird, DAY)).toEqual(emptyWoodfish(DAY));

    const overflow = memoryStorage(JSON.stringify({ total: 2, day: "2026-11-16", dayCount: 8 }));
    expect(loadWoodfish(overflow, DAY).dayCount).toBe(2);
  });
});

describe("saveWoodfish", () => {
  it("writes the record under the woodfish key", () => {
    const storage = memoryStorage();
    const stats = { total: 7, day: "2026-11-16", dayCount: 3, soundOn: true };
    saveWoodfish(stats, storage);
    expect(storage.data.get(WOODFISH_STORAGE_KEY)).toBe(JSON.stringify(stats));
  });

  it("stays quiet when storage is unavailable", () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    expect(() => saveWoodfish(emptyWoodfish(DAY), failing)).not.toThrow();
    expect(() => saveWoodfish(emptyWoodfish(DAY), null)).not.toThrow();
  });
});

describe("tapSpeed", () => {
  const now = 1_000_000;

  it("counts only taps inside the window", () => {
    const taps = [now, now - 500, now - 1000, now - SPEED_WINDOW_MS - 1];
    expect(countTapsInWindow(taps, now)).toBe(3);
  });

  it("handles unsorted timestamps", () => {
    const taps = [now - 1200, now, now - 300];
    expect(countTapsInWindow(taps, now)).toBe(3);
  });

  it("turns a burst into taps per second", () => {
    expect(tapSpeed([now], now)).toBe(0.7);
    expect(tapSpeed([now, now - 100], now)).toBe(1.3);
    expect(tapSpeed([now, now - 100, now - 200], now)).toBe(2);
    expect(tapSpeed([now, now - 100, now - 200, now - 300], now)).toBe(2.7);
  });

  it("decays to zero after the window slides past", () => {
    const taps = [now, now - 200];
    expect(tapSpeed(taps, now)).toBe(1.3);
    expect(tapSpeed(pruneTaps(taps, now + SPEED_WINDOW_MS + 1), now + SPEED_WINDOW_MS + 1)).toBe(0);
  });

  it("ignores invalid input", () => {
    expect(tapSpeed([Number.NaN, Infinity], now)).toBe(0);
    expect(tapSpeed([now], now, 0)).toBe(0);
    expect(countTapsInWindow([now], now, -1)).toBe(0);
    expect(pruneTaps([now], now, 0)).toEqual([]);
  });
});
