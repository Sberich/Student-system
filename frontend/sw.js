/**
 * Service Worker สำหรับ Smart Grade (สมาร์ทเกรด)
 * ให้บริการ Network-First สำหรับ App Shell เพื่อให้รับการอัปเดตล่าสุดเสมอ
 */

const CACHE_NAME = 'smart-grade-v57';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=57',
  './app.js?v=57',
  './html2canvas.min.js',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // ไม่แคชคำขอไปยัง Google Apps Script Web App (API endpoints)
  if (event.request.url.includes('script.google.com') || event.request.method !== 'GET') {
    return;
  }

  // Network First สำหรับ HTML และ JS เพื่อให้ผู้ใช้ได้รับโค้ดเวอร์ชันล่าสุดเสมอเมื่อออนไลน์
  if (event.request.mode === 'navigate' || event.request.url.includes('app.js') || event.request.url.includes('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
