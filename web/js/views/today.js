/* ============================================================
   views/today.js — 今日总览：当前/下一节课、今日课程时间线、
   DDL、考试倒计时、空档速览、学习概览
   ============================================================ */
import { getState, activeSchedule, todayStr, dadd, mdCN, weekdayCN, dparse, courseColor } from '../store.js';
import { nowStatus, gapsOn, currentWeek, weekStats, inSemester } from '../schedule.js';
import { el, ico, fmtCountdown } from '../ui.js';
import { sessionModal } from '../editors.js';

export function renderToday(root, nav) {
  const s = getState();
  const t = todayStr();
  const st = nowStatus(t);
  const sch = activeSchedule();
  root.innerHTML = '';

  // 顶部状态卡
  let heroTitle, heroSub, cdText = '';
  if (!inSemester(t)) {
    heroTitle = '当前不在教学周内';
    heroSub = `学期：${sch.semesterStart} 起，共 ${sch.totalWeeks} 周。可在设置中调整开学日期。`;
  } else if (st.current) {
    heroTitle = `正在上：${st.current.name}`;
    heroSub = `${st.current.start}–${st.current.end}${st.current.location ? ' · ' + st.current.location : ''}`;
    const end = dparse(t); const [h, m] = st.current.end.split(':').map(Number); end.setHours(h, m, 0, 0);
    cdText = fmtCountdown(end - new Date());
  } else if (st.next) {
    heroTitle = `下一节：${st.next.name}`;
    heroSub = `${st.next.start} 开始${st.next.location ? ' · ' + st.next.location : ''}`;
    const start = dparse(t); const [h, m] = st.next.start.split(':').map(Number); start.setHours(h, m, 0, 0);
    cdText = fmtCountdown(start - new Date());
  } else {
    heroTitle = st.list.length ? '今天的课已全部结束' : '今天没有课';
    heroSub = st.list.length ? '好好休息，或处理下面的待办。' : '看看空档页，规划一下自由时间。';
  }
  root.append(el('div', { class: 'hero-now' },
    el('div', {}, el('div', { class: 't' }, `${mdCN(t)} ${weekdayCN(t)} · 第 ${currentWeek()} 教学周`),
      el('div', { class: 'v' }, heroTitle), el('div', { class: 't' }, heroSub)),
    cdText ? el('div', { class: 'cd' }, el('div', { class: 't' }, st.current ? '距下课' : '距上课'), el('b', {}, cdText)) : null,
  ));

  const grid = el('div', { class: 'grid-2' });

  // 今日课程时间线
  const timeline = el('div', { class: 'card' }, el('h3', {}, '今日课程'));
  if (!st.list.length) {
    timeline.append(el('p', { class: 'muted small' }, '今天没有课程安排。'));
  } else {
    st.list.forEach(ses => {
      const past = ses.endMin <= st.nowMin;
      const now = st.current === ses;
      timeline.append(el('div', {
        class: 'session-item' + (now ? ' now' : past ? ' past' : ''),
        style: { cursor: 'pointer' },
        onclick: () => sessionModal(ses, () => nav('today')),
      },
        el('div', { class: 'session-time' }, `${ses.start}\n${ses.end}`),
        el('div', { class: 'session-bar', style: { '--c': courseColor({ color: ses.color }) } }),
        el('div', { class: 'session-body' },
          el('div', { class: 'name' }, ses.name, ses.moved ? el('span', { class: 'chip warn', style: { marginLeft: '6px' } }, '调课') : null),
          el('div', { class: 'meta' }, [ses.location, ses.teacher].filter(Boolean).join(' · ') || '地点未设置'),
        ),
        now ? el('span', { class: 'chip accent' }, '进行中') : null,
      ));
    });
  }
  grid.append(timeline);

  // 右列：DDL + 考试
  const right = el('div', {});
  const openTasks = s.tasks.filter(x => !x.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const dueSoon = openTasks.filter(x => x.due && x.due <= dadd(t, 2) + 'T23:59');
  const taskCard = el('div', { class: 'card' },
    el('div', { class: 'row spread' }, el('h3', {}, '截止临近'), el('button', { class: 'btn sm ghost', onclick: () => nav('tasks') }, '全部任务 →')));
  if (!dueSoon.length) taskCard.append(el('p', { class: 'muted small' }, '两天内没有截止的任务。'));
  dueSoon.slice(0, 5).forEach(x => {
    const overdue = x.due < t + 'T00:00';
    const today = x.due.slice(0, 10) === t;
    taskCard.append(el('div', { class: 'session-item' },
      el('div', { class: 'session-body' },
        el('div', { class: 'name' }, x.title),
        el('div', { class: 'meta' }, (s.courses.find(c => c.id === x.courseId) || {}).name || '个人任务')),
      el('span', { class: 'chip ' + (overdue ? 'danger' : today ? 'warn' : '') }, overdue ? '已逾期' : today ? '今天截止' : '明天截止'),
    ));
  });
  right.append(taskCard);

  const exams = s.exams.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const examCard = el('div', { class: 'card' },
    el('div', { class: 'row spread' }, el('h3', {}, '考试倒计时'), el('button', { class: 'btn sm ghost', onclick: () => nav('exams') }, '全部考试 →')));
  if (!exams.length) examCard.append(el('p', { class: 'muted small' }, '暂无登记的考试。'));
  exams.slice(0, 3).forEach(e => {
    const dt = dparse(e.date); const [h, m] = (e.start || '09:00').split(':').map(Number); dt.setHours(h, m, 0, 0);
    examCard.append(el('div', { class: 'session-item' },
      el('div', { class: 'session-body' },
        el('div', { class: 'name' }, e.name),
        el('div', { class: 'meta' }, `${mdCN(e.date)} ${e.start}${e.location ? ' · ' + e.location : ''}`)),
      el('span', { class: 'chip accent' }, fmtCountdown(dt - new Date())),
    ));
  });
  right.append(examCard);
  grid.append(right);
  root.append(grid);

  // 空档速览 + 周统计
  const gaps = gapsOn(t).filter(g => g.usable >= 25);
  const ws = weekStats(currentWeek());
  const bottom = el('div', { class: 'grid-2 mt' },
    el('div', { class: 'card' },
      el('div', { class: 'row spread' }, el('h3', {}, '今日可用空档'), el('button', { class: 'btn sm ghost', onclick: () => nav('gaps') }, '空档规划 →')),
      gaps.length
        ? el('div', {}, gaps.slice(0, 4).map(g => el('p', { class: 'small', style: { margin: '4px 0' } },
            el('b', {}, `${g.from}–${g.to}`), ` 可用 ${g.usable} 分钟 · ${g.suggestions[0] || ''}`)))
        : el('p', { class: 'muted small' }, '今天没有 ≥25 分钟的可用空档。')),
    el('div', { class: 'card' },
      el('h3', {}, `本周概览（第 ${currentWeek()} 周）`),
      el('div', { class: 'row', style: { gap: '24px', marginTop: '8px' } },
        el('div', {}, el('div', { class: 'stat-num' }, String(ws.count)), el('div', { class: 'stat-label' }, '节课')),
        el('div', {}, el('div', { class: 'stat-num' }, String(Math.round(ws.minutes / 60 * 10) / 10)), el('div', { class: 'stat-label' }, '课时（小时）')),
        el('div', {}, el('div', { class: 'stat-num' }, String(openTasks.length)), el('div', { class: 'stat-label' }, '未完成任务')),
        el('div', {}, el('div', { class: 'stat-num' }, String(exams.length)), el('div', { class: 'stat-label' }, '未来考试')),
      )),
  );
  root.append(bottom);

  if (s.meta.sampleLoaded) {
    root.append(el('p', { class: 'small muted mt no-print' }, '提示：当前包含示例数据，仅用于演示。可在「设置 → 数据」中清空后导入自己的课表。'));
  }
}