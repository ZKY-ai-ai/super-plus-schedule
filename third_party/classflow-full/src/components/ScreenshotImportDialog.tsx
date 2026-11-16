import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { FileUp, LoaderCircle, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import type { ParsedCourseSeed } from "../lib/textImport";
import { weekdayLabel } from "../lib/date";
import { loadAiSettings } from "../lib/ai";
import {
  MAX_IMAGE_EDGE,
  SCREENSHOT_ACCEPT,
  ScreenshotImportError,
  compressImageDataUrl,
  readFileAsDataUrl,
  recognizeScreenshot,
  validateImageFile,
  visionConfigFromAiSettings,
  type ScreenshotVisionConfig,
} from "../lib/screenshotImport";
import { Modal } from "./Modal";
import "../styles/screenshot-import.css";

export interface ScreenshotImportDialogProps {
  totalWeeks: number;
  onClose: () => void;
  onImport: (seeds: ParsedCourseSeed[]) => void;
  /** 显式传入配置时优先使用；传 null 表示明确不使用。 */
  visionConfig?: ScreenshotVisionConfig | null;
  /** 点击识别时再读取配置，便于复用现有 AI 设置。 */
  getVisionConfig?: () => ScreenshotVisionConfig | null;
  onOpenAiSettings?: () => void;
  onNotify?: (message: string, tone?: "success" | "error") => void;
}

function slotLabel(slot: ParsedCourseSeed["slots"][number]): string {
  const periods =
    slot.start === slot.end ? `第 ${slot.start} 节` : `第 ${slot.start}–${slot.end} 节`;
  const weeks =
    slot.weekStart === slot.weekEnd
      ? `第 ${slot.weekStart} 周`
      : `第 ${slot.weekStart}–${slot.weekEnd} 周`;
  const pattern =
    slot.pattern === "odd" ? " · 单周" : slot.pattern === "even" ? " · 双周" : "";
  return `${weekdayLabel(slot.day)} ${periods} · ${weeks}${pattern}`;
}

function findImageFile(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
}

export function ScreenshotImportDialog({
  totalWeeks,
  onClose,
  onImport,
  visionConfig,
  getVisionConfig,
  onOpenAiSettings,
  onNotify,
}: ScreenshotImportDialogProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [courses, setCourses] = useState<ParsedCourseSeed[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || busy) return;
      const invalid = validateImageFile(file);
      if (invalid) {
        setFatal(invalid);
        return;
      }
      setFatal(null);
      setErrors([]);
      setCourses([]);
      try {
        const raw = await readFileAsDataUrl(file);
        const compressed = await compressImageDataUrl(raw);
        setPreview(compressed);
        setFileName(file.name || "粘贴的截图");
      } catch (error) {
        setFatal(error instanceof Error ? error.message : "图片读取失败，请换一张试试。");
      }
    },
    [busy],
  );

  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      const file = findImageFile(event.clipboardData?.files);
      if (!file) return;
      event.preventDefault();
      void acceptFile(file);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [acceptFile]);

  const resolveConfig = useCallback((): ScreenshotVisionConfig | null => {
    if (visionConfig !== undefined) return visionConfig;
    if (getVisionConfig) return getVisionConfig();
    return visionConfigFromAiSettings(loadAiSettings());
  }, [visionConfig, getVisionConfig]);

  const recognize = async () => {
    if (!preview) {
      setFatal("请先选择或粘贴一张课表截图。");
      return;
    }
    const config = resolveConfig();
    if (!config) {
      setFatal(
        "还没有可用的视觉模型配置。请先在「设置 → AI 与授权」切换到「OpenAI 兼容」，填写 Base URL、API Key 和支持图片输入的模型（例如 gpt-4o-mini）。",
      );
      return;
    }
    setBusy(true);
    setFatal(null);
    setErrors([]);
    setCourses([]);
    try {
      const result = await recognizeScreenshot({
        dataUrl: preview,
        config,
        totalWeeks,
      });
      setCourses(result.courses);
      setErrors(result.errors);
      onNotify?.(`识别到 ${result.courses.length} 门课程，请核对后加入课表。`);
    } catch (error) {
      if (error instanceof ScreenshotImportError) {
        setFatal(error.message);
        setErrors(error.errors);
      } else {
        setFatal(error instanceof Error ? error.message : "识别失败，请重试。");
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (courses.length === 0) return;
    onImport(courses);
  };

  const openPicker = () => {
    if (busy) return;
    fileRef.current?.click();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = findImageFile(event.dataTransfer.files);
    if (!file) {
      setFatal("拖入的不是图片，请选择 PNG、JPG、WebP 或 GIF 截图。");
      return;
    }
    void acceptFile(file);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    void acceptFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const totalSlots = courses.reduce((total, course) => total + course.slots.length, 0);

  return (
    <Modal
      className="screenshot-import-modal"
      eyebrow="VISION · F016"
      title="截图识课"
      onClose={onClose}
      footer={
        <>
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          {courses.length > 0 ? (
            <button className="primary-button" type="button" onClick={confirm}>
              <FileUp size={15} />
              加入课表
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={() => void recognize()}
              disabled={!preview || busy}
            >
              {busy ? (
                <LoaderCircle className="screenshot-import-spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}
              {busy ? "识别中…" : "开始识别"}
            </button>
          )}
        </>
      }
    >
      <p className="screenshot-import-hint">
        拖入、粘贴（Ctrl / ⌘ + V）或选择课表截图，用你已配置的 OpenAI 兼容视觉模型识别。
        图片会压缩到最长边 {MAX_IMAGE_EDGE}px 以内，只发送到该接口，不在本地保存。
      </p>

      <div
        className={`screenshot-drop${dragging ? " is-dragging" : ""}${preview ? " has-image" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={preview ? "更换课表截图" : "选择或拖入课表截图"}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {preview ? (
          <div className="screenshot-preview">
            <img src={preview} alt="课表截图预览" />
            <div className="screenshot-preview-meta">
              <strong>{fileName}</strong>
              <span>缩略预览 · 实际发送的图片已压缩</span>
            </div>
            <button
              className="small-button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openPicker();
              }}
              disabled={busy}
            >
              <FileUp size={13} />
              更换截图
            </button>
          </div>
        ) : (
          <div className="screenshot-drop-empty">
            <FileUp size={24} />
            <strong>拖入课表截图，或按 Ctrl / ⌘ + V 粘贴</strong>
            <span>支持 PNG、JPG、WebP、GIF，单张不超过 15 MB</span>
            <button
              className="small-button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openPicker();
              }}
            >
              选择图片
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={SCREENSHOT_ACCEPT}
        hidden
        aria-label="选择课表截图"
        onChange={handleInput}
      />

      {busy ? (
        <p className="screenshot-status">
          <LoaderCircle className="screenshot-import-spin" size={14} />
          正在识别截图，视觉模型通常需要 5–20 秒，请勿关闭弹窗。
        </p>
      ) : null}

      {fatal ? (
        <div className="screenshot-notice is-error">
          <TriangleAlert size={14} />
          <p>{fatal}</p>
          {onOpenAiSettings ? (
            <button
              className="screenshot-settings-link"
              type="button"
              onClick={onOpenAiSettings}
            >
              去 AI 设置
            </button>
          ) : null}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <ul className="screenshot-errors" aria-label="识别提示">
          {errors.map((error, index) => (
            <li key={`${index}-${error}`}>
              <TriangleAlert size={12} />
              {error}
            </li>
          ))}
        </ul>
      ) : null}

      {courses.length > 0 ? (
        <section className="screenshot-result" aria-label="识别结果预览">
          <div className="screenshot-result-head">
            <div>
              <strong>识别结果</strong>
              <span>
                {courses.length} 门课程 · {totalSlots} 个时间段
              </span>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void recognize()}
              disabled={busy}
            >
              <RotateCcw size={13} />
              重新识别
            </button>
          </div>
          <ul className="screenshot-course-list">
            {courses.map((course) => (
              <li key={`${course.name}|${course.teacher}`}>
                <div className="screenshot-course-head">
                  <strong>{course.name}</strong>
                  <span>
                    {[course.teacher ? `@${course.teacher}` : "", course.location]
                      .filter(Boolean)
                      .join(" · ") || "未填写老师和教室"}
                  </span>
                </div>
                <div className="screenshot-course-slots">
                  {course.slots.map((slot, index) => (
                    <em key={`${slotLabel(slot)}-${index}`}>{slotLabel(slot)}</em>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Modal>
  );
}
