# SPEC: Notara Offline-First

> Spesifikasi lengkap sistem offline-first untuk Notara.
> Status: **Draft** | Versi: 1.0 | Terakhir diperbarui: Juli 2026

---

## Ringkasan

Notara akan mendukung mode offline-first: semua data lokal tersimpan di IndexedDB perangkat, dan disinkronkan ke Supabase saat online. Ada dua mode user:

- **Guest (Tanpa Akun)** — semua fitur lokal bisa dipakai tanpa login. Data hanya di perangkat.
- **Logged-in** — data lokal + cloud. Sync otomatis saat online. Last-write-wins untuk konflik.

---

## Arsitektur

```
┌─────────────────────────────────────────────┐
│                  UI Layer                    │
│  notes.js  mood.js  habits.js  finance.js   │
├─────────────────────────────────────────────┤
│              Data Layer (NEW)               │
│  js/data.js — gateway untuk semua operasi   │
│  Cek online? → Supabase langsung            │
│  Cek offline? → IndexedDB + sync queue      │
├─────────────────────────────────────────────┤
│            Local Storage (NEW)              │
│  js/idb.js — IndexedDB wrapper              │
│  Table: notes, mood, habits, habit_logs,    │
│  finance_tx, finance_cat, sync_queue        │
├─────────────────────────────────────────────┤
│            Remote (existing)                │
│  Supabase — database, auth, realtime        │
└─────────────────────────────────────────────┘
```

---

## Dua Mode User

| | **Guest (Tanpa Akun)** | **Logged-in** |
|---|---|---|
| Data storage | IndexedDB lokal | IndexedDB + Supabase |
| Fitur lokal | Catatan, Mood, Kebiasaan, Keuangan, Tag — full akses | Sama |
| Fitur terbatas | Publikasi, Pesan CS, Komentar — **bisa akses halaman, tapi tampilkan placeholder + tombol login** | Semua |
| Sync | Gak ada | Otomatis saat online |
| Data migration | — | Auto-merge ke akun saat login |

> **Catatan:** Guest tetap bisa buka halaman fitur online (Publikasi, Pesan, Komentar), tapi isi nya placeholder yang mengarahkan ke login/register. Bukan block total.

---

## File Baru

### 1. `js/idb.js` — IndexedDB Wrapper

Database name: `notara-offline-v1`
Database version: 1

#### Object Stores

| Store | KeyPath | Indexes | Keterangan |
|-------|---------|---------|------------|
| `notes` | `id` | `user_id`, `updated_at` | Semua catatan user |
| `mood` | `id` | `user_id`, `date` (unique) | Satu entry per user per hari |
| `habit_lists` | `id` | `user_id` | Daftar kebiasaan |
| `habit_logs` | `id` | `habit_id`, `date` (unique) | Log kebiasaan per hari |
| `finance_tx` | `id` | `user_id`, `date` | Transaksi keuangan |
| `finance_cat` | `id` | `user_id` | Kategori keuangan |
| `tags` | `id` | `user_id` | Tag catatan |
| `note_tags` | `compound` | `note_id` | Relasi note-tag |
| `sync_queue` | `auto-increment` | `table`, `op`, `id` | Antrian sinkronisasi |

#### API

```js
window.Notara.IDB = {
  // Buka database
  init() → Promise<void>

  // CRUD generic
  getAll(store) → Promise<Array>
  get(store, key) → Promise<Object|undefined>
  put(store, data) → Promise<void>
  delete(store, key) → Promise<void>
  clear(store) → Promise<void>

  // Query dengan filter
  getAllByIndex(store, indexName, value) → Promise<Array>

  // Sync queue
  addToSyncQueue(entry) → Promise<void>
  // entry = { table, op, record_id, data, timestamp, user_id }
  getSyncQueue() → Promise<Array>
  removeFromSyncQueue(id) → Promise<void>
  clearSyncQueue() → Promise<void>

  // Utility
  count(store) → Promise<number>
  isReady() → boolean
}
```

