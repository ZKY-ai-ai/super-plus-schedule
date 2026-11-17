import { useEffect, useRef, useState } from "react";
import {
  CalendarRange,
  Database,
  Download,
  FileClock,
  LayoutTemplate,
  Printer,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import type { CourseTemplate, ImportDraft, ImportResult } from "../../types";
import { isNativeApp, type ExportResult } from "../../lib/nativeFile";
import { loadImportDraft, loadTemplates, MAX_TEMPLATES } from "../../lib/storage";

interface DataSettingsTabProps {
  activeTimetableName: string;
  draftRevision: number;
  onExportJson: () => Promise<ExportResult>;
  onExportIcs: () => Promise<ExportResult & { count: number }>;
  onOpenImportSchedule: () => void;
  onImportFile: (file: File) => Promise<ImportResult>;
  onOpenTimetableShare: () => void;
  onApplyDraft: (draft: ImportDraft) => Promise<ImportResult>;
  onDiscardDraft: () => void;
  onSaveTemplate: (name: string) => ImportResult;
  onApplyTemplate: (template: CourseTemplate) => ImportResult;
  onDeleteTemplate: (id: string) => void;
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

function formatDraftTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DataSettingsTab({
  activeTimetableName,
  draftRevision,
  onExportJson,
  onExportIcs,
  onOpenImportSchedule,
  onImportFile,
  onOpenTimetableShare,
  onApplyDraft,
  onDiscardDraft,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  onPrint,
  onClearData,
}: DataSettingsTabProps) {
  const [notice, setNotice] = useState<DataNotice | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(() => loadImportDraft());
  const [templates, setTemplates] = useState<CourseTemplate[]>(() => loadTemplates());
  const [templateName, setTemplateName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const native = isNativeApp();

  useEffect(() => {
    setDraft(loadImportDraft());
  }, [draftRevision]);

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

  const handleRestoreBackup = async (file: File | undefined) => {
    if (!file) return;
    setNotice({ tone: "info", message: "正在读取备份…" });
    const result = await onImportFile(file);
    setNotice({
      tone: result.ok ? "success" : result.message.includes("取消") ? "info" : "error",
      message: result.message,
    });
    setDraft(result.ok ? null : loadImportDraft());
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleApplyDraft = async () => {
    if (!draft) return;
    setNotice({ tone: "info", message: "正在导入草稿…" });
    const result = await onApplyDraft(draft);
    setNotice({ tone: result.ok ? "success" : "info", message: result.message });
    if (result.ok) setDraft(null);
  };

  const handleDiscardDraft = () => {
    onDiscardDraft();
    setDraft(null);
    setNotice({ tone: "info", message: "已丢弃这份导入草稿。" });
  };

  const handleSaveTemplate = () => {
    const result = onSaveTemplate(templateName.trim() || `${activeTimetableName} 模板`);
    setNotice({ tone: result.ok ? "success" : "error", message: result.message });
    if (result.ok) {
      setTemplates(loadTemplates());
      setTemplateName("");
    }
  };

  const handleApplyTemplate = (template: CourseTemplate) => {
    const result = onApplyTemplate(template);
    setNotice({ tone: result.ok ? "success" : "error", message: result.message });
  };

  const handleDeleteTemplate = (template: CourseTemplate) => {
    onDeleteTemplate(template.id);
    setTemplates(loadTemplates());
    setNotice({ tone: "info", message: `已删除模板「${template.name}」。` });
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

      {draft ? (
        <div className="import-draft-card">
          <span className="import-draft-icon">
            <FileClock size={17} />
          </span>
          <div className="import-draft-body">
            <strong>{draft.fileName}</strong>
            <small>
              {formatDraftTime(draft.createdAt)} 留下 · 含 {draft.data.timetables.length} 套课表
            </small>
            <p>{draft.message}</p>
          </div>
          <div className="import-draft-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                void handleApplyDraft();
              }}
            >
              继续导入
            </button>
            <button className="ghost-button" type="button" onClick={handleDiscardDraft}>
              丢弃
            </button>
          </div>
        </div>
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
        <button className="data-card" type="button" onClick={onOpenImportSchedule}>
          <span className="data-card-icon">
            <Upload size={18} />
          </span>
          <span>
            <strong>导入课表</strong>
            <small>图片、Word、PDF、Excel / CSV、文本与 ICS，由 AI 自动转换</small>
          </span>
        </button>
        <button className="data-card" type="button" onClick={() => fileRef.current?.click()}>
          <span className="data-card-icon">
            <FileClock size={18} />
          </span>
          <span>
            <strong>恢复课表备份</strong>
            <small>读取课序PLUS JSON 备份、ICS、CSV 或课程文本，冲突时可选择合并或替换</small>
          </span>
        </button>
        <button className="data-card" type="button" onClick={onOpenTimetableShare}>
          <span className="data-card-icon">
            <Share2 size={18} />
          </span>
          <span>
            <strong>分享本周课表</strong>
            <small>PNG 长图、文字 / Markdown 与导入链接</small>
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
        accept=".json,.ics,.csv,.tsv,.txt,.md,.html,.htm,application/json,text/calendar,text/csv,text/plain"
        aria-label="选择课表备份文件"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleRestoreBackup(file);
        }}
      />

      <div className="template-box">
        <div className="template-head">
          <span className="template-title">
            <LayoutTemplate size={16} />
            <strong>课表模板</strong>
          </span>
          <span className="storage-pill">
            {templates.length}/{MAX_TEMPLATES}
          </span>
        </div>
        <p className="template-hint">
          把当前课表的全部课程存成模板，换学期或新课表时一键追加，节次和周次会自动裁剪。
        </p>
        <div className="template-save-row">
          <input
            className="template-name-input"
            value={templateName}
            maxLength={40}
            placeholder={`${activeTimetableName} 模板`}
            aria-label="模板名称"
            onChange={(event) => setTemplateName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSaveTemplate();
              }
            }}
          />
          <button
            className="ghost-button"
            type="button"
            disabled={templates.length >= MAX_TEMPLATES}
            onClick={handleSaveTemplate}
          >
            存为模板
          </button>
        </div>
        {templates.length > 0 ? (
          <ul className="template-list">
            {templates.map((template) => (
              <li className="template-item" key={template.id}>
                <div className="template-item-text">
                  <strong>{template.name}</strong>
                  <small>
                    {template.courses.length} 门课 · {template.totalWeeks} 周 ·{" "}
                    {formatDraftTime(template.createdAt)}
                  </small>
                </div>
                <div className="template-item-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => handleApplyTemplate(template)}
                  >
                    套用
                  </button>
                  <button
                    className="danger-ghost-button"
                    type="button"
                    onClick={() => handleDeleteTemplate(template)}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="template-empty">还没有自定义模板，先存一个试试。</p>
        )}
      </div>

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