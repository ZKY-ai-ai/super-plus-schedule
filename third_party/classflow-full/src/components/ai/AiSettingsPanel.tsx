import { useEffect, useId, useState } from "react";
import {
  Bot,
  Heart,
  KeyRound,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_AI_SETTINGS,
  describePermissions,
  getAiProviderPreset,
  normalizeAiSettings,
  testAiConnection,
  validateAiSettings,
  type AiMemoryEntry,
  type AiPersona,
  type AiPermissions,
  type AiProviderGroup,
  type AiProviderId,
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
  onSave?: (next: AiSettings) => void;
  onChange?: (next: AiSettings) => void;
  onNotify?: (message: string, tone?: "success" | "error") => void;
  view?: "all" | "model" | "profile";
}

const TONES: Array<{ value: AiTone; label: string; hint: string }> = [
  { value: "concise", label: "简洁", hint: "先给结论，三句话内" },
  { value: "warm", label: "温和", hint: "像熟悉校园的朋友" },
  { value: "playful", label: "俏皮", hint: "轻快一点点" },
];

type AiSettingsMode = AiProviderGroup;

const CLOUD_PROVIDERS = AI_PROVIDER_PRESETS.filter((preset) => preset.group === "cloud");
const LOCAL_PROVIDERS = AI_PROVIDER_PRESETS.filter((preset) => preset.group === "local");

