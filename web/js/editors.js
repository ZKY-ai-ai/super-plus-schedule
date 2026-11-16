/* ============================================================
   editors.js — 课程、任务、考试、单次调课 编辑弹窗
   ============================================================ */
import {
  getState, mutate, activeSchedule, activePeriodSet, scheduleCourses, courseById,
  uid, todayStr, COURSE_COLORS, courseColor,
} from './store.js';
import { wouldConflict, cancelSession, moveSession, restoreSession } from './schedule.js';
import { el, modal, toast, confirmModal, ico } from './ui.js';

const DAY_OPTIONS = [[1, '周一'], [2, '周二'], [3, '周三'], [4, '周四'], [5, '周五'], [6, '周六'], [7, '周日']];

function periodOptions(ps, selected) {
  return ps.periods.map(p => el('option', { value: p.p, selected: p.p === selected }, `${p.p}（${p.start}）`));
}

/* ---------- 周次编辑控件 ---------- */
function weeksEditor(slot) {
  const w = slot.weeks || { type: 'range', from: 1, to: 16, parity: 'all' };
  const typeSel = el('select', { class: 'input', style: { width: 'auto' } },
    el('option', { value: 'range', selected: w.type !== 'list' }, '起止周'),
    el('option', { value: 'list', selected: w.type === 'list' }, '逐周勾选'));
  const from = el('input', { class: 'input', type: 'number', min: 1, max: 40, value: w.from ?? 1, style: { width: '64px' }, 'aria-label': '起始周' });
  const to = el('input', { class: 'input', type: 'number', min: 1, max: 40, value: w.to ?? 16, style: { width: '64px' }, 'aria-label': '结束周' });
  const parity = el('select', { class: 'input', style: { width: 'auto' } },
    el('option', { value: 'all', selected: (w.parity || 'all') === 'all' }, '每周'),
    el('option', { value: 'odd', selected: w.parity === 'odd' }, '单周'),
    el('option', { value: 'even', selected: w.parity === 'even' }, '双周'));
  const listInput = el('input', { class: 'input', value: (w.weeks || []).join(','), placeholder: '如 1,3,5,7', style: { width: '140px', display: w.type === 'list' ? '' : 'none' }, 'aria-label': '周次列表' });
  const rangeWrap = el('span', { class: 'row', style: { display: w.type === 'list' ? 'none' : 'flex' } }, from, el('span', { class: 'muted small' }, '—'), to, parity);
  typeSel.addEventListener('change', () => {
    const isList = typeSel.value === 'list';
    listInput.style.display = isList ? '' : 'none';
    rangeWrap.style.display = isList ? 'none' : 'flex';
  });
  const node = el('span', { class: 'row' }, typeSel, rangeWrap, listInput);
  node.readWeeks = () => {
    if (typeSel.value === 'list') {
      const weeks = listInput.value.split(/[,，]/).map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 40);
      return { type: 'list', weeks: [...new Set(weeks)].sort((a, b) => a - b) };
    }
    return { type: 'range', from: Math.max(1, +from.value || 1), to: Math.max(+from.value || 1, +to.value || 16), parity: parity.value };
  };
  return node;
}

