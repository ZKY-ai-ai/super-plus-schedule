/* ============================================================
   store.js — 数据模型、本地持久化、撤销/重做、示例数据
   数据仅存本机 localStorage，不上传任何服务器。
   核心设计：区分「每周重复的课程规则(slot)」与「具体某天的课次
   (session)」，单次调课/停课通过 overrides 表达，不破坏规则。
   ============================================================ */

export const STORAGE_KEY = 'coursegap.v1';
export const COURSE_COLORS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/* ---------- 日期工具（全部用本地时区的 YYYY-MM-DD 字符串） ---------- */
export const pad2 = n => String(n).padStart(2, '0');
export function dstr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function dparse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function dadd(s, days) { const d = dparse(s); d.setDate(d.getDate() + days); return dstr(d); }
export const todayStr = () => dstr(new Date());
export function weekdayCN(s) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dparse(s).getDay()]; }
export function mdCN(s) { const d = dparse(s); return `${d.getMonth() + 1}月${d.getDate()}日`; }
export function diffDays(a, b) { return Math.round((dparse(b) - dparse(a)) / 86400000); }
export function nowHM() { const d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
export function hm2min(hm) { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }
export function min2hm(v) { return pad2(Math.floor(v / 60)) + ':' + pad2(v % 60); }

/* ---------- 默认作息（12 节，45 分钟/节） ---------- */
export function defaultPeriods() {
  const starts = ['08:00', '08:55', '10:00', '10:55', '14:00', '14:55', '16:00', '16:55', '19:00', '19:55', '20:50', '21:45'];
  return starts.map((s, i) => ({ p: i + 1, start: s, end: min2hm(hm2min(s) + 45) }));
}

export function defaultState() {
  const periodSetId = uid();
  const scheduleId = uid();
  return {
    version: 1,
    settings: {
      theme: 'auto',
      periodSets: [{ id: periodSetId, name: '默认作息（45分钟/节）', periods: defaultPeriods() }],
      walkDefault: 10,        // 默认步行分钟
      walkBuffer: 5,          // 收拾/缓冲分钟
      walkMatrix: {},         // "楼A|楼B" -> 分钟
      lunch: { start: '11:30', end: '13:00' },
      dayStart: '08:00', dayEnd: '22:00',
      remindBefore: 15,       // 课前提前量（分钟）
      ddlRemind: true,
      ai: { endpoint: '', apiKey: '', model: '', visionModel: '', enabled: false },
      notifications: false,
    },
    schedules: [{
      id: scheduleId, name: '我的课表',
      semesterStart: guessSemesterStart(), totalWeeks: 20, weekStart: 1,
      periodSetId,
    }],
    activeScheduleId: scheduleId,
    courses: [],
    overrides: [],   // {id,courseId,slotId,date,type:'cancel'|'move',toDate,toStart,toEnd,toLocation,reason}
    tasks: [],       // {id,courseId,title,due,priority,done,doneAt,subtasks:[{id,title,done}],createdAt}
    exams: [],       // {id,courseId,name,date,start,end,location,seat,notes}
    buildings: [],   // {name}
    ui: { view: 'today', ttMode: 'grid', ttWeekOffset: 0 },
    meta: { createdAt: new Date().toISOString(), sampleLoaded: false },
  };
}

/* 根据当前日期估算一个合理的开学日（最近的 9 月或 2/3 月的周一） */
export function guessSemesterStart() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  let start;
  if (m >= 8) start = new Date(y, 8, 1);
  else if (m >= 2) start = new Date(y, 1, 20);
  else start = new Date(y - 1, 8, 1);
  while (start.getDay() !== 1) start.setDate(start.getDate() + 1);
  return dstr(start);
}

/* ---------- 状态与订阅 ---------- */
let state = null;
const listeners = new Set();
let undoStack = [], redoStack = [];
const UNDO_LIMIT = 50;

