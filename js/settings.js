/* js/settings.js - Theme & preferences */
'use strict';
window.Notara = window.Notara || {};
window.Notara.Settings = (() => {
  const S = window.Notara.Storage;
  const KEY_THEME  = 'settings_theme';
  const KEY_ACCENT = 'settings_accent';
  const KEY_FONT   = 'settings_font';
  const KEY_FONT_SIZE = 'settings_font_size';
  const KEY_STYLE  = 'settings_style';

  const THEMES  = ['dark', 'light', 'amoled'];
  const ACCENT_CATEGORIES = [
    { name: 'Solid', colors: [
      { id: 'red', hex: '#EF4444', label: 'Merah' }, { id: 'orange', hex: '#F97316', label: 'Jingga' }, { id: 'yellow', hex: '#EAB308', label: 'Kuning' },
      { id: 'green', hex: '#22C55E', label: 'Hijau' }, { id: 'blue', hex: '#3B82F6', label: 'Biru' }, { id: 'indigo', hex: '#6366F1', label: 'Nila' }, { id: 'purple', hex: '#A855F7', label: 'Ungu' },
    ]},
    { name: 'Pastel', colors: [
      { id: 'pastel-red', hex: '#FCA5A5', label: 'Permen' }, { id: 'pastel-orange', hex: '#FDBA74', label: 'Senja' }, { id: 'pastel-yellow', hex: '#FDE047', label: 'Mentari' },
      { id: 'pastel-green', hex: '#86EFAC', label: 'Mint' }, { id: 'pastel-blue', hex: '#93C5FD', label: 'Langit' }, { id: 'pastel-indigo', hex: '#A5B4FC', label: 'Kristal' }, { id: 'pastel-purple', hex: '#C4B5FD', label: 'Lavender' },
    ]},
    { name: 'Deep', colors: [
      { id: 'deep-red', hex: '#991B1B', label: 'Bara' }, { id: 'deep-orange', hex: '#9A3412', label: 'Tembaga' }, { id: 'deep-yellow', hex: '#854D0E', label: 'Emas' },
      { id: 'deep-green', hex: '#166534', label: 'Hutan' }, { id: 'deep-blue', hex: '#1E40AF', label: 'Laut' }, { id: 'deep-indigo', hex: '#3730A3', label: 'Malam' }, { id: 'deep-purple', hex: '#6B21A8', label: 'Wine' },
    ]},
  ];
  const ALL_ACCENTS = ACCENT_CATEGORIES.flatMap(c => c.colors);
  const STYLES  = ['saas', 'neobrutalism', 'retro-gazette', 'skeuomorphism', 'neumorphism'];
  const STYLE_LABELS = { saas: 'Normal', neobrutalism: 'Komik', 'retro-gazette': 'Vintage', skeuomorphism: '3D', neumorphism: 'Modern' };
  const FONTS = [
    { id: 'default', label: 'Default (Sora / DM Sans)', display: "'Sora', sans-serif", body: "'DM Sans', sans-serif" },
    { id: 'inter', label: 'Inter', display: "'Inter', sans-serif", body: "'Inter', sans-serif" },
    { id: 'serif', label: 'Serif (Playfair / Source Serif)', display: "'Playfair Display', serif", body: "'Source Serif Pro', serif" },
    { id: 'mono', label: 'Monospace (JetBrains / Fira Code)', display: "'JetBrains Mono', monospace", body: "'Fira Code', monospace" },
    { id: 'rounded', label: 'Rounded (Quicksand / Nunito)', display: "'Quicksand', sans-serif", body: "'Nunito', sans-serif" },
    { id: 'system', label: 'System UI', display: "system-ui, -apple-system, sans-serif", body: "system-ui, -apple-system, sans-serif" },
  ];
  const FONT_SIZES = ['sm', 'md', 'lg', 'xl'];
  const FONT_SIZE_LABELS = { sm: 'Kecil (14px)', md: 'Sedang (16px)', lg: 'Besar (18px)', xl: 'Extra Besar (20px)' };

  function getTheme()  { return S.get(KEY_THEME,  'dark'); }
  function getAccent() { return S.get(KEY_ACCENT, 'blue'); }
  function getFont()   { return S.get(KEY_FONT,   'default'); }
  function getFontSize() { return S.get(KEY_FONT_SIZE, 'md'); }
  function getStyle()  { return S.get(KEY_STYLE,  'saas'); }

  function setTheme(theme) {
    if (!THEMES.includes(theme)) return;
    S.set(KEY_THEME, theme);
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f4f4fa' : theme === 'amoled' ? '#000000' : '#0d0f14';
  }

  function setAccent(accent) {
    if (!ALL_ACCENTS.find(a => a.id === accent)) return;
    S.set(KEY_ACCENT, accent);
    document.documentElement.setAttribute('data-accent', accent);
  }

  function setFont(font) {
    const fontObj = FONTS.find(f => f.id === font);
    if (!fontObj) return;
    S.set(KEY_FONT, font);
    document.documentElement.style.setProperty('--font-display', fontObj.display);
    document.documentElement.style.setProperty('--font-body', fontObj.body);
  }

  function setFontSize(size) {
    if (!FONT_SIZES.includes(size)) return;
    S.set(KEY_FONT_SIZE, size);
    document.documentElement.setAttribute('data-font-size', size);
  }

  function setStyle(style) {
    if (!STYLES.includes(style)) return;
    S.set(KEY_STYLE, style);
    document.documentElement.setAttribute('data-style', style);
  }

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
    setFont(getFont());
    setFontSize(getFontSize());
    setStyle(getStyle());
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
    const currentStyle  = getStyle();
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
                <span class="settings-item-label">Gaya Tampilan</span>
                <span class="settings-item-sub">Pilih gaya desain aplikasi</span>
              </div>
              <div class="style-picker">
                ${STYLES.map(s => `
                  <div class="style-option ${s === currentStyle ? 'active' : ''}" data-style-pick="${s}">
                    <div class="style-preview ${s}">
                      <div class="style-preview-box"></div>
                    </div>
                    <span class="style-label">${STYLE_LABELS[s]}</span>
                  </div>
                `).join('')}
              </div>
            </div>
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
              <div class="accent-dropdowns">
              ${ACCENT_CATEGORIES.map(cat => {
                const picked = cat.colors.find(a => a.id === currentAccent);
                return `
                <div class="dropdown-wrap" data-dropdown="accent-${cat.name}">
                  <button class="dropdown-trigger" data-dropdown-toggle="accent-${cat.name}">
                    <span class="dropdown-value">${picked ? `<span class="accent-dot-mini" style="background:${picked.hex}"></span> ${picked.label}` : `${cat.name}`}</span>
                    <i class="fa-solid fa-chevron-down dropdown-arrow"></i>
                  </button>
                  <div class="dropdown-menu" id="dropdown-accent-${cat.name}">
                    ${cat.colors.map(a => `
                      <div class="dropdown-item ${a.id === currentAccent ? 'active' : ''}" data-accent-pick="${a.id}">
                        <span class="accent-dot-mini" style="background:${a.hex}"></span>
                      </div>
                    `).join('')}
                  </div>
                </div>`;
              }).join('')}
              </div>
            </div>
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Font Family</span>
                <span class="settings-item-sub">Pilih gaya font tampilan</span>
              </div>
              <div class="dropdown-wrap" data-dropdown="font">
                <button class="dropdown-trigger" data-dropdown-toggle="font">
                  <span class="dropdown-value" style="font-family:${FONTS.find(f => f.id === getFont())?.display || ''}">${FONTS.find(f => f.id === getFont())?.label || 'Default'}</span>
                  <i class="fa-solid fa-chevron-down dropdown-arrow"></i>
                </button>
                <div class="dropdown-menu" id="dropdown-font">
                  ${FONTS.map(f => `
                    <div class="dropdown-item ${f.id === getFont() ? 'active' : ''}" data-font-pick="${f.id}">
                      <span style="font-family:${f.display}">${f.label}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="settings-item">
              <div class="settings-item-left">
                <span class="settings-item-label">Ukuran Font</span>
                <span class="settings-item-sub">Atur ukuran teks konten</span>
              </div>
              <div class="dropdown-wrap" data-dropdown="fontsize">
                <button class="dropdown-trigger" data-dropdown-toggle="fontsize">
                  <span class="dropdown-value">${FONT_SIZE_LABELS[getFontSize()]}</span>
                  <i class="fa-solid fa-chevron-down dropdown-arrow"></i>
                </button>
                <div class="dropdown-menu" id="dropdown-fontsize">
                  ${FONT_SIZES.map(s => `
                    <div class="dropdown-item ${s === getFontSize() ? 'active' : ''}" data-size-pick="${s}">
                      <span>${FONT_SIZE_LABELS[s]}</span>
                    </div>
                  `).join('')}
                </div>
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
                <span class="settings-item-label">Download Aplikasi (PWA)</span>
                <span class="settings-item-sub">Install Notara sebagai aplikasi</span>
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
                <span class="settings-item-sub">Versi ${window.Notara.APP_VERSION} &bull; PWA Notes App</span>
              </div>
              <img src="ikon-non-transparant.png" alt="" width="28" height="28" style="border-radius:10%">
            </div>
            <div class="divider" style="margin:0"></div>
            <div class="settings-item" style="cursor:pointer" id="setting-check-update">
              <div class="settings-item-left">
                <span class="settings-item-label"><i class="fa-solid fa-arrows-rotate" style="color:var(--accent);margin-right:8px"></i>Periksa Update</span>
                <span class="settings-item-sub">Cek apakah versi terbaru tersedia</span>
              </div>
              <i class="fa-solid fa-chevron-right" style="color:var(--text-3);font-size:0.8rem"></i>
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
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);font-size:0.8rem"></i>
            </a>
            <a href="https://wa.me/6289527003290?text=Halo%20Dede%2C%20aku%20punya%20kritik%2Fsaran%20tentang%20aplikasi%20Notara%3A%20" target="_blank" rel="noopener" class="settings-item settings-item-link">
              <div class="settings-item-left">
                <span class="settings-item-label"><i class="fa-brands fa-whatsapp" style="color:#25d366;margin-right:8px"></i>WhatsApp</span>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);font-size:0.8rem"></i>
            </a>
            <a href="https://www.instagram.com/zadostrix/" target="_blank" rel="noopener" class="settings-item settings-item-link">
              <div class="settings-item-left">
                <span class="settings-item-label"><i class="fa-brands fa-instagram" style="color:#e1306c;margin-right:8px"></i>Instagram</span>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);font-size:0.8rem"></i>
            </a>
            <a href="https://www.tiktok.com/@zadostrix?is_from_webapp=1&sender_device=pc" target="_blank" rel="noopener" class="settings-item settings-item-link">
              <div class="settings-item-left">
                <span class="settings-item-label"><i class="fa-brands fa-tiktok" style="color:var(--text-1);margin-right:8px"></i>TikTok</span>
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

    document.querySelectorAll('[data-style-pick]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('[data-style-pick]').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        setStyle(el.dataset.stylePick);
      });
    });

    document.querySelectorAll('[data-accent-pick]').forEach(el => {
      el.addEventListener('click', function() {
        setAccent(el.dataset.accentPick);
        var accentObj = ALL_ACCENTS.find(a => a.id === el.dataset.accentPick);
        ACCENT_CATEGORIES.forEach(cat => {
          var catWrap = document.querySelector(`[data-dropdown="accent-${cat.name}"]`);
          if (!catWrap) return;
          var picked = cat.colors.find(a => a.id === el.dataset.accentPick);
          var val = catWrap.querySelector('.dropdown-value');
          if (picked) {
            val.innerHTML = `<span class="accent-dot-mini" style="background:${picked.hex}"></span> ${picked.label}`;
          } else {
            val.textContent = cat.name;
          }
          catWrap.querySelectorAll('.dropdown-item').forEach(x => x.classList.remove('active'));
        });
        el.classList.add('active');
        _closeAllDropdowns();
      });
    });

    function _closeAllDropdowns() {
      document.querySelectorAll('.dropdown-wrap.open').forEach(function(w) { w.classList.remove('open'); });
    }

    document.addEventListener('click', _closeAllDropdowns);

    document.querySelectorAll('[data-dropdown-toggle]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var wrap = this.closest('.dropdown-wrap');
        var isOpen = wrap.classList.contains('open');
        _closeAllDropdowns();
        if (!isOpen) wrap.classList.add('open');
      });
    });

    document.querySelectorAll('[data-font-pick]').forEach(function(el) {
      el.addEventListener('click', function() {
        setFont(el.dataset.fontPick);
        var wrap = document.querySelector('[data-dropdown="font"]');
        var fontObj = FONTS.find(function(f) { return f.id === el.dataset.fontPick; });
        if (fontObj) {
          wrap.querySelector('.dropdown-value').textContent = fontObj.label;
          wrap.querySelector('.dropdown-value').style.fontFamily = fontObj.display;
        }
        wrap.querySelectorAll('.dropdown-item').forEach(function(x) { x.classList.remove('active'); });
        el.classList.add('active');
        _closeAllDropdowns();
      });
    });

    document.querySelectorAll('[data-size-pick]').forEach(function(el) {
      el.addEventListener('click', function() {
        setFontSize(el.dataset.sizePick);
        var wrap = document.querySelector('[data-dropdown="fontsize"]');
        wrap.querySelector('.dropdown-value').textContent = FONT_SIZE_LABELS[el.dataset.sizePick];
        wrap.querySelectorAll('.dropdown-item').forEach(function(x) { x.classList.remove('active'); });
        el.classList.add('active');
        _closeAllDropdowns();
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
      window.Notara.UI.promptInstall();
    });

    document.getElementById('setting-check-update')?.addEventListener('click', async () => {
      const btn = document.getElementById('setting-check-update');
      const label = btn?.querySelector('.settings-item-label');
      const sub = btn?.querySelector('.settings-item-sub');
      if (label) label.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--accent);margin-right:8px"></i>Memeriksa...';
      if (sub) sub.textContent = 'Sedang menghubungi server...';
      const hasUpdate = await window.Notara.UpdateChecker.checkForUpdate(true);
      if (hasUpdate) {
        location.reload();
      } else {
        window.Notara.UI.toast('Kamu sudah menggunakan versi terbaru!', 'success');
        renderPage();
      }
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
      const m1 = window.Notara.UI.modal({
        title: '<i class="fa-solid fa-triangle-exclamation" style="color:var(--label-hard)"></i> Hapus Semua Catatan',
        body: `
          <div style="color:var(--text-2);line-height:1.7;font-size:0.9rem">
            <p style="font-weight:800;color:var(--label-hard);margin-bottom:8px">Tindakan ini tidak dapat dibatalkan!</p>
            <p>Semua catatan kamu akan dihapus <b>permanen</b> dari server. Berikut yang akan terjadi:</p>
            <ul style="margin:8px 0 8px 16px;padding:0;color:var(--text-1)">
              <li>Semua catatan akan dihapus permanen</li>
              <li>Catatan yang ada di Sampah juga akan terhapus</li>
              <li>Tag yang tidak dipakai catatan apapun akan tersisa</li>
              <li>Pengingat (reminder) pada catatan akan berhenti</li>
              <li>Riwayat versi catatan akan hilang</li>
            </ul>
            <p style="margin-top:8px">Kamu bisa membackup catatan terlebih dahulu dari menu <b>Eksport</b> sebelum melanjutkan.</p>
          </div>
        `,
        footer: `
          <button class="btn-ghost" id="modal-cancel">Batal</button>
          <button class="btn-primary" id="modal-ok" style="margin-left:8px;background:var(--label-hard)"><i class="fa-solid fa-arrow-right"></i> Lanjutkan</button>
        `,
      });
      document.getElementById('modal-cancel').onclick = () => m1.close();
      document.getElementById('modal-ok').onclick = () => {
        m1.close();
        _showDeleteAllConfirm();
      };
    });
  }

  async function _showDeleteAllConfirm() {
    const m2 = window.Notara.UI.modal({
      title: '<i class="fa-solid fa-lock" style="color:var(--label-hard)"></i> Konfirmasi Penghapusan',
      body: `
        <div style="color:var(--text-2);line-height:1.6;font-size:0.9rem">
          <p style="margin-bottom:12px">Ketik <b style="color:var(--label-hard)">HAPUS</b> untuk melanjutkan penghapusan:</p>
          <div style="margin-bottom:12px">
            <input type="text" id="delete-confirm-text" class="new-post-textarea" style="min-height:auto;resize:none;font-weight:800;letter-spacing:0.05em" placeholder="Ketik HAPUS di sini" autocomplete="off" spellcheck="false">
          </div>
          <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:10px;background:var(--bg);border:var(--border-w) solid var(--border-strong)">
            <input type="checkbox" id="delete-confirm-check" style="margin-top:3px;accent-color:var(--label-hard)">
            <span style="font-weight:700;color:var(--text-1);font-size:0.85rem">Saya sadar apa yang saya lakukan</span>
          </label>
        </div>
      `,
      footer: `
        <button class="btn-ghost" id="modal-cancel">Batal</button>
        <button class="btn-primary" id="modal-ok" disabled style="margin-left:8px;background:var(--label-hard)"><i class="fa-solid fa-trash"></i> Hapus Semua</button>
      `,
    });

    const textInput  = document.getElementById('delete-confirm-text');
    const checkEl    = document.getElementById('delete-confirm-check');
    const okBtn      = document.getElementById('modal-ok');
    const cancelBtn  = document.getElementById('modal-cancel');

    function _validate() {
      okBtn.disabled = !(textInput.value.trim().toUpperCase() === 'HAPUS' && checkEl.checked);
    }
    textInput.addEventListener('input', _validate);
    checkEl.addEventListener('change', _validate);

    cancelBtn.onclick = () => m2.close();
    okBtn.onclick = async () => {
      if (textInput.value.trim().toUpperCase() !== 'HAPUS' || !checkEl.checked) return;

      okBtn.disabled = true;
      okBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menghapus...';

      try {
        const notes = await window.Notara.Notes.getAll();
        const trash = await window.Notara.Notes.getTrash();
        await Promise.all([
          ...notes.map(n => window.Notara.Notes.remove(n.id)),
          ...trash.map(n => window.Notara.Notes.permanentDelete(n.id)),
        ]);
        m2.close();
        window.Notara.UI.toast('Semua catatan berhasil dihapus', 'success');
        window.Notara.UI.updateStorageIndicator();
        renderPage();
      } catch (err) {
        console.error('[Notara] Hapus semua gagal:', err);
        window.Notara.UI.toast(err.message || 'Gagal menghapus', 'error');
        okBtn.disabled = false;
        okBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Hapus Semua';
      }
    };
  }

  return { init, getTheme, getAccent, getFont, getFontSize, getStyle, setTheme, setAccent, setFont, setFontSize, setStyle, cycleTheme, renderPage };
})();