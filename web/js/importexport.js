/* ============================================================
   importexport.js — 导入（JSON / CSV / ICS / WakeUp 风格 JSON）
   与导出（ICS 日历 / PNG 图片 / JSON / 打印）。
   所有导入先经过预览，支持 替换 / 追加 / 合并 三种模式。
   解析器为原创实现，仅兼容公开的数据格式，不包含任何第三方代码。
   ============================================================ */
import {
  getState, mutate, activeSchedule, activePeriodSet, scheduleCourses, uid,
  dparse, dstr, dadd, todayStr, hm2min, min2hm, defaultPeriods, COURSE_COLORS,
} from './store.js';
import { weekOf, dateOfWeekDay, periodRange, timeToPeriod, sessionsOn } from './schedule.js';
import { visibleDays, dayInfo } from './calendar.js';
import { el, modal, toast, download } from './ui.js';

const DAY_MAP = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const DAY_INV = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/* ---------- 周次字符串解析："1-16" / "1-16单" / "1-16双" / "1,3,5" / "全" ---------- */
export function parseWeeks(str) {
  if (str == null || str === '' || str === '全' || str === 'all') return { type: 'range', from: 1, to: 20, parity: 'all' };
  str = String(str).trim().replace(/周/g, '');
  const parity = /单/.test(str) ? 'odd' : /双/.test(str) ? 'even' : 'all';
  str = str.replace(/[单双]/g, '');
  if (str.includes(',')) {
    const weeks = str.split(',').map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 40);
    return { type: 'list', weeks: [...new Set(weeks)].sort((a, b) => a - b) };
  }
  const m = str.match(/^(\d+)\s*[-–~]\s*(\d+)$/);
  if (m) return { type: 'range', from: +m[1], to: +m[2], parity };
  const single = parseInt(str, 10);
  if (single >= 1) return { type: 'list', weeks: [single] };
  return { type: 'range', from: 1, to: 20, parity: 'all' };
}

export function weeksToString(w) {
  if (!w) return '1-20';
  if (w.type === 'list') return w.weeks.join(',');
  return `${w.from}-${w.to}${w.parity === 'odd' ? '单' : w.parity === 'even' ? '双' : ''}`;
}

/* ---------- 统一解析入口 ---------- */
export function parseImport(text, filename = '') {
  const warnings = [];
  const lower = filename.toLowerCase();
  const trimmed = text.trim();
  if (lower.endsWith('.ics') || /BEGIN:VCALENDAR/i.test(trimmed)) return parseICS(trimmed, warnings);
  if (lower.endsWith('.csv') || (!trimmed.startsWith('{') && !trimmed.startsWith('[') && trimmed.includes(','))) return parseCSV(trimmed, warnings);
  return parseJSON(trimmed, warnings);
}

/* ---------- JSON ---------- */
function parseJSON(text, warnings) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('JSON 解析失败，请检查文件格式'); }
  // 课隙课程导出格式
  if (obj.app === 'coursegap-courses' && Array.isArray(obj.courses)) {
    return { courses: obj.courses.map(normCourse).filter(Boolean), warnings, source: '课隙 JSON' };
  }
  // WakeUp 风格：{courseInfos:[{name,teacher,location,day,start,step,weeks:[...]}]}
  const arr = Array.isArray(obj) ? obj : (Array.isArray(obj.courseInfos) ? obj.courseInfos : null);
  if (!arr) throw new Error('无法识别的 JSON 结构：需要课程数组，或含 courseInfos 字段的对象');
  const byName = new Map();
  for (const it of arr) {
    if (!it || (!it.name && !it.courseName)) continue;
    const name = String(it.name || it.courseName).trim();
    const teacher = String(it.teacher || '').trim();
    const location = String(it.location || it.classroom || '').trim();
    const key = name + '|' + teacher;
    if (!byName.has(key)) byName.set(key, { name, teacher, location, notes: String(it.note || it.notes || ''), slots: [] });
    const c = byName.get(key);
    const day = Number(it.day);
    const start = Number(it.start ?? it.startPeriod);
    const step = Number(it.step ?? it.length ?? 1);
    const end = Number(it.end ?? it.endPeriod ?? (start + step - 1));
    if (!(day >= 1 && day <= 7) || !(start >= 1) || !(end >= start)) {
      warnings.push(`「${name}」有一条时段无法识别（day=${it.day}, start=${it.start}），已跳过`);
      continue;
    }
    let weeks;
    if (Array.isArray(it.weeks)) weeks = compressWeeks(it.weeks.map(Number).filter(n => n >= 1));
    else weeks = parseWeeks(it.weeks ?? it.weekRange);
    c.slots.push({ id: uid(), day, start, end, weeks, location: it.location && it.location !== location ? String(it.location) : undefined });
  }
  const courses = [...byName.values()].filter(c => c.slots.length);
  if (!courses.length) throw new Error('JSON 中没有可识别的课程时段');
  return { courses, warnings, source: /courseInfos/.test(text) ? 'WakeUp 风格 JSON' : 'JSON' };
}

