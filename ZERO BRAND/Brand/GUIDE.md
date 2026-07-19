# IkonBrand — Guide & Documentation

> Panduan lengkap penggunaan aset brand **ZERO**.

---

## Struktur Folder

```
IkonBrand/
├── asli/                    ← File original (source), jangan diedit
├── ikon-gelap/              ← Ikon saja, background gelap
├── ikon-terang/             ← Ikon saja, background terang
├── teks-gelap/              ← Teks "ZERO" saja, background gelap
├── teks-terang/             ← Teks "ZERO" saja, background terang
├── ikon-teks-gelap/         ← Ikon + Teks, background gelap
└── ikon-teks-terang/        ← Ikon + Teks, background terang
```

> Setiap folder selain `asli/` juga berisi versi **transparan** (`*-transparent.png`).

---

## Konvensi Penamaan

| Prefix | Isi Gambar | Kegunaan |
|--------|------------|----------|
| **ikon-** | Simbol Z + checkmark saja | Icon, favicon, logo kecil |
| **teks-** | Tulisan "ZERO" saja | Wordmark, headline branding |
| **ikon-teks-** | Simbol Z + tulisan "ZERO" | Logo lengkap, representasi penuh brand |

| Suffix | Background | Contoh Penggunaan |
|--------|------------|-------------------|
| **-gelap** | Hitam / gelap (`#09090b`) | Dark mode, app gelap, splash screen |
| **-terang** | Putih / terang (`#F7F5F3`) | Light mode, dokumen cetak, email |

### Contoh Kombinasi

| Folder | Isi | Kapan Dipakai |
|--------|-----|---------------|
| `ikon-gelap` | Ikon Z, bg gelap | Favicon PWA, icon app, profile picture (dark) |
| `ikon-terang` | Ikon Z, bg terang | Profile picture (light), watermark di dokumen |
| `teks-gelap` | Teks ZERO, bg gelap | OG image, banner dark, social media header |
| `teks-terang` | Teks ZERO, bg terang | Banner light, email signature, presentasi |
| `ikon-teks-gelap` | Ikon + Teks, bg gelap | Splash screen, hero banner, logo utama (dark) |
| `ikon-teks-terang` | Ikon + Teks, bg terang | Logo resmi, dokumen, proposal (light) |

---

## File di Setiap Folder

Setiap folder (kecuali `asli`) berisi **21 file** dengan ukuran berbeda:

### Transparan

| File | Ukuran | Fungsi |
|------|--------|--------|
| `*-transparent.png` | Original (resolusi tinggi) | Logo transparan untuk overlay, watermark, design fleksibel |

> File transparan memiliki background yang sudah dihapus (alpha channel). Cocok untuk ditempel di atas gambar/grain/apapun tanpa kotak background.

### Favicon

| File | Ukuran | Fungsi |
|------|--------|--------|
| `favicon-16.png` | 16×16 px | Tab browser ukuran kecil |
| `favicon-32.png` | 32×32 px | Tab browser standar |
| `favicon-48.png` | 48×48 px | Tab browser besar, bookmark |
| `favicon/favicon-16x16.png` | 16×16 px | Format alternatif (untuk某些 CMS) |
| `favicon/favicon-32x32.png` | 32×32 px | Format alternatif |
| `favicon/favicon-48x48.png` | 48×48 px | Format alternatif |

### PWA & Mobile App

| File | Ukuran | Fungsi |
|------|--------|--------|
| `pwa-192.png` | 192×192 px | Ikon PWA di Android, shortcut |
| `pwa-512.png` | 512×512 px | Splash screen PWA, instalasi |
| `apple-touch-180.png` | 180×180 px | Ikon iOS/iPadOS saat add to home screen |
| `appstore-512.png` | 512×512 px | Screenshot/app icon untuk app store |
| `appstore-1024.png` | 1024×1024 px | App store listing (Apple/Google) |

### Social Media & Profile

| File | Ukuran | Fungsi |
|------|--------|--------|
| `profile-200.png` | 200×200 px | Avatar kecil (chat, komentar) |
| `profile-320.png` | 320×320 px | Avatar medium (profile card) |
| `profile-400.png` | 400×400 px | Avatar besar (profile page) |
| `profile-800.png` | 800×800 px | Avatar ultra besar (zoom HD) |
| `square-1080.png` | 1080×1080 px | Post Instagram, square content |

