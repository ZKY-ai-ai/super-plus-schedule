export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfContent {
  text: string;
  rows: string[][];
  pages: number;
}

const MAX_PDF_PAGES = 20;

function approximateWidth(value: string, height: number): number {
  let width = 0;
  for (const char of value) {
    width += /[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? height : height * 0.55;
  }
  return width;
}

export function normalizePdfItems(items: unknown[]): PdfTextItem[] {
  const result: PdfTextItem[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.str !== "string" || !record.str) continue;
    const transform = Array.isArray(record.transform) ? record.transform : [];
    if (transform.length < 6) continue;
    const x = Number(transform[4]);
    const y = Number(transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const rawHeight = Number(transform[3]);
    const heightValue = Number(record.height);
    const height =
      Number.isFinite(heightValue) && heightValue > 0
        ? heightValue
        : Number.isFinite(rawHeight) && rawHeight !== 0
          ? Math.abs(rawHeight)
          : 10;
    const widthValue = Number(record.width);
    const width =
      Number.isFinite(widthValue) && widthValue > 0
        ? widthValue
        : approximateWidth(record.str, height);
    result.push({ str: record.str, x, y, width, height });
  }
  return result;
}

function appendWithinCell(current: string, value: string, gap: number): string {
  if (!current) return value;
  const needsSpace =
    gap > 1 &&
    /[A-Za-z0-9]$/.test(current) &&
    /^[A-Za-z0-9]/.test(value);
  return needsSpace ? `${current} ${value}` : `${current}${value}`;
}

export function pdfItemsToRows(rawItems: unknown[]): string[][] {
  const items = normalizePdfItems(rawItems);
  if (items.length === 0) return [];
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PdfTextItem[][] = [];
  for (const item of items) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(3, item.height * 0.45);
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item);
    else lines.push([item]);
  }

  const rows: string[][] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    const cells: string[] = [];
    let current = "";
    let previousEnd: number | null = null;
    let previousHeight = line[0]?.height ?? 10;
    for (const item of line) {
      if (previousEnd !== null) {
        const gap = item.x - previousEnd;
        if (gap > Math.max(12, previousHeight * 1.5)) {
          cells.push(current.trim());
          current = item.str;
        } else {
          current = appendWithinCell(current, item.str, gap);
        }
      } else {
        current = item.str;
      }
      previousEnd = item.x + item.width;
      previousHeight = item.height;
    }
    cells.push(current.trim());
    const filled = cells.filter((cell) => cell);
    if (filled.length > 0) rows.push(filled);
  }
  return rows;
}

export function pdfRowsToText(rows: string[][]): string {
  return rows.map((row) => row.join(" | ")).join("\n");
}

export async function readPdfText(buffer: ArrayBuffer): Promise<PdfContent> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const document = await task.promise;
  try {
    const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
    const rows: string[][] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      rows.push(...pdfItemsToRows(content.items));
      page.cleanup();
    }
    return { text: pdfRowsToText(rows), rows, pages: document.numPages };
  } finally {
    await task.destroy();
  }
}
