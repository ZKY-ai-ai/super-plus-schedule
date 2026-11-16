/* 课隙 CourseGap Service Worker — 离线缓存（应用壳） */
const CACHE = 'coursegap-v3';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/store.js', 'js/schedule.js', 'js/ui.js', 'js/editors.js',
  'js/importexport.js', 'js/ai.js', 'js/periods.js', 'js/calendar.js',
  'js/appearance.js', 'js/templates.js', 'js/commands.js', 'js/pet.js',
  'js/views/today.js', 'js/views/timetable.js', 'js/views/tasks.js',
  'js/views/exams.js', 'js/views/gaps.js', 'js/views/assistant.js', 'js/views/settings.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // AI 接口等外部请求不拦截
  // 网络优先：在线时总是取最新源码并刷新缓存；离线时回退缓存（应用壳）
  e.respondWith(
    fetch(req).then(resp => {
      if (resp.ok) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return resp;
    }).catch(() => caches.match(req).then(hit => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('index.html');
      return Response.error();
    }))
  );
});