/* ---------- 课程编辑 ---------- */
export function courseModal(courseId, onSaved) {
  const s = getState();
  const ps = activePeriodSet();
  const existing = courseId ? courseById(courseId) : null;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: uid(), scheduleId: activeSchedule().id, name: '', alias: '', teacher: '', location: '',
    color: COURSE_COLORS[scheduleCourses().length % COURSE_COLORS.length], notes: '', slots: [],
  };
  if (!draft.slots.length) draft.slots.push({ id: uid(), day: 1, start: 1, end: 2, weeks: { type: 'range', from: 1, to: 16, parity: 'all' } });

  const nameI = el('input', { class: 'input', value: draft.name, placeholder: '如：高等数学 A(上)', required: true });
  const aliasI = el('input', { class: 'input', value: draft.alias || '', placeholder: '课表上显示的短名（可选）' });
  const teacherI = el('input', { class: 'input', value: draft.teacher, placeholder: '教师姓名' });
  const locationI = el('input', { class: 'input', value: draft.location, placeholder: '如：教一-201' });
  const notesI = el('textarea', { class: 'input', rows: 2, placeholder: '备注（可选）' }, draft.notes);

  let selColor = draft.color;
  const colorRow = el('div', { class: 'row' }, COURSE_COLORS.map(n =>
    el('button', {
      class: 'color-dot' + (n === selColor ? ' sel' : ''), type: 'button',
      style: { background: `var(--course-${n})` }, 'aria-label': '颜色 ' + n,
      onclick: e => { selColor = n; colorRow.querySelectorAll('.color-dot').forEach((b, i) => b.classList.toggle('sel', COURSE_COLORS[i] === n)); },
    })));

  const slotsWrap = el('div', {});
  function renderSlots() {
    slotsWrap.innerHTML = '';
    draft.slots.forEach((slot, idx) => {
      const daySel = el('select', { class: 'input', style: { width: 'auto' } },
        DAY_OPTIONS.map(([v, l]) => el('option', { value: v, selected: v === slot.day }, l)));
      const startSel = el('select', { class: 'input', style: { width: 'auto' }, 'aria-label': '开始节次' }, periodOptions(ps, slot.start));
      const endSel = el('select', { class: 'input', style: { width: 'auto' }, 'aria-label': '结束节次' }, periodOptions(ps, slot.end));
      const locI = el('input', { class: 'input', value: slot.location || '', placeholder: '本节地点（默认用课程地点）', style: { flex: '1', minWidth: '140px' } });
      const weeksCtl = weeksEditor(slot);
      const row = el('div', { class: 'card', style: { padding: '10px', marginBottom: '8px' } },
        el('div', { class: 'row spread mb' },
          el('div', { class: 'row' }, daySel, startSel, el('span', { class: 'muted small' }, '至'), endSel),
          el('button', {
            class: 'btn sm ghost', type: 'button', title: '删除此时段',
            onclick: () => { draft.slots.splice(idx, 1); renderSlots(); },
          }, '删除时段')),
        el('div', { class: 'row mb' }, weeksCtl),
        locI);
      row.readSlot = () => ({
        ...slot, day: +daySel.value, start: +startSel.value, end: Math.max(+startSel.value, +endSel.value),
        weeks: weeksCtl.readWeeks(), location: locI.value.trim() || undefined,
      });
      slotsWrap.append(row);
    });
  }
  renderSlots();

  const body = el('div', {},
    el('div', { class: 'form-grid' },
      el('label', { class: 'field' }, el('span', {}, '课程名称 *'), nameI),
      el('label', { class: 'field' }, el('span', {}, '显示别名'), aliasI),
      el('label', { class: 'field' }, el('span', {}, '教师'), teacherI),
      el('label', { class: 'field' }, el('span', {}, '默认地点'), locationI),
      el('label', { class: 'field full' }, el('span', {}, '课程颜色'), colorRow),
      el('label', { class: 'field full' }, el('span', {}, '备注'), notesI),
    ),
    el('h3', { class: 'mt' }, '上课时段'),
    el('p', { class: 'small muted mb' }, '同一课程可配置多个时段；支持起止周、单双周与逐周勾选。'),
    slotsWrap,
    el('button', {
      class: 'btn sm', type: 'button',
      onclick: () => { draft.slots.push({ id: uid(), day: 1, start: 1, end: 2, weeks: { type: 'range', from: 1, to: 16, parity: 'all' } }); renderSlots(); },
    }, '+ 添加时段'),
  );

  modal(existing ? '编辑课程' : '新建课程', body, {
    wide: true,
    actions: [
      ...(existing ? [{
        label: '删除课程', kind: 'danger', onClick: close => {
          confirmModal('删除课程', `确定删除「${existing.name}」及其全部时段与调课记录？`, () => {
            mutate(st => {
              st.courses = st.courses.filter(c => c.id !== existing.id);
              st.overrides = st.overrides.filter(o => o.courseId !== existing.id);
            });
            close(); toast('课程已删除（可撤销）'); onSaved && onSaved();
          }, { danger: true, yesLabel: '删除' });
        },
      }] : []),
      { label: '取消' },
      {
        label: '保存', kind: 'primary', onClick: close => {
          const name = nameI.value.trim();
          if (!name) { toast('请填写课程名称', 'err'); return; }
          const slots = [...slotsWrap.children].map(r => r.readSlot()).filter(x => x.weeks.type !== 'list' || x.weeks.weeks.length);
          if (!slots.length) { toast('至少保留一个上课时段', 'err'); return; }
          // 冲突检测（提示但允许保留，课表中会标红）
          const conflicts = [];
          for (const slot of slots) {
            const hits = wouldConflict(draft.id, slot.id, slot.day, slot.start, slot.end, slot.weeks, slot.id);
            if (hits.length) conflicts.push(`周${'一二三四五六日'[slot.day - 1]} ${slot.start}-${slot.end}节 与「${hits[0].other.name}」等 ${hits.length} 个课次重叠`);
          }
          const doSave = () => {
            mutate(st => {
              const data = {
                ...draft, name, alias: aliasI.value.trim(), teacher: teacherI.value.trim(),
                location: locationI.value.trim(), notes: notesI.value.trim(), color: selColor, slots,
              };
              const i = st.courses.findIndex(c => c.id === draft.id);
              if (i >= 0) st.courses[i] = data; else st.courses.push(data);
            });
            close(); toast(conflicts.length ? '已保存（存在时间冲突，课表中已标红）' : '课程已保存'); onSaved && onSaved();
          };
          if (conflicts.length) {
            confirmModal('检测到时间冲突', conflicts.slice(0, 5).join('\n') + '\n仍要保存吗？冲突课程会在课表中标红提示。', doSave, { yesLabel: '仍然保存' });
          } else doSave();
        },
      },
    ],
  });
}

