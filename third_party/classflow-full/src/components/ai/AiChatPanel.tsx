import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  Bot,
  CircleAlert,
  Eraser,
  FileSpreadsheet,
  FileText,
  FileWarning,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  Play,
  Send,
  Settings2,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import {
  appendChat,
  complete,
  createChatMessage,
  extractMemoryRequest,
  loadChat,
  saveChat,
  type AiChatData,
  type AiMemoryEntry,
  type AiScheduleSnapshot,
  type AiSettings,
} from "../../lib/ai";
import {
  describeAiAction,
  isDestructiveAction,
  parseAiActions,
  validateAiAction,
  type AiAction,
  type AiActionContext,
} from "../../lib/aiActions";
import { AI_MANUAL_INDEX, findManualSection } from "../../lib/aiManual";
import {
  AI_ATTACHMENT_ACCEPT,
  MAX_AI_ATTACHMENT_IMAGES,
  MAX_AI_ATTACHMENTS,
  attachmentImages,
  attachmentKindLabel,
  attachmentsToMeta,
  buildAttachmentPromptBlock,
  courseSeedsToText,
  createPendingAttachment,
  extractAiAttachment,
  formatAttachmentSize,
  type AiAttachment,
} from "../../lib/aiAttachments";
import type { Note } from "../../lib/notes";
import type { Task } from "../../lib/tasks";
import type { Exam } from "../../lib/exams";
import { ConfirmDialog } from "../ConfirmDialog";
import { MarkdownMessage } from "./MarkdownMessage";

interface AiChatPanelProps {
  settings: AiSettings;
  snapshot: AiScheduleSnapshot;
  notes: Note[];
  tasks: Task[];
  exams: Exam[];
  memory: AiMemoryEntry[];
  actionContext: AiActionContext;
  onRemember: (text: string) => AiMemoryEntry[];
  onRunAction: (action: AiAction) => Promise<{ ok: boolean; message: string }>;
  onAfterAction?: () => void;
  onOpenSettings: () => void;
  onNotify: (message: string, tone?: "success" | "error") => void;
}

const TONE_LABEL: Record<AiSettings["persona"]["tone"], string> = {
  concise: "简洁",
  warm: "温和",
  playful: "俏皮",
};

interface PreparedActions {
  id: string;
  actions: AiAction[];
  errors: string[];
}

function attachmentIcon(kind: AiAttachment["kind"]) {
  if (kind === "image") return <ImageIcon size={14} />;
  if (kind === "spreadsheet") return <FileSpreadsheet size={14} />;
  return <FileText size={14} />;
}

