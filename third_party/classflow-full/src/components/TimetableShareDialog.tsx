import { useEffect, useMemo, useState } from "react";
import { Copy, Download, FileText, Link2, Loader2, Share2 } from "lucide-react";
import type { Period, Session, Timetable } from "../types";
import { Modal } from "./Modal";
import { buildCourseShareLink } from "../lib/courseShare";
import {
  buildCourseShareText,
  buildWeekMarkdown,
  buildWeekText,
  renderTimetableImage,
  type RenderedTimetableImage,
  type WeekShareInput,
} from "../lib/timetableImage";

interface TimetableShareDialogProps {
  timetable: Timetable;
  week: number;
  dateRange: string;
  weekDates: Date[];
  days: number[];
  sessions: Session[];
  periods: Period[];
  showAliases: boolean;
  onClose: () => void;
}

export function TimetableShareDialog({
  timetable,
  week,
  dateRange,
  weekDates,
  days,
  sessions,
  periods,
  showAliases,
  onClose,
}: TimetableShareDialogProps) {
  const [image, setImage] = useState<RenderedTimetableImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const input: WeekShareInput = useMemo(
    () => ({
      title: timetable.name,
      term: timetable.semester.name,
      week,
      dateRange,
      days,
      dates: weekDates,
      sessions,
      periods,
      showAliases,
    }),
    [timetable.name, timetable.semester.name, week, dateRange, days, weekDates, sessions, periods, showAliases],
  );

  const text = useMemo(() => buildWeekText(input), [input]);
  const markdown = useMemo(() => buildWeekMarkdown(input), [input]);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setError(null);
    renderTimetableImage(input)
      .then((result) => {
        if (!cancelled) setImage(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "生成图片失败，请稍后重试。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setNotice("复制失败，请手动选中内容复制。");
    }
  };

  const download = () => {
    if (!image) return;
    const url = URL.createObjectURL(image.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = image.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    setNotice(`已生成 ${image.filename}`);
  };

  const shareImage = async () => {
    if (!image) return;
    const file = new File([image.blob], image.filename, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${timetable.name} · 第 ${week} 周` });
        return;
      } catch {
        // 用户取消系统分享时回退到下载。
      }
    }
    download();
  };

  const copyLink = () => {
    const anchor = `${window.location.origin}${window.location.pathname}`;
    const link = buildCourseShareLink(anchor, buildCourseShareText(timetable.courses));
    void copy(link, "分享链接已复制，对方打开后会直接进入导入预览。");
  };

  return (
    <Modal
      className="timetable-share-modal"
      eyebrow="SHARE WEEK"
      title="课表图片与分享"
      onClose={onClose}
      footer={
        <>
          <button className="secondary-button" type="button" onClick={onClose}>
            关闭
          </button>
          <button className="primary-button" type="button" disabled={!image} onClick={download}>
            <Download size={15} />
            下载 PNG
          </button>
        </>
      }
    >
      <div className="timetable-share-preview">
        {image ? (
          <img src={image.dataUrl} alt={`${timetable.name} 第 ${week} 周课表图片`} />
        ) : error ? (
          <p className="timetable-share-error">{error}</p>
        ) : (
          <p className="timetable-share-loading">
            <Loader2 size={16} className="is-spinning" />
            正在绘制课表图片…
          </p>
        )}
      </div>

      {notice ? (
        <div className="timetable-share-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}

      <div className="timetable-share-actions">
        <button
          className="small-button"
          type="button"
          disabled={!image}
          onClick={() => void shareImage()}
        >
          <Share2 size={14} />
          系统分享
        </button>
        <button className="small-button" type="button" onClick={() => void copy(text, "课表文字已复制。")}>
          <FileText size={14} />
          复制文字
        </button>
        <button
          className="small-button"
          type="button"
          onClick={() => void copy(markdown, "Markdown 课表已复制。")}
        >
          <Copy size={14} />
          复制 Markdown
        </button>
        <button className="small-button" type="button" onClick={copyLink}>
          <Link2 size={14} />
          复制分享链接
        </button>
      </div>

      <p className="timetable-share-hint">
        PNG 适合发群聊或朋友圈；分享链接只包含课程规则，对方打开后走「文本建课」预览，可选择合并或替换。
      </p>
    </Modal>
  );
}
