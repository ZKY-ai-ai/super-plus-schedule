import { useEffect, useRef, useState } from "react";
import { Bot, CircleAlert, Eraser, Send, Settings2, Sparkles } from "lucide-react";
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
import type { Note } from "../../lib/notes";
import { ConfirmDialog } from "../ConfirmDialog";

interface AiChatPanelProps {
  settings: AiSettings;
  snapshot: AiScheduleSnapshot;
  notes: Note[];
  memory: AiMemoryEntry[];
  onRemember: (text: string) => AiMemoryEntry[];
  onOpenSettings: () => void;
  onNotify: (message: string, tone?: "success" | "error") => void;
}

const TONE_LABEL: Record<AiSettings["persona"]["tone"], string> = {
  concise: "简洁",
  warm: "温和",
  playful: "俏皮",
};

export function AiChatPanel({
  settings,
  snapshot,
  notes,
  memory,
  onRemember,
  onOpenSettings,
  onNotify,
}: AiChatPanelProps) {
  const [chat, setChat] = useState<AiChatData>(() => loadChat());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveChat(chat);
  }, [chat]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chat.messages.length, busy]);

  const hasUserMessage = chat.messages.some((message) => message.role === "user");
  const suggestions = [
    "今天有什么课？",
    snapshot.nextSession ? "下一节是什么？" : "这周还有几节课？",
    snapshot.courses[0] ? `${snapshot.courses[0].name}在哪上？` : "第 8 周有几节课？",
    "帮我找一下复习笔记",
    "记住我周三下午没空",
  ];

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || busy) return;
    const now = new Date();
    const userMessage = createChatMessage("user", content, now);
    const pendingChat = appendChat(chat, userMessage, now);
    setChat(pendingChat);
    setInput("");
    setBusy(true);
    const memoryText = extractMemoryRequest(content);
    const nextMemory = memoryText ? onRemember(memoryText) : memory;
    try {
      const result = await complete(
        { messages: pendingChat.messages, snapshot, notes, memory: nextMemory },
        settings,
        undefined,
        now,
      );
      const reply = createChatMessage(
        "assistant",
        result.content || "这次没有拿到内容，再试一次？",
        new Date(),
      );
      setChat((current) => appendChat(current, reply, new Date()));
      if (result.error) {
        onNotify("AI 请求没有成功，已返回可读的错误提示。", "error");
      }
    } catch {
      const fallback = createChatMessage(
        "assistant",
        "刚刚出了点问题，没有拿到回答。可以再发一次，或先切回本地规则模式。",
        new Date(),
      );
      setChat((current) => appendChat(current, fallback, new Date()));
      onNotify("AI 请求失败，请稍后再试。", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ai-chat" aria-label="AI 对话">
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
        {chat.messages.length === 0 ? (
          <div className="ai-chat-empty">
            <span className="ai-empty-mark" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <h3>今天想先看哪节课？</h3>
            <p>
              我看到的是第 {snapshot.week} 周的课表。可以问时间、教室、下一节，
              或者让我翻翻笔记。
            </p>
            <div className="ai-suggestions">
              {suggestions.map((item) => (
                <button key={item} type="button" onClick={() => void send(item)}>
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
                <p>{message.content}</p>
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
      </div>

      {hasUserMessage && !busy ? (
        <div className="ai-quick-row">
          {suggestions.slice(0, 3).map((item) => (
            <button key={item} type="button" onClick={() => void send(item)}>
              {item}
            </button>
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
          placeholder="问点什么，比如「下一节在哪」"
          aria-label="输入问题"
          disabled={busy}
        />
        <button
          className="primary-button ai-send"
          type="submit"
          disabled={busy || input.trim().length === 0}
        >
          <Send size={15} />
          发送
        </button>
      </form>

      <p className="ai-chat-foot">
        <CircleAlert size={12} />
        {settings.provider === "local"
          ? "本地规则模式，不联网。"
          : "远程模式下，只会发送你授权范围内的数据。"}
        {" "}
        按 Enter 发送，Shift + Enter 换行。
      </p>

      {clearOpen ? (
        <ConfirmDialog
          title="清空对话记录？"
          message="聊天记录只保存在本机，清空后无法恢复。设置和笔记不会受影响。"
          confirmLabel="清空对话"
          tone="danger"
          onConfirm={() => {
            setChat({ version: 1, messages: [], updatedAt: new Date().toISOString() });
            setClearOpen(false);
            onNotify("对话记录已清空。");
          }}
          onCancel={() => setClearOpen(false)}
        />
      ) : null}
    </section>
  );
}
