/* ============================================================
   views/timetable.js — 课表：周网格 / 周列表 / 日视图，
   拖动调课、冲突标红、导入导出、撤销重做
   ============================================================ */
import {
  getState, mutate, activeSchedule, activePeriodSet, scheduleCourses, courseColor,
  todayStr, dparse, mdCN, weekdayCN, undo, redo, canUndo, canRedo, loadSample,
} from '../store.js';
import { weekDates, currentWeek, sessionsOn, conflictsOn, moveSession, inSemester, weekOf } from '../schedule.js';
import { el, ico, toast, modal, confirmModal, readFile } from '../ui.js';
import { courseModal, sessionModal } from '../editors.js';
import { parseImport, previewImport, exportICS, exportPNG, exportCoursesJSON } from '../importexport.js';

export function renderTimetable(root, nav) {
  const s = getState();
  const sch = activeSchedule();
  const ps = activePeriodSet();
  const ui = s.ui;
  const week = Math.max(1, Math.min(sch.totalWeeks, currentWeek() + (ui.ttWeekOffset || 0)));
  const dates = weekDates(week, sch);
  const t = todayStr();
  root.innerHTML = '';

  /* ---------- 工具栏 ---------- */
  const weekLabel = el('span', { class: 'wk' }, `第 ${week} 周`, el('span', { class: 'muted small', style: { display: 'block', fontWeight: 400 } }, `${dates[0].slice(5)} ~ ${dates[6].slice(5)}`));
  const modeSeg = el('div', { class: 'seg' },
    ...[['grid', '周网格'], ['list', '周列表'], ['day', '日视图']].map(([v, l]) =>
      el('button', { class: ui.ttMode === v ? 'active' : '', onclick: () => { mutate(st => { st.ui.ttMode = v; }, { undoable: false }); } }, l)));

  const fileInput = el('input', { type: 'file', accept: '.json,.csv,.ics,.txt', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const text = await readFile(f);
      const parsed = parseImport(text, f.name);
      previewImport(parsed, { onApplied: () => nav('timetable') });
    } catch (e) { toast('导入失败：' + e.message, 'err'); }
  });

  const exportMenu = () => {
    modal('导出课表', el('div', {},
      el('p', { class: 'muted small mb' }, 'ICS 是静态快照：导入系统日历后，调课需重新导出。PNG 适合分享。'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onclick: () => { exportICS(); } }, 'ICS 日历文件'),
        el('button', { class: 'btn', onclick: () => { exportPNG(week); } }, `PNG 图片（第 ${week} 周）`),
        el('button', { class: 'btn', onclick: () => { exportCoursesJSON(); } }, '课程 JSON'),
        el('button', { class: 'btn', onclick: () => { window.print(); } }, '打印课表'),
      )), { actions: [{ label: '关闭' }] });
  };

  const toolbar = el('div', { class: 'tt-toolbar no-print' },
    el('div', { class: 'weeknav' },
      el('button', { class: 'icon-btn', title: '上一周', html: ico('left'), onclick: () => mutate(st => { st.ui.ttWeekOffset = (st.ui.ttWeekOffset || 0) - 1; }, { undoable: false }) }),
      weekLabel,
      el('button', { class: 'icon-btn', title: '下一周', html: ico('right'), onclick: () => mutate(st => { st.ui.ttWeekOffset = (st.ui.ttWeekOffset || 0) + 1; }, { undoable: false }) }),
      el('button', { class: 'btn sm', onclick: () => mutate(st => { st.ui.ttWeekOffset = 0; }, { undoable: false }) }, '回本周'),
    ),
    modeSeg,
    el('span', { style: { flex: 1 } }),
    el('button', { class: 'icon-btn', title: '撤销', html: ico('undo'), disabled: !canUndo(), onclick: () => { if (undo()) toast('已撤销'); } }),
    el('button', { class: 'icon-btn', title: '重做', html: ico('redo'), disabled: !canRedo(), onclick: () => { if (redo()) toast('已重做'); } }),
    el('button', { class: 'btn sm', html: ico('upload') + ' 导入', onclick: () => fileInput.click() }),
    el('button', { class: 'btn sm', html: ico('download') + ' 导出', onclick: exportMenu }),
    el('button', { class: 'btn primary sm', html: ico('plus') + ' 新建课程', onclick: () => courseModal(null, () => nav('timetable')) }),
    fileInput,
  );
  root.append(toolbar);

  if (!inSemester(dates[0]) && !inSemester(dates[6])) {
    root.append(el('p', { class: 'small mb', style: { color: 'var(--warn)' } }, `第 ${week} 周不在学期范围（${sch.semesterStart} 起 ${sch.totalWeeks} 周）内，可能显示为空。可在设置中调整学期。`));
  }

  const courses = scheduleCourses();
  if (!courses.length) {
    root.append(el('div', { class: 'card empty' },
      el('div', { class: 'big', html: ico('grid') }),
      el('h3', {}, '课表还是空的'),
      el('p', { class: 'muted small mb' }, '三种方式开始：手动新建、导入文件（JSON / CSV / ICS / WakeUp 风格），或先加载示例数据体验。'),
      el('div', { class: 'row', style: { justifyContent: 'center' } },
        el('button', { class: 'btn primary', onclick: () => courseModal(null, () => nav('timetable')) }, '新建课程'),
        el('button', { class: 'btn', onclick: () => fileInput.click() }, '导入文件'),
        el('button', { class: 'btn', onclick: () => confirmModal('加载示例数据', '将向当前课表写入一套演示课程、任务与考试（明确标注为示例，可随时清空）。', () => { loadSample(); toast('示例数据已加载'); }) }, '加载示例数据'),
      )));
    return;
  }

  if (ui.ttMode === 'grid') renderGrid(root, week, dates, ps, nav);
  else if (ui.ttMode === 'list') renderList(root, week, dates, nav);
  else renderDay(root, nav);

  // 冲突汇总
  const allConflicts = [];
  dates.forEach(d => conflictsOn(d).forEach(([a, b]) => allConflicts.push(`${mdCN(d)}：${a.name} 与 ${b.name}`)));
  if (allConflicts.length) {
    root.append(el('div', { class: 'card mt no-print', style: { borderColor: 'var(--danger)' } },
      el('h3', { style: { color: 'var(--danger)' } }, `本周 ${allConflicts.length} 处时间冲突`),
      ...allConflicts.slice(0, 6).map(x => el('p', { class: 'small muted' }, '· ' + x)),
      el('p', { class: 'small muted' }, '点击课程块可进行单次调课或停课。')));
  }
}

