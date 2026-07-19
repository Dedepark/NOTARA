# SPEC: Sistem Perpesanan CS (Notara)

**Versi:** 2.0 (Revisi)
**Status:** Draft untuk Review
**Stack:** Supabase (PostgreSQL + Auth) + Vanilla JS SPA (Hash Router)
**Existing Tables:** `notes`, `posts`, `tags`, `post_comments`, `user_activity`, trackers

---

## 1. Gambaran Umum & Prinsip Desain

| Prinsip | Implementasi |
|---------|--------------|
| **Tabel Terpisah** | Buat `cs_tickets` + `cs_messages` baru (bukan modifikasi `posts`). |
| **Backdoor Admin** | `Ctrl+Shift+Alt+A` → prompt PIN → Edge Function → admin token 15 menit. |
| **User: Kirim 1x per Sesi** | Dari Settings → Tentang Pengembang → Kirim Laporan. Setelah kirim, tidak bisa balas di sesi yang sama. |
| **CS: Balas Berkali-kali** | Panel CS hidden, CS bisa reply unlimited per sesi. |
| **User: Baca Saja** | Halaman Pesan di sidebar, user bisa baca tapi tidak bisa balas. |

---

## 2. Alur Kerja

### 2.1 User Kirim Laporan
```
Settings → Tentang Pengembang → [Kirim Laporan]
  ↓
Modal: Judul + Pesan
  ↓
INSERT cs_tickets + cs_messages(sender='user')
  ↓
Selesai. Tidak bisa kirim lagi di sesi ini.
```

### 2.2 User Baca Balasan
```
Sidebar → [Pesan]
  ↓
Daftar tiket user → Klik → Detail pesan (read-only)
```

### 2.3 CS Balas
```
Ctrl+Shift+Alt+A → PIN → Panel CS
  ↓
Klik tiket → Balas → INSERT cs_messages(sender='cs')
```

---

## 3. Skema Database

### 3.1 cs_tickets

```sql
CREATE TABLE public.cs_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL DEFAULT 'Laporan Baru',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cs_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT cs_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX idx_cs_tickets_user_id ON public.cs_tickets (user_id);
CREATE INDEX idx_cs_tickets_updated ON public.cs_tickets (updated_at DESC);

ALTER TABLE public.cs_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own tickets" ON public.cs_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own tickets" ON public.cs_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role read all tickets" ON public.cs_tickets FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "Service role update tickets" ON public.cs_tickets FOR UPDATE USING (auth.role() = 'service_role');
```

### 3.2 cs_messages

```sql
CREATE TABLE public.cs_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender IN ('user','cs')),
  sender_name text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cs_messages_pkey PRIMARY KEY (id),
  CONSTRAINT cs_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.cs_tickets(id) ON DELETE CASCADE
);

CREATE INDEX idx_cs_messages_ticket_id ON public.cs_messages (ticket_id, created_at ASC);

ALTER TABLE public.cs_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read messages in own tickets" ON public.cs_messages FOR SELECT
  USING (ticket_id IN (SELECT id FROM public.cs_tickets WHERE user_id = auth.uid()));

CREATE POLICY "Users insert messages in own tickets" ON public.cs_messages FOR INSERT
  WITH CHECK (sender = 'user' AND ticket_id IN (SELECT id FROM public.cs_tickets WHERE user_id = auth.uid()));

CREATE POLICY "Service role read all messages" ON public.cs_messages FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "Service role insert messages" ON public.cs_messages FOR INSERT WITH CHECK (auth.role() = 'service_role');
```

### 3.3 Catatan RLS

- User **tidak bisa UPDATE/DELETE** pesan atau tiket (tidak ada policy untuk itu).
- Frontend user **tidak menyediakan input** balasan → user secara de facto tidak bisa reply.
- Service role bypass semua RLS.

---

## 4. Frontend

### 4.1 Sidebar: Tombol "Pesan"

Tambahkan di `index.html` sidebar nav:
```html
<a class="nav-item" href="#messages" data-nav="messages">
  <i class="fa-solid fa-envelope"></i><span>Pesan</span>
</a>
```

### 4.2 Settings: Tombol "Kirim Laporan"

