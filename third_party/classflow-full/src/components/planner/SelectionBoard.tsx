import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  GraduationCap,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Course, Period } from "../../types";
import { WEEKDAYS } from "../../lib/date";
import {
  generateSelectionPlans,
  type GeneratedSelectionPlan,
} from "../../lib/planning/bridge";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  activePlan,
  alternativesFor,
  assessmentPressure,
  conflictPartners,
  createSection,
  filterSections,
  graduationProgress,
  loadCatalog,
  planStats,
  saveCatalog,
  sectionsConflict,
  sectionsFromCourses,
  selectedSections,
  withPlanCreated,
  withPlanRemoved,
  withPlanSections,
  withSectionAdded,
  withSectionDeleted,
  withSectionRemoved,
  withSectionsMerged,
  type CourseCategory,
  type SelectionMeeting,
  type SelectionSection,
} from "../../lib/planner";

interface SelectionBoardProps {
  courses: Course[];
  periods: Period[];
}

const PERIOD_OPTIONS = Array.from({ length: 14 }, (_, index) => index + 1);

function meetingLabel(meeting: SelectionMeeting): string {
  const weeks =
    meeting.pattern === "odd"
      ? `${meeting.weekStart}–${meeting.weekEnd} 周（单）`
      : meeting.pattern === "even"
        ? `${meeting.weekStart}–${meeting.weekEnd} 周（双）`
        : `${meeting.weekStart}–${meeting.weekEnd} 周`;
  return `${WEEKDAYS[meeting.day - 1]?.short ?? ""} ${meeting.start}–${meeting.end} 节 · ${weeks}`;
}

const DAY_WORDS: Record<string, string> = {
  Mon: "周一",
  Tue: "周二",
  Wed: "周三",
  Thu: "周四",
  Fri: "周五",
  Sat: "周六",
  Sun: "周日",
};

function localizeTag(tag: string): string {
  if (tag === "No gaps") return "无空档";
  if (tag === "Lunch free") return "午休可用";
  const gap = /^Max gap (\d+)h(?: (\d+)m)?$/.exec(tag) ?? /^Max gap (\d+)m$/.exec(tag);
  if (gap) {
    return gap[2]
      ? `最长空档 ${gap[1]}h${gap[2]}m`
      : tag.includes("h")
        ? `最长空档 ${gap[1]}h`
        : `最长空档 ${gap[1]}m`;
  }
  const off = /^(.+) off$/.exec(tag);
  if (off) {
    const days = off[1].split(",").map((day) => DAY_WORDS[day.trim()] ?? day.trim());
    return `${days.join("、")}空`;
  }
  const cap = /^Max (\d+) a day$/.exec(tag);
  if (cap) return `每天最多 ${cap[1]} 门`;
  return tag;
}

function meetingsLabel(section: SelectionSection): string {
  if (section.meetings.length === 0) return "未安排时间";
  return section.meetings.map((meeting) => meetingLabel(meeting)).join(" / ");
}

interface DraftState {
  name: string;
  teacher: string;
  credits: number;
  category: CourseCategory;
  day: number;
  start: number;
  end: number;
  difficulty: number;
  examWeek: number;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  teacher: "",
  credits: 2,
  category: "required",
  day: 1,
  start: 1,
  end: 2,
  difficulty: 3,
  examWeek: 16,
};

