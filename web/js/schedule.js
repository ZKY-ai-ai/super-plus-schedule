/* ============================================================
   schedule.js — 课表引擎
   教学周计算、课程规则展开为具体课次、调课覆盖、冲突检测、
   当前/下一节课、空档与步行时间计算。
   ============================================================ */
import {
  getState, activeSchedule, activePeriodSet, scheduleCourses, courseById,
  dstr, dparse, dadd, todayStr, diffDays, hm2min, min2hm, slotInWeek, uid,
} from './store.js';

/* ---------- 教学周 ---------- */
export function weekOf(dateStr, sch = activeSchedule()) {
  const start = dparse(sch.semesterStart);
  const d = dparse(dateStr);
  const delta = Math.round((d - start) / 86400000);
  return Math.floor(delta / 7) + 1;
}
export function dateOfWeekDay(week, day, sch = activeSchedule()) {
  // day: 1=周一 … 7=周日（相对 weekStart）
  const start = dparse(sch.semesterStart);
  const offset = (day - (sch.weekStart || 1) + 7) % 7;
  const d = new Date(start);
  d.setDate(d.getDate() + (week - 1) * 7 + offset);
  return dstr(d);
}
export function currentWeek() { return weekOf(todayStr()); }
export function inSemester(dateStr, sch = activeSchedule()) {
  const w = weekOf(dateStr, sch);
  return w >= 1 && w <= sch.totalWeeks;
}
/* 周视图的 7 天日期（按 weekStart 排列） */
export function weekDates(week, sch = activeSchedule()) {
  const ws = sch.weekStart || 1;
  return Array.from({ length: 7 }, (_, i) => dateOfWeekDay(week, ((ws - 1 + i) % 7) + 1, sch));
}

/* ---------- 节次 <-> 时间 ---------- */
export function periodTime(p, ps = activePeriodSet()) {
  const found = ps.periods.find(x => x.p === p);
  return found || null;
}
export function periodRange(start, end, ps = activePeriodSet()) {
  const a = periodTime(start, ps), b = periodTime(end, ps);
  if (!a || !b) return null;
  return { start: a.start, end: b.end };
}
/* 把任意 HH:MM 时间映射到节次；找不到精确匹配时返回 null */
export function timeToPeriod(hm, ps = activePeriodSet(), which = 'start') {
  const f = ps.periods.find(x => x[which] === hm);
  return f ? f.p : null;
}

/* ---------- 课次展开 ----------
   session: {courseId, slotId, date, day, start, end, startMin, endMin,
             location, name, teacher, color, moved?, overrideId?} */
export function sessionsOn(dateStr, { scheduleId } = {}) {
  const s = getState();
  const sch = scheduleId ? s.schedules.find(x => x.id === scheduleId) : activeSchedule();
  if (!sch) return [];
  const week = weekOf(dateStr, sch);
  if (week < 1 || week > sch.totalWeeks) return [];
  const ps = s.settings.periodSets.find(p => p.id === sch.periodSetId) || s.settings.periodSets[0];
  const day = ((dparse(dateStr).getDay() + 6) % 7) + 1; // 1=周一
  const out = [];
  const courses = s.courses.filter(c => c.scheduleId === sch.id);

  for (const c of courses) {
    for (const slot of c.slots || []) {
      if (slot.day !== day || !slotInWeek(slot, week)) continue;
      const ov = s.overrides.find(o => o.courseId === c.id && o.slotId === slot.id && o.date === dateStr);
      if (ov && ov.type === 'cancel') continue;
      if (ov && ov.type === 'move') continue; // 原课次移走，由下方 move 分支补回
      const range = periodRange(slot.start, slot.end, ps);
      if (!range) continue;
      out.push({
        courseId: c.id, slotId: slot.id, date: dateStr, day,
        start: range.start, end: range.end,
        startMin: hm2min(range.start), endMin: hm2min(range.end),
        location: slot.location || c.location || '',
        name: c.alias || c.name, teacher: c.teacher, color: c.color,
        periodStart: slot.start, periodEnd: slot.end,
      });
    }
  }
  // 调课：把移到当天的课次补进来
  for (const ov of s.overrides) {
    if (ov.type !== 'move' || ov.toDate !== dateStr) continue;
    const c = courseById(ov.courseId);
    if (!c || c.scheduleId !== sch.id) continue;
    const slot = (c.slots || []).find(x => x.id === ov.slotId);
    if (!slot) continue;
    const range = periodRange(ov.toStart ?? slot.start, ov.toEnd ?? slot.end, ps);
    if (!range) continue;
    out.push({
      courseId: c.id, slotId: slot.id, date: dateStr, day,
      start: range.start, end: range.end,
      startMin: hm2min(range.start), endMin: hm2min(range.end),
      location: ov.toLocation ?? slot.location ?? c.location ?? '',
      name: c.alias || c.name, teacher: c.teacher, color: c.color,
      periodStart: ov.toStart ?? slot.start, periodEnd: ov.toEnd ?? slot.end,
      moved: true, overrideId: ov.id, fromDate: ov.date,
    });
  }
  out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  return out;
}