/* 把周次数组压缩为 range+单双 或 list */
function compressWeeks(weeks) {
  const ws = [...new Set(weeks)].sort((a, b) => a - b);
  if (!ws.length) return { type: 'range', from: 1, to: 20, parity: 'all' };
  const contiguous = ws.every((w, i) => i === 0 || w === ws[i - 1] + 1);
  if (contiguous) return { type: 'range', from: ws[0], to: ws[ws.length - 1], parity: 'all' };
  const odd = ws.every(w => w % 2 === 1), even = ws.every(w => w % 2 === 0);
  const step2 = ws.every((w, i) => i === 0 || w === ws[i - 1] + 2);
  if (step2 && odd) return { type: 'range', from: ws[0], to: ws[ws.length - 1], parity: 'odd' };
  if (step2 && even) return { type: 'range', from: ws[0], to: ws[ws.length - 1], parity: 'even' };
  return { type: 'list', weeks: ws };
}

function normCourse(c) {
  if (!c || !c.name || !Array.isArray(c.slots)) return null;
  return {
    name: String(c.name), teacher: String(c.teacher || ''), location: String(c.location || ''),
    notes: String(c.notes || ''), color: c.color,
    slots: c.slots.filter(s => s.day >= 1 && s.day <= 7 && s.end >= s.start).map(s => ({
      id: uid(), day: s.day, start: s.start, end: s.end, weeks: s.weeks || { type: 'range', from: 1, to: 20, parity: 'all' }, location: s.location,
    })),
  };
}

/* ---------- CSV ---------- */
const CSV_ALIASES = {
  name: ['课程名称', '课程', '名称', 'name', 'course', 'coursename'],
  teacher: ['教师', '老师', 'teacher'],
  location: ['教室', '地点', '上课地点', 'location', 'classroom', 'room'],
  day: ['星期', '周几', 'day', 'weekday'],
  start: ['开始节次', '开始节', '起始节次', 'start', 'startperiod'],
  end: ['结束节次', '结束节', 'end', 'endperiod'],
  step: ['节数', '连堂', 'step', 'length'],
  weeks: ['周次', '起止周', 'weeks', 'weekrange'],
  notes: ['备注', 'notes', 'note'],
};
function splitCSVLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim());
}
function parseCSV(text, warnings) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV 至少需要表头和一行数据');
  const header = splitCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s/g, ''));
  const col = {};
  for (const [field, aliases] of Object.entries(CSV_ALIASES)) {
    col[field] = header.findIndex(h => aliases.includes(h));
  }
  if (col.name < 0 || col.day < 0 || col.start < 0) throw new Error('CSV 缺少必需列：课程名称、星期、开始节次（可下载模板对照）');
  const dayNorm = v => {
    const n = Number(String(v).replace(/[周星期]/g, ''));
    if (n >= 1 && n <= 7) return n;
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    return map[String(v).replace(/[周星期]/g, '')] || 0;
  };
  const byName = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const get = f => col[f] >= 0 ? (cells[col[f]] || '') : '';
    const name = get('name'); if (!name) continue;
    const day = dayNorm(get('day'));
    const start = parseInt(get('start'), 10);
    const end = col.end >= 0 && get('end') ? parseInt(get('end'), 10) : start + (parseInt(get('step'), 10) || 1) - 1;
    if (!day || !start || end < start) { warnings.push(`第 ${i + 1} 行「${name}」时段无效，已跳过`); continue; }
    const key = name + '|' + get('teacher');
    if (!byName.has(key)) byName.set(key, { name, teacher: get('teacher'), location: get('location'), notes: get('notes'), slots: [] });
    byName.get(key).slots.push({ id: uid(), day, start, end, weeks: parseWeeks(get('weeks')) });
  }
  const courses = [...byName.values()];
  if (!courses.length) throw new Error('CSV 中没有有效课程行');
  return { courses, warnings, source: 'CSV' };
}