export function getState() { return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = migrate(parsed);
    } else {
      state = defaultState();
    }
  } catch (e) {
    console.warn('本地数据读取失败，已重置', e);
    state = defaultState();
  }
  return state;
}

function migrate(s) {
  const d = defaultState();
  // 宽松合并：保留已有字段，补齐新增字段
  s.settings = { ...d.settings, ...(s.settings || {}) };
  s.settings.ai = { ...d.settings.ai, ...(s.settings.ai || {}) };
  s.ui = { ...d.ui, ...(s.ui || {}) };
  s.meta = { ...d.meta, ...(s.meta || {}) };
  for (const k of ['schedules', 'courses', 'overrides', 'tasks', 'exams', 'buildings']) {
    if (!Array.isArray(s[k])) s[k] = d[k];
  }
  if (!s.schedules.length) { s.schedules = d.schedules; s.activeScheduleId = d.activeScheduleId; }
  if (!s.schedules.find(x => x.id === s.activeScheduleId)) s.activeScheduleId = s.schedules[0].id;
  s.version = 1;
  return s;
}

let saveTimer = null;
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.error('保存失败', e); }
  }, 150);
}

/* 修改状态：pushUndo=true 时记录快照（用于撤销） */
export function mutate(fn, { undoable = true, silent = false } = {}) {
  if (undoable) {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
  }
  fn(state);
  persist();
  if (!silent) emit();
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(JSON.stringify(state));
  state = JSON.parse(undoStack.pop());
  persist(); emit();
  return true;
}
export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(JSON.stringify(state));
  state = JSON.parse(redoStack.pop());
  persist(); emit();
  return true;
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

/* ---------- 常用访问器 ---------- */
export const activeSchedule = () => state.schedules.find(s => s.id === state.activeScheduleId) || state.schedules[0];
export const activePeriodSet = () => {
  const sch = activeSchedule();
  return state.settings.periodSets.find(p => p.id === sch.periodSetId) || state.settings.periodSets[0];
};
export const scheduleCourses = () => state.courses.filter(c => c.scheduleId === state.activeScheduleId);
export const courseById = id => state.courses.find(c => c.id === id);
export const courseColor = c => `var(--course-${((c && c.color) || 1)})`;

export function weeksLabel(slot) {
  const w = slot.weeks;
  if (!w) return '全周';
  if (w.type === 'list') return w.weeks.join(',') + '周';
  const parity = w.parity === 'odd' ? '单' : w.parity === 'even' ? '双' : '';
  return `${w.from}-${w.to}周${parity ? '·' + parity : ''}`;
}

export function slotInWeek(slot, week) {
  const w = slot.weeks;
  if (!w) return true;
  if (w.type === 'list') return w.weeks.includes(week);
  if (week < w.from || week > w.to) return false;
  if (w.parity === 'odd') return week % 2 === 1;
  if (w.parity === 'even') return week % 2 === 0;
  return true;
}