export function sessionsBetween(fromDate, toDate, opts) {
  const out = [];
  let d = fromDate;
  let guard = 0;
  while (d <= toDate && guard++ < 400) {
    out.push(...sessionsOn(d, opts));
    d = dadd(d, 1);
  }
  return out;
}

/* ---------- 冲突 ---------- */
export function conflictsOn(dateStr, opts) {
  const list = sessionsOn(dateStr, opts);
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.startMin < b.endMin && b.startMin < a.endMin) pairs.push([a, b]);
    }
  }
  return pairs;
}
export function conflictCourseIds(dateStr) {
  const set = new Set();
  conflictsOn(dateStr).forEach(([a, b]) => { set.add(a.courseId + ':' + a.slotId); set.add(b.courseId + ':' + b.slotId); });
  return set;
}
/* 检查某课程某时段加入后是否与现有课次冲突（用于编辑提示） */
export function wouldConflict(courseId, slotId, day, start, end, weeks, ignoreSlotId) {
  const s = getState();
  const sch = activeSchedule();
  const ps = activePeriodSet();
  const range = periodRange(start, end, ps);
  if (!range) return [];
  const a0 = hm2min(range.start), a1 = hm2min(range.end);
  const hits = [];
  for (let w = 1; w <= sch.totalWeeks; w++) {
    if (!slotInWeek({ weeks }, w)) continue;
    const date = dateOfWeekDay(w, day, sch);
    for (const ses of sessionsOn(date)) {
      if (ses.courseId === courseId && (ses.slotId === slotId || ses.slotId === ignoreSlotId)) continue;
      if (a0 < ses.endMin && ses.startMin < a1) hits.push({ week: w, date, other: ses });
    }
  }
  return hits;
}

/* ---------- 当前 / 下一节 ---------- */
export function nowStatus(dateStr = todayStr()) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const list = sessionsOn(dateStr);
  const current = list.find(x => x.startMin <= nowMin && nowMin < x.endMin);
  const next = list.find(x => x.startMin > nowMin);
  const remaining = list.filter(x => x.endMin > nowMin);
  return { current, next, remaining, list, nowMin };
}

/* ---------- 步行时间 ---------- */
export function walkMinutes(from, to) {
  const s = getState();
  if (!from || !to) return s.settings.walkDefault;
  const bOf = loc => (s.buildings.find(b => loc.includes(b.name)) || {}).name || loc.split(/[-－]/)[0].trim();
  const a = bOf(from), b = bOf(to);
  if (a === b) return 2; // 同楼换教室
  const key = [a, b].sort().join('|');
  return s.settings.walkMatrix[key] ?? s.settings.walkDefault;
}

/* ---------- 空档分析 ----------
   返回 [{from,to,minutes,usable,after,before,suggestions[],departure}] */