Di `settings.js` bagian "Tentang Pengembang", setelah link TikTok:
```html
<div class="divider" style="margin:0"></div>
<div class="settings-item" style="cursor:pointer" id="setting-cs-report">
  <div class="settings-item-left">
    <span class="settings-item-label">
      <i class="fa-solid fa-headset" style="color:var(--accent);margin-right:8px"></i>
      Kirim Laporan ke Developer
    </span>
    <span class="settings-item-sub">Kirim pesan, kritik, atau laporan bug</span>
  </div>
  <i class="fa-solid fa-chevron-right" style="color:var(--text-3);font-size:0.8rem"></i>
</div>
```

Event handler di `_bindSettingsEvents()`:
```js
document.getElementById('setting-cs-report')?.addEventListener('click', () => {
  window.Notara.Messages.showNewReportModal();
});
```

### 4.3 File Baru: js/messages.js

```js
/* js/messages.js - User Message Inbox */
'use strict';
window.Notara = window.Notara || {};

window.Notara.Messages = (() => {
  const db = () => window.Notara.db;
  const R  = window.Notara.Router;
  const UI = window.Notara.UI;
  const Auth = window.Notara.Auth;

  async function renderInbox() {
    const main = document.getElementById('app-main');
    UI.setTitle('Pesan');
    UI.setActiveNav('messages');
    main.innerHTML = '<div class="page-loading"><div class="loader-ring"></div></div>';

    const userId = Auth.getUser()?.id;
    const { data: tickets, error } = await db()
      .from('cs_tickets').select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      main.innerHTML = '<div class="empty-state" style="min-height:60vh"><h3>Gagal memuat</h3><p>' + error.message + '</p></div>';
      return;
    }
    if (!tickets?.length) {
      main.innerHTML = '<div class="messages-page page-enter"><div class="messages-header"><h2><i class="fa-solid fa-envelope"></i> Pesan</h2></div><div class="empty-state" style="min-height:50vh"><i class="fa-solid fa-envelope-open empty-icon" style="opacity:0.25"></i><h3>Belum ada pesan</h3><p>Kirim laporan dari menu Pengaturan</p></div></div>';
      return;
    }
    main.innerHTML = '<div class="messages-page page-enter"><div class="messages-header"><h2><i class="fa-solid fa-envelope"></i> Pesan</h2><span class="messages-count">' + tickets.length + ' laporan</span></div><div class="messages-list" id="messages-list">' + tickets.map(_buildTicketCard).join('') + '</div></div>';
    document.querySelectorAll('.msg-ticket-card').forEach(c => c.addEventListener('click', () => _openDetail(c.dataset.tid)));
  }

  function _buildTicketCard(t) {
    const st = t.status === 'open' ? '<i class="fa-solid fa-circle" style="color:var(--label-easy);font-size:0.5rem"></i> Aktif' : '<i class="fa-solid fa-circle-check" style="color:var(--text-3);font-size:0.55rem"></i> Selesai';
    return '<div class="msg-ticket-card" data-tid="' + t.id + '"><div class="msg-ticket-top"><span class="msg-ticket-status">' + st + '</span><span class="msg-ticket-time">' + UI.formatDate(t.updated_at) + '</span></div><div class="msg-ticket-subject">' + _esc(t.subject) + '</div></div>';
  }

  async function _openDetail(ticketId) {
    const main = document.getElementById('app-main');
    main.innerHTML = '<div class="page-loading"><div class="loader-ring"></div></div>';
    const { data: ticket } = await db().from('cs_tickets').select('*').eq('id', ticketId).single();
    const { data: msgs } = await db().from('cs_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
    if (!ticket) { R.go('messages'); return; }
    const st = ticket.status === 'open' ? '<i class="fa-solid fa-circle" style="color:var(--label-easy);font-size:0.5rem"></i> Aktif' : '<i class="fa-solid fa-circle-check" style="color:var(--text-3)"></i> Selesai';
    main.innerHTML = '<div class="msg-detail-page page-enter"><div class="msg-detail-header"><button class="icon-btn" id="msg-back"><i class="fa-solid fa-arrow-left"></i></button><div class="msg-detail-info"><div class="msg-detail-subject">' + _esc(ticket.subject) + '</div><div class="msg-detail-status">' + st + '</div></div></div><div class="msg-detail-body" id="msg-detail-body">' + (msgs||[]).map(_buildBubble).join('') + '</div><div class="msg-detail-footer"><div class="msg-read-only-notice"><i class="fa-solid fa-lock"></i> Balasan hanya bisa dikirim melalui Developer</div></div></div>';
    document.getElementById('msg-back')?.addEventListener('click', () => R.go('messages'));
    const body = document.getElementById('msg-detail-body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  function _buildBubble(m) {
    const isCS = m.sender === 'cs';
    const cls = isCS ? 'msg-left' : 'msg-right';
    const badge = isCS ? '<span class="cs-badge-official"><i class="fa-solid fa-shield-check"></i> Developer</span>' : '';
    const time = new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return '<div class="msg-bubble ' + cls + '">' + badge + '<div class="msg-text">' + _esc(m.content) + '</div><div class="msg-time">' + time + '</div></div>';
  }

  function showNewReportModal() {
    UI.modal({
      title: '<i class="fa-solid fa-headset"></i> Kirim Laporan',
      body: '<div style="display:flex;flex-direction:column;gap:var(--space-md)"><div class="auth-field"><label class="auth-label">Judul Laporan</label><div class="auth-input-wrap"><i class="fa-solid fa-heading auth-input-icon"></i><input type="text" class="auth-input" id="cs-report-subject" placeholder="Ringkasan masalah..." maxlength="100"></div></div><div class="auth-field"><label class="auth-label">Pesan</label><textarea class="new-post-textarea" id="cs-report-content" placeholder="Jelaskan masalah, kritik, atau saran..." rows="5" maxlength="1000" style="min-height:120px"></textarea><div style="font-size:0.75rem;color:var(--text-3);margin-top:4px" id="cs-report-count">0 / 1000</div></div><div class="auth-error" id="cs-report-error"></div></div>',
      footer: '<button class="btn-ghost" id="cs-report-cancel">Batal</button><button class="btn-primary" id="cs-report-submit" style="margin-left:8px"><i class="fa-solid fa-paper-plane"></i> Kirim</button>'
    });
    setTimeout(() => {
      const ta = document.getElementById('cs-report-content');
      ta?.addEventListener('input', () => { document.getElementById('cs-report-count').textContent = ta.value.length + ' / 1000'; });
      document.getElementById('cs-report-cancel')?.addEventListener('click', () => document.getElementById('modal-close')?.click());
      document.getElementById('cs-report-submit')?.addEventListener('click', async () => {
        const subject = document.getElementById('cs-report-subject')?.value.trim();
        const content = document.getElementById('cs-report-content')?.value.trim();
        const errEl = document.getElementById('cs-report-error');
        const btn = document.getElementById('cs-report-submit');
        if (!subject) { errEl.textContent = 'Judul wajib diisi.'; return; }
        if (!content) { errEl.textContent = 'Pesan wajib diisi.'; return; }
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';
        try {
          const userId = Auth.getUser()?.id;
          const { data: ticket, error: e1 } = await db().from('cs_tickets').insert({ user_id: userId, subject }).select().single();
          if (e1) throw e1;
          const { error: e2 } = await db().from('cs_messages').insert({ ticket_id: ticket.id, sender: 'user', sender_name: Auth.getName(), content });
          if (e2) throw e2;
          document.getElementById('modal-close')?.click();
          UI.toast('Laporan berhasil dikirim!', 'success');
        } catch (err) {
          errEl.textContent = 'Gagal: ' + err.message;
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim';
        }
      });
    }, 60);
  }

  function _esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  return { renderInbox, showNewReportModal };
})();
```

