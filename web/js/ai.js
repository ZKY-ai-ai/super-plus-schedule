/* ============================================================
   ai.js — AI 助手
   两层能力：
   1) 本地规则解析（离线可用，不发送任何数据）：查课、查考试、
      查 DDL、查空档、下一节课、周统计。
   2) 可选大模型增强：用户在设置中配置 OpenAI 兼容接口后，
      模糊问题交给模型回答；课表截图识别需要视觉模型。
      密钥仅存本机，请求仅发往用户自己配置的接口。
   ============================================================ */
import { getState, activeSchedule, scheduleCourses, todayStr, dadd, dparse, dstr, weekdayCN, mdCN, hm2min } from './store.js';
import { sessionsOn, nowStatus, gapsOn, weekOf, currentWeek, weekStats, roundTripFeasible, walkMinutes } from './schedule.js';
import { parseImport } from './importexport.js';

/* ---------- 日期表达解析 ---------- */
export function resolveDate(text) {
  const t = todayStr();
  if (/大后天/.test(text)) return dadd(t, 3);
  if (/后天/.test(text)) return dadd(t, 2);
  if (/明天|明日/.test(text)) return dadd(t, 1);
  if (/昨天/.test(text)) return dadd(t, -1);
  if (/今天|今日/.test(text)) return t;
  const sch = activeSchedule();
  const wdMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  let m = text.match(/(下下|下|本|这)?周([一二三四五六日天])/);
  if (m) {
    const offsetWeek = m[1] === '下' ? 1 : m[1] === '下下' ? 2 : 0;
    const targetWd = wdMap[m[2]];
    const todayWd = ((dparse(t).getDay() + 6) % 7) + 1;
    let delta = targetWd - todayWd + offsetWeek * 7;
    if (offsetWeek === 0 && delta < 0 && /周/.test(text) && !/本周|这周/.test(text)) delta += 7; // “周五”默认指未来的周五
    return dadd(t, delta);
  }
  m = text.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (m) {
    const y = dparse(t).getFullYear();
    return dstr(new Date(y, +m[1] - 1, +m[2]));
  }
  return null;
}

function partOfDay(text) {
  if (/上午|早上|早晨/.test(text)) return { label: '上午', from: 0, to: 12 * 60 };
  if (/下午|中午/.test(text)) return { label: '下午', from: 12 * 60, to: 18 * 60 };
  if (/晚上|晚间/.test(text)) return { label: '晚上', from: 18 * 60, to: 24 * 60 };
  return null;
}

function fmtSessions(list, dateStr) {
  if (!list.length) return `${mdCN(dateStr)}（${weekdayCN(dateStr)}）没有课。`;
  const lines = list.map(s => `· ${s.start}–${s.end}  ${s.name}${s.location ? ' @ ' + s.location : ''}${s.teacher ? '（' + s.teacher + '）' : ''}${s.moved ? ' [调课]' : ''}`);
  return `${mdCN(dateStr)}（${weekdayCN(dateStr)}）共 ${list.length} 节课：\n${lines.join('\n')}`;
}