export function AiChatPanel({
  settings,
  snapshot,
  notes,
  tasks,
  exams,
  memory,
  actionContext,
  onRemember,
  onRunAction,
  onAfterAction,
  onOpenSettings,
  onNotify,
}: AiChatPanelProps) {
  const [chat, setChat] = useState<AiChatData>(() => loadChat());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedActions[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const locked = busy || runningId !== null;
  const attachmentsReading = attachments.some((attachment) => attachment.status === "reading");
  const readyAttachments = attachments.filter((attachment) => attachment.status === "ready");

  useEffect(() => {
    saveChat(chat);
  }, [chat]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chat.messages.length, busy, prepared.length, runningId, attachments.length]);

  const hasUserMessage = chat.messages.some((message) => message.role === "user");
  const suggestions = [
    "今天有什么课？",
    snapshot.nextSession ? "下一节是什么？" : "这周还有几节课？",
    snapshot.courses[0] ? `${snapshot.courses[0].name}在哪上？` : "第 8 周有几节课？",
    "帮我找一下复习笔记",
    "新建任务：周五交高数作业",
  ];

  const pushAssistant = (content: string): string => {
    const now = new Date();
    const message = createChatMessage("assistant", content, now);
    setChat((current) => appendChat(current, message, now));
    return message.id;
  };

  const handleReply = (raw: string, truncated = false) => {
    const parsed = parseAiActions(raw);
    let display =
      parsed.text ||
      (parsed.actions.length > 0
        ? "我已准备好操作，请核对下面的动作卡后确认。"
        : "这次没有拿到内容，再试一次？");
    if (truncated) {
      display += parsed.text
        ? "\n\n> 这条回复达到模型单次输出上限，后面可能没有说完。可以回复「继续」让我接着补全。"
        : "回复在生成时被截断了，没有形成完整内容。请让我减少单次输出的课程数量，或分两次处理。";
    }
    const reply = createChatMessage("assistant", display, new Date());
    setChat((current) => appendChat(current, reply, new Date()));
    if (parsed.actions.length > 0 || parsed.errors.length > 0) {
      setPrepared((current) => [
        ...current,
        { id: reply.id, actions: parsed.actions, errors: parsed.errors },
      ]);
    }
  };

  const readManual = (action: AiAction): string => {
    const section = findManualSection(String(action.args.section ?? ""));
    if (!section) {
      return `没有找到这个手册章节。可用章节：${AI_MANUAL_INDEX}`;
    }
    pushAssistant(`【手册 · ${section.title}】\n${section.body.slice(0, 5000)}`);
    return `已读取手册「${section.title}」。`;
  };

  const executePrepared = async (item: PreparedActions) => {
    if (runningId !== null) return;
    setRunningId(item.id);
    const results: string[] = [];
    let allOk = true;
    for (const action of item.actions) {
      if (action.action === "read_manual") {
        results.push(readManual(action));
        continue;
      }
      const validation = validateAiAction(action, actionContext);
      if (!validation.ok) {
        allOk = false;
        results.push(`未执行：${validation.error}`);
        continue;
      }
      try {
        const result = await onRunAction(validation.action);
        results.push(result.ok ? result.message : `未完成：${result.message}`);
        if (!result.ok) allOk = false;
      } catch {
        allOk = false;
        results.push("未完成：执行时出现异常，请稍后再试。");
      }
    }
    pushAssistant(
      `${allOk ? "动作处理完成" : "部分动作没有完成"}：\n${results
        .map((result) => `· ${result}`)
        .join("\n")}`,
    );
    setPrepared((current) => current.filter((entry) => entry.id !== item.id));
    setRunningId(null);
    onAfterAction?.();
    onNotify(allOk ? "动作已处理。" : "动作没有全部完成，请查看结果。", allOk ? "success" : "error");
  };

  const cancelPrepared = (item: PreparedActions) => {
    setPrepared((current) => current.filter((entry) => entry.id !== item.id));
    pushAssistant("已取消这次操作，没有修改任何数据。");
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const addFiles = (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    if (locked) {
      onNotify("请等当前回答或动作执行完再添加附件。", "error");
      return;
    }
    const room = MAX_AI_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      onNotify(`一次最多 ${MAX_AI_ATTACHMENTS} 个附件，请先移除一些。`, "error");
      return;
    }
    let images = attachments.filter((attachment) => attachment.kind === "image").length;
    let skippedImages = 0;
    const accepted: Array<{ file: File; pending: AiAttachment }> = [];
    for (const file of list) {
      if (accepted.length >= room) break;
      const pending = createPendingAttachment(file);
      if (pending.kind === "image") {
        if (images >= MAX_AI_ATTACHMENT_IMAGES) {
          skippedImages += 1;
          continue;
        }
        images += 1;
      }
      accepted.push({ file, pending });
    }
    if (list.length > room) {
      onNotify(`附件最多 ${MAX_AI_ATTACHMENTS} 个，超出部分已跳过。`, "error");
    }
    if (skippedImages > 0) {
      onNotify(`一次最多 ${MAX_AI_ATTACHMENT_IMAGES} 张图片，多出的 ${skippedImages} 张已跳过。`, "error");
    }
    if (accepted.length === 0) return;
    setAttachments((current) => [...current, ...accepted.map((item) => item.pending)]);
    for (const { file, pending } of accepted) {
      void extractAiAttachment(file, { id: pending.id, totalWeeks: snapshot.totalWeeks })
        .then((done) => {
          setAttachments((current) =>
            current.map((item) => (item.id === pending.id ? done : item)),
          );
        })
        .catch(() => {
          setAttachments((current) =>
            current.map((item) =>
              item.id === pending.id
                ? { ...item, status: "error", summary: "读取失败", error: "读取文件失败，请重试。" }
                : item,
            ),
          );
        });
    }
  };

  const prepareCourseImport = (attachment: AiAttachment) => {
    const seeds = attachment.courseSeeds ?? [];
    if (seeds.length === 0) return;
    const replyId = pushAssistant(
      `我从「${attachment.name}」解析出 ${seeds.length} 门课程，已整理成导入动作。请核对下面的动作卡后确认。`,
    );
    setPrepared((current) => [
      ...current,
      {
        id: replyId,
        actions: [
          {
            action: "add_courses_from_text",
            args: { text: courseSeedsToText(seeds), parsedCount: seeds.length },
            reason: `来自附件「${attachment.name}」`,
          },
        ],
        errors: [],
      },
    ]);
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    onNotify("已生成课程导入动作，请确认。");
  };

  const send = async (raw: string) => {
    const content = raw.trim();
    const ready = readyAttachments;
    const failed = attachments.filter((attachment) => attachment.status === "error");
    if (locked) return;
    if (attachmentsReading) {
      onNotify("附件还在解析，稍等一下再发送。", "error");
      return;
    }
    if (!content && ready.length === 0) {
      onNotify("写点问题，或先拖入附件。", "error");
      return;
    }
    if (failed.length > 0) {
      onNotify(`有 ${failed.length} 个附件没读取成功，已跳过。`, "error");
    }

    const now = new Date();
    const displayContent = content || "请看看这些附件。";
    const userMessage = createChatMessage(
      "user",
      displayContent,
      now,
      attachmentsToMeta(ready),
    );
    const pendingChat = appendChat(chat, userMessage, now);
    setChat(pendingChat);
    setInput("");
    setAttachments([]);

    const memoryText = extractMemoryRequest(content);
    const nextMemory = memoryText ? onRemember(memoryText) : memory;

    if (settings.provider === "local") {
      const courseAttachments = ready.filter((attachment) => (attachment.courseSeeds?.length ?? 0) > 0);
      if (courseAttachments.length > 0) {
        const seeds = courseAttachments.flatMap((attachment) => attachment.courseSeeds ?? []);
        const replyId = pushAssistant(
          `我在附件里读到 ${seeds.length} 门课程，已经整理成导入动作。本地模式不会擅自写入，请核对下面的动作卡。`,
        );
        setPrepared((current) => [
          ...current,
          {
            id: replyId,
            actions: [
              {
                action: "add_courses_from_text",
                args: { text: courseSeedsToText(seeds), parsedCount: seeds.length },
                reason: "来自拖入的课程表附件",
              },
            ],
            errors: [],
          },
        ]);
        onNotify("已生成课程导入动作，请确认。");
        if (ready.some((attachment) => attachment.kind === "image")) {
          onNotify("本地模式读不了图片，本次只处理了课程表附件。", "error");
        }
        return;
      }
      if (ready.some((attachment) => attachment.kind === "image")) {
        pushAssistant(
          "本地规则模式不能读图。把提供方切换成「OpenAI 兼容」并填写支持图片输入的模型后，再把图片发给我。",
        );
        onNotify("图片需要远程视觉模型。", "error");
        return;
      }
      const described = ready.filter((attachment) => attachment.text);
      if (described.length > 0) {
        const digest = described
          .map((attachment) => {
            const body = attachment.text ?? "";
            const limit = attachment.name.toLocaleLowerCase().endsWith(".ics") ? 20_000 : 600;
            const excerpt = body.length > limit ? `${body.slice(0, limit)}…` : body;
            return `· ${attachment.name}（${attachment.summary}）\n${excerpt}`;
          })
          .join("\n\n");
        pushAssistant(
          `我在本地读完了这些附件：\n\n${digest}\n\n本地模式只做本地整理；切换到「OpenAI 兼容」后，我可以继续分析内容并生成任务、考试、笔记或导入动作。`,
        );
        return;
      }
      if (ready.length > 0) {
        pushAssistant(
          "附件已经在本地读完，但本地规则模式只会处理固定指令和课程表文本。切换到「OpenAI 兼容」后，我就能按文件内容整理任务、笔记或考试。",
        );
        onNotify("本地模式无法理解这类附件。", "error");
        return;
      }
    }

    setBusy(true);
    try {
      const requestMessages =
        ready.length > 0
          ? [
              ...chat.messages,
              createChatMessage("user", buildAttachmentPromptBlock(ready, content), now),
            ]
          : pendingChat.messages;
      const result = await complete(
        {
          messages: requestMessages,
          images: attachmentImages(ready),
          hasAttachments: ready.length > 0,
          snapshot,
          notes,
          tasks,
          exams,
          memory: nextMemory,
        },
        settings,
        undefined,
        now,
      );
      handleReply(result.content || "这次没有拿到内容，再试一次？", result.truncated);
      if (result.error) {
        onNotify("AI 请求没有成功，已返回可读的错误提示。", "error");
      }
    } catch {
      pushAssistant("刚刚出了点问题，没有拿到回答。可以再发一次，或先切回本地规则模式。");
      onNotify("AI 请求失败，请稍后再试。", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={`ai-chat${dragging ? " is-drop-target" : ""}`}
      aria-label="AI 对话"
      onDragEnter={(event: DragEvent<HTMLElement>) => {
        if (locked || !Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event: DragEvent<HTMLElement>) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event: DragEvent<HTMLElement>) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (locked) {
          onNotify("请等当前回答或动作执行完再添加附件。", "error");
          return;
        }
        addFiles(event.dataTransfer.files);
      }}
    >
      {dragging ? (
        <div className="ai-drop-overlay" aria-hidden="true">
          <UploadCloud size={28} />
          <strong>松开即可交给小序</strong>
          <span>图片、Word / PDF、Excel / CSV、文本都行，单个不超过 15 MB</span>
        </div>
      ) : null}
      <header className="ai-chat-head">
        <div className="ai-chat-identity">
          <span className="ai-avatar" aria-hidden="true">
            <Bot size={18} />
          </span>
          <div>
            <strong>{settings.persona.name}</strong>
            <span>
              {settings.provider === "local" ? "本地规则" : settings.model || "远程模型"}
              {" · "}
              {TONE_LABEL[settings.persona.tone]}
            </span>
          </div>
        </div>
        <div className="ai-chat-actions">
          <button className="ai-ghost-button" type="button" onClick={onOpenSettings}>
            <Settings2 size={14} />
            设置
          </button>
          <button
            className="ai-ghost-button"
            type="button"
            onClick={() => setClearOpen(true)}
            disabled={chat.messages.length === 0}
          >
            <Eraser size={14} />
            清空
          </button>
        </div>
      </header>

      <div className="ai-chat-log" ref={logRef}>
        {chat.messages.length === 0 && prepared.length === 0 ? (
          <div className="ai-chat-empty">
            <span className="ai-empty-mark" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <h3>今天想先看哪节课？</h3>
            <p>
              我看到的是第 {snapshot.week} 周的课表。可以问时间、教室、下一节，
              也可以让我建任务、记笔记或打开某个页面。把课表截图、Word、PDF、Excel 或笔记文件拖进来，我会自己判断怎么用。
            </p>
            <div className="ai-suggestions">
              {suggestions.map((item) => (
                <button key={item} type="button" onClick={() => void send(item)} disabled={locked}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="ai-messages">
            {chat.messages.map((message) => (
              <li key={message.id} className={`ai-message ai-message--${message.role}`}>
                <span className="ai-message-role">
                  {message.role === "assistant" ? settings.persona.name : "我"}
                </span>
                {message.role === "assistant" ? (
                  <MarkdownMessage content={message.content} />
                ) : (
                  <p>{message.content}</p>
                )}
                {message.attachments && message.attachments.length > 0 ? (
                  <ul className="ai-message-attachments" aria-label="已发送附件">
                    {message.attachments.map((attachment, index) => (
                      <li key={`${message.id}-attachment-${index}`}>
                        {attachmentIcon(attachment.kind)}
                        {attachment.name}
                        <span>{attachmentKindLabel(attachment.kind)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {busy ? (
              <li className="ai-message ai-message--assistant ai-message--pending">
                <span className="ai-message-role">{settings.persona.name}</span>
                <p className="ai-typing" aria-label="正在回答">
                  <span />
                  <span />
                  <span />
                </p>
              </li>
            ) : null}
          </ol>
        )}

        {prepared.map((item) => (
          <div className="ai-action-card" key={item.id} role="group" aria-label="待确认动作">
            <header className="ai-action-head">
              <span className="ai-action-mark" aria-hidden="true">
                <Sparkles size={15} />
              </span>
              <div>
                <strong>
                  {item.actions.length > 0
                    ? `已准备 ${item.actions.length} 个操作`
                    : "动作没有解析成功"}
                </strong>
                <small>执行前请核对；写操作会修改本机数据，删除后不可恢复。</small>
              </div>
            </header>
            {item.actions.length > 0 ? (
              <ol className="ai-action-list">
                {item.actions.map((action, index) => (
                  <li key={`${item.id}-${index}`}>
                    <span>{describeAiAction(action, actionContext)}</span>
                    {isDestructiveAction(action) ? (
                      <small className="ai-action-danger">
                        <TriangleAlert size={12} />
                        高风险
                      </small>
                    ) : null}
                    {action.reason ? <small className="ai-action-reason">{action.reason}</small> : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {item.errors.length > 0 ? (
              <p className="ai-action-error">
                <TriangleAlert size={13} />
                {item.errors.join(" ")}
              </p>
            ) : null}
            <div className="ai-action-buttons">
              {item.actions.length > 0 ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void executePrepared(item)}
                  disabled={runningId !== null}
                >
                  <Play size={14} />
                  {runningId === item.id ? "执行中…" : "执行"}
                </button>
              ) : null}
              <button
                className="ai-ghost-button"
                type="button"
                onClick={() => cancelPrepared(item)}
                disabled={runningId === item.id}
              >
                <X size={14} />
                取消
              </button>
            </div>
          </div>
        ))}
      </div>

      {hasUserMessage && !locked ? (
        <div className="ai-quick-row">
          {suggestions.slice(0, 3).map((item) => (
            <button key={item} type="button" onClick={() => void send(item)}>
              {item}
            </button>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="ai-attachment-tray" aria-label="待发送附件">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className={`ai-attachment${attachment.status === "error" ? " is-error" : ""}`}
            >
              <span className="ai-attachment-icon" aria-hidden="true">
                {attachment.status === "reading" ? (
                  <LoaderCircle className="ai-attachment-spin" size={14} />
                ) : attachment.status === "error" ? (
                  <FileWarning size={14} />
                ) : (
                  attachmentIcon(attachment.kind)
                )}
              </span>
              <span className="ai-attachment-copy">
                <strong title={attachment.name}>{attachment.name}</strong>
                <small>
                  {attachment.status === "reading"
                    ? "正在本地解析…"
                    : attachment.error ??
                      `${attachment.summary} · ${formatAttachmentSize(attachment.size)}`}
                </small>
              </span>
              {attachment.status === "ready" && (attachment.courseSeeds?.length ?? 0) > 0 ? (
                <button
                  className="ai-attachment-import"
                  type="button"
                  onClick={() => prepareCourseImport(attachment)}
                >
                  导入 {attachment.courseSeeds?.length} 门课
                </button>
              ) : null}
              <button
                className="ai-attachment-remove"
                type="button"
                aria-label={`移除 ${attachment.name}`}
                onClick={() => removeAttachment(attachment.id)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <form
        className="ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <button
          className="ai-attach-button"
          type="button"
          aria-label="添加附件"
          title="添加附件（也可以直接拖入对话）"
          onClick={() => fileRef.current?.click()}
          disabled={locked}
        >
          <Paperclip size={16} />
        </button>
        <textarea
          className="field-input"
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder="问点什么，或拖入课表 / Word / PDF / Excel 文件"
          aria-label="输入问题"
          disabled={locked}
        />
        <button
          className="primary-button ai-send"
          type="submit"
          disabled={
            locked ||
            attachmentsReading ||
            (input.trim().length === 0 && readyAttachments.length === 0)
          }
        >
          <Send size={15} />
          发送
        </button>
      </form>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={AI_ATTACHMENT_ACCEPT}
        hidden
        aria-label="选择附件"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <p className="ai-chat-foot">
        <CircleAlert size={12} />
        {settings.provider === "local"
          ? "本地规则模式，不联网；支持固定指令与查课。"
          : "远程模式下，只会发送你授权范围内的数据和本轮附件。"}
        {" "}
        可拖入图片、Word、PDF、Excel、文本；按 Enter 发送，Shift + Enter 换行。
      </p>

      {clearOpen ? (
        <ConfirmDialog
          title="清空对话记录？"
          message="聊天记录只保存在本机，清空后无法恢复。设置和笔记不会受影响。待确认的动作也会被丢弃。"
          confirmLabel="清空对话"
          tone="danger"
          onConfirm={() => {
            setChat({ version: 1, messages: [], updatedAt: new Date().toISOString() });
            setPrepared([]);
            setClearOpen(false);
            onNotify("对话记录已清空。");
          }}
          onCancel={() => setClearOpen(false)}
        />
      ) : null}
    </section>
  );
}