# Notara Tracker System - Dokumen Perencanaan

## Ikhtisar

Sistem tracker baru untuk Notara yang terdiri dari 3 modul independen:

| Modul | Sifat Data | Reset | Halaman | Route |
|-------|-----------|-------|---------|-------|
| Mood Tracker | Tunggal per hari | Jam 00:00 | Halaman mandiri | `#mood` |
| Habit Tracker | Multi-item per hari | Jam 00:00 (centang) | Halaman mandiri | `#habits` |
| Finance Tracker | Akumulatif (kapan saja) | Bulanan (laporan) | Halaman mandiri | `#finance` |

> **Catatan**: Setiap modul adalah **halaman SPA mandiri** dengan route `#mood`, `#habits`, `#finance`. Masing-masing memiliki file JS sendiri (`mood.js`, `habits.js`, `finance.js`) yang mengekspos fungsi `renderPage()` — mengikuti pattern page rendering yang sudah ada (seperti `settings.js`, `posts.js`).
>
> Semua data disimpan di **Supabase** sebagai primary storage. LocalStorage hanya sebagai cache opsional untuk offline support.

---

## 1. Mood Tracker

### 1.1 Deskripsi

Modul perekaman emosi harian. User hanya bisa mengisi **1 mood per hari**.

### 1.2 Sistem Reset Harian

- **Trigger**: Jam 00:00 (midnight)
- **Mekanisme**: Cek apakah sudah ada entry mood untuk tanggal hari ini
  - Jika **belum ada** → tampilkan form input mood baru
  - Jika **sudah ada** → sembunyikan form, tampilkan rangkuman/grafik mood hari ini
- **Implementasi**: `setInterval` atau Service Worker background check saat app dibuka

### 1.3 Komponen Input (UI)

