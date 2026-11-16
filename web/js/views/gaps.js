/* ============================================================
   views/gaps.js — 课间空档规划：
   空档识别、扣除步行/缓冲、建议、最晚出发时间、往返可行性
   ============================================================ */
import { getState, mutate, todayStr, dadd, mdCN, weekdayCN } from '../store.js';
import { gapsOn, roundTripFeasible } from '../schedule.js';
import { el, toast } from '../ui.js';

export function renderGaps(root, nav) {
  const s = getState();
  root.innerHTML = '';
  const date = s.ui.gapDate || todayStr();

  const dateI = el('input', { class: 'input', type: 'date', value: date, style: { width: 'auto' } });
  dateI.addEventListener('change', () => mutate(st => { st.ui.gapDate = dateI.value; }, { undoable: false }));

  root.append(el('div', { class: 'view-head' },
    el('div', {}, el('h2', {}, '空档规划'), el('p', { class: 'sub' }, '两节课之间的时间，扣掉步行与缓冲后还剩多少？能用来做什么？')),
    el('div', { class: 'row' },
      el('button', { class: 'btn sm', onclick: () => mutate(st => { st.ui.gapDate = todayStr(); }, { undoable: false }) }, '今天'),
      el('button', { class: 'btn sm', onclick: () => mutate(st => { st.ui.gapDate = dadd(todayStr(), 1); }, { undoable: false }) }, '明天'),
      dateI)));

  root.append(el('p', { class: 'small muted mb' },
    `${mdCN(date)}（${weekdayCN(date)}）· 步行默认 ${s.settings.walkDefault} 分钟、缓冲 ${s.settings.walkBuffer} 分钟，可在「设置 → 校园与步行」按楼栋精调。`));

  const gaps = gapsOn(date);
  if (!gaps.length) {
    root.append(el('div', { class: 'card empty' }, el('p', { class: 'muted' }, '这一天没有 ≥15 分钟的空档（或没有课程）。')));
  } else {
    const card = el('div', { class: 'card' });
    gaps.forEach(g => {
      const pct = Math.min(100, Math.round(g.usable / 180 * 100));
      card.append(el('div', { class: 'gap-item' },
        el('div', { class: 'gap-range' }, `${g.from}\n– ${g.to}`),
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', {},
            el('span', { class: 'gap-min' }, `可用 ${g.usable} 分钟`),
            el('span', { class: 'muted small' }, `（总长 ${g.minutes} 分钟 − 步行 ${g.walk} − 缓冲 ${g.buffer}）`)),
          el('div', { class: 'gap-sugg' }, g.suggestions.join(' · ')),
          g.before && g.after ? el('div', { class: 'gap-sugg' }, `${g.before} → ${g.after}${g.departure ? ` · 最晚 ${g.departure} 出发去下一教室` : ''}`) : null,
          el('div', { class: 'gap-bar' }, el('i', { style: { width: pct + '%' } })),
        )));
    });
    root.append(card);
  }

  // 往返可行性计算器
  const destI = el('input', { class: 'input', placeholder: '目的地，如：图书馆', style: { maxWidth: '220px' }, list: 'building-list' });
  const stayI = el('input', { class: 'input', type: 'number', min: 5, value: 30, style: { width: '90px' }, 'aria-label': '停留分钟' });
  const datalist = el('datalist', { id: 'building-list' }, s.buildings.map(b => el('option', { value: b.name })));
  const resultBox = el('div', { class: 'mt' });
  const calc = () => {
    const dest = destI.value.trim();
    if (!dest) { toast('请输入目的地', 'err'); return; }
    const results = roundTripFeasible(date, dest, Math.max(5, +stayI.value || 30)).filter(r => r.available >= 15);
    resultBox.innerHTML = '';
    if (!results.length) { resultBox.append(el('p', { class: 'muted small' }, '没有足够长的空档窗口。')); return; }
    results.forEach(r => {
      resultBox.append(el('div', { class: 'session-item' },
        el('div', { class: 'session-time' }, r.window),
        el('div', { class: 'session-body' },
          el('div', { class: 'name' }, r.ok ? '来得及' : '来不及',
            el('span', { class: 'chip ' + (r.ok ? 'ok' : 'danger'), style: { marginLeft: '8px' } }, `需 ${r.need} 分钟 / 有 ${r.available} 分钟`)),
          el('div', { class: 'meta' }, r.ok ? `最晚 ${r.latestLeave} 从${dest}出发返回${r.afterClass ? '，赶「' + r.afterClass + '」' : ''}` : '建议改到更长的空档，或缩短停留时间'))));
    });
  };
  root.append(el('div', { class: 'card mt' },
    el('h3', {}, '往返可行性：去某地再回来，来得及吗？'),
    el('p', { class: 'small muted mb' }, '按「去程步行 + 停留 + 返程步行 + 缓冲」估算，对比每个空档窗口。'),
    el('div', { class: 'row' }, destI, el('span', { class: 'muted small' }, '停留'), stayI, el('span', { class: 'muted small' }, '分钟'),
      el('button', { class: 'btn primary sm', onclick: calc }, '计算')),
    datalist, resultBox));
}