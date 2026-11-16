import { describe, expect, it } from "vitest";
import {
  buildCourseShareLink,
  decodeCourseShare,
  encodeCourseShare,
  readCourseShareFromHash,
} from "../lib/courseShare";

const SAMPLE = "高等数学 周一 第1-2节 1-16周 地点：教一401 @张老师";

describe("course share links", () => {
  it("encodes and decodes timetable text", () => {
    const code = encodeCourseShare(SAMPLE);
    expect(code.startsWith("KEXUCOURSE1:")).toBe(true);
    expect(decodeCourseShare(code)).toBe(SAMPLE);
  });

  it("builds a link and reads it back from the hash", () => {
    const link = buildCourseShareLink("https://example.com/app/", SAMPLE);
    expect(link.startsWith("https://example.com/app/#course=")).toBe(true);
    const hash = new URL(link).hash;
    expect(readCourseShareFromHash(hash)).toBe(SAMPLE);
  });

  it("keeps other hashes intact when appending course data", () => {
    const link = buildCourseShareLink("https://example.com/app#old", SAMPLE);
    expect(link).not.toContain("#old");
    expect(readCourseShareFromHash(new URL(link).hash)).toBe(SAMPLE);
  });

  it("rejects malformed or oversized codes", () => {
    expect(decodeCourseShare("")).toBeNull();
    expect(decodeCourseShare("KEXUCOURSE1:not-base64!")).toBeNull();
    expect(decodeCourseShare("KEXUSHARE1:abc")).toBeNull();
    expect(readCourseShareFromHash("#course=%E0%A4%A")).toBeNull();
    expect(readCourseShareFromHash("#other=1")).toBeNull();
  });
});
