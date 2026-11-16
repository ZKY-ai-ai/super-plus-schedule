import { useRef, useState } from "react";
import {
  CalendarRange,
  Database,
  Download,
  Printer,
  Trash2,
  Upload,
} from "lucide-react";
import type { ImportResult } from "../../types";
import { isNativeApp, type ExportResult } from "../../lib/nativeFile";

interface DataSettingsTabProps {
  onExportJson: () => Promise<ExportResult>;
  onExportIcs: () => Promise<ExportResult & { count: number }>;
  onImportFile: (file: File) => Promise<ImportResult>;
  onPrint: () => void;
  onClearData: () => void;
}

interface DataNotice {
  tone: "success" | "error" | "info";
  message: string;
}

function deliveryMessage(delivery: ExportResult["delivery"], filename: string): string {
  if (delivery === "shared") return "已生成文件，请在系统分享面板里保存到文件或网盘。";
  if (delivery === "saved") return `已保存到系统文档：${filename}`;
  return `已导出 ${filename}`;
}

export function DataSettingsTab({
  onExportJson,
  onExportIcs,
  onImportFile,
  onPrint,
  onClearData,
}: DataSettingsTabProps) {
  const [notice, setNotice] = useState<DataNotice | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const native = isNativeApp();

  const handleExportJson = async () => {
    setNotice({ tone: "info", message: "正在整理备份…" });
    try {
      const result = await onExportJson();
      setNotice({ tone: "success", message: deliveryMessage(result.delivery, result.filename) });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "导出失败，请稍后再试。",
      });
    }
  };

  const handleExportIcs = async () => {
    setNotice({ tone: "info", message: "正在生成日历…" });
    try {
      const result = await onExportIcs();
      setNotice({
        tone: "success",
        message: `${deliveryMessage(result.delivery, result.filename)}　共 ${result.count} 个日程。`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "导出失败，请稍后再试。",
      });
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setNotice({ tone: "info", message: "正在读取备份…" });
    const result = await onImportFile(file);
    setNotice({
      tone: result.ok ? "success" : result.message.includes("取消") ? "info" : "error",
      message: result.message,
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className="settings-pane">
      <div className="settings-pane-head">
        <p className="eyebrow">YOUR DATA</p>
        <h3>数据与备份</h3>
        <p>课表保存在本机。换设备前，记得先导出一份备份。</p>
      </div>

      {notice ? (
        <p className={`inline-notice inline-notice--${notice.tone}`} role="status">
          {notice.message}
        </p>
      ) : null}

      <div className="data-grid">
        <button className="data-card" type="button" onClick={() => { void handleExportJson(); }}>
          <span className="data-card-icon">
            <Download size={18} />
          </span>
          <span>
            <strong>导出全部课表备份</strong>
            <small>JSON · 包含所有课表、课程、日程与作息</small>
          </span>
        </button>
        <button className="data-card" type="button" onClick={() => { void handleExportIcs(); }}>
          <span className="data-card-icon">
            <CalendarRange size={18} />
          </span>
          <span>
            <strong>导出当前课表日历</strong>
            <small>ICS · 只导出当前课表的课程和日程</small>
          </span>
        </button>
        <button className="data-card" type="button" onClick={() => fileRef.current?.click()}>
          <span className="data-card-icon">
            <Upload size={18} />
          </span>
          <span>
            <strong>导入备份</strong>
            <small>选择由课序导出的 JSON 文件</small>
          </span>
        </button>
        {!native ? (
          <button className="data-card" type="button" onClick={onPrint}>
            <span className="data-card-icon">
              <Printer size={18} />
            </span>
            <span>
              <strong>打印当前课表</strong>
              <small>也可以选择「另存为 PDF」</small>
            </span>
          </button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        id="import-file"
        type="file"
        accept=".json,application/json"
        aria-label="选择课表备份文件"
        hidden
        onChange={(event) => {
          void handleImport(event.target.files?.[0]);
        }}
      />

      <div className="storage-box">
        <div>
          <span className="storage-icon">
            <Database size={16} />
          </span>
          <div>
            <strong>本地优先</strong>
            <p>没有账号，没有服务器，没有同步。你的课表不会离开这台设备。</p>
          </div>
        </div>
        <span className="storage-pill">LOCAL ONLY</span>
      </div>

      <div className="danger-zone">
        <div>
          <h4>重新开始</h4>
          <p>清空所有课表、课程、日程与壁纸，建议先导出备份。</p>
        </div>
        <div className="danger-actions">
          <button className="danger-ghost-button" type="button" onClick={onClearData}>
            <Trash2 size={14} />
            清空全部数据
          </button>
        </div>
      </div>
    </section>
  );
}