### 4.4 File Baru: js/cs-panel.js

```js
/* js/cs-panel.js - Stealth CS Panel */
'use strict';
window.Notara = window.Notara || {};

window.Notara.CSPanel = (() => {
  const db = () => window.Notara.db;
  const R  = window.Notara.Router;
  const UI = window.Notara.UI;
  const API = '/functions/v1/cs';
  let _token = null;

  function initShortcutListener() {
    window.addEventListener('keydown', e => {
      const p = [e.ctrlKey?'Control':'', e.shiftKey?'Shift':'', e.altKey?'Alt':'', e.code].filter(Boolean).join('+');
      if (p === 'Control+Shift+Alt+KeyA') { e.preventDefault(); _auth(); }
    });
  }

  async function _auth() {
    const pin = window.prompt('Kode Akses Customer Service:');
    if (!pin) return;
    try {
      const res = await fetch(API + '/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pin}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      _token = data.token;
      _renderPanel();
    } catch (err) { UI.toast('Akses ditolak: ' + err.message, 'error'); }
  }

  async function _renderPanel() {
    const main = document.getElementById('app-main');
    UI.setTitle('Panel CS');
    main.innerHTML = '<div class="cs-panel page-enter"><div class="cs-header"><h2><i class="fa-solid fa-headset"></i> Customer Service</h2><button class="btn-ghost" id="cs-close"><i class="fa-solid fa-xmark"></i> Tutup</button></div><div class="cs-body"><div class="cs-sidebar" id="cs-tickets"></div><div class="cs-detail" id="cs-detail"><div class="cs-empty">Pilih tiket untuk membalas</div></div></div></div>';
    document.getElementById('cs-close')?.addEventListener('click', () => { _token = null; R.go('home'); });
    await _loadTickets();
  }

  async function _loadTickets() {
    const res = await _fetch(API + '/tickets');
    const tickets = await res.json();
    document.getElementById('cs-tickets').innerHTML = tickets.map(t =>
      '<div class="cs-ticket-item" data-tid="' + t.id + '"><div class="cs-ticket-user">' + esc(t.user_name) + ' <span style="color:var(--text-3);font-size:0.75rem">(' + (t.msg_count||0) + ' pesan)</span></div><div class="cs-ticket-subject">' + esc(t.subject) + '</div><div class="cs-ticket-time">' + UI.formatDate(t.updated_at) + '</div>' + (t.status==='open'?'<span class="cs-badge-open">Aktif</span>':'') + '</div>'
    ).join('') || '<div class="cs-empty">Belum ada tiket</div>';
    document.querySelectorAll('.cs-ticket-item').forEach(i => i.addEventListener('click', () => _openTicket(i.dataset.tid)));
  }

  async function _openTicket(tid) {
    const res = await _fetch(API + '/tickets/' + tid + '/messages');
    const msgs = await res.json();
    const d = document.getElementById('cs-detail');
    d.innerHTML = '<div class="cs-messages">' + msgs.map(m =>
      '<div class="cs-bubble '+(m.sender==='cs'?'cs-out':'cs-in')+'"><div class="cs-bubble-name">'+esc(m.sender_name)+'</div><div class="cs-bubble-text">'+esc(m.content)+'</div><div class="cs-bubble-time">'+UI.formatDate(m.created_at)+'</div></div>'
    ).join('') + '</div><form class="cs-reply-form" data-tid="'+tid+'"><textarea class="cs-reply-input" placeholder="Balas sebagai CS..." required></textarea><button class="btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i></button></form>';
    d.querySelector('.cs-reply-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const input = d.querySelector('.cs-reply-input');
      const content = input.value.trim();
      if (!content) return;
      await _fetch(API+'/reply', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ticket_id:tid, content}) });
      input.value = '';
      await _openTicket(tid);
      await _loadTickets();
    });
    const msgs_el = d.querySelector('.cs-messages');
    if (msgs_el) msgs_el.scrollTop = msgs_el.scrollHeight;
  }

  async function _fetch(url, opts={}) {
    if (!_token) throw new Error('Belum login CS');
    return fetch(url, { ...opts, headers: { ...opts.headers, 'Authorization': 'Bearer '+_token } });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  return { initShortcutListener };
})();
```