export function SelectionBoard({ courses, periods }: SelectionBoardProps) {
  const [catalog, setCatalog] = useState(() => loadCatalog());
  const [filter, setFilter] = useState<{
    query: string;
    category: CourseCategory | "all";
    day: number | "all";
    freeOnly: boolean;
  }>({ query: "", category: "all", day: "all", freeOnly: false });
  const [autoCredits, setAutoCredits] = useState(26);
  const [generated, setGenerated] = useState<GeneratedSelectionPlan[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [notice, setNotice] = useState<string | null>(null);

  const update = (next: typeof catalog) => {
    setCatalog(next);
    saveCatalog(next);
  };

  const plan = activePlan(catalog);
  const selected = useMemo(() => selectedSections(catalog), [catalog]);
  const stats = useMemo(() => planStats(selected), [selected]);
  const pressure = useMemo(() => assessmentPressure(selected), [selected]);
  const progress = useMemo(() => graduationProgress(selected), [selected]);
  const partners = useMemo(() => {
    const raw = conflictPartners(selected);
    const names = new Map(selected.map((section) => [section.id, section.name]));
    const map = new Map<string, string[]>();
    for (const [id, ids] of raw) {
      map.set(id, ids.map((partner) => names.get(partner) ?? partner));
    }
    return map;
  }, [selected]);
  const conflicting = selected.filter((section) => partners.has(section.id));

  const poolRows = useMemo(() => {
    const filtered = filterSections(catalog.sections, filter, selected);
    const picked = new Set(selected.map((section) => section.id));
    return filtered
      .map((section) => ({
        section,
        isPicked: picked.has(section.id),
        conflicts: selected
          .filter((item) => sectionsConflict(item, section))
          .map((item) => item.name),
      }))
      .sort(
        (a, b) =>
          Number(a.isPicked) - Number(b.isPicked) ||
          a.conflicts.length - b.conflicts.length ||
          a.section.name.localeCompare(b.section.name, "zh"),
      )
      .slice(0, 40);
  }, [catalog.sections, filter, selected]);

  const importFromTimetable = () => {
    const incoming = sectionsFromCourses(courses);
    const next = withSectionsMerged(catalog, incoming);
    if (next === catalog) {
      setNotice("课表里的课程都已经在课程池里了。");
      return;
    }
    update(next);
    setNotice(`已从课表导入 ${next.sections.length - catalog.sections.length} 门课程。`);
  };

  const addPlan = () => {
    if (catalog.plans.length >= 8) return;
    const letter = String.fromCharCode(65 + catalog.plans.length);
    update(withPlanCreated(catalog, `方案 ${letter}`));
    setNotice(`已新建方案 ${letter}，可以对比不同的选课组合。`);
  };

  const removePlan = () => {
    if (catalog.plans.length <= 1) return;
    if (!window.confirm(`删除「${plan.name}」？方案里的课程不会被删除。`)) return;
    update(withPlanRemoved(catalog, plan.id));
    setNotice("已删除当前方案。");
  };

  const runAutoCombine = () => {
    if (catalog.sections.length === 0) {
      setNotice("课程池还是空的，先从课表导入或手动添加课程。");
      return;
    }
    const generation = generateSelectionPlans(catalog.sections, periods, autoCredits);
    if (generation.plans.length === 0) {
      setGenerated([]);
      setNotice(generation.emptyReason ?? "没有找到不冲突的组合，试着放宽课程池或调整目标学分。");
      return;
    }
    setGenerated(generation.plans);
    const best = generation.plans[0];
    update(withPlanSections(catalog, best.sectionIds));
    setNotice(
      `评估 ${generation.evaluated} 种组合，采用最佳方案：${best.sectionIds.length} 门 / ${best.credits} 学分。`,
    );
  };

  const applyGenerated = (candidate: GeneratedSelectionPlan) => {
    update(withPlanSections(catalog, candidate.sectionIds));
    setNotice(`已应用候选方案：${candidate.sectionIds.length} 门 / ${candidate.credits} 学分。`);
  };

  const replaceSection = (targetId: string, replacementId: string) => {
    const removed = withSectionRemoved(catalog, targetId);
    update(withSectionAdded(removed, replacementId));
    setNotice("已替换班次，冲突重新计算。");
  };

  const addDraft = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    const section = createSection({
      name,
      teacher: draft.teacher,
      credits: draft.credits,
      category: draft.category,
      day: draft.day,
      start: draft.start,
      end: draft.end,
      difficulty: draft.difficulty,
      examWeek: draft.examWeek > 0 ? draft.examWeek : undefined,
    });
    const merged = withSectionsMerged(catalog, [section]);
    update(withSectionAdded(merged, section.id));
    setDraft(EMPTY_DRAFT);
    setFormOpen(false);
    setNotice(`已添加《${section.name}》。`);
  };

  return (
    <div className="select-board">
      <section className="select-hero">
        <div>
          <p className="eyebrow">COURSE PLANNING</p>
          <h1>选课规划</h1>
          <p className="planner-sub">
            多套方案对比 · 冲突自动标出 · 数据只保存在本机
          </p>
        </div>
        <div className="select-hero-actions">
          <label className="auto-credits">
            <span>目标学分</span>
            <input
              type="number"
              min={4}
              max={60}
              value={autoCredits}
              onChange={(event) => setAutoCredits(Math.max(4, Math.min(60, Number(event.target.value) || 26)))}
            />
          </label>
          <button className="small-button" type="button" onClick={importFromTimetable}>
            <Upload size={13} />
            从课表导入
          </button>
          <button className="primary-button" type="button" onClick={runAutoCombine}>
            <Sparkles size={14} />
            自动组合
          </button>
        </div>
      </section>

      {notice ? (
        <div className="select-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示">
            <X size={13} />
          </button>
        </div>
      ) : null}

      {generated.length > 0 ? (
        <section className="select-generated" aria-label="自动组合候选方案">
          <header className="select-generated-head">
            <div>
              <strong>组合结果</strong>
              <small>按冲突与课表紧凑度排序，可直接切换</small>
            </div>
            <button type="button" className="small-button" onClick={() => setGenerated([])}>
              收起
            </button>
          </header>
          <div className="select-generated-list">
            {generated.map((candidate, index) => (
              <div className="select-generated-row" key={candidate.id}>
                <span className="select-generated-rank">{index + 1}</span>
                <span className="select-generated-copy">
                  <strong>
                    {candidate.sectionIds.length} 门 · {candidate.credits} 学分
                  </strong>
                  <small>{candidate.tags.slice(0, 3).map(localizeTag).join(" · ")}</small>
                </span>
                <button
                  type="button"
                  className="small-button"
                  onClick={() => applyGenerated(candidate)}
                >
                  应用
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="select-plan-row" role="group" aria-label="选课方案">
        {catalog.plans.map((item) => (
          <button
            key={item.id}
            className={item.id === plan.id ? "is-active" : ""}
            type="button"
            onClick={() => update({ ...catalog, activePlanId: item.id })}
            aria-pressed={item.id === plan.id}
          >
            <span>{item.name}</span>
            <small>{item.sectionIds.length} 门</small>
          </button>
        ))}
        <button
          className="select-plan-new"
          type="button"
          onClick={addPlan}
          disabled={catalog.plans.length >= 8}
        >
          <Plus size={13} />
          新建方案
        </button>
        {catalog.plans.length > 1 ? (
          <button
            className="select-plan-delete"
            type="button"
            onClick={removePlan}
            aria-label="删除当前方案"
            title="删除当前方案"
          >
            <Trash2 size={13} />
          </button>
        ) : null}
      </div>

      <div className="select-stats">
        <div className="planner-stat">
          <span className="planner-stat-icon">
            <GraduationCap size={17} />
          </span>
          <div>
            <strong>{stats.creditTotal} 学分</strong>
            <span>方案总学分</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon is-teal">
            <ArrowLeftRight size={17} />
          </span>
          <div>
            <strong>
              {stats.weeklyPeriods} 节 / {stats.dayCount} 天
            </strong>
            <span>每周课时</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon is-amber">
            <AlertTriangle size={17} />
          </span>
          <div>
            <strong>{stats.conflictPairs.length} 处</strong>
            <span>时间冲突</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon is-olive">
            <Sparkles size={17} />
          </span>
          <div>
            <strong>
              {pressure.label} · {pressure.score}
            </strong>
            <span>考核压力</span>
          </div>
        </div>
      </div>

      <div className="select-columns">
        <section className="study-card select-pool">
          <header className="study-card-head">
            <div>
              <p className="eyebrow">CATALOG</p>
              <h2>课程池</h2>
            </div>
            <button
              className="small-button"
              type="button"
              onClick={() => setFormOpen((value) => !value)}
              aria-expanded={formOpen}
            >
              <Plus size={13} />
              手动添加
            </button>
          </header>

          {formOpen ? (
            <form className="select-form" onSubmit={addDraft}>
              <input
                className="select-form-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="课程名称"
                aria-label="课程名称"
                maxLength={80}
              />
              <input
                value={draft.teacher}
                onChange={(event) => setDraft({ ...draft, teacher: event.target.value })}
                placeholder="教师"
                aria-label="教师"
                maxLength={40}
              />
              <label>
                <span>学分</span>
                <input
                  type="number"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={draft.credits}
                  onChange={(event) => setDraft({ ...draft, credits: Number(event.target.value) || 2 })}
                />
              </label>
              <label>
                <span>类别</span>
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value as CourseCategory })
                  }
                >
                  {CATEGORY_ORDER.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>星期</span>
                <select
                  value={draft.day}
                  onChange={(event) => setDraft({ ...draft, day: Number(event.target.value) })}
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day.index} value={day.index}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>节次</span>
                <div className="select-range">
                  <select
                    value={draft.start}
                    onChange={(event) => setDraft({ ...draft, start: Number(event.target.value) })}
                    aria-label="开始节次"
                  >
                    {PERIOD_OPTIONS.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                  <span>–</span>
                  <select
                    value={draft.end}
                    onChange={(event) => setDraft({ ...draft, end: Number(event.target.value) })}
                    aria-label="结束节次"
                  >
                    {PERIOD_OPTIONS.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                <span>难度</span>
                <select
                  value={draft.difficulty}
                  onChange={(event) => setDraft({ ...draft, difficulty: Number(event.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>考试周</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={draft.examWeek}
                  onChange={(event) => setDraft({ ...draft, examWeek: Number(event.target.value) || 0 })}
                />
              </label>
              <button className="primary-button" type="submit" disabled={!draft.name.trim()}>
                添加并选入方案
              </button>
            </form>
          ) : null}

          <div className="select-filters">
            <label className="select-search">
              <Search size={13} />
              <input
                value={filter.query}
                onChange={(event) => setFilter({ ...filter, query: event.target.value })}
                placeholder="搜索课程、教师或地点"
                aria-label="搜索课程"
              />
            </label>
            <select
              value={filter.category}
              onChange={(event) =>
                setFilter({ ...filter, category: event.target.value as CourseCategory | "all" })
              }
              aria-label="按类别筛选"
            >
              <option value="all">全部类别</option>
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
            <select
              value={filter.day}
              onChange={(event) =>
                setFilter({
                  ...filter,
                  day: event.target.value === "all" ? "all" : Number(event.target.value),
                })
              }
              aria-label="按星期筛选"
            >
              <option value="all">全部星期</option>
              {WEEKDAYS.map((day) => (
                <option key={day.index} value={day.index}>
                  {day.label}
                </option>
              ))}
            </select>
            <label className="select-check">
              <input
                type="checkbox"
                checked={filter.freeOnly}
                onChange={(event) => setFilter({ ...filter, freeOnly: event.target.checked })}
              />
              只看无冲突
            </label>
          </div>

          {poolRows.length === 0 ? (
            <p className="study-empty">
              {catalog.sections.length === 0
                ? "课程池是空的。可以先从课表导入现有课程，再补充候选班次。"
                : "没有符合筛选条件的课程，换个关键词试试。"}
            </p>
          ) : (
            <ul className="select-pool-list">
              {poolRows.map(({ section, isPicked, conflicts }) => (
                <li key={section.id} className={isPicked ? "is-picked" : ""}>
                  <span className={`select-cat is-${section.category}`}>
                    {CATEGORY_LABELS[section.category]}
                  </span>
                  <div className="select-row-copy">
                    <strong>{section.name}</strong>
                    <span>{meetingsLabel(section)}</span>
                    {conflicts.length > 0 ? (
                      <em>与 {conflicts.slice(0, 2).join("、")} 冲突</em>
                    ) : null}
                  </div>
                  <span className="select-credits">{section.credits} 分</span>
                  {isPicked ? (
                    <span className="select-picked-tag">已选</span>
                  ) : (
                    <button
                      className="small-button"
                      type="button"
                      onClick={() => update(withSectionAdded(catalog, section.id))}
                    >
                      加入
                    </button>
                  )}
                  <button
                    className="task-delete"
                    type="button"
                    onClick={() => update(withSectionDeleted(catalog, section.id))}
                    aria-label={`删除候选课程 ${section.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="select-side">
          <section className="study-card select-current">
            <header className="study-card-head">
              <div>
                <p className="eyebrow">PLAN</p>
                <h2>{plan.name}</h2>
              </div>
              <span className="study-card-tag">
                {selected.length} 门 · {stats.creditTotal} 学分
              </span>
            </header>

            {selected.length === 0 ? (
              <p className="study-empty">还没有选课。从左侧课程池加入，或点「自动组合」生成一版。</p>
            ) : (
              <ul className="select-current-list">
                {selected.map((section) => {
                  const names = partners.get(section.id) ?? [];
                  return (
                    <li key={section.id}>
                      <span className="select-dot" style={{ background: `var(--select-${section.category}, var(--coral))` }} />
                      <div className="select-row-copy">
                        <strong>{section.name}</strong>
                        <span>{meetingsLabel(section)}</span>
                        {names.length > 0 ? <em>与 {names.join("、")} 冲突</em> : null}
                      </div>
                      <span className="select-credits">{section.credits} 分</span>
                      <button
                        className="task-delete"
                        type="button"
                        onClick={() => update(withSectionRemoved(catalog, section.id))}
                        aria-label={`从方案移除 ${section.name}`}
                      >
                        <X size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="grad-block">
              <span className="grad-title">培养方案进度</span>
              <div className="grad-list">
                {progress.map((item) => (
                  <div className="grad-row" key={item.category}>
                    <div className="grad-head">
                      <span>{item.label}</span>
                      <strong>
                        {item.credits}/{item.target}
                      </strong>
                    </div>
                    <div className="grad-track" aria-hidden="true">
                      <span style={{ width: `${item.rate}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="study-card select-pressure">
            <header className="study-card-head">
              <div>
                <p className="eyebrow">LOAD</p>
                <h2>考核压力</h2>
              </div>
              <span className={`pressure-badge is-${pressure.level}`}>{pressure.label}</span>
            </header>

            <div className={`pressure-meter is-${pressure.level}`} aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.round((pressure.score / 160) * 100))}%` }} />
            </div>
            <p className="pressure-note">
              周 {stats.weeklyPeriods} 节 · 难度分 {pressure.difficultySum} · 压力值 {pressure.score}
            </p>

            {pressure.examWeeks.length > 0 ? (
              <div className="pressure-exams">
                {pressure.examWeeks.slice(0, 3).map((item) => (
                  <span key={item.week} className={item.count > 1 ? "is-clash" : ""}>
                    第 {item.week} 周 · {item.count} 门考试
                  </span>
                ))}
              </div>
            ) : (
              <p className="pressure-note">还没有登记考试周，添加课程时可填写。</p>
            )}

            {conflicting.length > 0 ? (
              <div className="select-alts">
                <span className="grad-title">冲突与替代班次</span>
                {conflicting.map((section) => {
                  const alternatives = alternativesFor(section, catalog.sections, selected).slice(0, 3);
                  return (
                    <div className="alt-block" key={section.id}>
                      <strong>{section.name}</strong>
                      {alternatives.length === 0 ? (
                        <p className="study-empty-text">课程池里没有其他班次，先手动添加一个替代班。</p>
                      ) : (
                        alternatives.map((item) => (
                          <button
                            key={item.section.id}
                            className="alt-option"
                            type="button"
                            onClick={() => replaceSection(section.id, item.section.id)}
                          >
                            <span>{item.section.name}</span>
                            <small>
                              {meetingsLabel(item.section)}
                              {item.conflicts.length > 0 ? ` · 仍与 ${item.conflicts.join("、")} 冲突` : " · 无冲突"}
                            </small>
                            <ArrowLeftRight size={12} />
                          </button>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="pressure-note">当前方案没有时间冲突。</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
