import { useMemo, useState } from "react";
import { BookOpenCheck, ClipboardCopy, FileDown, Sparkles } from "lucide-react";
import {
  catalogStats,
  catalogToMarkdown,
  parseCatalog,
  type CatalogParseResult,
} from "../../lib/catalog";
import { createNote, loadNotes, saveNotes, upsertNote } from "../../lib/notes";
import "../../styles/ai.css";

interface CatalogExtractPanelProps {
  onNotify: (message: string, tone?: "success" | "error") => void;
}

const SAMPLE = [
  "高等数学 A（上） 5 学分 先修：无 第 1 学期",
  "程序设计基础 4 学分 先修：无 第 1 学期",
  "数据结构与算法 4 学分 先修课程：程序设计基础、离散数学 第 3 学期",
].join("\n");

export function CatalogExtractPanel({ onNotify }: CatalogExtractPanelProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<CatalogParseResult | null>(null);

  const stats = useMemo(
    () => (result ? catalogStats(result.courses) : null),
    [result],
  );
  const markdown = result ? catalogToMarkdown(result.courses) : "";

  const runParse = () => {
    if (!text.trim()) {
      onNotify("先粘贴一段课程目录文本。", "error");
      return;
    }
    const parsed = parseCatalog(text);
    setResult(parsed);
    if (parsed.courses.length === 0) {
      onNotify("没有识别到课程，检查一下每行是否带有学分、先修或开课学期。", "error");
    }
  };

  const copyMarkdown = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      onNotify("已复制 Markdown 表格。");
    } catch {
      onNotify("浏览器不允许写剪贴板，可以手动选中表格复制。", "error");
    }
  };

  const saveAsNote = () => {
    if (!result || result.courses.length === 0) return;
    const data = loadNotes();
    const now = new Date();
    const note = createNote(
      {
        title: `课程目录提取 · ${now.getMonth() + 1}月${now.getDate()}日`,
        body: `从目录提取 ${result.courses.length} 门课程。\n\n${markdown}`,
        tags: ["课程目录"],
      },
      now,
    );
    if (saveNotes(upsertNote(data, note, now))) {
      onNotify("已保存到笔记，可在「笔记与看板」里查看。");
    } else {
      onNotify("保存笔记失败，本机存储可能已满。", "error");
    }
  };

  return (
    <section className="ai-catalog" aria-label="课程目录提取">
      <div className="ai-catalog-head">
        <div>
          <h3>粘贴培养方案，提取课程信息</h3>
          <p>
            识别每行的课程名、学分、先修课与开课学期，不联网、不上传。
            只采纳能明确读到信息的行，识别不了的会跳过。
          </p>
        </div>
        <button
          className="ai-ghost-button"
          type="button"
          onClick={() => setText(SAMPLE)}
        >
          <Sparkles size={13} />
          填入示例
        </button>
      </div>

      <textarea
        className="field-input ai-catalog-input"
        rows={7}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={"每行一门课，例如：\n高等数学 A（上） 5 学分 先修：无 第 1 学期\n数据结构与算法 4 学分 先修课程：程序设计基础 第 3 学期\n也支持 Markdown 表格行。"}
        spellCheck={false}
      />

      <div className="ai-catalog-actions">
        <button className="primary-button" type="button" onClick={runParse}>
          <BookOpenCheck size={15} />
          开始提取
        </button>
        {result ? (
          <span className="ai-catalog-stat">
            识别 {stats?.total ?? 0} 门 · 共 {stats?.credits ?? 0} 学分 · 有先修{" "}
            {stats?.withPrerequisites ?? 0} 门
            {result.skipped > 0 ? ` · 跳过 ${result.skipped} 行` : ""}
          </span>
        ) : (
          <span className="ai-catalog-stat">解析只在本机运行</span>
        )}
      </div>

      {result && result.courses.length > 0 ? (
        <div className="ai-catalog-result">
          <div className="ai-catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>课程</th>
                  <th>学分</th>
                  <th>先修</th>
                  <th>开课学期</th>
                </tr>
              </thead>
              <tbody>
                {result.courses.map((course) => (
                  <tr key={course.name}>
                    <td>{course.name}</td>
                    <td>{course.credits ?? "—"}</td>
                    <td>{course.prerequisites.length > 0 ? course.prerequisites.join("、") : "—"}</td>
                    <td>{course.semester !== null ? `第 ${course.semester} 学期` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ai-catalog-actions">
            <button className="secondary-button" type="button" onClick={() => void copyMarkdown()}>
              <ClipboardCopy size={14} />
              复制 Markdown
            </button>
            <button className="secondary-button" type="button" onClick={saveAsNote}>
              <FileDown size={14} />
              保存为笔记
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
