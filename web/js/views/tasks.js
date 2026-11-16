/* ============================================================
   views/tasks.js — 作业 / DDL / 个人任务：
   逾期·今天·明天·近期分组、优先级、子任务、完成勾选
   ============================================================ */
import { getState, mutate, todayStr, dadd, mdCN } from '../store.js';
import { el, toast } from '../ui.js';
import { taskModal } from '../editors.js';

export function renderTasks(root, nav) {
  const s = getState();
  const t = todayStr();
  root.innerHTML = '';

  const filter = s.ui.taskFilter || 'open';
  const seg = el('div', { class: 'seg' },
    ...[['open', '未完成'], ['done', '已完成'], ['all', '全部']].map(([v, l]) =>
      el('button', { class: filter === v ? 'active' : '', onclick: () => mutate(st => { st.ui.taskFilter = v; }, { undoable: false }) }, l)));

  root.append(el('div', { class: 'view-head' },
    el('div', {}, el('h2', {}, '任务与 DDL'), el('p', { class: 'sub' }, '作业、项目、个人待办，按截止时间自动分组')),
    el('div', { class: 'row' }, seg, el('button', { class: 'btn primary', onclick: () => taskModal(null, () => nav('tasks')) }, '+ 新建任务'))));

  let tasks = [...s.tasks];
  if (filter === 'open') tasks = tasks.filter(x => !x.done);
  if (filter === 'done') tasks = tasks.filter(x => x.done);
  tasks.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));

  if (!tasks.length) {
    root.append(el('div', { class: 'card empty' },
      el('h3', {}, filter === 'done' ? '还没有已完成的任务' : '没有待办任务'),
      el('p', { class: 'muted small' }, '把作业和 DDL 记进来，今日页与 AI 助手会自动汇总提醒。')));
    return;
  }

  const groups = [
    { key: 'overdue', title: '已逾期', cls: 'danger', test: x => !x.done && x.due && x.due < t + 'T00:00' },
    { key: 'today', title: '今天截止', cls: 'warn', test: x => !x.done && x.due && x.due.slice(0, 10) === t },
    { key: 'tomorrow', title: '明天截止', cls: 'warn', test: x => !x.done && x.due && x.due.slice(0, 10) === dadd(t, 1) },
    { key: 'week', title: '未来 7 天', cls: '', test: x => !x.done && x.due && x.due.slice(0, 10) > dadd(t, 1) && x.due.slice(0, 10) <= dadd(t, 7) },
    { key: 'later', title: '更晚 / 无截止', cls: '', test: x => !x.done && (!x.due || x.due.slice(0, 10) > dadd(t, 7)) },
    { key: 'done', title: '已完成', cls: '', test: x => x.done },
  ];

  for (const g of groups) {
    const items = tasks.filter(g.test);
    if (!items.length) continue;
    root.append(el('div', { class: 'group-title ' + g.cls }, `${g.title}（${items.length}）`));
    const card = el('div', { class: 'card' });
    items.forEach(x => {
      const course = s.courses.find(c => c.id === x.courseId);
      const check = el('input', { type: 'checkbox', class: 'task-check', checked: x.done, 'aria-label': '标记完成' });
      check.addEventListener('change', () => {
        mutate(st => {
          const tt = st.tasks.find(y => y.id === x.id);
          tt.done = check.checked;
          tt.doneAt = check.checked ? new Date().toISOString() : null;
        });
        toast(check.checked ? '已完成，干得漂亮' : '已重新打开');
      });
      const prioChip = el('span', { class: 'chip ' + (x.priority === 'high' ? 'danger' : x.priority === 'mid' ? 'warn' : '') },
        x.priority === 'high' ? '高优先' : x.priority === 'mid' ? '中优先' : '低优先');
      const subDone = x.subtasks.filter(st => st.done).length;
      const item = el('div', { class: 'task-item' + (x.done ? ' done' : '') },
        check,
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { class: 'task-title' }, x.title),
          el('div', { class: 'task-meta' },
            course ? el('span', {}, course.name) : null,
            x.due ? el('span', {}, `截止 ${mdCN(x.due.slice(0, 10))} ${x.due.slice(11, 16)}`) : el('span', {}, '无截止时间'),
            x.subtasks.length ? el('span', {}, `子任务 ${subDone}/${x.subtasks.length}`) : null,
            prioChip),
        ),
        el('button', { class: 'btn sm ghost', onclick: () => taskModal(x.id, () => nav('tasks')) }, '编辑'),
      );
      card.append(item);
      x.subtasks.forEach(st => {
        const cb = el('input', { type: 'checkbox', checked: st.done, style: { accentColor: 'var(--site-accent)' }, 'aria-label': st.title });
        cb.addEventListener('change', () => mutate(ss => {
          const tt = ss.tasks.find(y => y.id === x.id);
          const sub = tt.subtasks.find(z => z.id === st.id);
          sub.done = cb.checked;
        }, { undoable: false }));
        card.append(el('div', { class: 'subtask' }, cb, el('span', { class: st.done ? 'muted' : '', style: st.done ? { textDecoration: 'line-through' } : {} }, st.title)));
      });
    });
    root.append(card);
  }
}