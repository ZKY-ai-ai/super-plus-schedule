/* ============================================================
   commands.js — 命令面板与可自定义快捷键（F140）
   本项目原创实现。
   ============================================================ */
import { getState, mutate, undo, redo, exportBackup, todayStr } from './store.js';
import { el, modal, toast, download } from './ui.js';
import { courseModal, taskModal, examModal } from './editors.js';
import { templatesModal } from './templates.js';

export const DEFAULT_SHORTCUTS = {
  newCourse: 'n', newTask: 'e', prevWeek: 'ArrowLeft', nextWeek: 'ArrowRight',
  thisWeek: 't', palette: 'Mod+k', settings: ',',
};

const KEY_LABEL = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Escape: 'Esc', Enter: 'Enter', ' ': '空格',
};

export function comboLabel(str) {
  const parts = String(str || '').split('+').filter(Boolean);
  const key = parts.pop() || '';
  const mods = parts.map(p => (p.toLowerCase() === 'mod' ? 'Ctrl/⌘' : p));
  return [...mods, KEY_LABEL[key] || (key.length === 1 ? key.toUpperCase() : key)].join(' + ');
}

function parseCombo(str) {
  const parts = String(str || '').split('+').map(x => x.trim()).filter(Boolean);
  const key = parts.pop() || '';
  const mods = parts.map(p => p.toLowerCase());
  return {
    key,
    mod: mods.includes('mod') || mods.includes('ctrl') || mods.includes('meta'),
    ctrl: mods.includes('ctrl'), meta: mods.includes('meta'),
    shift: mods.includes('shift'), alt: mods.includes('alt'),
  };
}

function matches(e, combo) {
  if (!combo.key) return false;
  if (combo.mod !== (e.ctrlKey || e.metaKey)) return false;
  if (combo.ctrl && !e.ctrlKey) return false;
  if (combo.meta && !e.metaKey) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.alt !== e.altKey) return false;
  return e.key.toLowerCase() === combo.key.toLowerCase();
}

/* 命令清单：shortcuts 里出现的 key 会绑定到同名命令 */
export function buildCommands({ nav }) {
  const go = view => () => nav(view);
  const week = delta => () => {
    nav('timetable');
    mutate(s => { s.ui.ttWeekOffset = (s.ui.ttWeekOffset || 0) + delta; }, { undoable: false });
  };
  return [
    { id: 'newCourse', label: '新建课程', group: '编辑', run: () => courseModal(null, () => nav('timetable')) },
    { id: 'newTask', label: '新建任务', group: '编辑', run: () => taskModal(null, () => nav('tasks')) },
    { id: 'newExam', label: '新建考试', group: '编辑', run: () => examModal(null, () => nav('exams')) },
    { id: 'templates', label: '课表模板', group: '编辑', run: () => templatesModal({ onApplied: () => nav('timetable') }) },
    { id: 'undo', label: '撤销', group: '编辑', run: () => { if (undo()) toast('已撤销'); } },
    { id: 'redo', label: '重做', group: '编辑', run: () => { if (redo()) toast('已重做'); } },
    { id: 'prevWeek', label: '上一周', group: '课表', run: week(-1) },
    { id: 'nextWeek', label: '下一周', group: '课表', run: week(1) },
    { id: 'thisWeek', label: '回到本周', group: '课表', run: () => { nav('timetable'); mutate(s => { s.ui.ttWeekOffset = 0; }, { undoable: false }); } },
    { id: 'modeGrid', label: '课表：周网格', group: '课表', run: () => { nav('timetable'); mutate(s => { s.ui.ttMode = 'grid'; }, { undoable: false }); } },
    { id: 'modeList', label: '课表：周列表', group: '课表', run: () => { nav('timetable'); mutate(s => { s.ui.ttMode = 'list'; }, { undoable: false }); } },
    { id: 'modeDay', label: '课表：日视图', group: '课表', run: () => { nav('timetable'); mutate(s => { s.ui.ttMode = 'day'; }, { undoable: false }); } },
    { id: 'today', label: '前往：今日', group: '导航', run: go('today') },
    { id: 'timetable', label: '前往：课表', group: '导航', run: go('timetable') },
    { id: 'tasks', label: '前往：任务', group: '导航', run: go('tasks') },
    { id: 'exams', label: '前往：考试', group: '导航', run: go('exams') },
    { id: 'gaps', label: '前往：空档', group: '导航', run: go('gaps') },
    { id: 'assistant', label: '前往：AI 助手', group: '导航', run: go('assistant') },
    { id: 'settings', label: '前往：设置', group: '导航', run: go('settings') },
    {
      id: 'theme', label: '切换深浅色', group: '外观', run: () => {
        const cur = document.documentElement.dataset.theme;
        mutate(s => { s.settings.theme = cur === 'dark' ? 'light' : 'dark'; }, { undoable: false });
      },
    },
    { id: 'palette', label: '打开命令面板', group: '外观', run: () => openPalette({ nav }) },
    {
      id: 'backup', label: '导出完整备份', group: '数据', run: () => {
        download(`coursegap-备份-${todayStr()}.json`, exportBackup(), 'application/json');
        toast('备份已导出');
      },
    },
  ];
}