#### Design Notes

- Semua operasi `put()` otomatis tambah field `updated_at` kalau belum ada.
- `sync_queue` entry punya struktur:
  ```js
  {
    id: auto-increment,
    table: 'notes',        // nama store
    op: 'upsert',          // 'upsert' | 'delete'
    record_id: 'uuid',     // ID record yang berubah
    data: { ... },         // data record lengkap
    timestamp: ISO string, // kapan perubahan terjadi
    user_id: 'uuid',       // user yang punya data
    synced: false          // sudah dikirim ke server?
  }
  ```

---

### 2. `js/data.js` — Data Layer Gateway

Setiap modul panggil `Data` bukan langsung `db()`.

#### Struktur

```js
window.Notara.Data = (() => {
  const IDB = () => window.Notara.IDB;
  const db  = () => window.Notara.db;
  const Auth = () => window.Notara.Auth;

  // ── Status ──
  function isOnline() { return navigator.onLine; }
  function isGuest() { return Auth().isGuest(); }
  function getUserId() { return Auth().getUser()?.id || _getGuestId(); }

  // ── Notes ──
  const notes = {
    async getAll() { ... },
    async getById(id) { ... },
    async create(data) { ... },
    async update(id, changes) { ... },
    async remove(id) { ... },
    async getTrash() { ... },
    async restore(id) { ... },
    async permanentDelete(id) { ... },
    async search(query, filters) { ... },
    async count() { ... },
    async trashCount() { ... },
  };

  // ── Mood ──
  const mood = {
    async getToday() { ... },
    async getHistory(days) { ... },
    async save(mood, triggers, note) { ... },
    async remove() { ... },
  };

  // ── Habits ──
  const habits = {
    async getAll() { ... },
    async create(name) { ... },
    async update(id, changes) { ... },
    async remove(id) { ... },
    async toggleLog(habitId, date) { ... },
    async getTodayLogs() { ... },
    async getStreak(habitId) { ... },
    async getCompletionRate(habitId, days) { ... },
  };

  // ── Finance ──
  const finance = {
    async getByMonth(year, month) { ... },
    async getCategories() { ... },
    async addTransaction(data) { ... },
    async removeTransaction(id) { ... },
  };

  // ── Tags ──
  const tags = {
    async getAll() { ... },
    async create(name, color) { ... },
    async update(id, changes) { ... },
    async remove(id) { ... },
    async getNoteTags(noteId) { ... },
    async setNoteTags(noteId, tagIds) { ... },
  };

  // ── Sync Engine ──
  const sync = {
    async process() { ... },      // Proses sync_queue
    async push() { ... },         // Kirim local changes ke server
    async pull() { ... },         // Ambil server changes ke local
    async full() { ... },         // pull → merge → push
    async mergeGuestData() { ... }, // Guest → account migration
  };

  return { isOnline, isGuest, getUserId, notes, mood, habits, finance, tags, sync };
})();
```

#### Data Flow Pattern

```
Operasi Write (create/update/delete):
  1. Tulis ke IndexedDB langsung (instant)
  2. Tambah ke sync_queue
  3. Kalau online → langsung push ke Supabase (background)
  4. Kalau offline → queue nunggu

Operasi Read (getAll/getById):
  1. Baca dari IndexedDB
  2. Kalau online + data belum lama (< 5 menit) → return
  3. Kalau online + data lama → fetch dari Supabase, update IndexedDB
  4. Kalau offline → return dari IndexedDB aja
```

#### Last-Write-Wins Merge

```
Saat sync.pull():
  1. Fetch semua record dari Supabase yang updated_at > last_sync_at
  2. Untuk setiap record server:
     a. Ambil versi lokal dari IndexedDB
     b. Bandingkan updated_at
     c. Kalau server lebih baru → overwrite lokal
     d. Kalau lokal lebih baru → skip (sudah di-push nanti)
     e. Kalau sama → server menang (default)
  3. Update last_sync_at di localStorage
```

