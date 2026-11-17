import { useState } from "react";
import { Bot, Heart, Plus, ShieldCheck, Sparkles, Trash2, UserRound } from "lucide-react";
import {
  DEFAULT_AI_SETTINGS,
  addMemory,
  clearMemory,
  describePermissions,
  loadAiSettings,
  loadMemory,
  normalizeAiSettings,
  removeMemory,
  saveAiSettings,
  saveMemory,
  type AiMemoryData,
  type AiPermissions,
  type AiPersona,
  type AiSettings,
  type AiTone,
} from "../../lib/ai";
import { ConfirmDialog } from "../ConfirmDialog";
import "../../styles/ai.css";

interface PersonaPageProps {
  onNotify: (message: string, tone?: "success" | "error") => void;
}

const TONES: Array<{ value: AiTone; label: string; hint: string }> = [
  { value: "concise", label: "简洁", hint: "先给结论，三句话内" },
  { value: "warm", label: "温和", hint: "像熟悉校园的朋友" },
  { value: "playful", label: "俏皮", hint: "轻快一点点" },
];

export function PersonaPage({ onNotify }: PersonaPageProps) {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [draft, setDraft] = useState<AiSettings>(() => loadAiSettings());
  const [memory, setMemory] = useState<AiMemoryData>(() => loadMemory());
  const [memoryInput, setMemoryInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clearMemoryOpen, setClearMemoryOpen] = useState(false);

  const dirty =
    JSON.stringify(draft.persona) !== JSON.stringify(settings.persona) ||
    JSON.stringify(draft.permissions) !== JSON.stringify(settings.permissions);

  const updatePersona = (patch: Partial<AiPersona>) => {
    setDraft((current) => ({ ...current, persona: { ...current.persona, ...patch } }));
  };

  const togglePermission = (key: keyof AiPermissions) => {
    setDraft((current) => ({
      ...current,
      permissions: { ...current.permissions, [key]: !current.permissions[key] },
    }));
  };

  const save = () => {
    if (!draft.persona.name.trim()) {
      setError("给 AI 起一个名字吧。");
      return;
    }
    setError(null);
    const next = normalizeAiSettings({ ...settings, persona: draft.persona, permissions: draft.permissions });
    if (!saveAiSettings(next)) {
      setError("本机存储不可用，设置没有保存成功。");
      return;
    }
    setSettings(next);
    setDraft(next);
    onNotify("人格与授权已保存在本机。");
  };

  const addMemoryEntry = () => {
    const value = memoryInput.trim();
    if (!value) return;
    const next = addMemory(memory, value);
    saveMemory(next);
    setMemory(next);
    setMemoryInput("");
    onNotify("已加入长期记忆，可随时逐条删除。");
  };

  const forget = (id: string) => {
    const next = removeMemory(memory, id);
    saveMemory(next);
    setMemory(next);
    onNotify("已删除这条记忆。");
  };

  const forgetAll = () => {
    const next = clearMemory(memory);
    saveMemory(next);
    setMemory(next);
    onNotify("长期记忆已清空。");
  };

  return (
    <div className="persona-page">
      <section className="ai-hero models-hero">
        <div className="ai-hero-copy">
          <span className="eyebrow">PERSONA & MEMORY</span>
          <h1>人格与记忆</h1>
          <p>
            名字和语气只影响表达方式，不影响事实；记忆只保存你主动说「记住」的内容；
            数据授权逐项开关，关闭后 AI 完全看不到对应数据。
          </p>
          <div className="ai-hero-chips">
            <span>
              <UserRound size={13} />
              {settings.persona.name}
            </span>
            <span>
              <Heart size={13} />
              记忆 {memory.entries.length} 条
            </span>
            <span>
              <ShieldCheck size={13} />
              已授权 {describePermissions(settings.permissions).filter((item) => item.enabled).length} 项
            </span>
            {dirty ? <span className="models-dirty-chip">有未保存修改</span> : null}
          </div>
        </div>
      </section>

      <div className="ai-settings persona-settings">
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
          {memory.entries.length === 0 ? (
            <p className="ai-inline-hint">
              还没有记忆。在对话里说「记住我周三下午没空」，或在这里手动添加。
            </p>
          ) : (
            <ul className="ai-memory-list">
              {memory.entries.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.text}</span>
                  <button
                    className="ai-ghost-button"
                    type="button"
                    onClick={() => forget(entry.id)}
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
              <ShieldCheck size={13} /> 记忆只存在本机；使用云端模型时会随请求发送给你选择的服务商。
            </p>
            <button
              className="ai-inline-link"
              type="button"
              disabled={memory.entries.length === 0}
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
            <ShieldCheck size={13} /> 所有设置、密钥和聊天记录都只保存在这台设备，不会上传到课序PLUS服务器。
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
          <button className="primary-button" type="button" onClick={save} disabled={!dirty}>
            <Sparkles size={15} />
            保存人格与授权
          </button>
        </div>
      </div>

      {clearMemoryOpen ? (
        <ConfirmDialog
          title="清空全部长期记忆？"
          message={`将删除 ${memory.entries.length} 条记忆，删除后无法恢复。课表、笔记与聊天记录不受影响。`}
          confirmLabel="清空记忆"
          tone="danger"
          onConfirm={() => {
            forgetAll();
            setClearMemoryOpen(false);
          }}
          onCancel={() => setClearMemoryOpen(false)}
        />
      ) : null}
    </div>
  );
}