/* ---------- 单次课次操作（调课/停课/恢复） ---------- */
export function sessionModal(session, onChanged) {
  const s = getState();
  const ps = activePeriodSet();
  const course = courseById(session.courseId);
  const ov = s.overrides.find(o => o.courseId === session.courseId && o.slotId === session.slotId && (o.date === session.date || o.toDate === session.date));
  const info = el('div', { class: 'card mb' },
    el('h3', {}, session.name),
    el('p', { class: 'muted small' }, `${session.date} ${session.start}–${session.end}${session.location ? ' · ' + session.location : ''}${session.teacher ? ' · ' + session.teacher : ''}`),
    session.moved ? el('p', { class: 'small', style: { color: 'var(--warn)' } }, `调课课次（原上课日 ${session.fromDate}）`) : null,
    ov && ov.type === 'cancel' ? el('p', { class: 'small', style: { color: 'var(--warn)' } }, '该课次已被单次停课') : null,
  );

  const toDateI = el('input', { class: 'input', type: 'date', value: session.date });
  const toStartSel = el('select', { class: 'input' }, periodOptions(ps, session.periodStart));
  const toEndSel = el('select', { class: 'input' }, periodOptions(ps, session.periodEnd));
  const toLocI = el('input', { class: 'input', value: session.location, placeholder: '新地点（可选）' });
  const moveForm = el('div', { class: 'form-grid mt', style: { display: 'none' } },
    el('label', { class: 'field' }, el('span', {}, '调到日期'), toDateI),
    el('label', { class: 'field' }, el('span', {}, '新地点'), toLocI),
    el('label', { class: 'field' }, el('span', {}, '开始节次'), toStartSel),
    el('label', { class: 'field' }, el('span', {}, '结束节次'), toEndSel),
    el('div', { class: 'full row' },
      el('button', {
        class: 'btn primary sm', type: 'button', onclick: () => {
          mutate(() => moveSession(session.courseId, session.slotId, session.moved ? session.fromDate : session.date, {
            toDate: toDateI.value, toStart: +toStartSel.value, toEnd: Math.max(+toStartSel.value, +toEndSel.value), toLocation: toLocI.value.trim(),
          }));
          m.close(); toast('已调课（仅影响这一次，可撤销）'); onChanged && onChanged();
        },
      }, '确认调课'),
      el('button', { class: 'btn sm', type: 'button', onclick: () => { moveForm.style.display = 'none'; } }, '收起')),
  );

  const actions = el('div', { class: 'row mt' },
    el('button', {
      class: 'btn', type: 'button', onclick: () => {
        mutate(() => cancelSession(session.courseId, session.slotId, session.moved ? session.fromDate : session.date, '手动停课'));
        m.close(); toast('已单次停课（可撤销/恢复）'); onChanged && onChanged();
      },
    }, '单次停课'),
    el('button', { class: 'btn', type: 'button', onclick: () => { moveForm.style.display = moveForm.style.display === 'none' ? 'grid' : 'none'; } }, '单次调课'),
    ov ? el('button', {
      class: 'btn', type: 'button', onclick: () => {
        mutate(() => restoreSession(ov.id));
        m.close(); toast('已恢复原课次'); onChanged && onChanged();
      },
    }, '恢复原课次') : null,
    el('button', { class: 'btn ghost', type: 'button', onclick: () => { m.close(); courseModal(session.courseId, onChanged); } }, '编辑整门课程'),
  );

  const m = modal('课次操作', el('div', {}, info, actions, moveForm), { actions: [{ label: '关闭' }] });
}