#### Sync Queue Processing

```
Saat sync.push():
  1. Ambil semua entry dari sync_queue (belum synced)
  2. Sortir berdasarkan timestamp
  3. Untuk setiap entry:
     a. Kalau op = 'upsert' → db().from(table).upsert(data)
     b. Kalau op = 'delete' → db().from(table).delete().eq('id', record_id)
     c. Kalau berhasil → tandai synced, hapus dari queue
     d. Kalau gagal → skip, coba lagi nanti
  4. Setelah semua selesai → clear synced entries
```

---

### 3. `js/guest.js` — Guest Mode Handler

#### Struktur

```js
window.Notara.Guest = (() => {
  const STORAGE_KEY = 'notara_guest_id';
  const GUEST_FEATURES = ['notes', 'mood', 'habits', 'finance', 'tags'];
  const RESTRICTED = ['posts', 'messages', 'comments', 'cs_panel'];

  function _getGuestId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  function isGuestMode() {
    return !window.Notara.Auth.isLoggedIn() && !!localStorage.getItem(STORAGE_KEY);
  }

  function canAccess(feature) {
    if (!isGuestMode()) return true;
    return GUEST_FEATURES.includes(feature);
  }

  function enterGuestMode() {
    // Set Auth state sebagai guest
  }

  function clearGuestData() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return { isGuestMode, canAccess, enterGuestMode, clearGuestData, _getGuestId };
})();
```

#### UI Changes

Tombol "Masuk sebagai Tamu" ditambahkan di halaman auth:

```
┌─────────────────────────────┐
│        NOTARA               │
│   Catatan modern, ...       │
│                             │
│  ┌──────┐  ┌──────┐        │
│  │ Masuk│  │Daftar│        │
│  └──────┘  └──────┘        │
│                             │
│  ──── atau ────             │
│                             │
│  ┌──────────────────────┐   │
│  │  Masuk sebagai Tamu  │   │
│  └──────────────────────┘   │
│                             │
│  Data tersimpan lokal di    │
│  perangkatmu.               │
└─────────────────────────────┘
```

---

## File Yang Diubah

### 4. `js/auth.js`

Perubahan:

- Tambah state `_isGuest` flag
- Tambah method `isGuest()` → return `_isGuest`
- `renderAuthPage()` → tambah tombol "Masuk sebagai Tamu"
- `enterGuestMode()` → set `_isGuest = true`, `_user = {id: guestId, is_guest: true}`
- Saat register/login berhasil → panggil `Data.sync.mergeGuestData()` kalau ada data guest

```js
// Tambahan di auth.js
function isGuest() { return _isGuest; }

async function enterGuestMode() {
  _isGuest = true;
  _user = { id: Guest._getGuestId(), is_guest: true, user_metadata: { name: 'Tamu' } };
  if (_onReadyCb) _onReadyCb(false); // false = not logged in, but guest
}

async function register(email, name, password) {
  // ... existing code ...
  // Setelah register berhasil:
  if (Guest.isGuestMode()) {
    await Data.sync.mergeGuestData(_user.id);
    Guest.clearGuestData();
  }
}

async function login(email, password) {
  // ... existing code ...
  // Setelah login berhasil:
  if (Guest.isGuestMode()) {
    await Data.sync.mergeGuestData(_user.id);
    Guest.clearGuestData();
  }
}
```

### 5. `js/notes.js`

Perubahan: semua operasi CRUD dialihkan ke `Data.notes.*`

| Sebelum | Sesudah |
|---------|---------|
| `db().from('notes').select('*')...` | `Data.notes.getAll()` |
| `db().from('notes').insert(row)...` | `Data.notes.create(data)` |
| `db().from('notes').update(changes)...` | `Data.notes.update(id, changes)` |
| `db().from('notes').update({deleted_at})...` | `Data.notes.remove(id)` |
| In-memory cache (`_cache` / `_cacheTs`) | Dihapus — IndexedDB menggantikan |