export function AiSettingsPanel({
  settings,
  memory,
  onAddMemory,
  onRemoveMemory,
  onClearMemory,
  onSave,
  onChange,
  onNotify,
  view = "all",
}: AiSettingsPanelProps) {
  const [draft, setDraft] = useState<AiSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoryInput, setMemoryInput] = useState("");
  const [clearMemoryOpen, setClearMemoryOpen] = useState(false);
  const [testState, setTestState] = useState<{
    status: "testing" | "success" | "error";
    message: string;
  } | null>(null);
  const [keyCache, setKeyCache] = useState<Partial<Record<AiProviderId, string>>>({});
  const [preferredCloud, setPreferredCloud] = useState<AiProviderId>(() => {
    const preset = getAiProviderPreset(settings.provider);
    return preset?.group === "cloud" ? settings.provider : "openai";
  });
  const [preferredLocal, setPreferredLocal] = useState<AiProviderId>(() => {
    const preset = getAiProviderPreset(settings.provider);
    return preset?.group === "local" ? settings.provider : "ollama";
  });
  const modelListId = useId();

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateDraft = (updater: (current: AiSettings) => AiSettings) => {
    const next = updater(draft);
    setDraft(next);
    setTestState(null);
    onChange?.(next);
  };

  const selectedPreset = getAiProviderPreset(draft.provider);
  const mode: AiSettingsMode = selectedPreset?.group === "local" ? "local" : "cloud";

  const selectProvider = (id: AiProviderId) => {
    if (draft.provider === id) return;
    const preset = getAiProviderPreset(id);
    if (!preset) return;
    if (preset.group === "cloud") setPreferredCloud(id);
    else setPreferredLocal(id);
    const nextKey = keyCache[id] ?? "";
    setKeyCache((cache) => ({ ...cache, [draft.provider]: draft.apiKey }));
    updateDraft((current) => ({
      ...current,
      provider: id,
      baseUrl: preset.baseUrl,
      model: preset.model,
      apiKey: nextKey,
    }));
  };

  const chooseMode = (next: AiSettingsMode) => {
    if (next === mode) return;
    selectProvider(next === "cloud" ? preferredCloud : preferredLocal);
  };

  const runConnectionTest = async () => {
    setTestState({ status: "testing", message: "正在连接…" });
    const result = await testAiConnection(draft);
    setTestState({ status: result.ok ? "success" : "error", message: result.message });
  };

  const updatePersona = (patch: Partial<AiPersona>) => {
    updateDraft((current) => ({
      ...current,
      persona: { ...current.persona, ...patch },
    }));
  };

  const togglePermission = (key: keyof AiPermissions) => {
    updateDraft((current) => ({
      ...current,
      permissions: { ...current.permissions, [key]: !current.permissions[key] },
    }));
  };

  const save = () => {
    const message = validateAiSettings(draft);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    onSave?.(normalizeAiSettings(draft));
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
      {view !== "profile" ? (
        <section className="ai-settings-section">
        <div className="ai-settings-heading">
          <Sparkles size={15} />
          <div>
            <h3>模型服务</h3>
            <p>云端服务和本机 Ollama / LM Studio 都走 OpenAI 兼容协议。</p>
          </div>
        </div>
        <div className="ai-segmented ai-mode-row" role="group" aria-label="AI 运行模式">
          <button
            type="button"
            className={mode === "cloud" ? "is-active" : ""}
            onClick={() => chooseMode("cloud")}
          >
            云端模型
          </button>
          <button
            type="button"
            className={mode === "local" ? "is-active" : ""}
            onClick={() => chooseMode("local")}
          >
            本地模型
          </button>
        </div>

        {draft.provider === "local" ? (
          <p className="ai-inline-hint">
            当前仍是旧的本地规则配置；选择一种云端或本地模型并保存后才会切换。
          </p>
        ) : null}

        <div
          className="ai-provider-grid"
          role="radiogroup"
          aria-label={mode === "cloud" ? "云端服务商" : "本地模型服务"}
        >
          {(mode === "cloud" ? CLOUD_PROVIDERS : LOCAL_PROVIDERS).map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={draft.provider === preset.id}
              className={`ai-provider-card ${draft.provider === preset.id ? "is-active" : ""}`}
              onClick={() => selectProvider(preset.id)}
            >
              <strong>{preset.label}</strong>
              <small>{preset.hint}</small>
            </button>
          ))}
        </div>

        {mode === "local" ? (
          <p className="ai-inline-hint">
            Ollama 默认地址是 http://localhost:11434/v1。浏览器跨域被拦截时，先设置
            OLLAMA_ORIGINS 再启动服务；模型需要提前用 ollama pull 下载。
          </p>
        ) : null}

            <div className="ai-field-grid">
              <label className="ai-field ai-field--wide">
                <span>Base URL</span>
                <input
                  className="field-input"
                  value={draft.baseUrl}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  placeholder={selectedPreset?.baseUrl ?? "https://api.openai.com/v1"}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="ai-field">
                <span>
                  <KeyRound size={12} /> API Key
                  {selectedPreset && !selectedPreset.requiresApiKey ? "（本地可留空）" : ""}
                </span>
                <span className="ai-key-row">
                  <input
                    className="field-input"
                    type={showKey ? "text" : "password"}
                    value={draft.apiKey}
                    onChange={(event) =>
                      updateDraft((current) => ({ ...current, apiKey: event.target.value }))
                    }
                    placeholder={
                      selectedPreset && !selectedPreset.requiresApiKey ? "本地服务通常留空" : "sk-..."
                    }
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
                  list={modelListId}
                  value={draft.model}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, model: event.target.value }))
                  }
                  placeholder={selectedPreset?.model || "例如 qwen2.5:7b"}
                  spellCheck={false}
                  autoComplete="off"
                />
                <datalist id={modelListId}>
                  {(selectedPreset?.models ?? []).map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
            </div>

            <div className="ai-test-row">
              <button
                className="secondary-button"
                type="button"
                onClick={runConnectionTest}
                disabled={testState?.status === "testing"}
              >
                {testState?.status === "testing" ? (
                  <LoaderCircle className="is-spinning" size={14} />
                ) : null}
                {testState?.status === "testing" ? "正在测试…" : "测试连接"}
              </button>
              {testState ? (
                <span className={`ai-test-status is-${testState.status}`} role="status">
                  {testState.message}
                </span>
              ) : null}
            </div>

            <p className="ai-inline-hint">
              <ShieldCheck size={13} /> 测试连接会用当前模型发送一条极短的 ping 请求；密钥只保存在本机。
            </p>
      </section>
      ) : null}

      {view !== "model" ? (
        <>
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
          <ShieldCheck size={13} /> 所有设置、密钥和聊天记录都只保存在这台设备，不会上传到课序PLUS服务器。
        </p>
      </section>
        </>
      ) : null}

      {error ? <p className="inline-notice inline-notice--error">{error}</p> : null}

      {onChange ? null : (
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
      )}

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
