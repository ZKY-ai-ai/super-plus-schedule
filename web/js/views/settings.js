/* ============================================================
   views/settings.js — 设置：学期/课表、作息、校园步行、提醒、
   外观、AI、数据备份、关于与致谢
   ============================================================ */
import {
  getState, mutate, activeSchedule, uid, todayStr, defaultPeriods,
  exportBackup, importBackup, loadSample, hm2min, min2hm,
} from '../store.js';
import { el, toast, modal, confirmModal, download, readFile, ico } from '../ui.js';
import { exportCoursesJSON, exportCSVTemplate } from '../importexport.js';

export function renderSettings(root, nav) {
  const s = getState();
  root.innerHTML = '';
  root.append(el('div', { class: 'view-head' },
    el('div', {}, el('h2', {}, '设置'), el('p', { class: 'sub' }, '所有数据仅保存在本机浏览器（localStorage），无账号、无云端上传'))));

  /* ---------- 学期与课表 ---------- */
  const schCard = el('div', { class: 'card' }, el('h3', {}, '学期与课表'));
  s.schedules.forEach(sch => {
    const nameI = el('input', { class: 'input', value: sch.name, style: { maxWidth: '180px' } });
    nameI.addEventListener('change', () => mutate(st => { st.schedules.find(x => x.id === sch.id).name = nameI.value.trim() || '未命名课表'; }));
    const startI = el('input', { class: 'input', type: 'date', value: sch.semesterStart, style: { width: 'auto' } });
    startI.addEventListener('change', () => { if (startI.value) mutate(st => { st.schedules.find(x => x.id === sch.id).semesterStart = startI.value; }); });
    const weeksI = el('input', { class: 'input', type: 'number', min: 1, max: 40, value: sch.totalWeeks, style: { width: '76px' } });
    weeksI.addEventListener('change', () => mutate(st => { st.schedules.find(x => x.id === sch.id).totalWeeks = Math.max(1, Math.min(40, +weeksI.value || 20)); }));
    const wsSel = el('select', { class: 'input', style: { width: 'auto' } },
      el('option', { value: 1, selected: (sch.weekStart || 1) === 1 }, '周一开始'),
      el('option', { value: 7, selected: sch.weekStart === 7 }, '周日开始'));
    wsSel.addEventListener('change', () => mutate(st => { st.schedules.find(x => x.id === sch.id).weekStart = +wsSel.value; }));
    const psSel = el('select', { class: 'input', style: { width: 'auto' } },
      s.settings.periodSets.map(p => el('option', { value: p.id, selected: p.id === sch.periodSetId }, p.name)));
    psSel.addEventListener('change', () => mutate(st => { st.schedules.find(x => x.id === sch.id).periodSetId = psSel.value; }));
    const isActive = sch.id === s.activeScheduleId;
    schCard.append(el('div', { class: 'card', style: { boxShadow: 'none', marginBottom: '8px', borderColor: isActive ? 'var(--site-accent)' : 'var(--site-border)' } },
      el('div', { class: 'row spread mb' },
        el('div', { class: 'row' }, nameI, isActive ? el('span', { class: 'chip accent' }, '当前') : el('button', { class: 'btn sm', onclick: () => mutate(st => { st.activeScheduleId = sch.id; }) }, '切换到此课表')),
        s.schedules.length > 1 ? el('button', {
          class: 'btn sm danger', onclick: () => confirmModal('删除课表', `删除「${sch.name}」及其课程、调课记录？任务与考试不受影响。`, () => {
            mutate(st => {
              const ids = new Set(st.courses.filter(c => c.scheduleId === sch.id).map(c => c.id));
              st.courses = st.courses.filter(c => !ids.has(c.id));
              st.overrides = st.overrides.filter(o => !ids.has(o.courseId));
              st.schedules = st.schedules.filter(x => x.id !== sch.id);
              if (st.activeScheduleId === sch.id) st.activeScheduleId = st.schedules[0].id;
            });
            toast('课表已删除');
          }, { danger: true, yesLabel: '删除' }),
        }, '删除') : null),
      el('div', { class: 'row' },
        el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, '开学日期'), startI),
        el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, '教学周数'), weeksI),
        el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, '周起始'), wsSel),
        el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, '绑定作息'), psSel))));
  });
  schCard.append(el('button', {
    class: 'btn sm', onclick: () => mutate(st => {
      const id = uid();
      st.schedules.push({ id, name: `新课表 ${st.schedules.length + 1}`, semesterStart: activeSchedule().semesterStart, totalWeeks: 20, weekStart: 1, periodSetId: st.settings.periodSets[0].id });
      st.activeScheduleId = id;
    }),
  }, '+ 新建课表（多学期/多课表并存）'));
  root.append(schCard);

  /* ---------- 作息 ---------- */
  const psCard = el('div', { class: 'card' }, el('h3', {}, '作息时间表'),
    el('p', { class: 'small muted mb' }, '每套作息独立保存，可绑定到不同课表；支持按课时长度一键生成。'));
  s.settings.periodSets.forEach(ps => {
    const row = el('div', { class: 'row spread', style: { padding: '6px 0', borderBottom: '1px dashed var(--site-border)' } },
      el('div', {}, el('b', {}, ps.name), el('span', { class: 'muted small' }, ` · ${ps.periods.length} 节 · ${ps.periods[0]?.start || ''} 起`)),
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', onclick: () => periodSetModal(ps.id) }, '编辑'),
        s.settings.periodSets.length > 1 ? el('button', {
          class: 'btn sm danger', onclick: () => {
            if (s.schedules.some(x => x.periodSetId === ps.id)) { toast('有课表正在使用这套作息，不能删除', 'err'); return; }
            mutate(st => { st.settings.periodSets = st.settings.periodSets.filter(x => x.id !== ps.id); });
          },
        }, '删除') : null));
    psCard.append(row);
  });
  psCard.append(el('div', { class: 'row mt' },
    el('button', { class: 'btn sm', onclick: () => periodSetModal(null) }, '+ 新建作息'),
    el('button', { class: 'btn sm', onclick: generatePeriodsModal }, '按课时长度自动生成')));
  root.append(psCard);

  /* ---------- 校园与步行 ---------- */
  const walkCard = el('div', { class: 'card' }, el('h3', {}, '校园与步行'),
    el('p', { class: 'small muted mb' }, '空档分析用这些数据估算转场时间。楼栋名会自动从教室字段前缀匹配（如「教一-201」→「教一」）。'));
  const num = (label, key, min = 0, max = 120) => {
    const i = el('input', { class: 'input', type: 'number', min, max, value: s.settings[key], style: { width: '80px' } });
    i.addEventListener('change', () => mutate(st => { st.settings[key] = Math.max(min, Math.min(max, +i.value || 0)); }, { undoable: false }));
    return el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, label), i);
  };
  const time = (label, get, set) => {
    const i = el('input', { class: 'input', type: 'time', value: get(getState()), style: { width: 'auto' } });
    i.addEventListener('change', () => mutate(st => { set(st, i.value); }, { undoable: false }));
    return el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, label), i);
  };
  walkCard.append(el('div', { class: 'row mb' },
    num('默认步行（分钟）', 'walkDefault'), num('收拾/缓冲（分钟）', 'walkBuffer'),
    time('午饭开始', st => st.settings.lunch.start, (st, v) => { st.settings.lunch.start = v; }),
    time('午饭结束', st => st.settings.lunch.end, (st, v) => { st.settings.lunch.end = v; }),
    time('每日起始', st => st.settings.dayStart, (st, v) => { st.settings.dayStart = v; }),
    time('每日结束', st => st.settings.dayEnd, (st, v) => { st.settings.dayEnd = v; })));

  const bWrap = el('div', { class: 'row mb' });
  const renderBuildings = () => {
    bWrap.innerHTML = '';
    getState().buildings.forEach((b, i) => {
      bWrap.append(el('span', { class: 'chip' }, b.name,
        el('button', { class: 'btn sm ghost', style: { padding: '0 2px' }, onclick: () => mutate(st => { st.buildings.splice(i, 1); }) }, '×')));
    });
    const addI = el('input', { class: 'input', placeholder: '添加楼栋，如：图书馆', style: { width: '160px' } });
    addI.addEventListener('keydown', e => {
      if (e.key === 'Enter' && addI.value.trim()) {
        mutate(st => { if (!st.buildings.some(b => b.name === addI.value.trim())) st.buildings.push({ name: addI.value.trim() }); });
        renderBuildings();
      }
    });
    bWrap.append(addI);
  };
  renderBuildings();
  walkCard.append(el('p', { class: 'small muted' }, '楼栋列表（回车添加）：'), bWrap);

  const matrixWrap = el('div', {});
  const renderMatrix = () => {
    matrixWrap.innerHTML = '';
    const entries = Object.entries(getState().settings.walkMatrix);
    if (!entries.length) matrixWrap.append(el('p', { class: 'small muted' }, '暂无楼栋间步行时间，全部使用默认值。'));
    entries.forEach(([k, v]) => {
      const i = el('input', { class: 'input', type: 'number', min: 0, max: 120, value: v, style: { width: '70px' } });
      i.addEventListener('change', () => mutate(st => { st.settings.walkMatrix[k] = Math.max(0, +i.value || 0); }, { undoable: false }));
      matrixWrap.append(el('div', { class: 'row', style: { padding: '3px 0' } },
        el('span', { class: 'small', style: { minWidth: '160px' } }, k.replace('|', ' ↔ ')), i, el('span', { class: 'muted small' }, '分钟'),
        el('button', { class: 'btn sm ghost', onclick: () => { mutate(st => { delete st.settings.walkMatrix[k]; }, { undoable: false }); renderMatrix(); } }, '移除')));
    });
    const bs = getState().buildings;
    if (bs.length >= 2) {
      const aSel = el('select', { class: 'input', style: { width: 'auto' } }, bs.map(b => el('option', { value: b.name }, b.name)));
      const bSel = el('select', { class: 'input', style: { width: 'auto' } }, bs.map((b, i) => el('option', { value: b.name, selected: i === 1 }, b.name)));
      const mI = el('input', { class: 'input', type: 'number', min: 0, value: 8, style: { width: '70px' } });
      matrixWrap.append(el('div', { class: 'row mt' }, aSel, el('span', { class: 'muted small' }, '↔'), bSel, mI, el('span', { class: 'muted small' }, '分钟'),
        el('button', {
          class: 'btn sm', onclick: () => {
            if (aSel.value === bSel.value) { toast('请选择两个不同楼栋', 'err'); return; }
            mutate(st => { st.settings.walkMatrix[[aSel.value, bSel.value].sort().join('|')] = Math.max(0, +mI.value || 0); }, { undoable: false });
            renderMatrix();
          },
        }, '添加')));
    }
  };
  renderMatrix();
  walkCard.append(el('p', { class: 'small muted mt' }, '楼栋间步行时间：'), matrixWrap);
  root.append(walkCard);

  /* ---------- 提醒与外观 ---------- */
  const remindCard = el('div', { class: 'card' }, el('h3', {}, '提醒与外观'));
  const beforeI = el('input', { class: 'input', type: 'number', min: 0, max: 120, value: s.settings.remindBefore, style: { width: '80px' } });
  beforeI.addEventListener('change', () => mutate(st => { st.settings.remindBefore = Math.max(0, +beforeI.value || 0); }, { undoable: false }));
  const ddlCb = el('input', { type: 'checkbox', checked: s.settings.ddlRemind, style: { accentColor: 'var(--site-accent)' } });
  ddlCb.addEventListener('change', () => mutate(st => { st.settings.ddlRemind = ddlCb.checked; }, { undoable: false }));
  const themeSel = el('select', { class: 'input', style: { width: 'auto' } },
    [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, l]) => el('option', { value: v, selected: s.settings.theme === v }, l)));
  themeSel.addEventListener('change', () => mutate(st => { st.settings.theme = themeSel.value; }, { undoable: false }));
  const notifBtn = el('button', {
    class: 'btn sm', onclick: async () => {
      if (!('Notification' in window)) { toast('当前浏览器不支持系统通知', 'err'); return; }
      const p = await Notification.requestPermission();
      mutate(st => { st.settings.notifications = p === 'granted'; }, { undoable: false });
      toast(p === 'granted' ? '已开启系统通知（页面打开期间生效）' : '通知权限未授予');
    },
  }, s.settings.notifications ? '系统通知已开启' : '开启系统通知');
  remindCard.append(el('div', { class: 'row' },
    el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, '课前提前（分钟）'), beforeI),
    el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, 'DDL 当天提醒'), ddlCb),
    el('label', { class: 'field', style: { margin: 0 } }, el('span', {}, '主题'), themeSel),
    notifBtn),
    el('p', { class: 'small muted mt' }, '说明：Web 版提醒在页面打开期间生效（课前提醒、DDL 当天提醒、考试临近提醒）。关闭页面后的后台推送需要原生 App 或服务器，不在本版范围内。'));
  root.append(remindCard);

  /* ---------- AI ---------- */
  const ai = s.settings.ai;
  const aiCard = el('div', { class: 'card' }, el('h3', {}, 'AI 模型（可选）'),
    el('p', { class: 'small muted mb' }, '不配置也能用：离线规则问答完全本地运行。配置 OpenAI 兼容接口后解锁自由问答与截图识课。密钥仅存本机浏览器，请求只发往你填写的地址。'));
  const enabledCb = el('input', { type: 'checkbox', checked: ai.enabled, style: { accentColor: 'var(--site-accent)' } });
  const endpointI = el('input', { class: 'input', value: ai.endpoint, placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });
  const keyI = el('input', { class: 'input', type: 'password', value: ai.apiKey, placeholder: 'sk-…（仅存本机）', autocomplete: 'off' });
  const modelI = el('input', { class: 'input', value: ai.model, placeholder: '如 qwen-plus / gpt-4o-mini' });
  const visionI = el('input', { class: 'input', value: ai.visionModel, placeholder: '如 qwen-vl-max（截图识课用，可留空）' });
  const saveAi = () => mutate(st => {
    st.settings.ai = { enabled: enabledCb.checked, endpoint: endpointI.value.trim(), apiKey: keyI.value.trim(), model: modelI.value.trim(), visionModel: visionI.value.trim() };
  }, { undoable: false });
  [enabledCb, endpointI, keyI, modelI, visionI].forEach(i => i.addEventListener('change', saveAi));
  aiCard.append(
    el('label', { class: 'row mb' }, enabledCb, el('span', {}, '启用大模型增强')),
    el('div', { class: 'form-grid' },
      el('label', { class: 'field full' }, el('span', {}, '接口地址（OpenAI 兼容，不含 /chat/completions）'), endpointI),
      el('label', { class: 'field' }, el('span', {}, 'API Key'), keyI),
      el('label', { class: 'field' }, el('span', {}, '对话模型'), modelI),
      el('label', { class: 'field full' }, el('span', {}, '视觉模型（截图识课）'), visionI)),
    el('p', { class: 'small muted mt' }, '提示：阿里百炼、OpenAI、DeepSeek、Moonshot 等提供 OpenAI 兼容接口的服务均可使用。截图识课结果必须人工核对后再导入。'));
  root.append(aiCard);

  /* ---------- 数据 ---------- */
  const dataCard = el('div', { class: 'card' }, el('h3', {}, '数据与备份'),
    el('p', { class: 'small muted mb' }, '换机迁移：导出完整备份 JSON，在新设备导入即可。建议定期备份。'));
  const backupInput = el('input', { type: 'file', accept: '.json', style: { display: 'none' } });
  backupInput.addEventListener('change', async () => {
    const f = backupInput.files[0]; backupInput.value = '';
    if (!f) return;
    try {
      const text = await readFile(f);
      confirmModal('恢复备份', '将用备份文件完全覆盖当前本机数据，确定继续？', async () => {
        try { importBackup(text); toast('备份已恢复'); nav('today'); }
        catch (e) { toast('恢复失败：' + e.message, 'err'); }
      }, { yesLabel: '覆盖恢复' });
    } catch (e) { toast('读取失败：' + e.message, 'err'); }
  });
  dataCard.append(el('div', { class: 'row' },
    el('button', { class: 'btn', html: ico('download') + ' 导出完整备份', onclick: () => { download(`coursegap-备份-${todayStr()}.json`, exportBackup(), 'application/json'); toast('备份已导出'); } }),
    el('button', { class: 'btn', html: ico('upload') + ' 恢复备份', onclick: () => backupInput.click() }),
    el('button', { class: 'btn', onclick: () => exportCoursesJSON() }, '导出课程 JSON'),
    el('button', { class: 'btn', onclick: () => exportCSVTemplate() }, '下载 CSV 导入模板'),
    backupInput),
    el('div', { class: 'row mt' },
      el('button', { class: 'btn sm', onclick: () => confirmModal('加载示例数据', '向当前课表写入演示课程、任务与考试（标注为示例）。', () => { loadSample(); toast('示例数据已加载'); }) }, '加载示例数据'),
      el('button', {
        class: 'btn sm danger', onclick: () => confirmModal('清空全部数据', '将删除本机所有课表、课程、任务、考试与设置，且不可恢复（建议先导出备份）。确定清空？', () => {
          localStorage.removeItem('coursegap.v1');
          location.reload();
        }, { danger: true, yesLabel: '全部清空' }),
      }, '清空全部数据')));
  root.append(dataCard);

  /* ---------- 关于 ---------- */
  root.append(el('div', { class: 'card' },
    el('h3', {}, '关于课隙 CourseGap'),
    el('p', { class: 'small muted' }, 'v1.0 · 原创开源项目（Mulan PSL v2 木兰宽松许可证）· 为 2026 Qoder 高校创造力大赛 StudyHack 赛道开发。'),
    el('p', { class: 'small muted mt' }, '功能设计参考了 Sleepy、拾光课程表、ClassFlow、Course_Planner、Gapwise、StudyDesk、StudySync、AirCourse、qq-reminder 等开源项目的公开文档（仅借鉴思路，未复制代码）。完整致谢与许可证核验见项目仓库 README。'),
    el('p', { class: 'small muted mt' }, '隐私：无账号、无追踪、无云端同步；全部数据存于本机浏览器。配置 AI 后仅向你填写的接口发送必要数据。')));
}

