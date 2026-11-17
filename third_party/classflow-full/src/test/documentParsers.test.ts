import { describe, expect, it } from "vitest";
import { docxTablesFromXml, docxXmlToText } from "../lib/docx";
import { pdfItemsToRows, pdfRowsToText } from "../lib/pdf";

describe("docx parser", () => {
  it("keeps paragraphs, tabs, line breaks and table rows in order", () => {
    const xml = [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      "<w:body>",
      '<w:p><w:r><w:t>课表</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>第 1 周</w:t></w:r></w:p>',
      "<w:p><w:r><w:t>第一行</w:t></w:r><w:br/><w:r><w:t>第二行</w:t></w:r></w:p>",
      '<w:p><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:t>正文</w:t></w:r></w:p>',
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>课程</w:t></w:r></w:p></w:tc>",
      "<w:tc><w:p><w:r><w:t>星期</w:t></w:r></w:p></w:tc></w:tr>",
      "<w:tr><w:tc><w:p><w:r><w:t>高数</w:t></w:r></w:p></w:tc>",
      "<w:tc><w:p><w:r><w:t>周一</w:t></w:r></w:p></w:tc></w:tr></w:tbl>",
      "</w:body></w:document>",
    ].join("");

    const text = docxXmlToText(xml);
    expect(text).toContain("课表\t第 1 周");
    expect(text).toContain("第一行\n第二行");
    expect(text).toContain("正文");
    expect(text).not.toContain("PAGE");
    expect(text).toContain("课程 | 星期");
    expect(text).toContain("高数 | 周一");

    const tables = docxTablesFromXml(xml);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toEqual([
      ["课程", "星期"],
      ["高数", "周一"],
    ]);
  });
});

describe("pdf layout", () => {
  const item = (str: string, x: number, y: number, width?: number) => ({
    str,
    transform: [10, 0, 0, 10, x, y],
    width: width ?? str.length * 6,
    height: 10,
  });

  it("groups items into rows and columns by coordinates", () => {
    const rows = pdfItemsToRows([
      item("课程名称", 40, 700),
      item("星期", 160, 700),
      item("节次", 240, 700),
      item("高等数学", 40, 680),
      item("周一", 160, 680),
      item("1-2节", 240, 680),
      item("大学英语", 40, 660),
      item("周三", 160, 660),
      item("5-6节", 240, 660),
    ]);
    expect(rows[0]).toEqual(["课程名称", "星期", "节次"]);
    expect(rows[1]).toEqual(["高等数学", "周一", "1-2节"]);
    expect(rows[2]).toEqual(["大学英语", "周三", "5-6节"]);
    expect(pdfRowsToText(rows)).toContain("高等数学 | 周一 | 1-2节");
  });

  it("joins adjacent fragments without inserting spaces into Chinese", () => {
    const rows = pdfItemsToRows([
      { str: "高等", transform: [10, 0, 0, 10, 40, 500], width: 20, height: 10 },
      { str: "数学", transform: [10, 0, 0, 10, 60, 500], width: 20, height: 10 },
    ]);
    expect(rows).toEqual([["高等数学"]]);
  });

  it("ignores marked-content items without text", () => {
    expect(pdfItemsToRows([{ type: "beginMarkedContent" }, null, 3])).toEqual([]);
  });

  it("splits cells on the wide whitespace runs table exporters emit", () => {
    const fill = (x: number, y: number, width: number) => ({
      str: " ",
      transform: [10, 0, 0, 10, x, y],
      width,
      height: 10,
    });
    const rows = pdfItemsToRows([
      item("星期", 40, 700, 20),
      fill(60, 700, 100),
      item("课程", 160, 700, 20),
      item("星期一", 40, 680, 30),
      fill(70, 680, 90),
      item("微积分II（上）", 160, 680, 60),
    ]);
    expect(rows[0]).toEqual(["星期", "课程"]);
    expect(rows[1]).toEqual(["星期一", "微积分II（上）"]);
  });
});
