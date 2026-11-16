/* ============================================================
   templates.js — 课表模板：内置专业模板 + 保存当前课表为模板，
   预览后选择性应用（F130）

   内置模板清单与课程种子数据移植自
   lcymxm/classflow src/lib/templates.ts（MIT，
   commit 30c466a5c456b7dde01cfc42a3178f83e87de7a6），
   上游 tone 配色映射为本项目的 --course-N 序号；
   「保存当前课表为模板 / 预览 / 勾选应用」为本项目新增。
   归属与许可证见 third_party/classflow/NOTICE.md。
   ============================================================ */
import { getState, mutate, uid, activeSchedule, todayStr } from './store.js';
import { el, modal, toast, confirmModal } from './ui.js';

const TONE_COLOR = { clay: 3, sky: 8, teal: 2, marigold: 10, olive: 6, plum: 5, rose: 4 };

const SEEDS = {
  stem: [
    { name: '高等数学 A（上）', teacher: '张明远', location: '教一 401', tone: 'clay', slots: [[1, 1, 2], [3, 3, 4]] },
    { name: '大学物理', teacher: '周衡', location: '教二 205', tone: 'sky', slots: [[2, 3, 4], [4, 5, 6]] },
    { name: '程序设计基础', teacher: '陈屿', location: '计算机楼 205', tone: 'teal', slots: [[3, 5, 6], [5, 3, 4]] },
    { name: '大学英语', teacher: '李珂', location: '外语楼 302', tone: 'marigold', slots: [[4, 1, 2]] },
    { name: '体育 · 羽毛球', teacher: '王锐', location: '风雨操场', tone: 'olive', slots: [[5, 7, 8]] },
  ],
  humanities: [
    { name: '现代汉语', teacher: '顾清', location: '文科楼 201', tone: 'plum', slots: [[1, 3, 4], [3, 1, 2]] },
    { name: '中国文学史', teacher: '沈砚', location: '文科楼 108', tone: 'rose', slots: [[2, 1, 2]] },
    { name: '世界近代史', teacher: '何宁', location: '教二 301', tone: 'clay', slots: [[4, 3, 4]] },
    { name: '大学英语', teacher: '林夏', location: '外语楼 205', tone: 'sky', slots: [[3, 5, 6]] },
    { name: '艺术鉴赏', teacher: '苏禾', location: '艺术楼 102', tone: 'olive', slots: [[5, 5, 6]] },
  ],
  medical: [
    { name: '系统解剖学', teacher: '许川', location: '医学楼 301', tone: 'clay', slots: [[1, 1, 2], [3, 3, 4]] },
    { name: '生理学', teacher: '洛宁', location: '医学楼 205', tone: 'teal', slots: [[2, 3, 4]] },
    { name: '生物化学', teacher: '季安', location: '实验楼 B 302', tone: 'olive', slots: [[4, 1, 2]] },
    { name: '医学英语', teacher: '林夏', location: '外语楼 205', tone: 'sky', slots: [[3, 5, 6]] },
    { name: '体育 · 羽毛球', teacher: '王锐', location: '风雨操场', tone: 'marigold', slots: [[5, 7, 8]] },
  ],
  exam: [
    { name: '考研政治', teacher: '肖宁', location: '图书馆 3F', tone: 'clay', slots: [[1, 1, 2], [4, 1, 2]] },
    { name: '考研英语', teacher: '周遥', location: '图书馆 3F', tone: 'sky', slots: [[2, 1, 2], [5, 3, 4]] },
    { name: '数学一', teacher: '张明远', location: '教一 401', tone: 'teal', slots: [[3, 1, 2], [4, 5, 6]] },
    { name: '专业课复习', teacher: '', location: '自习室', tone: 'olive', slots: [[2, 5, 6], [3, 5, 6]] },
  ],
};