/* ---------- 周网格 ---------- */
function renderGrid(root, week, dates, ps, nav) {
  const t = todayStr();
  const periods = ps.periods;
  const wrap = el('div', { class: 'tt-wrap' });
  const grid = el('div', {
    class: 'tt-grid',
    style: {
      gridTemplateColumns: `64px repeat(7, minmax(96px, 1fr))`,
      gridTemplateRows: `48px repeat(${periods.length}, minmax(52px, auto))`,
    },
  });
  grid.append(el('div', { class: 'tt-corner', style: { gridRow: 1, gridColumn: 1 } }));
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  dates.forEach((d, i) => {
    grid.append(el('div', {
      class: 'tt-dayhead' + (d === t ? ' today' : ''),
      style: { gridRow: 1, gridColumn: i + 2 },
    }, dayNames[i], el('span', { class: 'd' }, d.slice(5).replace('-', '/'))));
  });
  periods.forEach((p, r) => {
    grid.append(el('div', { class: 'tt-period', style: { gridRow: r + 2, gridColumn: 1 } },
      el('b', {}, String(p.p)), el('span', {}, p.start), el('span', {}, p.end)));
  });

  // 收集每天课次，计算同一单元格内的并排布局
  const byDate = dates.map(d => sessionsOn(d));
  const conflictSets = dates.map(d => {
    const set = new Set();
    conflictsOn(d).forEach(([a, b]) => { set.add(a.courseId + ':' + a.slotId); set.add(b.courseId + ':' + b.slotId); });
    return set;
  });

  dates.forEach((d, ci) => {
    // 背景单元格（拖放目标）
    periods.forEach((p, r) => {
      const cell = el('div', {
        class: 'tt-cell' + (d === t ? ' today-col' : ''),
        style: { gridRow: r + 2, gridColumn: ci + 2 },
        dataset: { date: d, period: p.p },
      });
      cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drop-hint'); });
      cell.addEventListener('dragleave', () => cell.classList.remove('drop-hint'));
      cell.addEventListener('drop', e => {
        e.preventDefault(); cell.classList.remove('drop-hint');
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          const toStart = p.p, toEnd = p.p + data.duration - 1;
          if (toEnd > periods[periods.length - 1].p) { toast('超出作息节次范围', 'err'); return; }
          if (data.fromDate === d && data.start === toStart) return;
          mutate(() => moveSession(data.courseId, data.slotId, data.fromDate, { toDate: d, toStart, toEnd }));
          toast('已单次调课（仅这一次；可用撤销恢复）');
        } catch { /* 忽略非法拖放 */ }
      });
      grid.append(cell);
    });

    // 课程块：按 (起始节) 分组处理重叠
    const list = byDate[ci];
    const groups = {};
    list.forEach(ses => { (groups[ses.periodStart] = groups[ses.periodStart] || []).push(ses); });
    // 跨节重叠也要并排：用扫描线给每个课次分配横向槽位
    const slots = [];
    list.forEach(ses => {
      let lane = 0;
      while (slots.some(x => x.lane === lane && x.start < ses.periodEnd && ses.periodStart < x.end)) lane++;
      slots.push({ lane, start: ses.periodStart, end: ses.periodEnd, ses });
    });
    const maxLane = {};
    list.forEach(ses => {
      const overlapping = slots.filter(x => x.start < ses.periodEnd && ses.periodStart < x.end);
      const lanes = Math.max(...overlapping.map(x => x.lane)) + 1;
      maxLane[ses.courseId + ses.slotId] = Math.max(maxLane[ses.courseId + ses.slotId] || 1, lanes);
    });

    slots.forEach(({ lane, ses }) => {
      const r0 = periods.findIndex(p => p.p === ses.periodStart);
      const r1 = periods.findIndex(p => p.p === ses.periodEnd);
      if (r0 < 0 || r1 < 0) return;
      const lanes = maxLane[ses.courseId + ses.slotId] || 1;
      const widthPct = 100 / lanes;
      const holder = el('div', {
        style: {
          gridRow: `${r0 + 2} / span ${r1 - r0 + 1}`, gridColumn: ci + 2,
          position: 'relative', zIndex: 2, pointerEvents: 'none',
        },
      });
      const isConflict = conflictSets[ci].has(ses.courseId + ':' + ses.slotId);
      const block = el('div', {
        class: 'tt-course' + (isConflict ? ' conflict' : ''),
        draggable: true,
        title: `${ses.name}\n${ses.start}–${ses.end}${ses.location ? '\n' + ses.location : ''}\n点击操作 / 拖动调课`,
        style: {
          '--c': courseColor({ color: ses.color }),
          position: 'absolute', top: '2px', bottom: '2px',
          left: `calc(${lane * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
          pointerEvents: 'auto',
        },
        onclick: () => sessionModal(ses, () => nav('timetable')),
      },
        el('span', { class: 'n' }, ses.name),
        ses.location ? el('span', { class: 'l' }, '@' + ses.location) : null,
        ses.moved ? el('span', { class: 'badge-ov' }, '调') : null,
      );
      block.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify({
          courseId: ses.courseId, slotId: ses.slotId, fromDate: ses.moved ? ses.fromDate : ses.date,
          duration: ses.periodEnd - ses.periodStart + 1, start: ses.periodStart,
        }));
        e.dataTransfer.effectAllowed = 'move';
        block.classList.add('ghost');
      });
      block.addEventListener('dragend', () => block.classList.remove('ghost'));
      holder.append(block);
      grid.append(holder);
    });
  });

  wrap.append(grid);
  root.append(wrap);
  root.append(el('p', { class: 'small muted mt no-print' }, '提示：点击课程块可单次调课/停课；直接拖动课程块到目标格子也可快速调课。红框 = 时间冲突。'));
}

/* ---------- 周列表 ---------- */
function renderList(root, week, dates, nav) {
  const t = todayStr();
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  let any = false;
  dates.forEach((d, i) => {
    const list = sessionsOn(d);
    if (!list.length) return;
    any = true;
    const card = el('div', { class: 'card tt-list-day' },
      el('h4', { class: d === t ? 'today' : '' }, `${dayNames[i]} · ${mdCN(d)}${d === t ? '（今天）' : ''}`));
    list.forEach(ses => {
      card.append(el('div', { class: 'session-item', style: { cursor: 'pointer' }, onclick: () => sessionModal(ses, () => nav('timetable')) },
        el('div', { class: 'session-time' }, `${ses.start}\n${ses.end}`),
        el('div', { class: 'session-bar', style: { '--c': courseColor({ color: ses.color }) } }),
        el('div', { class: 'session-body' },
          el('div', { class: 'name' }, ses.name, ses.moved ? el('span', { class: 'chip warn', style: { marginLeft: '6px' } }, '调课') : null),
          el('div', { class: 'meta' }, [ses.location, ses.teacher].filter(Boolean).join(' · '))),
      ));
    });
    root.append(card);
  });
  if (!any) root.append(el('div', { class: 'card empty' }, el('p', { class: 'muted' }, '本周没有课程。')));
}

/* ---------- 日视图 ---------- */
function renderDay(root, nav) {
  const s = getState();
  const dateI = el('input', { class: 'input', type: 'date', value: s.ui.dayDate || todayStr(), style: { width: 'auto' } });
  dateI.addEventListener('change', () => mutate(st => { st.ui.dayDate = dateI.value; }, { undoable: false }));
  const d = s.ui.dayDate || todayStr();
  const list = sessionsOn(d);
  root.append(el('div', { class: 'row mb no-print' }, el('span', { class: 'muted small' }, '选择日期：'), dateI,
    el('span', { class: 'chip' }, `${weekdayCN(d)} · 第 ${weekOf(d)} 教学周`)));
  const card = el('div', { class: 'card' });
  if (!list.length) card.append(el('p', { class: 'muted' }, `${mdCN(d)} 没有课程。`));
  list.forEach(ses => {
    card.append(el('div', { class: 'session-item', style: { cursor: 'pointer' }, onclick: () => sessionModal(ses, () => nav('timetable')) },
      el('div', { class: 'session-time' }, `${ses.start}\n${ses.end}`),
      el('div', { class: 'session-bar', style: { '--c': courseColor({ color: ses.color }) } }),
      el('div', { class: 'session-body' },
        el('div', { class: 'name' }, ses.name, ses.moved ? el('span', { class: 'chip warn', style: { marginLeft: '6px' } }, '调课') : null),
        el('div', { class: 'meta' }, [ses.location, ses.teacher].filter(Boolean).join(' · '))),
    ));
  });
  root.append(card);
}