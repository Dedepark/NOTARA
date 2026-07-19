/* js/app.js - Main application v2 (Tags, Posts, Heatmap, Pomodoro) */
'use strict';
window.Notara = window.Notara || {};
(function () {
  const N   = window.Notara.Notes;
  const UI  = window.Notara.UI;
  const R   = window.Notara.Router;
  const S   = window.Notara.Settings;
  const Ed  = window.Notara.Editor;
  const Au  = window.Notara.Auth;
  const Rm  = window.Notara.Reminders;
  const Tg  = window.Notara.Tags;
  const Pt  = window.Notara.Posts;

  /* --- NOTE GROUPS --- */
  const db = () => window.Notara.db;
  async function _fetchGroups() {
    const userId = Au.getUser()?.id;
    const { data, error } = await db()
      .from('note_groups')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) { console.warn('[Notara] fetchGroups error:', error.message); return []; }
    return data || [];
  }
  async function _createGroupInDb(name, noteIds) {
    const userId = Au.getUser()?.id;
    const { data, error } = await db()
      .from('note_groups')
      .insert({ user_id: userId, name, note_ids: noteIds, collapsed: false })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  async function _updateGroupInDb(id, changes) {
    const { data, error } = await db()
      .from('note_groups')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  async function _deleteGroupInDb(id) {
    const { error } = await db()
      .from('note_groups')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }

  /* --- NOTE STACKING / MULTI-SELECT STATE --- */
  let _multiSelect = false;
  let _selectedIds = new Set();
  let _homeCache = null;
  let _activityMap = {};

  function _resetAppState() {
    _homeCache = null;
    _activityMap = {};
    _multiSelect = false;
    _selectedIds.clear();
    N.resetCache();
  }

  function _toggleMultiSelect() {
    _multiSelect = !_multiSelect;
    _selectedIds.clear();
    document.getElementById('app')?.setAttribute('data-multiselect', _multiSelect ? 'true' : 'false');
    _updateTopbarMultiSelect();
    _renderHome();
  }

  function _exitMultiSelect() {
    if (!_multiSelect) return;
    _multiSelect = false;
    _selectedIds.clear();
    document.getElementById('app')?.setAttribute('data-multiselect', 'false');
    _updateTopbarMultiSelect();
  }

  function _toggleNoteSelect(id) {
    if (_selectedIds.has(id)) _selectedIds.delete(id);
    else _selectedIds.add(id);
    _refreshSelectionUI();
  }

  function _updateTopbarMultiSelect() {
    const topbar = document.getElementById('topbar');
    const normalItems = topbar?.querySelectorAll('.topbar-normal-item');
    const msBar = document.getElementById('topbar-ms-bar');
    if (!topbar || !msBar) return;
    if (_multiSelect) {
      normalItems.forEach(el => el.style.display = 'none');
      msBar.style.display = 'flex';
      _refreshTopbarMsBar();
    } else {
      normalItems.forEach(el => el.style.display = '');
      msBar.style.display = 'none';
    }
  }

  function _refreshTopbarMsBar() {
    const msBar = document.getElementById('topbar-ms-bar');
    if (!msBar) return;
    const count = _selectedIds.size;
    const existingGroups = _homeCache?.groups || [];
    const hasGroups = existingGroups.length > 0;
    msBar.innerHTML = `
      <button class="icon-btn topbar-ms-cancel" id="ms-cancel-btn" title="Batal pilih"><i class="fa-solid fa-arrow-left"></i></button>
      <span class="topbar-ms-count">${count} dipilih</span>
      <div class="topbar-ms-actions">
        ${count >= 1 ? `
          <button class="btn-primary topbar-ms-action" id="ms-group-btn"><i class="fa-solid fa-layer-group"></i> Grup Baru</button>
          ${hasGroups ? `<button class="btn-ghost topbar-ms-action" id="ms-addto-btn"><i class="fa-solid fa-plus"></i> Masukkan ke Grup</button>` : ''}
        ` : ''}
      </div>
    `;
    document.getElementById('ms-cancel-btn')?.addEventListener('click', _toggleMultiSelect);
    document.getElementById('ms-group-btn')?.addEventListener('click', () => _createGroup());
    document.getElementById('ms-addto-btn')?.addEventListener('click', () => _showAddToGroupPicker(existingGroups));
  }

  async function _refreshSelectionUI() {
    const count = _selectedIds.size;
    _refreshTopbarMsBar();
    document.querySelectorAll('.note-card').forEach(card => {
      const id = card.dataset.id;
      card.classList.toggle('ms-selected', _selectedIds.has(id));
    });
    document.querySelectorAll('.flipcard-wrap').forEach(wrap => {
      wrap.classList.toggle('ms-selected', _selectedIds.has(wrap.dataset.id));
    });
  }

  function _createGroup() {
    if (_selectedIds.size < 1) { UI.toast('Pilih minimal 1 catatan', 'warning'); return; }
    UI.modal({
      title: '<i class="fa-solid fa-layer-group"></i> Buat Grup',
      body: `
        <div class="auth-field">
          <label class="auth-label">Nama Grup</label>
          <div class="auth-input-wrap">
            <i class="fa-solid fa-layer-group auth-input-icon"></i>
            <input type="text" class="auth-input" id="group-name-input"
              placeholder="Nama grup..." maxlength="40" value="">
          </div>
        </div>
        <div class="auth-error" id="group-name-error"></div>
      `,
      footer: `
        <button class="btn-ghost" id="group-cancel">Batal</button>
        <button class="btn-primary" id="group-create" style="margin-left:8px">
          <i class="fa-solid fa-check"></i> Buat
        </button>
      `,
    });
    setTimeout(() => {
      const input = document.getElementById('group-name-input');
      input?.focus();
      document.getElementById('group-cancel')?.addEventListener('click', () => document.getElementById('modal-close')?.click());
      document.getElementById('group-create')?.addEventListener('click', async () => {
        const name = input?.value.trim();
        if (!name) { document.getElementById('group-name-error').textContent = 'Nama grup wajib diisi.'; return; }
        const btn = document.getElementById('group-create');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
        try {
          await _createGroupInDb(name, [..._selectedIds]);
          document.getElementById('modal-close')?.click();
          _homeCache = null;
          _exitMultiSelect();
          UI.toast(`Grup "${name}" dibuat!`, 'success');
          _renderHome();
        } catch (err) {
          document.getElementById('group-name-error').textContent = 'Gagal menyimpan: ' + err.message;
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Buat';
        }
      });
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('group-create')?.click(); });
    }, 60);
  }

  function _showAddToGroupPicker(groups) {
    if (_selectedIds.size < 1) { UI.toast('Pilih minimal 1 catatan', 'warning'); return; }
    if (!groups.length) { UI.toast('Belum ada grup', 'warning'); return; }
    UI.modal({
      title: '<i class="fa-solid fa-plus"></i> Masukkan ke Grup',
      body: `
        <p style="color:var(--text-3);font-size:0.82rem;margin-bottom:var(--space-md)">
          Pilih grup tujuan untuk ${_selectedIds.size} catatan yang dipilih:
        </p>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${groups.map(g => `
            <button class="template-option group-target-btn" data-gid="${g.id}">
              <span class="template-icon"><i class="fa-solid fa-layer-group"></i></span>
              <div class="template-info">
                <strong>${_esc(g.name)}</strong>
                <span>${g.note_ids.length} catatan</span>
              </div>
              <i class="fa-solid fa-chevron-right" style="color:var(--text-3);font-size:0.75rem;margin-left:auto"></i>
            </button>
          `).join('')}
        </div>
      `,
      footer: `<button class="btn-ghost" id="addto-cancel">Batal</button>`,
    });
    setTimeout(() => {
      document.getElementById('addto-cancel')?.addEventListener('click', () => document.getElementById('modal-close')?.click());
      document.querySelectorAll('.group-target-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const gid = btn.dataset.gid;
          const targetGroup = groups.find(g => g.id === gid);
          if (!targetGroup) return;
          btn.disabled = true;
          btn.innerHTML = btn.innerHTML.replace('fa-chevron-right', 'fa-spinner fa-spin');
          try {
            const merged = [...new Set([...targetGroup.note_ids, ..._selectedIds])];
            await _updateGroupInDb(gid, { note_ids: merged });
            document.getElementById('modal-close')?.click();
            _homeCache = null;
            _exitMultiSelect();
            UI.toast(`${merged.length - targetGroup.note_ids.length} catatan ditambahkan ke "${targetGroup.name}"!`, 'success');
            _renderHome();
          } catch (err) {
            UI.toast('Gagal: ' + err.message, 'error');
            btn.disabled = false;
          }
        });
      });
    }, 60);
  }

  async function _deleteGroup(gId) {
    try {
      await _deleteGroupInDb(gId);
      _homeCache = null;
      _renderHome();
    } catch (err) {
      UI.toast('Gagal hapus grup: ' + err.message, 'error');
    }
  }

  async function _toggleGroupCollapse(gId, currentCollapsed) {
    try {
      const newCollapsed = !currentCollapsed;
      const groupCard = document.querySelector(`.note-group-card[data-gid="${gId}"]`);
      if (groupCard) {
        const body       = groupCard.querySelector('.note-group-body');
        if (newCollapsed) {
          body?.remove();
        } else {
          const allNotes = _homeCache?.allNotes || [];
          const tagsMap  = _homeCache?.tagsMap  || {};
          const groups   = _homeCache?.groups   || [];
          const group    = groups.find(g => g.id === gId);
          if (group && !body) {
            const memberNotes = allNotes.filter(n => group.note_ids.includes(n.id));
            const groupLayout = window.Notara.Storage.get('group_layout_' + gId, 'grid');
            const bodyEl = document.createElement('div');
            bodyEl.className = 'note-group-body';
            bodyEl.innerHTML = `<div class="notes-grid ${groupLayout === 'list' ? 'notes-list' : ''}" style="margin:0">
              ${memberNotes.map(n => _buildGroupNoteCard(n, tagsMap[n.id] || [], gId)).join('')}
            </div>`;
            groupCard.appendChild(bodyEl);
            _bindGroupCardEvents(bodyEl, groups);
          }
        }
      }
      await _updateGroupInDb(gId, { collapsed: newCollapsed });
      if (_homeCache?.groups) {
        const g = _homeCache.groups.find(g => g.id === gId);
        if (g) g.collapsed = newCollapsed;
      }
    } catch (err) {
      UI.toast('Gagal: ' + err.message, 'error');
    }
  }

  async function _removeNoteFromGroup(gId, noteId, groups) {
    try {
      const group = groups.find(g => g.id === gId);
      if (!group) return;
      const newIds = group.note_ids.filter(id => id !== noteId);
      if (newIds.length === 0) {
        await _deleteGroupInDb(gId);
        UI.toast('Grup dihapus karena sudah kosong', 'info');
      } else {
        await _updateGroupInDb(gId, { note_ids: newIds });
      }
      _homeCache = null;
      _renderHome();
    } catch (err) {
      UI.toast('Gagal: ' + err.message, 'error');
    }
  }

  function _bindGroupCardEvents(container, groups) {
    container.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.group-remove-note-btn')) return;
        R.go('read/' + card.dataset.id);
      });
    });
    container.querySelectorAll('.group-remove-note-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const gId    = btn.dataset.gid;
        const noteId = btn.dataset.id;
        const ok = await UI.confirm({
          title:   'Keluarkan dari Grup',
          message: 'Catatan ini akan dikeluarkan dari grup, tapi tidak dihapus.',
          okLabel: 'Keluarkan',
          okClass: 'btn-primary',
        });
        if (ok) await _removeNoteFromGroup(gId, noteId, groups);
      });
    });
    container.querySelectorAll('.group-layout-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const gId = btn.dataset.gid;
        const currentLayout = btn.dataset.layout;
        const newLayout = currentLayout === 'grid' ? 'list' : 'grid';
        window.Notara.Storage.set('group_layout_' + gId, newLayout);
        btn.dataset.layout = newLayout;
        const icon = btn.querySelector('i');
        if (icon) icon.className = `fa-solid fa-${newLayout === 'grid' ? 'table-cells-large' : 'list'}`;
        const groupCard = document.querySelector(`.note-group-card[data-gid="${gId}"]`);
        const grid = groupCard?.querySelector('.notes-grid');
        if (grid) grid.classList.toggle('notes-list', newLayout === 'list');
      });
    });
    container.querySelectorAll('.note-group-header').forEach(header => {
      header.addEventListener('click', e => {
        if (e.target.closest('.group-edit-btn') || e.target.closest('.group-delete-btn') || e.target.closest('.group-layout-btn')) return;
        const gId       = header.dataset.gid;
        const groupCard = header.closest('.note-group-card');
        const body      = groupCard?.querySelector('.note-group-body');
        const collapsed = !body;
        _toggleGroupCollapse(gId, collapsed);
      });
    });
    container.querySelectorAll('.group-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await UI.confirm({ title: 'Hapus Grup', message: 'Hanya grup yang dihapus, catatannya tetap ada.', okLabel: 'Hapus Grup', okClass: 'btn-primary' });
        if (ok) _deleteGroup(btn.dataset.gid);
      });
    });
    container.querySelectorAll('.group-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        _editGroupName(btn.dataset.gid, btn.dataset.name);
      });
    });
  }

  function _editGroupName(gId, currentName) {
    UI.modal({
      title: '<i class="fa-solid fa-pen"></i> Edit Nama Grup',
      body: `
        <div class="auth-field">
          <label class="auth-label">Nama Grup</label>
          <div class="auth-input-wrap">
            <i class="fa-solid fa-layer-group auth-input-icon"></i>
            <input type="text" class="auth-input" id="edit-group-name-input"
              placeholder="Nama grup..." maxlength="40" value="${_esc(currentName)}">
          </div>
        </div>
        <div class="auth-error" id="edit-group-name-error"></div>
      `,
      footer: `
        <button class="btn-ghost" id="edit-group-cancel">Batal</button>
        <button class="btn-primary" id="edit-group-save" style="margin-left:8px">
          <i class="fa-solid fa-check"></i> Simpan
        </button>
      `,
    });
    setTimeout(() => {
      const input = document.getElementById('edit-group-name-input');
      input?.focus();
      input?.select();
      document.getElementById('edit-group-cancel')?.addEventListener('click', () => document.getElementById('modal-close')?.click());
      document.getElementById('edit-group-save')?.addEventListener('click', async () => {
        const name = input?.value.trim();
        if (!name) { document.getElementById('edit-group-name-error').textContent = 'Nama grup wajib diisi.'; return; }
        if (name === currentName) { document.getElementById('modal-close')?.click(); return; }
        const btn = document.getElementById('edit-group-save');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
        try {
          await _updateGroupInDb(gId, { name });
          _homeCache = null;
          document.getElementById('modal-close')?.click();
          UI.toast('Nama grup diperbarui!', 'success');
          _renderHome();
        } catch (err) {
          document.getElementById('edit-group-name-error').textContent = 'Gagal menyimpan: ' + err.message;
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Simpan';
        }
      });
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('edit-group-save')?.click(); });
    }, 60);
  }

  async function _refreshCurrentView(noteId) {
    const current = R.current();
    const params  = R.params();
    if (current === 'read/:id') {
      _renderRead(params.id || noteId);
      return;
    }
    if (current === 'home' && noteId) {
      const note = await N.getById(noteId);
      if (!note) { _renderHome(); return; }
      if (_homeCache?.allNotes) {
        const idx = _homeCache.allNotes.findIndex(n => n.id === noteId);
        if (idx !== -1) _homeCache.allNotes[idx] = note;
      }
      const tagsMap = _homeCache?.tagsMap || {};
      document.querySelectorAll(`.note-card[data-id="${noteId}"]`).forEach(card => {
        const newCard = document.createElement('div');
        const gid = card.dataset.gid;
        newCard.innerHTML = gid
          ? _buildGroupNoteCard(note, tagsMap[noteId] || [], gid)
          : _buildNoteCard(note, tagsMap[noteId] || []);
        const replacement = newCard.firstElementChild;
        card.replaceWith(replacement);
        if (gid) {
          const groups = _homeCache?.groups || [];
          const tempWrap = document.createElement('div');
          tempWrap.appendChild(replacement);
          _bindGroupCardEvents(tempWrap, groups);
          replacement.parentElement || card.parentElement?.appendChild(replacement);
        } else {
          const tempGrid = document.createElement('div');
          tempGrid.appendChild(replacement);
          _bindNoteCards(tempGrid);
        }
      });
      document.querySelectorAll(`.flipcard-wrap[data-id="${noteId}"]`).forEach(wrap => {
        const newWrap = document.createElement('div');
        newWrap.innerHTML = _buildFlipcard(note);
        const replacement = newWrap.firstElementChild;
        wrap.replaceWith(replacement);
        _bindFlipcards(replacement.parentElement || document.getElementById('flipcard-row'));
      });
      return;
    }
    R.go('home');
  }

  function _buildGroupCard(group, notes, tagsMap, allGroups) {
    const memberNotes = notes.filter(n => group.note_ids.includes(n.id));
    if (!memberNotes.length) return '';
    const collapsed  = group.collapsed;
    const groupLayout = window.Notara.Storage.get('group_layout_' + group.id, 'grid');
    return `
      <div class="note-group-card" data-gid="${group.id}">
        <div class="note-group-header" data-gid="${group.id}">
          <span class="note-group-icon"><i class="fa-solid fa-layer-group"></i></span>
          <span class="note-group-name">${_esc(group.name)}</span>
          <span class="note-group-count">${memberNotes.length} catatan</span>
          <div class="note-group-actions">
            <button class="icon-btn group-edit-btn" data-gid="${group.id}" data-name="${_esc(group.name)}" title="Edit nama grup" style="width:28px;height:28px;font-size:0.75rem">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="icon-btn group-layout-btn" data-gid="${group.id}" data-layout="${groupLayout}" title="Ganti tampilan" style="width:28px;height:28px;font-size:0.75rem">
              <i class="fa-solid fa-${groupLayout === 'grid' ? 'table-cells-large' : 'list'}"></i>
            </button>
            <button class="icon-btn group-delete-btn" data-gid="${group.id}" title="Hapus grup" style="width:28px;height:28px;font-size:0.75rem">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        ${!collapsed ? `
          <div class="note-group-body">
            <div class="notes-grid ${groupLayout === 'list' ? 'notes-list' : ''}" style="margin:0">
              ${memberNotes.map(n => _buildGroupNoteCard(n, tagsMap[n.id] || [], group.id)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function _buildGroupNoteCard(note, tags = [], gId) {
    const preview   = UI.stripHtml(note.content);
    const dtBadge   = Rm.cardBadgeHtml(note);
    const tagsHtml = tags.length
      ? `<div class="card-tags">${tags.map(t =>
          `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${_esc(t.name)}</span>`
        ).join('')}</div>`
      : '';
    return `
      <div class="note-card ${note.pinned ? 'pinned' : ''}" data-id="${note.id}" data-gid="${gId}">
        <div class="card-accent-bar ${note.label}"></div>
        <div class="card-header">
          <div class="card-title">${_esc(note.title)}</div>
          ${note.pinned ? '<i class="fa-solid fa-thumbtack" style="color:var(--accent);font-size:0.7rem"></i>' : ''}
        </div>
        ${preview ? `<div class="card-preview">${_esc(preview.slice(0, 120))}</div>` : ''}
        ${tagsHtml}
        ${dtBadge ? `<div class="card-dt-row">${dtBadge}</div>` : ''}
        <div class="card-footer">
          <span class="card-date">${UI.formatDate(note.updatedAt)}</span>
          ${note.favorite ? '<i class="fa-solid fa-star" style="color:#f5a623;font-size:0.75rem"></i>' : ''}
          <button class="group-remove-note-btn btn-ghost" data-id="${note.id}" data-gid="${gId}"
            title="Keluarkan dari grup">
            Keluar
          </button>
        </div>
      </div>
    `;
  }

  /* --- GREETING & DATE --- */
  function _getGreeting() {
    const hour = new Date().getHours();
    const name = Au.getName();
    if (hour < 11) return `Selamat pagi, ${name}`;
    if (hour < 15) return `Selamat siang, ${name}`;
    if (hour < 18) return `Selamat sore, ${name}`;
    return `Selamat malam, ${name}`;
  }
  function _getGreetingIcon() {
    const h = new Date().getHours();
    if (h < 11) return '<i class="fa-solid fa-sun" style="color:#f5a623"></i>';
    if (h < 15) return '<i class="fa-solid fa-cloud-sun" style="color:#f5a623"></i>';
    if (h < 18) return '<i class="fa-solid fa-cloud" style="color:#8b91a8"></i>';
    return '<i class="fa-solid fa-moon" style="color:#7c6af7"></i>';
  }
  function _formatToday() {
    return new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* --- WRITING STATS --- */
  function _getStreak() {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso   = d.toISOString().slice(0, 10);
      const words = _activityMap[iso] || 0;
      if (words > 0) streak++;
      else if (i > 0) break;
    }
    return streak;
  }
  function _getTodayWords() {
    const key = new Date().toISOString().slice(0, 10);
    return _activityMap[key] || 0;
  }
  function _getWeekActivity() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso   = d.toISOString().slice(0, 10);
      const words = _activityMap[iso] || 0;
      const label = d.toLocaleDateString('id-ID', { weekday: 'short' });
      days.push({ label, words });
    }
    return days;
  }

  /* --- HEATMAP (16 minggu terakhir) --- */
  function _buildHeatmap() {
    const WEEKS = 16;
    const today = new Date();
    const startDay = new Date(today);
    startDay.setDate(today.getDate() - (WEEKS * 7) + 1);
    const weeksHtml = [];
    for (let w = 0; w < WEEKS; w++) {
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const dayIdx = w * 7 + d;
        const date   = new Date(startDay);
        date.setDate(startDay.getDate() + dayIdx);
        const iso    = date.toISOString().slice(0, 10);
        const words  = _activityMap[iso] || 0;
        let lvl = 0;
        if (words > 0)   lvl = 1;
        if (words > 100) lvl = 2;
        if (words > 300) lvl = 3;
        if (words > 600) lvl = 4;
        const isoFmt = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        cells.push(`<div class="heatmap-cell level-${lvl}" title="${isoFmt}: ${words} kata"></div>`);
      }
      weeksHtml.push(`<div class="heatmap-week">${cells.join('')}</div>`);
    }
    return `
      <div class="heatmap-section">
        <div class="heatmap-title"><i class="fa-solid fa-calendar-days"></i> Aktivitas Menulis - 16 Minggu</div>
        <div class="heatmap-grid">${weeksHtml.join('')}</div>
        <div class="heatmap-legend">
          <span>Lebih sedikit</span>
          <div class="heatmap-legend-cell" style="background:var(--surface-hover)"></div>
          <div class="heatmap-legend-cell level-1 heatmap-cell"></div>
          <div class="heatmap-legend-cell level-2 heatmap-cell"></div>
          <div class="heatmap-legend-cell level-3 heatmap-cell"></div>
          <div class="heatmap-legend-cell level-4 heatmap-cell"></div>
          <span>Lebih banyak</span>
        </div>
      </div>
    `;
  }

  /* --- NOTE ACTION POPUP --- */
  async function _noteActions(noteId) {
    const note = await N.getById(noteId);
    if (!note) return;
    const inReadMode = R.current() === 'read/:id';
    const baseItems = [
      { icon: '<i class="fa-solid fa-pen-to-square"></i>', label: 'Edit', action: 'edit', handler: id => R.go('edit/' + id) },
      ...(!inReadMode ? [{ icon: '<i class="fa-solid fa-eye"></i>', label: 'Baca', action: 'read', handler: id => R.go('read/' + id) }] : []),
      { icon: note.pinned ? '<i class="fa-solid fa-thumbtack" style="rotate:45deg"></i>' : '<i class="fa-solid fa-thumbtack"></i>', label: note.pinned ? 'Lepas Pin' : 'Pin', action: 'pin', handler: async id => { try { await N.pin(id); UI.toast(note.pinned ? 'Pin dilepas' : 'Catatan di-pin!', 'info'); _refreshCurrentView(id); } catch(e) { UI.toast('Gagal: ' + e.message, 'error'); } } },
      { icon: note.favorite ? '<i class="fa-solid fa-star" style="color:#f5a623"></i>' : '<i class="fa-regular fa-star"></i>', label: note.favorite ? 'Hapus Favorit' : 'Favorit', action: 'fav', handler: async id => { try { await N.favorite(id); UI.toast(note.favorite ? 'Favorit dihapus' : 'Ditambahkan ke favorit!', 'info'); _refreshCurrentView(id); } catch(e) { UI.toast('Gagal: ' + e.message, 'error'); } } },
      { icon: '<i class="fa-solid fa-tag"></i>', label: 'Ubah Label', action: 'label', handler: id => _showLabelPicker(id) },
      { icon: '<i class="fa-solid fa-tags"></i>', label: 'Kelola Tag', action: 'tags', handler: id => _showTagManager(id) },
      { icon: '<i class="fa-solid fa-copy"></i>', label: 'Duplikat', action: 'dup', handler: async id => { try { await N.duplicate(id); UI.toast('Catatan diduplikat', 'success'); R.go('home'); } catch(e) { UI.toast('Gagal duplikat: ' + e.message, 'error'); } } },
      { icon: '<i class="fa-solid fa-share-nodes"></i>', label: 'Bagikan', action: 'share', handler: async id => { try { await N.shareNote(id); } catch(e) { UI.toast('Gagal share: ' + e.message, 'error'); } } },
      { icon: '<i class="fa-solid fa-file-lines"></i>', label: 'Export TXT', action: 'txt', handler: id => N.exportTxt(id) },
      { icon: '<i class="fa-solid fa-file-pdf"></i>', label: 'Export PDF', action: 'pdf', handler: id => N.exportPdf(id) },
      { icon: '<i class="fa-solid fa-trash"></i>', label: 'Pindah ke Sampah', action: 'del', danger: true, handler: id => _deleteNote(id) },
    ];
    UI.openPopup(noteId, note.title, baseItems);
  }

  async function _deleteNote(id) {
    const note = await N.getById(id);
    const ok   = await UI.confirm({ title: 'Pindah ke Sampah', message: `"<strong>${_esc(note?.title || 'catatan')}</strong>" akan dipindahkan ke Sampah. Bisa dipulihkan.`, okLabel: '<i class="fa-solid fa-trash"></i> Pindah ke Sampah', okClass: 'btn-primary' });
    if (ok) {
      try {
        await N.remove(id);
        UI.toast('Dipindahkan ke Sampah', 'info');
        _restoreTopbarFromReader();
        R.go('home');
      } catch (err) { UI.toast('Gagal: ' + (err.message || 'Cek izin Supabase RLS'), 'error'); }
    }
  }

  function _showLabelPicker(id) {
    UI.modal({
      title: 'Ubah Label',
      body: `
        <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
          ${[['easy', 'var(--label-easy)', 'Easy'], ['medium', 'var(--label-medium)', 'Medium'], ['hard', 'var(--label-hard)', 'Hard']].map(([v, c, l]) => `
            <button class="label-btn" data-lv="${v}" style="padding:0.6rem 1rem;font-size:0.9rem;display:flex;align-items:center;gap:8px;background:var(--surface);border:var(--border-w) solid var(--border-strong);border-radius:var(--radius-md);cursor:pointer;box-shadow:2px 2px 0 var(--border-strong)">
              <i class="fa-solid fa-circle" style="color:${c};font-size:0.65rem"></i> ${l}
            </button>
          `).join('')}
        </div>
      `,
    });
    setTimeout(() => {
      document.querySelectorAll('[data-lv]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await N.setLabel(id, btn.dataset.lv); UI.toast(`Label diubah ke ${btn.dataset.lv}`, 'success'); document.getElementById('modal-close').click(); _refreshCurrentView(id);
        });
      });
    }, 50);
  }

  /* Tag Manager Modal */
  async function _showTagManager(noteId) {
    let allTags, noteTags;
    try { [allTags, noteTags] = await Promise.all([Tg.getAll(), Tg.getNoteTags(noteId)]); } catch { UI.toast('Gagal memuat tag', 'error'); return; }
    const noteTagIds = new Set(noteTags.map(t => t.id));
    const listHtml = allTags.length ? allTags.map(t => `
          <label class="tag-check-row">
            <input type="checkbox" class="tag-checkbox" value="${t.id}" ${noteTagIds.has(t.id) ? 'checked' : ''}>
            <span class="tag-dot" style="background:${t.color}"></span>
            <span class="tag-check-name">${_esc(t.name)}</span>
          </label>
        `).join('') : `<p style="color:var(--text-3);font-size:0.85rem;text-align:center;padding:var(--space-md)">Belum ada tag. Buat di halaman <strong>Tag</strong>.</p>`;
    UI.modal({
      title: '<i class="fa-solid fa-tags"></i> Kelola Tag',
      body: `<div class="tag-check-list">${listHtml}</div>`,
      footer: `<button class="btn-ghost" id="tag-cancel">Batal</button><button class="btn-primary" id="tag-save" style="margin-left:8px"><i class="fa-solid fa-check"></i> Simpan</button>`,
    });
    setTimeout(() => {
      document.getElementById('tag-cancel')?.addEventListener('click', () => document.getElementById('modal-close').click());
      document.getElementById('tag-save')?.addEventListener('click', async () => {
        const checked = [...document.querySelectorAll('.tag-checkbox:checked')].map(cb => cb.value);
        try { await Tg.setNoteTags(noteId, checked); UI.toast('Tag berhasil diperbarui', 'success'); document.getElementById('modal-close').click(); _refreshCurrentView(noteId); }
        catch (err) { UI.toast('Gagal simpan tag: ' + err.message, 'error'); }
      });
    }, 60);
  }

  /* --- HOME PAGE --- */
  async function _renderHome() {
    const main = document.getElementById('app-main');
    UI.setTitle('Beranda');
    UI.setActiveNav('home');
    if (_homeCache) { _renderHomeContent(main, _homeCache); } else { main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`; }
    try {
      const [allNotes, groups] = await Promise.all([N.getAll(), _fetchGroups()]);
      const priority = await N.getPriorityNotes();
      const allIds   = allNotes.map(n => n.id);
      const tagsMap  = await Tg.getTagsForNotes(allIds).catch(() => ({}));
      if (window.Notara.Activity) {
        const actRows = await window.Notara.Activity.getAll().catch(() => []);
        _activityMap = window.Notara.Activity.toMap(actRows);
      }
      const newCache = { allNotes, priority, groups, tagsMap };
      const dataChanged = !_homeCache
        || allNotes.length !== _homeCache.allNotes.length
        || allNotes[0]?.updatedAt !== _homeCache.allNotes[0]?.updatedAt
        || priority.length !== _homeCache.priority.length;
      _homeCache = newCache;
      if (dataChanged) _renderHomeContent(main, _homeCache);
    } catch (e) { console.warn('[Notara] Home fetch error:', e); }
    UI.updateStorageIndicator();
  }

  /* --- CALENDAR MODAL --- */
  let _calYear, _calMonth, _calSelectedDate;

  const _HOLIDAYS_ID = {
    '01-01': 'Tahun Baru',
    '01-27': 'Isra Mi\'raj',
    '02-28': 'Tahun Baru Imlek',
    '03-29': 'Nyepi',
    '03-31': 'Wafat Isa Almasih',
    '04-10': 'Hari Raya Idul Fitri',
    '04-11': 'Hari Raya Idul Fitri',
    '05-01': 'Hari Buruh',
    '05-12': 'Kenaikan Isa Almasih',
    '05-13': 'Hari Raya Waisak',
    '05-29': 'Hari Raya Idul Adha',
    '06-01': 'Hari Lahir Pancasila',
    '06-27': 'Tahun Baru Islam',
    '08-17': 'Hari Kemerdekaan RI',
    '09-16': 'Maulid Nabi Muhammad SAW',
    '10-29': 'Sumpah Pemuda',
    '11-25': 'Hari Toleransi Internasional',
    '12-25': 'Hari Natal',
  };

  function _getHolidays(year) {
    const result = {};
    Object.entries(_HOLIDAYS_ID).forEach(([mmdd, name]) => {
      const key = `${year}-${mmdd}`;
      result[key] = name;
    });
    return result;
  }

  function _openCalendarModal() {
    const now = new Date();
    _calYear = now.getFullYear();
    _calMonth = now.getMonth();
    _calSelectedDate = null;
    _renderCalendarModal();
  }

  function _renderCalendarModal() {
    const m = UI.modal({
      title: '<i class="fa-solid fa-calendar-days"></i> Kalender Pengingat',
      body: `<div id="cal-body">${_buildCalendarHtml()}</div>`,
      footer: '',
    });
    _bindCalendarEvents(m);
  }

  function _buildCalendarHtml() {
    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const firstDay = new Date(_calYear, _calMonth, 1).getDay();
    const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const holidays = _getHolidays(_calYear);

    let cells = '';
    const totalCells = firstDay + daysInMonth;
    for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell cal-empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = iso === todayStr;
      const isSelected = iso === _calSelectedDate;
      const isHoliday = holidays[iso];
      cells += `<div class="cal-cell${isToday ? ' cal-today' : ''}${isSelected ? ' cal-selected' : ''}${isHoliday ? ' cal-holiday-dot' : ''}" data-date="${iso}" title="${isHoliday || ''}">${d}</div>`;
    }
    for (let i = totalCells; i < 42; i++) cells += '<div class="cal-cell cal-empty"></div>';

    const allNotes = _homeCache?.allNotes || [];
    const remindersThisMonth = allNotes.filter(n => {
      if (!n.reminderAt) return false;
      const rd = n.reminderAt.slice(0, 7);
      return rd === `${_calYear}-${String(_calMonth+1).padStart(2,'0')}`;
    }).sort((a, b) => new Date(a.reminderAt) - new Date(b.reminderAt));

    let reminderListHtml = '';
    if (remindersThisMonth.length) {
      reminderListHtml = remindersThisMonth.map(n => {
        const rd = new Date(n.reminderAt);
        const day = rd.getDate();
        const time = rd.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const iso = n.reminderAt.slice(0, 10);
        const isSelected = iso === _calSelectedDate;
        return `<div class="cal-rem-item${isSelected ? ' cal-rem-active' : ''}" data-date="${iso}">
          <div class="cal-rem-day">${day}</div>
          <div class="cal-rem-info"><div class="cal-rem-title">${_esc(n.title)}</div><div class="cal-rem-time"><i class="fa-solid fa-bell"></i> ${time}</div></div>
          <button class="icon-btn cal-note-del" data-nid="${n.id}" title="Hapus" style="font-size:0.65rem;flex-shrink:0"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
      }).join('');
    } else {
      reminderListHtml = '<div class="cal-empty-msg">Belum ada pengingat bulan ini</div>';
    }

    const monthHolidays = Object.entries(holidays)
      .filter(([k]) => k.startsWith(`${_calYear}-${String(_calMonth+1).padStart(2,'0')}`))
      .map(([k, v]) => {
        const day = parseInt(k.slice(-2));
        return `<div class="cal-hol-item"><span class="cal-hol-day">${day}</span><span class="cal-hol-name">${v}</span></div>`;
      }).join('');

    const detailHtml = _calSelectedDate ? _buildCalendarDetailHtml(_calSelectedDate) : '';

    return `
      <div class="cal-layout">
        <div class="cal-left">
          <div class="cal-nav">
            <button class="icon-btn cal-nav-btn" id="cal-prev"><i class="fa-solid fa-chevron-left"></i></button>
            <span class="cal-month-label">${monthNames[_calMonth]} ${_calYear}</span>
            <button class="icon-btn cal-nav-btn" id="cal-next"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
          <div class="cal-grid">
            ${dayNames.map(d => `<div class="cal-cell cal-day-name">${d}</div>`).join('')}
            ${cells}
          </div>
          <div id="cal-detail">${detailHtml}</div>
        </div>
        <div class="cal-right">
          <div class="cal-right-section cal-expandable" data-expanded="true">
            <div class="cal-right-title cal-toggle"><i class="fa-solid fa-bell"></i> Pengingat Bulan Ini <i class="fa-solid fa-chevron-down cal-toggle-icon"></i></div>
            <div class="cal-expand-body">${reminderListHtml}</div>
          </div>
          <div class="cal-right-section cal-expandable" data-expanded="true">
            <div class="cal-right-title cal-toggle"><i class="fa-solid fa-flag"></i> Hari Besar <i class="fa-solid fa-chevron-down cal-toggle-icon"></i></div>
            <div class="cal-expand-body">${monthHolidays || '<div class="cal-empty-msg">Tidak ada hari besar bulan ini</div>'}</div>
          </div>
        </div>
      </div>
    `;
  }

  function _buildCalendarDetailHtml(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const label = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const holidays = _getHolidays(y);
    const holidayName = holidays[iso];

    const notes = (_homeCache?.allNotes || []).filter(n => {
      if (!n.reminderAt) return false;
      return n.reminderAt.slice(0, 10) === iso;
    });

    let listHtml = '';
    if (notes.length) {
      listHtml = notes.map(n => {
        const time = n.reminderAt ? new Date(n.reminderAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        return `<div class="cal-note-item">
          <div class="cal-note-time"><i class="fa-solid fa-bell"></i> ${time}</div>
          <div class="cal-note-title">${_esc(n.title)}</div>
          <button class="icon-btn cal-note-del" data-nid="${n.id}" title="Hapus pengingat" style="color:var(--label-hard);font-size:0.65rem;flex-shrink:0"><i class="fa-solid fa-trash"></i></button>
        </div>`;
      }).join('');
    }

    return `
      <div class="cal-detail-header">
        ${label}
        ${holidayName ? `<span class="cal-detail-holiday"><i class="fa-solid fa-flag"></i> ${holidayName}</span>` : ''}
      </div>
      ${listHtml ? `<div class="cal-note-list">${listHtml}</div>` : ''}
      <button class="btn-ghost cal-add-trigger" id="cal-add-trigger" style="width:100%;margin-top:8px;font-size:0.75rem"><i class="fa-solid fa-plus"></i> Tambah Pengingat</button>
    `;
  }

  function _buildCalendarAddFormHtml() {
    return `
      <input type="text" id="cal-note-title" class="new-post-textarea" style="min-height:auto;resize:none;margin-bottom:8px" placeholder="Judul pengingat..." maxlength="100">
      <div class="cal-time-row">
        <label style="font-size:0.8rem;font-weight:700;color:var(--text-2)">Waktu:</label>
        <input type="time" id="cal-note-time" value="09:00" style="padding:4px 8px;border:var(--border-w) solid var(--border-strong);background:var(--bg);color:var(--text-1);font-weight:700;font-family:var(--font-body);margin-left:auto">
      </div>
    `;
  }

  function _openCalAddSheet() {
    if (!_calSelectedDate) return;
    const sheet = document.getElementById('cal-add-sheet');
    const body  = document.getElementById('cal-add-sheet-body');
    if (!sheet || !body) return;

    body.innerHTML = `
      <div style="padding:14px">
        ${_buildCalendarAddFormHtml()}
        <button class="btn-primary" id="cal-add-btn" style="width:100%;margin-top:8px"><i class="fa-solid fa-plus"></i> Tambah Pengingat</button>
      </div>
    `;

    sheet.classList.add('open');
    sheet.removeAttribute('aria-hidden');

    document.getElementById('cal-add-btn')?.addEventListener('click', async () => {
      const titleEl = document.getElementById('cal-note-title');
      const timeEl  = document.getElementById('cal-note-time');
      const title   = titleEl?.value.trim();
      if (!title) { UI.toast('Isi judul pengingat dulu!', 'warning'); return; }
      const addBtn = document.getElementById('cal-add-btn');
      addBtn.disabled = true;
      addBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
      try {
        const [y, mo, d] = _calSelectedDate.split('-').map(Number);
        const [hh, mm] = (timeEl?.value || '09:00').split(':').map(Number);
        const reminderAt = new Date(y, mo - 1, d, hh, mm).toISOString();
        const created = await N.create({ title, content: `<p>${_esc(title)}</p>`, label: 'medium' });
        await N.setReminderAt(created.id, reminderAt);
        _homeCache = null;
        const freshNotes = await N.getAll();
        const freshGroups = await _fetchGroups();
        const freshTags = await Tg.getTagsForNotes(freshNotes.map(n => n.id)).catch(() => ({}));
        _homeCache = { allNotes: freshNotes, priority: await N.getPriorityNotes(), groups: freshGroups, tagsMap: freshTags };
        if (window.Capacitor?.isNativePlatform) Rm.syncNativeSchedules();
        UI.toast('Pengingat ditambahkan!', 'success');
        sheet.classList.remove('open');
        sheet.setAttribute('aria-hidden', 'true');
        _refreshCal();
      } catch (err) { UI.toast('Gagal: ' + err.message, 'error'); }
      addBtn.disabled = false;
      addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Pengingat';
    });

    function closeSheet() {
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
      document.removeEventListener('click', outsideClick);
    }
    function outsideClick(e) {
      if (!sheet.contains(e.target)) closeSheet();
    }
    document.getElementById('cal-sheet-close')?.addEventListener('click', closeSheet);
    setTimeout(() => document.addEventListener('click', outsideClick), 50);
  }

  function _bindCalendarEvents(m) {
    const body = document.getElementById('cal-body');
    if (!body) return;

    body.addEventListener('click', async e => {
      const btn = e.target.closest('button');
      const cell = e.target.closest('.cal-cell[data-date]');
      const remItem = e.target.closest('.cal-rem-item');
      const toggle = e.target.closest('.cal-toggle');

      if (toggle) {
        const section = toggle.closest('.cal-expandable');
        if (section) {
          const expanded = section.dataset.expanded === 'true';
          section.dataset.expanded = String(!expanded);
          const icon = toggle.querySelector('.cal-toggle-icon');
          if (icon) icon.style.transform = expanded ? 'rotate(-90deg)' : '';
        }
        return;
      }

      if (btn?.id === 'cal-add-trigger' || e.target.closest('#cal-add-trigger')) { _openCalAddSheet(); return; }

      if (btn?.id === 'cal-prev') { _calMonth--; if (_calMonth < 0) { _calMonth = 11; _calYear--; } _refreshCal(); return; }
      if (btn?.id === 'cal-next') { _calMonth++; if (_calMonth > 11) { _calMonth = 0; _calYear++; } _refreshCal(); return; }

      if (cell) { _calSelectedDate = cell.dataset.date; _refreshCal(); return; }

      if (remItem && !btn?.classList.contains('cal-note-del')) { _calSelectedDate = remItem.dataset.date; _refreshCal(); return; }

      if (btn?.classList.contains('cal-note-del')) {
        const nid = btn.dataset.nid;
        const ok = await UI.confirm({ title: 'Hapus Pengingat', message: 'Pengingat ini akan dihapus dari catatan.', okLabel: 'Hapus' });
        if (ok) {
          await N.setReminderAt(nid, null);
          _homeCache = null;
          const freshNotes = await N.getAll();
          const freshGroups = await _fetchGroups();
          const freshTags = await Tg.getTagsForNotes(freshNotes.map(n => n.id)).catch(() => ({}));
          _homeCache = { allNotes: freshNotes, priority: await N.getPriorityNotes(), groups: freshGroups, tagsMap: freshTags };
          if (window.Capacitor?.isNativePlatform) Rm.syncNativeSchedules();
          UI.toast('Pengingat dihapus', 'info');
          _refreshCal();
        }
        return;
      }
    });
  }

  function _refreshCal() {
    const body = document.getElementById('cal-body');
    if (body) body.innerHTML = _buildCalendarHtml();
  }

  function _renderHomeContent(main, { allNotes, priority, groups, tagsMap }) {
    const others  = allNotes.filter(n => !priority.some(p => p.id === n.id));
    const streak   = _getStreak();
    const todayWds = _getTodayWords();
    const weekData = _getWeekActivity();
    const maxWds   = Math.max(...weekData.map(d => d.words), 1);
    const statsHtml = `
      <div class="stats-card">
        <div class="stats-header"><i class="fa-solid fa-chart-simple"></i> Statistik</div>
        <div class="stats-grid">
          <div class="stats-item">
            <div class="stats-item-icon" style="background:#f5a62320;color:#f5a623"><i class="fa-solid fa-fire"></i></div>
            <div class="stats-item-info"><div class="stats-item-value">${streak}</div><div class="stats-item-label">Hari beruntun</div></div>
          </div>
          <div class="stats-item">
            <div class="stats-item-icon" style="background:var(--accent);color:var(--bg)"><i class="fa-solid fa-pen"></i></div>
            <div class="stats-item-info"><div class="stats-item-value">${todayWds.toLocaleString('id-ID')}</div><div class="stats-item-label">Kata hari ini</div></div>
          </div>
          <div class="stats-item">
            <div class="stats-item-icon" style="background:var(--label-easy);color:var(--bg)"><i class="fa-solid fa-note-sticky"></i></div>
            <div class="stats-item-info"><div class="stats-item-value">${allNotes.length}</div><div class="stats-item-label">Catatan</div></div>
          </div>
        </div>
        <div class="stats-week-title">Aktivitas Mingguan</div>
        <div class="week-chart">
          ${weekData.map(d => `
            <div class="week-bar-wrap" title="${d.label}: ${d.words} kata">
              <div class="week-bar" style="height:${Math.round((d.words / maxWds) * 100)}%"></div>
              <span class="week-bar-label">${d.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    const groupedIds      = new Set(groups.flatMap(g => g.note_ids));
    const ungroupedOthers = others.filter(n => !groupedIds.has(n.id));
    if (_multiSelect) _selectedIds = new Set([..._selectedIds].filter(id => allNotes.some(n => n.id === id)));
    const groupCards = groups.map(g => _buildGroupCard(g, allNotes, tagsMap, groups)).filter(Boolean).join('');
    const homeLayout = window.Notara.Storage.get('home_layout', 'grid');
    main.innerHTML = `
      <div class="home-page page-enter">
        <div class="greeting-block">
          <div class="greeting-icon">${_getGreetingIcon()}</div>
          <div class="greeting-text"><div class="greeting-main">${_getGreeting()}</div><div class="greeting-date">${_formatToday()}</div></div>
          <button class="btn-ghost" id="calendar-open-btn" title="Kalender Pengingat" style="margin-left:auto;font-size:0.85rem;gap:6px"><i class="fa-solid fa-calendar-days"></i> Kalender</button>
        </div>
        <div class="home-top-row">
          ${_buildHeatmap()}
          ${statsHtml}
        </div>
        ${allNotes.length > 0 && priority.length > 0 ? `
          <div class="section-header"><span class="section-title"><i class="fa-solid fa-bolt"></i> Prioritas</span><span class="section-action" id="show-all-btn">Lihat semua</span></div>
          <div class="flipcard-row" id="flipcard-row"></div>
        ` : ''}
        ${groupCards ? `
          <div class="section-header" style="margin-top:var(--space-md)"><span class="section-title"><i class="fa-solid fa-layer-group"></i> Grup</span></div>
          <div id="groups-container">${groupCards}</div>
        ` : ''}
        ${ungroupedOthers.length > 0 ? `
          <div class="section-header" style="margin-top:${priority.length || groupCards ? 'var(--space-md)' : '0'}">
            <span class="section-title"><i class="fa-solid fa-note-sticky"></i> Semua Catatan</span>
            <div style="display:flex;gap:4px;margin-left:auto">
              <button class="icon-btn group-layout-btn" id="home-layout-btn" data-layout="${homeLayout}" title="Ganti tampilan" style="width:28px;height:28px;font-size:0.75rem">
                <i class="fa-solid fa-${homeLayout === 'grid' ? 'table-cells-large' : 'list'}"></i>
              </button>
              <button class="btn-ghost" id="ms-toggle-btn" style="font-size:0.75rem;padding:0.3rem 0.8rem;gap:5px"><i class="fa-solid fa-check-double"></i> ${_multiSelect ? 'Batal Pilih' : 'Pilih'}</button>
            </div>
          </div>
          <div class="notes-grid ${homeLayout === 'list' ? 'notes-list' : ''}" id="notes-grid"></div>
        ` : ''}
        ${!allNotes.length ? `
          <div class="empty-state" style="min-height:40vh">
            <span class="empty-icon float-hint" style="font-size:3rem;color:var(--accent);opacity:0.4"><i class="fa-solid fa-note-sticky"></i></span>
            <h3>Belum ada catatan</h3><p>Mulai buat catatan pertamamu sekarang!</p>
            <button class="btn-primary" id="empty-new-btn"><i class="fa-solid fa-plus"></i> Catatan Baru</button>
          </div>
        ` : ''}
      </div>
    `;
    if (priority.length > 0) {
      const row = document.getElementById('flipcard-row');
      if (row) {
        row.innerHTML = priority.map(n => _buildFlipcard(n)).join('');
        _bindFlipcards(row);
        if (_multiSelect) { row.querySelectorAll('.flipcard-wrap').forEach(wrap => { wrap.classList.toggle('ms-selected', _selectedIds.has(wrap.dataset.id)); }); }
      }
    }
    if (ungroupedOthers.length > 0) {
      const grid = document.getElementById('notes-grid');
      if (grid) {
        grid.innerHTML = ungroupedOthers.map(n => _buildNoteCard(n, tagsMap[n.id] || [])).join('');
        if (_multiSelect) { grid.querySelectorAll('.note-card').forEach(card => { card.classList.toggle('ms-selected', _selectedIds.has(card.dataset.id)); }); _bindNoteCardsMultiSelect(grid); } else { _bindNoteCards(grid); }
      }
    }
    const groupsContainer = document.getElementById('groups-container');
    if (groupsContainer) { _bindGroupCardEvents(groupsContainer, groups); }
    document.getElementById('show-all-btn')?.addEventListener('click', () => R.go('search'));
    document.getElementById('empty-new-btn')?.addEventListener('click', _newNote);
    document.getElementById('ms-toggle-btn')?.addEventListener('click', _toggleMultiSelect);
    document.getElementById('calendar-open-btn')?.addEventListener('click', _openCalendarModal);
    document.getElementById('home-layout-btn')?.addEventListener('click', function() {
      const current = this.dataset.layout;
      const newLayout = current === 'grid' ? 'list' : 'grid';
      window.Notara.Storage.set('home_layout', newLayout);
      this.dataset.layout = newLayout;
      const icon = this.querySelector('i');
      if (icon) icon.className = `fa-solid fa-${newLayout === 'grid' ? 'table-cells-large' : 'list'}`;
      const grid = document.getElementById('notes-grid');
      if (grid) grid.classList.toggle('notes-list', newLayout === 'list');
    });
  }

  /* --- FLIPCARD --- */
  function _buildFlipcard(note) {
    const labelMap  = { easy: 'chip-easy', medium: 'chip-medium', hard: 'chip-hard' };
    const labelText = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    const preview   = UI.stripHtml(note.content).slice(0, 300);
    return `
      <div class="flipcard-wrap" data-id="${note.id}">
        <div class="flipcard">
          <div class="flipcard-face flipcard-front">
            <div class="flipcard-glow"></div>
            <span class="flipcard-label chip ${labelMap[note.label] || 'chip-medium'}">${labelText[note.label] || note.label}</span>
            <div class="flipcard-title">${_esc(note.title)}</div>
            <div class="flipcard-sub">${UI.formatDate(note.updatedAt)}</div>
            ${Rm.cardBadgeHtml(note)}
            <div class="flipcard-hint"><i class="fa-solid fa-rotate"></i> Tap untuk flip</div>
          </div>
          <div class="flipcard-face flipcard-back">
            <div class="flipcard-preview">${note.content || '<p>' + _esc(preview) + '</p>'}</div>
            <div class="flipcard-actions">
              <button class="btn-primary fc-read" data-id="${note.id}" style="font-size:0.8rem;padding:0.4rem 0.9rem"><i class="fa-solid fa-eye"></i> Baca</button>
              <button class="btn-ghost fc-edit" data-id="${note.id}" style="font-size:0.8rem;padding:0.4rem 0.9rem"><i class="fa-solid fa-pen"></i> Edit</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  function _bindFlipcards(container) {
    container.querySelectorAll('.flipcard-wrap').forEach(wrap => {
      let holdTimer;
      wrap.addEventListener('click', e => {
        if (_multiSelect) { _toggleNoteSelect(wrap.dataset.id); return; }
        if (e.target.closest('.fc-read')) { R.go('read/' + e.target.closest('[data-id]').dataset.id); return; }
        if (e.target.closest('.fc-edit')) { R.go('edit/' + e.target.closest('[data-id]').dataset.id); return; }
        wrap.classList.toggle('flipped');
      });
      wrap.addEventListener('pointerdown', () => { if (_multiSelect) return; holdTimer = setTimeout(() => _noteActions(wrap.dataset.id), 600); });
      wrap.addEventListener('pointerup',   () => clearTimeout(holdTimer));
      wrap.addEventListener('pointerleave',() => clearTimeout(holdTimer));
    });
  }

  /* --- NOTE CARD (dengan tags) --- */
  function _buildNoteCard(note, tags = []) {
    const preview   = UI.stripHtml(note.content);
    const dtBadge   = Rm.cardBadgeHtml(note);
    const tagsHtml = tags.length ? `<div class="card-tags">${tags.map(t => `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${_esc(t.name)}</span>`).join('')}</div>` : '';
    return `
      <div class="note-card ${note.pinned ? 'pinned' : ''}" data-id="${note.id}" data-locked="${note.locked ? '1' : ''}">
        <div class="card-accent-bar ${note.label}"></div>
        <div class="card-header">
          <div class="card-title">${_esc(note.title)}</div>
          ${note.pinned ? '<i class="fa-solid fa-thumbtack" style="color:var(--accent);font-size:0.7rem"></i>' : ''}
        </div>
        ${preview ? `<div class="card-preview">${_esc(preview.slice(0, 120))}</div>` : ''}
        ${tagsHtml}
        ${dtBadge ? `<div class="card-dt-row">${dtBadge}</div>` : ''}
        <div class="card-footer">
          <span class="card-date">${UI.formatDate(note.updatedAt)}</span>
          ${note.favorite ? '<i class="fa-solid fa-star" style="color:#f5a623;font-size:0.75rem"></i>' : ''}
        </div>
      </div>
    `;
  }
  function _bindNoteCards(container) {
    container.querySelectorAll('.note-card').forEach(card => {
      let holdTimer, moved = false;
      card.addEventListener('pointerdown', () => { moved = false; holdTimer = setTimeout(() => { moved = true; _noteActions(card.dataset.id); }, 500); });
      card.addEventListener('pointermove', () => clearTimeout(holdTimer));
      card.addEventListener('pointerup',   () => clearTimeout(holdTimer));
      card.addEventListener('click', () => {
        if (moved) return;
        if (card.dataset.locked === '1') { _showPinEntry(card.dataset.id, () => R.go('read/' + card.dataset.id)); } else { R.go('read/' + card.dataset.id); }
      });
    });
  }
  function _bindNoteCardsMultiSelect(container) {
    container.querySelectorAll('.note-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => { _toggleNoteSelect(card.dataset.id); });
    });
  }

  /* --- READ PAGE --- */
  async function _renderRead(noteId) {
    const main = document.getElementById('app-main');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;
    const note = await N.getById(noteId);
    if (!note) { R.go('home'); return; }
    UI.setTitle(note.title);
    UI.setActiveNav('home');
    document.body.classList.add('reader-view');
    main.classList.add('reader-content');
    const labelMap  = { easy: 'chip-easy', medium: 'chip-medium', hard: 'chip-hard' };
    const labelText = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    const noteTags  = await Tg.getNoteTags(noteId).catch(() => []);
    let dtMeta = '';
    if (note.deadline) {
      const cd = Rm.formatCountdown(note.deadline);
      const dt = new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      dtMeta += `<span class="read-deadline-badge ${cd?.urgent ? 'urgent' : ''} ${cd?.overdue ? 'overdue' : ''}"><i class="fa-solid fa-hourglass-half"></i> Tenggat: ${dt} ${cd ? `<span class="read-deadline-cd">(${cd.text})</span>` : ''}</span>`;
    }
    if (note.reminderAt) {
      const cd = Rm.formatCountdown(note.reminderAt);
      const dt = new Date(note.reminderAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      dtMeta += `<span class="read-deadline-badge reminder ${cd?.urgent ? 'urgent' : ''} ${cd?.overdue ? 'overdue' : ''}"><i class="fa-solid fa-bell"></i> Pengingat: ${dt} ${cd ? `<span class="read-deadline-cd">(${cd.text})</span>` : ''}</span>`;
    }
    const tagsHtml = noteTags.length ? `<div class="read-tags">${noteTags.map(t => `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${_esc(t.name)}</span>`).join('')}</div>` : '';
    main.innerHTML = `
      <div class="read-page page-enter">
        <h1 class="read-title">${_esc(note.title)}</h1>
        <div class="read-body">${note.content || '<p style="color:var(--text-3)">Catatan ini kosong.</p>'}</div>
      </div>
    `;
    _updateTopbarForReader(noteId, { note, labelMap, labelText, dtMeta, tagsHtml });
    document.querySelectorAll('.note-wikilink').forEach(link => { link.addEventListener('click', e => { e.preventDefault(); const id = link.dataset.id; if (id) R.go('read/' + id); }); });
  }

  function _updateTopbarForReader(noteId, { note, labelMap, labelText, dtMeta, tagsHtml }) {
    const topbar = document.getElementById('topbar');
    if (!topbar) return;
    const normalItems = topbar.querySelectorAll('.topbar-normal-item');
    const readerBar = document.getElementById('topbar-reader-bar');
    normalItems.forEach(el => el.style.display = 'none');
    if (readerBar) {
      readerBar.style.display = 'flex';
      readerBar.innerHTML = `
        <button class="icon-btn" id="read-back" title="Kembali"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="reader-topbar-meta">
          <span class="chip ${labelMap[note.label] || 'chip-medium'}" style="font-size:0.65rem;padding:2px 8px">${labelText[note.label] || note.label}</span>
          <span class="read-date reader-date-desktop" style="font-size:0.65rem">${UI.formatDate(note.updatedAt)}</span>
          ${note.pinned   ? '<span class="read-badge" style="font-size:0.65rem"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
          ${note.favorite ? '<span class="read-badge" style="font-size:0.65rem"><i class="fa-solid fa-star" style="color:#f5a623"></i></span>' : ''}
          ${dtMeta ? `<span class="reader-dt-meta" style="font-size:0.65rem">${dtMeta}</span>` : ''}
          ${tagsHtml ? `<span class="reader-tags-inline" style="font-size:0.65rem">${tagsHtml}</span>` : ''}
        </div>
        <button class="icon-btn" id="read-edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn" id="read-more" title="Opsi lainnya"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      `;
      document.getElementById('read-back')?.addEventListener('click', () => { UI.closePopup(); _restoreTopbarFromReader(); R.back(); });
      document.getElementById('read-edit')?.addEventListener('click', () => { UI.closePopup(); _restoreTopbarFromReader(); R.go('edit/' + noteId); });
      document.getElementById('read-more')?.addEventListener('click', e => { e.stopPropagation(); _noteActions(noteId); });
    }
  }

  function _restoreTopbarFromReader() {
    const topbar = document.getElementById('topbar');
    if (!topbar) return;
    const normalItems = topbar.querySelectorAll('.topbar-normal-item');
    const readerBar = document.getElementById('topbar-reader-bar');
    normalItems.forEach(el => el.style.display = '');
    if (readerBar) { readerBar.style.display = 'none'; readerBar.innerHTML = ''; }
  }

  /* --- PIN ENTRY --- */
  function _showPinEntry(noteId, onSuccess) {
    UI.modal({
      title: 'Catatan Terkunci',
      body: `
        <p style="color:var(--text-2);margin-bottom:var(--space-md)"><i class="fa-solid fa-lock"></i> Masukkan PIN 4 digit.</p>
        <div class="pin-input-row">${[0,1,2,3].map(i => `<input class="pin-digit" type="password" maxlength="1" inputmode="numeric" data-i="${i}">`).join('')}</div>
        <div class="auth-error" id="pin-error"></div>
      `,
      footer: `<button class="btn-primary" id="pin-submit"><i class="fa-solid fa-unlock"></i> Buka</button>`,
    });
    setTimeout(() => {
      const digits = document.querySelectorAll('.pin-digit');
      digits[0]?.focus();
      digits.forEach((d, i) => {
        d.addEventListener('input',   () => { if (d.value) digits[i+1]?.focus(); });
        d.addEventListener('keydown', e  => { if (e.key === 'Backspace' && !d.value) digits[i-1]?.focus(); });
      });
      document.getElementById('pin-submit')?.addEventListener('click', async () => {
        const pin = [...digits].map(d => d.value).join('');
        if (await N.verifyPin(noteId, pin)) { document.getElementById('modal-close').click(); onSuccess(); } else {
          document.getElementById('pin-error').textContent = 'PIN salah, coba lagi.';
          digits.forEach(d => { d.value = ''; }); digits[0]?.focus();
        }
      });
    }, 80);
  }

  /* --- SEARCH PAGE --- */
  async function _renderSearch(query = '') {
    const main = document.getElementById('app-main');
    UI.setTitle('Cari');
    UI.setActiveNav('search');
    let allTags = [];
    try { allTags = await Tg.getAll(); } catch {}
    const tagFilterHtml = allTags.length ? allTags.map(t => `<button class="filter-chip" data-filter="tag:${t.id}" style="--tag-color:${t.color}"><span style="width:8px;height:8px;border-radius:50%;background:${t.color};display:inline-block"></span> ${_esc(t.name)}</button>`).join('') : '';
    const FILTER_OPTIONS = [
      { value: 'all', label: 'Semua', icon: '' },
      { value: 'easy', label: 'Easy', icon: '<i class="fa-solid fa-circle" style="color:var(--label-easy);font-size:0.6rem"></i>' },
      { value: 'medium', label: 'Medium', icon: '<i class="fa-solid fa-circle" style="color:var(--label-medium);font-size:0.6rem"></i>' },
      { value: 'hard', label: 'Hard', icon: '<i class="fa-solid fa-circle" style="color:var(--label-hard);font-size:0.6rem"></i>' },
      { value: 'pinned', label: 'Pin', icon: '<i class="fa-solid fa-thumbtack"></i>' },
      { value: 'favorite', label: 'Favorit', icon: '<i class="fa-solid fa-star"></i>' },
      ...allTags.map(t => ({ value: 'tag:' + t.id, label: t.name, icon: `<span style="width:8px;height:8px;border-radius:50%;background:${t.color};display:inline-block"></span>` })),
    ];
    const currentFilterLabel = FILTER_OPTIONS.find(o => o.value === 'all')?.label || 'Semua';
    main.innerHTML = `
      <div class="search-page page-enter">
        <div class="search-input-wrap">
          <i class="fa-solid fa-magnifying-glass search-input-icon"></i>
          <input class="search-input" id="search-input" placeholder="Cari catatan..." value="${_esc(query)}">
        </div>
        <div class="filter-dropdown-row">
          <div class="dropdown-wrap" data-dropdown="filter">
            <button class="dropdown-trigger" data-dropdown-toggle="filter">
              <span class="dropdown-value" id="filter-dropdown-label">${currentFilterLabel}</span>
              <i class="fa-solid fa-chevron-down dropdown-arrow"></i>
            </button>
            <div class="dropdown-menu" id="dropdown-filter">
              ${FILTER_OPTIONS.map(o => `
                <div class="dropdown-item ${o.value === 'all' ? 'active' : ''}" data-filter-pick="${o.value}">
                  <span style="display:flex;align-items:center;gap:8px">${o.icon}${_esc(o.label)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        <div id="search-results" class="notes-grid"></div>
      </div>
    `;
    let _activeFilter = 'all';
    async function doSearch() {
      const q = document.getElementById('search-input')?.value || '';
      const grid = document.getElementById('search-results');
      if (!grid) return;
      grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:2rem"><div class="loader-ring"></div></div>`;
      let results;
      if (_activeFilter.startsWith('tag:')) {
        const tagId = _activeFilter.replace('tag:', '');
        results = await Tg.getNotesByTag(tagId).catch(() => []);
        if (q.trim()) {
          const lower = q.toLowerCase().trim();
          results = results.filter(n => (n.title + ' ' + UI.stripHtml(n.content || '')).toLowerCase().includes(lower));
        }
      } else {
        const filters = {};
        if (['easy','medium','hard'].includes(_activeFilter)) filters.label = _activeFilter;
        else if (_activeFilter === 'pinned')   filters.pinned   = true;
        else if (_activeFilter === 'favorite') filters.favorite = true;
        results = await N.search(q, filters).catch(() => []);
      }
      if (!results.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-magnifying-glass empty-icon"></i><h3>Tidak ditemukan</h3><p>Coba kata kunci atau filter lain</p></div>`; return;
      }
      const resultIds = results.map(n => n.id);
      const tagsMap   = await Tg.getTagsForNotes(resultIds).catch(() => ({}));
      grid.innerHTML  = results.map(n => _buildNoteCard(n, tagsMap[n.id] || [])).join('');
      _bindNoteCards(grid);
    }
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
    document.querySelectorAll('[data-filter-pick]').forEach(function(el) {
      el.addEventListener('click', function() {
        _activeFilter = el.dataset.filterPick;
        var wrap = document.querySelector('[data-dropdown="filter"]');
        var label = FILTER_OPTIONS.find(function(o) { return o.value === _activeFilter; })?.label || 'Semua';
        wrap.querySelector('.dropdown-value').textContent = label;
        wrap.querySelectorAll('.dropdown-item').forEach(function(x) { x.classList.remove('active'); });
        el.classList.add('active');
        _closeAllDropdowns();
        doSearch();
      });
    });
    let _debounce;
    document.getElementById('search-input')?.addEventListener('input', () => { clearTimeout(_debounce); _debounce = setTimeout(doSearch, 300); });
    setTimeout(() => document.getElementById('search-input')?.focus(), 50);
    doSearch();
  }

  /* --- TIMELINE --- */
  async function _renderTimeline() {
    const main = document.getElementById('app-main');
    UI.setTitle('Timeline');
    UI.setActiveNav('timeline');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;
    const groups = await N.getTimeline();
    const days   = Object.keys(groups);
    if (!days.length) { main.innerHTML = `<div class="timeline-page page-enter"><div class="empty-state" style="min-height:60vh"><i class="fa-regular fa-clock empty-icon" style="font-size:3rem;opacity:0.4"></i><h3>Timeline kosong</h3><p>Buat catatan untuk melihat timeline</p></div></div>`; return; }
    main.innerHTML = `
      <div class="timeline-page page-enter">
        <h2 style="margin-bottom:var(--space-xl)">Timeline</h2>
        ${days.map(day => `
          <div class="timeline-group">
            <div class="timeline-date">${day}</div>
            ${groups[day].map(n => `
              <div class="timeline-card" data-id="${n.id}">
                <div class="timeline-dot ${n.label}"></div>
                <div class="timeline-content"><h4>${_esc(n.title)}</h4><p>${UI.formatDate(n.updatedAt)} • ${n.label}</p></div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
    document.querySelectorAll('.timeline-card').forEach(card => { card.addEventListener('click', () => R.go('read/' + card.dataset.id)); });
  }

  /* --- TAGS PAGE --- */
  async function _renderTags() {
    const main = document.getElementById('app-main');
    UI.setTitle('Tag');
    UI.setActiveNav('tags');
    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;
    let tags = [];
    try { tags = await Tg.getAll(); } catch (err) { main.innerHTML = `<div class="empty-state" style="min-height:60vh"><i class="fa-solid fa-triangle-exclamation empty-icon"></i><h3>Gagal memuat tag</h3><p>${err.message}</p></div>`; return; }
    const colors = Tg.getPresetColors();
    main.innerHTML = `
      <div class="tags-page page-enter">
        <div class="tags-header">
          <h2><i class="fa-solid fa-tags"></i> Tag</h2>
          <button class="btn-primary" id="new-tag-btn"><i class="fa-solid fa-plus"></i> Tag Baru</button>
        </div>
        <p style="color:var(--text-3);font-size:0.83rem;margin-bottom:var(--space-lg)">Tag membantu kamu mengelompokkan catatan. Satu catatan bisa punya banyak tag.</p>
        ${!tags.length ? `<div class="empty-state" style="min-height:40vh"><i class="fa-solid fa-tags empty-icon" style="opacity:0.25"></i><h3>Belum ada tag</h3><p>Klik "Tag Baru" untuk membuat tag pertamamu</p></div>` : `<div class="tags-list" id="tags-list">${tags.map(t => _buildTagRow(t)).join('')}</div>`}
      </div>
    `;
    document.getElementById('new-tag-btn')?.addEventListener('click', () => _showTagForm(null, colors, _renderTags));
    _bindTagRows(colors);
  }
  function _buildTagRow(tag) {
    return `
      <div class="tag-row" data-id="${tag.id}">
        <span class="tag-row-dot" style="background:${tag.color}"></span><span class="tag-row-name">${_esc(tag.name)}</span>
        <div class="tag-row-actions">
          <button class="icon-btn tag-edit-btn" data-id="${tag.id}" data-name="${_esc(tag.name)}" data-color="${tag.color}" title="Edit tag"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-btn tag-delete-btn" data-id="${tag.id}" data-name="${_esc(tag.name)}" title="Hapus tag" style="color:var(--label-hard)"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
  }
  function _bindTagRows(colors) {
    document.querySelectorAll('.tag-edit-btn').forEach(btn => { btn.addEventListener('click', () => { _showTagForm({ id: btn.dataset.id, name: btn.dataset.name, color: btn.dataset.color }, colors, _renderTags); }); });
    document.querySelectorAll('.tag-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await UI.confirm({ title: 'Hapus Tag', message: `Tag "<strong>${_esc(btn.dataset.name)}</strong>" akan dihapus dari semua catatan. Yakin?`, okLabel: 'Hapus', okClass: 'btn-primary' });
        if (!ok) return;
        try { await Tg.remove(btn.dataset.id); UI.toast('Tag dihapus', 'info'); _renderTags(); } catch (err) { UI.toast('Gagal hapus: ' + err.message, 'error'); }
      });
    });
  }
  function _showTagForm(existing, colors, onDone) {
    const isEdit = !!existing; let selectedColor = existing?.color || colors[0];
    UI.modal({
      title: isEdit ? 'Edit Tag' : 'Tag Baru',
      body: `
        <div style="display:flex;flex-direction:column;gap:var(--space-md)">
          <div>
            <label class="auth-label" style="display:block;margin-bottom:6px">Nama Tag</label>
            <input id="tag-name-input" class="auth-input" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;width:100%;color:var(--text-1)" value="${_esc(existing?.name || '')}" placeholder="Nama tag..." maxlength="30">
          </div>
          <div>
            <label class="auth-label" style="display:block;margin-bottom:8px">Warna</label>
            <div class="color-picker-row" id="color-picker-row">${colors.map(c => `<button class="color-dot ${c === selectedColor ? 'selected' : ''}" style="background:${c}" data-color="${c}" title="${c}" type="button"></button>`).join('')}</div>
          </div>
          <div class="auth-error" id="tag-form-error"></div>
        </div>
      `,
      footer: `<button class="btn-ghost" id="tag-form-cancel">Batal</button><button class="btn-primary" id="tag-form-save" style="margin-left:8px"><i class="fa-solid fa-check"></i> ${isEdit ? 'Simpan' : 'Buat Tag'}</button>`,
    });
    setTimeout(() => {
      document.getElementById('tag-form-cancel')?.addEventListener('click', () => document.getElementById('modal-close').click());
      document.querySelectorAll('.color-dot').forEach(dot => { dot.addEventListener('click', () => { document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected')); dot.classList.add('selected'); selectedColor = dot.dataset.color; }); });
      document.getElementById('tag-form-save')?.addEventListener('click', async () => {
        const name  = document.getElementById('tag-name-input').value.trim(); const errEl = document.getElementById('tag-form-error');
        if (!name) { errEl.textContent = 'Nama tag wajib diisi.'; return; }
        try { if (isEdit) await Tg.update(existing.id, name, selectedColor); else await Tg.create(name, selectedColor); UI.toast(isEdit ? 'Tag diperbarui' : 'Tag baru dibuat!', 'success'); document.getElementById('modal-close').click(); onDone(); } catch (err) { errEl.textContent = err.message; }
      });
    }, 60);
  }

  /* --- POSTS / SOCIAL FEED --- */
  let _postPage = 0; let _postLoading = false;
  async function _renderPosts() {
    const main    = document.getElementById('app-main'); const userId  = Au.getUser()?.id;
    UI.setTitle('Publikasi'); UI.setActiveNav('posts'); _postPage = 0;
    main.innerHTML = `
      <div class="posts-page page-enter">
        <div class="posts-header">
          <h2><i class="fa-solid fa-quote-left"></i> Publikasi</h2>
          <button class="btn-primary" id="new-post-toggle" style="font-size:0.85rem"><i class="fa-solid fa-plus"></i> Buat Postingan</button>
        </div>
        <p style="color:var(--text-3);font-size:0.83rem;margin-bottom:var(--space-lg)">Bagikan kata-kata & quotes yang menginspirasi. Semua pengguna bisa membaca dan memberi like.</p>
        <div class="new-post-card" id="new-post-card" style="display:none">
          <div class="post-author" style="margin-bottom:var(--space-sm)"><div class="post-avatar">${_initials(Au.getName())}</div><span style="font-size:0.88rem;font-weight:600;color:var(--text-1)">${_esc(Au.getName())}</span></div>
          <textarea id="new-post-textarea" class="new-post-textarea" placeholder="Tulis kata-kata, quotes, atau pikiran yang ingin kamu bagikan..." maxlength="500" rows="3"></textarea>
          <div class="new-post-footer"><span class="post-char-count" id="post-char-count">0 / 500</span><button class="btn-primary" id="post-submit-btn" disabled><i class="fa-solid fa-paper-plane"></i> Publikasikan</button></div>
        </div>
        <div id="feed-container"><div class="page-loading"><div class="loader-ring"></div></div></div>
        <div id="feed-load-more" style="text-align:center;padding:var(--space-md);display:none"><button class="btn-ghost" id="load-more-btn"><i class="fa-solid fa-chevron-down"></i> Muat Lebih Banyak</button></div>
      </div>
    `;
    const card     = document.getElementById('new-post-card');
    const toggle   = document.getElementById('new-post-toggle');
    const textarea = document.getElementById('new-post-textarea'); const submitBtn = document.getElementById('post-submit-btn');
    toggle?.addEventListener('click', () => { const show = card.style.display === 'none'; card.style.display = show ? 'block' : 'none'; if (show) textarea?.focus(); });
    textarea?.addEventListener('input', () => { const len = textarea.value.length; document.getElementById('post-char-count').textContent = `${len} / 500`; submitBtn.disabled = len < 1; });
    submitBtn?.addEventListener('click', async () => {
      const content = textarea.value.trim(); if (!content) return;
      if (Au.isGuest()) { UI.toast('Masuk dulu untuk mempublikasikan', 'warning'); return; }
      submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat...';
      try { await Pt.create(content); textarea.value = ''; document.getElementById('post-char-count').textContent = '0 / 500'; UI.toast('Berhasil dipublikasikan!', 'success'); _postPage = 0; await _loadFeed(true); } catch (err) { UI.toast('Gagal: ' + err.message, 'error'); }
      submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publikasikan';
    });
    await _loadFeed(true);
    document.getElementById('load-more-btn')?.addEventListener('click', async () => { _postPage++; await _loadFeed(false); });
  }
  async function _loadFeed(reset = false) {
    if (_postLoading) return; _postLoading = true;
    const container = document.getElementById('feed-container'); const userId = Au.getUser()?.id;
    if (!container) { _postLoading = false; return; }
    if (reset) { container.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`; _postPage = 0; }
    try {
      const posts = await Pt.getFeed(_postPage, 15); const likedIds = await Pt.getLikedIds(posts.map(p => p.id));
      if (reset) container.innerHTML = '';
      if (!posts.length && reset) { container.innerHTML = `<div class="empty-state" style="min-height:30vh"><i class="fa-solid fa-quote-left empty-icon" style="opacity:0.25"></i><h3>Belum ada publikasi</h3><p>Jadilah yang pertama berbagi kata-kata!</p></div>`; document.getElementById('feed-load-more').style.display = 'none'; _postLoading = false; return; }
      posts.forEach(post => { const el = document.createElement('div'); el.innerHTML = _buildPostCard(post, likedIds.has(post.id), userId); const card = el.firstElementChild; container.appendChild(card); _bindPostCard(card, post, userId); });
      const loadMoreWrap = document.getElementById('feed-load-more'); if (loadMoreWrap) loadMoreWrap.style.display = posts.length < 15 ? 'none' : 'block';
    } catch (err) { if (reset) container.innerHTML = `<div class="empty-state" style="min-height:20vh"><h3>Gagal memuat feed</h3><p>${err.message}</p></div>`; }
    _postLoading = false;
  }
  function _buildPostCard(post, liked, currentUserId) {
    const isOwn = post.user_id === currentUserId; const time  = _relativeTime(post.created_at);
    return `
      <div class="post-card" data-post-id="${post.id}">
        <div class="post-author">
          <div class="post-avatar">${_initials(post.author_name || '?')}</div>
          <div class="post-author-info"><div class="post-author-name">${_esc(post.author_name || 'Anonim')}</div><div class="post-time">${time}</div></div>
          ${isOwn ? `<button class="icon-btn post-delete-btn" data-post-id="${post.id}" title="Hapus postingan" style="color:var(--text-3)"><i class="fa-solid fa-ellipsis-vertical"></i></button>` : ''}
        </div>
        <div class="post-content">${_esc(post.content)}</div>
        <div class="post-actions">
          <button class="post-action-btn like-btn ${liked ? 'liked' : ''}" data-post-id="${post.id}"><i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i><span class="like-count">${post.likes_count || 0}</span></button>
          <button class="post-action-btn comment-btn" data-post-id="${post.id}"><i class="fa-regular fa-comment"></i><span>${post.comments_count || 0} komentar</span></button>
        </div>
      </div>
    `;
  }
  function _bindPostCard(card, post, currentUserId) {
    const isOwn = post.user_id === currentUserId;
    card.querySelector('.like-btn')?.addEventListener('click', async () => {
      const likeBtn = card.querySelector('.like-btn'); if (!likeBtn || likeBtn.disabled) return;
      if (Au.isGuest()) { UI.toast('Masuk dulu untuk like', 'warning'); return; }
      const countEl = likeBtn.querySelector('.like-count'); const icon = likeBtn.querySelector('i'); const wasLiked = likeBtn.classList.contains('liked');
      likeBtn.disabled = true;
      if (wasLiked) { likeBtn.classList.remove('liked'); icon.className = 'fa-regular fa-heart'; if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent || '0') - 1); }
      else { likeBtn.classList.add('liked'); icon.className = 'fa-solid fa-heart'; if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1; }
      try { const result = await Pt.toggleLike(post.id); if (countEl) countEl.textContent = result.count; if (result.liked) { likeBtn.classList.add('liked'); icon.className = 'fa-solid fa-heart'; } else { likeBtn.classList.remove('liked'); icon.className = 'fa-regular fa-heart'; } }
      catch (err) { if (wasLiked) { likeBtn.classList.add('liked'); icon.className = 'fa-solid fa-heart'; } else { likeBtn.classList.remove('liked'); icon.className = 'fa-regular fa-heart'; } UI.toast('Gagal like: ' + err.message, 'error'); }
      likeBtn.disabled = false;
    });
    card.querySelector('.comment-btn')?.addEventListener('click', () => _showComments(post));
    if (isOwn) {
      card.querySelector('.post-delete-btn')?.addEventListener('click', async () => {
        const ok = await UI.confirm({ title: 'Hapus Publikasi', message: 'Postingan ini akan dihapus permanen. Yakin?', okLabel: 'Hapus', okClass: 'btn-primary' });
        if (!ok) return;
        try { await Pt.remove(post.id); card.style.animation = 'fade-in 0.2s reverse both'; setTimeout(() => card.remove(), 200); UI.toast('Postingan dihapus', 'info'); } catch (err) { UI.toast('Gagal hapus: ' + err.message, 'error'); }
      });
    }
  }
  async function _showComments(post) {
    const userId = Au.getUser()?.id;
    UI.modal({
      title: `<i class="fa-regular fa-comment"></i> Komentar`,
      body: `
        <div class="post-content" style="padding:var(--space-sm) 0 var(--space-md);border-bottom:1px solid var(--border);margin-bottom:var(--space-md);font-size:0.9rem">${_esc(post.content)}</div>
        <div class="comments-list" id="comments-list"><div style="text-align:center;padding:var(--space-md)"><div class="loader-ring" style="margin:0 auto"></div></div></div>
        <div class="comment-input-wrap">
          <input class="comment-input" id="comment-input" placeholder="Tulis komentar..." maxlength="200">
          <button class="btn-primary" id="comment-send" style="padding:8px 14px;flex-shrink:0"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      `,
    });
    setTimeout(async () => {
      const listEl = document.getElementById('comments-list'); const input  = document.getElementById('comment-input');
      async function loadComments() {
        if (!listEl) return;
        try {
          const comments = await Pt.getComments(post.id);
          if (!comments.length) { listEl.innerHTML = `<p style="color:var(--text-3);font-size:0.83rem;text-align:center;padding:var(--space-md)">Belum ada komentar. Jadilah yang pertama!</p>`; return; }
          listEl.innerHTML = comments.map(c => `
            <div class="comment-item">
              <div class="comment-avatar">${_initials(c.author_name || '?')}</div>
              <div class="comment-body"><div class="comment-author">${_esc(c.author_name || 'Anonim')}</div><div class="comment-text">${_esc(c.content)}</div><div class="comment-time">${_relativeTime(c.created_at)}</div></div>
              ${c.user_id === userId ? `<button class="icon-btn comment-del-btn" data-id="${c.id}" style="font-size:0.75rem;width:28px;height:28px;flex-shrink:0"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </div>
          `).join('');
          listEl.querySelectorAll('.comment-del-btn').forEach(btn => { btn.addEventListener('click', async () => { try { const result = await Pt.removeComment(btn.dataset.id); btn.closest('.comment-item').remove(); UI.toast('Komentar dihapus', 'info'); const commentBtn = document.querySelector(`.comment-btn[data-post-id="${result.postId}"]`); if (commentBtn) { const span = commentBtn.querySelector('span'); if (span) { const current = parseInt(span.textContent) || 0; span.textContent = `${Math.max(0, current - 1)} komentar`; } } } catch { UI.toast('Gagal hapus komentar', 'error'); } }); });
        } catch { listEl.innerHTML = `<p style="color:var(--label-hard)">Gagal memuat komentar.</p>`; }
      }
      await loadComments();
      document.getElementById('comment-send')?.addEventListener('click', async () => {
        const text = input?.value.trim(); if (!text) return;
        if (Au.isGuest()) { UI.toast('Masuk dulu untuk berkomentar', 'warning'); return; }
        input.value = '';
        try { await Pt.addComment(post.id, text); await loadComments(); listEl.scrollTop = listEl.scrollHeight; const commentBtn = document.querySelector(`.comment-btn[data-post-id="${post.id}"]`); if (commentBtn) { const span = commentBtn.querySelector('span'); if (span) { const current = parseInt(span.textContent) || 0; span.textContent = `${current + 1} komentar`; } } } catch (err) { UI.toast('Gagal kirim: ' + err.message, 'error'); }
      });
      input?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('comment-send')?.click(); } });
    }, 80);
  }

  /* --- TRASH --- */
  async function _renderTrash() {
    const main = document.getElementById('app-main'); UI.setTitle('Sampah'); UI.setActiveNav('trash'); main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;
    let trashNotes;
    try { trashNotes = await N.getTrash(); } catch (err) { main.innerHTML = `<div class="trash-page page-enter"><div class="trash-header"><h2><i class="fa-solid fa-trash-can"></i> Sampah</h2></div><div class="empty-state" style="min-height:50vh"><i class="fa-solid fa-triangle-exclamation empty-icon" style="color:var(--label-medium)"></i><h3>Kolom deleted_at belum ada</h3><p>Jalankan migrasi SQL di Supabase terlebih dahulu.</p></div></div>`; return; }
    main.innerHTML = `
      <div class="trash-page page-enter">
        <div class="trash-header"><h2><i class="fa-solid fa-trash-can"></i> Sampah</h2>${trashNotes.length > 0 ? `<button class="btn-ghost" id="trash-empty-all" style="color:var(--label-hard)"><i class="fa-solid fa-broom"></i> Kosongkan</button>` : ''}</div>
        <p class="trash-info"><i class="fa-solid fa-circle-info"></i> Catatan di sini bisa dipulihkan atau dihapus permanen.</p>
        ${!trashNotes.length ? `<div class="empty-state" style="min-height:50vh"><i class="fa-solid fa-trash-can empty-icon" style="opacity:0.25"></i><h3>Sampah kosong</h3><p>Catatan yang dihapus akan muncul di sini</p></div>` : `<div class="trash-grid" id="trash-grid">${trashNotes.map(n => _buildTrashCard(n)).join('')}</div>`}
      </div>
    `;
    document.getElementById('trash-empty-all')?.addEventListener('click', async () => { const ok = await UI.confirm({ title: 'Kosongkan Sampah', message: `Hapus permanen ${trashNotes.length} catatan? Tidak bisa dibatalkan.`, okLabel: '<i class="fa-solid fa-broom"></i> Kosongkan', okClass: 'btn-primary' }); if (ok) { try { await Promise.all(trashNotes.map(n => N.permanentDelete(n.id))); UI.toast('Sampah dikosongkan', 'info'); _renderTrash(); } catch(err) { UI.toast('Gagal: ' + err.message, 'error'); } } });
    document.querySelectorAll('.trash-restore-btn').forEach(btn => { btn.addEventListener('click', async e => { e.stopPropagation(); try { await N.restore(btn.dataset.id); UI.toast('Catatan dipulihkan!', 'success'); _renderTrash(); } catch(err) { UI.toast('Gagal: ' + err.message, 'error'); } }); });
    document.querySelectorAll('.trash-delete-btn').forEach(btn => { btn.addEventListener('click', async e => { e.stopPropagation(); const ok = await UI.confirm({ title: 'Hapus Permanen', message: 'Catatan ini dihapus selamanya. Yakin?', okLabel: 'Hapus Permanen', okClass: 'btn-primary' }); if (ok) { try { await N.permanentDelete(btn.dataset.id); UI.toast('Dihapus permanen', 'info'); _renderTrash(); } catch(err) { UI.toast('Gagal: ' + err.message, 'error'); } } }); });
  }
  function _buildTrashCard(note) {
    const deletedDate = note.deletedAt ? new Date(note.deletedAt).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '-';
    return `<div class="trash-card"><div class="trash-card-body"><div class="trash-card-title">${_esc(note.title)}</div><div class="trash-card-meta"><i class="fa-solid fa-trash-can" style="font-size:0.6rem;opacity:0.5"></i> Dihapus ${deletedDate}</div></div><div class="trash-card-actions"><button class="btn-ghost trash-restore-btn" data-id="${note.id}" style="font-size:0.78rem;padding:0.3rem 0.7rem"><i class="fa-solid fa-rotate-left"></i> Pulihkan</button><button class="btn-ghost trash-delete-btn" data-id="${note.id}" style="font-size:0.78rem;padding:0.3rem 0.7rem;color:var(--label-hard);border-color:var(--label-hard)"><i class="fa-solid fa-trash"></i> Hapus</button></div></div>`;
  }

  /* --- TEMPLATES & NEW NOTE --- */
  const TEMPLATES = [
    { id: 'blank', icon: '<i class="fa-solid fa-note-sticky"></i>', label: 'Kosong', desc: 'Mulai dari awal', title: 'Catatan baru', content: '' },
    { id: 'meeting', icon: '<i class="fa-solid fa-users"></i>', label: 'Meeting Notes', desc: 'Peserta, agenda, & tindak lanjut', title: 'Meeting Notes', content: `<h2>🤝 Meeting Notes</h2>\n<p><strong>Tanggal:</strong> ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}</p>\n<p><strong>Peserta:</strong> </p>\n<h3>Agenda</h3><ul><li></li></ul>\n<h3>Catatan Diskusi</h3><p></p>\n<h3>Tindak Lanjut</h3><ul><li></li></ul>` },
    { id: 'journal', icon: '<i class="fa-solid fa-book-open"></i>', label: 'Jurnal Harian', desc: 'Refleksi & mood harian', title: `Jurnal - ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, content: `<h2>📖 Jurnal Harian</h2>\n<p><strong>Mood:</strong> 🌟</p>\n<h3>Hari ini aku...</h3><p></p>\n<h3>Hal yang aku syukuri</h3><ul><li></li><li></li></ul>\n<h3>Refleksi</h3><p></p>` },
    { id: 'todo', icon: '<i class="fa-solid fa-list-check"></i>', label: 'To-Do List', desc: 'Daftar tugas dengan checklist', title: 'To-Do List', content: `<h2>✅ To-Do List</h2>\n<div class="todo-item"><span class="todo-check"></span><span class="todo-text"> Tugas pertama</span></div>\n<div class="todo-item"><span class="todo-check"></span><span class="todo-text"> Tugas kedua</span></div>` },
    { id: 'brainstorm', icon: '<i class="fa-solid fa-lightbulb"></i>', label: 'Brainstorm', desc: 'Kumpulkan ide secara bebas', title: 'Brainstorm', content: `<h2>💡 Brainstorm</h2>\n<p><strong>Pertanyaan utama:</strong> </p>\n<h3>Ide-ide</h3><ul><li></li></ul>\n<h3>Pros</h3><ul><li></li></ul>\n<h3>Cons</h3><ul><li></li></ul>` },
  ];
  function _showTemplatePicker(onSelect) {
    UI.modal({ title: 'Pilih Template', body: `<div class="template-grid">${TEMPLATES.map(t => `<button class="template-option" data-tmpl="${t.id}"><span class="template-icon">${t.icon}</span><div class="template-info"><strong>${t.label}</strong><span>${t.desc}</span></div></button>`).join('')}</div>` });
    setTimeout(() => { document.querySelectorAll('.template-option').forEach(btn => { btn.addEventListener('click', () => { const tmpl = TEMPLATES.find(t => t.id === btn.dataset.tmpl); if (!tmpl) return; document.getElementById('modal-close')?.click(); onSelect(tmpl); }); }); }, 60);
  }
  async function _newNote() {
    _showTemplatePicker(async (tmpl) => {
      Rm.showTypePicker(async (type, deadline, reminderAt) => {
        try { const note = await N.create({ title: tmpl.title || 'Catatan baru', content: tmpl.content || '', label: 'medium', deadline: deadline || null, reminderAt: reminderAt || null }); R.go('edit/' + note.id); } catch(err) { UI.toast('Gagal membuat catatan: ' + err.message, 'error'); }
      });
    });
  }

  /* --- POMODORO TIMER DENGAN BACKGROUND SYNC --- */
  const _pomo = {
    phase:     'work',
    remaining: 25 * 60,
    running:   false,
    session:   0,
    timer:     null,
    visible:   false,
    expanded:  false,
    targetTime: 0,
    WORK:      25 * 60,
    SHORT:      5 * 60,
    LONG:      15 * 60,
  };

  function _cancelNativePomo() {
    if (window.Capacitor?.isNativePlatform && window.Capacitor?.Plugins?.LocalNotifications) {
      window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: 999999 }] }).catch(()=>{});
    }
  }

  function _initPomodoro() {
    const widget = document.getElementById('pomodoro-widget');
    if (!widget) return;

    function _fmt(s) {
      const m = Math.floor(s / 60).toString().padStart(2, '0');
      const sec = (s % 60).toString().padStart(2, '0');
      return `${m}:${sec}`;
    }

    function _render() {
      const collapsed = document.getElementById('pomo-collapsed');
      const expanded  = document.getElementById('pomo-expanded');
      if (!collapsed || !expanded) return;

      widget.style.display = _pomo.visible ? 'flex' : 'none';
      collapsed.style.display = _pomo.expanded ? 'none' : 'flex';
      expanded.style.display  = _pomo.expanded ? 'block' : 'none';

      const timeStr    = _fmt(_pomo.remaining);
      const phaseLabel = _pomo.phase === 'work' ? 'KERJA' : _pomo.phase === 'break' ? 'ISTIRAHAT' : 'ISTIRAHAT PANJANG';
      const icon       = _pomo.phase === 'work' ? '<i class="fa-solid fa-laptop"></i>' : '<i class="fa-solid fa-mug-hot"></i>';

      document.getElementById('pomo-time-mini').textContent  = timeStr;
      document.getElementById('pomo-time-big').textContent   = timeStr;
      document.getElementById('pomo-phase-label').textContent = phaseLabel;
      document.getElementById('pomo-session-label').textContent = `Sesi ${_pomo.session + 1} / 4`;

      const playBtn = document.getElementById('pomo-play');
      if (playBtn) playBtn.innerHTML = _pomo.running ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';

      const dots = document.querySelectorAll('.pomo-dot');
      dots.forEach((dot, i) => {
        dot.classList.remove('done', 'current');
        if (i < _pomo.session) dot.classList.add('done');
        else if (i === _pomo.session && _pomo.phase === 'work') dot.classList.add('current');
      });

      document.getElementById('pomo-icon-mini').innerHTML = icon;
    }

    function _nextPhase() {
      _cancelNativePomo(); // Hapus notif native agar tidak ganda saat app dibuka
      _pomo.running = false;
      clearInterval(_pomo.timer);
      _pomo.timer = null;

      if (_pomo.phase === 'work') {
        _pomo.session++;
        if (_pomo.session >= 4) {
          _pomo.phase = 'long-break'; _pomo.remaining = _pomo.LONG; _pomo.session = 0;
        } else {
          _pomo.phase = 'break'; _pomo.remaining = _pomo.SHORT;
        }
      } else {
        _pomo.phase = 'work'; _pomo.remaining = _pomo.WORK;
      }

      // Web notification (kalau di browser)
      if (!window.Capacitor?.isNativePlatform && Rm.hasPermission()) {
        const msg = _pomo.phase === 'work' ? 'Saatnya fokus kerja kembali! 💪' : 'Waktunya istirahat! ☕';
        Rm.fireImmediate('Notara Pomodoro', msg, 'pomo_timer');
      }

      UI.toast(_pomo.phase === 'work' ? '<i class="fa-solid fa-laptop"></i> Istirahat selesai - ayo kerja lagi!' : '<i class="fa-solid fa-mug-hot"></i> Sesi selesai - istirahat sejenak!', 'info', 4000);
      _render();
    }

    function _tick() {
      // Background Sync: Kalkulasi sisa waktu berdasarkan Date nyata, bukan sekadar counter.
      _pomo.remaining = Math.max(0, Math.ceil((_pomo.targetTime - Date.now()) / 1000));
      if (_pomo.remaining <= 0) { _nextPhase(); return; }
      _render();
    }

    function _toggle() {
      if (_pomo.running) {
        clearInterval(_pomo.timer);
        _pomo.timer   = null;
        _pomo.running = false;
        _cancelNativePomo();
      } else {
        _pomo.targetTime = Date.now() + (_pomo.remaining * 1000);
        _pomo.timer   = setInterval(_tick, 1000);
        _pomo.running = true;

        // Jadwalkan notifikasi Native Android agar bunyi meski layar mati
        if (window.Capacitor?.isNativePlatform && window.Capacitor?.Plugins?.LocalNotifications && Rm.hasPermission()) {
            const msg = _pomo.phase === 'work' ? 'Waktunya istirahat! ☕' : 'Saatnya fokus kerja kembali! 💪';
            window.Capacitor.Plugins.LocalNotifications.schedule({
                notifications: [{
                    id: 999999, // ID khusus timer pomodoro
                    title: 'Notara Pomodoro',
                    body: msg,
                    schedule: { at: new Date(_pomo.targetTime) }
                }]
            });
        }
      }
      _render();
    }

    function _reset() {
      _cancelNativePomo();
      clearInterval(_pomo.timer);
      _pomo.timer     = null;
      _pomo.running   = false;
      _pomo.phase     = 'work';
      _pomo.remaining = _pomo.WORK;
      _pomo.session   = 0;
      _render();
    }

    function _skip() {
      _cancelNativePomo();
      clearInterval(_pomo.timer);
      _pomo.timer     = null;
      _pomo.remaining = 0;
      _nextPhase();
    }

    window._pomoToggleVisible = () => { _pomo.visible = !_pomo.visible; _pomo.expanded = _pomo.visible; _render(); };
    document.getElementById('pomo-collapsed')?.addEventListener('click', () => { _pomo.expanded = true; _render(); });
    document.getElementById('pomo-close')?.addEventListener('click', e => { e.stopPropagation(); _pomo.visible = false; _render(); });
    document.getElementById('pomo-collapse')?.addEventListener('click', e => { e.stopPropagation(); _pomo.expanded = false; _render(); });
    document.getElementById('pomo-play')?.addEventListener('click', e => { e.stopPropagation(); _toggle(); });
    document.getElementById('pomo-reset')?.addEventListener('click', e => { e.stopPropagation(); _reset(); });
    document.getElementById('pomo-skip')?.addEventListener('click',  e => { e.stopPropagation(); _skip();  });
    document.getElementById('pomo-mini-play')?.addEventListener('click', e => { e.stopPropagation(); _toggle(); });

    _render();
  }

  /* --- KEYBOARD SHORTCUTS --- */
  function _initKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      const isTyping = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (e.key === '?' && !isTyping && !e.ctrlKey && !e.metaKey) { _showShortcutHelp(); return; }
      if (e.ctrlKey || e.metaKey) {
        switch(e.key) { case 'n': e.preventDefault(); _newNote(); break; case 'k': e.preventDefault(); _openCommandPalette(); break; case 'f': if (!isTyping) { e.preventDefault(); R.go('search'); } break; case ',': e.preventDefault(); R.go('settings'); break; case 'h': e.preventDefault(); R.go('home'); break; }
      }
    });
  }

  /* --- COMMAND PALETTE (Ctrl+K) --- */
  function _openCommandPalette() {
    document.getElementById('cmd-palette-overlay')?.remove();
    const overlay = document.createElement('div'); overlay.id = 'cmd-palette-overlay'; overlay.className = 'cmd-palette-overlay';
    overlay.innerHTML = `<div class="cmd-palette" id="cmd-palette"><div class="cmd-palette-input-wrap"><i class="fa-solid fa-magnifying-glass cmd-palette-icon"></i><input class="cmd-palette-input" id="cmd-palette-input" placeholder="Cari catatan, halaman, atau aksi..." autocomplete="off" spellcheck="false"><kbd class="cmd-palette-esc">Esc</kbd></div><div class="cmd-palette-results" id="cmd-palette-results"></div></div>`;
    document.body.appendChild(overlay);
    const input = document.getElementById('cmd-palette-input'); const results = document.getElementById('cmd-palette-results'); let _idx = -1;
    const STATIC_CMDS = [
      { type: 'action', icon: '<i class="fa-solid fa-plus"></i>', label: 'Catatan Baru', sub: 'Ctrl+N', fn: _newNote },
      { type: 'action', icon: '<i class="fa-solid fa-house"></i>', label: 'Beranda', sub: 'Ctrl+H', fn: () => R.go('home') },
      { type: 'action', icon: '<i class="fa-solid fa-magnifying-glass"></i>', label: 'Cari', sub: 'Ctrl+F', fn: () => R.go('search') },
      { type: 'action', icon: '<i class="fa-regular fa-clock"></i>', label: 'Timeline', sub: '', fn: () => R.go('timeline') },
      { type: 'action', icon: '<i class="fa-solid fa-tags"></i>', label: 'Tag', sub: '', fn: () => R.go('tags') },
      { type: 'action', icon: '<i class="fa-solid fa-quote-left"></i>', label: 'Publikasi', sub: '', fn: () => R.go('posts') },
      { type: 'action', icon: '<i class="fa-solid fa-trash-can"></i>', label: 'Sampah', sub: '', fn: () => R.go('trash') },
      { type: 'action', icon: '<i class="fa-solid fa-gear"></i>', label: 'Pengaturan', sub: 'Ctrl+,', fn: () => R.go('settings') },
      { type: 'action', icon: '<i class="fa-solid fa-clock"></i>', label: 'Pomodoro Timer', sub: '', fn: () => window._pomoToggleVisible?.() },
      { type: 'action', icon: '<i class="fa-solid fa-keyboard"></i>', label: 'Keyboard Shortcuts', sub: '?', fn: _showShortcutHelp },
    ];
    let _allNotes = [];
    async function _load() { try { _allNotes = await N.getAll(); } catch {} _render(); }
    function _render() {
      const q = input?.value.trim().toLowerCase() || ''; let items = [];
      const cmds = q ? STATIC_CMDS.filter(c => c.label.toLowerCase().includes(q)) : STATIC_CMDS; items = [...cmds];
      const noteMatches = _allNotes.filter(n => !q || n.title.toLowerCase().includes(q) || UI.stripHtml(n.content).toLowerCase().includes(q)).slice(0, 6);
      noteMatches.forEach(n => items.push({ type: 'note', icon: '<i class="fa-solid fa-note-sticky"></i>', label: n.title, sub: UI.formatDate(n.updatedAt), fn: () => R.go('read/' + n.id) }));
      if (!items.length) { results.innerHTML = `<div class="cmd-empty"><i class="fa-solid fa-face-sad-tear"></i> Tidak ada hasil</div>`; _idx = -1; return; }
      results.innerHTML = items.map((item, i) => `<div class="cmd-item${i === 0 ? ' active' : ''}" data-i="${i}"><span class="cmd-item-icon ${item.type === 'note' ? 'note' : ''}">${item.icon}</span><span class="cmd-item-label">${_esc(item.label)}</span>${item.sub ? `<span class="cmd-item-sub">${item.sub}</span>` : ''}</div>`).join('');
      _idx = 0; results.querySelectorAll('.cmd-item').forEach((el, i) => { el.addEventListener('mouseenter', () => { results.querySelectorAll('.cmd-item').forEach(x => x.classList.remove('active')); el.classList.add('active'); _idx = i; }); el.addEventListener('click', () => { _close(); items[i].fn(); }); });
    }
    function _move(dir) { const els = results.querySelectorAll('.cmd-item'); if (!els.length) return; els[_idx]?.classList.remove('active'); _idx = (_idx + dir + els.length) % els.length; els[_idx]?.classList.add('active'); els[_idx]?.scrollIntoView({ block: 'nearest' }); }
    function _run() { const els = results.querySelectorAll('.cmd-item'); els[_idx]?.click(); }
    function _close() { overlay.remove(); }
    input?.addEventListener('input', _render); input?.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); _move(1); } if (e.key === 'ArrowUp') { e.preventDefault(); _move(-1); } if (e.key === 'Enter') { e.preventDefault(); _run(); } if (e.key === 'Escape') { _close(); } }); overlay.addEventListener('click', e => { if (e.target === overlay) _close(); }); document.addEventListener('keydown', function closeOnEsc(e) { if (e.key === 'Escape') { _close(); document.removeEventListener('keydown', closeOnEsc); } });
    _load(); setTimeout(() => input?.focus(), 30);
  }

  function _showShortcutHelp() {
    UI.modal({ title: '<i class="fa-solid fa-keyboard"></i> Keyboard Shortcuts', body: `<div class="shortcut-list">${[['Ctrl + N', 'Catatan baru'],['Ctrl + K', 'Command palette'],['Ctrl + F', 'Cari catatan'],['Ctrl + S', 'Simpan (di editor)'],['Ctrl + H', 'Ke Beranda'],['Ctrl + ,', 'Ke Pengaturan'],['Ctrl + B', 'Bold (di editor)'],['Ctrl + I', 'Italic (di editor)'],['Ctrl + L', 'Tambah checklist (di editor)'],['F11', 'Zen Mode (di editor)'],['?', 'Tampilkan bantuan ini']].map(([k, v]) => `<div class="shortcut-row"><span class="shortcut-keys">${k.split(' + ').map(p => `<kbd>${p}</kbd>`).join('<span class="shortcut-plus">+</span>')}</span><span class="shortcut-desc">${v}</span></div>`).join('')}</div>` });
  }

  /* --- UTILITIES --- */
  function _esc(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _initials(name) { if (!name) return '?'; return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }
  function _relativeTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'Baru saja'; if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`; if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`; return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  /* --- MOUNT APP --- */
  function _mountApp() {
    document.body.innerHTML = `
      <div id="app">
        <!-- SIDEBAR -->
        <aside id="sidebar" class="sidebar" role="navigation" aria-label="Navigasi utama">
          <div class="sidebar-drag-handle" aria-hidden="true"></div>
          <div class="sidebar-header">
            <div class="logo"><img src="ikon-non-transparant.png" alt="" class="logo-icon" width="24" height="24" aria-hidden="true"><span class="logo-text">Notara</span></div>
            <button id="sidebar-close" class="icon-btn sidebar-close-btn" aria-label="Tutup sidebar"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-section-label">Navigasi</div>
            <a href="#home" class="nav-item active" data-page="home"><span class="nav-icon"><i class="fa-solid fa-house"></i></span><span class="nav-label">Beranda</span></a>
            <a href="#search" class="nav-item" data-page="search"><span class="nav-icon"><i class="fa-solid fa-magnifying-glass"></i></span><span class="nav-label">Cari</span></a>
            <div class="nav-section-label">Konten</div>
            <a href="#timeline" class="nav-item" data-page="timeline"><span class="nav-icon"><i class="fa-regular fa-clock"></i></span><span class="nav-label">Timeline</span></a>
            <a href="#posts" class="nav-item" data-page="posts"><span class="nav-icon"><i class="fa-solid fa-quote-left"></i></span><span class="nav-label">Publikasi</span></a>
            <div class="nav-section-label">Pelacakan</div>
            <a href="#mood" class="nav-item" data-page="mood"><span class="nav-icon"><i class="ph ph-smiley" style="font-size:1rem"></i></span><span class="nav-label">Perasaan</span></a>
            <a href="#habits" class="nav-item" data-page="habits"><span class="nav-icon"><i class="ph ph-check-circle" style="font-size:1rem"></i></span><span class="nav-label">Kebiasaan</span></a>
            <a href="#finance" class="nav-item" data-page="finance"><span class="nav-icon"><i class="ph ph-wallet" style="font-size:1rem"></i></span><span class="nav-label">Keuangan</span></a>
            <div class="nav-section-label">Lainnya</div>
            <a href="#tags" class="nav-item" data-page="tags"><span class="nav-icon"><i class="fa-solid fa-tags"></i></span><span class="nav-label">Tag</span></a>
            <a href="#messages" class="nav-item" data-page="messages"><span class="nav-icon"><i class="fa-solid fa-envelope"></i></span><span class="nav-label">Pesan</span></a>
            <a href="#trash" class="nav-item" data-page="trash"><span class="nav-icon"><i class="fa-solid fa-trash-can"></i></span><span class="nav-label">Sampah</span></a>
            <div class="nav-section-label">Sistem</div>
            <a href="#settings" class="nav-item" data-page="settings"><span class="nav-icon"><i class="fa-solid fa-gear"></i></span><span class="nav-label">Pengaturan</span></a>
          </nav>
          <div class="sidebar-footer">
            <div class="storage-indicator" title="Jumlah catatan"><div class="storage-bar"><div class="storage-fill" id="storage-fill"></div></div><span class="storage-label" id="storage-label">0 catatan</span></div>
          </div>
        </aside>
        <div id="sidebar-overlay" class="sidebar-overlay" role="presentation"></div>
        <div id="app-wrapper" class="app-wrapper">
          <header class="topbar" id="topbar" role="banner">
            <button id="menu-btn" class="icon-btn menu-btn topbar-normal-item" aria-label="Buka menu"><i class="fa-solid fa-bars"></i></button>
            <div class="topbar-title topbar-normal-item" id="topbar-title" aria-live="polite">Beranda</div>
            <div class="topbar-actions topbar-normal-item">
              <span class="offline-badge" id="offline-badge"><i class="fa-solid fa-wifi-slash"></i> Offline</span>
              <button id="pomo-toggle-btn" class="icon-btn" title="Pomodoro Timer" aria-label="Pomodoro timer"><i class="fa-solid fa-clock"></i></button>
              <button id="shortcut-help-btn" class="icon-btn" title="Keyboard Shortcuts (?)" aria-label="Bantuan shortcut"><i class="fa-solid fa-keyboard"></i></button>
              <button id="theme-toggle" class="icon-btn" title="Ganti tema" aria-label="Ganti tema"><i class="fa-solid fa-circle-half-stroke"></i></button>
              <button id="new-note-btn" class="btn-primary new-note-btn" aria-label="Catatan baru" title="Catatan baru (Ctrl+N)"><i class="fa-solid fa-plus"></i></button>
            </div>
            <div class="topbar-ms-bar" id="topbar-ms-bar" style="display:none"></div>
            <div class="topbar-editor-bar" id="topbar-editor-bar" style="display:none">
              <button class="icon-btn" id="editor-back" title="Kembali"><i class="fa-solid fa-arrow-left"></i></button>
              <span class="editor-wordcount" id="editor-wordcount" style="flex:1;text-align:center;font-size:0.8rem;font-weight:700;color:var(--text-2)"></span>
              <span class="editor-status" id="editor-status" style="font-size:0.7rem;font-weight:700"></span>
              <button class="icon-btn" id="editor-version-btn" title="Riwayat Versi"><i class="fa-solid fa-clock-rotate-left"></i></button>
              <button class="icon-btn" id="editor-zen-btn" title="Zen Mode (F11)"><i class="fa-solid fa-expand"></i></button>
            </div>
            <div class="topbar-reader-bar" id="topbar-reader-bar" style="display:none"></div>
          </header>
          <main id="app-main" class="app-main" role="main"><div class="page-loading"><div class="loader-ring"></div></div></main>
        </div>
      </div>
      <div id="action-popup" class="action-popup" role="dialog" aria-label="Aksi catatan" aria-hidden="true"><div class="action-popup-inner"><div class="action-popup-title" id="action-popup-title"></div><div class="action-popup-items" id="action-popup-items" role="list"></div></div></div>
      <div id="cal-add-sheet" class="action-popup" role="dialog" aria-label="Tambah Pengingat" aria-hidden="true"><div class="action-popup-inner"><div class="action-popup-title" style="display:flex;align-items:center;justify-content:space-between"><span><i class="fa-solid fa-bell"></i> Tambah Pengingat</span><button class="icon-btn" id="cal-sheet-close" style="width:24px;height:24px;font-size:0.7rem"><i class="fa-solid fa-xmark"></i></button></div><div class="action-popup-items" id="cal-add-sheet-body"></div></div></div>
      <div id="toast-container" class="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>
      <div id="modal-overlay" class="modal-overlay" role="dialog" aria-modal="true" aria-hidden="true"><div class="modal" id="modal"><div class="modal-header"><h3 id="modal-title"></h3><button id="modal-close" class="icon-btn" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body" id="modal-body"></div><div class="modal-footer" id="modal-footer"></div></div></div>
      <div id="pomodoro-widget" class="pomodoro-widget" style="display:none">
        <div id="pomo-collapsed" class="pomo-collapsed"><span id="pomo-icon-mini"><i class="fa-solid fa-laptop"></i></span><span id="pomo-time-mini" class="pomo-time-text">25:00</span><button id="pomo-mini-play" class="pomo-mini-play"><i class="fa-solid fa-play"></i></button></div>
        <div id="pomo-expanded" class="pomo-expanded" style="display:none">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm)"><span class="pomo-phase-label" id="pomo-phase-label">KERJA</span><div style="display:flex;gap:4px"><button id="pomo-collapse" class="icon-btn" style="width:26px;height:26px;font-size:0.7rem" title="Sembunyikan"><i class="fa-solid fa-chevron-down"></i></button><button id="pomo-close" class="icon-btn" style="width:26px;height:26px;font-size:0.7rem" title="Tutup"><i class="fa-solid fa-xmark"></i></button></div></div>
          <div class="pomo-big-time" id="pomo-time-big">25:00</div>
          <div class="pomo-session-label" id="pomo-session-label">Sesi 1 / 4</div>
          <div class="pomo-dot-row"><div class="pomo-dot current"></div><div class="pomo-dot"></div><div class="pomo-dot"></div><div class="pomo-dot"></div></div>
          <div class="pomo-controls"><button id="pomo-reset" class="pomo-btn pomo-btn-ghost" title="Reset"><i class="fa-solid fa-rotate-left"></i></button><button id="pomo-play" class="pomo-btn pomo-btn-primary" title="Play/Pause"><i class="fa-solid fa-play"></i></button><button id="pomo-skip" class="pomo-btn pomo-btn-ghost" title="Skip fase"><i class="fa-solid fa-forward-step"></i></button></div>
        </div>
      </div>
      <nav class="mobile-bottom-nav" id="mobile-bottom-nav" role="navigation" aria-label="Navigasi bawah"><button id="mobile-pomo-btn" class="mobile-nav-btn" aria-label="Pomodoro Timer" title="Pomodoro Timer"><i class="fa-solid fa-clock"></i><span>Pomodoro</span></button><button id="mobile-newnote-btn" class="mobile-nav-btn mobile-nav-newnote" aria-label="Catatan Baru" title="Catatan Baru"><i class="fa-solid fa-plus"></i><span>Catatan Baru</span></button><button id="mobile-menu-btn" class="mobile-nav-btn mobile-nav-menu" aria-label="Buka Menu" title="Menu"><i class="fa-solid fa-bars"></i><span>Menu</span></button></nav>

    `;

    S.init(); const sidebarCtrl = UI.initSidebar();
    document.getElementById('theme-toggle')?.addEventListener('click', S.cycleTheme);
    document.getElementById('new-note-btn')?.addEventListener('click', _newNote);
    document.getElementById('shortcut-help-btn')?.addEventListener('click', _showShortcutHelp);
    document.getElementById('pomo-toggle-btn')?.addEventListener('click', () => { if (window._pomoToggleVisible) window._pomoToggleVisible(); });
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => { sidebarCtrl?.toggle(); });
    document.getElementById('mobile-pomo-btn')?.addEventListener('click', () => { if (window._pomoToggleVisible) window._pomoToggleVisible(); });
    document.getElementById('mobile-newnote-btn')?.addEventListener('click', _newNote);

    _initKeyboardShortcuts();
    _initPomodoro();
    _initOfflineListener();
    if (window.Notara.CSPanel) window.Notara.CSPanel.initShortcutListener();

    R.on('home',     () => { UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); _renderHome(); });
    R.on('read/:id', p  => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _renderRead(p.id); });
    R.on('edit/:id', p  => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); Ed.mount(p.id); UI.setTitle('Edit'); UI.setActiveNav('home'); });
    R.on('new',      () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); _newNote(); });
    R.on('search',   () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); _renderSearch(); });
    R.on('timeline', () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); _renderTimeline(); });
    R.on('tags',     () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); _renderTags(); });
    R.on('posts',    () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); _renderPosts(); });
    R.on('trash',    () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); _renderTrash(); });
    R.on('settings', () => { UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); S.renderPage(); });
    R.on('mood',     () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); window.Notara.MoodTracker.renderPage(); });
    R.on('habits',   () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); window.Notara.HabitTracker.renderPage(); });
    R.on('finance',  () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); window.Notara.FinanceTracker.renderPage(); });
    R.on('messages', () => { _exitMultiSelect(); UI.closePopup(); Ed.unmount(); _restoreTopbarFromReader(); window.Notara.Messages.renderInbox(); });

    N.onChange(() => UI.updateStorageIndicator());
    Rm.start();

    window.addEventListener('hashchange', () => {
      const main = document.getElementById('app-main');
      if (main) main.scrollTop = 0;
    });

    if (window.Notara.UpdateChecker) {
      window.Notara.UpdateChecker.checkForUpdate(true);
      window.Notara.UpdateChecker.startRealtime();
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => { const nw = reg.installing; nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) nw.postMessage('skipWaiting'); }); });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
      }).catch(e => console.warn('[Notara] SW error', e));
      let _swRefreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (_swRefreshing) return; _swRefreshing = true; window.location.reload(); });
    }
    R.init(); UI.updateStorageIndicator(); _initSwipeGesture(); _initOnlineSync();
  }

  function _initOfflineListener() {
    const badge = document.getElementById('offline-badge');
    const update = () => { if (badge) badge.classList.toggle('visible', !navigator.onLine); };
    window.addEventListener('online', () => { update(); window.Notara.Data.sync.full().catch(() => {}); });
    window.addEventListener('offline', update);
    update();
  }

  function _initOnlineSync() {
    setInterval(() => { if (navigator.onLine && window.Notara.Auth?.isLoggedIn()) window.Notara.Data.sync.full().catch(() => {}); }, 30000);
  }

  function _initSwipeGesture() {
    const main = document.getElementById('app-main'); let startX = 0;
    main?.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    main?.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - startX; if (dx > 80 && startX < 50) R.back(); }, { passive: true });
  }

  let _appMounted = false;
  async function init() { S.init(); await window.Notara.IDB.init(); await Au.init(loggedIn => { if (loggedIn || Au.isGuest()) { _resetAppState(); if (!_appMounted) { _appMounted = true; _mountApp(); } if (Au.isGuest()) _applyGuestMode(); window.Notara.Data.sync.full().catch(() => {}); } else { _appMounted = false; _resetAppState(); if (window.Notara.UpdateChecker) window.Notara.UpdateChecker.stopRealtime(); Au.renderAuthPage(); } }); }

  function _applyGuestMode() {
    document.querySelectorAll('.nav-item[data-page="posts"], .nav-item[data-page="messages"]').forEach(el => {
      el.style.opacity = '0.45';
      el.title = 'Fitur ini memerlukan akun';
    });
    if (!document.getElementById('guest-banner')) {
      document.querySelectorAll('.nav-section-label').forEach(el => {
        if (el.textContent === 'Lainnya') {
          el.insertAdjacentHTML('afterend', '<div class="guest-banner" id="guest-banner"><i class="fa-solid fa-user-secret"></i><span>Mode Tamu — data tersimpan lokal</span><button class="btn-xs btn-accent" id="guest-login-btn">Masuk</button></div>');
        }
      });
      setTimeout(() => {
        document.getElementById('guest-login-btn')?.addEventListener('click', () => { Au.exitGuestMode(); window.Notara.Guest.clearGuestData(); Au.renderAuthPage(); });
      }, 100);
    }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }

  console.log('%c ____  _   _    _    _   _ _____ __  __    _    _   _ ', 'color:#7B2D8E;font-weight:bold');
  console.log('%c/ ___|| | | |  / \\  | \\ | |_   _|  \\/  |  / \\  | \\ | |', 'color:#7B2D8E;font-weight:bold');
  console.log('%c\\___ \\| |_| | / _ \\ |  \\| | | | | |\\/| | / _ \\ |  \\| |', 'color:#E84855;font-weight:bold');
  console.log('%c ___) |  _  |/ ___ \\| |\\  | | | | |  | |/ ___ \\| |\\  |', 'color:#E84855;font-weight:bold');
  console.log('%c|____/|_| |_/_/   \\_\\_| \\_| |_| |_|  |_/_/   \\_\\_| \\_|', 'color:#E84855;font-weight:bold');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color:#50546a');
  console.log('%c  hayo mau ngapain? 👀', 'color:#eab308;font-size:14px;font-weight:bold');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color:#50546a');
})();