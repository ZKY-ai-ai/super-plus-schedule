/**
 * 丁 · 测试基建
 *
 * 笔记与 AI 模块都会读写本地存储。为了在 node 环境下做纯函数测试，
 * 这里提供一个符合 Storage 接口的内存实现，通过依赖注入传给模块，
 * 测试之间互不污染，也不需要 jsdom。
 */
export interface MemoryStorage extends Storage {
  snapshot(): Record<string, string>;
}

export function createMemoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const entries = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.has(key) ? (entries.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(entries);
    },
  };
}

/** 固定时钟，避免测试受当前时间影响。 */
export function fixedNow(iso = "2026-11-16T08:30:00+08:00"): () => Date {
  const value = new Date(iso);
  return () => new Date(value.getTime());
}
