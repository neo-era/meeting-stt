// Service worker: cache khung ứng dụng + thư viện CDN để dùng offline.
// Lưu ý: file mô hình (Hugging Face) do Transformers.js tự cache trong trình duyệt,
// nên ở đây không cache lại để tránh chiếm dung lượng gấp đôi.

const CACHE = 'bienban-hop-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './worker.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const sameOrigin = url.origin === self.location.origin;
  const isCDNLib = url.hostname === 'cdn.jsdelivr.net';

  // Khung app + thư viện CDN: ưu tiên cache, có mạng thì cập nhật ngầm.
  if (sameOrigin || isCDNLib) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // Các request khác (vd. huggingface.co tải mô hình): để mặc định, Transformers.js tự lo cache.
});
