/* js/settings.js - Theme & preferences */
'use strict';
window.Notara = window.Notara || {};
window.Notara.Settings = (() => {
  const S = window.Notara.Storage;
  const KEY_THEME  = 'settings_theme';
  const KEY_ACCENT = 'settings_accent';
  const KEY_ZOOM   = 'settings_zoom';

  const THEMES  = ['dark', 'light', 'amoled'];
  const ACCENTS = ['violet', 'teal', 'coral', 'amber', 'rose', 'lime'];
  const ACCENT_COLORS = {
    violet: '#7c6af7', teal: '#2dd4bf', coral: '#ff6b6b',
    amber:  '#f5a623', rose: '#f472b6', lime:  '#84cc16',
  };

  function getTheme()  { return S.get(KEY_THEME,  'dark'); }
  function getAccent() { return S.get(KEY_ACCENT, 'violet'); }
  function getZoom()   { return S.get(KEY_ZOOM,   'md'); }

  function setTheme(theme) {
    if (!THEMES.includes(theme)) return;
    S.set(KEY_THEME, theme);
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f4f4fa' : theme === 'amoled' ? '#000000' : '#0d0f14';
  }

  function setAccent(accent) {
    if (!ACCENTS.includes(accent)) return;
    S.set(KEY_ACCENT, accent);
    document.documentElement.setAttribute('data-accent', accent);
  }

  function setZoom(zoom) { S.set(KEY_ZOOM, zoom); }

  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
    document.documentElement.classList.add('theme-switching');
    setTheme(next);
    setTimeout(() => document.documentElement.classList.remove('theme-switching'), 450);
    window.Notara.UI.toast(`Tema: ${next}`, 'info');
  }

  function init() {
    setTheme(getTheme());
    setAccent(getAccent());
  }

  /* Helper: notif permission badge */
  function _notifStatusHtml() {
    // Status untuk Android Native
    if (window.Capacitor?.isNativePlatform) {
       if (window.Notara.Reminders.hasPermission()) {
          return `<span class="notif-status-badge granted"><i class="fa-solid fa-circle-check"></i> Aktif</span>`;
       } else {
          return `<span class="notif-status-badge default"><i class="fa-solid fa-circle-exclamation"></i> Belum diaktifkan</span>`;
       }
    }
    // Status untuk Browser PWA
    if (!('Notification' in window)) {
      return `<span class="notif-status-badge unsupported">
        <i class="fa-solid fa-ban"></i> Tidak didukung browser ini
      </span>`;
    }
    const perm = Notification.permission;
    if (perm === 'granted') {
      return `<span class="notif-status-badge granted">
        <i class="fa-solid fa-circle-check"></i> Aktif
      </span>`;
    }
    if (perm === 'denied') {
      return `<span class="notif-status-badge denied">
        <i class="fa-solid fa-circle-xmark"></i> Diblokir browser
      </span>`;
    }
    return `<span class="notif-status-badge default">
      <i class="fa-solid fa-circle-exclamation"></i> Belum diaktifkan
    </span>`;
  }

  /* Render settings page */
  async function renderPage() {
    const main = document.getElementById('app-main');
    window.Notara.UI.setTitle('Pengaturan');
    window.Notara.UI.setActiveNav('settings');

    const currentTheme  = getTheme();
    const currentAccent = getAccent();
    const noteCount     = await window.Notara.Notes.count();
    const user          = window.Notara.Auth.getUser();
    const name          = window.Notara.Auth.getName();
    
    // Evaluasi Izin
    const isNative = window.Capacitor?.isNativePlatform;
    const notifSupported = isNative ? true : ('Notification' in window);
    const notifGranted   = window.Notara.Reminders.hasPermission();
    const notifDenied    = !isNative && ('Notification' in window) && Notification.permission === 'denied';

    main.innerHTML = `
      <div class="settings-page page-enter">
        <h2 style="margin-bottom:var(--space-xl)">Pengaturan</h2>
        
        <!-- Akun -->
        <div class="settings-section">
          <div class="settings-section-title">Akun</div>
          <div class="settings-card">
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">${name}</span>
                <span class="settings-item-sub">${user?.email || ''}</span>
              </div>
              <i class="fa-solid fa-circle-user" style="font-size:1.8rem;color:var(--accent)"></i>
            </div>
            <div class="settings-item" style="cursor:pointer" id="setting-logout">
              <div class="settings-item-left">
                <span class="settings-item-label" style="color:var(--label-hard)">Keluar</span>
                <span class="settings-item-sub">Keluar dari akun ini</span>
              </div>
              <i class="fa-solid fa-right-from-bracket" style="color:var(--label-hard)"></i>
            </div>
          </div>
        </div>

        <!-- Tampilan -->
        <div class="settings-section">
          <div class="settings-section-title">Tampilan</div>
          <div class="settings-card">
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Tema</span>
                <span class="settings-item-sub">Pilih tampilan aplikasi</span>
              </div>
              <div class="theme-picker">
                ${THEMES.map(t => `
                  <div class="theme-option ${t === currentTheme ? 'active' : ''}" data-theme-pick="${t}">
                    <div class="theme-swatch ${t}"></div>
                    <span class="theme-label">${t.charAt(0).toUpperCase() + t.slice(1)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Warna Aksen</span>
                <span class="settings-item-sub">Sesuaikan warna aksen</span>
              </div>
              <div class="accent-picker">
                ${ACCENTS.map(a => `
                  <div class="accent-dot ${a === currentAccent ? 'active' : ''}"
                    data-accent-pick="${a}"
                    style="background:${ACCENT_COLORS[a]}"
                    title="${a}"></div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Notifikasi & Pengingat -->
        <div class="settings-section">
          <div class="settings-section-title">Notifikasi & Pengingat</div>
          <div class="settings-card">
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Status Notifikasi</span>
                <span class="settings-item-sub">
                  Diperlukan agar pengingat catatan berfungsi
                </span>
              </div>
              <div id="notif-status-wrap">
                ${_notifStatusHtml()}
              </div>
            </div>

            ${!notifGranted && !notifDenied && notifSupported ? `
              <div class="settings-item">
                <div class="settings-item-left">
                  <span class="settings-item-label">Aktifkan Notifikasi</span>
                  <span class="settings-item-sub">
                    Notara akan mengirim pengingat sesuai jadwal catatan
                  </span>
                </div>
                <button class="btn-primary" id="btn-notif-perm" style="font-size:0.82rem;padding:0.45rem 1rem">
                  <i class="fa-solid fa-bell"></i> Aktifkan
                </button>
              </div>
            ` : ''}

            ${notifDenied ? `
              <div class="settings-item">
                <div class="settings-item-left">
                  <span class="settings-item-label" style="color:var(--label-medium)">Notifikasi Diblokir</span>
                  <span class="settings-item-sub">
                    Buka pengaturan browser dan izinkan notifikasi untuk situs ini, lalu muat ulang halaman.
                  </span>
                </div>
                <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--label-medium)"></i>
              </div>
            ` : ''}

            ${notifGranted ? `
              <div class="settings-item">
                <div class="settings-item-left">
                  <span class="settings-item-label">Uji Notifikasi</span>
                  <span class="settings-item-sub">Kirim notifikasi percobaan sekarang</span>
                </div>
                <button class="btn-ghost" id="btn-notif-test" style="font-size:0.82rem">
                  <i class="fa-solid fa-paper-plane"></i> Uji
                </button>
              </div>
            ` : ''}

            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Cara Menggunakan Pengingat</span>
                <span class="settings-item-sub">
                  Saat membuat catatan baru, pilih tipe "Pengingat" atau "Tenggat Waktu".
                  Notara akan cek setiap menit dan kirim notifikasi otomatis.
                </span>
              </div>
              <i class="fa-solid fa-circle-info" style="color:var(--accent);flex-shrink:0"></i>
            </div>
          </div>
        </div>

        <!-- Catatan -->
        <div class="settings-section">
          <div class="settings-section-title">Aplikasi</div>
          <div class="settings-card">
            <div class="settings-item" style="cursor:pointer" id="setting-install">
              <div class="settings-item-left">
                <span class="settings-item-label">Download Aplikasi (APK)</span>
                <span class="settings-item-sub">Dapatkan versi Android terbaru</span>
              </div>
              <span style="color:var(--accent);font-size:0.85rem">
                <i class="fa-solid fa-download"></i>
              </span>
            </div>
          </div>
        </div>

        <!-- Data -->
        <div class="settings-section">
          <div class="settings-section-title">Data</div>
          <div class="settings-card">
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Total Catatan</span>
              </div>
              <span style="color:var(--text-2);font-weight:600">${noteCount}</span>
            </div>
            <div class="settings-item" style="cursor:pointer" id="setting-clear">
              <div class="settings-item-left">
                <span class="settings-item-label" style="color:var(--label-hard)">Hapus Semua Catatan</span>
                <span class="settings-item-sub">Tindakan ini tidak dapat dibatalkan</span>
              </div>
              <i class="fa-solid fa-triangle-exclamation" style="color:var(--label-hard)"></i>
            </div>
          </div>
        </div>

        <!-- Tentang -->
        <div class="settings-section">
          <div class="settings-section-title">Tentang</div>
          <div class="settings-card">
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Notara</span>
                <span class="settings-item-sub">Versi 2.1.0 • PWA Notes App</span>
              </div>
              <span style="font-size:1.5rem;color:var(--accent)">📝</span>
            </div>
          </div>
        </div>

        <!-- Tentang Pengembang -->
        <div class="settings-section">
          <div class="settings-section-title">Tentang Pengembang</div>
          <div class="settings-card">
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Dede Putra Cahyana</span>
                <span class="settings-item-sub">Developer & Designer</span>
              </div>
              <i class="fa-solid fa-circle-user" style="font-size:1.8rem;color:var(--accent)"></i>
            </div>
            <div class="divider" style="margin:0"></div>
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label" style="font-size:0.8rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;font-weight:600">
                  Kritik &amp; Saran
                </span>
                <span class="settings-item-sub">Hubungi via platform di bawah ini</span>
              </div>
            </div>
            <a href="mailto:zadpropc@gmail.com" class="settings-item settings-item-link">
              <div class="settings-item-left">
                <span class="settings-item-label"><i class="fa-solid fa-envelope" style="color:#ea4335;margin-right:8px"></i>Email</span>
                <span class="settings-item-sub">zadpropc@gmail.com</span>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);font-size:0.8rem"></i>
            </a>
            <a href="https://wa.me/6289527003290?text=Halo%20Dede%2C%20aku%20punya%20kritik%2Fsaran%20tentang%20aplikasi%20Notara%3A%20" target="_blank" rel="noopener" class="settings-item settings-item-link">
              <div class="settings-item-left">
                <span class="settings-item-label"><i class="fa-brands fa-whatsapp" style="color:#25d366;margin-right:8px"></i>WhatsApp</span>
                <span class="settings-item-sub">089527003290</span>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);font-size:0.8rem"></i>
            </a>
            <a href="https://www.instagram.com/zadostrix/" target="_blank" rel="noopener" class="settings-item settings-item-link">
              <div class="settings-item-left">
                <span class="settings-item-label"><i class="fa-brands fa-instagram" style="color:#e1306c;margin-right:8px"></i>Instagram</span>
                <span class="settings-item-sub">@zadostrix</span>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);font-size:0.8rem"></i>
            </a>
            <a href="https://www.tiktok.com/@zadostrix?is_from_webapp=1&sender_device=pc" target="_blank" rel="noopener" class="settings-item settings-item-link">
              <div class="settings-item-left">
                <span class="settings-item-label"><i class="fa-brands fa-tiktok" style="color:var(--text-1);margin-right:8px"></i>TikTok</span>
                <span class="settings-item-sub">@zadostrix</span>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);font-size:0.8rem"></i>
            </a>
          </div>
        </div>
      </div>
    `;

    _bindSettingsEvents();
  }

  function _bindSettingsEvents() {
    document.querySelectorAll('[data-theme-pick]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('[data-theme-pick]').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        setTheme(el.dataset.themePick);
      });
    });

    document.querySelectorAll('[data-accent-pick]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('[data-accent-pick]').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        setAccent(el.dataset.accentPick);
      });
    });

    // Aktifkan notifikasi
    document.getElementById('btn-notif-perm')?.addEventListener('click', async () => {
      const granted = await window.Notara.Reminders.requestPermission();
      if (granted) {
        window.Notara.UI.toast('Notifikasi berhasil diaktifkan!', 'success');
        window.Notara.Reminders.start();
        renderPage();
      } else {
        window.Notara.UI.toast('Izin notifikasi ditolak. Coba aktifkan dari pengaturan aplikasi/browser.', 'error', 5000);
        renderPage();
      }
    });

    // Uji notifikasi
    document.getElementById('btn-notif-test')?.addEventListener('click', () => {
      if (!window.Notara.Reminders.hasPermission()) {
        window.Notara.UI.toast('Aktifkan notifikasi terlebih dahulu.', 'warning');
        return;
      }
      window.Notara.Reminders.fireImmediate('Notara - Uji Notifikasi', 'Notifikasi Notara berfungsi dengan baik! 🎉', 'test_notif');
      window.Notara.UI.toast('Notifikasi uji dikirim!', 'success');
    });

    document.getElementById('setting-install')?.addEventListener('click', () => {
      window.open('https://github.com/USERNAME/REPO/releases/latest/download/Notara.apk', '_blank');
    });

    document.getElementById('setting-logout')?.addEventListener('click', async () => {
      const ok = await window.Notara.UI.confirm({
        title: 'Keluar',
        message: 'Yakin ingin keluar dari akun ini?',
        okLabel: 'Keluar',
      });
      if (ok) {
        window.Notara.Reminders.stop();
        await window.Notara.Auth.logout();
        window.location.reload();
      }
    });

    document.getElementById('setting-clear')?.addEventListener('click', async () => {
      const ok = await window.Notara.UI.confirm({
        title: 'Hapus Semua Catatan',
        message: 'Semua catatan akan dihapus permanen dari server. Yakin?',
        okLabel: '<i class="fa-solid fa-trash"></i> Hapus Semua',
        okClass: 'btn-primary',
      });
      if (ok) {
        try {
          const notes = await window.Notara.Notes.getAll();
          await Promise.all(notes.map(n => window.Notara.Notes.remove(n.id)));
          window.Notara.UI.toast('Semua catatan dihapus', 'info');
          window.Notara.UI.updateStorageIndicator();
          renderPage();
        } catch (err) {
          console.error('[Notara] Hapus semua gagal:', err);
          window.Notara.UI.toast('Gagal menghapus: ' + (err.message || 'Cek izin Supabase RLS'), 'error');
        }
      }
    });
  }

  return { init, getTheme, getAccent, getZoom, setTheme, setAccent, setZoom, cycleTheme, renderPage };
})();