import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Table2, Upload } from "lucide-react";
import type { ParsedCourseSeed } from "../lib/textImport";
import {
  EXCEL_MAPPING_FIELDS,
  detectHeaderRow,
  guessColumnMapping,
  mapCourseRows,
  mappingReady,
  type ExcelColumnMapping,
} from "../lib/excelMapping";
import { readXlsxRows, type XlsxSheet } from "../lib/xlsx";
import { Modal } from "./Modal";

interface ExcelImportDialogProps {
  totalWeeks: number;
  onClose: () => void;
  onImport: (seeds: ParsedCourseSeed[]) => void;
}

const EMPTY_CELL = "— 忽略 —";

export function ExcelImportDialog({ totalWeeks, onClose, onImport }: ExcelImportDialogProps) {
  const [sheets, setSheets] = useState<XlsxSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ExcelColumnMapping>(() => guessColumnMapping([]));
  const [sectionKeyword, setSectionKeyword] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sheet = sheets[sheetIndex];
  const rows = sheet?.rows ?? [];
  const headers = rows[headerRow] ?? [];

  const result = useMemo(
    () =>
      mapCourseRows(rows, mapping, {
        totalWeeks,
        sectionKeyword,
        startRow: headerRow + 1,
      }),
    [rows, mapping, totalWeeks, sectionKeyword, headerRow],
  );

  const headerLabel = (index: number): string => {
    const value = index >= 0 ? headers[index] ?? "" : "";
    return value || `第 ${index + 1} 列`;
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const parsed = await readXlsxRows(await file.arrayBuffer());
      const first = parsed[0];
      const headerIndex = detectHeaderRow(first?.rows ?? []);
      setSheets(parsed);
      setSheetIndex(0);
      setFileName(file.name);
      selectSheet(0, parsed, headerIndex);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取 Excel 失败。");
      setSheets([]);
    } finally {
      setBusy(false);
    }
  };

  const selectSheet = (index: number, source = sheets, headerIndex?: number) => {
    const next = source[index];
    const nextHeader = headerIndex ?? detectHeaderRow(next?.rows ?? []);
    setSheetIndex(index);
    setHeaderRow(nextHeader);
    setMapping(guessColumnMapping(next?.rows?.[nextHeader] ?? []));
  };

  const changeHeaderRow = (index: number) => {
    setHeaderRow(index);
    setMapping(guessColumnMapping(rows[index] ?? []));
  };

  const setField = (field: keyof ExcelColumnMapping, value: number) => {
    setMapping((current) => ({ ...current, [field]: value }));
  };

  const confirm = () => {
    onImport(result.courses);
    onClose();
  };

  return (
    <Modal
      className="excel-import-modal"
      eyebrow="EXCEL MAPPING"
      title="Excel 映射导入"
      onClose={onClose}
      footer={
        <>
          <p className="modal-foot-note">只在本机解析表格，不上传文件</p>
          <span className="modal-foot-spacer" />
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!mappingReady(mapping) || result.courses.length === 0}
            onClick={confirm}
          >
            <Upload size={15} />
            导入 {result.courses.length > 0 ? `${result.courses.length} 门课程` : "课程"}
          </button>
        </>
      }
    >
      <div className="excel-import">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(event) => {
            void loadFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        {sheets.length === 0 ? (
          <div className="excel-drop">
            <FileSpreadsheet size={30} />
            <strong>选择一份 .xlsx 课表</strong>
            <p>支持表头在上方的表格；导入前可以调整列映射和班次筛选。</p>
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={15} />
              {busy ? "正在解析…" : "选择 Excel 文件"}
            </button>
            {error ? <p className="form-error">{error}</p> : null}
          </div>
        ) : (
          <>
            <div className="excel-file-row">
              <span className="excel-file-name">
                <Table2 size={15} />
                {fileName}
              </span>
              <button
                className="secondary-button"
                type="button"
                onClick={() => fileRef.current?.click()}
              >
                换一个文件
              </button>
            </div>

            {sheets.length > 1 ? (
              <div className="excel-sheet-tabs" role="tablist" aria-label="工作表">
                {sheets.map((item, index) => (
                  <button
                    key={`${item.name}-${index}`}
                    type="button"
                    role="tab"
                    aria-selected={index === sheetIndex}
                    className={index === sheetIndex ? "is-active" : ""}
                    onClick={() => selectSheet(index)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="excel-options">
              <label className="field">
                <span className="field-label">表头所在行</span>
                <select
                  className="field-input"
                  value={headerRow}
                  onChange={(event) => changeHeaderRow(Number(event.target.value))}
                >
                  {rows.slice(0, Math.min(rows.length, 10)).map((row, index) => (
                    <option key={index} value={index}>
                      第 {index + 1} 行 · {row.filter(Boolean).slice(0, 3).join(" / ") || "空行"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">班次筛选</span>
                <input
                  className="field-input"
                  value={sectionKeyword}
                  placeholder="例如：2024 级 1 班，留空导入全部"
                  onChange={(event) => setSectionKeyword(event.target.value)}
                />
              </label>
            </div>

            <div className="excel-mapping">
              {EXCEL_MAPPING_FIELDS.map((field) => (
                <label className="field" key={field.key}>
                  <span className="field-label">
                    {field.label}
                    {field.required ? <em className="excel-required">必填</em> : null}
                  </span>
                  <select
                    className="field-input"
                    value={mapping[field.key]}
                    onChange={(event) => setField(field.key, Number(event.target.value))}
                  >
                    <option value={-1}>{EMPTY_CELL}</option>
                    {headers.map((_, index) => (
                      <option key={index} value={index}>
                        {headerLabel(index)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <p className="excel-summary">
              {mappingReady(mapping)
                ? `可导入 ${result.courses.length} 门课程 · ${result.courses.reduce(
                    (total, course) => total + course.slots.length,
                    0,
                  )} 个时间段`
                : "请先指定课程名称和星期所在的列。"}
              {sectionKeyword && mapping.section < 0 ? "（班次筛选需要先选择班次列）" : ""}
            </p>

            {result.errors.length > 0 ? (
              <ul className="excel-errors">
                {result.errors.slice(0, 4).map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}
          </>
        )}
      </div>
    </Modal>
  );
}