export function gapsOn(dateStr) {
  const s = getState();
  const list = sessionsOn(dateStr);
  const dayStart = hm2min(s.settings.dayStart), dayEnd = hm2min(s.settings.dayEnd);
  const buffer = s.settings.walkBuffer;
  const lunch = { start: hm2min(s.settings.lunch.start), end: hm2min(s.settings.lunch.end) };
  const gaps = [];
  const bounds = [{ endMin: dayStart, location: '' }, ...list, { startMin: dayEnd, location: '' }];
  for (let i = 0; i < bounds.length - 1; i++) {
    const before = bounds[i], after = bounds[i + 1];
    const from = before.endMin ?? dayStart;
    const to = after.startMin ?? dayEnd;
    if (to - from < 15) continue;
    const walk = (before.location && after.location) ? walkMinutes(before.location, after.location) : 0;
    const usable = Math.max(0, to - from - walk - buffer);
    const sugg = [];
    const overlapsLunch = from < lunch.end && lunch.start < to;
    if (overlapsLunch) sugg.push('午饭时间');
    if (usable >= 90) sugg.push('适合去图书馆深度学习');
    else if (usable >= 45) sugg.push('适合写作业 / 复习一节');
    else if (usable >= 25) sugg.push('短休息或处理碎片任务');
    else if (usable > 0) sugg.push('仅够转场，建议直接去下一教室');
    if (usable <= 0) sugg.push('扣掉步行后无可用时间，注意别迟到');
    gaps.push({
      from: min2hm(from), to: min2hm(to), minutes: to - from, usable, walk, buffer,
      before: before.name || null, after: after.name || null,
      beforeLoc: before.location || '', afterLoc: after.location || '',
      suggestions: sugg,
      departure: after.startMin != null ? min2hm(Math.max(from, after.startMin - walk - buffer)) : null,
    });
  }
  return gaps;
}

/* 往返可行性：从当前/上一地点去 dest 停留 stay 分钟，再赶下一节课 */
export function roundTripFeasible(dateStr, dest, stay = 30) {
  const s = getState();
  const list = sessionsOn(dateStr);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const results = [];
  const bounds = [{ endMin: hm2min(s.settings.dayStart), location: '' }, ...list, { startMin: hm2min(s.settings.dayEnd), location: '' }];
  for (let i = 0; i < bounds.length - 1; i++) {
    const before = bounds[i], after = bounds[i + 1];
    const from = Math.max(before.endMin ?? 0, dateStr === todayStr() ? nowMin : 0);
    const to = after.startMin ?? hm2min(s.settings.dayEnd);
    if (to <= from) continue;
    const w1 = walkMinutes(before.location || dest, dest);
    const w2 = walkMinutes(dest, after.location || dest);
    const need = w1 + stay + w2 + s.settings.walkBuffer;
    results.push({
      window: `${min2hm(from)}–${min2hm(to)}`, available: to - from, need,
      ok: need <= to - from,
      latestLeave: min2hm(Math.max(from, to - w2 - s.settings.walkBuffer)),
      afterClass: after.name || null,
    });
  }
  return results;
}

/* ---------- 统计 ---------- */
export function weekStats(week) {
  const sch = activeSchedule();
  const dates = weekDates(week, sch);
  let count = 0, minutes = 0;
  const perCourse = {};
  for (const d of dates) {
    for (const ses of sessionsOn(d)) {
      count++; minutes += ses.endMin - ses.startMin;
      perCourse[ses.name] = (perCourse[ses.name] || 0) + (ses.endMin - ses.startMin);
    }
  }
  return { count, minutes, perCourse, dates };
}

/* ---------- 调课操作 ---------- */
export function cancelSession(courseId, slotId, date, reason = '') {
  const s = getState();
  const exist = s.overrides.find(o => o.courseId === courseId && o.slotId === slotId && o.date === date);
  if (exist) { exist.type = 'cancel'; exist.reason = reason; return exist.id; }
  const ov = { id: uid(), courseId, slotId, date, type: 'cancel', reason };
  s.overrides.push(ov);
  return ov.id;
}
export function moveSession(courseId, slotId, fromDate, { toDate, toStart, toEnd, toLocation }) {
  const s = getState();
  let ov = s.overrides.find(o => o.courseId === courseId && o.slotId === slotId && o.date === fromDate);
  if (!ov) { ov = { id: uid(), courseId, slotId, date: fromDate, type: 'move' }; s.overrides.push(ov); }
  ov.type = 'move';
  if (toDate !== undefined) ov.toDate = toDate;
  if (toStart !== undefined) ov.toStart = toStart;
  if (toEnd !== undefined) ov.toEnd = toEnd;
  if (toLocation !== undefined) ov.toLocation = toLocation;
  return ov.id;
}
export function restoreSession(overrideId) {
  const s = getState();
  s.overrides = s.overrides.filter(o => o.id !== overrideId);
}