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
  // Supabase CRUD
  const db = () => window.Notara.db;
  async function _fetchGroups() {
    const { data, error } = await db()
      .from('note_groups')
      .select('*')
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

  /*
   * Home data cache
   * Stores last-rendered home data so we can re-paint instantly
   * without a spinner while fresh data loads in the background.
   */
  let _homeCache = null; // { allNotes, priority, groups, tagsMap }

  function _toggleMultiSelect() {
    _multiSelect = !_multiSelect;
    _selectedIds.clear();
    document.getElementById('app')?.setAttribute('data-multiselect', _multiSelect ? 'true' : 'false');
    _renderHome();
  }

  function _toggleNoteSelect(id) {
    if (_selectedIds.has(id)) _selectedIds.delete(id);
    else _selectedIds.add(id);
    _refreshSelectionUI();
  }

  async function _refreshSelectionUI() {
    const count = _selectedIds.size;
    const bar   = document.getElementById('multi-select-bar');
    if (!bar) return;

    // Use cached groups - no extra DB round-trip
    const existingGroups = _homeCache?.groups || [];
    bar.innerHTML = _buildMultiBar(count, existingGroups);
    _bindMultiBar(existingGroups);

    document.querySelectorAll('.note-card').forEach(card => {
      const id = card.dataset.id;
      card.classList.toggle('ms-selected', _selectedIds.has(id));
    });
    document.querySelectorAll('.flipcard-wrap').forEach(wrap => {
      wrap.classList.toggle('ms-selected', _selectedIds.has(wrap.dataset.id));
    });
  }

  function _buildMultiBar(count, existingGroups = []) {
    const hasGroups = existingGroups.length > 0;
    return `
      <span class="ms-count">${count} dipilih</span>
      ${count >= 2 ? `
        <button class="btn-primary" id="ms-group-btn" style="font-size:0.8rem;padding:0.4rem 0.9rem">
          <i class="fa-solid fa-layer-group"></i> Buat Grup
        </button>
        ${hasGroups ? `
          <button class="btn-ghost" id="ms-addto-btn" style="font-size:0.8rem;padding:0.4rem 0.9rem">
            <i class="fa-solid fa-plus"></i> Masukkan ke Grup
          </button>
        ` : ''}
      ` : ''}
      <button class="btn-ghost" id="ms-cancel-btn" style="font-size:0.8rem;padding:0.4rem 0.9rem">
        Batal
      </button>
    `;
  }

  function _bindMultiBar(existingGroups = []) {
    document.getElementById('ms-group-btn')?.addEventListener('click', () => _createGroup());
    document.getElementById('ms-addto-btn')?.addEventListener('click', () => _showAddToGroupPicker(existingGroups));
    document.getElementById('ms-cancel-btn')?.addEventListener('click', _toggleMultiSelect);
  }

  /* Buat grup baru */
  function _createGroup() {
    if (_selectedIds.size < 2) { UI.toast('Pilih minimal 2 catatan', 'warning'); return; }
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

      document.getElementById('group-cancel')?.addEventListener('click', () =>
        document.getElementById('modal-close')?.click());

      document.getElementById('group-create')?.addEventListener('click', async () => {
        const name = input?.value.trim();
        if (!name) { document.getElementById('group-name-error').textContent = 'Nama grup wajib diisi.'; return; }
        const btn = document.getElementById('group-create');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
        try {
          await _createGroupInDb(name, [..._selectedIds]);
          document.getElementById('modal-close')?.click();
          _multiSelect = false;
          _selectedIds.clear();
          UI.toast(`Grup "${name}" dibuat!`, 'success');
          _renderHome();
        } catch (err) {
          document.getElementById('group-name-error').textContent = 'Gagal menyimpan: ' + err.message;
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Buat';
        }
      });

      // Enter key submit
      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('group-create')?.click();
      });
    }, 60);
  }

  /* Masukkan ke grup yang sudah ada */
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
              <span class="template-icon">
                <i class="fa-solid fa-layer-group"></i>
              </span>
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
      document.getElementById('addto-cancel')?.addEventListener('click', () =>
        document.getElementById('modal-close')?.click());

      document.querySelectorAll('.group-target-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const gid = btn.dataset.gid;
          const targetGroup = groups.find(g => g.id === gid);
          if (!targetGroup) return;

          btn.disabled = true;
          btn.innerHTML = btn.innerHTML.replace('fa-chevron-right', 'fa-spinner fa-spin');
          try {
            // Merge note_ids, deduplicate
            const merged = [...new Set([...targetGroup.note_ids, ..._selectedIds])];
            await _updateGroupInDb(gid, { note_ids: merged });
            document.getElementById('modal-close')?.click();
            _multiSelect = false;
            _selectedIds.clear();
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

  /* Hapus grup (bukan catatan) */
  async function _deleteGroup(gId) {
    try {
      await _deleteGroupInDb(gId);
      if (_homeCache?.groups) _homeCache.groups = _homeCache.groups.filter(g => g.id !== gId);
      _renderHome();
    } catch (err) {
      UI.toast('Gagal hapus grup: ' + err.message, 'error');
    }
  }

  /* Toggle collapse grup */
  async function _toggleGroupCollapse(gId, currentCollapsed) {
    try {
      // Optimistic DOM update first - instant, no spinner
      const newCollapsed = !currentCollapsed;
      const groupCard = document.querySelector(`.note-group-card[data-gid="${gId}"]`);

      if (groupCard) {
        const body       = groupCard.querySelector('.note-group-body');
        const toggleBtn  = groupCard.querySelector(`.group-toggle-btn[data-gid="${gId}"]`);
        const icon       = toggleBtn?.querySelector('i');

        if (newCollapsed) {
          body?.remove();
        } else {
          // Re-build body from home cache
          const allNotes = _homeCache?.allNotes || [];
          const tagsMap  = _homeCache?.tagsMap  || {};
          const groups   = _homeCache?.groups   || [];
          const group    = groups.find(g => g.id === gId);

          if (group && !body) {
            const memberNotes = allNotes.filter(n => group.note_ids.includes(n.id));
            const bodyEl = document.createElement('div');
            bodyEl.className = 'note-group-body';
            bodyEl.innerHTML = `<div class="notes-grid" style="margin:0">
              ${memberNotes.map(n => _buildGroupNoteCard(n, tagsMap[n.id] || [], gId)).join('')}
            </div>`;
            groupCard.appendChild(bodyEl);
            // Re-bind note cards inside the newly rendered body
            _bindGroupCardEvents(bodyEl, groups);
          }
        }
        if (toggleBtn) toggleBtn.dataset.collapsed = String(newCollapsed);
        if (icon) icon.className = `fa-solid fa-chevron-${newCollapsed ? 'down' : 'up'}`;
        if (toggleBtn) toggleBtn.title = newCollapsed ? 'Buka' : 'Tutup';
      }

      // Persist to DB in background
      await _updateGroupInDb(gId, { collapsed: newCollapsed });
      // Sync cache
      if (_homeCache?.groups) {
        const g = _homeCache.groups.find(g => g.id === gId);
        if (g) g.collapsed = newCollapsed;
      }
    } catch (err) {
      UI.toast('Gagal: ' + err.message, 'error');
    }
  }

  /* Keluarkan satu catatan dari grup */
  async function _removeNoteFromGroup(gId, noteId, groups) {
    try {
      const group = groups.find(g => g.id === gId);
      if (!group) return;
      const newIds = group.note_ids.filter(id => id !== noteId);
      if (newIds.length === 0) {
        // Grup kosong -> hapus grup
        await _deleteGroupInDb(gId);
        UI.toast('Grup dihapus karena sudah kosong', 'info');
      } else {
        await _updateGroupInDb(gId, { note_ids: newIds });
      }
      _renderHome();
    } catch (err) {
      UI.toast('Gagal: ' + err.message, 'error');
    }
  }

  /* Bind events for note cards inside groups */
  function _bindGroupCardEvents(container, groups) {
    container.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.group-remove-note-btn')) return;
        R.go('read/' + card.dataset.id);
      });
      card.addEventListener('mouseenter', () => {
        card.querySelector('.group-remove-note-btn')?.style.setProperty('opacity', '1');
      });
      card.addEventListener('mouseleave', () => {
        card.querySelector('.group-remove-note-btn')?.style.setProperty('opacity', '0');
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

    container.querySelectorAll('.group-toggle-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const gId       = btn.dataset.gid;
        const collapsed = btn.dataset.collapsed === 'true';
        _toggleGroupCollapse(gId, collapsed);
      });
    });

    container.querySelectorAll('.group-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await UI.confirm({
          title: 'Hapus Grup',
          message: 'Hanya grup yang dihapus, catatannya tetap ada.',
          okLabel: 'Hapus Grup',
          okClass: 'btn-primary',
        });
        if (ok) _deleteGroup(btn.dataset.gid);
      });
    });
  }

  /*
   * Context-aware view refresh
   * After quick actions (pin, fav, label...) patch only the
   * affected card in the DOM -> instant, no full re-render, no spinner.
   */
  async function _refreshCurrentView(noteId) {
    const current = R.current();
    const params  = R.params();

    if (current === 'read/:id') {
      _renderRead(params.id || noteId);
      return;
    }

    if (current === 'home' && noteId) {
      // Fetch latest note (comes from cache -> instant)
      const note = await N.getById(noteId);
      if (!note) { _renderHome(); return; }

      // Update home cache entry
      if (_homeCache?.allNotes) {
        const idx = _homeCache.allNotes.findIndex(n => n.id === noteId);
        if (idx !== -1) _homeCache.allNotes[idx] = note;
      }

      // Patch all visible cards for this note
      const tagsMap = _homeCache?.tagsMap || {};
      document.querySelectorAll(`.note-card[data-id="${noteId}"]`).forEach(card => {
        const newCard = document.createElement('div');
        const gid = card.dataset.gid;
        newCard.innerHTML = gid
          ? _buildGroupNoteCard(note, tagsMap[noteId] || [], gid)
          : _buildNoteCard(note, tagsMap[noteId] || []);
        const replacement = newCard.firstElementChild;
        card.replaceWith(replacement);

        // Re-bind events on the new card
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

      // Patch flipcards
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

    return `
      <div class="note-group-card" data-gid="${group.id}">
        <div class="note-group-header" data-gid="${group.id}">
          <span class="note-group-icon"><i class="fa-solid fa-layer-group"></i></span>
          <span class="note-group-name">${_esc(group.name)}</span>
          <span class="note-group-count">${memberNotes.length} catatan</span>
          <div class="note-group-actions">
            <button class="icon-btn group-delete-btn" data-gid="${group.id}" title="Hapus grup" style="width:28px;height:28px;font-size:0.75rem">
              <i class="fa-solid fa-xmark"></i>
            </button>
            <button class="icon-btn group-toggle-btn" data-gid="${group.id}" data-collapsed="${collapsed}" title="${collapsed ? 'Buka' : 'Tutup'}" style="width:28px;height:28px;font-size:0.75rem">
              <i class="fa-solid fa-chevron-${collapsed ? 'down' : 'up'}"></i>
            </button>
          </div>
        </div>
        ${!collapsed ? `
          <div class="note-group-body">
            <div class="notes-grid" style="margin:0">
              ${memberNotes.map(n => _buildGroupNoteCard(n, tagsMap[n.id] || [], group.id)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /* Note card di dalam grup -> ada tombol keluarkan */
  function _buildGroupNoteCard(note, tags = [], gId) {
    const preview   = UI.stripHtml(note.content);
    const dtBadge   = Rm.cardBadgeHtml(note);
    const tagsHtml = tags.length
      ? `<div class="card-tags">${tags.map(t =>
          `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${_esc(t.name)}</span>`
        ).join('')}</div>`
      : '';

    return `
      <div class="note-card ${note.pinned ? 'pinned' : ''}" data-id="${note.id}" data-gid="${gId}" style="position:relative">
        <button class="icon-btn group-remove-note-btn" data-id="${note.id}" data-gid="${gId}"
          title="Keluarkan dari grup"
          style="position:absolute;top:6px;right:6px;width:22px;height:22px;font-size:0.6rem;z-index:2;opacity:0;transition:opacity 0.15s;color:var(--text-3)">
          <i class="fa-solid fa-xmark"></i>
        </button>
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
    return new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  /* --- WRITING STATS --- */
  function _getStreak() {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key   = `notara_activity_${d.toISOString().slice(0, 10)}`;
      const words = parseInt(localStorage.getItem(key) || '0', 10);
      if (words > 0) streak++;
      else if (i > 0) break;
    }
    return streak;
  }
  function _getTodayWords() {
    const key = `notara_activity_${new Date().toISOString().slice(0, 10)}`;
    return parseInt(localStorage.getItem(key) || '0', 10);
  }
  function _getWeekActivity() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key   = `notara_activity_${d.toISOString().slice(0, 10)}`;
      const words = parseInt(localStorage.getItem(key) || '0', 10);
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

    const data = {};
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(startDay);
      d.setDate(startDay.getDate() + i);
      const iso   = d.toISOString().slice(0, 10);
      const words = parseInt(localStorage.getItem(`notara_activity_${iso}`) || '0', 10);
      data[iso] = words;
    }

    const weeksHtml = [];
    for (let w = 0; w < WEEKS; w++) {
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const dayIdx = w * 7 + d;
        const date   = new Date(startDay);
        date.setDate(startDay.getDate() + dayIdx);
        const iso    = date.toISOString().slice(0, 10);
        const words  = data[iso] || 0;

        let lvl = 0;
        if (words > 0)   lvl = 1;
        if (words > 100) lvl = 2;
        if (words > 300) lvl = 3;
        if (words > 600) lvl = 4;

        const isoFmt = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        cells.push(
          `<div class="heatmap-cell level-${lvl}" title="${isoFmt}: ${words} kata"></div>`
        );
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
    // Use cached note to avoid DB round-trip - getById checks cache first
    const note = await N.getById(noteId);
    if (!note) return;
    const inReadMode = R.current() === 'read/:id';

    const baseItems = [
      { icon: '<i class="fa-solid fa-pen-to-square"></i>', label: 'Edit', action: 'edit',
        handler: id => R.go('edit/' + id) },
      ...(!inReadMode ? [{ icon: '<i class="fa-solid fa-eye"></i>', label: 'Baca', action: 'read',
        handler: id => R.go('read/' + id) }] : []),
      {
        icon: note.pinned
          ? '<i class="fa-solid fa-thumbtack" style="rotate:45deg"></i>'
          : '<i class="fa-solid fa-thumbtack"></i>',
        label: note.pinned ? 'Lepas Pin' : 'Pin', action: 'pin',
        handler: async id => {
          await N.pin(id);
          UI.toast(note.pinned ? 'Pin dilepas' : 'Catatan di-pin!', 'info');
          _refreshCurrentView(id);
        }
      },
      {
        icon: note.favorite
          ? '<i class="fa-solid fa-star" style="color:#f5a623"></i>'
          : '<i class="fa-regular fa-star"></i>',
        label: note.favorite ? 'Hapus Favorit' : 'Favorit', action: 'fav',
        handler: async id => {
          await N.favorite(id);
          UI.toast(note.favorite ? 'Favorit dihapus' : 'Ditambahkan ke favorit!', 'info');
          _refreshCurrentView(id);
        }
      },
      { icon: '<i class="fa-solid fa-tag"></i>', label: 'Ubah Label', action: 'label',
        handler: id => _showLabelPicker(id) },
      { icon: '<i class="fa-solid fa-tags"></i>', label: 'Kelola Tag', action: 'tags',
        handler: id => _showTagManager(id) },
      { icon: '<i class="fa-solid fa-copy"></i>', label: 'Duplikat', action: 'dup',
        handler: async id => {
          await N.duplicate(id);
          UI.toast('Catatan diduplikat', 'success');
          if (!inReadMode) _renderHome();
        }
      },
      { icon: '<i class="fa-solid fa-share-nodes"></i>', label: 'Bagikan', action: 'share',
        handler: id => N.shareNote(id) },
      { icon: '<i class="fa-solid fa-file-lines"></i>', label: 'Export TXT', action: 'txt',
        handler: id => N.exportTxt(id) },
      { icon: '<i class="fa-solid fa-file-pdf"></i>', label: 'Export PDF', action: 'pdf',
        handler: id => N.exportPdf(id) },
      {
        icon: '<i class="fa-solid fa-trash"></i>', label: 'Pindah ke Sampah', action: 'del', danger: true,
        handler: id => _deleteNote(id)
      },
    ];

    UI.openPopup(noteId, note.title, baseItems);
  }

  async function _deleteNote(id) {
    const note = await N.getById(id);
    const ok   = await UI.confirm({
      title:   'Pindah ke Sampah',
      message: `"<strong>${_esc(note?.title || 'catatan')}</strong>" akan dipindahkan ke Sampah. Bisa dipulihkan.`,
      okLabel: '<i class="fa-solid fa-trash"></i> Pindah ke Sampah',
      okClass: 'btn-primary',
    });
    if (ok) {
      try {
        await N.remove(id);
        UI.toast('Dipindahkan ke Sampah', 'info');
        if (window.location.hash === '#home') {
          _renderHome();
        } else {
          R.go('home');
        }
      } catch (err) {
        UI.toast('Gagal: ' + (err.message || 'Cek izin Supabase RLS'), 'error');
      }
    }
  }

  function _showLabelPicker(id) {
    UI.modal({
      title: 'Ubah Label',
      body: `
        <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
          ${[
            ['easy',   'var(--label-easy)',   'Easy'],
            ['medium', 'var(--label-medium)', 'Medium'],
            ['hard',   'var(--label-hard)',   'Hard'],
          ].map(([v, c, l]) => `
            <button class="label-btn" data-lv="${v}"
              style="padding:0.6rem 1rem;font-size:0.9rem;display:flex;align-items:center;gap:8px;
                     background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer">
              <i class="fa-solid fa-circle" style="color:${c};font-size:0.65rem"></i> ${l}
            </button>
          `).join('')}
        </div>
      `,
    });
    setTimeout(() => {
      document.querySelectorAll('[data-lv]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await N.setLabel(id, btn.dataset.lv);
          UI.toast(`Label diubah ke ${btn.dataset.lv}`, 'success');
          document.getElementById('modal-close').click();
          _refreshCurrentView(id);
        });
      });
    }, 50);
  }

  /* Tag Manager Modal */
  async function _showTagManager(noteId) {
    let allTags, noteTags;
    try {
      [allTags, noteTags] = await Promise.all([Tg.getAll(), Tg.getNoteTags(noteId)]);
    } catch {
      UI.toast('Gagal memuat tag', 'error'); return;
    }

    const noteTagIds = new Set(noteTags.map(t => t.id));

    const listHtml = allTags.length
      ? allTags.map(t => `
          <label class="tag-check-row">
            <input type="checkbox" class="tag-checkbox" value="${t.id}"
              ${noteTagIds.has(t.id) ? 'checked' : ''}>
            <span class="tag-dot" style="background:${t.color}"></span>
            <span class="tag-check-name">${_esc(t.name)}</span>
          </label>
        `).join('')
      : `<p style="color:var(--text-3);font-size:0.85rem;text-align:center;padding:var(--space-md)">
           Belum ada tag. Buat di halaman <strong>Tag</strong>.
         </p>`;

    UI.modal({
      title: '<i class="fa-solid fa-tags"></i> Kelola Tag',
      body: `<div class="tag-check-list">${listHtml}</div>`,
      footer: `
        <button class="btn-ghost" id="tag-cancel">Batal</button>
        <button class="btn-primary" id="tag-save" style="margin-left:8px">
          <i class="fa-solid fa-check"></i> Simpan
        </button>
      `,
    });

    setTimeout(() => {
      document.getElementById('tag-cancel')?.addEventListener('click', () =>
        document.getElementById('modal-close').click());

      document.getElementById('tag-save')?.addEventListener('click', async () => {
        const checked = [...document.querySelectorAll('.tag-checkbox:checked')].map(cb => cb.value);
        try {
          await Tg.setNoteTags(noteId, checked);
          UI.toast('Tag berhasil diperbarui', 'success');
          document.getElementById('modal-close').click();
          _refreshCurrentView(noteId);
        } catch (err) {
          UI.toast('Gagal simpan tag: ' + err.message, 'error');
        }
      });
    }, 60);
  }

  /* --- HOME PAGE --- */
  async function _renderHome() {
    const main = document.getElementById('app-main');
    UI.setTitle('Beranda');
    UI.setActiveNav('home');

    // 1) If we have a cached render, show it instantly
    if (_homeCache) {
      _renderHomeContent(main, _homeCache);
    } else {
      main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;
    }

    // 2) Fetch fresh data (N.getAll() hits in-memory cache if fresh)
    const [allNotes, groups] = await Promise.all([
      N.getAll(),
      _fetchGroups(),
    ]);

    // getPriorityNotes now reuses the getAll cache -> no extra DB call
    const priority = await N.getPriorityNotes();
    const allIds   = allNotes.map(n => n.id);
    const tagsMap  = await Tg.getTagsForNotes(allIds).catch(() => ({}));

    // Save to home cache
    _homeCache = { allNotes, priority, groups, tagsMap };

    // Only re-render if data actually changed (or was first load)
    _renderHomeContent(main, _homeCache);
    UI.updateStorageIndicator();
  }

  function _renderHomeContent(main, { allNotes, priority, groups, tagsMap }) {
    const others  = allNotes.filter(n => !priority.some(p => p.id === n.id));
    const streak   = _getStreak();
    const todayWds = _getTodayWords();
    const weekData = _getWeekActivity();
    const maxWds   = Math.max(...weekData.map(d => d.words), 1);

    const statsHtml = `
      <div class="stats-bar">
        <div class="stat-pill">
          <i class="fa-solid fa-fire" style="color:#f5a623"></i>
          <span>${streak} hari beruntun</span>
        </div>
        <div class="stat-pill">
          <i class="fa-solid fa-pen" style="color:var(--accent)"></i>
          <span>${todayWds.toLocaleString('id-ID')} kata hari ini</span>
        </div>
        <div class="stat-pill">
          <i class="fa-solid fa-note-sticky" style="color:var(--label-easy)"></i>
          <span>${allNotes.length} catatan</span>
        </div>
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

    const multiBar = _multiSelect ? `
      <div class="multi-select-bar" id="multi-select-bar">
        ${_buildMultiBar(_selectedIds.size, groups)}
      </div>
    ` : '';

    const groupCards = groups.map(g => _buildGroupCard(g, allNotes, tagsMap, groups))
      .filter(Boolean).join('');

    main.innerHTML = `
      <div class="home-page page-enter">
        <div class="greeting-block">
          <div class="greeting-icon">${_getGreetingIcon()}</div>
          <div class="greeting-text">
            <div class="greeting-main">${_getGreeting()}</div>
            <div class="greeting-date">${_formatToday()}</div>
          </div>
        </div>

        ${statsHtml}
        ${_buildHeatmap()}
        ${multiBar}

        ${allNotes.length > 0 && priority.length > 0 ? `
          <div class="section-header">
            <span class="section-title"><i class="fa-solid fa-bolt"></i> Prioritas</span>
            <span class="section-action" id="show-all-btn">Lihat semua</span>
          </div>
          <div class="flipcard-row" id="flipcard-row"></div>
        ` : ''}

        ${groupCards ? `
          <div class="section-header" style="margin-top:var(--space-md)">
            <span class="section-title"><i class="fa-solid fa-layer-group"></i> Grup</span>
          </div>
          <div id="groups-container">${groupCards}</div>
        ` : ''}

        ${ungroupedOthers.length > 0 ? `
          <div class="section-header" style="margin-top:${priority.length || groupCards ? 'var(--space-md)' : '0'}">
            <span class="section-title"><i class="fa-solid fa-note-sticky"></i> Semua Catatan</span>
            <button class="btn-ghost" id="ms-toggle-btn" style="font-size:0.75rem;padding:0.3rem 0.8rem;gap:5px">
              <i class="fa-solid fa-check-double"></i> ${_multiSelect ? 'Batal Pilih' : 'Pilih'}
            </button>
          </div>
          <div class="notes-grid" id="notes-grid"></div>
        ` : ''}

        ${!allNotes.length ? `
          <div class="empty-state" style="min-height:40vh">
            <span class="empty-icon float-hint" style="font-size:3rem;color:var(--accent);opacity:0.4">📝</span>
            <h3>Belum ada catatan</h3>
            <p>Mulai buat catatan pertamamu sekarang!</p>
            <button class="btn-primary" id="empty-new-btn">
              <i class="fa-solid fa-plus"></i> Catatan Baru
            </button>
          </div>
        ` : ''}
      </div>
    `;

    if (priority.length > 0) {
      const row = document.getElementById('flipcard-row');
      if (row) {
        row.innerHTML = priority.map(n => _buildFlipcard(n)).join('');
        _bindFlipcards(row);

        if (_multiSelect) {
          row.querySelectorAll('.flipcard-wrap').forEach(wrap => {
            wrap.classList.toggle('ms-selected', _selectedIds.has(wrap.dataset.id));
          });
        }
      }
    }

    if (ungroupedOthers.length > 0) {
      const grid = document.getElementById('notes-grid');
      if (grid) {
        grid.innerHTML = ungroupedOthers.map(n => _buildNoteCard(n, tagsMap[n.id] || [])).join('');
        if (_multiSelect) {
          grid.querySelectorAll('.note-card').forEach(card => {
            card.classList.toggle('ms-selected', _selectedIds.has(card.dataset.id));
          });
          _bindNoteCardsMultiSelect(grid);
        } else {
          _bindNoteCards(grid);
        }
      }
    }

    // Bind grup
    const groupsContainer = document.getElementById('groups-container');
    if (groupsContainer) {
      _bindGroupCardEvents(groupsContainer, groups);
    }

    document.getElementById('show-all-btn')?.addEventListener('click', () => R.go('search'));
    document.getElementById('empty-new-btn')?.addEventListener('click', _newNote);
    document.getElementById('ms-toggle-btn')?.addEventListener('click', _toggleMultiSelect);

    _bindMultiBar(groups);
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
              <button class="btn-primary fc-read" data-id="${note.id}" style="font-size:0.8rem;padding:0.4rem 0.9rem">
                <i class="fa-solid fa-eye"></i> Baca
              </button>
              <button class="btn-ghost fc-edit" data-id="${note.id}" style="font-size:0.8rem;padding:0.4rem 0.9rem">
                <i class="fa-solid fa-pen"></i> Edit
              </button>
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
        if (_multiSelect) {
          _toggleNoteSelect(wrap.dataset.id);
          return;
        }

        if (e.target.closest('.fc-read')) { R.go('read/' + e.target.closest('[data-id]').dataset.id); return; }
        if (e.target.closest('.fc-edit')) { R.go('edit/' + e.target.closest('[data-id]').dataset.id); return; }
        wrap.classList.toggle('flipped');
      });

      wrap.addEventListener('pointerdown', () => {
        if (_multiSelect) return;
        holdTimer = setTimeout(() => _noteActions(wrap.dataset.id), 600);
      });
      wrap.addEventListener('pointerup',   () => clearTimeout(holdTimer));
      wrap.addEventListener('pointerleave',() => clearTimeout(holdTimer));
    });
  }

  /* --- NOTE CARD (dengan tags) --- */
  function _buildNoteCard(note, tags = []) {
    const preview   = UI.stripHtml(note.content);
    const dtBadge   = Rm.cardBadgeHtml(note);
    const tagsHtml = tags.length
      ? `<div class="card-tags">${tags.map(t =>
          `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${_esc(t.name)}</span>`
        ).join('')}</div>`
      : '';

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

      card.addEventListener('pointerdown', () => {
        moved = false;
        holdTimer = setTimeout(() => { moved = true; _noteActions(card.dataset.id); }, 500);
      });
      card.addEventListener('pointermove', () => clearTimeout(holdTimer));
      card.addEventListener('pointerup',   () => clearTimeout(holdTimer));
      card.addEventListener('click', () => {
        if (moved) return;
        // Read lock status from data attribute -> no DB call needed
        if (card.dataset.locked === '1') {
          _showPinEntry(card.dataset.id, () => R.go('read/' + card.dataset.id));
        } else {
          R.go('read/' + card.dataset.id);
        }
      });
    });
  }

  function _bindNoteCardsMultiSelect(container) {
    container.querySelectorAll('.note-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        _toggleNoteSelect(card.dataset.id);
      });
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

    const labelMap  = { easy: 'chip-easy', medium: 'chip-medium', hard: 'chip-hard' };
    const labelText = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    const noteTags  = await Tg.getNoteTags(noteId).catch(() => []);

    let dtMeta = '';
    if (note.deadline) {
      const cd = Rm.formatCountdown(note.deadline);
      const dt = new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      dtMeta += `<span class="read-deadline-badge ${cd?.urgent ? 'urgent' : ''} ${cd?.overdue ? 'overdue' : ''}">
        <i class="fa-solid fa-hourglass-half"></i> Tenggat: ${dt}
        ${cd ? `<span class="read-deadline-cd">(${cd.text})</span>` : ''}
      </span>`;
    }
    if (note.reminderAt) {
      const cd = Rm.formatCountdown(note.reminderAt);
      const dt = new Date(note.reminderAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      dtMeta += `<span class="read-deadline-badge reminder ${cd?.urgent ? 'urgent' : ''} ${cd?.overdue ? 'overdue' : ''}">
        <i class="fa-solid fa-bell"></i> Pengingat: ${dt}
        ${cd ? `<span class="read-deadline-cd">(${cd.text})</span>` : ''}
      </span>`;
    }

    const tagsHtml = noteTags.length
      ? `<div class="read-tags">${noteTags.map(t =>
          `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border:1px solid ${t.color}40">${_esc(t.name)}</span>`
        ).join('')}</div>`
      : '';

    main.innerHTML = `
      <div class="read-page page-enter">
        <div class="read-header">
          <button class="btn-ghost" id="read-back">
            <i class="fa-solid fa-arrow-left"></i> Kembali
          </button>
          <div style="display:flex;gap:8px">
            <button class="btn-ghost" id="read-edit">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="icon-btn" id="read-more" title="Opsi lainnya">
              <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
          </div>
        </div>

        <div class="read-meta">
          <span class="chip ${labelMap[note.label] || 'chip-medium'}">${labelText[note.label] || note.label}</span>
          <span class="read-date">${UI.formatDate(note.updatedAt)}</span>
          ${note.pinned   ? '<span class="read-badge"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
          ${note.favorite ? '<span class="read-badge"><i class="fa-solid fa-star" style="color:#f5a623"></i></span>' : ''}
        </div>

        ${dtMeta   ? `<div class="read-dt-meta">${dtMeta}</div>` : ''}
        ${tagsHtml ? tagsHtml : ''}

        <h1 class="read-title">${_esc(note.title)}</h1>
        <div class="read-body">${note.content || '<p style="color:var(--text-3)">Catatan ini kosong.</p>'}</div>
      </div>
    `;

    document.getElementById('read-back')?.addEventListener('click', () => {
      UI.closePopup();
      R.back();
    });
    document.getElementById('read-edit')?.addEventListener('click', () => {
      UI.closePopup();
      R.go('edit/' + noteId);
    });
    document.getElementById('read-more')?.addEventListener('click', e => {
      e.stopPropagation();
      _noteActions(noteId);
    });

    document.querySelectorAll('.note-wikilink').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const id = link.dataset.id;
        if (id) R.go('read/' + id);
      });
    });
  }

  /* --- PIN ENTRY --- */
  function _showPinEntry(noteId, onSuccess) {
    UI.modal({
      title: 'Catatan Terkunci',
      body: `
        <p style="color:var(--text-2);margin-bottom:var(--space-md)">
          <i class="fa-solid fa-lock"></i> Masukkan PIN 4 digit.
        </p>
        <div class="pin-input-row">
          ${[0,1,2,3].map(i => `<input class="pin-digit" type="password" maxlength="1" inputmode="numeric" data-i="${i}">`).join('')}
        </div>
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
        if (await N.verifyPin(noteId, pin)) {
          document.getElementById('modal-close').click();
          onSuccess();
        } else {
          document.getElementById('pin-error').textContent = 'PIN salah, coba lagi.';
          digits.forEach(d => { d.value = ''; });
          digits[0]?.focus();
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

    const tagFilterHtml = allTags.length
      ? allTags.map(t => `
          <button class="filter-chip" data-filter="tag:${t.id}"
            style="--tag-color:${t.color}">
            <span style="width:8px;height:8px;border-radius:50%;background:${t.color};display:inline-block"></span>
            ${_esc(t.name)}
          </button>
        `).join('')
      : '';

    main.innerHTML = `
      <div class="search-page page-enter">
        <div class="search-input-wrap">
          <i class="fa-solid fa-magnifying-glass search-input-icon"></i>
          <input class="search-input" id="search-input" placeholder="Cari catatan..."
            value="${_esc(query)}" autofocus>
        </div>

        <div class="filter-bar" id="filter-bar" style="overflow-x:auto;flex-wrap:nowrap">
          <button class="filter-chip active" data-filter="all">Semua</button>
          <button class="filter-chip" data-filter="easy">
            <i class="fa-solid fa-circle" style="color:var(--label-easy);font-size:0.6rem"></i> Easy
          </button>
          <button class="filter-chip" data-filter="medium">
            <i class="fa-solid fa-circle" style="color:var(--label-medium);font-size:0.6rem"></i> Medium
          </button>
          <button class="filter-chip" data-filter="hard">
            <i class="fa-solid fa-circle" style="color:var(--label-hard);font-size:0.6rem"></i> Hard
          </button>
          <button class="filter-chip" data-filter="pinned">
            <i class="fa-solid fa-thumbtack"></i> Pin
          </button>
          <button class="filter-chip" data-filter="favorite">
            <i class="fa-solid fa-star"></i> Favorit
          </button>
          ${tagFilterHtml}
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
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
          <i class="fa-solid fa-magnifying-glass empty-icon"></i>
          <h3>Tidak ditemukan</h3>
          <p>Coba kata kunci atau filter lain</p>
        </div>`;
        return;
      }

      const resultIds = results.map(n => n.id);
      const tagsMap   = await Tg.getTagsForNotes(resultIds).catch(() => ({}));
      grid.innerHTML  = results.map(n => _buildNoteCard(n, tagsMap[n.id] || [])).join('');
      _bindNoteCards(grid);
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _activeFilter = chip.dataset.filter;
        doSearch();
      });
    });

    let _debounce;
    document.getElementById('search-input')?.addEventListener('input', () => {
      clearTimeout(_debounce);
      _debounce = setTimeout(doSearch, 300);
    });

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

    if (!days.length) {
      main.innerHTML = `
        <div class="timeline-page page-enter">
          <div class="empty-state" style="min-height:60vh">
            <i class="fa-regular fa-clock empty-icon" style="font-size:3rem;opacity:0.4"></i>
            <h3>Timeline kosong</h3>
            <p>Buat catatan untuk melihat timeline</p>
          </div>
        </div>`;
      return;
    }

    main.innerHTML = `
      <div class="timeline-page page-enter">
        <h2 style="margin-bottom:var(--space-xl)">Timeline</h2>
        ${days.map(day => `
          <div class="timeline-group">
            <div class="timeline-date">${day}</div>
            ${groups[day].map(n => `
              <div class="timeline-card" data-id="${n.id}">
                <div class="timeline-dot ${n.label}"></div>
                <div class="timeline-content">
                  <h4>${_esc(n.title)}</h4>
                  <p>${UI.formatDate(n.updatedAt)} • ${n.label}</p>
                </div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;

    document.querySelectorAll('.timeline-card').forEach(card => {
      card.addEventListener('click', () => R.go('read/' + card.dataset.id));
    });
  }

  /* --- TAGS PAGE --- */
  async function _renderTags() {
    const main = document.getElementById('app-main');
    UI.setTitle('Tag');
    UI.setActiveNav('tags');

    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    let tags = [];
    try { tags = await Tg.getAll(); } catch (err) {
      main.innerHTML = `<div class="empty-state" style="min-height:60vh">
        <i class="fa-solid fa-triangle-exclamation empty-icon"></i>
        <h3>Gagal memuat tag</h3><p>${err.message}</p>
      </div>`;
      return;
    }

    const colors = Tg.getPresetColors();

    main.innerHTML = `
      <div class="tags-page page-enter">
        <div class="tags-header">
          <h2><i class="fa-solid fa-tags"></i> Tag</h2>
          <button class="btn-primary" id="new-tag-btn">
            <i class="fa-solid fa-plus"></i> Tag Baru
          </button>
        </div>
        <p style="color:var(--text-3);font-size:0.83rem;margin-bottom:var(--space-lg)">
          Tag membantu kamu mengelompokkan catatan. Satu catatan bisa punya banyak tag.
        </p>

        ${!tags.length ? `
          <div class="empty-state" style="min-height:40vh">
            <i class="fa-solid fa-tags empty-icon" style="opacity:0.25"></i>
            <h3>Belum ada tag</h3>
            <p>Klik "Tag Baru" untuk membuat tag pertamamu</p>
          </div>
        ` : `
          <div class="tags-list" id="tags-list">
            ${tags.map(t => _buildTagRow(t)).join('')}
          </div>
        `}
      </div>
    `;

    document.getElementById('new-tag-btn')?.addEventListener('click', () => _showTagForm(null, colors, _renderTags));
    _bindTagRows(colors);
  }

  function _buildTagRow(tag) {
    return `
      <div class="tag-row" data-id="${tag.id}">
        <span class="tag-row-dot" style="background:${tag.color}"></span>
        <span class="tag-row-name">${_esc(tag.name)}</span>
        <div class="tag-row-actions">
          <button class="icon-btn tag-edit-btn" data-id="${tag.id}" data-name="${_esc(tag.name)}" data-color="${tag.color}" title="Edit tag">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="icon-btn tag-delete-btn" data-id="${tag.id}" data-name="${_esc(tag.name)}" title="Hapus tag" style="color:var(--label-hard)">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  function _bindTagRows(colors) {
    document.querySelectorAll('.tag-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _showTagForm({ id: btn.dataset.id, name: btn.dataset.name, color: btn.dataset.color }, colors, _renderTags);
      });
    });

    document.querySelectorAll('.tag-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await UI.confirm({
          title:   'Hapus Tag',
          message: `Tag "<strong>${_esc(btn.dataset.name)}</strong>" akan dihapus dari semua catatan. Yakin?`,
          okLabel: 'Hapus', okClass: 'btn-primary',
        });
        if (!ok) return;

        try {
          await Tg.remove(btn.dataset.id);
          UI.toast('Tag dihapus', 'info');
          _renderTags();
        } catch (err) {
          UI.toast('Gagal hapus: ' + err.message, 'error');
        }
      });
    });
  }

  function _showTagForm(existing, colors, onDone) {
    const isEdit = !!existing;
    let selectedColor = existing?.color || colors[0];

    UI.modal({
      title: isEdit ? 'Edit Tag' : 'Tag Baru',
      body: `
        <div style="display:flex;flex-direction:column;gap:var(--space-md)">
          <div>
            <label class="auth-label" style="display:block;margin-bottom:6px">Nama Tag</label>
            <input id="tag-name-input" class="auth-input"
              style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;width:100%;color:var(--text-1)"
              value="${_esc(existing?.name || '')}" placeholder="Nama tag..." maxlength="30">
          </div>
          <div>
            <label class="auth-label" style="display:block;margin-bottom:8px">Warna</label>
            <div class="color-picker-row" id="color-picker-row">
              ${colors.map(c => `
                <button class="color-dot ${c === selectedColor ? 'selected' : ''}"
                  style="background:${c}" data-color="${c}" title="${c}" type="button"></button>
              `).join('')}
            </div>
          </div>
          <div class="auth-error" id="tag-form-error"></div>
        </div>
      `,
      footer: `
        <button class="btn-ghost" id="tag-form-cancel">Batal</button>
        <button class="btn-primary" id="tag-form-save" style="margin-left:8px">
          <i class="fa-solid fa-check"></i> ${isEdit ? 'Simpan' : 'Buat Tag'}
        </button>
      `,
    });

    setTimeout(() => {
      document.getElementById('tag-form-cancel')?.addEventListener('click', () =>
        document.getElementById('modal-close').click());

      document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
          document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
          dot.classList.add('selected');
          selectedColor = dot.dataset.color;
        });
      });

      document.getElementById('tag-form-save')?.addEventListener('click', async () => {
        const name  = document.getElementById('tag-name-input').value.trim();
        const errEl = document.getElementById('tag-form-error');

        if (!name) { errEl.textContent = 'Nama tag wajib diisi.'; return; }

        try {
          if (isEdit) await Tg.update(existing.id, name, selectedColor);
          else        await Tg.create(name, selectedColor);

          UI.toast(isEdit ? 'Tag diperbarui' : 'Tag baru dibuat!', 'success');
          document.getElementById('modal-close').click();
          onDone();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }, 60);
  }

  /* --- POSTS / SOCIAL FEED --- */
  let _postPage = 0;
  let _postLoading = false;

  async function _renderPosts() {
    const main    = document.getElementById('app-main');
    const userId  = Au.getUser()?.id;
    UI.setTitle('Publikasi');
    UI.setActiveNav('posts');

    _postPage = 0;

    main.innerHTML = `
      <div class="posts-page page-enter">
        <div class="posts-header">
          <h2><i class="fa-solid fa-quote-left"></i> Publikasi</h2>
        </div>
        <p style="color:var(--text-3);font-size:0.83rem;margin-bottom:var(--space-lg)">
          Bagikan kata-kata & quotes yang menginspirasi. Semua pengguna bisa membaca dan memberi like.
        </p>

        <div class="new-post-card">
          <div class="post-author" style="margin-bottom:var(--space-sm)">
            <div class="post-avatar">${_initials(Au.getName())}</div>
            <span style="font-size:0.88rem;font-weight:600;color:var(--text-1)">${_esc(Au.getName())}</span>
          </div>
          <textarea id="new-post-textarea" class="new-post-textarea"
            placeholder="Tulis kata-kata, quotes, atau pikiran yang ingin kamu bagikan..."
            maxlength="500" rows="3"></textarea>
          <div class="new-post-footer">
            <span class="post-char-count" id="post-char-count">0 / 500</span>
            <button class="btn-primary" id="post-submit-btn" disabled>
              <i class="fa-solid fa-paper-plane"></i> Publikasikan
            </button>
          </div>
        </div>

        <div id="feed-container">
          <div class="page-loading"><div class="loader-ring"></div></div>
        </div>

        <div id="feed-load-more" style="text-align:center;padding:var(--space-md);display:none">
          <button class="btn-ghost" id="load-more-btn">
            <i class="fa-solid fa-chevron-down"></i> Muat Lebih Banyak
          </button>
        </div>
      </div>
    `;

    const textarea = document.getElementById('new-post-textarea');
    const submitBtn = document.getElementById('post-submit-btn');

    textarea?.addEventListener('input', () => {
      const len = textarea.value.length;
      document.getElementById('post-char-count').textContent = `${len} / 500`;
      submitBtn.disabled = len < 1;
    });

    submitBtn?.addEventListener('click', async () => {
      const content = textarea.value.trim();
      if (!content) return;

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat...';

      try {
        await Pt.create(content);
        textarea.value = '';
        document.getElementById('post-char-count').textContent = '0 / 500';
        UI.toast('Berhasil dipublikasikan!', 'success');
        _postPage = 0;
        await _loadFeed(true);
      } catch (err) {
        UI.toast('Gagal: ' + err.message, 'error');
      }

      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publikasikan';
    });

    await _loadFeed(true);

    document.getElementById('load-more-btn')?.addEventListener('click', async () => {
      _postPage++;
      await _loadFeed(false);
    });
  }

  async function _loadFeed(reset = false) {
    if (_postLoading) return;
    _postLoading = true;

    const container = document.getElementById('feed-container');
    const userId    = Au.getUser()?.id;
    if (!container) { _postLoading = false; return; }

    if (reset) {
      container.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;
      _postPage = 0;
    }

    try {
      const posts = await Pt.getFeed(_postPage, 15);
      const likedIds = await Pt.getLikedIds(posts.map(p => p.id));

      if (reset) container.innerHTML = '';

      if (!posts.length && reset) {
        container.innerHTML = `
          <div class="empty-state" style="min-height:30vh">
            <i class="fa-solid fa-quote-left empty-icon" style="opacity:0.25"></i>
            <h3>Belum ada publikasi</h3>
            <p>Jadilah yang pertama berbagi kata-kata!</p>
          </div>`;
        document.getElementById('feed-load-more').style.display = 'none';
        _postLoading = false;
        return;
      }

      posts.forEach(post => {
        const el = document.createElement('div');
        el.innerHTML = _buildPostCard(post, likedIds.has(post.id), userId);
        const card = el.firstElementChild;
        container.appendChild(card);
        _bindPostCard(card, post, userId);
      });

      const loadMoreWrap = document.getElementById('feed-load-more');
      if (loadMoreWrap) loadMoreWrap.style.display = posts.length < 15 ? 'none' : 'block';

    } catch (err) {
      if (reset) container.innerHTML = `<div class="empty-state" style="min-height:20vh">
        <h3>Gagal memuat feed</h3><p>${err.message}</p>
      </div>`;
    }

    _postLoading = false;
  }

  function _buildPostCard(post, liked, currentUserId) {
    const isOwn = post.user_id === currentUserId;
    const time  = _relativeTime(post.created_at);

    return `
      <div class="post-card" data-post-id="${post.id}">
        <div class="post-author">
          <div class="post-avatar">${_initials(post.author_name || '?')}</div>
          <div class="post-author-info">
            <div class="post-author-name">${_esc(post.author_name || 'Anonim')}</div>
            <div class="post-time">${time}</div>
          </div>
          ${isOwn ? `
            <button class="icon-btn post-delete-btn" data-post-id="${post.id}" title="Hapus postingan" style="color:var(--text-3)">
              <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
          ` : ''}
        </div>
        <div class="post-content">${_esc(post.content)}</div>
        <div class="post-actions">
          <button class="post-action-btn like-btn ${liked ? 'liked' : ''}" data-post-id="${post.id}">
            <i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i>
            <span class="like-count">${post.likes_count || 0}</span>
          </button>
          <button class="post-action-btn comment-btn" data-post-id="${post.id}">
            <i class="fa-regular fa-comment"></i>
            <span>${post.comments_count || 0} komentar</span>
          </button>
        </div>
      </div>
    `;
  }

  function _bindPostCard(card, post, currentUserId) {
    const isOwn = post.user_id === currentUserId;

    card.querySelector('.like-btn')?.addEventListener('click', async () => {
      const likeBtn  = card.querySelector('.like-btn');
      if (!likeBtn || likeBtn.disabled) return;

      const countEl  = likeBtn.querySelector('.like-count');
      const icon     = likeBtn.querySelector('i');
      const wasLiked = likeBtn.classList.contains('liked');

      likeBtn.disabled = true;

      if (wasLiked) {
        likeBtn.classList.remove('liked');
        icon.className = 'fa-regular fa-heart';
        if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent || '0') - 1);
      } else {
        likeBtn.classList.add('liked');
        icon.className = 'fa-solid fa-heart';
        if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1;
      }

      try {
        const result = await Pt.toggleLike(post.id);
        if (countEl) countEl.textContent = result.count;

        if (result.liked) {
          likeBtn.classList.add('liked');
          icon.className = 'fa-solid fa-heart';
        } else {
          likeBtn.classList.remove('liked');
          icon.className = 'fa-regular fa-heart';
        }
      } catch (err) {
        if (wasLiked) { likeBtn.classList.add('liked');    icon.className = 'fa-solid fa-heart'; }
        else          { likeBtn.classList.remove('liked'); icon.className = 'fa-regular fa-heart'; }
        UI.toast('Gagal like: ' + err.message, 'error');
      }
      likeBtn.disabled = false;
    });

    card.querySelector('.comment-btn')?.addEventListener('click', () => _showComments(post));

    if (isOwn) {
      card.querySelector('.post-delete-btn')?.addEventListener('click', async () => {
        const ok = await UI.confirm({
          title:   'Hapus Publikasi',
          message: 'Postingan ini akan dihapus permanen. Yakin?',
          okLabel: 'Hapus', okClass: 'btn-primary',
        });
        if (!ok) return;

        try {
          await Pt.remove(post.id);
          card.style.animation = 'fade-in 0.2s reverse both';
          setTimeout(() => card.remove(), 200);
          UI.toast('Postingan dihapus', 'info');
        } catch (err) {
          UI.toast('Gagal hapus: ' + err.message, 'error');
        }
      });
    }
  }

  async function _showComments(post) {
    const userId = Au.getUser()?.id;

    UI.modal({
      title: `<i class="fa-regular fa-comment"></i> Komentar`,
      body: `
        <div class="post-content" style="padding:var(--space-sm) 0 var(--space-md);border-bottom:1px solid var(--border);margin-bottom:var(--space-md);font-size:0.9rem">
          ${_esc(post.content)}
        </div>
        <div class="comments-list" id="comments-list">
          <div style="text-align:center;padding:var(--space-md)"><div class="loader-ring" style="margin:0 auto"></div></div>
        </div>
        <div class="comment-input-wrap">
          <input class="comment-input" id="comment-input" placeholder="Tulis komentar..." maxlength="200">
          <button class="btn-primary" id="comment-send" style="padding:8px 14px;flex-shrink:0">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </div>
      `,
    });

    setTimeout(async () => {
      const listEl = document.getElementById('comments-list');
      const input  = document.getElementById('comment-input');

      async function loadComments() {
        if (!listEl) return;
        try {
          const comments = await Pt.getComments(post.id);
          if (!comments.length) {
            listEl.innerHTML = `<p style="color:var(--text-3);font-size:0.83rem;text-align:center;padding:var(--space-md)">Belum ada komentar. Jadilah yang pertama!</p>`;
            return;
          }
          listEl.innerHTML = comments.map(c => `
            <div class="comment-item">
              <div class="comment-avatar">${_initials(c.author_name || '?')}</div>
              <div class="comment-body">
                <div class="comment-author">${_esc(c.author_name || 'Anonim')}</div>
                <div class="comment-text">${_esc(c.content)}</div>
                <div class="comment-time">${_relativeTime(c.created_at)}</div>
              </div>
              ${c.user_id === userId ? `
                <button class="icon-btn comment-del-btn" data-id="${c.id}" style="font-size:0.75rem;color:var(--text-3);width:28px;height:28px;flex-shrink:0">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              ` : ''}
            </div>
          `).join('');

          listEl.querySelectorAll('.comment-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              try {
                const result = await Pt.removeComment(btn.dataset.id);
                btn.closest('.comment-item').remove();
                UI.toast('Komentar dihapus', 'info');
                const commentBtn = document.querySelector(`.comment-btn[data-post-id="${result.postId}"]`);
                if (commentBtn) {
                  const span = commentBtn.querySelector('span');
                  if (span) {
                    const current = parseInt(span.textContent) || 0;
                    span.textContent = `${Math.max(0, current - 1)} komentar`;
                  }
                }
              } catch { UI.toast('Gagal hapus komentar', 'error'); }
            });
          });
        } catch { listEl.innerHTML = `<p style="color:var(--label-hard)">Gagal memuat komentar.</p>`; }
      }

      await loadComments();

      document.getElementById('comment-send')?.addEventListener('click', async () => {
        const text = input?.value.trim();
        if (!text) return;
        input.value = '';
        try {
          await Pt.addComment(post.id, text);
          await loadComments();
          listEl.scrollTop = listEl.scrollHeight;

          const commentBtn = document.querySelector(`.comment-btn[data-post-id="${post.id}"]`);
          if (commentBtn) {
            const span = commentBtn.querySelector('span');
            if (span) {
              const current = parseInt(span.textContent) || 0;
              span.textContent = `${current + 1} komentar`;
            }
          }
        } catch (err) { UI.toast('Gagal kirim: ' + err.message, 'error'); }
      });

      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          document.getElementById('comment-send')?.click();
        }
      });
    }, 80);
  }

  /* --- TRASH --- */
  async function _renderTrash() {
    const main = document.getElementById('app-main');
    UI.setTitle('Sampah');
    UI.setActiveNav('trash');

    main.innerHTML = `<div class="page-loading"><div class="loader-ring"></div></div>`;

    let trashNotes;
    try { trashNotes = await N.getTrash(); }
    catch (err) {
      main.innerHTML = `
        <div class="trash-page page-enter">
          <div class="trash-header"><h2><i class="fa-solid fa-trash-can"></i> Sampah</h2></div>
          <div class="empty-state" style="min-height:50vh">
            <i class="fa-solid fa-triangle-exclamation empty-icon" style="color:var(--label-medium)"></i>
            <h3>Kolom deleted_at belum ada</h3>
            <p>Jalankan migrasi SQL di Supabase terlebih dahulu.</p>
          </div>
        </div>`;
      return;
    }

    main.innerHTML = `
      <div class="trash-page page-enter">
        <div class="trash-header">
          <h2><i class="fa-solid fa-trash-can"></i> Sampah</h2>
          ${trashNotes.length > 0 ? `
            <button class="btn-ghost" id="trash-empty-all" style="color:var(--label-hard)">
              <i class="fa-solid fa-broom"></i> Kosongkan
            </button>
          ` : ''}
        </div>
        <p class="trash-info">
          <i class="fa-solid fa-circle-info"></i>
          Catatan di sini bisa dipulihkan atau dihapus permanen.
        </p>

        ${!trashNotes.length ? `
          <div class="empty-state" style="min-height:50vh">
            <i class="fa-solid fa-trash-can empty-icon" style="opacity:0.25"></i>
            <h3>Sampah kosong</h3>
            <p>Catatan yang dihapus akan muncul di sini</p>
          </div>
        ` : `
          <div class="trash-grid" id="trash-grid">
            ${trashNotes.map(n => _buildTrashCard(n)).join('')}
          </div>
        `}
      </div>
    `;

    document.getElementById('trash-empty-all')?.addEventListener('click', async () => {
      const ok = await UI.confirm({
        title:   'Kosongkan Sampah',
        message: `Hapus permanen ${trashNotes.length} catatan? Tidak bisa dibatalkan.`,
        okLabel: '<i class="fa-solid fa-broom"></i> Kosongkan', okClass: 'btn-primary',
      });
      if (ok) {
        try {
          await Promise.all(trashNotes.map(n => N.permanentDelete(n.id)));
          UI.toast('Sampah dikosongkan', 'info');
          _renderTrash();
        } catch(err) { UI.toast('Gagal: ' + err.message, 'error'); }
      }
    });

    document.querySelectorAll('.trash-restore-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        try { await N.restore(btn.dataset.id); UI.toast('Catatan dipulihkan!', 'success'); _renderTrash(); }
        catch(err) { UI.toast('Gagal: ' + err.message, 'error'); }
      });
    });

    document.querySelectorAll('.trash-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const ok = await UI.confirm({ title: 'Hapus Permanen', message: 'Catatan ini dihapus selamanya. Yakin?', okLabel: 'Hapus Permanen', okClass: 'btn-primary' });
        if (ok) {
          try { await N.permanentDelete(btn.dataset.id); UI.toast('Dihapus permanen', 'info'); _renderTrash(); }
          catch(err) { UI.toast('Gagal: ' + err.message, 'error'); }
        }
      });
    });
  }

  function _buildTrashCard(note) {
    const deletedDate = note.deletedAt
      ? new Date(note.deletedAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })
      : '-';

    return `
      <div class="trash-card">
        <div class="trash-card-body">
          <div class="trash-card-title">${_esc(note.title)}</div>
          <div class="trash-card-meta">
            <i class="fa-solid fa-trash-can" style="font-size:0.6rem;opacity:0.5"></i>
            Dihapus ${deletedDate}
          </div>
        </div>
        <div class="trash-card-actions">
          <button class="btn-ghost trash-restore-btn" data-id="${note.id}" style="font-size:0.78rem;padding:0.3rem 0.7rem">
            <i class="fa-solid fa-rotate-left"></i> Pulihkan
          </button>
          <button class="btn-ghost trash-delete-btn" data-id="${note.id}" style="font-size:0.78rem;padding:0.3rem 0.7rem;color:var(--label-hard);border-color:var(--label-hard)">
            <i class="fa-solid fa-trash"></i> Hapus
          </button>
        </div>
      </div>
    `;
  }

  /* --- TEMPLATES & NEW NOTE --- */
  const TEMPLATES = [
    { id: 'blank', icon: '<i class="fa-solid fa-note-sticky"></i>', label: 'Kosong', desc: 'Mulai dari awal', title: 'Catatan baru', content: '' },
    {
      id: 'meeting', icon: '<i class="fa-solid fa-users"></i>', label: 'Meeting Notes', desc: 'Peserta, agenda, & tindak lanjut',
      title: 'Meeting Notes',
      content: `<h2>🤝 Meeting Notes</h2>\n<p><strong>Tanggal:</strong> ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}</p>\n<p><strong>Peserta:</strong> </p>\n<h3>Agenda</h3><ul><li></li></ul>\n<h3>Catatan Diskusi</h3><p></p>\n<h3>Tindak Lanjut</h3><ul><li></li></ul>`,
    },
    {
      id: 'journal', icon: '<i class="fa-solid fa-book-open"></i>', label: 'Jurnal Harian', desc: 'Refleksi & mood harian',
      title: `Jurnal - ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`,
      content: `<h2>📖 Jurnal Harian</h2>\n<p><strong>Mood:</strong> 🌟</p>\n<h3>Hari ini aku...</h3><p></p>\n<h3>Hal yang aku syukuri</h3><ul><li></li><li></li></ul>\n<h3>Refleksi</h3><p></p>`,
    },
    {
      id: 'todo', icon: '<i class="fa-solid fa-list-check"></i>', label: 'To-Do List', desc: 'Daftar tugas dengan checklist',
      title: 'To-Do List',
      content: `<h2>✅ To-Do List</h2>\n<div class="todo-item"><span class="todo-check"></span><span class="todo-text"> Tugas pertama</span></div>\n<div class="todo-item"><span class="todo-check"></span><span class="todo-text"> Tugas kedua</span></div>`,
    },
    {
      id: 'brainstorm', icon: '<i class="fa-solid fa-lightbulb"></i>', label: 'Brainstorm', desc: 'Kumpulkan ide secara bebas',
      title: 'Brainstorm',
      content: `<h2>💡 Brainstorm</h2>\n<p><strong>Pertanyaan utama:</strong> </p>\n<h3>Ide-ide</h3><ul><li></li></ul>\n<h3>Pros</h3><ul><li></li></ul>\n<h3>Cons</h3><ul><li></li></ul>`,
    },
  ];

  function _showTemplatePicker(onSelect) {
    UI.modal({
      title: 'Pilih Template',
      body: `
        <div class="template-grid">
          ${TEMPLATES.map(t => `
            <button class="template-option" data-tmpl="${t.id}">
              <span class="template-icon">${t.icon}</span>
              <div class="template-info">
                <strong>${t.label}</strong>
                <span>${t.desc}</span>
              </div>
            </button>
          `).join('')}
        </div>
      `,
    });
    setTimeout(() => {
      document.querySelectorAll('.template-option').forEach(btn => {
        btn.addEventListener('click', () => {
          const tmpl = TEMPLATES.find(t => t.id === btn.dataset.tmpl);
          if (!tmpl) return;
          document.getElementById('modal-close')?.click();
          onSelect(tmpl);
        });
      });
    }, 60);
  }

  async function _newNote() {
    _showTemplatePicker(async (tmpl) => {
      Rm.showTypePicker(async (type, deadline, reminderAt) => {
        try {
          const note = await N.create({ title: tmpl.title || 'Catatan baru', content: tmpl.content || '', label: 'medium', deadline: deadline || null, reminderAt: reminderAt || null });
          R.go('edit/' + note.id);
        } catch(err) { UI.toast('Gagal membuat catatan: ' + err.message, 'error'); }
      });
    });
  }

  /* --- POMODORO TIMER --- */
  const _pomo = {
    phase:     'work',
    remaining: 25 * 60,
    running:   false,
    session:   0,
    timer:     null,
    visible:   false,
    expanded:  false,
    WORK:      25 * 60,
    SHORT:      5 * 60,
    LONG:      15 * 60,
  };

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
      const icon       = _pomo.phase === 'work' ? '💻' : '☕';

      document.getElementById('pomo-time-mini').textContent  = timeStr;
      document.getElementById('pomo-time-big').textContent   = timeStr;
      document.getElementById('pomo-phase-label').textContent = phaseLabel;
      document.getElementById('pomo-session-label').textContent = `Sesi ${_pomo.session + 1} / 4`;

      const playBtn = document.getElementById('pomo-play');
      if (playBtn) playBtn.innerHTML = _pomo.running
        ? '<i class="fa-solid fa-pause"></i>'
        : '<i class="fa-solid fa-play"></i>';

      const dots = document.querySelectorAll('.pomo-dot');
      dots.forEach((dot, i) => {
        dot.classList.remove('done', 'current');
        if (i < _pomo.session) dot.classList.add('done');
        else if (i === _pomo.session && _pomo.phase === 'work') dot.classList.add('current');
      });

      document.getElementById('pomo-icon-mini').textContent = icon;
    }

    function _nextPhase() {
      _pomo.running = false;
      clearInterval(_pomo.timer);
      _pomo.timer = null;

      if (_pomo.phase === 'work') {
        _pomo.session++;
        if (_pomo.session >= 4) {
          _pomo.phase     = 'long-break';
          _pomo.remaining = _pomo.LONG;
          _pomo.session   = 0;
        } else {
          _pomo.phase     = 'break';
          _pomo.remaining = _pomo.SHORT;
        }
      } else {
        _pomo.phase     = 'work';
        _pomo.remaining = _pomo.WORK;
      }

      if (Rm.hasPermission()) {
        const msg = _pomo.phase === 'work' ? 'Saatnya fokus kerja kembali! 💪' : 'Waktunya istirahat! ☕';
        new Notification('Notara Pomodoro', { body: msg, icon: './ikon.png', tag: 'pomodoro' });
      }

      UI.toast(_pomo.phase === 'work' ? '💻 Istirahat selesai - ayo kerja lagi!' : '☕ Sesi selesai - istirahat sejenak!', 'info', 4000);
      _render();
    }

    function _tick() {
      if (_pomo.remaining <= 0) { _nextPhase(); return; }
      _pomo.remaining--;
      _render();
    }

    function _toggle() {
      if (_pomo.running) {
        clearInterval(_pomo.timer);
        _pomo.timer   = null;
        _pomo.running = false;
      } else {
        _pomo.timer   = setInterval(_tick, 1000);
        _pomo.running = true;
      }
      _render();
    }

    function _reset() {
      clearInterval(_pomo.timer);
      _pomo.timer     = null;
      _pomo.running   = false;
      _pomo.phase     = 'work';
      _pomo.remaining = _pomo.WORK;
      _pomo.session   = 0;
      _render();
    }

    function _skip() {
      clearInterval(_pomo.timer);
      _pomo.timer     = null;
      _pomo.remaining = 0;
      _nextPhase();
    }

    window._pomoToggleVisible = () => {
      _pomo.visible   = !_pomo.visible;
      _pomo.expanded  = _pomo.visible;
      _render();
    };

    document.getElementById('pomo-collapsed')?.addEventListener('click', () => {
      _pomo.expanded = true;
      _render();
    });
    document.getElementById('pomo-close')?.addEventListener('click', e => {
      e.stopPropagation();
      _pomo.visible = false;
      _render();
    });
    document.getElementById('pomo-collapse')?.addEventListener('click', e => {
      e.stopPropagation();
      _pomo.expanded = false;
      _render();
    });

    document.getElementById('pomo-play')?.addEventListener('click', e => { e.stopPropagation(); _toggle(); });
    document.getElementById('pomo-reset')?.addEventListener('click', e => { e.stopPropagation(); _reset(); });
    document.getElementById('pomo-skip')?.addEventListener('click',  e => { e.stopPropagation(); _skip();  });
    document.getElementById('pomo-mini-play')?.addEventListener('click', e => { e.stopPropagation(); _toggle(); });

    _render();
  }

  /* --- KEYBOARD SHORTCUTS --- */
  function _initKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      const isTyping = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)
        || document.activeElement?.isContentEditable;

      if (e.key === '?' && !isTyping && !e.ctrlKey && !e.metaKey) {
        _showShortcutHelp(); return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
          case 'n': e.preventDefault(); _newNote(); break;
          case 'k': e.preventDefault(); _openCommandPalette(); break;
          case 'f': if (!isTyping) { e.preventDefault(); R.go('search'); } break;
          case ',': e.preventDefault(); R.go('settings'); break;
          case 'h': e.preventDefault(); R.go('home'); break;
          default: break;
        }
      }
    });
  }

  /* --- COMMAND PALETTE (Ctrl+K) --- */
  function _openCommandPalette() {
    document.getElementById('cmd-palette-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cmd-palette-overlay';
    overlay.className = 'cmd-palette-overlay';
    overlay.innerHTML = `
      <div class="cmd-palette" id="cmd-palette">
        <div class="cmd-palette-input-wrap">
          <i class="fa-solid fa-magnifying-glass cmd-palette-icon"></i>
          <input class="cmd-palette-input" id="cmd-palette-input"
            placeholder="Cari catatan, halaman, atau aksi..." autocomplete="off" spellcheck="false">
          <kbd class="cmd-palette-esc">Esc</kbd>
        </div>
        <div class="cmd-palette-results" id="cmd-palette-results"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input   = document.getElementById('cmd-palette-input');
    const results = document.getElementById('cmd-palette-results');
    let _idx = -1;

    const STATIC_CMDS = [
      { type: 'action', icon: '<i class="fa-solid fa-plus"></i>',        label: 'Catatan Baru',   sub: 'Ctrl+N', fn: _newNote },
      { type: 'action', icon: '<i class="fa-solid fa-house"></i>',       label: 'Beranda',        sub: 'Ctrl+H', fn: () => R.go('home') },
      { type: 'action', icon: '<i class="fa-solid fa-magnifying-glass"></i>', label: 'Cari',      sub: 'Ctrl+F', fn: () => R.go('search') },
      { type: 'action', icon: '<i class="fa-regular fa-clock"></i>',     label: 'Timeline',      sub: '', fn: () => R.go('timeline') },
      { type: 'action', icon: '<i class="fa-solid fa-tags"></i>',        label: 'Tag',            sub: '', fn: () => R.go('tags') },
      { type: 'action', icon: '<i class="fa-solid fa-quote-left"></i>',  label: 'Publikasi',      sub: '', fn: () => R.go('posts') },
      { type: 'action', icon: '<i class="fa-solid fa-trash-can"></i>',   label: 'Sampah',         sub: '', fn: () => R.go('trash') },
      { type: 'action', icon: '<i class="fa-solid fa-gear"></i>',        label: 'Pengaturan',     sub: 'Ctrl+,', fn: () => R.go('settings') },
      { type: 'action', icon: '<i class="fa-solid fa-clock"></i>',       label: 'Pomodoro Timer', sub: '', fn: () => window._pomoToggleVisible?.() },
      { type: 'action', icon: '<i class="fa-solid fa-keyboard"></i>',    label: 'Keyboard Shortcuts', sub: '?', fn: _showShortcutHelp },
    ];

    let _allNotes = [];

    async function _load() {
      try { _allNotes = await N.getAll(); } catch {}
      _render();
    }

    function _render() {
      const q = input?.value.trim().toLowerCase() || '';
      let items = [];

      const cmds = q
        ? STATIC_CMDS.filter(c => c.label.toLowerCase().includes(q))
        : STATIC_CMDS;
      items = [...cmds];

      const noteMatches = _allNotes.filter(n =>
        !q || n.title.toLowerCase().includes(q) || UI.stripHtml(n.content).toLowerCase().includes(q)
      ).slice(0, 6);

      noteMatches.forEach(n => items.push({
        type: 'note', icon: '<i class="fa-solid fa-note-sticky"></i>',
        label: n.title, sub: UI.formatDate(n.updatedAt), fn: () => R.go('read/' + n.id),
      }));

      if (!items.length) {
        results.innerHTML = `<div class="cmd-empty"><i class="fa-solid fa-face-sad-tear"></i> Tidak ada hasil</div>`;
        _idx = -1;
        return;
      }

      results.innerHTML = items.map((item, i) => `
        <div class="cmd-item${i === 0 ? ' active' : ''}" data-i="${i}">
          <span class="cmd-item-icon ${item.type === 'note' ? 'note' : ''}">${item.icon}</span>
          <span class="cmd-item-label">${_esc(item.label)}</span>
          ${item.sub ? `<span class="cmd-item-sub">${item.sub}</span>` : ''}
        </div>
      `).join('');

      _idx = 0;
      results.querySelectorAll('.cmd-item').forEach((el, i) => {
        el.addEventListener('mouseenter', () => {
          results.querySelectorAll('.cmd-item').forEach(x => x.classList.remove('active'));
          el.classList.add('active');
          _idx = i;
        });
        el.addEventListener('click', () => { _close(); items[i].fn(); });
      });
    }

    function _move(dir) {
      const els = results.querySelectorAll('.cmd-item');
      if (!els.length) return;
      els[_idx]?.classList.remove('active');
      _idx = (_idx + dir + els.length) % els.length;
      els[_idx]?.classList.add('active');
      els[_idx]?.scrollIntoView({ block: 'nearest' });
    }

    function _run() {
      const els = results.querySelectorAll('.cmd-item');
      els[_idx]?.click();
    }

    function _close() {
      overlay.remove();
    }

    input?.addEventListener('input', _render);
    input?.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown')  { e.preventDefault(); _move(1); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); _move(-1); }
      if (e.key === 'Enter')      { e.preventDefault(); _run(); }
      if (e.key === 'Escape')     { _close(); }
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });
    document.addEventListener('keydown', function closeOnEsc(e) {
      if (e.key === 'Escape') { _close(); document.removeEventListener('keydown', closeOnEsc); }
    });

    _load();
    setTimeout(() => input?.focus(), 30);
  }

  function _showShortcutHelp() {
    UI.modal({
      title: '⌨️ Keyboard Shortcuts',
      body: `
        <div class="shortcut-list">
          ${[
            ['Ctrl + N', 'Catatan baru'],
            ['Ctrl + K', 'Command palette'],
            ['Ctrl + F', 'Cari catatan'],
            ['Ctrl + S', 'Simpan (di editor)'],
            ['Ctrl + H', 'Ke Beranda'],
            ['Ctrl + ,', 'Ke Pengaturan'],
            ['Ctrl + B', 'Bold (di editor)'],
            ['Ctrl + I', 'Italic (di editor)'],
            ['Ctrl + L', 'Tambah checklist (di editor)'],
            ['F11',      'Zen Mode (di editor)'],
            ['?',        'Tampilkan bantuan ini'],
          ].map(([k, v]) => `
            <div class="shortcut-row">
              <span class="shortcut-keys">${k.split(' + ').map(p => `<kbd>${p}</kbd>`).join('<span class="shortcut-plus">+</span>')}</span>
              <span class="shortcut-desc">${v}</span>
            </div>
          `).join('')}
        </div>
      `,
    });
  }

  /* --- UTILITIES --- */
  function _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }
  function _relativeTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)    return 'Baru saja';
    if (diff < 3600)  return `${Math.floor(diff / 60)} mnt lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  /* --- MOUNT APP --- */
  function _mountApp() {
    document.body.innerHTML = `
      <div id="app">
        <!-- SIDEBAR -->
        <aside id="sidebar" class="sidebar" role="navigation" aria-label="Navigasi utama">
          <div class="sidebar-drag-handle" aria-hidden="true"></div>
          <div class="sidebar-header">
            <div class="logo">
              <span class="logo-icon" aria-hidden="true">📝</span>
              <span class="logo-text">Notara</span>
            </div>
            <button id="sidebar-close" class="icon-btn sidebar-close-btn" aria-label="Tutup sidebar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <nav class="sidebar-nav">
            <a href="#home" class="nav-item active" data-page="home">
              <span class="nav-icon"><i class="fa-solid fa-house"></i></span>
              <span class="nav-label">Beranda</span>
            </a>
            <a href="#search" class="nav-item" data-page="search">
              <span class="nav-icon"><i class="fa-solid fa-magnifying-glass"></i></span>
              <span class="nav-label">Cari</span>
            </a>
            <a href="#timeline" class="nav-item" data-page="timeline">
              <span class="nav-icon"><i class="fa-regular fa-clock"></i></span>
              <span class="nav-label">Timeline</span>
            </a>
            <a href="#posts" class="nav-item" data-page="posts">
              <span class="nav-icon"><i class="fa-solid fa-quote-left"></i></span>
              <span class="nav-label">Publikasi</span>
            </a>
            <a href="#tags" class="nav-item" data-page="tags">
              <span class="nav-icon"><i class="fa-solid fa-tags"></i></span>
              <span class="nav-label">Tag</span>
            </a>
            <a href="#trash" class="nav-item" data-page="trash">
              <span class="nav-icon"><i class="fa-solid fa-trash-can"></i></span>
              <span class="nav-label">Sampah</span>
            </a>
            <a href="#settings" class="nav-item" data-page="settings">
              <span class="nav-icon"><i class="fa-solid fa-gear"></i></span>
              <span class="nav-label">Pengaturan</span>
            </a>
          </nav>
          <div class="sidebar-footer">
            <div class="storage-indicator" title="Jumlah catatan">
              <div class="storage-bar">
                <div class="storage-fill" id="storage-fill"></div>
              </div>
              <span class="storage-label" id="storage-label">0 catatan</span>
            </div>
          </div>
        </aside>

        <div id="sidebar-overlay" class="sidebar-overlay" role="presentation"></div>

        <div id="app-wrapper" class="app-wrapper">
          <header class="topbar" id="topbar" role="banner">
            <button id="menu-btn" class="icon-btn menu-btn" aria-label="Buka menu">
              <i class="fa-solid fa-bars"></i>
            </button>
            <div class="topbar-title" id="topbar-title" aria-live="polite">Beranda</div>
            <div class="topbar-actions">
              <button id="pomo-toggle-btn" class="icon-btn" title="Pomodoro Timer" aria-label="Pomodoro timer">
                <i class="fa-solid fa-clock"></i>
              </button>
              <button id="shortcut-help-btn" class="icon-btn" title="Keyboard Shortcuts (?)" aria-label="Bantuan shortcut">
                <i class="fa-solid fa-keyboard"></i>
              </button>
              <button id="theme-toggle" class="icon-btn" title="Ganti tema" aria-label="Ganti tema">
                <i class="fa-solid fa-circle-half-stroke"></i>
              </button>
              <button id="new-note-btn" class="btn-primary new-note-btn" aria-label="Catatan baru" title="Catatan baru (Ctrl+N)">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </header>

          <main id="app-main" class="app-main" role="main">
            <div class="page-loading"><div class="loader-ring"></div></div>
          </main>
        </div>
      </div>

      <!-- ACTION POPUP -->
      <div id="action-popup" class="action-popup" role="dialog" aria-label="Aksi catatan" aria-hidden="true">
        <div class="action-popup-inner">
          <div class="action-popup-title" id="action-popup-title"></div>
          <div class="action-popup-items" id="action-popup-items" role="list"></div>
        </div>
      </div>

      <!-- TOAST -->
      <div id="toast-container" class="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>

      <!-- MODAL -->
      <div id="modal-overlay" class="modal-overlay" role="dialog" aria-modal="true" aria-hidden="true">
        <div class="modal" id="modal">
          <div class="modal-header">
            <h3 id="modal-title"></h3>
            <button id="modal-close" class="icon-btn" aria-label="Tutup">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="modal-body" id="modal-body"></div>
          <div class="modal-footer" id="modal-footer"></div>
        </div>
      </div>

      <!-- POMODORO WIDGET -->
      <div id="pomodoro-widget" class="pomodoro-widget" style="display:none">
        <div id="pomo-collapsed" class="pomo-collapsed">
          <span id="pomo-icon-mini">💻</span>
          <span id="pomo-time-mini" class="pomo-time-text">25:00</span>
          <button id="pomo-mini-play" class="pomo-mini-play">
            <i class="fa-solid fa-play"></i>
          </button>
        </div>
        <div id="pomo-expanded" class="pomo-expanded" style="display:none">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm)">
            <span class="pomo-phase-label" id="pomo-phase-label">KERJA</span>
            <div style="display:flex;gap:4px">
              <button id="pomo-collapse" class="icon-btn" style="width:26px;height:26px;font-size:0.7rem" title="Sembunyikan">
                <i class="fa-solid fa-chevron-down"></i>
              </button>
              <button id="pomo-close" class="icon-btn" style="width:26px;height:26px;font-size:0.7rem;color:var(--text-3)" title="Tutup">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
          <div class="pomo-big-time" id="pomo-time-big">25:00</div>
          <div class="pomo-session-label" id="pomo-session-label">Sesi 1 / 4</div>
          <div class="pomo-dot-row">
            <div class="pomo-dot current"></div>
            <div class="pomo-dot"></div>
            <div class="pomo-dot"></div>
            <div class="pomo-dot"></div>
          </div>
          <div class="pomo-controls">
            <button id="pomo-reset" class="pomo-btn pomo-btn-ghost" title="Reset">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
            <button id="pomo-play" class="pomo-btn pomo-btn-primary" title="Play/Pause">
              <i class="fa-solid fa-play"></i>
            </button>
            <button id="pomo-skip" class="pomo-btn pomo-btn-ghost" title="Skip fase">
              <i class="fa-solid fa-forward-step"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- MOBILE BOTTOM NAV -->
      <nav class="mobile-bottom-nav" id="mobile-bottom-nav" role="navigation" aria-label="Navigasi bawah">
        <button id="mobile-pomo-btn" class="mobile-nav-btn" aria-label="Pomodoro Timer" title="Pomodoro Timer">
          <i class="fa-solid fa-clock"></i>
          <span>Pomodoro</span>
        </button>
        <button id="mobile-shortcut-btn" class="mobile-nav-btn" aria-label="Bantuan Shortcut" title="Shortcut">
          <i class="fa-solid fa-keyboard"></i>
          <span>Bantuan</span>
        </button>
        <button id="mobile-theme-btn" class="mobile-nav-btn" aria-label="Ganti Tema" title="Ganti Tema">
          <i class="fa-solid fa-circle-half-stroke"></i>
          <span>Tema</span>
        </button>
        <div class="mobile-nav-fab-space"></div>
        <button id="mobile-menu-btn" class="mobile-nav-btn mobile-nav-menu" aria-label="Buka Menu" title="Menu">
          <i class="fa-solid fa-bars"></i>
          <span>Menu</span>
        </button>
      </nav>

      <!-- MOBILE FAB -->
      <button id="mobile-fab-btn" class="mobile-fab" aria-label="Catatan Baru" title="Catatan Baru">
        <i class="fa-solid fa-plus"></i>
      </button>
    `;

    S.init();
    const sidebarCtrl = UI.initSidebar();

    document.getElementById('theme-toggle')?.addEventListener('click', S.cycleTheme);
    document.getElementById('new-note-btn')?.addEventListener('click', _newNote);
    document.getElementById('shortcut-help-btn')?.addEventListener('click', _showShortcutHelp);
    document.getElementById('pomo-toggle-btn')?.addEventListener('click', () => {
      if (window._pomoToggleVisible) window._pomoToggleVisible();
    });

    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      sidebarCtrl?.open();
    });
    document.getElementById('mobile-pomo-btn')?.addEventListener('click', () => {
      if (window._pomoToggleVisible) window._pomoToggleVisible();
    });
    document.getElementById('mobile-shortcut-btn')?.addEventListener('click', _showShortcutHelp);
    document.getElementById('mobile-theme-btn')?.addEventListener('click', S.cycleTheme);
    document.getElementById('mobile-fab-btn')?.addEventListener('click', _newNote);

    _initKeyboardShortcuts();
    _initPomodoro();

    // FAB visibility helper
    // window._fabVisible is read by ui.js initSidebar when it closes
    function _setFabVisible(visible) {
      window._fabVisible = visible;
      const fab = document.getElementById('mobile-fab-btn');
      if (fab) fab.style.display = visible ? '' : 'none';
    }

    R.on('home',     () => { _setFabVisible(true);  UI.closePopup(); Ed.unmount(); _renderHome(); });
    R.on('read/:id', p  => { _setFabVisible(false); UI.closePopup(); Ed.unmount(); _renderRead(p.id); });
    R.on('edit/:id', p  => { _setFabVisible(false); UI.closePopup(); Ed.mount(p.id); UI.setTitle('Edit'); UI.setActiveNav('home'); });
    R.on('new',      () => { _setFabVisible(true);  UI.closePopup(); Ed.unmount(); _newNote(); });
    R.on('search',   () => { _setFabVisible(true);  UI.closePopup(); Ed.unmount(); _renderSearch(); });
    R.on('timeline', () => { _setFabVisible(true);  UI.closePopup(); Ed.unmount(); _renderTimeline(); });
    R.on('tags',     () => { _setFabVisible(true);  UI.closePopup(); Ed.unmount(); _renderTags(); });
    R.on('posts',    () => { _setFabVisible(true);  UI.closePopup(); Ed.unmount(); _renderPosts(); });
    R.on('trash',    () => { _setFabVisible(true);  UI.closePopup(); Ed.unmount(); _renderTrash(); });
    R.on('settings', () => { _setFabVisible(true);  UI.closePopup(); Ed.unmount(); S.renderPage(); });

    N.onChange(() => UI.updateStorageIndicator());

    Rm.start();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) nw.postMessage('skipWaiting');
          });
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update();
        });
      }).catch(e => console.warn('[Notara] SW error', e));

      let _swRefreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (_swRefreshing) return;
        _swRefreshing = true;
        window.location.reload();
      });
    }

    R.init();
    UI.updateStorageIndicator();
    _initSwipeGesture();
  }

  function _initSwipeGesture() {
    const main = document.getElementById('app-main');
    let startX = 0;
    main?.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    main?.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (dx > 80 && startX < 50) R.back();
    }, { passive: true });
  }

  /* --- BOOT --- */
  async function init() {
    S.init();
    await Au.init(loggedIn => {
      if (loggedIn) _mountApp();
      else          Au.renderAuthPage();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();