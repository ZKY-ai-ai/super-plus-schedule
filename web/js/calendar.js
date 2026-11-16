/* ============================================================
   calendar.js — 法定节假日停课、调休上班日、逐日自定义校历
   （F026 / F027 / F029）

   节假日与调休数据、停课与周末可见性判定移植自
   lcymxm/classflow src/lib/holidays.ts（MIT，
   commit 30c466a5c456b7dde01cfc42a3178f83e87de7a6）。
   上游明确不做「调休借用其他星期课表」的映射（各校自定），
   F027 的映射与 F029 的逐日覆盖为本项目新增。
   归属与许可证见 third_party/classflow/NOTICE.md。

   数据来源：国务院办公厅 2026 年（2025-11-04 发布）与 2027 年
   （2026-11-05 发布）节假日安排通知，转引自上游文件，未独立核验
   政府原文；用户可在设置中逐日覆盖。
   ============================================================ */

const HOLIDAYS = [
  { start: '2026-01-01', end: '2026-01-03', name: '元旦' },
  { start: '2026-02-15', end: '2026-02-23', name: '春节' },
  { start: '2026-04-04', end: '2026-04-06', name: '清明节' },
  { start: '2026-05-01', end: '2026-05-05', name: '劳动节' },
  { start: '2026-06-19', end: '2026-06-21', name: '端午节' },
  { start: '2026-09-25', end: '2026-09-27', name: '中秋节' },
  { start: '2026-10-01', end: '2026-10-07', name: '国庆节' },
  { start: '2027-01-01', end: '2027-01-03', name: '元旦' },
  { start: '2027-02-05', end: '2027-02-13', name: '春节' },
  { start: '2027-04-03', end: '2027-04-05', name: '清明节' },
  { start: '2027-05-01', end: '2027-05-05', name: '劳动节' },
  { start: '2027-06-09', name: '端午节' },
  { start: '2027-09-15', name: '中秋节' },
  { start: '2027-10-01', end: '2027-10-07', name: '国庆节' },
];

const WORKDAYS = [
  { date: '2026-01-04', name: '元旦' },
  { date: '2026-02-14', name: '春节' },
  { date: '2026-02-28', name: '春节' },
  { date: '2026-05-09', name: '劳动节' },
  { date: '2026-09-20', name: '国庆节' },
  { date: '2026-10-10', name: '国庆节' },
  { date: '2027-01-31', name: '春节' },
  { date: '2027-02-14', name: '春节' },
  { date: '2027-05-08', name: '劳动节' },
  { date: '2027-09-26', name: '国庆节' },
  { date: '2027-10-09', name: '国庆节' },
];

const pad2 = n => String(n).padStart(2, '0');
function keyOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseKey(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }

const BUILTIN = (() => {
  const map = new Map();
  for (const h of HOLIDAYS) {
    const cursor = parseKey(h.start);
    const end = parseKey(h.end || h.start);
    while (cursor <= end) {
      map.set(keyOf(cursor), { kind: 'holiday', name: h.name, short: '休', source: 'builtin' });
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  for (const w of WORKDAYS) {
    map.set(w.date, { kind: 'workday', name: w.name, short: '班', source: 'builtin' });
  }
  return map;
})();

export const WEEKDAY_CN = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/* 某日的校历信息：自定义覆盖优先于内置安排。
   customDays[date] = {kind:'holiday'|'workday'|'normal', name, mapTo} */
export function dayInfo(dateStr, customDays) {
  const custom = customDays && customDays[dateStr];
  if (custom && custom.kind) {
    if (custom.kind === 'normal') return null;
    return {
      kind: custom.kind,
      name: custom.name || (custom.kind === 'holiday' ? '自定义假日' : '自定义上课日'),
      short: custom.kind === 'holiday' ? '休' : '班',
      mapTo: custom.mapTo || null,
      source: 'custom',
    };
  }
  return BUILTIN.get(dateStr) || null;
}

export function isHoliday(dateStr, customDays, enabled = true) {
  return enabled && dayInfo(dateStr, customDays)?.kind === 'holiday';
}

/* F027：调休/补课日按哪个星期的课表上课（1=周一 … 7=周日），未设置返回 null */
export function makeupTargetDay(dateStr, customDays, enabled = true) {
  if (!enabled) return null;
  const info = dayInfo(dateStr, customDays);
  if (!info || info.kind !== 'workday') return null;
  const n = Number(info.mapTo);
  return n >= 1 && n <= 7 ? n : null;
}

/* 周视图可见天：默认周一到周五；调休上班日落在周末时自动补进来 */
export function visibleDays(weekDates, showWeekends, enabled = true, customDays) {
  const days = showWeekends ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  if (!enabled) return days;
  for (const day of [6, 7]) {
    const date = weekDates[day - 1];
    if (date && dayInfo(date, customDays)?.kind === 'workday' && !days.includes(day)) days.push(day);
  }
  return days.sort((a, b) => a - b);
}

/* 一周的校历摘要，用于课表页提示条 */
export function weekSummary(weekDates, enabled = true, customDays) {
  const holidays = new Set(), workdays = new Set(), mapped = [];
  if (!enabled) return { holidays: [], workdays: [], mapped };
  weekDates.forEach(date => {
    const info = dayInfo(date, customDays);
    if (!info) return;
    if (info.kind === 'holiday') holidays.add(info.name);
    else {
      workdays.add(info.name);
      if (info.mapTo) mapped.push(`${date.slice(5)} 按${WEEKDAY_CN[info.mapTo]}课表`);
    }
  });
  return { holidays: [...holidays], workdays: [...workdays], mapped };
}

/* 列出某日期区间内所有内置安排，供设置页展示与逐日覆盖 */
export function listBuiltin(fromDate, toDate) {
  const out = [];
  const cursor = parseKey(fromDate);
  const end = parseKey(toDate);
  let guard = 0;
  while (cursor <= end && guard++ < 800) {
    const key = keyOf(cursor);
    const info = BUILTIN.get(key);
    if (info) out.push({ date: key, ...info });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