**Search:** tetap client-side, tapi data source dari IndexedDB bukan Supabase.

### 6. `js/mood.js`

| Sebelum | Sesudah |
|---------|---------|
| `db().from('mood_entries').select('*')...` | `Data.mood.getToday()` |
| `db().from('mood_entries').select('*')...` | `Data.mood.getHistory(days)` |
| `db().from('mood_entries').upsert(...)` | `Data.mood.save(mood, triggers, note)` |
| `db().from('mood_entries').delete()...` | `Data.mood.remove()` |

### 7. `js/habits.js`

| Sebelum | Sesudah |
|---------|---------|
| `db().from('habit_lists').select('*')...` | `Data.habits.getAll()` |
| `db().from('habit_lists').insert(...)` | `Data.habits.create(name)` |
| `db().from('habit_lists').update(...)` | `Data.habits.update(id, changes)` |
| `db().from('habit_lists').update({active:false})` | `Data.habits.remove(id)` |
| `db().from('habit_logs').select('*')...` | `Data.habits.getTodayLogs()` |
| Toggle logic (2 queries) | `Data.habits.toggleLog(habitId, date)` |
| `getStreak()` (fetch semua logs) | `Data.habits.getStreak(habitId)` — hitung dari IndexedDB |

### 8. `js/finance.js`

| Sebelum | Sesudah |
|---------|---------|
| `db().from('finance_transactions').select('*')...` | `Data.finance.getByMonth(year, month)` |
| `db().from('finance_transactions').insert(...)` | `Data.finance.addTransaction(data)` |
| `db().from('finance_transactions').delete()...` | `Data.finance.removeTransaction(id)` |
| `db().from('finance_categories').select('*')...` | `Data.finance.getCategories()` |

### 9. `js/tags.js`

| Sebelum | Sesudah |
|---------|---------|
| `db().from('tags').select('*')...` | `Data.tags.getAll()` |
| `db().from('tags').insert(...)` | `Data.tags.create(name, color)` |
| `db().from('note_tags').select('*')...` | `Data.tags.getNoteTags(noteId)` |
| `db().from('note_tags').delete().insert(...)` | `Data.tags.setNoteTags(noteId, tagIds)` |

### 10. `sw.js`

Perubahan:

- Hapus network-only bypass untuk `*.supabase.co` (baris 42-44)
- Tambah runtime cache untuk Supabase GET (TTL: 5 menit)
- Tambah offline fallback page dengan data dari IndexedDB
- Tambah `cache Supabase responses` strategy

```js
// Update strategi caching
const SUPABASE_CACHE_TTL = 5 * 60 * 1000; // 5 menit

// network-first untuk Supabase GET, cache-first untuk aset
if (url.hostname.includes('supabase.co')) {
  if (request.method === 'GET') {
    // Network first, fallback ke cache
    event.respondWith(
      fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request))
    );
  }
  // POST/PUT/DELETE → network only, fallback ke sync_queue
}
```

### 11. `index.html`

Tambah script tags (sebelum `app.js`):

```html
<script src="js/idb.js"></script>
<script src="js/guest.js"></script>
<script src="js/data.js"></script>
```

### 12. `js/app.js`

- Panggil `IDB.init()` saat app mount
- Panggil `Data.sync.process()` saat user online lagi
- Tambah offline/online indicator di topbar
- Handle guest mode restrictions (sembunyikan tombol Publikasi, Pesan, dll)

---

## Sync Flow

### Saat App Load