/* ---------- 作息编辑弹窗 ---------- */
function periodSetModal(psId) {
  const s = getState();
  const existing = psId ? s.settings.periodSets.find(p => p.id === psId) : null;
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), name: '新作息', periods: defaultPeriods() };
  const nameI = el('input', { class: 'input', value: draft.name });
  const rowsWrap = el('div', {});
  function renderRows() {
    rowsWrap.innerHTML = '';
    draft.periods.forEach((p, i) => {
      const startI = el('input', { class: 'input', type: 'time', value: p.start, style: { width: 'auto' } });
      const endI = el('input', { class: 'input', type: 'time', value: p.end, style: { width: 'auto' } });
      startI.addEventListener('change', () => { p.start = startI.value; });
      endI.addEventListener('change', () => { p.end = endI.value; });
      rowsWrap.append(el('div', { class: 'row', style: { padding: '3px 0' } },
        el('b', { style: { width: '36px' } }, String(p.p)), startI, el('span', { class: 'muted' }, '—'), endI,
        el('button', { class: 'btn sm ghost', onclick: () => { draft.periods.splice(i, 1); draft.periods.forEach((x, j) => x.p = j + 1); renderRows(); } }, '删除')));
    });
  }
  renderRows();
  modal(existing ? '编辑作息' : '新建作息', el('div', {},
    el('label', { class: 'field' }, el('span', {}, '作息名称'), nameI),
    el('p', { class: 'small muted mb' }, '节次按开始时间排序后自动编号。修改作息会影响绑定课表的时间显示。'),
    rowsWrap,
    el('button', { class: 'btn sm mt', onclick: () => { const last = draft.periods[draft.periods.length - 1]; draft.periods.push({ p: draft.periods.length + 1, start: last ? last.end : '08:00', end: last ? min2hm(hm2min(last.end) + 45) : '08:45' }); renderRows(); } }, '+ 添加节次')),
    {
      actions: [
        { label: '取消' },
        {
          label: '保存', kind: 'primary', onClick: close => {
            const periods = draft.periods.filter(p => p.start && p.end).sort((a, b) => hm2min(a.start) - hm2min(b.start));
            periods.forEach((p, i) => { p.p = i + 1; });
            if (!periods.length) { toast('至少保留一个节次', 'err'); return; }
            mutate(st => {
              const data = { ...draft, name: nameI.value.trim() || '未命名作息', periods };
              const i = st.settings.periodSets.findIndex(p => p.id === draft.id);
              if (i >= 0) st.settings.periodSets[i] = data; else st.settings.periodSets.push(data);
            });
            close(); toast('作息已保存');
          },
        },
      ],
    });
}