### 4.5 Integrasi

**app.js** - tambah route + init:
```js
R.on('messages', () => { window.Notara.Messages.renderInbox(); });
// setelah Auth.init():
window.Notara.CSPanel.initShortcutListener();
```

**index.html** - load scripts sebelum app.js:
```html
<script src="js/messages.js"></script>
<script src="js/cs-panel.js"></script>
```

---

## 5. Edge Functions

### 5.1 cs-verify

```ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { SignJWT } from 'https://cdn.jsdelivr.net/npm/jose@5/+esm'

const PIN = Deno.env.get('CS_ADMIN_PIN')!
const SECRET = new TextEncoder().encode(Deno.env.get('CS_ADMIN_JWT_SECRET')!)

serve(async req => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const { pin } = await req.json()
  if (pin !== PIN) return Response.json({ error: 'PIN salah' }, { status: 401 })
  const token = await new SignJWT({ role:'cs_admin' }).setProtectedHeader({ alg:'HS256' }).setIssuedAt().setExpirationTime('15m').sign(SECRET)
  return Response.json({ token, expiresIn: 900 })
})
```

### 5.2 cs-tickets

```ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAdminToken } from '../_shared/auth.ts'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

serve(async req => {
  if (!verifyAdminToken(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const parts = url.pathname.split('/')
  const tid = parts.length > 3 ? parts[parts.length - 2] : null

  if (tid) {
    const { data } = await sb.from('cs_messages').select('*').eq('ticket_id', tid).order('created_at', { ascending: true })
    return Response.json(data || [])
  }

  const { data } = await sb.from('cs_tickets').select('*, cs_messages(count)').order('updated_at', { ascending: false })
  return Response.json((data||[]).map(t => ({ ...t, msg_count: t.cs_messages?.[0]?.count||0, user_name: 'User' })))
})
```

