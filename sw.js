/* sw.js — Notara Service Worker v6 */
'use strict';

const CACHE_APP  = 'notara-app-v6';
const CACHE_EXT  = 'notara-ext-v1';
const CACHE_API  = 'notara-api-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_APP && k !== CACHE_EXT && k !== CACHE_API)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/')) {
    e.respondWith(networkFirst(e.request, CACHE_API));
    return;
  }

  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  if (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    e.respondWith(cacheFirst(e.request, CACHE_EXT));
    return;
  }

  if (url.hostname.includes('jsdelivr.net')) {
    e.respondWith(networkFirst(e.request, CACHE_EXT));
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(e.request, CACHE_APP));
    return;
  }

  e.respondWith(fetch(e.request));
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'error') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.destination === 'document') {
      return new Response(
        `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Notara</title>
        <style>
          body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
          height:100vh;margin:0;background:#0d0f14;color:#f0f2f8;text-align:center;flex-direction:column;gap:1rem}
          .icon{font-size:3rem;opacity:.4}h2{margin:0}p{color:#8b91a8;margin:0}
          button{margin-top:1rem;padding:.6rem 1.4rem;background:#7c6af7;color:#fff;
          border:none;border-radius:9999px;cursor:pointer;font-size:.9rem}
        </style></head><body>
        <div class="icon"><img src="ikon-transparant.png" alt="Notara" width="48" height="48"></div>
        <h2>Notara</h2>
        <p>Koneksi internet diperlukan untuk menggunakan aplikasi ini.</p>
        <button onclick="location.reload()">Coba Lagi</button>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    return Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'Notara', body: 'Pengingat catatan!' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  './ikon-transparant.png',
      badge: './ikon-transparant.png',
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
