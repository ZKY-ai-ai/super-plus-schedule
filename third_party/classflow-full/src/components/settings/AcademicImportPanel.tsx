import { useRef, useState } from "react";
import {
  CloudDownload,
  Database,
  Download,
  FileUp,
  FlaskConical,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import type { ParsedCourseSeed } from "../../lib/textImport";
import {
  ACADEMIC_FIELD_OPTIONS,
  PERIOD_FORMAT_OPTIONS,
  WEEKDAY_FORMAT_OPTIONS,
  WEEK_FORMAT_OPTIONS,
  testAcademicAdapter,
  validateAdapterConfig,
  type AcademicAdapterConfig,
  type AcademicTestOutcome,
} from "../../lib/academicImport";
import {
  MAX_SCHOOL_PROFILES,
  createSchoolProfile,
  deleteSchoolProfile,
  exportSchoolLibrary,
  importSchoolLibrary,
  loadSchoolProfiles,
  upsertSchoolProfile,
  validateSchoolProfile,
  type SchoolProfile,
  type SchoolTestRecord,
} from "../../lib/schoolLibrary";
import { deliverTextFile, isNativeApp } from "../../lib/nativeFile";
import "../../styles/academic-import.css";

interface AcademicImportPanelProps {
  onImport: (seeds: ParsedCourseSeed[]) => { courses: number; slots: number };
  onOpenImportSchedule?: () => void;
}

interface EditorState {
  id: string;
  name: string;
  adapter: AcademicAdapterConfig;
  lastTest: SchoolTestRecord | null;
  createdAt: string;
}

interface PreviewState {
  profileName: string;
  outcome: AcademicTestOutcome;
}

interface Notice {
  tone: "success" | "error" | "info";
  message: string;
}

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function cloneAdapter(adapter: AcademicAdapterConfig): AcademicAdapterConfig {
  return { ...adapter, fields: { ...adapter.fields } };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function weekLabel(slot: ParsedCourseSeed["slots"][number]): string {
  const base =
    slot.weekStart === slot.weekEnd
      ? `${slot.weekStart}周`
      : `${slot.weekStart}-${slot.weekEnd}周`;
  if (slot.pattern === "odd") return `${base}（单）`;
  if (slot.pattern === "even") return `${base}（双）`;
  return base;
}

function slotLabel(slot: ParsedCourseSeed["slots"][number]): string {
  return `${DAY_LABELS[slot.day] ?? `周${slot.day}`} ${slot.start}-${slot.end}节 · ${weekLabel(slot)}`;
}

function toTestRecord(outcome: AcademicTestOutcome): SchoolTestRecord {
  return {
    testedAt: outcome.testedAt,
    status: outcome.status,
    message: outcome.message,
    courseCount: outcome.courseCount,
    slotCount: outcome.slotCount,
  };
}

function statusMeta(profile: SchoolProfile): { label: string; tone: string } {
  if (!profile.lastTest) return { label: "未测试", tone: "idle" };
  if (profile.lastTest.status === "ok") return { label: "上次测试通过", tone: "ok" };
  return { label: "上次测试失败", tone: "error" };
}

export function AcademicImportPanel({ onImport, onOpenImportSchedule }: AcademicImportPanelProps) {
  const [profiles, setProfiles] = useState<SchoolProfile[]>(() => loadSchoolProfiles());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const native = isNativeApp();

  const refresh = () => {
    setProfiles(loadSchoolProfiles());
  };

  const openNew = () => {
    const profile = createSchoolProfile();
    setEditor({
      id: profile.id,
      name: "",
      adapter: cloneAdapter(profile.adapter),
      lastTest: null,
      createdAt: profile.createdAt,
    });
    setFormErrors([]);
    setPreview(null);
    setNotice(null);
  };

  const openEdit = (profile: SchoolProfile) => {
    setEditor({
      id: profile.id,
      name: profile.name,
      adapter: cloneAdapter(profile.adapter),
      lastTest: profile.lastTest,
      createdAt: profile.createdAt,
    });
    setFormErrors([]);
    setPreview(null);
    setNotice(null);
  };

  const closeEditor = () => {
    setEditor(null);
    setFormErrors([]);
  };

  const updateAdapter = (patch: Partial<AcademicAdapterConfig>) => {
    setEditor((current) =>
      current ? { ...current, adapter: { ...current.adapter, ...patch } } : current,
    );
    setPreview(null);
  };

  const updateField = (key: keyof AcademicAdapterConfig["fields"], value: string) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            adapter: {
              ...current.adapter,
              fields: { ...current.adapter.fields, [key]: value },
            },
          }
        : current,
    );
    setPreview(null);
  };

  const editorAdapter = (): AcademicAdapterConfig | null => {
    if (!editor) return null;
    const name = editor.name.trim();
    return { ...editor.adapter, name };
  };

  const runEditorTest = async () => {
    const adapter = editorAdapter();
    if (!adapter || testing) return;
    setTesting("editor");
    setNotice(null);
    try {
      const outcome = await testAcademicAdapter(adapter);
      setPreview({ profileName: editor?.name.trim() || adapter.name || "未命名档案", outcome });
      setEditor((current) =>
        current ? { ...current, lastTest: toTestRecord(outcome) } : current,
      );
      setNotice(
        outcome.status === "ok"
          ? { tone: "success", message: "接口测试通过，请确认下方映射预览后再导入。" }
          : { tone: "error", message: outcome.message },
      );
    } finally {
      setTesting(null);
    }
  };

  const saveProfile = () => {
    if (!editor) return;
    const name = editor.name.trim();
    const adapter = { ...editor.adapter, name };
    const profile: SchoolProfile = {
      id: editor.id,
      name: name || adapter.name,
      adapter,
      lastTest: editor.lastTest,
      createdAt: editor.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const check = validateSchoolProfile(profile);
    if (!check.ok) {
      setFormErrors(check.errors);
      setNotice({ tone: "error", message: check.errors[0] ?? "档案配置不完整。" });
      return;
    }

    const result = upsertSchoolProfile(profile);
    if (!result.ok) {
      setFormErrors(result.error ? [result.error] : []);
      setNotice({ tone: "error", message: result.error ?? "保存档案失败。" });
      return;
    }
    refresh();
    setEditor(null);
    setFormErrors([]);
    setNotice({ tone: "success", message: `已保存档案「${profile.name}」。` });
  };

  const testSavedProfile = async (profile: SchoolProfile) => {
    if (testing) return;
    setTesting(profile.id);
    setNotice(null);
    try {
      const outcome = await testAcademicAdapter(profile.adapter);
      const record = toTestRecord(outcome);
      const result = upsertSchoolProfile({ ...profile, lastTest: record });
      if (result.ok) refresh();
      setPreview({ profileName: profile.name, outcome });
      setNotice(
        outcome.status === "ok"
          ? { tone: "success", message: `「${profile.name}」测试通过，可以预览并确认导入。` }
          : { tone: "error", message: outcome.message },
      );
    } finally {
      setTesting(null);
    }
  };

  const removeProfile = (profile: SchoolProfile) => {
    const confirmed = window.confirm(
      `删除档案「${profile.name}」？只会删除本机保存的适配器配置，不会影响现有课表。`,
    );
    if (!confirmed) return;
    const result = deleteSchoolProfile(profile.id);
    if (!result.ok) {
      setNotice({ tone: "error", message: result.error ?? "删除档案失败。" });
      return;
    }
    setProfiles(result.profiles);
    if (preview?.profileName === profile.name) setPreview(null);
    setNotice({ tone: "info", message: `已删除档案「${profile.name}」。` });
  };

  const confirmImport = () => {
    if (!preview || preview.outcome.courses.length === 0 || importing) return;
    setImporting(true);
    try {
      const result = onImport(preview.outcome.courses);
      setPreview(null);
      setNotice({
        tone: "success",
        message: `已加入 ${result.courses} 门课程、${result.slots} 个时间段，请到课表里核对时间与地点。`,
      });
    } finally {
      setImporting(false);
    }
  };

  const exportLibrary = async () => {
    setExporting(true);
    try {
      const delivery = await deliverTextFile(
        "school-library.json",
        exportSchoolLibrary(profiles),
        "application/json",
      );
      setNotice({
        tone: "success",
        message:
          delivery === "download"
            ? "已导出学校档案 JSON。"
            : "已生成学校档案 JSON，请在系统分享面板里保存。",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "导出档案失败。",
      });
    } finally {
      setExporting(false);
    }
  };

  const importLibraryFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const result = importSchoolLibrary(text, "merge");
      setProfiles(result.profiles);
      if (!result.ok) {
        setNotice({
          tone: "error",
          message: result.errors[0] ?? "导入档案失败。",
        });
        return;
      }
      setNotice({
        tone: "success",
        message: `已导入档案：新增 ${result.added} 个、覆盖 ${result.updated} 个${
          result.skipped > 0 ? `、跳过 ${result.skipped} 个` : ""
        }。`,
      });
    } catch {
      setNotice({ tone: "error", message: "无法读取这个 JSON 文件。" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const adapterWarnings = editor ? validateAdapterConfig(editorAdapter()!).warnings : [];
  const isEditingSaved = editor ? profiles.some((profile) => profile.id === editor.id) : false;

  return (
    <section className="settings-pane academic-import-pane">
      <div className="settings-pane-head">
        <p className="eyebrow">ACADEMIC ADAPTERS</p>
        <h3>教务系统导入</h3>
        <p>
          为你的学校教务接口配置一个自定义适配器：填写请求方式和字段路径，先测试、再预览、最后确认导入。
        </p>
      </div>

      {notice ? (
        <p className={`inline-notice inline-notice--${notice.tone}`} role="status">
          {notice.message}
        </p>
      ) : null}

      {onOpenImportSchedule ? (
        <button className="data-card" type="button" onClick={onOpenImportSchedule}>
          <span className="data-card-icon">
            <FileUp size={18} />
          </span>
          <span>
            <strong>用文件导入课表</strong>
            <small>
              没有可用的教务接口也没关系：图片、Word、PDF、Excel / CSV、文本或 ICS 都能导入，复用「周课表」的 AI 识别。
            </small>
          </span>
        </button>
      ) : null}

      <div className="academic-platform-note">
        <ShieldAlert size={16} />
        <div>
          <strong>
            {native ? "App 内可用 CapacitorHttp 直接请求" : "Web 版受浏览器 CORS 限制"}
          </strong>
          <p>
            {native
              ? "App 内通过 CapacitorHttp 发起请求，不受浏览器跨域限制，但仍需要有效的登录凭据。"
              : "浏览器只能访问允许跨域的接口。如果学校教务系统没有开放 CORS，测试会在 Web 版失败，请改用 Android App 内导入；这是浏览器限制，应用不会绕过。"}
          </p>
        </div>
      </div>

      <div className="academic-library">
        <div className="academic-library-head">
          <span className="academic-library-title">
            <Database size={16} />
            <strong>本机学校档案</strong>
            <small>
              {profiles.length}/{MAX_SCHOOL_PROFILES}
            </small>
          </span>
          <div className="academic-library-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} />
              导入档案
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={profiles.length === 0 || exporting}
              onClick={() => {
                void exportLibrary();
              }}
            >
              <Download size={14} />
              {exporting ? "导出中…" : "导出档案"}
            </button>
            <button className="primary-button" type="button" onClick={openNew}>
              <Plus size={15} />
              新建档案
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="选择学校档案 JSON"
          onChange={(event) => {
            void importLibraryFile(event.target.files?.[0]);
          }}
        />

        <p className="academic-trust-note">
          不内置任何学校预设或“已适配”接口。档案与请求头（可能含
          Cookie / Token）只保存在本机 localStorage，不会上传；请勿在公共设备保存账号凭据。
        </p>

        {profiles.length === 0 ? (
          <p className="academic-empty">
            本机还没有学校档案。新建档案并填入真实教务接口，测试通过后再导入课表。
          </p>
        ) : (
          <ul className="academic-profile-list">
            {profiles.map((profile) => {
              const status = statusMeta(profile);
              return (
                <li className="academic-profile" key={profile.id}>
                  <div className="academic-profile-main">
                    <div className="academic-profile-title">
                      <strong>{profile.name}</strong>
                      <span className={`academic-status academic-status--${status.tone}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="academic-profile-url">
                      {profile.adapter.method} {profile.adapter.url || "（未填写 URL）"}
                    </p>
                    <small>
                      响应路径 {profile.adapter.responsePath || "$"} · 总{" "}
                      {profile.adapter.totalWeeks} 周
                      {profile.lastTest
                        ? ` · ${formatTime(profile.lastTest.testedAt)} · ${profile.lastTest.courseCount} 门课程`
                        : " · 尚未测试"}
                    </small>
                  </div>
                  <div className="academic-profile-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={testing !== null}
                      onClick={() => {
                        void testSavedProfile(profile);
                      }}
                    >
                      {testing === profile.id ? (
                        <LoaderCircle className="is-spinning" size={14} />
                      ) : (
                        <FlaskConical size={14} />
                      )}
                      测试
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => openEdit(profile)}
                    >
                      <Pencil size={14} />
                      编辑
                    </button>
                    <button
                      className="danger-ghost-button"
                      type="button"
                      onClick={() => removeProfile(profile)}
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editor ? (
        <div className="academic-editor">
          <div className="academic-editor-head">
            <span>
              <CloudDownload size={16} />
              <strong>{isEditingSaved ? "编辑档案" : "新建档案"}</strong>
            </span>
            <button className="icon-button" type="button" aria-label="关闭编辑" onClick={closeEditor}>
              <X size={16} />
            </button>
          </div>

          <div className="academic-form-grid">
            <label className="field academic-span-2">
              <span className="field-label">档案名称</span>
              <input
                className="field-input"
                value={editor.name}
                maxLength={40}
                placeholder="例如：本校教务（自定义）"
                onChange={(event) => {
                  setEditor((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  );
                }}
              />
            </label>

            <label className="field academic-span-2">
              <span className="field-label">教务接口 URL</span>
              <input
                className="field-input"
                value={editor.adapter.url}
                placeholder="https://jw.example.edu/api/schedule"
                spellCheck={false}
                onChange={(event) => updateAdapter({ url: event.target.value })}
              />
            </label>

            <label className="field">
              <span className="field-label">请求方式</span>
              <select
                className="field-input"
                value={editor.adapter.method}
                onChange={(event) =>
                  updateAdapter({ method: event.target.value === "POST" ? "POST" : "GET" })
                }
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </label>

            <label className="field">
              <span className="field-label">总周数</span>
              <input
                className="field-input"
                type="number"
                min={1}
                max={60}
                value={editor.adapter.totalWeeks}
                onChange={(event) =>
                  updateAdapter({ totalWeeks: Number(event.target.value) || 1 })
                }
              />
            </label>

            <label className="field academic-span-2">
              <span className="field-label">请求头 JSON</span>
              <textarea
                className="field-input academic-textarea"
                value={editor.adapter.headers}
                spellCheck={false}
                rows={3}
                placeholder={'{\n  "Cookie": "…",\n  "Accept": "application/json"\n}'}
                onChange={(event) => updateAdapter({ headers: event.target.value })}
              />
            </label>

            {editor.adapter.method === "POST" ? (
              <label className="field academic-span-2">
                <span className="field-label">请求体 JSON</span>
                <textarea
                  className="field-input academic-textarea"
                  value={editor.adapter.body}
                  spellCheck={false}
                  rows={3}
                  placeholder='{"semester": "2026-2027-1"}'
                  onChange={(event) => updateAdapter({ body: event.target.value })}
                />
              </label>
            ) : null}

            <label className="field academic-span-2">
              <span className="field-label">响应 JSON 路径</span>
              <input
                className="field-input"
                value={editor.adapter.responsePath}
                placeholder="data.list（留空表示响应根节点）"
                spellCheck={false}
                onChange={(event) => updateAdapter({ responsePath: event.target.value })}
              />
              <span className="field-hint">指向课程对象数组，支持点路径与 [数字] 下标。</span>
            </label>

            <label className="field">
              <span className="field-label">星期格式</span>
              <select
                className="field-input"
                value={editor.adapter.weekdayFormat}
                onChange={(event) =>
                  updateAdapter({
                    weekdayFormat: event.target.value as AcademicAdapterConfig["weekdayFormat"],
                  })
                }
              >
                {WEEKDAY_FORMAT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">节次格式</span>
              <select
                className="field-input"
                value={editor.adapter.periodFormat}
                onChange={(event) =>
                  updateAdapter({
                    periodFormat: event.target.value as AcademicAdapterConfig["periodFormat"],
                  })
                }
              >
                {PERIOD_FORMAT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">周次格式</span>
              <select
                className="field-input"
                value={editor.adapter.weekFormat}
                onChange={(event) =>
                  updateAdapter({
                    weekFormat: event.target.value as AcademicAdapterConfig["weekFormat"],
                  })
                }
              >
                {WEEK_FORMAT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="academic-field-paths">
            <p className="academic-section-label">字段路径映射（相对数组中的每条记录）</p>
            <div className="academic-form-grid academic-form-grid--fields">
              {ACADEMIC_FIELD_OPTIONS.map((field) => (
                <label className="field" key={field.key}>
                  <span className="field-label">{field.label}</span>
                  <input
                    className="field-input"
                    value={editor.adapter.fields[field.key]}
                    placeholder={field.hint}
                    spellCheck={false}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          {adapterWarnings.length > 0 ? (
            <ul className="academic-warning-list">
              {adapterWarnings.map((message, index) => (
                <li key={index}>
                  <TriangleAlert size={12} />
                  {message}
                </li>
              ))}
            </ul>
          ) : null}

          {formErrors.length > 0 ? (
            <ul className="academic-error-list">
              {formErrors.slice(0, 5).map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          ) : null}

          <div className="academic-editor-actions">
            <p className="academic-editor-note">测试结果会记录到档案，保存后生效。</p>
            <span className="academic-editor-spacer" />
            <button className="secondary-button" type="button" onClick={closeEditor}>
              取消
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={testing !== null}
              onClick={() => {
                void runEditorTest();
              }}
            >
              {testing === "editor" ? (
                <LoaderCircle className="is-spinning" size={15} />
              ) : (
                <FlaskConical size={15} />
              )}
              测试请求
            </button>
            <button className="primary-button" type="button" onClick={saveProfile}>
              保存档案
            </button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="academic-preview">
          <div className="academic-preview-head">
            <span>
              {preview.outcome.status === "ok" ? (
                <FlaskConical size={16} />
              ) : (
                <TriangleAlert size={16} />
              )}
              <strong>{preview.profileName}</strong>
              <span
                className={`academic-status academic-status--${
                  preview.outcome.status === "ok" ? "ok" : "error"
                }`}
              >
                {preview.outcome.status === "ok" ? "测试通过" : "测试未通过"}
              </span>
            </span>
            <small>{formatTime(preview.outcome.testedAt)}</small>
          </div>

          <p className="academic-preview-message">{preview.outcome.message}</p>

          <div className="academic-preview-stats">
            <span>记录 {preview.outcome.itemCount}</span>
            <span>课程 {preview.outcome.courseCount}</span>
            <span>时间段 {preview.outcome.slotCount}</span>
          </div>

          {preview.outcome.errors.length > 0 ? (
            <ul className="academic-error-list">
              {preview.outcome.errors.slice(0, 5).map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          ) : null}

          <details className="academic-raw">
            <summary>原始响应片段</summary>
            <pre>{preview.outcome.rawSnippet || "（接口没有返回内容）"}</pre>
          </details>

          {preview.outcome.courses.length > 0 ? (
            <div className="academic-mapping">
              <p className="academic-section-label">
                映射预览（{preview.outcome.courses.length} 门课程）
              </p>
              <ul className="academic-mapping-list">
                {preview.outcome.courses.slice(0, 8).map((course, index) => (
                  <li key={`${course.name}-${index}`}>
                    <div className="academic-mapping-title">
                      <strong>{course.name}</strong>
                      <small>
                        {[course.teacher, course.location].filter(Boolean).join(" · ") || "未提供教师 / 地点"}
                      </small>
                    </div>
                    <div className="academic-slot-tags">
                      {course.slots.map((slot, slotIndex) => (
                        <span key={slotIndex}>{slotLabel(slot)}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {preview.outcome.courses.length > 8 ? (
                <p className="academic-mapping-more">
                  还有 {preview.outcome.courses.length - 8} 门课程未展开，确认导入时会全部加入。
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="academic-preview-actions">
            <button
              className="primary-button"
              type="button"
              disabled={
                preview.outcome.status !== "ok" ||
                preview.outcome.courses.length === 0 ||
                importing
              }
              onClick={confirmImport}
            >
              <Upload size={15} />
              {importing
                ? "正在导入…"
                : `确认导入 ${preview.outcome.courses.length} 门课程`}
            </button>
            <button className="ghost-button" type="button" onClick={() => setPreview(null)}>
              关闭预览
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