### 5.3 cs-reply

```ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAdminToken } from '../_shared/auth.ts'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

serve(async req => {
  if (!verifyAdminToken(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const { ticket_id, content } = await req.json()
  if (!ticket_id || !content?.trim()) return Response.json({ error: 'Invalid' }, { status: 400 })

  await sb.from('cs_messages').insert({ ticket_id, sender: 'cs', sender_name: 'Customer Service', content: content.trim() })
  await sb.from('cs_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticket_id)
  return Response.json({ success: true })
})
```

### 5.4 _shared/auth.ts

```ts
import { jwtVerify } from 'https://cdn.jsdelivr.net/npm/jose@5/+esm'
const SECRET = new TextEncoder().encode(Deno.env.get('CS_ADMIN_JWT_SECRET')!)
export async function verifyAdminToken(req: Request) {
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return false
  try { const { payload } = await jwtVerify(auth, SECRET); return payload.role === 'cs_admin' } catch { return false }
}
```

---

## 6. CSS Tambahan

```css
.messages-page { padding: var(--space-lg); }
.messages-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg); }
.messages-count { font-size: 0.8rem; color: var(--text-3); }
.msg-ticket-card { padding: var(--space-md); border: var(--border-w) solid var(--border); border-radius: var(--radius-md); margin-bottom: var(--space-sm); cursor: pointer; transition: background 0.15s; }
.msg-ticket-card:hover { background: var(--surface-hover); }
.msg-ticket-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.msg-ticket-status { font-size: 0.75rem; display: flex; align-items: center; gap: 4px; }
.msg-ticket-time { font-size: 0.72rem; color: var(--text-3); }
.msg-ticket-subject { font-weight: 600; color: var(--text-1); font-size: 0.9rem; }
.msg-detail-page { display: flex; flex-direction: column; height: 100vh; }
.msg-detail-header { display: flex; align-items: center; gap: var(--space-md); padding: var(--space-md) var(--space-lg); border-bottom: var(--border-w) solid var(--border); }
.msg-detail-subject { font-weight: 600; font-size: 0.95rem; }
.msg-detail-status { font-size: 0.75rem; color: var(--text-3); display: flex; align-items: center; gap: 4px; }
.msg-detail-body { flex: 1; overflow-y: auto; padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-sm); }
.msg-detail-footer { padding: var(--space-md) var(--space-lg); border-top: var(--border-w) solid var(--border); }
.msg-read-only-notice { font-size: 0.78rem; color: var(--text-3); text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; }
.msg-bubble { max-width: 80%; padding: var(--space-sm) var(--space-md); border-radius: 12px; font-size: 0.88rem; }
.msg-bubble.msg-left { align-self: flex-start; background: var(--surface-hover); border-bottom-left-radius: 4px; }
.msg-bubble.msg-right { align-self: flex-end; background: var(--accent); color: var(--bg); border-bottom-right-radius: 4px; }
.msg-text { line-height: 1.5; }
.msg-time { font-size: 0.68rem; opacity: 0.6; margin-top: 4px; }
.cs-badge-official { font-size: 0.62rem; background: var(--accent); color: var(--bg); padding: 2px 6px; border-radius: 999px; margin-bottom: 4px; display: inline-flex; gap: 4px; align-items: center; }
.cs-panel { display: grid; grid-template-columns: 320px 1fr; height: calc(100vh - 60px); }
.cs-header { grid-column: 1/-1; display: flex; justify-content: space-between; align-items: center; padding: var(--space-md) var(--space-lg); border-bottom: var(--border-w) solid var(--border); }
.cs-sidebar { border-right: var(--border-w) solid var(--border); overflow-y: auto; }
.cs-detail { display: flex; flex-direction: column; }
.cs-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-3); }
.cs-ticket-item { padding: var(--space-md); border-bottom: var(--border-w) solid var(--border); cursor: pointer; transition: background 0.15s; }
.cs-ticket-item:hover { background: var(--surface-hover); }
.cs-ticket-user { font-size: 0.82rem; font-weight: 600; }
.cs-ticket-subject { font-size: 0.78rem; color: var(--text-2); margin-top: 2px; }
.cs-ticket-time { font-size: 0.7rem; color: var(--text-3); margin-top: 2px; }
.cs-badge-open { font-size: 0.62rem; background: var(--label-easy); color: var(--bg); padding: 1px 6px; border-radius: 999px; margin-top: 4px; display: inline-block; }
.cs-messages { flex: 1; overflow-y: auto; padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-sm); }
.cs-bubble { max-width: 75%; padding: var(--space-sm) var(--space-md); border-radius: 12px; }
.cs-bubble.cs-out { align-self: flex-end; background: var(--accent); color: var(--bg); }
.cs-bubble.cs-in { align-self: flex-start; background: var(--surface-hover); }
.cs-bubble-name { font-size: 0.7rem; opacity: 0.7; margin-bottom: 2px; }
.cs-bubble-time { font-size: 0.65rem; opacity: 0.5; margin-top: 4px; }
.cs-reply-form { display: flex; gap: var(--space-sm); padding: var(--space-md); border-top: var(--border-w) solid var(--border); }
.cs-reply-input { flex: 1; min-height: 44px; resize: none; }
```