/* ---------- ICS ---------- */
function parseICS(text, warnings) {
  const events = [];
  const blocks = text.split(/BEGIN:VEVENT/i).slice(1);
  for (const b of blocks) {
    const body = b.split(/END:VEVENT/i)[0];
    const get = key => {
      const m = body.match(new RegExp('^' + key + '[^:\\r\\n]*:(.+)$', 'mi'));
      return m ? m[1].trim() : '';
    };
    const summary = get('SUMMARY').replace(/\\,/g, ',').replace(/\\n/g, ' ');
    if (!summary) continue;
    const dtstart = get('DTSTART'), dtend = get('DTEND');
    const m = dtstart.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
    if (!m) { warnings.push(`「${summary}」缺少有效开始时间，已跳过`); continue; }
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const startTime = `${m[4]}:${m[5]}`;
    const me = dtend.match(/T(\d{2})(\d{2})/);
    const endTime = me ? `${me[1]}:${me[2]}` : min2hm(hm2min(startTime) + 90);
    const rrule = get('RRULE');
    let interval = 1, until = '';
    if (/FREQ=WEEKLY/i.test(rrule)) {
      const iv = rrule.match(/INTERVAL=(\d+)/i); interval = iv ? +iv[1] : 1;
      const un = rrule.match(/UNTIL=(\d{8})/i);
      if (un) until = `${un[1].slice(0, 4)}-${un[1].slice(4, 6)}-${un[1].slice(6, 8)}`;
    }
    const exdates = (body.match(/^EXDATE[^:\r\n]*:(.+)$/gmi) || [])
      .flatMap(l => l.split(':')[1].split(','))
      .map(x => { const mm = x.match(/(\d{4})(\d{2})(\d{2})/); return mm ? `${mm[1]}-${mm[2]}-${mm[3]}` : ''; })
      .filter(Boolean);
    events.push({ summary, location: get('LOCATION').replace(/\\,/g, ','), teacher: (get('DESCRIPTION').match(/教师[:：]\s*([^\n\\]+)/) || [])[1] || '', date, startTime, endTime, interval, until, exdates });
  }
  if (!events.length) throw new Error('ICS 中没有可识别的课程事件');

  const sch = activeSchedule();
  const ps = activePeriodSet();
  const extraPeriods = [];
  const ensurePeriod = (hm, which) => {
    let p = timeToPeriod(hm, ps, which);
    if (p) return p;
    const exist = extraPeriods.find(x => x[which] === hm);
    if (exist) return exist.p;
    const pNew = Math.max(...ps.periods.map(x => x.p), ...extraPeriods.map(x => x.p), 0) + 1;
    const block = which === 'start'
      ? { p: pNew, start: hm, end: min2hm(hm2min(hm) + 45) }
      : { p: pNew, start: min2hm(Math.max(0, hm2min(hm) - 45)), end: hm };
    extraPeriods.push(block);
    return pNew;
  };

  const byName = new Map();
  for (const ev of events) {
    const key = ev.summary + '|' + ev.teacher;
    if (!byName.has(key)) byName.set(key, { name: ev.summary, teacher: ev.teacher, location: ev.location, notes: '', slots: [] });
    const c = byName.get(key);
    const firstWeek = weekOf(ev.date, sch);
    const day = ((dparse(ev.date).getDay() + 6) % 7) + 1;
    let lastDate = ev.until;
    if (!lastDate) {
      // 无 UNTIL：默认持续到学期末
      lastDate = dateOfWeekDay(sch.totalWeeks, day, sch);
    }
    const lastWeek = Math.min(sch.totalWeeks, Math.max(firstWeek, weekOf(lastDate, sch)));
    const parity = ev.interval === 2 ? (firstWeek % 2 === 1 ? 'odd' : 'even') : 'all';
    const weeks = firstWeek < 1
      ? { type: 'range', from: 1, to: lastWeek, parity }
      : { type: 'range', from: firstWeek, to: lastWeek, parity };
    const startP = ensurePeriod(ev.startTime, 'start');
    const endP = ensurePeriod(ev.endTime, 'end');
    c.slots.push({ id: uid(), day, start: Math.min(startP, endP), end: Math.max(startP, endP), weeks, location: ev.location || undefined });
    if (ev.exdates.length) warnings.push(`「${ev.summary}」含 ${ev.exdates.length} 个排除日期（单次停课），导入后请在课表中核对`);
  }
  if (extraPeriods.length) {
    warnings.push(`有 ${extraPeriods.length} 个时间与当前作息不匹配，将创建「导入作息」并绑定当前课表`);
  }
  return { courses: [...byName.values()], warnings, source: 'ICS 日历', extraPeriods };
}

