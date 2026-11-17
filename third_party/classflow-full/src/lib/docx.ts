import { decodeXmlEntities, readZipEntries } from "./xlsx";

export interface DocxContent {
  text: string;
  tables: string[][][];
}

// WordprocessingML 的标签带 w: 前缀，个别生成器会省略。
const TAG = String.raw`(?:[A-Za-z_][\w.-]*:)?`;

const TABLE_BLOCK = new RegExp(
  `<${TAG}tbl\\b[^>]*>([\\s\\S]*?)<\\/${TAG}tbl>`,
  "g",
);
const ROW_BLOCK = new RegExp(
  `<${TAG}tr\\b[^>]*>([\\s\\S]*?)<\\/${TAG}tr>`,
  "g",
);
const CELL_BLOCK = new RegExp(
  `<${TAG}tc\\b[^>]*>([\\s\\S]*?)<\\/${TAG}tc>`,
  "g",
);
const PARAGRAPH_BLOCK = new RegExp(
  `<${TAG}p\\b[^>]*?\\/>|<${TAG}p\\b[^>]*>([\\s\\S]*?)<\\/${TAG}p>`,
  "g",
);
const INLINE_TOKEN = new RegExp(
  `<${TAG}t\\b[^>]*?\\/>|<${TAG}t\\b[^>]*>([\\s\\S]*?)<\\/${TAG}t>|<${TAG}tab\\b[^>]*?\\/>|<${TAG}br\\b[^>]*?\\/>|<${TAG}cr\\b[^>]*?\\/>`,
  "g",
);
const FIELD_CODE = new RegExp(
  `<${TAG}instrText\\b[^>]*>[\\s\\S]*?<\\/${TAG}instrText>`,
  "g",
);
const DELETED_RUN = new RegExp(
  `<${TAG}del\\b[^>]*>[\\s\\S]*?<\\/${TAG}del>`,
  "g",
);

function paragraphText(inner: string): string {
  const cleaned = inner.replace(FIELD_CODE, "").replace(DELETED_RUN, "");
  let text = "";
  for (const match of cleaned.matchAll(INLINE_TOKEN)) {
    const token = match[0];
    if (match[1] !== undefined) {
      text += decodeXmlEntities(match[1]);
    } else if (/<[A-Za-z_][\w.-]*:tab\b/i.test(token)) {
      text += "\t";
    } else if (/<(?:[A-Za-z_][\w.-]*:)?(?:br|cr)\b/i.test(token)) {
      text += "\n";
    }
  }
  return text.replace(/[ \t]+\n/g, "\n").trim();
}

function paragraphLines(xml: string): string[] {
  const lines: string[] = [];
  for (const match of xml.matchAll(PARAGRAPH_BLOCK)) {
    const text = paragraphText(match[1] ?? "");
    if (text) lines.push(text);
  }
  return lines;
}

function tableRows(xml: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(ROW_BLOCK)) {
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(CELL_BLOCK)) {
      const cellText = paragraphLines(cellMatch[1] ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      cells.push(cellText);
    }
    if (cells.some((cell) => cell)) rows.push(cells);
  }
  return rows;
}

function walkDocument(xml: string): { lines: string[]; tables: string[][][] } {
  const lines: string[] = [];
  const tables: string[][][] = [];
  let cursor = 0;
  for (const match of xml.matchAll(TABLE_BLOCK)) {
    const index = match.index ?? 0;
    lines.push(...paragraphLines(xml.slice(cursor, index)));
    const rows = tableRows(match[1] ?? "");
    if (rows.length > 0) {
      tables.push(rows);
      for (const row of rows) lines.push(row.join(" | "));
    }
    cursor = index + match[0].length;
  }
  lines.push(...paragraphLines(xml.slice(cursor)));
  return { lines, tables };
}

export function docxXmlToText(xml: string): string {
  return walkDocument(xml).lines.join("\n");
}

export function docxTablesFromXml(xml: string): string[][][] {
  return walkDocument(xml).tables;
}

export async function readDocx(buffer: ArrayBuffer): Promise<DocxContent> {
  const entries = await readZipEntries(buffer, "docx");
  const document = entries.get("word/document.xml");
  if (!document) throw new Error("这个 Word 文件里没有正文内容。");
  const xml = new TextDecoder("utf-8").decode(document);
  const { lines, tables } = walkDocument(xml);
  return { text: lines.join("\n"), tables };
}
