import { useState } from "react";
import { Check, Link2, LoaderCircle, Search } from "lucide-react";
import { Modal } from "../Modal";
import { fetchLinkPreview, parseFirstUrl } from "../../lib/notes";
import type { LinkPreview } from "../../lib/notes";

interface LinkImportDialogProps {
  onClose: () => void;
  onSave: (input: { title: string; body: string; tags: string; url: string }) => void;
}

export function LinkImportDialog({ onClose, onSave }: LinkImportDialogProps) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resolve = async () => {
    setError("");
    const url = parseFirstUrl(raw);
    if (!url) {
      setError("没有识别到 http/https 链接。");
      return;
    }
    setLoading(true);
    const result = await fetchLinkPreview(url);
    setLoading(false);
    setPreview(result);
    setTitle(result.title);
    setBody(result.description);
    if (result.error) setError(result.error);
  };

  const save = () => {
    if (!preview) return;
    onSave({
      title: title.trim() || preview.title,
      body,
      tags,
      url: preview.url,
    });
  };

  return (
    <Modal
      className="notes-link-modal"
      eyebrow="IMPORT LINK"
      title="导入学习链接"
      onClose={onClose}
      footer={
        <>
          <span className="modal-foot-note">只保存在本机，不会上传链接内容。</span>
          <span className="modal-foot-spacer" />
          <button className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          {preview ? (
            <button className="primary-button" type="button" onClick={save}>
              <Check size={15} />
              保存为笔记
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={() => { void resolve(); }} disabled={loading}>
              {loading ? <LoaderCircle size={15} className="notes-spin" /> : <Search size={15} />}
              {loading ? "正在抓取…" : "抓取预览"}
            </button>
          )}
        </>
      }
    >
      <div className="notes-link-body">
        <label className="field">
          <span className="field-label">链接或包含链接的文字</span>
          <textarea
            className="field-input notes-link-input"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setPreview(null);
              setError("");
            }}
            rows={3}
            placeholder="例如：https://example.com/course/linear-algebra"
            autoFocus
          />
          <small className="field-hint">支持直接粘贴分享文案；抓取失败也能保存链接和标题。</small>
        </label>
        {error ? <p className="inline-notice inline-notice--info">{error}</p> : null}
        {preview ? (
          <div className="notes-link-preview">
            <div className="notes-link-preview-head">
              <span className="notes-link-icon">
                <Link2 size={16} />
              </span>
              <div>
                <strong>{preview.siteName || new URL(preview.url).hostname}</strong>
                <span>{preview.url}</span>
              </div>
            </div>
            <label className="field">
              <span className="field-label">标题</span>
              <input
                className="field-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
              />
            </label>
            <label className="field">
              <span className="field-label">摘要 / 备注</span>
              <textarea
                className="field-input"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={3}
                maxLength={2000}
              />
            </label>
            <label className="field">
              <span className="field-label">标签</span>
              <input
                className="field-input"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="资料 复习"
                maxLength={200}
              />
            </label>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
