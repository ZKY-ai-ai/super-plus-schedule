/* ============================================================
   app.js — 应用入口：导航、主题、渲染调度、提醒、PWA
   ============================================================ */
import { loadState, getState, subscribe, mutate, undo, redo, activeSchedule, todayStr, dparse, loadSample } from './store.js';
import { currentWeek, sessionsOn, inSemester } from './schedule.js';
import { el, fillIcons, toast, ico, modal } from './ui.js';
import { renderToday } from './views/today.js';
import { renderTimetable } from './views/timetable.js';
import { renderTasks } from './views/tasks.js';
import { renderExams } from './views/exams.js';
import { renderGaps } from './views/gaps.js';
import { renderAssistant } from './views/assistant.js';
import { renderSettings } from './views/settings.js';
import { applyAppearance } from './appearance.js';
import { initShortcuts, openPalette } from './commands.js';
import { syncPet } from './pet.js';

const VIEWS = {
  today: renderToday, timetable: renderTimetable, tasks: renderTasks,
  exams: renderExams, gaps: renderGaps, assistant: renderAssistant, settings: renderSettings,
};

loadState();
fillIcons();

/* ---------- 主题 ---------- */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = getState().settings.theme || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.getElementById('theme-toggle').innerHTML = ico(dark ? 'sun' : 'moon');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#12151c' : '#4f6df5';
  applyAppearance(getState().settings, dark);
}
mq.addEventListener('change', applyTheme);
document.getElementById('theme-toggle').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  mutate(s => { s.settings.theme = cur === 'dark' ? 'light' : 'dark'; }, { undoable: false });
});

/* ---------- 导航 ---------- */
function nav(view) {
  if (!VIEWS[view]) view = 'today';
  mutate(s => { s.ui.view = view; }, { undoable: false, silent: true });
  renderAll();
  document.getElementById('main').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => nav(btn.dataset.view));
});

/* ---------- 课表切换器 ---------- */
const switcher = document.getElementById('schedule-switcher');
switcher.addEventListener('change', () => {
  mutate(s => { s.activeScheduleId = switcher.value; s.ui.ttWeekOffset = 0; }, { undoable: false });
});

/* ---------- 渲染 ---------- */
function renderAll() {
  const s = getState();
  applyTheme();
  // 切换器
  switcher.innerHTML = '';
  s.schedules.forEach(sch => switcher.append(el('option', { value: sch.id, selected: sch.id === s.activeScheduleId }, sch.name)));
  // 导航高亮
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === s.ui.view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + s.ui.view));
  // 页脚
  const sch = activeSchedule();
  document.getElementById('foot-week').textContent = inSemester(todayStr())
    ? `${sch.name} · 第 ${currentWeek()} / ${sch.totalWeeks} 教学周`
    : `${sch.name} · 当前不在教学周`;
  // 当前视图
  const root = document.getElementById('view-' + s.ui.view);
  try { VIEWS[s.ui.view](root, nav); }
  catch (e) {
    console.error(e);
    root.innerHTML = '';
    root.append(el('div', { class: 'card empty' }, el('h3', {}, '渲染出错'), el('p', { class: 'muted small' }, e.message)));
  }
  syncPet();
}
subscribe(renderAll);
renderAll();
initShortcuts({ nav });
document.getElementById('cmd-btn').addEventListener('click', () => openPalette({ nav }));

/* ---------- 快捷键 ---------- */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) { if (redo()) toast('已重做'); } else { if (undo()) toast('已撤销'); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); if (redo()) toast('已重做'); }
});

/* ---------- 提醒（页面打开期间） ---------- */
const notified = new Set();
function notify(title, body) {
  const s = getState();
  if (s.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: 'icons/icon.svg', tag: title + body }); } catch { toast(title + '：' + body); }
  } else {
    toast(title + '：' + body);
  }
}
function checkReminders() {
  const s = getState();
  const t = todayStr();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const before = s.settings.remindBefore || 0;
  if (before > 0) {
    for (const ses of sessionsOn(t)) {
      const delta = ses.startMin - nowMin;
      const key = `class:${t}:${ses.courseId}:${ses.slotId}:${ses.start}`;
      if (delta > 0 && delta <= before && !notified.has(key)) {
        notified.add(key);
        notify('上课提醒', `${ses.name} ${ses.start} 开始${ses.location ? ' @ ' + ses.location : ''}（${delta} 分钟后）`);
      }
    }
  }
  if (s.settings.ddlRemind) {
    for (const task of s.tasks) {
      if (task.done || !task.due || task.due.slice(0, 10) !== t) continue;
      const key = `ddl:${t}:${task.id}`;
      if (!notified.has(key)) { notified.add(key); notify('今天截止', task.title); }
    }
  }
  for (const exam of s.exams) {
    const days = Math.round((dparse(exam.date) - dparse(t)) / 86400000);
    if (days === 1 || days === 3) {
      const key = `exam:${exam.id}:${days}`;
      if (!notified.has(key)) { notified.add(key); notify('考试临近', `${exam.name} 还有 ${days} 天（${exam.date} ${exam.start}）`); }
    }
  }
}
setInterval(checkReminders, 30000);
setTimeout(checkReminders, 3000);

/* ---------- 首次欢迎 ---------- */
const s0 = getState();
if (!s0.courses.length && !s0.meta.sampleLoaded && !sessionStorage.getItem('coursegap.welcomed')) {
  sessionStorage.setItem('coursegap.welcomed', '1');
  setTimeout(() => {
    modal('欢迎使用课隙 CourseGap', el('div', {},
      el('p', { class: 'mb' }, '离线优先的大学生课表与空档规划工具：课表管理、单次调课、作业 DDL、考试倒计时、课间空档分析、AI 问答。所有数据只保存在你的浏览器里。'),
      el('p', { class: 'muted small' }, '建议先加载示例数据快速体验全部功能，熟悉后在「设置 → 数据」清空并导入自己的课表（支持 JSON / CSV / ICS / WakeUp 风格文件）。')),
      {
        actions: [
          { label: '从空白开始', onClick: close => { close(); nav('timetable'); } },
          { label: '加载示例数据体验', kind: 'primary', onClick: close => { loadSample(); close(); toast('示例数据已加载（可随时清空）'); nav('today'); } },
        ],
      });
  }, 400);
}

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW 注册失败', e));
  });
}