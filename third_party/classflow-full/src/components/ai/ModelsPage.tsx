import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  HardDrive,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  XCircle,
} from "lucide-react";
import {
  AI_PROVIDER_PRESETS,
  DEFAULT_AI_SETTINGS,
  isValidAiBaseUrl,
  loadAiSettings,
  providerPreset,
  saveAiSettings,
  testAiConnection,
  type AiConnectionTestResult,
  type AiProviderId,
  type AiSettings,
} from "../../lib/ai";
import "../../styles/ai.css";

interface ModelsPageProps {
  onNotify: (message: string, tone?: "success" | "error") => void;
}

type TestStatus = "idle" | "testing" | "ok" | "fail";

export function ModelsPage({ onNotify }: ModelsPageProps) {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [draft, setDraft] = useState<AiSettings>(() => loadAiSettings());
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testResult, setTestResult] = useState<AiConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preset = providerPreset(draft.provider);
  const activePreset = providerPreset(settings.provider);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(settings), [draft, settings]);
  const localPresets = AI_PROVIDER_PRESETS.filter((item) => item.kind === "local");
  const cloudPresets = AI_PROVIDER_PRESETS.filter((item) => item.kind === "cloud");

  const selectProvider = (id: AiProviderId) => {
    const next = providerPreset(id);
    setDraft((current) => ({
      ...current,
      provider: id,
      baseUrl: next.baseUrl,
      model: current.provider === id ? current.model : next.model,
      apiKey:
        current.provider === id
          ? current.apiKey
          : (settings.keyVault[id] ?? (settings.provider === id ? settings.apiKey : "")),
    }));
    setModels([]);
    setTestStatus("idle");
    setTestResult(null);
    setError(null);
  };

  const runTest = async (fillModel: boolean) => {
    if (preset.probe === "none") {
      setTestStatus("ok");
      setTestResult({ ok: true, latencyMs: 0, message: "本地规则不联网，无需连接测试。", models: [] });
      return;
    }
    if (!isValidAiBaseUrl(draft.baseUrl)) {
      setTestStatus("fail");
      setTestResult({ ok: false, latencyMs: 0, message: "Base URL 不是合法的 http(s) 地址。", models: [] });
      return;
    }
    setTestStatus("testing");
    setTestResult(null);
    const result = await testAiConnection(draft);
    setTestResult(result);
    setTestStatus(result.ok ? "ok" : "fail");
    setModels(result.models);
    if (result.ok && fillModel && result.models.length > 0 && !draft.model.trim()) {
      setDraft((current) => ({ ...current, model: result.models[0] }));
    }
  };

  const save = () => {
    if (preset.probe !== "none" && !isValidAiBaseUrl(draft.baseUrl)) {
      setError("Base URL 需要是 http(s) 地址，例如 http://127.0.0.1:11434/v1。");
      return;
    }
    setError(null);
    const ok = saveAiSettings(draft);
    if (!ok) {
      setError("本机存储不可用，设置没有保存成功。");
      return;
    }
    const next = loadAiSettings();
    setSettings(next);
    setDraft(next);
    if (providerPreset(next.provider).keyRequired && !next.apiKey.trim()) {
      onNotify(`已保存「${providerPreset(next.provider).label}」，但还没填 API Key，对话时会提示缺失。`, "error");
      return;
    }
    onNotify(`已切换到「${providerPreset(next.provider).label}」，下一次对话即生效。`);
  };

  const resetDefaults = () => {
    setDraft({ ...DEFAULT_AI_SETTINGS, keyVault: settings.keyVault });
    setModels([]);
    setTestStatus("idle");
    setTestResult(null);
    setError(null);
    onNotify("已恢复默认配置（Ollama 本地），记得点保存。");
  };

  const renderCard = (item: (typeof AI_PROVIDER_PRESETS)[number]) => {
    const isActive = settings.provider === item.id;
    const isDraft = draft.provider === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={`models-card ${isDraft ? "is-selected" : ""} ${isActive ? "is-active" : ""}`}
        onClick={() => selectProvider(item.id)}
        aria-pressed={isDraft}
      >
        <span className="models-card-head">
          {item.kind === "cloud" ? <Cloud size={15} /> : <HardDrive size={15} />}
          <strong>{item.label}</strong>
          {isActive ? <em className="models-badge models-badge--active">使用中</em> : null}
        </span>
        <small>{item.note}</small>
        <span className="models-card-meta">
          <code>{item.probe === "none" ? "离线 · 不联网" : item.baseUrl.replace(/^https?:\/\//, "")}</code>
          <em className={`models-badge ${item.keyRequired ? "models-badge--key" : "models-badge--free"}`}>
            {item.keyRequired ? "需 API Key" : "免 Key"}
          </em>
        </span>
      </button>
    );
  };

  return (
    <div className="models-page">
      <section className="ai-hero models-hero">
        <div className="ai-hero-copy">
          <span className="eyebrow">MODEL PROVIDERS</span>
          <h1>模型服务</h1>
          <p>
            默认使用本机 Ollama，不上传任何数据；也可以接 DeepSeek、OpenAI、Kimi、智谱、通义等云端服务。
            先测试连接，再保存切换，密钥只存在这台设备。
          </p>
          <div className="ai-hero-chips">
            <span>
              <ServerCog size={13} />
              当前：{activePreset.label}
            </span>
            <span>
              <PlugZap size={13} />
              {settings.provider === "local"
                ? "离线规则"
                : settings.model || "模型自动（取列表第一个）"}
            </span>
            {dirty ? <span className="models-dirty-chip">有未保存修改</span> : null}
          </div>
        </div>
      </section>

      <section className="models-section">
        <div className="models-section-head">
          <HardDrive size={15} />
          <div>
            <h2>本地模型</h2>
            <p>数据不出本机。Ollama 需先 <code>ollama serve</code> 并 <code>ollama pull</code> 一个模型。</p>
          </div>
        </div>
        <div className="models-grid">{localPresets.map(renderCard)}</div>
      </section>

      <section className="models-section">
        <div className="models-section-head">
          <Cloud size={15} />
          <div>
            <h2>云端模型</h2>
            <p>均为 OpenAI 兼容端点，只需 Base URL + API Key + 模型名；请求会携带你授权的数据。</p>
          </div>
        </div>
        <div className="models-grid">{cloudPresets.map(renderCard)}</div>
      </section>

      <section className="models-section models-editor">
        <div className="models-section-head">
          <ServerCog size={15} />
          <div>
            <h2>配置 · {preset.label}</h2>
            <p>{preset.note}</p>
          </div>
        </div>

        {preset.probe === "none" ? (
          <p className="ai-inline-hint">
            本地规则零配置、不联网，能查课、查笔记和执行固定指令。模型服务连不上时也会自动回退到这里。
          </p>
        ) : (
          <div className="ai-field-grid">
            <label className="ai-field ai-field--wide">
              <span>Base URL</span>
              <input
                className="field-input"
                value={draft.baseUrl}
                onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                placeholder={preset.baseUrl}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="ai-field">
              <span>
                <KeyRound size={12} /> API Key{preset.keyRequired ? "" : "（本地可留空）"}
              </span>
              <span className="ai-key-row">
                <input
                  className="field-input"
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder={preset.keyRequired ? "sk-..." : "留空即可"}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button className="ai-ghost-button" type="button" onClick={() => setShowKey((value) => !value)}>
                  {showKey ? "隐藏" : "显示"}
                </button>
              </span>
            </label>
            <label className="ai-field">
              <span>模型{preset.id === "ollama" || preset.id === "lmstudio" ? "（留空自动选第一个）" : ""}</span>
              <input
                className="field-input"
                value={draft.model}
                list="models-page-options"
                onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                placeholder={preset.model || "测试连接后自动填充"}
                spellCheck={false}
                autoComplete="off"
              />
              <datalist id="models-page-options">
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
          </div>
        )}

        {preset.keyRequired && !draft.apiKey.trim() ? (
          <p className="ai-inline-hint models-key-warning">
            <KeyRound size={13} />
            该云端服务需要 API Key 才能对话；可以先保存配置稍后再填。清空输入框再保存，会删除本机为它保存的 Key。
          </p>
        ) : null}

        {preset.probe !== "none" ? (
          <>
            <div className="models-test-row">
              <button
                className={`secondary-button models-test-button ${testStatus === "testing" ? "is-testing" : ""}`}
                type="button"
                disabled={testStatus === "testing"}
                onClick={() => void runTest(true)}
              >
                {testStatus === "testing" ? <Loader2 size={14} className="models-spin" /> : <PlugZap size={14} />}
                {testStatus === "testing" ? "测试中…" : "测试连接"}
              </button>
              <button
                className="ai-ghost-button"
                type="button"
                disabled={testStatus === "testing"}
                onClick={() => void runTest(false)}
              >
                <RefreshCw size={13} />
                拉取模型列表
              </button>
              {testStatus === "ok" && testResult ? (
                <span className="models-test-result is-ok" role="status">
                  <CheckCircle2 size={14} />
                  {testResult.message}
                </span>
              ) : null}
              {testStatus === "fail" && testResult ? (
                <span className="models-test-result is-fail" role="alert">
                  <XCircle size={14} />
                  {testResult.message}
                </span>
              ) : null}
            </div>
            {models.length > 0 ? (
              <div className="models-model-chips" aria-label="可用模型">
                {models.slice(0, 24).map((model) => (
                  <button
                    key={model}
                    type="button"
                    className={draft.model === model ? "is-active" : ""}
                    onClick={() => setDraft((current) => ({ ...current, model }))}
                    title={`使用 ${model}`}
                  >
                    {model}
                  </button>
                ))}
                {models.length > 24 ? <span>…共 {models.length} 个</span> : null}
              </div>
            ) : null}
          </>
        ) : null}

        {error ? <p className="inline-notice inline-notice--error">{error}</p> : null}

        <div className="models-foot">
          <p className="ai-inline-hint">
            <KeyRound size={13} /> 每个服务商的 Key 分开保存，切换时自动带出；清空输入框再保存即可删除该 Key。
          </p>
          <span className="models-foot-spacer" />
          <button className="ai-ghost-button" type="button" onClick={resetDefaults}>
            <RotateCcw size={13} />
            恢复默认
          </button>
          <button className="primary-button" type="button" onClick={save} disabled={!dirty}>
            <Save size={15} />
            保存配置
          </button>
        </div>
      </section>
    </div>
  );
}