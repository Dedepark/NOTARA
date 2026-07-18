/* js/habits.js — Habit Tracker Module */
'use strict';
window.Notara = window.Notara || {};
window.Notara.HabitTracker = (() => {
  const db = () => window.Notara.db;
  const UI = window.Notara.UI;
  const Au = window.Notara.Auth;

  function _userId() { return Au.getUser()?.id; }
  function _today() { return new Date().toISOString().slice(0, 10); }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  async function getAll(userId) {
    const uid = userId || _userId();
    if (!uid) return [];
    const { data, error } = await db()
      .from('habit_lists')
      .select('*')
      .eq('user_id', uid)
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) { console.warn('[Habits] getAll error:', error.message); return []; }
    return data || [];
  }

  async function create(userId, name) {
    const uid = userId || _userId();
    if (!uid) throw new Error('User not logged in');
    const { data: existing } = await db()
      .from('habit_lists')
      .select('sort_order')
      .eq('user_id', uid)
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextOrder = (existing && existing[0]) ? existing[0].sort_order + 1 : 0;
    const { data, error } = await db()
      .from('habit_lists')
      .insert({ user_id: uid, name: name.trim(), sort_order: nextOrder })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function update(id, changes) {
    const { data, error } = await db()
      .from('habit_lists')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function remove(id) {
    const { error } = await db()
      .from('habit_lists')
      .update({ active: false })
      .eq('id', id);
    if (error) throw error;
    return true;
  }

  async function getTodayLogs(userId) {
    const uid = userId || _userId();
    if (!uid) return [];
    const { data, error } = await db()
      .from('habit_logs')
      .select('*')
      .eq('user_id', uid)
      .eq('date', _today());
    if (error) { console.warn('[Habits] getTodayLogs error:', error.message); return []; }
    return data || [];
  }

  async function toggle(userId, habitId, date) {
    const uid = userId || _userId();
    if (!uid) throw new Error('User not logged in');
    const d = date || _today();
    const { data: existing } = await db()
      .from('habit_logs')
      .select('*')
      .eq('user_id', uid)
      .eq('habit_id', habitId)
      .eq('date', d)
      .maybeSingle();
    if (existing) {
      const { data, error } = await db()
        .from('habit_logs')
        .update({ completed: !existing.completed })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await db()
        .from('habit_logs')
        .insert({ user_id: uid, habit_id: habitId, date: d, completed: true })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }

  async function getStreak(habitId, userId) {
    const uid = userId || _userId();
    if (!uid) return 0;
    const { data, error } = await db()
      .from('habit_logs')
      .select('date, completed')
      .eq('user_id', uid)
      .eq('habit_id', habitId)
      .eq('completed', true)
      .order('date', { ascending: false });
    if (error || !data) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const log = data.find(l => l.date === iso);
      if (log) { streak++; } else if (i > 0) { break; }
    }
    return streak;
  }

  async function getCompletionRate(habitId, days = 7) {
    const uid = _userId();
    if (!uid) return 0;
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    const { data, error } = await db()
      .from('habit_logs')
      .select('date, completed')
      .eq('user_id', uid)
      .eq('habit_id', habitId)
      .gte('date', start.toISOString().slice(0, 10))
      .lte('date', _today());
    if (error || !data) return 0;
    const completed = data.filter(l => l.completed).length;
    return days > 0 ? Math.round((completed / days) * 100) : 0;
  }

  const DEFAULTS = [
    'Minum Air 2L', 'Olahraga 30 Menit', 'Membaca 15 Menit',
    'Sarapan Sehat', 'Tidur Tepat Waktu', 'Meditasi 5 Menit',
    'Jalan Kaki 5000 Langkah', 'Makan Buah', 'Belajar Skill Baru',
    'Catat Hal yang Disyukuri',
  ];

  async function _seedDefaults() {
    const existing = await getAll();
    if (existing.length > 0) return;
    const uid = _userId();
    if (!uid) return;
    const inserts = DEFAULTS.map((name, i) => ({
      user_id: uid,
      name,
      sort_order: i,
    }));
    const { error } = await db().from('habit_lists').insert(inserts);
    if (error) console.warn('[Habits] seed defaults error:', error.message);
  }

  async function renderPage() {
    const main = document.getElementById('app-main');
    UI.setTitle('Kebiasaan');
    UI.setActiveNav('habits');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    await _seedDefaults();
    const [habits, logs] = await Promise.all([getAll(), getTodayLogs()]);
    const completedIds = new Set(logs.filter(l => l.completed).map(l => l.habit_id));
    const total = habits.length;
    const done = habits.filter(h => completedIds.has(h.id)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    let html = '<div class="tracker-page page-enter">';
    html += `<div class="tracker-header"><h2><i class="ph ph-check-circle"></i> Kebiasaan Hari Ini</h2><div style="display:flex;gap:6px"><button class="btn-primary" id="habit-add-btn" style="font-size:0.75rem;padding:0.35rem 0.7rem"><i class="ph ph-plus"></i> Tambah</button><button class="btn-ghost" id="habit-manage-btn" style="font-size:0.75rem;padding:0.35rem 0.7rem"><i class="ph ph-list"></i> Kelola</button></div></div>`;

    html += `<div class="habit-progress-card">`;
    html += `<div class="habit-progress-header"><span class="habit-progress-label">Progress Harian</span><span class="habit-progress-pct">${done}/${total} (${pct}%)</span></div>`;
    html += `<div class="habit-progress-bar"><div class="habit-progress-fill" style="width:${pct}%"></div></div>`;
    html += `</div>`;

    html += `<div class="habit-checklist" id="habit-checklist">`;
    if (!habits.length) {
      html += `<div class="empty-state" style="min-height:30vh"><span class="empty-icon"><i class="ph ph-check-circle" style="font-size:2.5rem;color:var(--accent);opacity:0.35"></i></span><h3>Belum ada kebiasaan</h3><p>Tambah kebiasaan baru untuk memulai rutinitas harian</p></div>`;
    } else {
      habits.forEach(h => {
        const isDone = completedIds.has(h.id);
        html += `<div class="habit-item ${isDone ? 'completed' : ''}" data-id="${h.id}">`;
        html += `<div class="habit-checkbox ${isDone ? 'checked' : ''}"></div>`;
        html += `<span class="habit-item-name">${_esc(h.name)}</span>`;
        html += `<span class="habit-item-streak" id="streak-${h.id}"></span>`;
        html += `</div>`;
      });
    }
    html += `</div>`;

    html += `</div>`;
    main.innerHTML = html;

    habits.forEach(async h => {
      const [streak, rate] = await Promise.all([getStreak(h.id), getCompletionRate(h.id)]);
      const el = document.getElementById(`streak-${h.id}`);
      if (el) el.textContent = `🔥 ${streak} · ${rate}%`;
    });

    _bindChecklistEvents(habits);
    _bindManageEvents();
  }

  function _bindChecklistEvents(habits) {
    document.querySelectorAll('.habit-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        const checkbox = item.querySelector('.habit-checkbox');
        const wasChecked = checkbox.classList.contains('checked');
        checkbox.classList.toggle('checked');
        item.classList.toggle('completed');

        try {
          await toggle(null, id);
          const freshLogs = await getTodayLogs();
          const done = freshLogs.filter(l => l.completed).length;
          const total = habits.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;

          const card = document.querySelector('.habit-progress-card');
          if (card) {
            card.innerHTML = `
              <div class="habit-progress-header"><span class="habit-progress-label">Progress Harian</span><span class="habit-progress-pct">${done}/${total} (${pct}%)</span></div>
              <div class="habit-progress-bar"><div class="habit-progress-fill" style="width:${pct}%"></div></div>
            `;
          }

          const [streak, rate] = await Promise.all([getStreak(id), getCompletionRate(id)]);
          const el = document.getElementById(`streak-${id}`);
          if (el) el.textContent = `🔥 ${streak} · ${rate}%`;
        } catch (err) {
          checkbox.classList.toggle('checked');
          item.classList.toggle('completed');
          UI.toast('Gagal: ' + err.message, 'error');
        }
      });
    });
  }

  function _bindManageEvents() {
    document.getElementById('habit-add-btn')?.addEventListener('click', () => _showManagePanel(null));
    document.getElementById('habit-manage-btn')?.addEventListener('click', _showManageList);
  }

  async function _showManageList() {
    const habits = await getAll();
    const listHtml = habits.length
      ? habits.map(h => `
          <div class="template-option" style="gap:6px">
            <span class="template-icon"><i class="ph ph-check-circle"></i></span>
            <div class="template-info"><strong>${_esc(h.name)}</strong></div>
            <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0">
              <button class="icon-btn habit-edit-btn" data-id="${h.id}" data-name="${_esc(h.name)}" style="width:28px;height:28px;font-size:0.75rem"><i class="ph ph-pen"></i></button>
              <button class="icon-btn habit-del-btn" data-id="${h.id}" data-name="${_esc(h.name)}" style="width:28px;height:28px;font-size:0.75rem;color:var(--label-hard)"><i class="ph ph-trash"></i></button>
            </div>
          </div>
        `).join('')
      : `<div class="empty-state" style="min-height:20vh;border:none;box-shadow:none;background:transparent"><span class="empty-icon"><i class="ph ph-check-circle" style="font-size:2rem;color:var(--text-3);opacity:0.3"></i></span><h3 style="font-size:0.9rem">Belum ada kebiasaan</h3></div>`;

    UI.modal({
      title: '<i class="ph ph-list"></i> Kelola Kebiasaan',
      body: `<div style="max-height:60vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px">${listHtml}</div>`,
      footer: `<button class="btn-ghost" id="manage-cancel">Tutup</button><button class="btn-primary" id="manage-add" style="margin-left:8px"><i class="ph ph-plus"></i> Tambah Baru</button>`,
    });
    setTimeout(() => {
      document.getElementById('manage-cancel')?.addEventListener('click', () => document.getElementById('modal-close')?.click());
      document.getElementById('manage-add')?.addEventListener('click', () => { document.getElementById('modal-close')?.click(); _showManagePanel(null); });
      document.querySelectorAll('.habit-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => { document.getElementById('modal-close')?.click(); _showManagePanel({ id: btn.dataset.id, name: btn.dataset.name }); });
      });
      document.querySelectorAll('.habit-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = await UI.confirm({ title: 'Hapus Kebiasaan', message: `"${_esc(btn.dataset.name)}" akan dinonaktifkan.`, okLabel: 'Hapus', okClass: 'btn-primary' });
          if (ok) { try { await remove(btn.dataset.id); UI.toast('Kebiasaan dihapus', 'info'); document.getElementById('modal-close')?.click(); _showManageList(); } catch (err) { UI.toast('Gagal: ' + err.message, 'error'); } }
        });
      });
    }, 60);
  }

  function _showManagePanel(existing) {
    const isEdit = !!existing;
    UI.modal({
      title: isEdit ? '<i class="ph ph-pen"></i> Edit Kebiasaan' : '<i class="ph ph-plus"></i> Kebiasaan Baru',
      body: `
        <div class="auth-field">
          <label class="auth-label">Nama Kebiasaan</label>
          <div class="auth-input-wrap">
            <input type="text" class="auth-input" id="habit-name-input" placeholder="Contoh: Minum Air 2L" maxlength="60" value="${isEdit ? _esc(existing.name) : ''}">
          </div>
        </div>
        <div class="auth-error" id="habit-name-error"></div>
      `,
      footer: `<button class="btn-ghost" id="habit-form-cancel">Batal</button><button class="btn-primary" id="habit-form-save" style="margin-left:8px">${isEdit ? 'Simpan' : 'Buat'}</button>`,
    });
    setTimeout(() => {
      const input = document.getElementById('habit-name-input');
      input?.focus();
      if (isEdit) input?.select();
      document.getElementById('habit-form-cancel')?.addEventListener('click', () => document.getElementById('modal-close')?.click());
      document.getElementById('habit-form-save')?.addEventListener('click', async () => {
        const name = input?.value.trim();
        if (!name) { document.getElementById('habit-name-error').textContent = 'Nama wajib diisi.'; return; }
        const btn = document.getElementById('habit-form-save');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Menyimpan...';
        try {
          if (isEdit) { await update(existing.id, { name }); } else { await create(null, name); }
          UI.toast(isEdit ? 'Kebiasaan diperbarui' : 'Kebiasaan baru dibuat!', 'success');
          document.getElementById('modal-close')?.click();
          renderPage();
        } catch (err) {
          document.getElementById('habit-name-error').textContent = err.message;
          btn.disabled = false;
          btn.innerHTML = isEdit ? 'Simpan' : 'Buat';
        }
      });
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('habit-form-save')?.click(); });
    }, 60);
  }

  return { renderPage, getAll, create, update, remove, toggle };
})();