/* ---------- 示例数据（明确标注为示例） ---------- */
export function loadSample() {
  mutate(s => {
    const sch = activeSchedule();
    sch.name = '示例课表（2026 秋季）';
    sch.semesterStart = guessSemesterStart();
    sch.totalWeeks = 20;
    const mk = (name, teacher, location, color, slots, notes = '') => ({
      id: uid(), scheduleId: sch.id, name, teacher, location, color, notes, alias: '', slots,
    });
    const slot = (day, start, end, from = 1, to = 16, parity = 'all', location) =>
      ({ id: uid(), day, start, end, weeks: { type: 'range', from, to, parity }, location });
    s.courses = s.courses.filter(c => c.scheduleId !== sch.id);
    s.courses.push(
      mk('高等数学 A(上)', '张明远', '教一-201', 1, [slot(1, 1, 2), slot(3, 3, 4, 1, 16, 'all', '教一-201')], '重点：期中前完成极限与导数章节'),
      mk('大学英语 IV', '李婉清', '外语楼-305', 2, [slot(2, 1, 2), slot(4, 1, 2, 1, 16, 'odd')]),
      mk('数据结构与算法', '王建国', '教三-402', 3, [slot(2, 5, 6), slot(5, 3, 4)], '实验课在计算中心-204，见备注'),
      mk('大学物理 B', '陈思远', '教二-108', 4, [slot(3, 5, 6, 1, 14), slot(5, 1, 2, 1, 14, 'even')]),
      mk('思想政治理论', '刘振华', '教一-101', 5, [slot(4, 5, 6, 1, 12)]),
      mk('体育 IV · 羽毛球', '赵刚', '体育馆-2F', 6, [slot(5, 7, 8, 1, 16, 'odd')]),
      mk('Python 程序设计（选修）', '周晓芸', '计算中心-204', 7, [slot(1, 9, 10, 3, 14)]),
      mk('线性代数', '孙丽华', '教二-305', 8, [slot(1, 3, 4, 1, 16, 'even'), slot(4, 3, 4)]),
    );
    const cByName = n => s.courses.find(c => c.name.startsWith(n));
    const t = (title, courseName, dueOffset, priority, subtasks = []) => ({
      id: uid(), courseId: cByName(courseName)?.id || '', title,
      due: dadd(todayStr(), dueOffset) + 'T23:59', priority, done: false, doneAt: null,
      subtasks: subtasks.map(x => ({ id: uid(), title: x, done: false })),
      createdAt: new Date().toISOString(),
    });
    s.tasks.push(
      t('高数第 5 章习题 5.1–5.3', '高等数学', 1, 'high', ['5.1 奇数题', '5.2 全部', '5.3 选做']),
      t('数据结构实验报告：链表', '数据结构', 2, 'high', ['代码实现', '撰写报告', '提交平台']),
      t('英语单元测验准备', '大学英语', 3, 'mid'),
      t('物理实验预习报告', '大学物理', 5, 'mid'),
      t('Python 大作业选题', 'Python', 8, 'low'),
    );
    const exam = (name, courseName, offset, start, end, location, seat) => ({
      id: uid(), courseId: cByName(courseName)?.id || '', name,
      date: dadd(todayStr(), offset), start, end, location, seat, notes: '',
    });
    s.exams.push(
      exam('数据结构期中考试', '数据结构', 6, '10:00', '11:40', '教三-402', '23'),
      exam('高等数学 A(上) 期末', '高等数学', 24, '09:00', '11:00', '教一-201', ''),
      exam('大学英语 IV 期末', '大学英语', 27, '14:00', '16:00', '外语楼-305', ''),
    );
    s.buildings = ['教一', '教二', '教三', '外语楼', '计算中心', '体育馆', '图书馆', '食堂'].map(name => ({ name }));
    const key = (a, b) => [a, b].sort().join('|');
    s.settings.walkMatrix = {
      [key('教一', '教二')]: 5, [key('教一', '教三')]: 8, [key('教二', '教三')]: 6,
      [key('教一', '外语楼')]: 12, [key('教三', '计算中心')]: 4, [key('教一', '图书馆')]: 7,
      [key('教一', '食堂')]: 6, [key('教一', '体育馆')]: 15,
    };
    s.meta.sampleLoaded = true;
  });
}

/* ---------- 完整备份 / 恢复 ---------- */
export function exportBackup() {
  return JSON.stringify({ app: 'coursegap', version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
}
export function importBackup(json) {
  const obj = typeof json === 'string' ? JSON.parse(json) : json;
  const incoming = obj.app === 'coursegap' ? obj.state : obj;
  if (!incoming || !Array.isArray(incoming.courses) || !Array.isArray(incoming.schedules)) {
    throw new Error('不是有效的课隙备份文件');
  }
  mutate(s => {
    const merged = migrate(incoming);
    Object.keys(merged).forEach(k => { s[k] = merged[k]; });
  });
}