/* ---------- 按课时长度生成作息（F022） ---------- */
function generatePeriodsModal() {
  const startI = el('input', { class: 'input', type: 'time', value: '08:00' });
  const lenI = el('input', { class: 'input', type: 'number', min: 20, max: 120, value: 45, style: { width: '90px' } });
  const breakI = el('input', { class: 'input', type: 'number', min: 0, max: 60, value: 10, style: { width: '90px' } });
  const countI = el('input', { class: 'input', type: 'number', min: 1, max: 16, value: 12, style: { width: '90px' } });
  const bigBreakI = el('input', { class: 'input', type: 'number', min: 0, max: 180, value: 0, style: { width: '90px' } });
  const bigAfterI = el('input', { class: 'input', type: 'number', min: 0, max: 16, value: 4, style: { width: '90px' } });
  modal('按课时长度生成作息', el('div', { class: 'form-grid' },
    el('label', { class: 'field' }, el('span', {}, '第一节课开始'), startI),
    el('label', { class: 'field' }, el('span', {}, '每节时长（分钟）'), lenI),
    el('label', { class: 'field' }, el('span', {}, '课间休息（分钟）'), breakI),
    el('label', { class: 'field' }, el('span', {}, '节数'), countI),
    el('label', { class: 'field' }, el('span', {}, '大课间（分钟，0=无）'), bigBreakI),
    el('label', { class: 'field' }, el('span', {}, '大课间在第几节后'), bigAfterI)),
    {
      actions: [
        { label: '取消' },
        {
          label: '生成并保存', kind: 'primary', onClick: close => {
            const len = Math.max(20, +lenI.value || 45), br = Math.max(0, +breakI.value || 0);
            const count = Math.max(1, Math.min(16, +countI.value || 12));
            const big = Math.max(0, +bigBreakI.value || 0), bigAfter = +bigAfterI.value || 0;
            let cur = hm2min(startI.value || '08:00');
            const periods = [];
            for (let i = 1; i <= count; i++) {
              periods.push({ p: i, start: min2hm(cur), end: min2hm(cur + len) });
              cur += len + br + (big && i === bigAfter ? big : 0);
            }
            mutate(st => { st.settings.periodSets.push({ id: uid(), name: `生成作息（${len}分钟/节）`, periods }); });
            close(); toast('作息已生成，可在课表上绑定使用');
          },
        },
      ],
    });
}