import { useMemo, useRef, useState } from "react";
import { CloudDownload, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import type { ImportResult, ScheduleData } from "../types";
import { isNativeApp } from "../lib/nativeFile";
import {
  detectThirdPartyShare,
  fetchThirdPartyShare,
  parseThirdPartySchedule,
  thirdPartyLabel,
} from "../lib/thirdPartyImport";
import { Modal } from "./Modal";

interface ThirdPartyImportDialogProps {
  onClose: () => void;
  onPreview: (data: ScheduleData, fileName: string, message: string) => ImportResult;
}

interface Notice {
  tone: "success" | "error" | "info";
  message: string;
}

const PLACEHOLDER = [
  "把 WakeUp 的 .wakeup_schedule 备份内容，或星链导出的课表 JSON 粘贴到这里。",
  "",
  "也可以直接粘贴分享内容：",
  "这是来自「WakeUp课程表」的课表分享……分享口令为「a02b3a50f6a74fa49ec592597cef8162」",
  "我在「星链课表」分享了课表给你。打开课表页右上角「+」，输入：PABRdldk",
].join("\n");

export function ThirdPartyImportDialog({
  onClose,
  onPreview,
}: ThirdPartyImportDialogProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const native = isNativeApp();

  const parsed = useMemo(() => parseThirdPartySchedule(text), [text]);
  const share = useMemo(
    () => (parsed ? null : detectThirdPartyShare(text)),
    [parsed, text],
  );

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setNotice({ tone: "error", message: "文件超过 20 MB，无法导入。" });
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      const result = parseThirdPartySchedule(content);
      setNotice(
        result
          ? { tone: "success", message: `已读取「${result.name}」，共 ${result.courseCount} 门课程。` }
          : { tone: "error", message: "文件里没有找到可导入的课程。" },
      );
    } catch {
      setNotice({ tone: "error", message: "文件读取失败，请重试。" });
    }
  };

  const handleFetch = async () => {
    if (!share) return;
    setBusy(true);
    setNotice({ tone: "info", message: `正在读取${thirdPartyLabel(share.source)}分享码…` });
    try {
      const payload = await fetchThirdPartyShare(share);
      setText(payload);
      const result = parseThirdPartySchedule(payload);
      setNotice(
        result
          ? { tone: "success", message: `已读取「${result.name}」，共 ${result.courseCount} 门课程。` }
          : { tone: "error", message: "接口返回了数据，但没有识别到课程。" },
      );
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "读取分享码失败。",
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = () => {
    if (!parsed) return;
    const label = thirdPartyLabel(parsed.source);
    const result = onPreview(
      parsed.data,
      `${label}-${parsed.name}.json`,
      parsed.message,
    );
    if (result.ok) {
      onClose();
    } else {
      setNotice({ tone: "error", message: result.message });
    }
  };

  return (
    <Modal
      className="third-party-modal"
      eyebrow="WAKEUP · STARLINK"
      title="WakeUp / 星链导入"
      onClose={onClose}
      footer={
        <>
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!parsed || busy}
            onClick={handlePreview}
          >
            <FileUp size={15} />
            预览并导入
          </button>
        </>
      }
    >
      <p className="third-party-hint">
        支持 WakeUp 的 <code>.wakeup_schedule</code> 备份、分享口令，以及星链分享码和导出
        JSON。先解析预览，再选择替换或合并到当前课表。
      </p>

      <div className="third-party-actions">
        <button
          className="small-button"
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <FileUp size={13} />
          选择文件
        </button>
        {text ? (
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setText("");
              setNotice(null);
            }}
            disabled={busy}
          >
            清空
          </button>
        ) : null}
        <span className="third-party-trust">解析只在本机完成</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".wakeup_schedule,.json,.txt,application/json,text/plain"
        hidden
        aria-label="选择 WakeUp 备份或星链 JSON"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <label className="third-party-field">
        <span>备份内容 / 分享口令 / JSON</span>
        <textarea
          value={text}
          rows={8}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      {share ? (
        <div className="third-party-detect">
          <span>
            检测到{thirdPartyLabel(share.source)}分享码：
            <strong>{share.code}</strong>
          </span>
          {share.source === "wakeup" && !native ? (
            <p>
              WakeUp 接口不允许浏览器跨域读取，请用「选择文件」导入备份，或在 Android App
              里使用分享口令。
            </p>
          ) : (
            <button
              className="small-button"
              type="button"
              disabled={busy}
              onClick={() => {
                void handleFetch();
              }}
            >
              {busy ? <LoaderCircle className="is-spinning" size={13} /> : <CloudDownload size={13} />}
              {busy ? "读取中…" : "在线获取"}
            </button>
          )}
        </div>
      ) : null}

      {notice ? (
        <p className={`third-party-notice is-${notice.tone}`}>
          {notice.tone === "error" ? <TriangleAlert size={13} /> : null}
          {notice.message}
        </p>
      ) : null}

      {parsed ? (
        <div className="third-party-summary">
          <div>
            <span>来源</span>
            <strong>{thirdPartyLabel(parsed.source)}</strong>
          </div>
          <div>
            <span>课表</span>
            <strong>{parsed.name}</strong>
          </div>
          <div>
            <span>开学</span>
            <strong>{parsed.startDate}</strong>
          </div>
          <div>
            <span>课程</span>
            <strong>{parsed.courseCount} 门</strong>
          </div>
          <div>
            <span>时间段</span>
            <strong>{parsed.slotCount} 个</strong>
          </div>
          <div>
            <span>节次</span>
            <strong>{parsed.data.timetables[0]?.semester.periods.length ?? 0} 节</strong>
          </div>
        </div>
      ) : text.trim() && !share ? (
        <p className="third-party-notice is-error">
          <TriangleAlert size={13} />
          没有识别到可导入的课程。请确认是完整的 WakeUp 备份或星链课表 JSON。
        </p>
      ) : null}
    </Modal>
  );
}