/* ---------- 导入预览与应用 ---------- */
export function previewImport(parsed, { onApplied } = {}) {
  const { courses, warnings, source, extraPeriods } = parsed;
  let mode = 'append';
  const modeSeg = el('div', { class: 'seg' },
    ...[['append', '追加'], ['merge', '合并'], ['replace', '替换']].map(([v, label]) =>
      el('button', {
        class: v === mode ? 'active' : '', dataset: { v },
        onclick: e => { mode = v; modeSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === v)); },
      }, label)));

  const table = el('table', { class: 'preview-table' },
    el('thead', {}, el('tr', {}, ['课程', '教师', '地点', '时段', '周次'].map(h => el('th', {}, h)))),
    el('tbody', {}, courses.map(c => el('tr', {},
      el('td', {}, c.name),
      el('td', {}, c.teacher || '—'),
      el('td', {}, c.location || '—'),
      el('td', {}, c.slots.map(s => `周${'一二三四五六日'[s.day - 1]} ${s.start}-${s.end}节`).join('；')),
      el('td', {}, c.slots.map(s => weeksToString(s.weeks)).join('；')),
    ))));

  const body = el('div', {},
    el('p', { class: 'muted small mb' }, `来源：${source} · 共 ${courses.length} 门课程。请选择导入方式：`),
    el('div', { class: 'row mb' }, modeSeg,
      el('span', { class: 'small muted' }, '追加=直接加入；合并=同名同教师课程并入时段；替换=清空当前课表后导入')),
    warnings.length ? el('div', { class: 'card mb', style: { borderColor: 'var(--warn)' } },
      el('h3', {}, '注意'), ...warnings.map(w => el('p', { class: 'small muted' }, '· ' + w))) : null,
    el('div', { style: { maxHeight: '300px', overflowY: 'auto' } }, table),
  );

  modal(`导入预览（${courses.length} 门课程）`, body, {
    wide: true,
    actions: [
      { label: '取消' },
      {
        label: '确认导入', kind: 'primary', onClick: close => {
          applyImport(parsed, mode);
          close();
          toast(`已导入 ${courses.length} 门课程（${mode === 'replace' ? '替换' : mode === 'merge' ? '合并' : '追加'}）`);
          onApplied && onApplied();
        },
      },
    ],
  });
}

