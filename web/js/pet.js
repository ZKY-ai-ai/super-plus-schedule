/* ============================================================
   pet.js — 桌面宠物「小隙」（F136）
   形象为本项目原创 SVG（课表方块 + 空档缺口 motif），
   不使用课序 ClassFlow 的鲸鱼娘 / dsh-pet 素材（上游许可限制）。
   拖动换位、点击播报今日课程与空档建议，位置只存本机。
   ============================================================ */
import { getState, mutate, todayStr } from './store.js';
import { nowStatus, gapsOn } from './schedule.js';
import { el, fmtCountdown } from './ui.js';

const PET_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <ellipse cx="32" cy="59" rx="15" ry="3.4" fill="rgba(16,24,40,.18)"/>
  <g class="pet-body">
    <rect x="19" y="5" width="4.4" height="11" rx="2.2" fill="var(--site-accent)"/>
    <rect x="40.6" y="5" width="4.4" height="11" rx="2.2" fill="var(--site-accent)"/>
    <rect x="11" y="12" width="42" height="41" rx="15" fill="var(--site-accent)"/>
    <rect x="17" y="18" width="30" height="20" rx="9" fill="var(--site-on-accent)" opacity=".16"/>
    <g class="pet-eyes">
      <circle cx="24.5" cy="30" r="4.6" fill="#fff"/>
      <circle cx="39.5" cy="30" r="4.6" fill="#fff"/>
      <circle cx="25.4" cy="30.8" r="2.1" fill="#1c2333"/>
      <circle cx="40.4" cy="30.8" r="2.1" fill="#1c2333"/>
    </g>
    <path d="M25.5 40.5q6.5 5.4 13 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <rect x="20" y="46.5" width="10" height="3" rx="1.5" fill="#fff" opacity=".5"/>
    <rect x="33" y="46.5" width="11" height="3" rx="1.5" fill="#fff" opacity=".28"/>
  </g>
</svg>`;

let host = null, bubble = null, bubbleTimer = null, tipIndex = 0;

function tips() {
  const s = getState();
  const t = todayStr();
  const { current, next, remaining } = nowStatus(t);
  const out = [];
  const name = s.settings.pet.name || '小隙';
  if (current) out.push(`正在上「${current.name}」，${current.end} 下课${current.location ? '（' + current.location + '）' : ''}。`);
  if (next) {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    out.push(`下一节 ${next.start} 「${next.name}」，还有 ${fmtCountdown((next.startMin - nowMin) * 60000)}。`);
  }
  if (!current && !next) out.push(remaining.length ? '今天的课都上完啦，收拾一下回去吧。' : '今天没有课，整段空档都归你。');
  const gaps = gapsOn(t).filter(g => g.usable >= 25);
  if (gaps.length) {
    const g = gaps[0];
    out.push(`${g.from}–${g.to} 有 ${g.usable} 分钟可用空档：${g.suggestions[0] || '自由安排'}。`);
  }
  const due = s.tasks.filter(x => !x.done && x.due && x.due.slice(0, 10) === t);
  if (due.length) out.push(`今天有 ${due.length} 个任务截止，别拖到深夜。`);
  out.push(`我是${name}，点我可以换一条提示，拖我可以换个位置。`);
  return out;
}

function say(text, ms = 6000) {
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
}

function clampPos(x, y) {
  const w = 76, h = 92;
  return {
    x: Math.max(4, Math.min(window.innerWidth - w - 4, x)),
    y: Math.max(4, Math.min(window.innerHeight - h - 4, y)),
  };
}

function place(x, y) {
  const p = clampPos(x, y);
  host.style.left = p.x + 'px';
  host.style.top = p.y + 'px';
  return p;
}

function build() {
  const s = getState();
  host = el('div', { id: 'pet-host', class: 'no-print', title: '拖动移动 · 点击说话' });
  bubble = el('div', { id: 'pet-bubble', role: 'status' });
  const body = el('div', { id: 'pet-body', html: PET_SVG });
  host.append(bubble, body);
  document.body.append(host);

  const start = s.settings.pet.x != null ? { x: s.settings.pet.x, y: s.settings.pet.y } : { x: window.innerWidth - 110, y: window.innerHeight - 140 };
  place(start.x, start.y);

  let dragging = false, moved = false, ox = 0, oy = 0;
  body.addEventListener('pointerdown', e => {
    dragging = true; moved = false;
    ox = e.clientX - host.offsetLeft; oy = e.clientY - host.offsetTop;
    body.setPointerCapture(e.pointerId);
    host.classList.add('dragging');
    e.preventDefault();
  });
  body.addEventListener('pointermove', e => {
    if (!dragging) return;
    moved = true;
    place(e.clientX - ox, e.clientY - oy);
  });
  const endDrag = e => {
    if (!dragging) return;
    dragging = false;
    host.classList.remove('dragging');
    try { body.releasePointerCapture(e.pointerId); } catch { /* 指针已释放 */ }
    if (moved) {
      const x = host.offsetLeft, y = host.offsetTop;
      mutate(st => { st.settings.pet.x = x; st.settings.pet.y = y; }, { undoable: false, silent: true });
    } else {
      const list = tips();
      say(list[tipIndex++ % list.length]);
    }
  };
  body.addEventListener('pointerup', endDrag);
  body.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => { if (host) place(host.offsetLeft, host.offsetTop); });
}

/* 由 app.js 的渲染调度调用：按开关创建/销毁，并刷新提示内容 */
export function syncPet() {
  const s = getState();
  if (!s.settings.pet.enabled) {
    if (host) { host.remove(); host = null; bubble = null; clearTimeout(bubbleTimer); }
    return;
  }
  if (!host) build();
  if (host.offsetLeft + 80 > window.innerWidth || host.offsetTop + 96 > window.innerHeight) place(host.offsetLeft, host.offsetTop);
}

export function petSpeak() {
  if (!host) return;
  const list = tips();
  say(list[tipIndex++ % list.length]);
}