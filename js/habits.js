/* js/habits.js — Habit Tracker Module */
'use strict';
window.Notara = window.Notara || {};
window.Notara.HabitTracker = (() => {
  const db   = () => window.Notara.db;
  const Auth = () => window.Notara.Auth;
  const UI   = window.Notara.UI;

  function _toLocalDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function _today() { return _toLocalDate(new Date()); }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _userId() { return Auth()?.getUser()?.id; }
  function _uuid() { return crypto.randomUUID(); }
  function _now()  { return new Date().toISOString(); }

  async function getAll() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data, error } = await db().from('habit_lists')
      .select('*')
      .eq('user_id', uid)
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function create(name) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const existing = await getAll();
    const habit = {
      id: _uuid(),
      user_id: uid,
      name: name,
      active: true,
      sort_order: existing.length,
      created_at: _now(),
      updated_at: _now(),
    };
    const { error } = await db().from('habit_lists').insert(habit);
    if (error) throw error;
    return habit;
  }

  async function update(id, changes) {
    const updated = { ...changes, updated_at: _now() };
    const { error } = await db().from('habit_lists').update(updated).eq('id', id);
    if (error) throw error;
    return updated;
  }

  async function remove(id) {
    return update(id, { active: false });
  }

  async function getTodayLogs() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const today = _today();
    const { data, error } = await db().from('habit_logs')
      .select('*')
      .eq('user_id', uid)
      .eq('date', today);
    if (error) throw error;
    return data || [];
  }

  async function getLogsByDate(date) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data, error } = await db().from('habit_logs')
      .select('*')
      .eq('user_id', uid)
      .eq('date', date);
    if (error) throw error;
    return data || [];
  }

  async function toggleLog(habitId, date) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const targetDate = date || _today();
    const { data: existingRows, error: findErr } = await db().from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('date', targetDate);
    if (findErr) throw findErr;
    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existing) {
      const { data, error } = await db().from('habit_logs')
        .update({ completed: !existing.completed, updated_at: _now() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const log = {
        id: _uuid(),
        habit_id: habitId,
        user_id: uid,
        date: targetDate,
        completed: true,
        created_at: _now(),
        updated_at: _now(),
      };
      const { error } = await db().from('habit_logs').insert(log);
      if (error) throw error;
      return log;
    }
  }

  async function getStreak(habitId) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data, error } = await db().from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .eq('completed', true)
      .order('date', { ascending: false });
    if (error) throw error;
    const logs = data || [];
    let streak = 0;
    let check = new Date();
    for (const log of logs) {
      const logDate = log.date;
      const checkStr = _toLocalDate(check);
      if (logDate === checkStr) { streak++; check.setDate(check.getDate() - 1); }
      else if (logDate < checkStr) break;
    }
    return streak;
  }

  async function getCompletionRate(habitId, days = 7) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = _toLocalDate(since);
    const { data, error } = await db().from('habit_logs')
      .select('*')
      .eq('habit_id', habitId)
      .gte('date', sinceStr);
    if (error) throw error;
    const logs = data || [];
    const completed = logs.filter(l => l.completed).length;
    return days > 0 ? Math.round((completed / days) * 100) : 0;
  }

  let _currentDate = _today();
  let _isRendering = false;

  const DEFAULTS = [
    'Minum Air 2L', 'Olahraga 30 Menit', 'Membaca 15 Menit',
    'Sarapan Sehat', 'Tidur Tepat Waktu', 'Meditasi 5 Menit',
    'Jalan Kaki 5000 Langkah', 'Makan Buah', 'Belajar Skill Baru',
    'Catat Hal yang Disyukuri',
  ];

  async function _seedDefaults() {
    const existing = await getAll();
    if (existing.length > 0) return;
    for (const name of DEFAULTS) { try { await create(name); } catch {} }
  }

  async function renderPage() {
    const main = document.getElementById('app-main');
    UI.setTitle('Kebiasaan');
    UI.setActiveNav('habits');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    await _seedDefaults();
    const [habits, logs] = await Promise.all([getAll(), getLogsByDate(_currentDate)]);
    const completedIds = new Set(logs.filter(l => l.completed).map(l => l.habit_id));
    const total = habits.length;
    const done  = habits.filter(h => completedIds.has(h.id)).length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

    const dateLabel = new Date(_currentDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const isToday = _currentDate === _today();

    let html = '<div class="tracker-page page-enter">';
    html += `<div class="tracker-header"><h2><i class="ph ph-check-circle"></i> Kebiasaan</h2><div style="display:flex;gap:6px"><button class="btn-primary" id="habit-add-btn" style="font-size:0.75rem;padding:0.35rem 0.7rem"><i class="ph ph-plus"></i> Tambah</button><button class="btn-ghost" id="habit-manage-btn" style="font-size:0.75rem;padding:0.35rem 0.7rem"><i class="ph ph-list"></i> Kelola</button></div></div>`;

    html += `<div class="habit-progress-card">`;
    html += `<div style="font-size:0.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">${dateLabel}</div>`;
    html += `<div class="habit-progress-header"><span class="habit-progress-label">Progress Harian</span><span class="habit-progress-pct">${done}/${total} (${pct}%)</span></div>`;
    html += `<div class="habit-progress-bar"><div class="habit-progress-fill" style="width:${pct}%"></div></div>`;
    html += `</div>`;

    html += `<div id="habit-week-calendar-wrap"></div>`;
    html += `<div id="habit-stats-wrap"></div>`;

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
    html += `</div></div>`;
    main.innerHTML = html;

    habits.forEach(async h => {
      const [streak, rate] = await Promise.all([getStreak(h.id), getCompletionRate(h.id)]);
      const el = document.getElementById(`streak-${h.id}`);
      if (el) el.textContent = `🔥 ${streak} · ${rate}%`;
    });

    const weekCalWrap = document.getElementById('habit-week-calendar-wrap');
    if (weekCalWrap) weekCalWrap.innerHTML = await _renderWeeklyCalendar(habits);

    const statsWrap = document.getElementById('habit-stats-wrap');
    if (statsWrap) statsWrap.innerHTML = await _renderMonthlyStats(habits);

    document.querySelectorAll('.habit-week-day').forEach(el => {
      el.addEventListener('click', () => {
        _showDayDetail(el.dataset.date);
      });
    });

    document.querySelectorAll('.habit-item-name').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = el.closest('.habit-item');
        if (item) _showHabitDetail(item.dataset.id, el.textContent);
      });
    });

    _bindChecklistEvents(habits);
    _bindManageEvents();
  }

  function _bindChecklistEvents(habits) {
    document.querySelectorAll('.habit-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.habit-item-name')) return;
        const id = item.dataset.id;
        const checkbox = item.querySelector('.habit-checkbox');
        checkbox.classList.toggle('checked');
        item.classList.toggle('completed');

        try {
          await toggleLog(id, _currentDate);
          const freshLogs = await getLogsByDate(_currentDate);
          const done  = freshLogs.filter(l => l.completed).length;
          const total = habits.length;
          const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

          const card = document.querySelector('.habit-progress-card');
          if (card) {
            const dateLabel = new Date(_currentDate+'T00:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
            card.innerHTML = `
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-2);margin-bottom:4px">${dateLabel}</div>
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

  async function _showDayDetail(date) {
    const [habits, logs] = await Promise.all([getAll(), getLogsByDate(date)]);
    const completedIds = new Set(logs.filter(l => l.completed).map(l => l.habit_id));
    const done = habits.filter(h => completedIds.has(h.id)).length;
    const total = habits.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let listHtml = habits.map(h => {
      const isDone = completedIds.has(h.id);
      const icon = isDone ? '<i class="ph-fill ph-check-circle" style="color:var(--label-easy)"></i>' : '<i class="ph ph-x-circle" style="color:var(--text-3)"></i>';
      const status = isDone ? 'Selesai' : 'Belum';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-strong)"><span>${icon}</span><span style="flex:1;font-size:0.85rem;font-weight:700;color:var(--text-1)">${_esc(h.name)}</span><span style="font-size:0.7rem;color:var(--text-3)">${status}</span></div>`;
    }).join('');

    UI.modal({
      title: `<i class="ph ph-calendar-blank"></i> ${dateLabel}`,
      body: `
        <div>${listHtml}</div>
        <div style="text-align:center;margin-top:var(--space-md);font-size:0.85rem;font-weight:800;color:var(--accent)">${done}/${total} selesai (${pct}%)</div>
      `,
      footer: `<button class="btn-ghost" id="day-detail-close">Tutup</button>`,
    });
    setTimeout(() => {
      document.getElementById('day-detail-close')?.addEventListener('click', () => document.getElementById('modal-close')?.click());
    }, 60);
  }

  async function _renderWeeklyCalendar(habits) {
    const d = new Date(_currentDate + 'T00:00:00');
    const dayOfWeek = d.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startDate = _toLocalDate(monday);
    const endDate = _toLocalDate(sunday);

    const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const todayStr = _today();

    const { data: completionData } = await db().rpc('get_habit_completion_by_date_range', {
      p_user_id: _userId(),
      p_start_date: startDate,
      p_end_date: endDate,
    });

    const completionMap = {};
    (completionData || []).forEach(row => {
      completionMap[row.log_date] = row;
    });

    let html = '<div class="habit-week-calendar">';
    const todayMonday = new Date();
    const todayDow = todayMonday.getDay();
    const todayMondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
    todayMonday.setDate(todayMonday.getDate() + todayMondayOffset);
    const isCurrentWeek = _toLocalDate(monday) === _toLocalDate(todayMonday);

    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const weekTitle = isCurrentWeek ? 'Minggu Ini' : `${monday.getDate()} - ${sunday.getDate()} ${monthNames[sunday.getMonth()]} ${sunday.getFullYear()}`;
    html += `<div class="habit-week-title"><i class="ph ph-calendar-blank"></i> ${weekTitle}</div>`;
    html += '<div class="habit-week-grid">';

    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const iso = _toLocalDate(day);
      const isToday = iso === todayStr;

      const row = completionMap[iso];
      const pct = row ? Number(row.completion_pct) : 0;
      const pctAttr = pct === 100 ? '100' : pct > 0 ? 'partial' : '0';

      html += `<div class="habit-week-day" data-date="${iso}" ${isToday ? 'data-today="true"' : ''}>`;
      html += `<span class="habit-week-day-num">${day.getDate()}</span>`;
      html += `<div class="habit-week-day-dot" data-pct="${pctAttr}"></div>`;
      html += `<span style="font-size:0.5rem;color:var(--text-3);font-weight:600">${dayNames[i]}</span>`;
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  }

  async function _showHabitDetail(habitId, habitName) {
    const [streak, rate7, rate30] = await Promise.all([
      getStreak(habitId),
      getCompletionRate(habitId, 7),
      getCompletionRate(habitId, 30),
    ]);

    const since = new Date();
    since.setDate(since.getDate() - 6);
    const sinceStr = _toLocalDate(since);
    const { data: logs } = await db().from('habit_logs')
      .select('date, completed')
      .eq('habit_id', habitId)
      .eq('user_id', _userId())
      .gte('date', sinceStr)
      .order('date', { ascending: true });

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = _toLocalDate(d);
      const found = (logs || []).find(l => l.date === iso && l.completed);
      last7.push({ date: iso, done: !!found });
    }

    let miniBar = '<div style="display:flex;gap:3px;justify-content:center;margin:var(--space-md) 0">';
    last7.forEach(d => {
      const bg = d.done ? 'var(--label-easy)' : 'var(--text-3)';
      const opacity = d.done ? '1' : '0.3';
      miniBar += `<div style="width:24px;height:24px;border-radius:4px;background:${bg};opacity:${opacity};border:1px solid var(--border-strong)" title="${d.date}"></div>`;
    });
    miniBar += '</div>';

    UI.modal({
      title: `<i class="ph ph-check-circle"></i> ${_esc(habitName)}`,
      body: `
        <div style="text-align:center">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:var(--space-sm)">Streak Saat Ini</div>
          <div style="font-size:1.5rem;font-weight:800;color:var(--accent);margin-bottom:var(--space-lg)">🔥 ${streak} hari</div>
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:var(--space-sm)">7 Hari Terakhir</div>
          <div style="font-size:1.2rem;font-weight:800;color:var(--text-1);margin-bottom:var(--space-sm)">${rate7}%</div>
          ${miniBar}
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:var(--space-sm)">30 Hari Terakhir</div>
          <div style="font-size:1.2rem;font-weight:800;color:var(--text-1)">${rate30}%</div>
        </div>
      `,
      footer: `<button class="btn-ghost" id="habit-detail-close">Tutup</button>`,
    });
    setTimeout(() => {
      document.getElementById('habit-detail-close')?.addEventListener('click', () => document.getElementById('modal-close')?.click());
    }, 60);
  }

  async function _renderMonthlyStats(habits) {
    const now = new Date(_currentDate + 'T00:00:00');
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const { data: stats } = await db().rpc('get_habit_monthly_stats', {
      p_user_id: _userId(),
      p_year: year,
      p_month: month,
    });

    const s = stats && stats.length > 0 ? stats[0] : { active_days: 0, avg_completion: 0, max_streak: 0 };

    let html = '<div class="habit-stats-card">';
    html += `<div class="habit-stat-item"><div class="habit-stat-value">${s.active_days}</div><div class="habit-stat-label">Hari Aktif</div></div>`;
    html += `<div class="habit-stat-item"><div class="habit-stat-value">${s.avg_completion}%</div><div class="habit-stat-label">Rata-rata</div></div>`;
    html += `<div class="habit-stat-item"><div class="habit-stat-value">🔥 ${s.max_streak}</div><div class="habit-stat-label">Streak Terpanjang</div></div>`;
    html += '</div>';
    return html;
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
          if (isEdit) { await update(existing.id, { name }); } else { await create(name); }
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

  return { renderPage, getAll, create, update, remove, toggleLog, getLogsByDate, getStreak, getCompletionRate };
})();