export function applyImport(parsed, mode) {
  const { courses, extraPeriods } = parsed;
  mutate(s => {
    const sch = activeSchedule();
    if (extraPeriods && extraPeriods.length) {
      // 保留原节次编号（导入课程的 slot 引用这些编号），仅按时间排序展示
      const ps = { id: uid(), name: '导入作息', periods: [...activePeriodSet().periods, ...extraPeriods].sort((a, b) => hm2min(a.start) - hm2min(b.start)) };
      s.settings.periodSets.push(ps);
      sch.periodSetId = ps.id;
    }
    if (mode === 'replace') {
      const ids = new Set(s.courses.filter(c => c.scheduleId === sch.id).map(c => c.id));
      s.courses = s.courses.filter(c => !ids.has(c.id));
      s.overrides = s.overrides.filter(o => !ids.has(o.courseId));
    }
    let colorIdx = scheduleCourses().length;
    for (const nc of courses) {
      const existing = mode === 'merge'
        ? s.courses.find(c => c.scheduleId === sch.id && c.name === nc.name && (c.teacher || '') === (nc.teacher || ''))
        : null;
      if (existing) {
        for (const slot of nc.slots) {
          const dup = existing.slots.some(x => x.day === slot.day && x.start === slot.start && x.end === slot.end && weeksToString(x.weeks) === weeksToString(slot.weeks));
          if (!dup) existing.slots.push({ ...slot, id: uid() });
        }
        if (!existing.location && nc.location) existing.location = nc.location;
      } else {
        s.courses.push({
          id: uid(), scheduleId: sch.id, name: nc.name, teacher: nc.teacher || '',
          location: nc.location || '', notes: nc.notes || '', alias: '',
          color: nc.color || COURSE_COLORS[colorIdx++ % COURSE_COLORS.length],
          slots: nc.slots.map(x => ({ ...x, id: uid() })),
        });
      }
    }
  });
}

/* ---------- 导出：课程 JSON ---------- */
export function exportCoursesJSON() {
  const sch = activeSchedule();
  const data = {
    app: 'coursegap-courses', version: 1, exportedAt: new Date().toISOString(),
    schedule: { name: sch.name, semesterStart: sch.semesterStart, totalWeeks: sch.totalWeeks },
    courses: scheduleCourses().map(c => ({
      name: c.name, teacher: c.teacher, location: c.location, notes: c.notes, color: c.color,
      slots: c.slots.map(s => ({ day: s.day, start: s.start, end: s.end, weeks: s.weeks, location: s.location })),
    })),
  };
  download(`coursegap-课程-${todayStr()}.json`, JSON.stringify(data, null, 2), 'application/json');
}

/* ---------- 导出：CSV 模板 ---------- */
export function exportCSVTemplate() {
  const rows = [
    '课程名称,教师,教室,星期,开始节次,结束节次,周次,备注',
    '高等数学,张老师,教一-201,1,1,2,1-16,',
    '大学英语,李老师,外语楼-305,3,3,4,1-16单,单周上课',
    '数据结构,王老师,教三-402,5,5,6,"1,3,5,7,9",示例：逐周勾选请用英文逗号并加引号',
  ];
  download('coursegap-导入模板.csv', '﻿' + rows.join('\r\n'), 'text/csv');
}

/* ---------- 导出：ICS ---------- */
function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function icsDate(dateStr, hm) { return dateStr.replace(/-/g, '') + 'T' + hm.replace(':', '') + '00'; }

