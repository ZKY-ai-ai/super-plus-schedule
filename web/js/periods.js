/* ============================================================
   periods.js — 作息按「月-日」每年自动循环（F023）

   算法移植自 lcymxm/classflow src/lib/periods.ts（MIT，
   commit 30c466a5c456b7dde01cfc42a3178f83e87de7a6）。
   上游为 TypeScript + React 数据模型，此处按本项目的
   periodSets / schedules 结构改写为无依赖纯函数。
   归属与许可证见 third_party/classflow/NOTICE.md。
   ============================================================ */

const MONTH_DAY = /^\d{2}-\d{2}$/;
const LEGACY_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RULES = 30;

export function isValidMonthDay(value) {
  if (typeof value !== 'string' || !MONTH_DAY.test(value)) return false;
  const [month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(2024, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day;
}

/* 兼容旧数据里写成完整日期的规则，只取月日 */
export function toMonthDay(value) {
  if (typeof value !== 'string') return '';
  const candidate = LEGACY_DATE.test(value) ? value.slice(5) : value;
  return isValidMonthDay(candidate) ? candidate : '';
}

/* 归一化规则：剔除非法月日与不存在的作息、按月日去重排序；
   无有效规则时用开学日（或 01-01）兜底绑定当前作息。 */
export function normalizePeriodRules(value, periodSetIds, semesterStart, fallbackId) {
  const ids = new Set(periodSetIds);
  const seen = new Set();
  const rules = [];
  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_RULES)) {
      if (!item || typeof item !== 'object') continue;
      const from = toMonthDay(item.from);
      const periodSetId = typeof item.periodSetId === 'string' ? item.periodSetId : '';
      if (!from || !ids.has(periodSetId) || seen.has(from)) continue;
      seen.add(from);
      rules.push({ id: item.id || `rule-${from}`, from, periodSetId });
    }
  }
  rules.sort((a, b) => a.from.localeCompare(b.from));
  if (!rules.length && fallbackId && ids.has(fallbackId)) {
    const from = toMonthDay(semesterStart) || '01-01';
    return [{ id: `rule-${from}`, from, periodSetId: fallbackId }];
  }
  return rules;
}

/* 判定某日期生效的作息 id。
   规则每年循环：当年第一条规则之前，沿用上一轮（即最后一条）规则。 */
export function resolvePeriodSetId(rules, dateStr, fallbackId) {
  const key = String(dateStr || '').slice(5);
  const sorted = (Array.isArray(rules) ? rules : [])
    .filter(r => r && isValidMonthDay(r.from))
    .sort((a, b) => a.from.localeCompare(b.from));
  let selected = null;
  for (const rule of sorted) {
    if (rule.from <= key) selected = rule;
    else break;
  }
  if (!selected && sorted.length) selected = sorted[sorted.length - 1];
  return selected ? selected.periodSetId : fallbackId;
}

/* 取某日期实际生效的作息对象 */
export function periodSetForDate(dateStr, sch, periodSets) {
  const id = resolvePeriodSetId(sch && sch.periodRules, dateStr, sch && sch.periodSetId);
  return periodSets.find(p => p.id === id) || periodSets[0];
}

const pad2 = n => String(n).padStart(2, '0');
function parseLocal(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
function fmtLocal(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

/* 整周采用同一套作息：以该教学周最后一天判定。
   切换日落在周中时，整周都用新方案，周视图不会出现两套时间轴。 */
export function periodSetForWeek(dateStr, sch, periodSets) {
  if (!sch || !sch.semesterStart || !dateStr) return periodSetForDate(dateStr, sch, periodSets);
  const start = parseLocal(sch.semesterStart), d = parseLocal(dateStr);
  if (isNaN(start.getTime()) || isNaN(d.getTime())) return periodSetForDate(dateStr, sch, periodSets);
  const week = Math.floor(Math.round((d - start) / 86400000) / 7);
  const anchor = new Date(start);
  anchor.setDate(anchor.getDate() + week * 7 + 6);
  return periodSetForDate(fmtLocal(anchor), sch, periodSets);
}

/* 规则的人类可读描述，用于设置页与课表页提示 */
export function describeRules(rules, periodSets) {
  const nameOf = id => (periodSets.find(p => p.id === id) || {}).name || '未知作息';
  return (rules || [])
    .filter(r => isValidMonthDay(r.from))
    .sort((a, b) => a.from.localeCompare(b.from))
    .map(r => { const [m, d] = r.from.split('-'); return `${Number(m)}月${Number(d)}日起 → ${nameOf(r.periodSetId)}`; });
}