---

## 7. Secrets

| Name | Value |
|------|-------|
| `CS_ADMIN_PIN` | Random 6-8 digit |
| `CS_ADMIN_JWT_SECRET` | `openssl rand -base64 32` |

---

## 8. Checklist

- [ ] SQL: `cs_tickets` + `cs_messages` + RLS + indexes
- [ ] Edge Functions: `cs-verify`, `cs-tickets`, `cs-reply`, `_shared/auth.ts`
- [ ] Set secrets di Supabase Dashboard
- [ ] Deploy functions
- [ ] `js/messages.js` + `js/cs-panel.js`
- [ ] Sidebar tombol "Pesan" di `index.html`
- [ ] Route `#messages` di `app.js`
- [ ] Tombol "Kirim Laporan" di `settings.js`
- [ ] CSS `.msg-*` + `.cs-*`
- [ ] Load scripts di `index.html`
- [ ] Test flow user + CS
- [ ] Security audit

---

## 9. Roadmap

| Fase | Fitur |
|------|-------|
| MVP | Tabel baru, inbox user, panel CS hidden, one-way messaging |
| v1.1 | Realtime updates (Supabase Realtime) |
| v1.2 | Push notifications |
| v1.3 | Status reopened |
| v1.4 | File attachments |
| v1.5 | Multi-CS agent |
| v2.0 | Two-way chat (user bisa balas) |

---

## 10. Effort

| Task | Jam |
|------|-----|
| SQL Schema | 1 |
| Edge Functions | 3 |
| js/messages.js | 3 |
| js/cs-panel.js | 3 |
| Integrasi | 1.5 |
| CSS | 1 |
| Testing | 1.5 |
| **Total** | **~14** |
