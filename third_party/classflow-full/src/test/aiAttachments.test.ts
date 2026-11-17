import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  attachmentImages,
  buildAttachmentPromptBlock,
  classifyAttachment,
  courseSeedsToText,
  detectDelimiter,
  extractAiAttachment,
  parseDelimitedText,
  type AiAttachment,
} from "../lib/aiAttachments";
import { parseCourseText } from "../lib/textImport";

function loadFixtureFile(): File {
  const data = readFileSync(resolve(__dirname, "fixtures/course-table.xlsx"));
  const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  return new File([bytes], "course-table.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function loadPrefixedFixtureFile(): File {
  const data = readFileSync(resolve(__dirname, "fixtures/prefixed-course-table.xlsx"));
  const bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  return new File([bytes], "prefixed-course-table.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildStoredZip(entries: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centrals.length, true);
  endView.setUint16(10, centrals.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const output = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

function loadDocxFile(): File {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    "<w:body>",
    "<w:p><w:r><w:t>2026 秋季课表</w:t></w:r></w:p>",
    "<w:tbl>",
    "<w:tr>",
    "<w:tc><w:p><w:r><w:t>课程名称</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>星期</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>节次</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>周次</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>教室</w:t></w:r></w:p></w:tc>",
    "</w:tr>",
    "<w:tr>",
    "<w:tc><w:p><w:r><w:t>高等数学</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>周一</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>1-2节</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>1-16周</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>教一401</w:t></w:r></w:p></w:tc>",
    "</w:tr>",
    "<w:tr>",
    "<w:tc><w:p><w:r><w:t>大学英语</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>周三</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>5-6节</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>1-16周</w:t></w:r></w:p></w:tc>",
    "<w:tc><w:p><w:r><w:t>外语楼302</w:t></w:r></w:p></w:tc>",
    "</w:tr>",
    "</w:tbl>",
    "<w:p><w:r><w:t>备注：以教务系统为准</w:t></w:r></w:p>",
    "</w:body>",
    "</w:document>",
  ].join("");
  const zip = buildStoredZip({ "word/document.xml": xml });
  return new File([zip.buffer as ArrayBuffer], "课表.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function buildIcs(events: Array<{ title: string; date: string; start: string; end: string; location?: string; note?: string }>): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//CN"];
  events.forEach((event, index) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:e${index}@test`,
      `DTSTART:${event.date.replace(/-/g, "")}T${event.start.replace(":", "")}00`,
      `DTEND:${event.date.replace(/-/g, "")}T${event.end.replace(":", "")}00`,
      `SUMMARY:${event.title}`,
      ...(event.location ? [`LOCATION:${event.location}`] : []),
      ...(event.note ? [`DESCRIPTION:${event.note}`] : []),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

describe("attachment classification", () => {
  it("detects images, spreadsheets, text and unsupported files", () => {
    expect(classifyAttachment("课表.png", "image/png")).toBe("image");
    expect(classifyAttachment("课表.jpg")).toBe("image");
    expect(classifyAttachment("课表.xlsx")).toBe("spreadsheet");
    expect(classifyAttachment("选课.csv", "text/csv")).toBe("spreadsheet");
    expect(classifyAttachment("笔记.md", "text/markdown")).toBe("text");
    expect(classifyAttachment("备份.json")).toBe("text");
    expect(classifyAttachment("讲义.pdf", "application/pdf")).toBe("document");
    expect(classifyAttachment("课表.docx")).toBe("document");
    expect(classifyAttachment("旧表.xls")).toBe("unsupported");
    expect(classifyAttachment("旧讲义.doc")).toBe("unsupported");
  });

  it("parses quoted delimited rows", () => {
    expect(detectDelimiter("课程,星期,节次\n高数,周一,1-2")).toBe(",");
    expect(detectDelimiter("课程\t星期\t节次\n高数\t周一\t1-2")).toBe("\t");
    expect(parseDelimitedText('课程,说明\n高数,"A,B 班"\n')).toEqual([
      ["课程", "说明"],
      ["高数", "A,B 班"],
    ]);
  });
});

describe("attachment extraction", () => {
  it("extracts course drafts from an xlsx timetable", async () => {
    const attachment = await extractAiAttachment(loadFixtureFile(), { totalWeeks: 20 });
    expect(attachment.status).toBe("ready");
    expect(attachment.kind).toBe("spreadsheet");
    expect(attachment.courseSeeds).toHaveLength(3);
    expect(attachment.courseSeeds?.map((course) => course.name).sort()).toEqual([
      "大学物理",
      "英语",
      "高等数学",
    ].sort());
    expect(attachment.summary).toContain("识别到 3 门课程");
    expect(attachment.text).toContain("工作表「课表」");

    const parsed = parseCourseText(courseSeedsToText(attachment.courseSeeds ?? []), 20);
    expect(parsed.courses).toHaveLength(3);
  });

  it("reads xlsx files that use namespace-prefixed tags", async () => {
    const attachment = await extractAiAttachment(loadPrefixedFixtureFile(), { totalWeeks: 20 });
    expect(attachment.status).toBe("ready");
    expect(attachment.kind).toBe("spreadsheet");
    expect(attachment.courseSeeds?.map((course) => course.name).sort()).toEqual([
      "微积分II（上）",
      "工程制图（上）",
      "羽毛球初级",
    ].sort());
    expect(attachment.summary).toContain("识别到 3 门课程");
    expect(attachment.text).toContain("微积分II（上）");
  });

  it("summarizes every ICS event instead of truncating the raw file", async () => {
    const events = [];
    const firstDate = new Date(Date.UTC(2026, 8, 7));
    for (let week = 2; week <= 18; week += 1) {
      const date = new Date(firstDate.getTime() + (week - 2) * 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      events.push({
        title: `第1-2节 微积分II（上）（第${week}周）`,
        date,
        start: "08:30",
        end: "10:10",
        location: "教东D1-403",
        note: `第${week}周；第1-2节\\n教师：韩军强\\n周次规则：2~18周`,
      });
      events.push({
        title: `第9-10节 工程制图（上）（第${week}周）`,
        date,
        start: "19:00",
        end: "20:40",
        location: "教西C2-304",
        note: `第${week}周；第9-10节\\n教师：佟瑞庭`,
      });
    }
    const ics = buildIcs(events);
    const attachment = await extractAiAttachment(
      new File([ics], "我的课表.ics", { type: "text/calendar" }),
      { totalWeeks: 20 },
    );
    expect(attachment.status).toBe("ready");
    expect(attachment.kind).toBe("text");
    expect(attachment.summary).toContain("34 个日程");
    expect(attachment.summary).toContain("归并为 2 组");
    expect(attachment.text).toContain("微积分II（上）");
    expect(attachment.text).toContain("工程制图（上）");
    expect(attachment.text).toContain("第2-18周");
    expect(attachment.text).toContain("教师：韩军强");
  });

  it("extracts course drafts from a CSV table", async () => {
    const csv = [
      "课程名称,星期,节次,周次,教室",
      "线性代数,周二,3-4节,1-8,教二201",
      "大学英语,周四,5-6节,1-16,外语楼302",
    ].join("\n");
    const attachment = await extractAiAttachment(
      new File([csv], "选课.csv", { type: "text/csv" }),
      { totalWeeks: 20 },
    );
    expect(attachment.status).toBe("ready");
    expect(attachment.kind).toBe("spreadsheet");
    expect(attachment.courseSeeds?.map((course) => course.name)).toEqual([
      "线性代数",
      "大学英语",
    ]);
  });

  it("extracts course drafts from a Word table", async () => {
    const attachment = await extractAiAttachment(loadDocxFile(), { totalWeeks: 20 });
    expect(attachment.status).toBe("ready");
    expect(attachment.kind).toBe("document");
    expect(attachment.courseSeeds?.map((course) => course.name).sort()).toEqual([
      "大学英语",
      "高等数学",
    ].sort());
    expect(attachment.summary).toContain("Word 文档");
    expect(attachment.summary).toContain("识别到 2 门课程");
    expect(attachment.text).toContain("2026 秋季课表");
    expect(attachment.text).toContain("备注：以教务系统为准");
  });

  it("recognizes timetable lines in plain text", async () => {
    const text = [
      "高等数学 周一 第1-2节 教一401 1-16周",
      "大学英语 @李老师 周三 第5-6节 1-16周 单周",
    ].join("\n");
    const attachment = await extractAiAttachment(
      new File([text], "课表.txt", { type: "text/plain" }),
      { totalWeeks: 20 },
    );
    expect(attachment.status).toBe("ready");
    expect(attachment.kind).toBe("text");
    expect(attachment.courseSeeds).toHaveLength(2);
    expect(attachment.summary).toContain("识别到 2 门课程");
  });

  it("reports unsupported or empty files instead of throwing", async () => {
    const doc = await extractAiAttachment(new File([new Uint8Array([1, 2, 3])], "旧讲义.doc"));
    expect(doc.status).toBe("error");
    expect(doc.error).toContain("另存为 .docx");

    const empty = await extractAiAttachment(new File([], "空.txt", { type: "text/plain" }));
    expect(empty.status).toBe("error");
    expect(empty.error).toContain("空");
  });
});

describe("attachment prompt", () => {
  const attachment: AiAttachment = {
    id: "a1",
    name: "课表.xlsx",
    size: 1024,
    mime: "",
    kind: "spreadsheet",
    status: "ready",
    summary: "识别到 2 门课程",
    text: "课程 | 星期\n高数 | 周一",
    courseSeeds: [],
  };

  it("keeps the prompt under budget and includes the user message", () => {
    const block = buildAttachmentPromptBlock([attachment], "把这些课导入", 900);
    expect(block.length).toBeLessThanOrEqual(900);
    expect(block).toContain("【本轮附件");
    expect(block).toContain("课表.xlsx");
    expect(block).toContain("【附件使用要求】");
    expect(block).toContain("【用户消息】");
    expect(block).toContain("把这些课导入");
  });

  it("returns only the user text when no attachment is ready", () => {
    expect(
      buildAttachmentPromptBlock(
        [{ ...attachment, status: "error", error: "读取失败" }],
        "你好",
      ),
    ).toBe("你好");
  });

  it("collects only ready image data URLs", () => {
    const image: AiAttachment = {
      ...attachment,
      id: "a2",
      kind: "image",
      imageDataUrl: "data:image/png;base64,AAAA",
    };
    const pending: AiAttachment = {
      ...image,
      id: "a3",
      status: "reading",
      imageDataUrl: "data:image/png;base64,BBBB",
    };
    expect(attachmentImages([image, pending])).toEqual(["data:image/png;base64,AAAA"]);
  });
});