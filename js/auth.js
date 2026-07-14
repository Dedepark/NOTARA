/* js/auth.js — Autentikasi dengan Supabase */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Auth = (() => {
  const db = () => window.Notara.db;

  /* ── State session saat ini ─────────────── */
  let _session  = null;
  let _user     = null;
  let _onReadyCb = null;

  function getUser()    { return _user; }
  function getSession() { return _session; }
  function getName()    { return _user?.user_metadata?.name || _user?.email?.split('@')[0] || 'Pengguna'; }
  function isLoggedIn() { return !!_session; }

  /* ── Init: cek session yang tersimpan ─────── */
  async function init(onReady) {
    _onReadyCb = onReady;

    const { data } = await db().auth.getSession();
    _session = data.session;
    _user    = data.session?.user || null;

    // Listen untuk perubahan auth state
    db().auth.onAuthStateChange((_event, session) => {
      _session = session;
      _user    = session?.user || null;
      if (_onReadyCb) _onReadyCb(isLoggedIn());
    });

    if (_onReadyCb) _onReadyCb(isLoggedIn());
  }

  /* ── Register ────────────────────────────── */
  async function register(email, name, password) {
    const { data, error } = await db().auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: undefined,
      }
    });
    if (error) throw error;
    // Jika email confirmation disabled di Supabase dashboard,
    // session langsung tersedia
    _session = data.session;
    _user    = data.user;
    return data;
  }

  /* ── Login ───────────────────────────────── */
  async function login(email, password) {
    const { data, error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw error;
    _session = data.session;
    _user    = data.user;
    return data;
  }

  /* ── Logout ──────────────────────────────── */
  async function logout() {
    await db().auth.signOut();
    _session = null;
    _user    = null;
  }

  /* ── Render halaman auth ─────────────────── */
  function renderAuthPage() {
    document.body.innerHTML = `
      <div class="auth-page" id="auth-page">
        <div class="auth-card" id="auth-card">

          <div class="auth-logo">
            <span class="logo-icon" aria-hidden="true">◈</span>
            <span class="logo-text">Notara</span>
          </div>
          <p class="auth-tagline">Catatan modern, tersimpan aman.</p>

          <!-- Tab switcher -->
          <div class="auth-tabs">
            <button class="auth-tab active" id="tab-login">Masuk</button>
            <button class="auth-tab" id="tab-register">Daftar</button>
          </div>

          <!-- LOGIN FORM -->
          <form class="auth-form" id="form-login" novalidate>
            <div class="auth-field">
              <label class="auth-label">Email</label>
              <div class="auth-input-wrap">
                <i class="fa-solid fa-envelope auth-input-icon"></i>
                <input type="email" class="auth-input" id="login-email"
                  placeholder="nama@email.com" autocomplete="email" required>
              </div>
            </div>
            <div class="auth-field">
              <label class="auth-label">Password</label>
              <div class="auth-input-wrap">
                <i class="fa-solid fa-lock auth-input-icon"></i>
                <input type="password" class="auth-input" id="login-password"
                  placeholder="••••••••" autocomplete="current-password" required>
                <button type="button" class="auth-eye-btn" id="login-eye">
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
            </div>
            <div class="auth-error" id="login-error" aria-live="polite"></div>
            <button type="submit" class="btn-primary auth-submit" id="login-submit">
              <span>Masuk</span>
              <i class="fa-solid fa-arrow-right-to-bracket"></i>
            </button>
          </form>

          <!-- REGISTER FORM (hidden default) -->
          <form class="auth-form hidden" id="form-register" novalidate>
            <div class="auth-field">
              <label class="auth-label">Nama Lengkap</label>
              <div class="auth-input-wrap">
                <i class="fa-solid fa-user auth-input-icon"></i>
                <input type="text" class="auth-input" id="reg-name"
                  placeholder="Nama kamu" autocomplete="name" required>
              </div>
            </div>
            <div class="auth-field">
              <label class="auth-label">Email</label>
              <div class="auth-input-wrap">
                <i class="fa-solid fa-envelope auth-input-icon"></i>
                <input type="email" class="auth-input" id="reg-email"
                  placeholder="nama@email.com" autocomplete="email" required>
              </div>
            </div>
            <div class="auth-field">
              <label class="auth-label">Password</label>
              <div class="auth-input-wrap">
                <i class="fa-solid fa-lock auth-input-icon"></i>
                <input type="password" class="auth-input" id="reg-password"
                  placeholder="Min. 6 karakter" autocomplete="new-password" required>
                <button type="button" class="auth-eye-btn" id="reg-eye">
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
            </div>
            <div class="auth-error" id="reg-error" aria-live="polite"></div>
            <button type="submit" class="btn-primary auth-submit" id="reg-submit">
              <span>Buat Akun</span>
              <i class="fa-solid fa-user-plus"></i>
            </button>
          </form>

        </div>
      </div>
    `;

    _bindAuthEvents();
  }

  function _bindAuthEvents() {
    const tabLogin    = document.getElementById('tab-login');
    const tabReg      = document.getElementById('tab-register');
    const formLogin   = document.getElementById('form-login');
    const formReg     = document.getElementById('form-register');

    // Tab switcher
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabReg.classList.remove('active');
      formLogin.classList.remove('hidden');
      formReg.classList.add('hidden');
    });
    tabReg.addEventListener('click', () => {
      tabReg.classList.add('active');
      tabLogin.classList.remove('active');
      formReg.classList.remove('hidden');
      formLogin.classList.add('hidden');
    });

    // Eye toggle - login
    _bindEye('login-eye', 'login-password');
    _bindEye('reg-eye', 'reg-password');

    // Login submit
    formLogin.addEventListener('submit', async e => {
      e.preventDefault();
      const errEl  = document.getElementById('login-error');
      const submit = document.getElementById('login-submit');
      const email  = document.getElementById('login-email').value.trim();
      const pass   = document.getElementById('login-password').value;

      if (!email || !pass) { errEl.textContent = 'Harap isi semua field.'; return; }

      _setLoading(submit, true);
      errEl.textContent = '';
      try {
        await login(email, pass);
        // onAuthStateChange will trigger _onReadyCb
      } catch (err) {
        errEl.textContent = _translateError(err.message);
        _setLoading(submit, false);
      }
    });

    // Register submit
    formReg.addEventListener('submit', async e => {
      e.preventDefault();
      const errEl  = document.getElementById('reg-error');
      const submit = document.getElementById('reg-submit');
      const name   = document.getElementById('reg-name').value.trim();
      const email  = document.getElementById('reg-email').value.trim();
      const pass   = document.getElementById('reg-password').value;

      if (!name || !email || !pass) { errEl.textContent = 'Harap isi semua field.'; return; }
      if (pass.length < 6) { errEl.textContent = 'Password minimal 6 karakter.'; return; }

      _setLoading(submit, true);
      errEl.textContent = '';
      try {
        await register(email, name, pass);
      } catch (err) {
        errEl.textContent = _translateError(err.message);
        _setLoading(submit, false);
      }
    });
  }

  function _bindEye(btnId, inputId) {
    document.getElementById(btnId)?.addEventListener('click', () => {
      const input = document.getElementById(inputId);
      const icon  = document.querySelector(`#${btnId} i`);
      if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
      } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
      }
    });
  }

  function _setLoading(btn, loading) {
    btn.disabled = loading;
    const span = btn.querySelector('span');
    if (span) span.textContent = loading ? 'Memuat...' : btn.id === 'login-submit' ? 'Masuk' : 'Buat Akun';
  }

  function _translateError(msg) {
    if (msg.includes('Invalid login credentials')) return 'Email atau password salah.';
    if (msg.includes('Email not confirmed'))       return 'Silakan konfirmasi email terlebih dahulu.';
    if (msg.includes('User already registered'))   return 'Email sudah terdaftar, silakan masuk.';
    if (msg.includes('Password should be'))        return 'Password minimal 6 karakter.';
    if (msg.includes('Unable to validate'))        return 'Format email tidak valid.';
    return msg;
  }

  return { init, getUser, getSession, getName, isLoggedIn, login, register, logout, renderAuthPage };
})();