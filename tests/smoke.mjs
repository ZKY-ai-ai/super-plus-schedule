/* 课隙 CourseGap 核心逻辑冒烟测试（Node 运行：node tests/smoke.mjs）
   仅测试纯逻辑模块，不涉及浏览器 DOM。 */
globalThis.localStorage = {
  _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok -', msg); };

const store = await import('../web/js/store.js');
const sched = await import('../web/js/schedule.js');
const ie = await import('../web/js/importexport.js');
const ai = await import('../web/js/ai.js');

store.loadState();
store.loadSample();
const s = store.getState();
const sch = store.activeSchedule();

assert(s.courses.length === 8, '示例数据加载 8 门课程');
assert(sch.semesterStart && sched.weekOf(sch.semesterStart) === 1, '开学日为第 1 教学周');

// 周次展开：第1周周一只有高数（线代双周、Python 3-14周）
const mon1 = sched.dateOfWeekDay(1, 1);
const list1 = sched.sessionsOn(mon1);
assert(list1.length === 1 && list1[0].name.startsWith('高等数学'), '第1周周一仅高数（单双周/起止周过滤正确）');
const mon2 = sched.dateOfWeekDay(2, 1);
const list2 = sched.sessionsOn(mon2);
assert(list2.length === 2, '第2周周一高数+线代（双周）');

// 节次时间
assert(list1[0].start === '08:00' && list1[0].end === '09:40', '连堂 1-2 节时间正确（08:00–09:40）');

// 冲突检测
store.mutate(st => {
  st.courses.push({ id: 'test-conflict', scheduleId: sch.id, name: '冲突测试课', teacher: '', location: '', color: 9, notes: '', slots: [{ id: 'tc-slot', day: 1, start: 1, end: 2, weeks: { type: 'range', from: 1, to: 16, parity: 'all' } }] });
});
assert(sched.conflictsOn(mon1).length >= 1, '重叠课程冲突被检出');
store.mutate(st => { st.courses = st.courses.filter(c => c.id !== 'test-conflict'); });

// 单次停课与恢复
const gaoshu = s.courses.find(c => c.name.startsWith('高等数学'));
const slot0 = gaoshu.slots[0];
store.mutate(() => sched.cancelSession(gaoshu.id, slot0.id, mon1));
assert(sched.sessionsOn(mon1).length === 0, '单次停课后当日课次消失');
assert(sched.sessionsOn(mon2).length === 2, '停课不影响其他周');
store.undo();
assert(sched.sessionsOn(mon1).length === 1, '撤销恢复停课');

// 单次调课
store.mutate(() => sched.moveSession(gaoshu.id, slot0.id, mon1, { toDate: sched.dateOfWeekDay(1, 2), toStart: 5, toEnd: 6 }));
assert(sched.sessionsOn(mon1).length === 0, '调课后原日期无课');
const tue1 = sched.sessionsOn(sched.dateOfWeekDay(1, 2));
assert(tue1.some(x => x.moved && x.start === '14:00'), '调课课次出现在目标日期第5节');
store.undo();

// 空档
const gaps = sched.gapsOn(mon2);
assert(gaps.length >= 1 && gaps.every(g => g.usable <= g.minutes), '空档分析：可用时间不超过总长');
const rt = sched.roundTripFeasible(mon2, '图书馆', 30);
assert(rt.length >= 1 && rt.every(r => typeof r.ok === 'boolean'), '往返可行性计算返回结果');

// ICS 导出
const ics = ie.buildICS();
assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('RRULE:FREQ=WEEKLY'), 'ICS 含周重复规则');
assert(ics.includes('INTERVAL=2'), '单双周课程导出 INTERVAL=2');

// 导入解析
assert(JSON.stringify(ie.parseWeeks('1-16单')) === JSON.stringify({ type: 'range', from: 1, to: 16, parity: 'odd' }), '周次字符串解析：1-16单');
const csv = '课程名称,教师,教室,星期,开始节次,结束节次,周次\n测试导入课,测试师,教九-101,2,3,4,1-8双';
const parsedCSV = ie.parseImport(csv, 'x.csv');
assert(parsedCSV.courses.length === 1 && parsedCSV.courses[0].slots[0].weeks.parity === 'even', 'CSV 导入解析正确');
const wakeup = JSON.stringify({ courseInfos: [{ name: 'WakeUp测试', teacher: 'T', location: 'L', day: 3, start: 1, step: 2, weeks: [1, 3, 5, 7] }] });
const parsedWU = ie.parseImport(wakeup, 'x.json');
assert(parsedWU.courses[0].slots[0].weeks.parity === 'odd' && parsedWU.courses[0].slots[0].end === 2, 'WakeUp 风格 JSON 解析（step→连堂，周次数组→单周）');

// ICS 导入
const icsIn = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:ICS测试课
LOCATION:教五-101
DTSTART:20260908T100000
DTEND:20260908T114000
RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL20261229T114000
END:VEVENT
END:VCALENDAR`.replace('UNTIL20261229', 'UNTIL=20261229');
const parsedICS = ie.parseImport(icsIn, 'x.ics');
assert(parsedICS.courses.length === 1 && parsedICS.courses[0].slots[0].day === 2, 'ICS 导入解析（周二）');

// AI 本地规则
assert(ai.resolveDate('明天') === store.dadd(store.todayStr(), 1), 'AI 日期解析：明天');
const ans = ai.localAnswer('今天有什么课');
assert(typeof ans === 'string' && ans.length > 0, 'AI 本地回答：今天有什么课');
const ans2 = ai.localAnswer('最近有什么考试');
assert(ans2.includes('数据结构期中'), 'AI 本地回答：考试查询');
const ans3 = ai.localAnswer('这周上多少节课');
assert(/第 \d+ 周共 \d+ 节课/.test(ans3), 'AI 本地回答：周统计');

// 备份往返
const backup = store.exportBackup();
store.importBackup(backup);
assert(store.getState().courses.length === s.courses.length, '完整备份导出/恢复往返一致');

console.log(process.exitCode ? '\n存在失败用例' : '\n全部通过');