export function buildICS() {
  const s = getState();
  const sch = activeSchedule();
  const ps = activePeriodSet();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CourseGap//课隙//CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(sch.name)}（课隙）`];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  let n = 0;
  for (const c of scheduleCourses()) {
    for (const slot of c.slots || []) {
      const range = periodRange(slot.start, slot.end, ps);
      if (!range) continue;
      // 找到第一个上课周
      let firstWeek = null, lastWeek = null;
      for (let w = 1; w <= sch.totalWeeks; w++) {
        const inW = slot.weeks ? (slot.weeks.type === 'list' ? slot.weeks.weeks.includes(w)
          : (w >= slot.weeks.from && w <= slot.weeks.to && (slot.weeks.parity === 'all' || (slot.weeks.parity === 'odd') === (w % 2 === 1)))) : true;
        if (inW) { if (firstWeek == null) firstWeek = w; lastWeek = w; }
      }
      if (firstWeek == null) continue;
      const firstDate = dateOfWeekDay(firstWeek, slot.day, sch);
      const lastDate = dateOfWeekDay(lastWeek, slot.day, sch);
      const interval = slot.weeks && slot.weeks.parity !== 'all' && slot.weeks.type !== 'list' ? 2 : 1;
      const cancels = s.overrides.filter(o => o.courseId === c.id && o.slotId === slot.id && o.type === 'cancel');
      const moves = s.overrides.filter(o => o.courseId === c.id && o.slotId === slot.id && o.type === 'move');
      const desc = `教师：${c.teacher || '未设置'}${c.notes ? '\\n备注：' + c.notes : ''}\\n由课隙 CourseGap 导出`;
      lines.push('BEGIN:VEVENT',
        `UID:coursegap-${c.id}-${slot.id}-${n++}@coursegap.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDate(firstDate, range.start)}`,
        `DTEND:${icsDate(firstDate, range.end)}`,
        `RRULE:FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${DAY_INV[slot.day]};UNTIL=${icsDate(lastDate, range.end)}`,
        `SUMMARY:${icsEscape(c.name)}`,
        `LOCATION:${icsEscape(slot.location || c.location)}`,
        `DESCRIPTION:${icsEscape(desc)}`);
      if (s.settings.remindBefore > 0) lines.push('BEGIN:VALARM', `TRIGGER:-PT${s.settings.remindBefore}M`, 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(c.name)} 即将开始`, 'END:VALARM');
      for (const o of cancels) lines.push(`EXDATE:${icsDate(o.date, range.start)}`);
      for (const o of moves) {
        lines.push(`EXDATE:${icsDate(o.date, range.start)}`);
      }
      lines.push('END:VEVENT');
      // 调课后的单次课次作为独立事件
      for (const o of moves) {
        if (!o.toDate) continue;
        const mr = periodRange(o.toStart ?? slot.start, o.toEnd ?? slot.end, ps);
        if (!mr) continue;
        lines.push('BEGIN:VEVENT',
          `UID:coursegap-move-${o.id}@coursegap.local`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${icsDate(o.toDate, mr.start)}`,
          `DTEND:${icsDate(o.toDate, mr.end)}`,
          `SUMMARY:${icsEscape(c.name)}（调课）`,
          `LOCATION:${icsEscape(o.toLocation ?? slot.location ?? c.location)}`,
          `DESCRIPTION:${icsEscape('原上课日：' + o.date + '\\n由课隙 CourseGap 导出')}`,
          'END:VEVENT');
      }
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
export function exportICS() {
  download(`coursegap-${activeSchedule().name}-${todayStr()}.ics`, buildICS(), 'text/calendar');
  toast('ICS 已导出：可导入 Apple / Google / Outlook 日历（静态快照，调课后需重新导出）');
}

/* ---------- 导出：PNG 周课表图 ---------- */
export function exportPNG(week) {
  const sch = activeSchedule();
  const dates = Array.from({ length: 7 }, (_, i) => dateOfWeekDay(week, ((sch.weekStart || 1) - 1 + i) % 7 + 1, sch));
  const ps = activePeriodSet(dates[0]);
  const st = getState();
  const days = visibleDays(dates, st.settings.showWeekends, st.settings.autoHolidays, st.settings.customDays);
  const periods = ps.periods;
  const W = 1200, headH = 64, leftW = 90, rowH = 72;
  const H = headH + periods.length * rowH + 40;
  const scale = 2;
  const cv = document.createElement('canvas');
  cv.width = W * scale; cv.height = H * scale;
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue('--site-surface').trim() || '#fff';
  const fg = css.getPropertyValue('--site-fg').trim() || '#222';
  const muted = css.getPropertyValue('--site-muted').trim() || '#888';
  const border = css.getPropertyValue('--site-border').trim() || '#ddd';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg; ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`${sch.name} · 第 ${week} 周`, 16, 30);
  ctx.fillStyle = muted; ctx.font = '13px sans-serif';
  ctx.fillText(`${dates[0]} ~ ${dates[6]} · 课隙 CourseGap 导出`, 16, 50);
  const colW = (W - leftW) / days.length;
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  ctx.textAlign = 'center';
  days.forEach((day, i) => {
    const d = dates[day - 1];
    const x = leftW + i * colW;
    ctx.fillStyle = d === todayStr() ? (css.getPropertyValue('--site-accent').trim() || '#4f6df5') : fg;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(dayNames[day - 1], x + colW / 2, headH - 22);
    ctx.fillStyle = muted; ctx.font = '12px sans-serif';
    ctx.fillText(d.slice(5), x + colW / 2, headH - 6);
    const info = dayInfo(d, st.settings.customDays);
    if (info) {
      ctx.fillStyle = info.kind === 'holiday' ? '#d97706' : '#18a058';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`${info.short} ${info.name}`, x + colW / 2, headH - 46);
    }
  });
  ctx.textAlign = 'left';
  periods.forEach((p, r) => {
    const y = headH + r * rowH;
    ctx.strokeStyle = border; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillStyle = fg; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(String(p.p), 12, y + rowH / 2 - 4);
    ctx.fillStyle = muted; ctx.font = '11px sans-serif';
    ctx.fillText(p.start, 12, y + rowH / 2 + 12);
    ctx.fillText(p.end, 46, y + rowH / 2 + 12);
  });
  for (let i = 0; i <= days.length; i++) {
    const x = leftW + i * colW;
    ctx.strokeStyle = border; ctx.beginPath(); ctx.moveTo(x, headH); ctx.lineTo(x, H - 40); ctx.stroke();
  }
  const colorVals = {};
  for (let i = 1; i <= 10; i++) colorVals[i] = css.getPropertyValue(`--course-${i}`).trim() || '#4f6df5';
  days.forEach((day, i) => {
    const d = dates[day - 1];
    const list = sessionsOn(d);
    for (const ses of list) {
      const r0 = periods.findIndex(p => p.p === ses.periodStart);
      const r1 = periods.findIndex(p => p.p === ses.periodEnd);
      if (r0 < 0 || r1 < 0) continue;
      const x = leftW + i * colW + 3, y = headH + r0 * rowH + 3;
      const w = colW - 6, h = (r1 - r0 + 1) * rowH - 6;
      const col = colorVals[ses.color] || colorVals[1];
      ctx.fillStyle = col + '26';
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(x, y, 4, h);
      ctx.fillStyle = fg; ctx.font = 'bold 13px sans-serif';
      const name = ses.name.length > 9 ? ses.name.slice(0, 9) + '…' : ses.name;
      ctx.fillText(name, x + 10, y + 20, w - 16);
      ctx.fillStyle = muted; ctx.font = '12px sans-serif';
      if (ses.location) ctx.fillText(ses.location, x + 10, y + 38, w - 16);
      if (ses.teacher) ctx.fillText(ses.teacher, x + 10, y + 54, w - 16);
      if (ses.moved) { ctx.fillStyle = '#d97706'; ctx.fillText('调课', x + w - 34, y + 20); }
    }
  });
  ctx.fillStyle = muted; ctx.font = '12px sans-serif';
  ctx.fillText('数据来自本机课表 · 导出时间 ' + new Date().toLocaleString('zh-CN'), 16, H - 14);
  cv.toBlob(blob => {
    download(`coursegap-第${week}周课表.png`, blob, 'image/png');
    toast('课表图片已导出');
  }, 'image/png');
}