export const BUILTIN_TEMPLATES = [
  { id: 'blank', name: '空白课表', description: '从零开始自己添加', builtin: true, courses: [] },
  { id: 'stem', name: '理工科', description: '高数、物理、程序、英语', builtin: true },
  { id: 'humanities', name: '文科', description: '文学、历史、英语、艺术', builtin: true },
  { id: 'medical', name: '医学', description: '解剖、生理、生化、医学英语', builtin: true },
  { id: 'exam', name: '考研备考', description: '政治、英语、数学、专业课', builtin: true },
].map(t => ({ ...t, courses: t.courses || (SEEDS[t.id] || []).map(s => ({ ...s, color: TONE_COLOR[s.tone] || 1 })) }));

export function allTemplates() {
  return [...BUILTIN_TEMPLATES, ...getState().templates];
}

/* 把模板课程实例化为当前课表的课程对象 */
export function instantiate(tpl, scheduleId, totalWeeks) {
  const endWeek = Math.min(totalWeeks || 20, 16);
  return (tpl.courses || []).map(c => ({
    id: uid(), scheduleId,
    name: c.name, alias: c.alias || '', teacher: c.teacher || '', location: c.location || '',
    color: c.color || 1, notes: c.notes || '',
    slots: (c.slots || []).map(([day, start, end]) => ({
      id: uid(), day, start, end,
      weeks: { type: 'range', from: 1, to: endWeek, parity: 'all' },
      location: c.location || '',
    })),
  }));
}

/* 保存当前课表为模板（课程规则 + 可选外观） */
export function saveCurrentAsTemplate(name, { withAppearance = false } = {}) {
  const s = getState();
  const sch = activeSchedule();
  const courses = s.courses.filter(c => c.scheduleId === sch.id).map(c => ({
    name: c.name, alias: c.alias || '', teacher: c.teacher || '', location: c.location || '',
    color: c.color, notes: c.notes || '',
    slots: (c.slots || []).map(x => [x.day, x.start, x.end]),
  }));
  const tpl = {
    id: uid(), name: name || `${sch.name} 模板`, createdAt: todayStr(), builtin: false,
    description: `${courses.length} 门课程 · 来自「${sch.name}」`,
    courses,
    appearance: withAppearance ? JSON.parse(JSON.stringify(s.settings.appearance)) : null,
  };
  mutate(st => { st.templates.push(tpl); });
  return tpl;
}

const slotText = c => (c.slots || []).map(([d, a, b]) => `周${'一二三四五六日'[d - 1]} ${a}-${b}节`).join('；');