**Library**: [Phosphor Icons](https://phosphoricons.com/) — CDN: `https://unpkg.com/@phosphor-icons/web`

**Mekanisme ikon**: Outline = tidak aktif/default, Solid = aktif/terpilih.

```
┌─────────────────────────────────────────┐
│  Bagaimana perasaanmu hari ini?          │
│                                          │
│  [ph-thumbs-up]  [ph-smiley]  [ph-meh]  │
│   Sangat Senang    Senang    Biasa Aja   │
│                                          │
│  [ph-frown]      [ph-sad]               │
│   Sedih           Buruk                  │
│                                          │
│  Pemicu (opsional):                      │
│  ☐ Pekerjaan  ☐ Kesehatan  ☐ Keluarga  │
│  ☐ Teman      ☐ Cuaca     ☐ Lainnya    │
│                                          │
│  Catatan (opsional):                     │
│  ┌─────────────────────────────────┐    │
│  │ Alasan spesifik...              │    │
│  └─────────────────────────────────┘    │
│                                          │
│  [ Simpan Mood ]                         │
└─────────────────────────────────────────┘
```

| Komponen | Tipe | Wajib | Keterangan |
|----------|------|-------|------------|
| Mood Utama | Tombol Phosphor Icon (5 pilihan) | Ya | Outline = default, Solid = aktif |
| Pemicu | Checkbox/Tag | Tidak | Array string: `["work", "health"]` |
| Catatan Pendek | Textarea | Tidak | Max 200 karakter |

### 1.3.1 Pemetaan Mood ke Phosphor Icons

| Mood Value | Label | Icon Default (ph-*) | Icon Aktif (ph-fill) |
|-----------|-------|---------------------|----------------------|
| `very_happy` | Sangat Senang | `ph-smiley` | `ph-fill ph-smiley` |
| `happy` | Senang | `ph-smiley-wink` | `ph-fill ph-smiley-wink` |
| `neutral` | Biasa Aja | `ph-smiley-meh` | `ph-fill ph-smiley-meh` |
| `sad` | Sedih | `ph-smiley-sad` | `ph-fill ph-smiley-sad` |
| `very_sad` | Buruk | `ph-smiley-angry` | `ph-fill ph-smiley-angry` |

**Behaviour CSS**:
```css
/* Default state — outline */
.mood-btn i { color: var(--text-3); font-size: 1.8rem; }

/* Hover — outline saja, tapi aksen */
.mood-btn:hover i { color: var(--accent); }

/* Aktif/terpilih — switch ke fill */
.mood-btn.active i::before {
  /* Phosphor: ganti class "ph" → "ph-fill" saat active via JS */
}
```

### 1.4 Struktur Data (Supabase Table: `mood_entries`)

```sql
CREATE TABLE public.mood_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,                          -- Key utama, format: YYYY-MM-DD
  mood text NOT NULL CHECK (mood IN ('very_happy', 'happy', 'neutral', 'sad', 'very_sad')),
  triggers text[] DEFAULT '{}',                -- Array tag pemicu
  note text DEFAULT '',                        -- Catatan pendek
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mood_entries_pkey PRIMARY KEY (id),
  CONSTRAINT mood_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT mood_entries_user_date_unique UNIQUE (user_id, date)  -- 1 user = 1 mood per hari
);
```

### 1.5 Contoh Data

```
{
  id: "uuid-001",
  user_id: "user-uuid",
  date: "2026-07-18",
  mood: "happy",
  triggers: ["work", "health"],
  note: "Project kelar, lega banget!",
  created_at: "2026-07-18T08:30:00Z",
  updated_at: "2026-07-18T08:30:00Z"
}
```

### 1.6 Tampilan Rangkuman

- **Hari ini**: Card dengan emoji besar + triggers sebagai tag
- **Grafik 7 hari terakhir**: Bar chart sederhana atau emoji sequence
- **Heatmap mood**: Mirror dari heatmap writing activity yang sudah ada

### 1.7 Module Structure (mood.js)

Semua fungsi ada dalam 1 IIFE module `window.Notara.MoodTracker` — mirip pattern `settings.js`.

```javascript
window.Notara.MoodTracker = (() => {

  // ── Supabase CRUD ──
  async function getToday(userId) { /* ambil mood hari ini */ }
  async function save(userId, data) { /* simpan/update mood hari ini */ }
  async function getHistory(userId, days) { /* riwayat N hari terakhir */ }

  // ── Kalkulasi ──
  async function getWeeklyAvg(userId) { /* rata-rata mood 1-5 */ }

  // ── Page Render ──
  async function renderPage() { /* inject HTML ke #app-main + bind events */ }
  function _bindEvents() { /* click handler mood btn, pemicu, dll */ }
  function _showSummary(todayMood) { /* tampilkan rangkuman jika sudah terisi */ }

  // ── Helper ──
  function _getMoodIcon(moodValue, filled) { /* pilih Phosphor icon outline/fill */ }
  function _getMoodLabel(moodValue) { /* "Sangat Senang", dll */ }

  return { renderPage, getToday, save, getHistory, getWeeklyAvg };
})();
```

---

## 2. Habit Tracker

### 2.1 Deskripsi

Modul pelacakan kebiasaan/rutinitas harian dengan daftar yang bisa diulang setiap hari.

### 2.2 Sistem Reset Harian

- **Trigger**: Jam 00:00 (midnight)
- **Mekanisme**:
  1. Pada jam 00:00, **semua checkbox hari ini otomatis ter-reset** (kosong)
  2. **Status centang hari sebelumnya terkunci** dan masuk ke `habit_logs` sebagai riwayat
  3. Data master daftar kebiasaan **TIDAK di-reset**, hanya log harian yang berubah
- **Implementasi**: Background job atau check saat app pertama kali dibuka di hari baru

### 2.3 Komponen Input (UI)

#### Panel Manajemen Kebiasaan

```
┌─────────────────────────────────────────┐
│  Kelola Kebiasaan                        │
│                                          │
│  ✏️ Minum Air 2L            [Edit][Hapus]│
│  ✏️ Membaca 30 menit        [Edit][Hapus]│
│  ✏️ Olahraga                 [Edit][Hapus]│
│                                          │
│  [+ Tambah Kebiasaan Baru]               │
└─────────────────────────────────────────┘
```

#### Checklist Harian

```
┌─────────────────────────────────────────┐
│  Kebiasaan Hari Ini - 18 Juli 2026      │
│                                          │
│  ☑ Minum Air 2L              ✅ Selesai │
│  ☑ Membaca 30 menit          ✅ Selesai │
│  ☐ Olahraga                  ⏳ Belum   │
│                                          │
│  Progress: 2/3 (67%)                    │
│  ████████████░░░░░                      │
└─────────────────────────────────────────┘
```

### 2.4 Struktur Data (Supabase Tables)

#### Tabel Master: `habit_lists`

```sql
CREATE TABLE public.habit_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,                         -- Nama kebiasaan
  sort_order integer DEFAULT 0,              -- Urutan tampilan
  active boolean DEFAULT true,               -- Apakah masih aktif
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT habit_lists_pkey PRIMARY KEY (id),
  CONSTRAINT habit_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
```

#### Tabel Log Harian: `habit_logs`

```sql
CREATE TABLE public.habit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  habit_id uuid NOT NULL,                    -- Reference ke habit_lists
  date date NOT NULL,                        -- Tanggal pencatatan
  completed boolean DEFAULT false,           -- Status centang
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT habit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT habit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT habit_logs_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES public.habit_lists(id),
  CONSTRAINT habit_logs_user_habit_date_unique UNIQUE (user_id, habit_id, date)
);
```

### 2.5 Contoh Data

#### Master List
```json
[
  { "id": "habit-001", "user_id": "user-uuid", "name": "Minum Air 2L", "sort_order": 0, "active": true },
  { "id": "habit-002", "user_id": "user-uuid", "name": "Membaca 30 menit", "sort_order": 1, "active": true },
  { "id": "habit-003", "user_id": "user-uuid", "name": "Olahraga", "sort_order": 2, "active": true }
]
```

#### Log Hari Ini
```json
[
  { "habit_id": "habit-001", "date": "2026-07-18", "completed": true },
  { "habit_id": "habit-002", "date": "2026-07-18", "completed": true },
  { "habit_id": "habit-003", "date": "2026-07-18", "completed": false }
]
```

### 2.6 Fitur Tambahan

- **Streak Counter**: Hitung berapa hari berturut-turut kebiasaan diselesaikan
- **Completion Rate**: Persentase keberhasilan per kebiasaan (7 hari / 30 hari terakhir)
- **Calendar View**: Klik tanggal untuk lihat log kebiasaan hari itu

### 2.7 Module Structure (habits.js)

```javascript
window.Notara.HabitTracker = (() => {

  // ── Master CRUD ──
  async function getAll(userId) { /* daftar habit user */ }
  async function create(userId, name) { /* tambah habit baru */ }
  async function update(id, changes) { /* edit nama/urutan */ }
  async function remove(id) { /* hapus habit */ }
  async function reorder(id, newOrder) { /* ubah urutan */ }

  // ── Daily Log ──
  async function getTodayLogs(userId) { /* log hari ini */ }
  async function toggle(userId, habitId, date) { /* centang/uncentang */ }
  async function resetDailyCheckboxes(userId) { /* reset jam 00:00 */ }
  async function getLogsByDate(userId, date) { /* log tanggal tertentu */ }

  // ── Stats ──
  async function getStreak(habitId) { /* streak kebiasaan */ }
  async function getCompletionRate(habitId, days) { /* % selesai N hari */ }
  async function getWeeklySummary(userId) { /* ringkasan minggu ini */ }

  // ── Page Render ──
  async function renderPage() { /* inject HTML ke #app-main + bind events */ }
  function _bindChecklistEvents() { /* toggle checkbox saat diklik */ }
  function _showManagePanel() { /* modal/form tambah/edit habit */ }

  return { renderPage, getAll, create, update, remove, toggle, getTodayLogs, getStreak, getCompletionRate };
})();
```

---

## 3. Finance Tracker

### 3.1 Deskripsi

Modul pencatatan keuangan berbasis transaksi. Bersifat **akumulatif**, tidak di-reset setiap hari.

### 3.2 Sistem Waktu

- **TIDAK ada reset jam 00:00**
- Setiap transaksi dicatat dengan timestamp kapanpun user input
- **Laporan dikelompokkan per bulan** untuk melihat ringkasan
- Saldo terus berakumulasi dari waktu ke waktu

### 3.3 Komponen Input (UI)

#### Form Transaksi Baru

```
┌─────────────────────────────────────────┐
│  Transaksi Baru                          │
│                                          │
│  [ 💰 Pemasukan ]  [ 💸 Pengeluaran ]   │
│                                          │
│  Nominal:                                │
│  ┌─────────────────────────────────┐    │
│  │ Rp 50.000                       │    │
│  └─────────────────────────────────┘    │
│                                          │
│  Kategori:                               │
│  ┌─────────────────────────────────┐    │
│  │ 🍔 Makanan                 ▼   │    │
│  └─────────────────────────────────┘    │
│                                          │
│  Keterangan (opsional):                  │
│  ┌─────────────────────────────────┐    │
│  │ Beli makan siang di warteg      │    │
│  └─────────────────────────────────┘    │
│                                          │
│  [ Simpan Transaksi ]                    │
└─────────────────────────────────────────┘
```

#### Dashboard Keuangan

```
┌─────────────────────────────────────────┐
│  Keuangan - Juli 2026                    │
│                                          │
│  Saldo Saat Ini: Rp 2.450.000           │
│  ─────────────────────────              │
│  💰 Pemasukan:    Rp 5.000.000          │
│  💸 Pengeluaran:  Rp 2.550.000          │
│  ─────────────────────────              │
│                                          │
│  Ringkasan Kategori (Pengeluaran):       │
│  🍔 Makanan       Rp 1.200.000 (47%)   │
│  🚌 Transportasi    Rp 450.000 (18%)   │
│  🛒 Belanja         Rp 500.000 (20%)   │
│  📱 Tagihan         Rp 400.000 (15%)   │
│                                          │
│  Riwayat Transaksi:                      │
│  ──────────────────                      │
│  18 Jul 14:00  🍔 Makanan    -Rp 50.000│
│  17 Jul 09:00  💰 Gaji      +Rp5.000.000│
│  16 Jul 18:30  🚌 Transport  -Rp 25.000│
└─────────────────────────────────────────┘
```

### 3.4 Struktur Data (Supabase Tables)

#### Tabel Transaksi: `finance_transactions`

```sql
CREATE TABLE public.finance_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric(15, 2) NOT NULL CHECK (amount > 0),
  category text NOT NULL,
  description text DEFAULT '',
  transaction_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT finance_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT finance_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
```

#### Tabel Kategori: `finance_categories`

```sql
CREATE TABLE public.finance_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text DEFAULT 'tag',                    -- FontAwesome icon name
  color text DEFAULT '#7c6af7',
  type text NOT NULL CHECK (type IN ('income', 'expense', 'both')),
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT finance_categories_pkey PRIMARY KEY (id),
  CONSTRAINT finance_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
```

### 3.5 Kategori Default

#### Pengeluaran (Expense)
| Kategori | Icon | Warna |
|----------|------|-------|
| Makanan | `burger` | #ff6b6b |
| Transportasi | `bus` | #4ecdc4 |
| Belanja | `cart-shopping` | #ffe66d |
| Tagihan | `receipt` | #a8e6cf |
| Hiburan | `gamepad` | #ffd93d |
| Kesehatan | `heart-pulse` | #6bcb77 |
| Pendidikan | `graduation-cap` | #4d96ff |
| Lainnya | `ellipsis` | #8b91a8 |

#### Pemasukan (Income)
| Kategori | Icon | Warna |
|----------|------|-------|
| Gaji | `money-bill-wave` | #4ecdc4 |
| Freelance | `laptop-code` | #6bcb77 |
| Investasi | `chart-line` | #4d96ff |
| Hadiah | `gift` | #ffd93d |
| Lainnya | `ellipsis` | #8b91a8 |

### 3.6 Contoh Data

```json
{
  "id": "tx-001",
  "user_id": "user-uuid",
  "type": "expense",
  "amount": 50000,
  "category": "Makanan",
  "description": "Beli makan siang di warteg",
  "transaction_date": "2026-07-18T14:00:00Z",
  "created_at": "2026-07-18T14:00:00Z",
  "updated_at": "2026-07-18T14:00:00Z"
}
```

### 3.7 Sistem Kalkulator Otomatis

```javascript
// Hitungan real-time
Total Pemasukan (bulan ini) - Total Pengeluaran (bulan ini) = Saldo Bulanan
Saldo Awal Bulan + Saldo Bulanan = Saldo Akhir

// Filter & Query
- Filter berdasarkan: hari, minggu, bulan, tahun, kategori, tipe
- Group by kategori untuk pie chart / bar chart
- Export data per bulan
```

### 3.8 Module Structure (finance.js)

```javascript
window.Notara.FinanceTracker = (() => {

  // ── Transaksi CRUD ──
  async function addTransaction(userId, data) { /* tambah */ }
  async function updateTransaction(id, changes) { /* edit */ }
  async function removeTransaction(id) { /* hapus */ }
  async function getTransaction(id) { /* ambil 1 transaksi */ }

  // ── Query & Filter ──
  async function getByDateRange(userId, start, end) { /* rentang tanggal */ }
  async function getByMonth(userId, year, month) { /* 1 bulan */ }
  async function getByCategory(userId, category) { /* per kategori */ }
  async function search(userId, keyword) { /* cari */ }

  // ── Kalkulasi & Laporan ──
  async function getBalance(userId) { /* saldo saat ini */ }
  async function getMonthlySummary(userId, year, month) { /* ringkasan bulanan */ }
  async function getCategoryBreakdown(userId, period) { /* breakdown kategori */ }
  async function getDailyExpenses(userId, month) { /* pengeluaran per hari */ }

  // ── Kategori ──
  async function getCategories(userId) { /* semua kategori */ }
  async function createCategory(userId, data) { /* kategori baru */ }
  async function updateCategory(id, changes) { /* edit kategori */ }
  async function removeCategory(id) { /* hapus kategori */ }

  // ── Page Render ──
  async function renderPage() { /* inject HTML ke #app-main + bind events */ }
  function _bindDashboardEvents() { /* navigation, filter bulan */ }
  function _showAddForm() { /* modal/form transaksi baru */ }
  function _renderChart(canvas, data) { /* render pie/bar chart */ }

  return { renderPage, addTransaction, removeTransaction, getByMonth, getBalance, getMonthlySummary, getCategoryBreakdown, getCategories, createCategory, removeCategory };
})();
```

---

## 4. Integrasi dengan Sistem yang Ada

### 4.1 Penyimpanan Hybrid

```
┌──────────────────────────────────────────────────────┐
│                    NOTARA STORAGE                      │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────┐    ┌─────────────────────────┐  │
│  │   Supabase      │    │   LocalStorage           │  │
│  │   (Primary)     │    │   (Cache/Settings)       │  │
│  ├─────────────────┤    ├─────────────────────────┤  │
│  │ • mood_entries   │    │ • last_sync_date         │  │
│  │ • habit_lists    │    │ • ui_preferences         │  │
│  │ • habit_logs     │    │ • draft_transactions     │  │
│  │ • finance_       │    │ • offline_queue          │  │
│  │   transactions   │    │                         │  │
│  │ • finance_       │    │                         │  │
│  │   categories     │    │                         │  │
│  └─────────────────┘    └─────────────────────────┘  │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 4.2 RLS Policies (Supabase Row Level Security)

```sql
-- Mood Entries
CREATE POLICY "Users can view own mood" ON mood_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mood" ON mood_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own mood" ON mood_entries
  FOR UPDATE USING (auth.uid() = user_id);

-- Habit Lists
CREATE POLICY "Users can view own habits" ON habit_lists
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habits" ON habit_lists
  FOR ALL USING (auth.uid() = user_id);

-- Habit Logs
CREATE POLICY "Users can view own habit logs" ON habit_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habit logs" ON habit_logs
  FOR ALL USING (auth.uid() = user_id);

-- Finance Transactions
CREATE POLICY "Users can view own transactions" ON finance_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own transactions" ON finance_transactions
  FOR ALL USING (auth.uid() = user_id);

-- Finance Categories
CREATE POLICY "Users can view own categories" ON finance_categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own categories" ON finance_categories
  FOR ALL USING (auth.uid() = user_id);
```

### 4.3 Navigasi & Router

Ketiga tracker adalah **halaman mandiri (standalone page)**, masing-masing dengan route sendiri. Setiap halaman memiliki 1 file JS yang berisi semua logika CRUD, render page, dan event binding — mirip pattern `settings.js` atau `posts.js` yang sudah ada.

#### Daftar Route Baru

| Route | Halaman | File | Fungsi Render |
|-------|---------|------|---------------|
| `#mood` | Mood Tracker — form input + grafik hari ini | `js/mood.js` | `MoodTracker.renderPage()` |
| `#habits` | Habit Tracker — checklist harian + progress | `js/habits.js` | `HabitTracker.renderPage()` |
| `#finance` | Finance Tracker — dashboard + daftar transaksi | `js/finance.js` | `FinanceTracker.renderPage()` |

#### Registrasi Route di `app.js`

Tambahkan di blok register route (line ~1971-1980):
```js
R.on('mood',    () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); window.Notara.MoodTracker.renderPage(); });
R.on('habits',  () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); window.Notara.HabitTracker.renderPage(); });
R.on('finance', () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); window.Notara.FinanceTracker.renderPage(); });
```

#### Sidebar Nav Items

Tambahkan di blok sidebar nav (line ~1905-1911), urutan setelah `Publikasi`:
```html
<a href="#mood" class="nav-item" data-page="mood"><span class="nav-icon"><i class="ph-smiley"></i></span><span class="nav-label">Mood</span></a>
<a href="#habits" class="nav-item" data-page="habits"><span class="nav-icon"><i class="ph-check-circle"></i></span><span class="nav-label">Kebiasaan</span></a>
<a href="#finance" class="nav-item" data-page="finance"><span class="nav-icon"><i class="ph-wallet"></i></span><span class="nav-label">Keuangan</span></a>
```

**Catatan**: Icon sidebar bisa pakai Phosphor icon atau FontAwesome — sesuaikan dengan icon yang ready.

#### Pattern Render Page (wajib diikuti)

Setiap modul tracker harus mengekspos `renderPage()` — fungsi tanpa parameter yang:
1. Ambil `#app-main`
2. Panggil `UI.setTitle('...')` — set judul topbar
3. Panggil `UI.setActiveNav('mood'|'habits'|'finance')` — highlight nav
4. Inject HTML ke `main.innerHTML`
5. Bind event listener

```js
// Contoh pattern di mood.js
window.Notara.MoodTracker = (() => {
  async function renderPage() {
    const main = document.getElementById('app-main');
    UI.setTitle('Mood Tracker');
    UI.setActiveNav('mood');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;
    
    // Ambil data
    const todayMood = await MoodTracker.getToday(Au.getUser()?.id);
    
    // Render
    main.innerHTML = `
      <div class="mood-page page-enter">
        ... konten halaman mood ...
      </div>
    `;
    
    // Bind events
    _bindMoodEvents();
  }
  
  return { renderPage };
})();
```

### 4.4 Penambahan Dependency di index.html

```html
<!-- Phosphor Icons (untuk mood & komponen tracker lainnya) -->
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css">
<link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css">

<!-- Tracker Styles -->
<link rel="stylesheet" href="css/features_v3.css">
```

**Catatan**:
- Phosphor pakai 2 stylesheet — `regular` (outline) dan `fill` (solid). Keduanya perlu di-load.
- File CSS untuk tracker disatukan di `css/features_v3.css` (ikuti pattern `features_v2.css` yang sudah ada).

### 4.5 Script Tags di index.html

Letakkan setelah `js/activity.js` dan sebelum `js/ui.js` (atau setelah `js/settings.js` sebelum `js/app.js`):

```html
<!-- Tracker Modules -->
<script src="js/mood.js"></script>
<script src="js/habits.js"></script>
<script src="js/finance.js"></script>
```

Urutan terakhir di `app.js` karena module-module ini perlu mengakses `window.Notara.UI`, `window.Notara.Storage`, `window.Notara.Auth`, dll.

---

## 5. UI/UX Design Notes

### 5.1 Prinsip Desain

> **PENTING**: Semua komponen tracker **TIDAK BOLEH** hardcode warna. Seluruh styling harus menggunakan CSS variables yang sudah ada di `variables.css` agar otomatis mengikuti tema, style, dan aksen yang dipilih user.

### 5.2 Pemetaan Warna ke CSS Variables

| Elemen | CSS Variable | Keterangan |
|--------|-------------|------------|
| Background card/section | `var(--surface)`, `var(--bg)` | Mengikuti tema (dark/light/amoled) |
| Teks utama | `var(--text-1)` | Warna teks primer |
| Teks sekunder | `var(--text-2)` | Warna teks次要 |
| Teks label kecil | `var(--text-3)` | Warna teks paling redup |
| Border | `var(--border-w) solid var(--border-strong)` | Neobrutalism-compatible |
| Aksen utama (tombol aktif, progress, highlight) | `var(--accent)` | Mengikuti aksen user |
| Background aksen | `var(--accent-light)` | Transparan dari aksen |
| Glow aksen | `var(--accent-glow)` | Untuk efek shadow |
| Status positif/sukses | `var(--label-easy)` | Hijau (#4caf82 default) |
| Status warning/netral | `var(--label-medium)` | Kuning (#f5a623 default) |
| Status negatif/error | `var(--label-hard)` | Merah (#ef5e6f default) |
| Shadow | `var(--shadow-sm)`, `var(--shadow-md)` | Mengikuti style + aksen |
| Radius | `var(--radius-sm)`, `var(--radius-md)`, `var(--radius-lg)` | Mengikuti style |
| Transisi | `var(--dur-fast)`, `var(--dur-base)`, `var(--dur-slow)` | Konsisten dengan seluruh app |

### 5.3 Komponen Reusable (Referensi dari CSS yang Ada)

```css
/* Tombol utama */
.btn-primary { background: var(--accent); color: var(--bg); }

/* Tombol ghost */
.btn-ghost { background: transparent; color: var(--text-1); border: var(--border-w) solid var(--border-strong); }

/* Icon button */
.icon-btn { background: var(--surface); color: var(--text-2); border: var(--border-w) solid var(--border-strong); }

/* Card / Section */
.tracker-card {
  background: var(--surface);
  border: var(--border-w) solid var(--border-strong);
  box-shadow: var(--shadow-sm);
}

/* Badge / Tag */
.tag-chip { background: var(--accent-light); color: var(--accent); border: 1px solid var(--accent-glow); }

/* Progress bar */
.progress-fill { background: var(--accent); transition: width var(--dur-base) var(--ease-smooth); }

/* Input field */
.auth-input, .new-post-textarea {
  background: var(--bg);
  color: var(--text-1);
  border: var(--border-w) solid var(--border-strong);
}
```

### 5.4 Mood Icons (Phosphor)

Menggunakan Phosphor Icons (outline ↔ fill), otomatis mengikuti `var(--text-3)` saat default dan `var(--accent)` saat aktif/hover. Tidak ada warna hardcoded.

| Mood Value | Label | Default | Aktif |
|-----------|-------|---------|-------|
| `very_happy` | Sangat Senang | `ph-smiley` | `ph-fill ph-smiley` |
| `happy` | Senang | `ph-smiley-wink` | `ph-fill ph-smiley-wink` |
| `neutral` | Biasa Aja | `ph-smiley-meh` | `ph-fill ph-smiley-meh` |
| `sad` | Sedih | `ph-smiley-sad` | `ph-fill ph-smiley-sad` |
| `very_sad` | Buruk | `ph-smiley-angry` | `ph-fill ph-smiley-angry` |

### 5.5 Responsive

- Mobile-first (sudah standar Notara)
- Card-based layout untuk dashboard
- Bottom sheet untuk form input di mobile
- Gunakan class yang sudah ada: `page-enter`, `stats-card`, `template-option`, dll.

---

## 6. File Structure (Implementasi)

```
js/
├── mood.js           # Module Mood Tracker (CRUD + renderPage + events)
├── habits.js         # Module Habit Tracker (CRUD + renderPage + events)
├── finance.js        # Module Finance Tracker (CRUD + renderPage + events)

css/
├── features_v3.css   # Style untuk ketiga modul tracker

SKEMA SQL/
├── tracker.sql       # Semua tabel tracker dalam 1 file
```

**Setiap file JS di atas sudah mencakup**: API functions (CRUD), fungsi render halaman (`renderPage()`), event binding, dan helpers — semuanya dalam satu IIFE module, mirip pattern `settings.js`.

---

## 7. Checklist Implementasi

### Phase 1: Database & Core
- [ ] Tambahkan Phosphor Icons CSS (regular + fill) ke `index.html`
- [ ] Buat tabel `mood_entries`, `habit_lists`, `habit_logs`, `finance_transactions`, `finance_categories`
- [ ] Setup RLS policies untuk semua tabel
- [ ] Insert kategori default untuk finance

### Phase 2: Mood Tracker — `js/mood.js` + `#mood`
- [ ] Implementasi Supabase CRUD (getToday, save, getHistory, getWeeklyAvg)
- [ ] Buat `renderPage()` → inject HTML di `#app-main`
- [ ] **UI**: Form pilih mood (5 tombol Phosphor outline↔fill), triggers, catatan
- [ ] **UI**: Jika sudah ada mood hari ini → tampilkan rangkuman (emoji besar + triggers + note)
- [ ] **UI**: Grafik mood 7 hari terakhir (bar chart atau emoji sequence)
- [ ] Implementasi sistem reset harian (00:00 → munculkan form lagi)
- [ ] Event binding: klik mood → ganti icon outline→fill, simpan ke DB
- [ ] Navigasi: route `#mood`, sidebar nav "Mood", `UI.setActiveNav('mood')`

### Phase 3: Habit Tracker — `js/habits.js` + `#habits`
- [ ] Implementasi Supabase CRUD master list (getAll, create, update, remove, reorder)
- [ ] Implementasi Supabase CRUD daily log (getTodayLogs, toggle, resetDailyCheckboxes, getLogsByDate)
- [ ] Buat `renderPage()` → inject HTML di `#app-main`
- [ ] **UI**: Checklist harian dengan checkbox + progress bar + completion %
- [ ] **UI**: Panel manajemen habit (tambah/edit/hapus nama habit)
- [ ] Implementasi sistem reset harian (00:00 → checkbox kosong, log terkunci)
- [ ] Implementasi streak counter & completion rate (7/30 hari)
- [ ] Event binding: toggle checkbox saat diklik
- [ ] Navigasi: route `#habits`, sidebar nav "Kebiasaan", `UI.setActiveNav('habits')`

### Phase 4: Finance Tracker — `js/finance.js` + `#finance`
- [ ] Implementasi Supabase CRUD transaksi (add, update, remove, getByDateRange, getByMonth)
- [ ] Implementasi CRUD kategori (getCategories, createCategory, updateCategory, removeCategory)
- [ ] Implementasi kalkulator otomatis (getBalance, getMonthlySummary, getCategoryBreakdown)
- [ ] Buat `renderPage()` → inject HTML di `#app-main`
- [ ] **UI**: Dashboard — saldo saat ini, total pemasukan/pengeluaran, pie chart kategori
- [ ] **UI**: Form tambah transaksi — tipe (income/expense), nominal, kategori dropdown, deskripsi
- [ ] **UI**: Daftar riwayat transaksi dengan filter bulan
- [ ] Insert kategori default ke Supabase (Makanan, Transportasi, Gaji, dll)
- [ ] Navigasi: route `#finance`, sidebar nav "Keuangan", `UI.setActiveNav('finance')`

### Phase 5: Integrasi & Polish
- [ ] Tambahkan link sidebar nav di `app.js` untuk mood, habits, finance
- [ ] Register route di `app.js` (`R.on('mood', ...)`, `R.on('habits', ...)`, `R.on('finance', ...)`)
- [ ] Tambahkan script tag `js/mood.js`, `js/habits.js`, `js/finance.js` di `index.html`
- [ ] Tambahkan `js/features_v3.css` di `index.html`
- [ ] Tambahkan Phosphor Icons CDN di `index.html`
- [ ] Testing semua alur data (create, read, update, delete)
- [ ] Testing reset harian (simulasi ganti tanggal)
- [ ] Testing kalkulasi keuangan otomatis
- [ ] Testing responsive layout
- [ ] Optimasi performa query (indexing di Supabase)

---

## 8. Catatan Penting

1. **Offline Support**: Semua operasi harus bisa dilakukan offline dan sync saat online kembali
2. **Data Integrity**: Pastikan `UNIQUE` constraint untuk mood per hari dan habit per hari
3. **Performance**: Gunakan index untuk query berdasarkan `user_id` + `date`
4. **Backup**: Pertimbangkan export/import data untuk finance tracker

---

*Dokumen ini bersifat living document, bisa diupdate seiring progress implementasi.*