```
User buka app
  → Data.init()
    → IDB.init() — buka IndexedDB
    → Cek status online
    → Kalau online + logged-in:
        → Data.sync.full()
          → pull() — ambil data baru dari server
          → merge() — bandingkan local vs server, last-write-wins
          → push() — kirim local changes ke server
    → Kalau online + guest:
        → Local only (IndexedDB)
    → Kalau offline:
        → Local only (IndexedDB)
```

### Saat User Write (Create/Update/Delete)

```
User bikin/edit/hapus catatan
  → Data.notes.create/update/remove()
    1. Tulis ke IndexedDB langsung (instant, gak nunggu network)
    2. Tambah entry ke sync_queue
    3. Kalau online:
         → Langsung push ke Supabase (background, gak block UI)
         → Kalau berhasil → hapus dari sync_queue
         → Kalau gagal → keep di queue, retry nanti
    4. Kalau offline:
         → Queue nunggu. User gak ngerasa apa-apa.
```

### Saat User Online Lagi

```
navigator.onLine event fires
  → Data.sync.process()
    → Ambil semua entry dari sync_queue (belum synced)
    → Sortir berdasarkan timestamp
    → Untuk setiap entry:
      → Push ke Supabase
      → Kalau berhasil → tandai synced
      → Kalau gagal → skip, coba lagi nanti (max 3 retry)
    → Hapus semua synced entries dari queue
    → Update last_sync_at
```

### Last-Write-Wins Merge Logic

```
Saat sync.pull():
  1. Fetch dari Supabase WHERE updated_at > last_sync_at
  2. Untuk setiap record dari server:
     a. Ambil versi lokal dari IndexedDB (berdasarkan ID)
     b. Kalau lokal gak ada → simpan server version
     c. Kalau lokal ada:
        → Bandingkan updated_at
        → Kalau server lebih baru → overwrite lokal
        → Kalau lokal lebih baru → skip (nanti di-push)
        → Kalau sama → server menang
  3. Update last_sync_at di localStorage
```

---

## Guest → Account Migration

### Flow

```
1. User guest klik "Daftar" / "Masuk"
2. Submit form → Supabase register/login
3. On success:
   a. Ambil semua data dari IndexedDB:
      - notes (filter user_id = guest_id)
      - mood (filter user_id = guest_id)
      - habit_lists (filter user_id = guest_id)
      - habit_logs (filter habit_id IN habit_lists)
      - finance_tx (filter user_id = guest_id)
      - finance_cat (filter user_id = guest_id)
      - tags (filter user_id = guest_id)
   b. Transform: ganti user_id dari guest_id → real user_id
   c. Bulk insert ke Supabase:
      - notes → db().from('notes').upsert(notesData)
      - mood → db().from('mood_entries').upsert(moodData)
      - habits → db().from('habit_lists').upsert(habitData)
      - habit_logs → db().from('habit_logs').upsert(habitLogsData)
      - finance → db().from('finance_transactions').upsert(financeData)
      - finance_cat → db().from('finance_categories').upsert(financeCatData)
      - tags → db().from('tags').upsert(tagsData)
   d. Hapus guest_id dari localStorage
   e. Update IndexedDB: ganti semua user_id guest → real user_id
   f. Tandai semua data sebagai synced
```

### Conflict Handling During Migration

- Kalau user sudah punya data di Supabase (register dari device lain) → merge
- Last-write-wins tetap berlaku
- Data guest yang lebih baru meng-overwrite data server yang lama

---

## UI Indicators

### Offline Badge

Di topbar, tampilkan badge saat offline:

```
┌──────────────────────────────────────────┐
│ ☰  Notara          🔴 Offline    🌙  + │
└──────────────────────────────────────────┘
```

### Sync Status

Saat sync sedang berjalan:

```
┌──────────────────────────────────────────┐
│ ☰  Notara    🔄 Syncing...      🌙  +  │
└──────────────────────────────────────────┘
```

### Guest Mode Banner

Saat user mode guest, tampilkan banner di bawah topbar:

```
┌──────────────────────────────────────────┐
│ ⚠️ Mode Tamu — Data hanya tersimpan      │
│ lokal. Masuk untuk sync ke cloud.        │
│                            [Masuk] [✕]   │
└──────────────────────────────────────────┘
```

### Fitur Terbatas (Guest)

Guest tetap bisa buka halaman fitur online. Halaman menampilkan placeholder yang informatif + tombol login/register.

**Contoh: Halaman Publikasi (Guest)**

```
┌─────────────────────────────────────────────┐
│ 📢 Publikasi                                │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │        (ikon/gambar placeholder)    │    │
│  │                                     │    │
│  │   Butuh akun untuk melihat          │    │
│  │   publikasi dari pengguna lain.     │    │
│  │                                     │    │
│  │   Buat akun gratis dalam hitungan   │    │
│  │   detik, atau masuk jika sudah      │    │
│  │   punya akun.                       │    │
│  │                                     │    │
│  │   ┌──────────────┐ ┌──────────┐    │    │
│  │   │  Buat Akun   │ │  Masuk   │    │    │
│  │   └──────────────┘ └──────────┘    │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

**Contoh: Halaman Pesan CS (Guest)**

```
┌─────────────────────────────────────────────┐
│ 💬 Pesan                                    │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │        (ikon headset placeholder)   │    │
│  │                                     │    │
│  │   Hubungi Customer Service          │    │
│  │   memerlukan akun.                  │    │
│  │                                     │    │
│  │   Masuk atau daftar untuk mengirim  │    │
│  │   pesan, kritik, atau laporan bug.  │    │
│  │                                     │    │
│  │   ┌──────────────┐ ┌──────────┐    │    │
│  │   │  Buat Akun   │ │  Masuk   │    │    │
│  │   └──────────────┘ └──────────┘    │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

**Fitur yang tetap placeholder:**
- Publikasi → "Butuh akun untuk melihat publikasi"
- Pesan CS → "Hubungi CS memerlukan akun"
- Komentar → "Masuk untuk berkomentar"
- Semua placeholder punya tombol `[Buat Akun]` + `[Masuk]`

**Mode offline (sudah login tapi internet mati):**
- Buka halaman Publikasi → placeholder: "Koneksi internet diperlukan. Periksa jaringanmu."
- Buka Pesan CS → placeholder: "Koneksi internet diperlukan untuk mengirim pesan."
- Tanpa tombol login (sudah login), tapi dengan tombol retry/reload

---

## IndexedDB Schema Detail

### Store: `notes`

```js
{
  id: 'uuid',
  user_id: 'uuid',
  title: 'string',
  content: 'string',
  label: 'string|null',
  pinned: 'boolean',
  favorite: 'boolean',
  locked: 'boolean',
  lock_pin: 'string|null',
  hidden: 'boolean',
  deadline: 'string|null',
  reminder_at: 'string|null',
  group_id: 'string|null',
  deleted_at: 'string|null',    // soft delete
  created_at: 'string',
  updated_at: 'string',
  _synced: 'boolean'            // sudah di-sync ke server?
}
```

### Store: `mood`

```js
{
  id: 'uuid',
  user_id: 'uuid',
  date: 'string',               // YYYY-MM-DD
  mood: 'string',               // very_happy, happy, neutral, sad, very_sad
  triggers: 'array<string>',
  note: 'string|null',
  created_at: 'string',
  updated_at: 'string',
  _synced: 'boolean'
}
```

### Store: `habit_lists`

```js
{
  id: 'uuid',
  user_id: 'uuid',
  name: 'string',
  active: 'boolean',
  sort_order: 'number',
  created_at: 'string',
  updated_at: 'string',
  _synced: 'boolean'
}
```

### Store: `habit_logs`

```js
{
  id: 'uuid',
  habit_id: 'uuid',
  user_id: 'uuid',
  date: 'string',               // YYYY-MM-DD
  completed: 'boolean',
  created_at: 'string',
  updated_at: 'string',
  _synced: 'boolean'
}
```

