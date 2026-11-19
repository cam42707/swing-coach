const CACHE = 'swing-coach-v3';
const ASSETS = ['./', 'index.html', 'css/app.css', 'manifest.json', 'icons/icon.svg',
  'js/app.js', 'js/db.js', 'js/record.js', 'js/analyze.js', 'js/draw.js', 'js/grade.js', 'js/drills.js', 'js/coach.js', 'js/voice.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.anthropic.com') return;
  // network first for app files, cache fallback (offline)
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname.includes('jsdelivr') || url.hostname.includes('googleapis'))) {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return r;
  }).catch(() => caches.match(e.request)));
});
