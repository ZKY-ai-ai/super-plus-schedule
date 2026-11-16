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
/* ---------- F023 作息按年月日循环 ---------- */
const periods = await import('../web/js/periods.js');
const cal = await import('../web/js/calendar.js');
const tpl = await import('../web/js/templates.js');

assert(periods.isValidMonthDay('11-01') && !periods.isValidMonthDay('02-30') && !periods.isValidMonthDay('13-01'), '月日合法性校验（02-30 / 13-01 非法）');
assert(periods.toMonthDay('2026-11-01') === '11-01', '旧版完整日期规则降级为月日');
const rulesAB = [{ id: 'a', from: '09-01', periodSetId: 'A' }, { id: 'b', from: '11-01', periodSetId: 'B' }];
assert(periods.resolvePeriodSetId(rulesAB, '2026-10-15', 'Z') === 'A', '年度规则：10-15 命中 09-01 规则');
assert(periods.resolvePeriodSetId(rulesAB, '2026-11-02', 'Z') === 'B', '年度规则：11-02 命中 11-01 规则');
assert(periods.resolvePeriodSetId(rulesAB, '2027-03-01', 'Z') === 'B', '年度规则：次年 3 月沿用上一轮最后一条（跨年延续）');
assert(periods.resolvePeriodSetId([], '2026-11-02', 'Z') === 'Z', '无规则时回退到课表绑定作息');
const norm = periods.normalizePeriodRules([
  { from: '11-01', periodSetId: 'B' }, { from: '2026-09-01', periodSetId: 'A' },
  { from: '11-01', periodSetId: 'A' }, { from: '02-30', periodSetId: 'A' }, { from: '05-01', periodSetId: '不存在' },
], ['A', 'B'], '2026-09-07', null);
assert(norm.length === 2 && norm[0].from === '09-01' && norm[1].from === '11-01', '规则归一化：去重、排序、剔除非法月日与失效作息');

const summerId = sch.periodSetId;
const winterPeriods = store.defaultPeriods().map(p => ({
  p: p.p, start: store.min2hm(store.hm2min(p.start) + 30), end: store.min2hm(store.hm2min(p.end) + 30),
}));
store.mutate(st => {
  st.settings.periodSets.push({ id: 'ps-winter', name: '冬季作息', periods: winterPeriods });
  st.schedules.find(x => x.id === sch.id).periodRules = [
    { id: 'r-summer', from: '09-01', periodSetId: summerId },
    { id: 'r-winter', from: '11-01', periodSetId: 'ps-winter' },
  ];
});
assert(sched.sessionsOn('2026-10-19')[0].start === '08:00', '10 月课次用夏季作息（08:00）');
assert(sched.sessionsOn('2026-11-09')[0].start === '08:30', '11 月课次自动切到冬季作息（08:30）');
store.mutate(st => { st.schedules.find(x => x.id === sch.id).periodRules = [{ id: 'r-winter', from: '11-04', periodSetId: 'ps-winter' }]; });
assert(sched.sessionsOn('2026-11-02')[0].start === '08:30', '切换日落在周中时整周采用新方案（11-02 周一已用冬季作息）');
assert(periods.periodSetForWeek('2026-11-02', store.activeSchedule(), store.getState().settings.periodSets).id === 'ps-winter', '整周作息解析以该教学周最后一天为准');
store.mutate(st => {
  st.schedules.find(x => x.id === sch.id).periodRules = [];
  st.settings.periodSets = st.settings.periodSets.filter(p => p.id !== 'ps-winter');
});
assert(sched.sessionsOn('2026-11-09')[0].start === '08:00', '清空规则后回到绑定作息');

/* ---------- F026/F027/F029 节假日、调休映射、逐日覆盖 ---------- */
assert(cal.isHoliday('2026-10-01', {}) && !cal.isHoliday('2026-10-08', {}), '内置节假日判定（国庆 10-01 休、10-08 正常）');
assert(cal.isHoliday('2026-10-01', {}, false) === false, '关闭自动校历后不再停课');
const thuW4 = '2026-10-01';
assert(sched.weekOf(thuW4) === 4 && sched.sessionsOn(thuW4).length === 0, '法定节假日当天课次自动清空（第4周周四国庆）');
assert(sched.sessionsOn('2026-09-24').length > 0, '非假日的同一星期仍有课（对照）');
store.mutate(st => { st.settings.customDays['2026-10-01'] = { kind: 'normal', name: '学校调课', mapTo: null }; });
assert(sched.sessionsOn(thuW4).length > 0, '逐日覆盖为「正常上课」后假日恢复上课（F029）');
store.mutate(st => { delete st.settings.customDays['2026-10-01']; });
assert(sched.sessionsOn(thuW4).length === 0, '删除覆盖后回到内置停课');