/* ---------- 任务编辑 ---------- */
export function taskModal(taskId, onSaved) {
  const s = getState();
  const existing = taskId ? s.tasks.find(t => t.id === taskId) : null;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: uid(), courseId: '', title: '', due: todayStr() + 'T23:59', priority: 'mid',
    done: false, doneAt: null, subtasks: [], createdAt: new Date().toISOString(),
  };
  const titleI = el('input', { class: 'input', value: draft.title, placeholder: '如：高数第 5 章习题' });
  const courseSel = el('select', { class: 'input' },
    el('option', { value: '' }, '不关联课程'),
    scheduleCourses().map(c => el('option', { value: c.id, selected: c.id === draft.courseId }, c.name)));
  const dueI = el('input', { class: 'input', type: 'datetime-local', value: draft.due || '' });
  const prioSel = el('select', { class: 'input' },
    [['high', '高'], ['mid', '中'], ['low', '低']].map(([v, l]) => el('option', { value: v, selected: v === draft.priority }, l)));

  const subWrap = el('div', {});
  function renderSubs() {
    subWrap.innerHTML = '';
    draft.subtasks.forEach((st, i) => {
      const inp = el('input', { class: 'input', value: st.title, style: { flex: '1' } });
      inp.addEventListener('input', () => { st.title = inp.value; });
      subWrap.append(el('div', { class: 'row', style: { marginBottom: '6px' } },
        inp,
        el('button', { class: 'btn sm ghost', type: 'button', onclick: () => { draft.subtasks.splice(i, 1); renderSubs(); } }, '移除')));
    });
  }
  renderSubs();

  const body = el('div', {},
    el('div', { class: 'form-grid' },
      el('label', { class: 'field full' }, el('span', {}, '任务标题 *'), titleI),
      el('label', { class: 'field' }, el('span', {}, '关联课程'), courseSel),
      el('label', { class: 'field' }, el('span', {}, '优先级'), prioSel),
      el('label', { class: 'field full' }, el('span', {}, '截止时间'), dueI),
    ),
    el('h3', { class: 'mt' }, '子任务'), subWrap,
    el('button', { class: 'btn sm', type: 'button', onclick: () => { draft.subtasks.push({ id: uid(), title: '', done: false }); renderSubs(); } }, '+ 添加子任务'),
  );

  modal(existing ? '编辑任务' : '新建任务', body, {
    actions: [
      ...(existing ? [{
        label: '删除', kind: 'danger', onClick: close => {
          mutate(st => { st.tasks = st.tasks.filter(t => t.id !== taskId); });
          close(); toast('任务已删除'); onSaved && onSaved();
        },
      }] : []),
      { label: '取消' },
      {
        label: '保存', kind: 'primary', onClick: close => {
          if (!titleI.value.trim()) { toast('请填写任务标题', 'err'); return; }
          mutate(st => {
            const data = { ...draft, title: titleI.value.trim(), courseId: courseSel.value, due: dueI.value, priority: prioSel.value, subtasks: draft.subtasks.filter(x => x.title.trim()) };
            const i = st.tasks.findIndex(t => t.id === draft.id);
            if (i >= 0) st.tasks[i] = data; else st.tasks.push(data);
          });
          close(); toast('任务已保存'); onSaved && onSaved();
        },
      },
    ],
  });
}