### Store: `finance_tx`

```js
{
  id: 'uuid',
  user_id: 'uuid',
  type: 'string',               // 'income' | 'expense'
  category: 'string',
  amount: 'number',
  description: 'string|null',
  transaction_date: 'string',
  created_at: 'string',
  updated_at: 'string',
  _synced: 'boolean'
}
```

### Store: `finance_cat`

```js
{
  id: 'uuid',
  user_id: 'uuid',
  name: 'string',
  color: 'string',
  sort_order: 'number',
  created_at: 'string',
  updated_at: 'string',
  _synced: 'boolean'
}
```

### Store: `tags`

```js
{
  id: 'uuid',
  user_id: 'uuid',
  name: 'string',
  color: 'string',
  created_at: 'string',
  updated_at: 'string',
  _synced: 'boolean'
}
```

### Store: `note_tags`

```js
{
  note_id: 'uuid',
  tag_id: 'uuid',
  _synced: 'boolean'
}
```

### Store: `sync_queue`

```js
{
  id: 'auto-increment',
  table: 'string',              // nama store
  op: 'string',                 // 'upsert' | 'delete'
  record_id: 'uuid',            // ID record yang berubah
  data: 'object',               // data record lengkap
  timestamp: 'string',          // ISO string, kapan perubahan terjadi
  user_id: 'uuid',              // user yang punya data
  synced: 'boolean'             // sudah dikirim ke server?
}
```

---

## Implementation Phases

| Phase | Scope | File Baru | File Ubah | Estimasi |
|-------|-------|-----------|-----------|----------|
| **1** | IndexedDB wrapper | `js/idb.js` | — | 1 file |
| **2** | Data layer + sync engine | `js/data.js` | — | 1 file |
| **3** | Guest mode | `js/guest.js` | `js/auth.js`, `js/app.js`, `index.html` | 4 files |
| **4** | Notes offline | — | `js/notes.js` | 1 file |
| **5** | Mood + Habits offline | — | `js/mood.js`, `js/habits.js` | 2 files |
| **6** | Finance + Tags offline | — | `js/finance.js`, `js/tags.js` | 2 files |
| **7** | Service worker update | — | `sw.js` | 1 file |
| **8** | Guest → account migration | — | `js/data.js`, `js/auth.js` | 2 files |
| **9** | UI indicators | — | `js/app.js`, CSS | 2 files |

### Total: 3 file baru + 10 file diubah

---

## Risks & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| IndexedDB penuh (5-10MB limit) | Data gak tersimpan | Tampilkan warning, batasi jumlah catatan offline |
| Sync conflict data besar | Merge lama | Batch sync, limit 100 record per batch |
| Guest data hilang (clear browser) | Semua data lokal hilang | Tampilkan peringatan saat clear data |
| Race condition saat sync | Data corrupt | Queue serial, satu sync per user |
| Supabase rate limit | Sync gagal | Exponential backoff, max 3 retry |

---

## Testing Checklist

- [ ] Buka app tanpa internet → data lokal tetap muncul
- [ ] Bikin catatan offline → tersimpan di IndexedDB
- [ ] Online lagi → catatan muncul di Supabase
- [ ] Edit catatan di 2 device offline → last-write-wins
- [ ] Guest mode → semua fitur lokal jalan
- [ ] Guest buka Publikasi → placeholder + tombol login muncul
- [ ] Guest buka Pesan CS → placeholder + tombol login muncul
- [ ] Guest daftar akun → data merge otomatis
- [ ] Login → sync pertama kali berjalan
- [ ] Offline (sudah login) buka Publikasi → placeholder "perlu internet" muncul
- [ ] Offline (sudah login) buka Pesan CS → placeholder "perlu internet" muncul
- [ ] Offline indicator muncul di topbar
- [ ] Sync indicator muncul saat syncing
