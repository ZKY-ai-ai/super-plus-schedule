export interface XlsxSheet {
  name: string;
  rows: string[][];
}

const MAX_ROWS = 4000;
const MAX_COLS = 80;

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (u32(bytes, index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 xlsx 文件。");
  const count = u16(bytes, eocd + 10);
  let cursor = u32(bytes, eocd + 16);
  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder("utf-8");
  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) break;
    const method = u16(bytes, cursor + 10);
    const compressedSize = u32(bytes, cursor + 20);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const localOffset = u32(bytes, cursor + 42);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (u32(bytes, localOffset) === 0x04034b50) {
      const localNameLength = u16(bytes, localOffset + 26);
      const localExtraLength = u16(bytes, localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(start, start + compressedSize);
      if (method === 0) entries.set(name, raw);
      else if (method === 8) entries.set(name, await inflateRaw(raw));
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : "";
}

// Excel 生成器有的不写前缀（<row>），有的写命名空间前缀（<x:row>）。
const TAG = String.raw`(?:[A-Za-z_][\w.-]*:)?`;

function collectText(xml: string): string {
  let text = "";
  for (const match of xml.matchAll(new RegExp(`<${TAG}t\\b[^>]*>([\\s\\S]*?)<\\/${TAG}t>`, "g"))) {
    text += decodeEntities(match[1]);
  }
  return text;
}

function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  for (const match of xml.matchAll(new RegExp(`<${TAG}si\\b[^>]*>([\\s\\S]*?)<\\/${TAG}si>`, "g"))) {
    result.push(collectText(match[1]));
  }
  return result;
}

function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let value = 0;
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, value - 1);
}

function cellValue(attrs: string, inner: string, shared: string[]): string {
  const type = attr(attrs, "t");
  if (type === "inlineStr") return collectText(inner);
  const value = inner.match(new RegExp(`<${TAG}v\\b[^>]*>([\\s\\S]*?)<\\/${TAG}v>`))?.[1];
  if (value === undefined) return "";
  const decoded = decodeEntities(value);
  if (type === "s") return shared[Number(decoded)] ?? "";
  return decoded;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let fallbackRow = 0;
  const rowPattern = new RegExp(
    `<${TAG}row\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${TAG}row>)`,
    "g",
  );
  const cellPattern = new RegExp(
    `<${TAG}c\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${TAG}c>)`,
    "g",
  );
  for (const rowMatch of xml.matchAll(rowPattern)) {
    const rowAttr = rowMatch[1] ?? "";
    const inner = rowMatch[2] ?? "";
    const rowNumber = Number(attr(rowAttr, "r"));
    const rowIndex = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : fallbackRow;
    fallbackRow = rowIndex + 1;
    if (rowIndex >= MAX_ROWS) break;
    const cells: string[] = [];
    let fallbackCol = 0;
    for (const cellMatch of inner.matchAll(cellPattern)) {
      const cellAttr = cellMatch[1] ?? "";
      const value = cellValue(cellAttr, cellMatch[2] ?? "", shared);
      const ref = attr(cellAttr, "r");
      const col = ref ? columnIndex(ref) : fallbackCol;
      fallbackCol = col + 1;
      if (col >= MAX_COLS) continue;
      cells[col] = value.trim();
    }
    const row = Array.from({ length: cells.length }, (_, index) => cells[index] ?? "");
    if (row.some((cell) => cell !== "")) rows[rowIndex] = row;
  }
  return Array.from({ length: rows.length }, (_, index) => rows[index] ?? []);
}

function sheetTargets(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of relsXml.matchAll(new RegExp(`<${TAG}Relationship\\b[^>]*?\\/?>`, "g"))) {
    const tag = match[0];
    const id = attr(tag, "Id");
    let target = attr(tag, "Target");
    if (!id || !target) continue;
    target = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
    map.set(id, `xl/${target}`);
  }
  return map;
}

export async function readXlsxRows(buffer: ArrayBuffer): Promise<XlsxSheet[]> {
  const entries = await readZipEntries(buffer);
  const decoder = new TextDecoder("utf-8");
  const text = (path: string): string => {
    const entry = entries.get(path);
    return entry ? decoder.decode(entry) : "";
  };
  const shared = parseSharedStrings(text("xl/sharedStrings.xml"));
  const rels = sheetTargets(text("xl/_rels/workbook.xml.rels"));
  const workbook = text("xl/workbook.xml");
  const sheets: XlsxSheet[] = [];
  for (const match of workbook.matchAll(new RegExp(`<${TAG}sheet\\b[^>]*?\\/?>`, "g"))) {
    const tag = match[0];
    const name = attr(tag, "name") || `工作表 ${sheets.length + 1}`;
    const relId = attr(tag, "r:id") || attr(tag, "id");
    const path = rels.get(relId) ?? `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = text(path);
    if (!xml) continue;
    sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  if (sheets.length === 0) {
    const fallback = text("xl/worksheets/sheet1.xml");
    if (fallback) sheets.push({ name: "工作表 1", rows: parseSheet(fallback, shared) });
  }
  if (sheets.length === 0) throw new Error("这个 Excel 文件里没有可读取的工作表。");
  return sheets;
}