/* 预览 + 勾选应用 */
export function templateModal(tpl, { onApplied } = {}) {
  const s = getState();
  const sch = activeSchedule();
  const checks = (tpl.courses || []).map(() => true);
  const listWrap = el('div', { class: 'tpl-list' });

  function renderList() {
    listWrap.innerHTML = '';
    if (!tpl.courses.length) {
      listWrap.append(el('p', { class: 'muted small' }, '这个模板没有课程，应用后会清空当前课表的课程。'));
      return;
    }
    tpl.courses.forEach((c, i) => {
      const cb = el('input', { type: 'checkbox', checked: checks[i], style: { accentColor: 'var(--site-accent)' } });
      cb.addEventListener('change', () => { checks[i] = cb.checked; });
      listWrap.append(el('label', { class: 'tpl-row' }, cb,
        el('span', { class: 'tpl-dot', style: { background: `var(--course-${c.color || 1})` } }),
        el('span', { class: 'tpl-name' }, c.name),
        el('span', { class: 'muted small tpl-slots' }, slotText(c))));
    });
  }
  renderList();

  const modeSel = el('select', { class: 'input', style: { width: 'auto' } },
    el('option', { value: 'append' }, '追加到当前课表'),
    el('option', { value: 'replace' }, '替换当前课表课程'));
  const appearCb = el('input', { type: 'checkbox', checked: false, style: { accentColor: 'var(--site-accent)' } });

  const body = el('div', {},
    el('p', { class: 'muted small mb' }, tpl.description || ''),
    el('p', { class: 'small mb' }, `应用到课表「${sch.name}」（${sch.totalWeeks} 教学周，模板课程默认 1–${Math.min(sch.totalWeeks, 16)} 周）。勾选要导入的课程：`),
    listWrap,
    el('div', { class: 'row mt' },
      el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, '应用方式'), modeSel),
      tpl.appearance ? el('label', { class: 'row', style: { margin: 0 } }, appearCb, el('span', { class: 'small' }, '同时应用模板外观')) : null),
    el('p', { class: 'small muted mt' }, '应用后可用 Ctrl+Z 撤销。同名课程在「追加」模式下会跳过。'));

  modal(`模板：${tpl.name}`, body, {
    wide: true,
    actions: [
      { label: '取消' },
      {
        label: '应用所选课程', kind: 'primary', onClick: close => {
          const picked = tpl.courses.filter((_, i) => checks[i]);
          const mode = modeSel.value;
          mutate(st => {
            const target = st.schedules.find(x => x.id === sch.id);
            const fresh = instantiate({ courses: picked }, target.id, target.totalWeeks);
            if (mode === 'replace') {
              const ids = new Set(st.courses.filter(c => c.scheduleId === target.id).map(c => c.id));
              st.courses = st.courses.filter(c => !ids.has(c.id));
              st.overrides = st.overrides.filter(o => !ids.has(o.courseId));
              st.courses.push(...fresh);
            } else {
              const exist = new Set(st.courses.filter(c => c.scheduleId === target.id).map(c => c.name));
              st.courses.push(...fresh.filter(c => !exist.has(c.name)));
            }
            if (tpl.appearance && appearCb.checked) st.settings.appearance = { ...st.settings.appearance, ...tpl.appearance };
          });
          close();
          toast(`已应用 ${picked.length} 门课程`);
          onApplied && onApplied();
        },
      },
    ],
  });
}

/* 模板管理入口：内置 + 自建，可预览应用、删除自建 */
export function templatesModal({ onApplied } = {}) {
  const wrap = el('div', {});
  function render() {
    wrap.innerHTML = '';
    allTemplates().forEach(tpl => {
      wrap.append(el('div', { class: 'row spread tpl-item' },
        el('div', {},
          el('b', {}, tpl.name),
          el('span', { class: 'chip', style: { marginLeft: '6px' } }, tpl.builtin ? '内置' : '自建'),
          el('div', { class: 'muted small' }, tpl.description || `${(tpl.courses || []).length} 门课程`)),
        el('div', { class: 'row' },
          el('button', { class: 'btn sm primary', onclick: () => templateModal(tpl, { onApplied }) }, '预览并应用'),
          tpl.builtin ? null : el('button', {
            class: 'btn sm danger', onclick: () => confirmModal('删除模板', `删除自建模板「${tpl.name}」？不影响已应用的课程。`, () => {
              mutate(st => { st.templates = st.templates.filter(x => x.id !== tpl.id); });
              render();
            }, { danger: true, yesLabel: '删除' }),
          }, '删除'))));
    });
  }
  render();

  const nameI = el('input', { class: 'input', placeholder: '模板名称，如：大二上模板' });
  const appearCb = el('input', { type: 'checkbox', style: { accentColor: 'var(--site-accent)' } });
  modal('课表模板', el('div', {},
    el('p', { class: 'muted small mb' }, '内置模板来自课序 ClassFlow（MIT），自建模板保存在本机。'),
    wrap,
    el('div', { class: 'card mt', style: { boxShadow: 'none' } },
      el('h4', { class: 'mb' }, '把当前课表存为模板'),
      el('div', { class: 'row' }, nameI,
        el('label', { class: 'row', style: { margin: 0 } }, appearCb, el('span', { class: 'small' }, '包含外观设置')),
        el('button', {
          class: 'btn sm', onclick: () => {
            const tpl = saveCurrentAsTemplate(nameI.value.trim(), { withAppearance: appearCb.checked });
            nameI.value = '';
            toast(`模板「${tpl.name}」已保存`);
            render();
          },
        }, '保存当前课表')))),
    { wide: true, actions: [{ label: '关闭' }] });
}