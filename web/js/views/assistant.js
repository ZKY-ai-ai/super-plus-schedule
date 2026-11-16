/* ============================================================
   views/assistant.js — AI 助手：
   本地规则问答（离线）+ 可选大模型增强 + 截图识课
   ============================================================ */
import { getState } from '../store.js';
import { el, ico, toast, readFile } from '../ui.js';
import { answer, aiConfigured, recognizeScheduleImage } from '../ai.js';
import { previewImport } from '../importexport.js';

const history = []; // {role, content} 仅存内存，不持久化

export function renderAssistant(root, nav) {
  const s = getState();
  root.innerHTML = '';
  root.append(el('div', { class: 'view-head' },
    el('div', {}, el('h2', {}, 'AI 助手'),
      el('p', { class: 'sub' }, aiConfigured()
        ? '已配置大模型：自由问答 + 截图识课可用。数据仅发往你自己配置的接口。'
        : '离线模式：本地规则解析查课/考试/DDL/空档，不发送任何数据。可在设置中配置大模型解锁自由问答。')),
    el('button', { class: 'btn sm', onclick: () => nav('settings') }, 'AI 设置')));

  const log = el('div', { class: 'chat-log' });
  const input = el('input', { class: 'input', placeholder: '问点什么，如：明天下午有空吗？', 'aria-label': '输入问题' });
  const sendBtn = el('button', { class: 'btn primary', html: ico('send') + ' 发送' });

  function addMsg(role, text, source) {
    const m = el('div', { class: 'msg ' + role }, text, source ? el('span', { class: 'src' }, source) : null);
    log.append(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  if (!history.length) {
    addMsg('bot', '你好，我是课隙助手。可以问我：\n· 明天有什么课？周三下午呢？\n· 下一节课几点开始，最晚几点出发？\n· 最近有什么考试？\n· 今天有哪些作业要交？\n· 明天下午有空吗？去图书馆来得及吗？\n· 这周上多少节课？', '本地规则解析 · 离线');
  } else {
    history.forEach(h => addMsg(h.role === 'user' ? 'user' : 'bot', h.content, h.source));
  }

  async function send(text) {
    const q = (text || input.value).trim();
    if (!q) return;
    input.value = '';
    addMsg('user', q);
    history.push({ role: 'user', content: q });
    sendBtn.disabled = true;
    const thinking = addMsg('bot', '思考中…');
    try {
      const res = await answer(q, history.filter(h => h.role === 'user' || h.role === 'assistant').map(h => ({ role: h.role, content: h.content })));
      thinking.remove();
      addMsg('bot', res.text, res.source);
      history.push({ role: 'assistant', content: res.text, source: res.source });
    } catch (e) {
      thinking.remove();
      addMsg('bot', '出错了：' + e.message, '请检查设置中的接口地址 / 密钥 / 模型名');
    } finally { sendBtn.disabled = false; input.focus(); }
  }

  sendBtn.addEventListener('click', () => send());
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  const quick = el('div', { class: 'quick-q' },
    ['今天有什么课', '下一节课', '明天下午有空吗', '最近的考试', '今天的作业', '这周上多少节课'].map(q =>
      el('button', { onclick: () => send(q) }, q)));

  // 截图识课
  const imgInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  imgInput.addEventListener('change', async () => {
    const f = imgInput.files[0];
    imgInput.value = '';
    if (!f) return;
    if (!aiConfigured()) { toast('截图识别需要先在设置中配置 AI 接口与视觉模型', 'err'); return; }
    addMsg('user', `[上传课表截图：${f.name}]`);
    const thinking = addMsg('bot', '正在识别课表截图…');
    try {
      const dataURL = await readFile(f, 'dataURL');
      const parsed = await recognizeScheduleImage(dataURL);
      thinking.remove();
      addMsg('bot', `识别出 ${parsed.courses.length} 门课程，已打开导入预览。请逐行核对后再确认导入。`, 'AI 识别结果需人工核对');
      previewImport(parsed, { onApplied: () => nav('timetable') });
    } catch (e) {
      thinking.remove();
      addMsg('bot', '识别失败：' + e.message, '可改用文件导入（JSON/CSV/ICS）');
    }
  });

  const box = el('div', { class: 'card chat-box', style: { padding: 0 } },
    log, quick,
    el('div', { class: 'chat-input' },
      el('button', { class: 'icon-btn', title: '上传课表截图识别（需配置视觉模型）', html: ico('camera'), onclick: () => imgInput.click() }),
      input, sendBtn, imgInput));
  root.append(box);
  root.append(el('p', { class: 'small muted mt' }, '隐私说明：离线问答完全在本机完成；配置模型后，问题与未来 7 天课表摘要会发送到你填写的接口地址，密钥仅存本机浏览器。AI 生成内容仅供参考，请以教务系统为准。'));
}