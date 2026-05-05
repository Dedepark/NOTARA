/* js/reminders.js — Deadline & Reminder notification engine */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Reminders = (() => {

  /* ── Constants ────────────────────────────── */
  const CHECK_INTERVAL_MS = 60_000; // cek setiap 1 menit
  let   _checkTimer       = null;

  /* ── Permission helper ────────────────────── */
  function hasPermission() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  async function requestPermission() {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  /* ── Fire a local notification ─────────────── */
  function _fire(title, body, tag) {
    if (!hasPermission()) return;
    const options = { body, tag, icon: './ikon.png', badge: './ikon.png', renotify: false };

    // Pakai SW jika tersedia (agar notif muncul saat tab di background)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, options);
      }).catch(() => {
        // fallback ke Notification API biasa
        new Notification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  }

  /* ── Format countdown string ─────────────── */
  function formatCountdown(isoString) {
    if (!isoString) return null;
    const target  = new Date(isoString).getTime();
    const now     = Date.now();
    const diff    = target - now;

    if (diff <= 0) return { text: 'Telah lewat', urgent: true, overdue: true };

    const secs  = Math.floor(diff / 1000);
    const mins  = Math.floor(secs  / 60);
    const hours = Math.floor(mins  / 60);
    const days  = Math.floor(hours / 24);

    let text;
    if (days  >= 1) text = `${days} hari lagi`;
    else if (hours >= 1) text = `${hours} jam lagi`;
    else if (mins  >= 1) text = `${mins} menit lagi`;
    else text = 'Kurang dari 1 menit';

    const urgent = diff < 3 * 60 * 60 * 1000; // < 3 jam = merah
    return { text, urgent, overdue: false };
  }

  /* ── Check all notes & fire notifications ─── */
  async function _checkAll() {
    if (!hasPermission()) return;
    try {
      const notes = await window.Notara.Notes.getAll();
      const now   = Date.now();

      notes.forEach(note => {
        // --- Reminder ---
        if (note.reminderAt) {
          const t = new Date(note.reminderAt).getTime();
          // Window: sudah lewat sampai 2 mnt yang lalu agar tidak terlewat
          if (t <= now && t >= now - 2 * 60 * 1000) {
            const tag = 'reminder_' + note.id + '_' + Math.floor(t / 60000);
            _fire(
              `⏰ Pengingat: ${note.title}`,
              'Saatnya membuka catatan ini!',
              tag
            );
          }
        }

        // --- Deadline (1 jam sebelum) ---
        if (note.deadline) {
          const t = new Date(note.deadline).getTime();
          const oneHour = 60 * 60 * 1000;
          // Notif 1 jam sebelum: window 2 mnt
          if (t - oneHour <= now && t - oneHour >= now - 2 * 60 * 1000) {
            const tag = 'deadline_1h_' + note.id;
            _fire(
              `⚠️ Deadline 1 jam lagi: ${note.title}`,
              'Tenggat waktu catatan ini semakin dekat!',
              tag
            );
          }
          // Notif tepat saat deadline
          if (t <= now && t >= now - 2 * 60 * 1000) {
            const tag = 'deadline_now_' + note.id;
            _fire(
              `🔔 Deadline tercapai: ${note.title}`,
              'Tenggat waktu catatan ini telah tiba!',
              tag
            );
          }
        }
      });
    } catch(e) {
      // Gagal ambil notes — abaikan
    }
  }

  /* ── Start / Stop polling ─────────────────── */
  function start() {
    if (_checkTimer) return;
    _checkAll(); // langsung cek saat start
    _checkTimer = setInterval(_checkAll, CHECK_INTERVAL_MS);
  }

  function stop() {
    if (_checkTimer) { clearInterval(_checkTimer); _checkTimer = null; }
  }

  /* ── Show type-picker modal ────────────────── */
  /*
   * Menampilkan modal tipe catatan baru.
   * Callback onSelect(type, deadline, reminderAt):
   *   type = 'normal' | 'deadline' | 'reminder'
   */
  function showTypePicker(onSelect) {
    const UI = window.Notara.UI;

    // Tanggal minimum: sekarang + 1 menit (ISO local)
    function _minDatetimeLocal() {
      const d = new Date(Date.now() + 60_000);
      // Koreksi timezone ke local ISO supaya value <input datetime-local> benar
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    }

    const minDT = _minDatetimeLocal();

    UI.modal({
      title: 'Tipe Catatan Baru',
      body: `
        <div class="note-type-picker">

          <button class="note-type-option" data-type="normal" aria-label="Catatan biasa">
            <span class="note-type-icon"><i class="fa-solid fa-note-sticky"></i></span>
            <div class="note-type-info">
              <strong>Catatan Biasa</strong>
              <span>Tulis bebas tanpa batas waktu</span>
            </div>
            <i class="fa-solid fa-chevron-right note-type-arrow"></i>
          </button>

          <button class="note-type-option" data-type="deadline" aria-label="Catatan bertenggat">
            <span class="note-type-icon deadline"><i class="fa-solid fa-hourglass-half"></i></span>
            <div class="note-type-info">
              <strong>Tenggat Waktu</strong>
              <span>Tambahkan batas waktu pengerjaan</span>
            </div>
            <i class="fa-solid fa-chevron-right note-type-arrow"></i>
          </button>

          <button class="note-type-option" data-type="reminder" aria-label="Catatan pengingat">
            <span class="note-type-icon reminder"><i class="fa-solid fa-bell"></i></span>
            <div class="note-type-info">
              <strong>Pengingat</strong>
              <span>Dapatkan notifikasi pada waktu tertentu</span>
            </div>
            <i class="fa-solid fa-chevron-right note-type-arrow"></i>
          </button>
        </div>

        <!-- datetime fields — hidden until type dipilih -->
        <div id="dt-deadline-wrap" class="dt-field-wrap hidden">
          <label class="dt-label">
            <i class="fa-solid fa-hourglass-half"></i> Batas Waktu Pengerjaan
          </label>
          <input type="datetime-local" id="dt-deadline-input"
            class="dt-input" min="${minDT}" value="${minDT}">
        </div>
        <div id="dt-reminder-wrap" class="dt-field-wrap hidden">
          <label class="dt-label">
            <i class="fa-solid fa-bell"></i> Waktu Pengingat
          </label>
          <input type="datetime-local" id="dt-reminder-input"
            class="dt-input" min="${minDT}" value="${minDT}">
        </div>
        <div id="dt-error" class="auth-error" style="margin-top:8px"></div>
      `,
      footer: `
        <button class="btn-ghost" id="type-cancel">Batal</button>
        <button class="btn-primary" id="type-confirm" disabled style="margin-left:8px">
          <i class="fa-solid fa-plus"></i> Buat Catatan
        </button>
      `,
    });

    setTimeout(() => {
      let _selectedType = null;

      const confirmBtn    = document.getElementById('type-confirm');
      const cancelBtn     = document.getElementById('type-cancel');
      const deadlineWrap  = document.getElementById('dt-deadline-wrap');
      const reminderWrap  = document.getElementById('dt-reminder-wrap');
      const deadlineInput = document.getElementById('dt-deadline-input');
      const reminderInput = document.getElementById('dt-reminder-input');
      const dtError       = document.getElementById('dt-error');

      document.querySelectorAll('.note-type-option').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.note-type-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          _selectedType = btn.dataset.type;

          deadlineWrap.classList.add('hidden');
          reminderWrap.classList.add('hidden');
          dtError.textContent = '';

          if (_selectedType === 'deadline') deadlineWrap.classList.remove('hidden');
          if (_selectedType === 'reminder') {
            reminderWrap.classList.remove('hidden');
            // Cek apakah notif sudah diizinkan
            if (!hasPermission()) {
              dtError.textContent = '⚠ Aktifkan notifikasi di Pengaturan agar pengingat berfungsi.';
            }
          }
          confirmBtn.disabled = false;
        });
      });

      cancelBtn?.addEventListener('click', () => {
        document.getElementById('modal-close')?.click();
      });

      confirmBtn?.addEventListener('click', () => {
        if (!_selectedType) return;

        let deadline   = null;
        let reminderAt = null;
        const minEpoch = Date.now() + 30_000; // harus minimal 30 detik ke depan

        if (_selectedType === 'deadline') {
          const val = deadlineInput?.value;
          if (!val) { dtError.textContent = 'Pilih batas waktu terlebih dahulu.'; return; }
          deadline = new Date(val).toISOString();
          if (new Date(deadline).getTime() < minEpoch) {
            dtError.textContent = 'Batas waktu harus di masa depan.'; return;
          }
        }
        if (_selectedType === 'reminder') {
          const val = reminderInput?.value;
          if (!val) { dtError.textContent = 'Pilih waktu pengingat terlebih dahulu.'; return; }
          reminderAt = new Date(val).toISOString();
          if (new Date(reminderAt).getTime() < minEpoch) {
            dtError.textContent = 'Waktu pengingat harus di masa depan.'; return;
          }
        }

        document.getElementById('modal-close')?.click();
        onSelect(_selectedType, deadline, reminderAt);
      });
    }, 60);
  }

  /* ── Show deadline editor in editor page ─── */
  /*
   * Render inline deadline/reminder row di bawah editor.
   * Dipanggil dari editor.js setelah mount.
   */
  function renderDeadlineBadge(note) {
    const container = document.getElementById('editor-deadline-wrap');
    if (!container) return;

    const hasDeadline  = !!note?.deadline;
    const hasReminder  = !!note?.reminderAt;

    if (!hasDeadline && !hasReminder) {
      container.innerHTML = '';
      return;
    }

    const items = [];
    if (hasDeadline) {
      const cd = formatCountdown(note.deadline);
      const dt = new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      items.push(`
        <span class="deadline-badge ${cd?.urgent ? 'urgent' : ''} ${cd?.overdue ? 'overdue' : ''}">
          <i class="fa-solid fa-hourglass-half"></i>
          <span class="deadline-badge-label">Tenggat:</span>
          <span class="deadline-badge-dt">${dt}</span>
          <span class="deadline-badge-cd">${cd?.text || ''}</span>
          <button class="deadline-remove-btn" data-field="deadline" title="Hapus tenggat">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </span>
      `);
    }
    if (hasReminder) {
      const cd = formatCountdown(note.reminderAt);
      const dt = new Date(note.reminderAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      items.push(`
        <span class="deadline-badge reminder-badge ${cd?.urgent ? 'urgent' : ''} ${cd?.overdue ? 'overdue' : ''}">
          <i class="fa-solid fa-bell"></i>
          <span class="deadline-badge-label">Pengingat:</span>
          <span class="deadline-badge-dt">${dt}</span>
          <span class="deadline-badge-cd">${cd?.text || ''}</span>
          <button class="deadline-remove-btn" data-field="reminder" title="Hapus pengingat">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </span>
      `);
    }

    container.innerHTML = items.join('');

    // Bind remove buttons
    container.querySelectorAll('.deadline-remove-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const field = btn.dataset.field;
        if (!note?.id) return;
        const changes = field === 'deadline' ? { deadline: null } : { reminderAt: null };
        try {
          const updated = await window.Notara.Notes.update(note.id, changes);
          // Re-render badge setelah update
          renderDeadlineBadge(updated);
          window.Notara.UI.toast(
            field === 'deadline' ? 'Tenggat dihapus' : 'Pengingat dihapus', 'info'
          );
        } catch(err) {
          window.Notara.UI.toast('Gagal menghapus: ' + err.message, 'error');
        }
      });
    });
  }

  /* ── Render countdown badge for note card ─── */
  function cardBadgeHtml(note) {
    if (!note.deadline && !note.reminderAt) return '';
    const parts = [];
    if (note.deadline) {
      const cd = formatCountdown(note.deadline);
      if (cd) {
        parts.push(`<span class="card-deadline-badge ${cd.urgent ? 'urgent' : ''} ${cd.overdue ? 'overdue' : ''}">
          <i class="fa-solid fa-hourglass-half"></i> ${cd.text}
        </span>`);
      }
    } else if (note.reminderAt) {
      const cd = formatCountdown(note.reminderAt);
      if (cd) {
        parts.push(`<span class="card-deadline-badge reminder ${cd.urgent ? 'urgent' : ''} ${cd.overdue ? 'overdue' : ''}">
          <i class="fa-solid fa-bell"></i> ${cd.text}
        </span>`);
      }
    }
    return parts.join('');
  }

  return {
    hasPermission, requestPermission,
    formatCountdown, cardBadgeHtml,
    showTypePicker, renderDeadlineBadge,
    start, stop,
  };
})();