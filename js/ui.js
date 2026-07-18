/* js/ui.js — Shared UI helpers */
'use strict';

window.Notara = window.Notara || {};

window.Notara.UI = (() => {

  /* ── Toast ─────────────────────────────────── */
  function toast(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: '<i class="fa-solid fa-circle-check"></i>',
      error:   '<i class="fa-solid fa-circle-xmark"></i>',
      info:    '<i class="fa-solid fa-circle-info"></i>',
      warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
    };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  }

  /* ── Modal ─────────────────────────────────── */
  function modal({ title = '', body = '', footer = '', onClose } = {}) {
    const overlay  = document.getElementById('modal-overlay');
    const elTitle  = document.getElementById('modal-title');
    const elBody   = document.getElementById('modal-body');
    const elFoot   = document.getElementById('modal-footer');
    const closeBtn = document.getElementById('modal-close');
    const toastCnt = document.getElementById('toast-container');

    elTitle.innerHTML = title;
    elBody.innerHTML    = body;
    elFoot.innerHTML    = footer;

    overlay.classList.add('open');
    overlay.removeAttribute('aria-hidden');
    if (toastCnt) toastCnt.style.zIndex = '800';

    function close() {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      elBody.innerHTML = '';
      elFoot.innerHTML = '';
      closeBtn.onclick = null;
      overlay.onclick  = null;
      if (toastCnt) toastCnt.style.zIndex = '';
      if (onClose) onClose();
    }

    closeBtn.onclick = close;
    overlay.onclick  = e => { if (e.target === overlay) close(); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    }, { once: true });

    return { close, body: elBody, footer: elFoot };
  }

  /* ── Confirm Modal ─────────────────────────── */
  function confirm({ title, message, okLabel = 'Hapus', okClass = 'btn-ghost', cancelLabel = 'Batal' }) {
    return new Promise(resolve => {
      // settle() guards against double-resolve — Promise hanya bisa di-resolve sekali.
      // Urutan penting: resolve SEBELUM m.close(), karena close() memanggil onClose()
      // yang juga memanggil resolve. Jika m.close() dipanggil duluan, onClose() menang
      // dan ok selalu false.
      let settled = false;
      const settle = (val) => { if (!settled) { settled = true; resolve(val); } };

      const m = modal({
        title,
        body: `<p style="color:var(--text-2);line-height:1.6">${message}</p>`,
        footer: `
          <button class="btn-ghost" id="modal-cancel">${cancelLabel}</button>
          <button class="${okClass}" id="modal-ok" style="margin-left:8px">${okLabel}</button>
        `,
        onClose: () => settle(false),
      });
      document.getElementById('modal-cancel').onclick = () => { settle(false); m.close(); };
      document.getElementById('modal-ok').onclick     = () => { settle(true);  m.close(); };
    });
  }

  /* ── Action Popup ──────────────────────────── */
  let _popupClose = null;

  function openPopup(noteId, title, items) {
    // Force-close any previously open popup first
    if (_popupClose) { _popupClose(); _popupClose = null; }

    const popup   = document.getElementById('action-popup');
    const elTitle = document.getElementById('action-popup-title');
    const elItems = document.getElementById('action-popup-items');

    elTitle.textContent = title || '';
    elItems.innerHTML   = items.map(item => `
      <div class="popup-item${item.danger ? ' danger' : ''}" data-action="${item.action}" role="listitem" tabindex="0">
        <span class="popup-item-icon">${item.icon}</span>
        <span>${item.label}</span>
      </div>
    `).join('');

    popup.classList.add('open');
    popup.removeAttribute('aria-hidden');

    // Cleanup references so they can be removed properly
    let _escHandler  = null;
    let _clickHandler = null;

    function close() {
      popup.classList.remove('open');
      popup.setAttribute('aria-hidden', 'true');
      if (_escHandler)   { document.removeEventListener('keydown',  _escHandler); _escHandler = null; }
      if (_clickHandler) { document.removeEventListener('click', _clickHandler); _clickHandler = null; }
      _popupClose = null;
    }
    _popupClose = close;

    elItems.querySelectorAll('.popup-item').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const action = el.dataset.action;
        close();
        const found = items.find(i => i.action === action);
        if (found?.handler) found.handler(noteId);
      });
      // Keyboard accessibility
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });

    // Escape key closes popup
    _escHandler = function(e) {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', _escHandler);

    // Outside click — use capture to catch all clicks reliably
    _clickHandler = function(e) {
      if (!popup.contains(e.target)) close();
    };
    // Small delay so the triggering click doesn't immediately close
    setTimeout(() => {
      if (_popupClose) document.addEventListener('click', _clickHandler);
    }, 80);
  }

  function closePopup() {
    if (_popupClose) { _popupClose(); }
  }

  /* ── Sidebar ───────────────────────────────── */
  function initSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const menuBtn  = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('sidebar-close');

    function open()  {
      sidebar.classList.add('open');
      overlay.classList.add('active');
    }
    function close() {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    }

    function toggle() {
      if (sidebar.classList.contains('open')) close();
      else open();
    }

    menuBtn?.addEventListener('click', toggle);
    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', close);

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 1024) close();
      });
    });

    return { open, close, toggle };
  }

  /* ── Active nav ────────────────────────────── */
  function setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  }

  /* ── Topbar title ──────────────────────────── */
  function setTitle(title) {
    const el = document.getElementById('topbar-title');
    if (el) el.textContent = title;
  }

  /* ── Storage indicator ─────────────────────── */
  async function updateStorageIndicator() {
    const fill  = document.getElementById('storage-fill');
    const label = document.getElementById('storage-label');
    try {
      const c = await window.Notara.Notes.count();
      // Visual fill: 1 note = 2%, max 100 notes = 100%
      const pct = Math.min((c / 100) * 100, 100);
      if (fill)  fill.style.width  = pct.toFixed(1) + '%';
      if (label) label.textContent = `${c} catatan`;
    } catch { /* ignore */ }
  }

  /* ── Format date ───────────────────────────── */
  function formatDate(iso) {
    if (!iso) return '';
    const d    = new Date(iso);
    const now  = new Date();
    const diff = (now - d) / 1000;

    if (diff < 60)        return 'Baru saja';
    if (diff < 3600)      return `${Math.floor(diff / 60)} mnt lalu`;
    if (diff < 86400)     return `${Math.floor(diff / 3600)} jam lalu`;
    if (diff < 86400 * 2) return 'Kemarin';
    return d.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short',
      year: diff > 86400 * 365 ? 'numeric' : undefined
    });
  }

  /* ── Strip HTML ────────────────────────────── */
  function stripHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent || '';
  }

  /* ── Ripple ────────────────────────────────── */
  function addRipple(el) {
    el.classList.add('ripple-container');
    el.addEventListener('click', e => {
      const rect = el.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const y    = e.clientY - rect.top;
      const span = document.createElement('span');
      span.className = 'ripple-element';
      const size = Math.max(rect.width, rect.height);
      span.style.cssText = `width:${size}px;height:${size}px;top:${y - size/2}px;left:${x - size/2}px`;
      el.appendChild(span);
      span.addEventListener('animationend', () => span.remove(), { once: true });
    });
  }

  /* ── PWA Install ───────────────────────────── */
  let _deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstall = e;
  });

  function promptInstall() {
    if (_deferredInstall) {
      _deferredInstall.prompt();
      _deferredInstall.userChoice.then(r => {
        if (r.outcome === 'accepted') toast('Notara berhasil diinstall!', 'success');
        _deferredInstall = null;
      });
    } else {
      toast('Buka menu browser dan pilih "Tambahkan ke layar utama"', 'info', 5000);
    }
  }

  return {
    toast, modal, confirm,
    openPopup, closePopup,
    initSidebar, setActiveNav, setTitle,
    updateStorageIndicator,
    addRipple, formatDate, stripHtml,
    promptInstall,
  };
})();