/* ---------- 本地规则回答 ---------- */
export function localAnswer(text) {
  const s = getState();
  const q = text.trim();
  const date = resolveDate(q) || todayStr();
  const part = partOfDay(q);
  const filterPart = list => part ? list.filter(x => x.startMin < part.to && x.endMin > part.from) : list;

  // 往返可行性：去某地来得及吗
  const trip = q.match(/去(.{1,12}?)(?:再回来|往返|来回)?(?:来得及|赶得上|可行|可以吗|行吗|够吗)/);
  if (trip) {
    const dest = trip[1].replace(/[，。？?]/g, '');
    const results = roundTripFeasible(date, dest, 30).filter(r => r.available >= 20);
    if (!results.length) return `${mdCN(date)}没有足够长的空档评估去「${dest}」的往返。`;
    const lines = results.map(r => `· ${r.window}：可用 ${r.available} 分钟，往返+停留30分钟约需 ${r.need} 分钟 → ${r.ok ? '来得及' : '来不及'}${r.ok ? `（最晚 ${r.latestLeave} 从${dest}出发返回）` : ''}`);
    return `去「${dest}」的往返评估（${mdCN(date)}，步行按设置估算）：\n${lines.join('\n')}`;
  }

  // 空档 / 有空吗
  if (/空档|空闲|有空|没课的时间|自由时间|自习|图书馆/.test(q) && !/几节|多少节/.test(q)) {
    const gaps = gapsOn(date);
    if (!gaps.length) return `${mdCN(date)}（${weekdayCN(date)}）几乎没有可用空档。`;
    const lines = gaps.map(g => `· ${g.from}–${g.to}（${g.minutes} 分钟，扣除步行/缓冲后可用 ${g.usable} 分钟）${g.suggestions.join('；')}${g.departure ? `，下一节最晚 ${g.departure} 出发` : ''}`);
    return `${mdCN(date)}（${weekdayCN(date)}）的空档：\n${lines.join('\n')}`;
  }

  // 下一节 / 现在
  if (/下一节|下节|接下来|现在.*课|正在上/.test(q)) {
    const st = nowStatus(date);
    const lines = [];
    if (date === todayStr()) {
      lines.push(st.current ? `正在上：${st.current.name}（${st.current.start}–${st.current.end}${st.current.location ? ' @ ' + st.current.location : ''}）` : '现在没有正在上的课。');
    }
    if (st.next) {
      const walk = st.current ? walkMinutes(st.current.location, st.next.location) : s.settings.walkDefault;
      lines.push(`下一节：${st.next.name} ${st.next.start} 开始${st.next.location ? ' @ ' + st.next.location : ''}，建议最晚 ${fmtHM(st.next.startMin - walk - s.settings.walkBuffer)} 出发（步行约 ${walk} 分钟）。`);
    } else lines.push('后面没有课了。');
    return lines.join('\n');
  }

  // 考试
  if (/考试|考场|监考/.test(q)) {
    const upcoming = s.exams.filter(e => e.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    if (/倒计时|还有多久|几天/.test(q) && upcoming.length) {
      const e = upcoming[0];
      const days = Math.round((dparse(e.date) - dparse(todayStr())) / 86400000);
      return `最近一场：${e.name}，${mdCN(e.date)} ${e.start}${e.location ? ' @ ' + e.location : ''}，还有 ${days} 天。`;
    }
    if (!upcoming.length) return '目前没有登记未来的考试。可在「考试」页添加。';
    return '接下来的考试：\n' + upcoming.slice(0, 8).map(e => `· ${mdCN(e.date)}（${weekdayCN(e.date)}）${e.start}–${e.end}  ${e.name}${e.location ? ' @ ' + e.location : ''}${e.seat ? ' 座位 ' + e.seat : ''}`).join('\n');
  }

  // 作业 / DDL
  if (/作业|任务|ddl|截止|due|待办/i.test(q)) {
    const open = s.tasks.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    if (!open.length) return '目前没有未完成的任务。';
    const dayEnd = dadd(date, /本周|这周/.test(q) ? 7 : 0) + 'T23:59';
    const scoped = /今天|今日|明天|本周|这周/.test(q) ? open.filter(t => t.due && t.due <= dayEnd && (/明天/.test(q) ? t.due >= dadd(todayStr(), 1) : t.due >= todayStr())) : open;
    if (!scoped.length) return '该时间范围内没有截止的任务。';
    return '待办任务（按截止时间）：\n' + scoped.slice(0, 10).map(t => {
      const course = s.courses.find(c => c.id === t.courseId);
      const dueDate = t.due ? t.due.slice(0, 10) : '无截止';
      const overdue = t.due && t.due < todayStr() + 'T00:00';
      return `· [${t.priority === 'high' ? '高' : t.priority === 'mid' ? '中' : '低'}] ${t.title}${course ? '（' + course.name + '）' : ''} — ${dueDate === todayStr() ? '今天' : mdCN(dueDate)}截止${overdue ? '【已逾期】' : ''}`;
    }).join('\n');
  }

  // 周统计
  if (/多少节|几节|统计|课时/.test(q)) {
    const w = /下周/.test(q) ? currentWeek() + 1 : currentWeek();
    const st = weekStats(w);
    const top = Object.entries(st.perCourse).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return `第 ${w} 周共 ${st.count} 节课、约 ${Math.round(st.minutes / 60 * 10) / 10} 小时。课时最多：\n${top.map(([n, m]) => `· ${n}：${Math.round(m / 60 * 10) / 10} 小时`).join('\n') || '（本周无课）'}`;
  }

  // 查课（默认）
  if (/课|上课|课程|安排|忙不忙|有没有/.test(q) || resolveDate(q)) {
    let list = sessionsOn(date);
    list = filterPart(list);
    let head = fmtSessions(list, date);
    if (part) head = head.replace('共', `${part.label}共`);
    if (!list.length && part) head = `${mdCN(date)}（${weekdayCN(date)}）${part.label}没有课。`;
    return head;
  }

  return null; // 交给模型或提示
}

function fmtHM(min) {
  const v = Math.max(0, min);
  return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

/* ---------- 数据上下文（发给用户自配模型时使用） ---------- */
export function buildContext() {
  const s = getState();
  const sch = activeSchedule();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = dadd(todayStr(), i);
    days.push({
      date: d, weekday: weekdayCN(d),
      classes: sessionsOn(d).map(x => ({ name: x.name, start: x.start, end: x.end, location: x.location, teacher: x.teacher, moved: !!x.moved })),
    });
  }
  return {
    today: todayStr(), semester: { name: sch.name, start: sch.semesterStart, weeks: sch.totalWeeks, currentWeek: currentWeek() },
    next7days: days,
    exams: s.exams.filter(e => e.date >= todayStr()).slice(0, 12),
    openTasks: s.tasks.filter(t => !t.done).slice(0, 20).map(t => ({ title: t.title, due: t.due, priority: t.priority, course: (s.courses.find(c => c.id === t.courseId) || {}).name })),
    walk: { defaultMinutes: s.settings.walkDefault, buffer: s.settings.walkBuffer, matrix: s.settings.walkMatrix },
  };
}

/* ---------- 可选：OpenAI 兼容接口 ---------- */
export function aiConfigured() {
  const ai = getState().settings.ai;
  return !!(ai.enabled && ai.endpoint && ai.apiKey && ai.model);
}

export async function askModel(question, history = []) {
  const ai = getState().settings.ai;
  const sys = `你是「课隙 CourseGap」的校园课表助手。以下是用户本机数据（JSON），只依据这些数据回答，不要编造课程或时间；数据里没有的就说没有。回答用简体中文，简洁分行。涉及步行时间按 walk 设置估算。当前时间：${new Date().toLocaleString('zh-CN')}。\n用户数据：\n${JSON.stringify(buildContext())}`;
  const messages = [
    { role: 'system', content: sys },
    ...history.slice(-6),
    { role: 'user', content: question },
  ];
  const url = ai.endpoint.replace(/\/+$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
    body: JSON.stringify({ model: ai.model, messages, temperature: 0.2 }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`模型接口返回 ${resp.status}：${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('模型未返回内容');
  return content;
}

/* ---------- 可选：截图识课（视觉模型） ---------- */
export async function recognizeScheduleImage(dataURL) {
  const ai = getState().settings.ai;
  if (!aiConfigured()) throw new Error('截图识别需要先在「设置 → AI」配置接口与视觉模型');
  const model = ai.visionModel || ai.model;
  const prompt = `这是一张大学课表截图。请提取全部课程，严格只输出 JSON（不要 markdown 代码块），格式：
{"app":"coursegap-courses","courses":[{"name":"课程名","teacher":"教师或空串","location":"教室或空串","slots":[{"day":1,"start":1,"end":2,"weeks":{"type":"range","from":1,"to":16,"parity":"all"}}]}]}
规则：day 1=周一…7=周日；start/end 是节次序号（从图中节次推断，连堂课合并为一个 slot）；单周 parity="odd"，双周 "even"，逐周不连续用 {"type":"list","weeks":[1,3,5]}；同一课程多个时段放多个 slot；图中信息缺失的字段留空串，不要编造。`;
  const url = ai.endpoint.replace(/\/+$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataURL } }] }],
      temperature: 0,
    }),
  });
  if (!resp.ok) throw new Error(`视觉接口返回 ${resp.status}`);
  const data = await resp.json();
  let content = data.choices?.[0]?.message?.content || '';
  content = content.replace(/```json/gi, '').replace(/```/g, '').trim();
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('模型未返回可解析的 JSON');
  const parsed = parseImport(m[0], 'ai.json');
  parsed.source = 'AI 截图识别（结果需人工核对）';
  parsed.warnings.unshift('AI 识别可能出错：导入前请逐行核对课程、节次与周次。');
  return parsed;
}

/* ---------- 统一入口 ---------- */
export async function answer(question, history = []) {
  const local = localAnswer(question);
  if (local != null && !aiConfigured()) return { text: local, source: '本地规则解析 · 离线，未发送任何数据' };
  if (aiConfigured()) {
    try {
      const text = await askModel(question, history);
      return { text, source: '模型生成 · 请核对关键信息' };
    } catch (e) {
      if (local != null) return { text: local + `\n\n（模型调用失败：${e.message}，已回退本地解析）`, source: '本地规则解析（模型不可用）' };
      throw e;
    }
  }
  return {
    text: '这个问题本地规则暂时无法理解。你可以试试：\n· 明天有什么课 / 周三下午有课吗\n· 下一节课什么时候 / 最晚几点出发\n· 最近有什么考试 / 高数什么时候考\n· 今天有哪些作业要交\n· 明天下午有空吗 / 去图书馆来得及吗\n· 这周上多少节课\n也可以在「设置 → AI」配置大模型接口，解锁自由问答与截图识课。',
    source: '本地规则解析 · 离线',
  };
}