/* ---------- 命令面板 ---------- */
export function openPalette({ nav }) {
  const commands = buildCommands({ nav });
  const shortcuts = getState().settings.shortcuts || {};
  const input = el('input', { class: 'input', placeholder: '输入命令名称，↑↓ 选择，Enter 执行，Esc 关闭', autocomplete: 'off' });
  const list = el('div', { class: 'cmd-list', role: 'listbox' });
  let filtered = commands, active = 0;

  function render() {
    list.innerHTML = '';
    if (!filtered.length) { list.append(el('p', { class: 'muted small', style: { padding: '10px' } }, '没有匹配的命令')); return; }
    filtered.forEach((c, i) => {
      const row = el('div', {
        class: 'cmd-item' + (i === active ? ' active' : ''), role: 'option',
        onclick: () => { close(); c.run(); },
        onmouseenter: () => { active = i; render(); },
      },
        el('span', { class: 'cmd-group' }, c.group),
        el('span', { class: 'cmd-label' }, c.label),
        shortcuts[c.id] ? el('kbd', {}, comboLabel(shortcuts[c.id])) : null);
      list.append(row);
    });
    const cur = list.children[active];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    filtered = q ? commands.filter(c => (c.label + c.group + c.id).toLowerCase().includes(q)) : commands;
    active = 0; render();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(filtered.length - 1, active + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = filtered[active]; if (c) { close(); c.run(); } }
  });

  render();
  const { close } = modal('命令面板', el('div', {}, input, list), { wide: true });
  setTimeout(() => input.focus(), 40);
}

/* ---------- 快捷键设置 ---------- */
export function shortcutsModal() {
  const commands = buildCommands({ nav: () => {} });
  const bindable = commands;
  const wrap = el('div', {});

  function render() {
    wrap.innerHTML = '';
    const sc = getState().settings.shortcuts;
    bindable.forEach(c => {
      const btn = el('button', { class: 'btn sm kbd-btn' }, sc[c.id] ? comboLabel(sc[c.id]) : '未绑定');
      btn.addEventListener('click', () => {
        btn.textContent = '按下新按键…';
        btn.classList.add('listening');
        const onKey = e => {
          e.preventDefault(); e.stopPropagation();
          document.removeEventListener('keydown', onKey, true);
          btn.classList.remove('listening');
          if (e.key === 'Escape') { render(); return; }
          if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) { btn.textContent = '请再按一个主键…'; document.addEventListener('keydown', onKey, true); return; }
          const mods = [];
          if (e.ctrlKey || e.metaKey) mods.push('Mod');
          if (e.altKey) mods.push('Alt');
          if (e.shiftKey && e.key.length > 1) mods.push('Shift');
          const combo = [...mods, e.key].join('+');
          const dup = Object.entries(sc).find(([k, v]) => k !== c.id && v === combo);
          if (dup) { toast(`该按键已绑定「${(commands.find(x => x.id === dup[0]) || {}).label || dup[0]}」`, 'err'); render(); return; }
          mutate(s => { s.settings.shortcuts[c.id] = combo; }, { undoable: false });
          render();
        };
        document.addEventListener('keydown', onKey, true);
      });
      wrap.append(el('div', { class: 'row spread sc-row' },
        el('span', {}, el('span', { class: 'muted small' }, c.group + ' · '), c.label),
        el('div', { class: 'row' }, btn,
          sc[c.id] ? el('button', {
            class: 'btn sm ghost', onclick: () => { mutate(s => { delete s.settings.shortcuts[c.id]; }, { undoable: false }); render(); },
          }, '清除') : null)));
    });
  }
  render();

  modal('自定义快捷键', el('div', {},
    el('p', { class: 'muted small mb' }, '点击右侧按钮后按下新按键即可改绑；Esc 取消。输入框内打字不会触发快捷键。Ctrl+Z / Ctrl+Y 撤销重做为固定快捷键。'),
    wrap,
    el('div', { class: 'row mt' },
      el('button', {
        class: 'btn sm', onclick: () => { mutate(s => { s.settings.shortcuts = { ...DEFAULT_SHORTCUTS }; }, { undoable: false }); render(); toast('已恢复默认快捷键'); },
      }, '恢复默认'))),
    { wide: true, actions: [{ label: '关闭' }] });
}

/* ---------- 全局快捷键监听 ---------- */
export function initShortcuts(ctx) {
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (document.querySelector('.modal-mask')) return;
    const sc = getState().settings.shortcuts || {};
    const commands = buildCommands(ctx);
    for (const c of commands) {
      const combo = sc[c.id];
      if (combo && matches(e, parseCombo(combo))) { e.preventDefault(); c.run(); return; }
    }
  });
}