/* ---------- 考试编辑 ---------- */
export function examModal(examId, onSaved) {
  const s = getState();
  const existing = examId ? s.exams.find(e => e.id === examId) : null;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: uid(), courseId: '', name: '', date: todayStr(), start: '09:00', end: '11:00', location: '', seat: '', notes: '',
  };
  const nameI = el('input', { class: 'input', value: draft.name, placeholder: '如：数据结构期中考试' });
  const courseSel = el('select', { class: 'input' },
    el('option', { value: '' }, '不关联课程'),
    scheduleCourses().map(c => el('option', { value: c.id, selected: c.id === draft.courseId }, c.name)));
  const dateI = el('input', { class: 'input', type: 'date', value: draft.date });
  const startI = el('input', { class: 'input', type: 'time', value: draft.start });
  const endI = el('input', { class: 'input', type: 'time', value: draft.end });
  const locI = el('input', { class: 'input', value: draft.location, placeholder: '考场地点' });
  const seatI = el('input', { class: 'input', value: draft.seat, placeholder: '座位号（可选）' });
  const notesI = el('textarea', { class: 'input', rows: 2 }, draft.notes);

  const body = el('div', { class: 'form-grid' },
    el('label', { class: 'field full' }, el('span', {}, '考试名称 *'), nameI),
    el('label', { class: 'field' }, el('span', {}, '关联课程'), courseSel),
    el('label', { class: 'field' }, el('span', {}, '日期'), dateI),
    el('label', { class: 'field' }, el('span', {}, '开始时间'), startI),
    el('label', { class: 'field' }, el('span', {}, '结束时间'), endI),
    el('label', { class: 'field' }, el('span', {}, '地点'), locI),
    el('label', { class: 'field' }, el('span', {}, '座位号'), seatI),
    el('label', { class: 'field full' }, el('span', {}, '备注'), notesI),
  );

  modal(existing ? '编辑考试' : '新建考试', body, {
    actions: [
      ...(existing ? [{
        label: '删除', kind: 'danger', onClick: close => {
          mutate(st => { st.exams = st.exams.filter(e => e.id !== examId); });
          close(); toast('考试已删除'); onSaved && onSaved();
        },
      }] : []),
      { label: '取消' },
      {
        label: '保存', kind: 'primary', onClick: close => {
          if (!nameI.value.trim() || !dateI.value) { toast('请填写考试名称与日期', 'err'); return; }
          mutate(st => {
            const data = { ...draft, name: nameI.value.trim(), courseId: courseSel.value, date: dateI.value, start: startI.value || '09:00', end: endI.value || '11:00', location: locI.value.trim(), seat: seatI.value.trim(), notes: notesI.value.trim() };
            const i = st.exams.findIndex(e => e.id === draft.id);
            if (i >= 0) st.exams[i] = data; else st.exams.push(data);
          });
          close(); toast('考试已保存'); onSaved && onSaved();
        },
      },
    ],
  });
}