const satMakeup = '2026-10-10';
assert(cal.dayInfo(satMakeup, {}).kind === 'workday', '内置调休上班日判定（10-10 班）');
assert(sched.sessionsOn(satMakeup).length === 0, '调休上班日未指定映射时不借用其他星期课表');
store.mutate(st => { st.settings.customDays[satMakeup] = { kind: 'workday', name: '国庆调休', mapTo: 1 }; });
const satList = sched.sessionsOn(satMakeup);
store.mutate(st => { st.settings.autoHolidays = false; }, { undoable: false });
const monW5raw = sched.sessionsOn('2026-10-05'); // 10-05 本身是国庆假日，关掉校历才取得到周一规则
store.mutate(st => { st.settings.autoHolidays = true; }, { undoable: false });
assert(satList.length === monW5raw.length && satList.length > 0, '调休映射：周六按周一课表上课（F027）');
assert(satList[0].day === 6 && satList[0].makeupFrom === 1, '调休课次保留真实星期六并标记映射来源');
assert(cal.visibleDays(sched.weekDates(5), false, true, store.getState().settings.customDays).includes(6), '周视图自动补进调休上班的周六');
assert(!cal.visibleDays(sched.weekDates(5), false, false, {}).includes(6), '关闭自动校历后不额外显示周六');
const sum5 = cal.weekSummary(sched.weekDates(4), true, {});
assert(sum5.holidays.includes('国庆节'), '一周校历摘要列出节假日名称');
store.mutate(st => { delete st.settings.customDays[satMakeup]; });

/* ---------- F130 课表模板 ---------- */
assert(tpl.BUILTIN_TEMPLATES.length === 5 && tpl.BUILTIN_TEMPLATES[0].courses.length === 0, '内置模板 5 套，空白模板无课程');
const stem = tpl.BUILTIN_TEMPLATES.find(t => t.id === 'stem');
const inst = tpl.instantiate(stem, sch.id, 20);
assert(inst.length === 5 && inst[0].slots.length === 2, '理工科模板实例化 5 门课、首门 2 个时段');
assert(inst.every(c => c.scheduleId === sch.id && c.slots.every(x => x.weeks.to === 16)), '模板课程绑定当前课表且默认 1–16 周');
assert(tpl.instantiate(stem, sch.id, 10)[0].slots[0].weeks.to === 10, '教学周数不足 16 时模板周次自动收敛');
const saved = tpl.saveCurrentAsTemplate('测试模板', { withAppearance: true });
assert(store.getState().templates.some(t => t.id === saved.id) && saved.courses.length === 8, '当前课表可存为模板（含 8 门课程）');
assert(saved.appearance && typeof saved.appearance.radius === 'number', '模板可携带外观设置');
assert(tpl.allTemplates().length === 6, '模板库 = 内置 5 + 自建 1');
store.mutate(st => { st.templates = st.templates.filter(t => t.id !== saved.id); });

/* ---------- F135 课程别名开关 ---------- */
store.mutate(st => { st.courses.find(c => c.name.startsWith('高等数学')).alias = '高数'; });
assert(sched.sessionsOn('2026-11-09')[0].name === '高数', '开启别名时课次显示别名');
store.mutate(st => { st.settings.showAlias = false; }, { undoable: false });
assert(sched.sessionsOn('2026-11-09')[0].name.startsWith('高等数学'), '关闭别名时课次显示课程全名');
store.mutate(st => { st.settings.showAlias = true; st.courses.find(c => c.alias === '高数').alias = ''; }, { undoable: false });

/* ---------- F140 快捷键描述 ---------- */
const cmds = await import('../web/js/commands.js');
assert(cmds.comboLabel('Mod+k') === 'Ctrl/⌘ + K', '快捷键组合可读化（Mod+k）');
assert(cmds.comboLabel('ArrowLeft') === '←', '方向键快捷键可读化');
assert(cmds.buildCommands({ nav: () => {} }).length >= 20, '命令面板命令数不少于 20');
