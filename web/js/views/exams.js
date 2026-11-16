/* ============================================================
   views/exams.js — 考试安排与倒计时
   ============================================================ */
import { getState, todayStr, mdCN, weekdayCN, dparse, courseColor } from '../store.js';
import { el, fmtCountdown } from '../ui.js';
import { examModal } from '../editors.js';

export function renderExams(root, nav) {
  const s = getState();
  const t = todayStr();
  root.innerHTML = '';
  root.append(el('div', { class: 'view-head' },
    el('div', {}, el('h2', {}, '考试安排'), el('p', { class: 'sub' }, '日期、考场、座位号与倒计时；支持提前提醒（页面打开时）')),
    el('button', { class: 'btn primary', onclick: () => examModal(null, () => nav('exams')) }, '+ 新建考试')));

  const exams = [...s.exams].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  if (!exams.length) {
    root.append(el('div', { class: 'card empty' },
      el('h3', {}, '还没有考试安排'),
      el('p', { class: 'muted small' }, '登记考试后，今日页会显示倒计时，AI 助手也能回答「什么时候考高数」。')));
    return;
  }

  const upcoming = exams.filter(e => e.date >= t);
  const past = exams.filter(e => e.date < t);

  const renderGroup = (list, title) => {
    if (!list.length) return;
    root.append(el('div', { class: 'group-title' }, title));
    const grid = el('div', { class: 'grid-2' });
    list.forEach(e => {
      const course = s.courses.find(c => c.id === e.courseId);
      const dt = dparse(e.date); const [h, m] = (e.start || '09:00').split(':').map(Number); dt.setHours(h, m, 0, 0);
      const ms = dt - new Date();
      const days = Math.ceil(ms / 86400000);
      grid.append(el('div', { class: 'card exam-card', style: { '--c': courseColor(course || { color: 1 }) } },
        el('div', { class: 'row spread' },
          el('h3', {}, e.name),
          el('button', { class: 'btn sm ghost', onclick: () => examModal(e.id, () => nav('exams')) }, '编辑')),
        course ? el('p', { class: 'small muted' }, course.name) : null,
        el('p', { class: 'small' }, `${mdCN(e.date)}（${weekdayCN(e.date)}）${e.start}–${e.end}`),
        el('p', { class: 'small muted' }, [e.location && '考场：' + e.location, e.seat && '座位：' + e.seat].filter(Boolean).join(' · ') || '地点未设置'),
        e.notes ? el('p', { class: 'small muted' }, e.notes) : null,
        el('div', { class: 'mt' },
          e.date >= t
            ? el('span', { class: 'exam-cd' }, days <= 0 ? '今天' : `${days} 天`)
            : null,
          el('span', { class: 'chip ' + (e.date < t ? '' : days <= 3 ? 'danger' : days <= 7 ? 'warn' : 'accent'), style: { marginLeft: '8px' } },
            e.date < t ? '已结束' : fmtCountdown(ms))),
      ));
    });
    root.append(grid);
  };
  renderGroup(upcoming, `即将到来（${upcoming.length}）`);
  renderGroup(past, `已结束（${past.length}）`);
}