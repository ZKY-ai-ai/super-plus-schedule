/* ============================================================
   appearance.js — 壁纸、主题色、课程配色、圆角与间距（F132/F133/F134）

   壁纸预设的渐变配方、遮罩透明度算法与图片压缩流程移植自
   lcymxm/classflow src/lib/wallpaper.ts（MIT，
   commit 30c466a5c456b7dde01cfc42a3178f83e87de7a6）。
   上游的 whale-night 预设与鲸鱼娘素材未引入（许可限制），
   课程配色方案为本项目原创。归属见 third_party/classflow/NOTICE.md。
   ============================================================ */

export const WALLPAPERS = [
  { id: 'none', name: '无壁纸', note: '纯色背景，最省资源' },
  {
    id: 'paper', name: '奶油纸', note: '米色网点纸',
    background: 'radial-gradient(var(--site-border) 0.85px, transparent 0.85px), linear-gradient(180deg, var(--site-bg), var(--site-bg))',
    size: '22px 22px, auto',
  },
  {
    id: 'sage', name: '鼠尾草', note: '柔和浅绿网格',
    background: 'linear-gradient(90deg, color-mix(in srgb, var(--site-border) 58%, transparent) 1px, transparent 1px), linear-gradient(color-mix(in srgb, var(--site-border) 58%, transparent) 1px, transparent 1px), linear-gradient(135deg, #edf1e5, #e2ead7)',
    size: '34px 34px, 34px 34px, auto',
  },
  {
    id: 'dawn', name: '晨光', note: '暖橙与奶油渐变',
    background: 'radial-gradient(circle at 84% 0%, rgba(221,103,73,.2), transparent 22rem), linear-gradient(135deg, #f6e3d3, #fbf5e9 56%, #efe8d8)',
  },
  {
    id: 'dusk', name: '暮色', note: '深绿夜色，适合深色主题',
    background: 'radial-gradient(circle at 88% 10%, rgba(221,103,73,.23), transparent 24rem), linear-gradient(145deg, #1c302a, #111b17)',
    dark: true,
  },
  {
    id: 'grid', name: '方格本', note: '淡蓝坐标格',
    background: 'linear-gradient(90deg, color-mix(in srgb, var(--site-accent) 12%, transparent) 1px, transparent 1px), linear-gradient(color-mix(in srgb, var(--site-accent) 12%, transparent) 1px, transparent 1px), linear-gradient(180deg, var(--site-bg), var(--site-bg))',
    size: '28px 28px, 28px 28px, auto',
  },
  { id: 'custom', name: '自定义图片', note: '上传本机图片，自动压缩后只存本地' },
];

/* 课程配色方案（F132），10 色对应 --course-1 … --course-10 */
export const PALETTES = {
  default: { name: '默认鲜明', colors: ['#4f6df5', '#0ea5a4', '#d97706', '#db2777', '#7c3aed', '#16a34a', '#dc2626', '#0284c7', '#9333ea', '#ca8a04'] },
  morandi: { name: '莫兰迪', colors: ['#8c9eff', '#7fb8b0', '#d3a06a', '#c98ba6', '#a78bc0', '#8bb17c', '#c97c7c', '#7fa8c9', '#b08bc9', '#c0a86a'] },
  candy: { name: '糖果', colors: ['#ff7a9c', '#ffb347', '#ffe066', '#7ee081', '#5fd4d4', '#6fb1ff', '#a78bfa', '#f78fb3', '#ff9f68', '#8ed1a0'] },
  ocean: { name: '海蓝单色', colors: ['#1d4ed8', '#2563eb', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#0f766e', '#1e40af', '#0369a1', '#155e75'] },
};

export const ACCENTS = ['#4f6df5', '#7c3aed', '#0ea5a4', '#16a34a', '#d97706', '#db2777', '#dc2626', '#0284c7'];

function overlayAlpha(dim, dark, strong) {
  const amount = Math.min(80, Math.max(0, dim)) / 100;
  if (dark) {
    const alpha = strong ? 0.58 + amount * 0.25 : 0.34 + amount * 0.3;
    return `rgba(16, 22, 19, ${Math.min(0.9, alpha).toFixed(3)})`;
  }
  const alpha = strong ? 0.55 + amount * 0.35 : 0.16 + amount * 0.35;
  return `rgba(248, 246, 239, ${Math.min(0.82, alpha).toFixed(3)})`;
}

/* 相对亮度，用于决定强调色上的文字用深色还是浅色 */
function onAccent(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return L > 0.45 ? '#10131a' : '#ffffff';
}

export function applyAppearance(settings, dark) {
  const a = settings.appearance || {};
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);

  set('--site-radius', `${Math.max(0, Math.min(28, +a.radius || 0))}px`);
  set('--site-space', String(Math.max(0.5, Math.min(2, (+a.gap || 6) / 6))));

  const palette = PALETTES[a.palette] || PALETTES.default;
  palette.colors.forEach((c, i) => set(`--course-${i + 1}`, c));

  if (a.accent) { set('--site-accent', a.accent); set('--site-on-accent', onAccent(a.accent)); }
  else { root.style.removeProperty('--site-accent'); root.style.removeProperty('--site-on-accent'); }

  const def = WALLPAPERS.find(w => w.id === a.wallpaper) || WALLPAPERS[0];
  const isCustom = def.id === 'custom' && a.wallpaperData;
  const strong = isCustom || !!def.dark;
  if (def.id === 'none' || (def.id === 'custom' && !a.wallpaperData)) {
    set('--wp-image', 'none');
    set('--wp-overlay', 'transparent');
    document.body.classList.remove('has-wallpaper');
  } else {
    set('--wp-image', isCustom ? `url("${a.wallpaperData}")` : def.background);
    set('--wp-size', isCustom ? 'cover' : (def.size || 'auto'));
    set('--wp-repeat', isCustom ? 'no-repeat' : 'repeat');
    set('--wp-overlay', def.id === 'paper' || def.id === 'grid' ? 'transparent' : overlayAlpha(+a.dim || 0, dark, strong));
    document.body.classList.add('has-wallpaper');
  }
  set('--wp-blur', `${Math.max(0, Math.min(20, +a.blur || 0))}px`);
  set('--wp-brightness', `${Math.max(40, Math.min(160, +a.brightness || 100))}%`);
}

/* 图片 → 压缩后的 dataURL（算法移植自上游，尺寸与质量阈值保持一致） */
export async function imageFileToWallpaper(file) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片不能超过 20 MB。');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('图片读取失败，请换一张试试。'));
      image.src = objectUrl;
    });
    const scale = Math.min(1, 1600 / image.naturalWidth, 1200 / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前设备无法处理这张图片。');
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return dataUrl.length > 2_300_000 ? canvas.toDataURL('image/jpeg', 0.68) : dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}