### Cover & Banner

| File | Ukuran | Fungsi |
|------|--------|--------|
| `cover-facebook-851x315.png` | 851×315 px | Facebook cover photo |
| `cover-twitter-1500x500.png` | 1500×500 px | Twitter/X header |
| `cover-linkedin-1584x396.png` | 1584×396 px | LinkedIn banner |
| `cover-youtube-2560x1440.png` | 2560×1440 px | YouTube channel art |

### Open Graph & Social Sharing

| File | Ukuran | Fungsi |
|------|--------|--------|
| `og-1200x630.png` | 1200×630 px | OG image (share link di WA, Twitter, FB) |
| `twitter-1200x628.png` | 1200×628 px | Twitter card image |

---

## Folder `asli/`

Berisi **6 file original** (source) dalam resolusi tinggi:

| File | Deskripsi |
|------|-----------|
| `ikon-gelap.png` | Ikon Z, background gelap |
| `ikon-terang.png` | Ikon Z, background terang |
| `teks-gelap.png` | Teks ZERO, background gelap |
| `teks-terang.png` | Teks ZERO, background terang |
| `ikon-teks-gelap.png` | Ikon + Teks, background gelap |
| `ikon-teks-terang.png` | Ikon + Teks, background terang |

> ⚠️ File di `asli/` jangan dipakai langsung untuk web/app. Gunakan versi yang sudah di-resize di folder lain.

---

## Rekomendasi Penggunaan

### Untuk PWA / Web App

```
favicon           → IkonBrand/ikon-gelap/favicon-32.png
apple-touch-icon  → IkonBrand/ikon-gelap/apple-touch-180.png
PWA icon          → IkonBrand/ikon-gelap/pwa-192.png + pwa-512.png
OG image          → IkonBrand/teks-gelap/og-1200x630.png
```

### Untuk Social Media

```
Profile picture   → IkonBrand/ikon-gelap/profile-400.png
Instagram post    → IkonBrand/teks-gelap/square-1080.png
Facebook cover    → IkonBrand/teks-gelap/cover-facebook-851x315.png
Twitter header    → IkonBrand/teks-gelap/cover-twitter-1500x500.png
YouTube banner    → IkonBrand/teks-gelap/cover-youtube-2560x1440.png
```

### Untuk Dokumen / Presentasi

```
Logo formal       → IkonBrand/ikon-teks-terang/ikon-teks-terang.png (asli)
Watermark         → IkonBrand/ikon-terang/ikon-terang.png (asli)
Logo transparan   → IkonBrand/ikon-teks-gelap/ikon-teks-gelap-transparent.png
```

### Untuk Design / Overlay

```
Logo transparan   → IkonBrand/ikon-gelap/ikon-gelap-transparent.png
Teks transparan   → IkonBrand/teks-gelap/teks-gelap-transparent.png
Lengkap transparan → IkonBrand/ikon-teks-gelap/ikon-teks-gelap-transparent.png
```

### Untuk Email Signature

```
Logo kecil        → IkonBrand/teks-gelap/teks-gelap.png (asli)
```

---

## Palet Warna Brand

| Warna | Hex | Kegunaan |
|-------|-----|----------|
| Coral/Red | `#E84855` | Gradient atas (energi, keberanian) |
| Violet/Purple | `#7B2D8E` | Gradient bawah (kreativitas, inovasi) |
| Dark BG | `#09090b` | Background gelap utama |
| Light BG | `#F7F5F3` | Background terang utama |

---

## Catatan Penting

1. **Jangan edit file di `asli/`** — itu source original
2. **Gunakan folder yang sesuai** — jangan pakai `ikon-gelap` untuk kebutuhan light mode
3. **Favicon wajib 32px** — paling umum dipakai di web
4. **OG image wajib 1200×630** — standar social media sharing
5. **Profile picture minimal 400px** — agar tidak pecah saat zoom
6. **File transparan** — gunakan untuk overlay, watermark, atau design yang butuh logo tanpa background

---

*Last updated: Juli 2026 — v2 (tambah versi transparan)*
