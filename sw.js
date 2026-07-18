/* sw.js — Notara Service Worker v3 */
'use strict';

// ── Cache names ───────────────────────────────────────────────────────────────
// CACHE_APP  : app shell (HTML/JS/CSS) — network-first, cache as fallback
// CACHE_EXT  : Font Awesome + Google Fonts — cache-first (stable CDN assets)
// Nama CACHE_APP tidak perlu diubah manual; network-first selalu ambil yang terbaru.
const CACHE_APP  = 'notara-app-v3';
const CACHE_EXT  = 'notara-ext-v1'; // pisah supaya font tidak ikut terhapus saat app update

// ── Install: skip waiting segera, jangan pre-cache ───────────────────────────
// Pre-caching dihapus. Kita cache secara runtime (saat pertama kali diminta).
// Ini mencegah install gagal karena satu asset tidak bisa diambil.
self.addEventListener('install', () => {
  self.skipWaiting(); // langsung ambil kendali tanpa tunggu tab lama tutup
});

// ── Activate: hapus cache lama, klaim semua klien ────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_APP && k !== CACHE_EXT)
          .map(k => {
            console.log('[SW] Menghapus cache lama:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim()) // ambil kendali semua tab yang terbuka
  );
});

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  // Abaikan non-GET
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // ── 1. Supabase: SELALU network, jangan pernah cache ────────────────────────
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // ── 2. Font Awesome (cdnjs) + Google Fonts: cache-first ─────────────────────
  // Ini yang menyebabkan ikon hilang. Kita cache FA CSS dan file font-nya
  // di CACHE_EXT supaya tersedia offline dan tidak bergantung network tiap load.
  if (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    e.respondWith(cacheFirst(e.request, CACHE_EXT));
    return;
  }

  // ── 3. Supabase JS dari jsDelivr: network-first ──────────────────────────────
  if (url.hostname.includes('jsdelivr.net')) {
    e.respondWith(networkFirst(e.request, CACHE_EXT));
    return;
  }

  // ── 4. App shell lokal (HTML/JS/CSS/manifest): network-first ────────────────
  // Network-first memastikan setiap kali ada deploy baru,
  // file terbaru langsung diambil tanpa perlu hapus cache manual.
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(e.request, CACHE_APP));
    return;
  }

  // ── Default: coba network, fallback cache ────────────────────────────────────
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ── Strategi: Network-first, cache sebagai fallback + update cache ────────────
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    // Cache hanya response yang valid (200 OK, bukan opaque)
    if (response && response.status === 200 && response.type !== 'error') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network gagal (offline) → coba cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Jika HTML tidak ada di cache, kembalikan halaman offline sederhana
    if (request.destination === 'document') {
      return new Response(
        `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Notara — Offline</title>
        <style>
          body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
          height:100vh;margin:0;background:#0d0f14;color:#f0f2f8;text-align:center;flex-direction:column;gap:1rem}
          .icon{font-size:3rem;opacity:.4}h2{margin:0}p{color:#8b91a8;margin:0}
          button{margin-top:1rem;padding:.6rem 1.4rem;background:#7c6af7;color:#fff;
          border:none;border-radius:9999px;cursor:pointer;font-size:.9rem}
        </style></head><body>
        <div class="icon"><img src="ikon-transparant.png" alt="Notara" width="48" height="48"></div>
        <h2>Notara — Offline</h2>
        <p>Tidak ada koneksi internet. Data kamu aman di Supabase.</p>
        <button onclick="location.reload()">Coba Lagi</button>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    return Response.error();
  }
}

// ── Strategi: Cache-first, network sebagai fallback + update cache ────────────
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

// ── Push notification ─────────────────────────────────────────────────────────
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

// ── Pesan dari app (misal: force refresh) ────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});