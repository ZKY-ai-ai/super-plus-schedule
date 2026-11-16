import { useEffect, useState } from "react";
import { Bot, Heart, KeyRound, Plus, ShieldCheck, Sparkles, Trash2, UserRound } from "lucide-react";
import {
  DEFAULT_AI_SETTINGS,
  describePermissions,
  normalizeAiSettings,
  type AiMemoryEntry,
  type AiPersona,
  type AiPermissions,
  type AiSettings,
  type AiTone,
} from "../../lib/ai";
import { ConfirmDialog } from "../ConfirmDialog";
import "../../styles/ai.css";

interface AiSettingsPanelProps {
  settings: AiSettings;
  memory: AiMemoryEntry[];
  onAddMemory: (text: string) => void;
  onRemoveMemory: (id: string) => void;
  onClearMemory: () => void;
  onSave: (next: AiSettings) => void;
  onNotify?: (message: string, tone?: "success" | "error") => void;
}

const TONES: Array<{ value: AiTone; label: string; hint: string }> = [
  { value: "concise", label: "简洁", hint: "先给结论，三句话内" },
  { value: "warm", label: "温和", hint: "像熟悉校园的朋友" },
  { value: "playful", label: "俏皮", hint: "轻快一点点" },
];

function isValidBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function AiSettingsPanel({
  settings,
  memory,
  onAddMemory,
  onRemoveMemory,
  onClearMemory,
  onSave,
  onNotify,
}: AiSettingsPanelProps) {
  const [draft, setDraft] = useState<AiSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoryInput, setMemoryInput] = useState("");
  const [clearMemoryOpen, setClearMemoryOpen] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updatePersona = (patch: Partial<AiPersona>) => {
    setDraft((current) => ({
      ...current,
      persona: { ...current.persona, ...patch },
    }));
  };

  const togglePermission = (key: keyof AiPermissions) => {
    setDraft((current) => ({
      ...current,
      permissions: { ...current.permissions, [key]: !current.permissions[key] },
    }));
  };

  const save = () => {
    if (draft.provider === "openai-compatible") {
      if (!isValidBaseUrl(draft.baseUrl)) {
        setError("Base URL 需要是 http(s) 地址，例如 https://api.openai.com/v1。");
        return;
      }
      if (!draft.apiKey.trim()) {
        setError("远程模式需要填写 API Key；也可以先切回本地规则模式。");
        return;
      }
    }
    if (!draft.persona.name.trim()) {
      setError("给 AI 起一个名字吧。");
      return;
    }
    setError(null);
    onSave(normalizeAiSettings(draft));
    onNotify?.("AI 设置已保存在本机。");
  };

  const addMemoryEntry = () => {
    const value = memoryInput.trim();
    if (!value) return;
    onAddMemory(value);
    setMemoryInput("");
  };

  return (
    <div className="ai-settings">
      <section className="ai-settings-section">
        <div className="ai-settings-heading">
          <Sparkles size={15} />
          <div>
            <h3>运行模式</h3>
            <p>本地规则零配置可用；远程模式只对接兼容 OpenAI 的接口。</p>
          </div>
        </div>
        <div className="ai-segmented" role="group" aria-label="AI 运行模式">
          <button
            type="button"
            className={draft.provider === "local" ? "is-active" : ""}
            onClick={() => setDraft((current) => ({ ...current, provider: "local" }))}
          >
            本地规则
          </button>
          <button
            type="button"
            className={draft.provider === "openai-compatible" ? "is-active" : ""}
            onClick={() =>
              setDraft((current) => ({ ...current, provider: "openai-compatible" }))
            }
          >
            OpenAI 兼容
          </button>
        </div>

        {draft.provider === "openai-compatible" ? (
          <div className="ai-field-grid">
            <label className="ai-field ai-field--wide">
              <span>Base URL</span>
              <input
                className="field-input"
                value={draft.baseUrl}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, baseUrl: event.target.value }))
                }
                placeholder="https://api.openai.com/v1"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="ai-field">
              <span>
                <KeyRound size={12} /> API Key
              </span>
              <span className="ai-key-row">
                <input
                  className="field-input"
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, apiKey: event.target.value }))
                  }
                  placeholder="sk-..."
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  className="ai-ghost-button"
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                >
                  {showKey ? "隐藏" : "显示"}
                </button>
              </span>
            </label>
            <label className="ai-field">
              <span>模型</span>
              <input
                className="field-input"
                value={draft.model}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, model: event.target.value }))
                }
                placeholder="gpt-4o-mini"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>
        ) : (
          <p className="ai-inline-hint">
            本地规则不会联网，能回答课表与笔记相关的问题。需要自由聊天时再切换远程模式。
          </p>
        )}
      </section>

      <section className="ai-settings-section">
        <div className="ai-settings-heading">
          <UserRound size={15} />
          <div>
            <h3>人格</h3>
            <p>名字和语气只影响表达方式，不影响事实。</p>
          </div>
        </div>
        <label className="ai-field">
          <span>名字</span>
          <input
            className="field-input"
            maxLength={20}
            value={draft.persona.name}
            onChange={(event) => updatePersona({ name: event.target.value })}
            placeholder={DEFAULT_AI_SETTINGS.persona.name}
          />
        </label>
        <div className="ai-tone-row">
          {TONES.map((tone) => (
            <button
              key={tone.value}
              type="button"
              className={draft.persona.tone === tone.value ? "is-active" : ""}
              onClick={() => updatePersona({ tone: tone.value })}
              title={tone.hint}
            >
              <strong>{tone.label}</strong>
              <small>{tone.hint}</small>
            </button>
          ))}
        </div>
        <label className="ai-field">
          <span>补充设定（可选）</span>
          <textarea
            className="field-input ai-textarea"
            rows={3}
            maxLength={500}
            value={draft.persona.customPrompt}
            onChange={(event) => updatePersona({ customPrompt: event.target.value })}
            placeholder="例如：回答时先列出时间地点，再补充提醒；不要使用感叹号。"
          />
        </label>
      </section>

      <section className="ai-settings-section">
        <div className="ai-settings-heading">
          <Heart size={15} />
          <div>
            <h3>长期记忆</h3>
            <p>只保存你主动说「记住」的内容，可随时逐条删除。</p>
          </div>
        </div>
        <div className="ai-memory-add">
          <input
            className="field-input"
            maxLength={200}
            value={memoryInput}
            onChange={(event) => setMemoryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                addMemoryEntry();
              }
            }}
            placeholder="例如：周三下午没空，别排复习"
            aria-label="新增一条记忆"
          />
          <button
            className="secondary-button"
            type="button"
            onClick={addMemoryEntry}
            disabled={memoryInput.trim().length === 0}
          >
            <Plus size={14} />
            添加
          </button>
        </div>
        {memory.length === 0 ? (
          <p className="ai-inline-hint">
            还没有记忆。在对话里说「记住我周三下午没空」，或在这里手动添加。
          </p>
        ) : (
          <ul className="ai-memory-list">
            {memory.map((entry) => (
              <li key={entry.id}>
                <span>{entry.text}</span>
                <button
                  className="ai-ghost-button"
                  type="button"
                  onClick={() => onRemoveMemory(entry.id)}
                  aria-label={`删除记忆：${entry.text}`}
                >
                  <Trash2 size={13} />
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ai-memory-foot">
          <p className="ai-inline-hint">
            <ShieldCheck size={13} /> 记忆只存在本机；远程模式下会随请求发送给你选择的模型。
          </p>
          <button
            className="ai-inline-link"
            type="button"
            disabled={memory.length === 0}
            onClick={() => setClearMemoryOpen(true)}
          >
            清空全部记忆
          </button>
        </div>
      </section>

      <section className="ai-settings-section">
        <div className="ai-settings-heading">
          <ShieldCheck size={15} />
          <div>
            <h3>数据授权</h3>
            <p>逐项开启，关闭后 AI 完全看不到对应数据。</p>
          </div>
        </div>
        <ul className="ai-permission-list">
          {describePermissions(draft.permissions).map((item) => (
            <li key={item.key}>
              <div className="ai-permission-copy">
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={item.enabled}
                aria-label={`${item.label}授权`}
                className={`ai-switch ${item.enabled ? "is-on" : ""}`}
                onClick={() => togglePermission(item.key)}
              >
                <span />
              </button>
            </li>
          ))}
        </ul>
        <p className="ai-inline-hint">
          <Bot size={13} /> 关闭某项授权后，新的请求不再携带对应数据；历史对话里已出现的内容仍会作为上下文发送，可在对话页一键清空。
        </p>
        <p className="ai-inline-hint">
          <ShieldCheck size={13} /> 所有设置、密钥和聊天记录都只保存在这台设备，不会上传到课序服务器。
        </p>
      </section>

      {error ? <p className="inline-notice inline-notice--error">{error}</p> : null}

      <div className="ai-settings-footer">
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setDraft(settings);
            setError(null);
          }}
        >
          还原
        </button>
        <button className="primary-button" type="button" onClick={save}>
          保存设置
        </button>
      </div>

      {clearMemoryOpen ? (
        <ConfirmDialog
          title="清空全部长期记忆？"
          message={`将删除 ${memory.length} 条记忆，删除后无法恢复。课表、笔记与聊天记录不受影响。`}
          confirmLabel="清空记忆"
          tone="danger"
          onConfirm={() => {
            onClearMemory();
            setClearMemoryOpen(false);
          }}
          onCancel={() => setClearMemoryOpen(false)}
        />
      ) : null}
    </div>
  );
}
