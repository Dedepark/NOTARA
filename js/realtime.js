/* js/realtime.js — Supabase Realtime granular DOM patching */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Realtime = (() => {
  const db   = () => window.Notara.db;
  const Auth = () => window.Notara.Auth;
  const R    = () => window.Notara.Router;

  let _channel = null;
  let _enabled = false;

  function _userId() { return Auth()?.getUser()?.id; }
  function _route()  { return R()?.current(); }

  function _buildNoteCard(n, tags) { return window.Notara._buildNoteCard?.(n, tags) ?? ''; }
  function _buildTagRow(t)         { return window.Notara._buildTagRow?.(t) ?? ''; }
  function _buildGroupCard(g, notes, tagsMap, allGroups) { return window.Notara._buildGroupCard?.(g, notes, tagsMap, allGroups) ?? ''; }

  /* ─── NOTES ─── */

  async function _fetchNoteWithTags(noteId) {
    const N  = window.Notara.Notes;
    const Tg = window.Notara.Tags;
    const note = await N?.getById(noteId);
    if (!note) return null;
    const tagsMap = await Tg?.getTagsForNotes([noteId]).catch(() => ({}));
    return { note, tags: tagsMap?.[noteId] || [] };
  }

  function _patchNoteCardOnHome(note, tags) {
    const html = _buildNoteCard(note, tags);
    if (!html) return;
    const existing = document.querySelector(`#notes-grid .note-card[data-id="${note.id}"]`);
    if (existing) {
      existing.outerHTML = html;
    } else {
      const grid = document.getElementById('notes-grid');
      if (grid) {
        grid.insertAdjacentHTML('afterbegin', html);
        window.Notara._bindNoteCards?.(grid);
      } else {
        window.Notara._homeCache = null;
        window.Notara._reRenderHome?.();
        return;
      }
    }
    const flipcard = document.querySelector(`#flipcard-row .flipcard-wrap[data-id="${note.id}"]`);
    if (flipcard) {
      const fcHtml = window.Notara._buildFlipcard?.(note);
      if (fcHtml) { flipcard.outerHTML = fcHtml; window.Notara._bindFlipcards?.(document.getElementById('flipcard-row')); }
    }
  }

  function _removeNoteCardFromHome(noteId) {
    document.querySelectorAll(`.note-card[data-id="${noteId}"]`).forEach(el => el.remove());
    document.querySelectorAll(`.flipcard-wrap[data-id="${noteId}"]`).forEach(el => el.remove());
  }

  function _patchNoteOnSearch(note, tags) {
    const html = _buildNoteCard(note, tags);
    if (!html) return;
    const existing = document.querySelector(`#search-results .note-card[data-id="${note.id}"]`);
    if (existing) {
      existing.outerHTML = html;
    } else {
      const grid = document.getElementById('search-results');
      if (grid) { grid.insertAdjacentHTML('afterbegin', html); window.Notara._bindNoteCards?.(grid); }
    }
  }

  function _removeNoteFromSearch(noteId) {
    document.querySelectorAll(`#search-results .note-card[data-id="${noteId}"]`).forEach(el => el.remove());
  }

  async function _patchNoteOnRead(noteId) {
    const route = _route();
    if (!route?.startsWith('read/')) return;
    const params = R()?.params();
    if (params?.id !== noteId) return;
    const note = await window.Notara.Notes?.getById(noteId);
    if (!note) return;
    const titleEl = document.querySelector('.read-title');
    const bodyEl  = document.querySelector('.read-body');
    if (titleEl) titleEl.textContent = note.title;
    if (bodyEl)  bodyEl.innerHTML = note.content || '<p style="color:var(--text-3)">Catatan ini kosong.</p>';
  }

  async function _handleNoteChange(payload) {
    const type = payload.eventType;
    const rec  = payload.new;
    const old  = payload.old;
    const noteId = type === 'DELETE' ? old?.id : rec?.id;
    if (!noteId) return;

    const route = _route();

    if (type === 'DELETE') {
      _removeNoteCardFromHome(noteId);
      _removeNoteFromSearch(noteId);
      await _patchNoteOnRead(noteId);
      _refreshHomeStats();
      return;
    }

    const data = await _fetchNoteWithTags(noteId);
    if (!data) return;

    if (route?.startsWith('home')) {
      const inGrid  = document.querySelector(`#notes-grid .note-card[data-id="${noteId}"]`);
      const inFlip  = document.querySelector(`#flipcard-row .flipcard-wrap[data-id="${noteId}"]`);
      const inGroup = document.querySelector(`.note-group-body .note-card[data-id="${noteId}"]`);
      if (inGrid || inFlip) {
        _patchNoteCardOnHome(data.note, data.tags);
      } else if (inGroup) {
        _handleNoteGroupChange();
      }
      _refreshHomeStats();
    }
    if (route?.startsWith('search')) _patchNoteOnSearch(data.note, data.tags);
    await _patchNoteOnRead(noteId);
  }

  async function _refreshHomeStats() {
    const N = window.Notara.Notes;
    if (!N) return;
    const allNotes = await N.getAll().catch(() => []);
    const statsItems = document.querySelectorAll('.stats-item-value');
    if (statsItems[2]) statsItems[2].textContent = allNotes.length;
  }

  /* ─── NOTE TAGS ─── */

  async function _handleNoteTagChange(payload) {
    const noteId = payload.new?.note_id || payload.old?.note_id;
    if (!noteId) return;
    const route = _route();
    if (route?.startsWith('home') || route?.startsWith('search')) {
      const data = await _fetchNoteWithTags(noteId);
      if (!data) return;
      if (route.startsWith('home'))  _patchNoteCardOnHome(data.note, data.tags);
      if (route.startsWith('search')) _patchNoteOnSearch(data.note, data.tags);
    }
  }

  /* ─── NOTE GROUPS ─── */

  async function _handleNoteGroupChange() {
    const route = _route();
    if (!route?.startsWith('home')) return;
    window.Notara._homeCache = null;
    const fetchGroups = window.Notara._fetchGroups;
    const N  = window.Notara.Notes;
    const Tg = window.Notara.Tags;
    if (!fetchGroups || !N) return;
    const groups   = await fetchGroups().catch(() => []);
    const allNotes = await N.getAll().catch(() => []);
    const allIds   = allNotes.map(n => n.id);
    const tagsMap  = allIds.length ? await Tg?.getTagsForNotes(allIds).catch(() => ({})) : {};
    const container = document.getElementById('groups-container');
    if (!container) return;
    container.innerHTML = groups.map(g => _buildGroupCard(g, allNotes, tagsMap, groups)).filter(Boolean).join('');
    window.Notara._bindGroupCardEvents?.(container, groups);
  }

  /* ─── TAGS ─── */

  async function _handleTagChange(payload) {
    const type  = payload.eventType;
    const tagId = type === 'DELETE' ? payload.old?.id : payload.new?.id;
    const route = _route();
    if (!route?.startsWith('tags')) return;

    if (type === 'DELETE') {
      const row = document.querySelector(`#tags-list .tag-row[data-id="${tagId}"]`);
      if (row) row.remove();
      const list = document.getElementById('tags-list');
      if (list && !list.children.length) {
        list.outerHTML = `<div class="empty-state" style="min-height:40vh"><i class="fa-solid fa-tags empty-icon" style="opacity:0.25"></i><h3>Belum ada tag</h3><p>Klik "Tag Baru" untuk membuat tag pertamamu</p></div>`;
      }
      return;
    }

    const Tg  = window.Notara.Tags;
    const tag = await Tg?.getAll().then(ts => ts.find(t => t.id === tagId));
    if (!tag) return;
    const rowHtml  = _buildTagRow(tag);
    const existing = document.querySelector(`#tags-list .tag-row[data-id="${tagId}"]`);
    if (existing) {
      existing.outerHTML = rowHtml;
    } else {
      const list = document.getElementById('tags-list');
      if (list) {
        const isEmpty = list.classList.contains('empty-state') || !list.classList.contains('tags-list');
        if (isEmpty) {
          list.outerHTML = `<div class="tags-list" id="tags-list">${rowHtml}</div>`;
        } else {
          list.insertAdjacentHTML('beforeend', rowHtml);
        }
      }
    }
    const colors = Tg.getPresetColors?.();
    if (colors) window.Notara._bindTagRows?.(colors);
  }

  /* ─── MOOD ─── */

  function _handleMoodChange() {
    if (_route()?.startsWith('mood')) {
      window.Notara.MoodTracker?.renderPage?.();
    }
  }

  /* ─── HABITS ─── */

  async function _handleHabitChange(payload, table) {
    const route = _route();
    if (!route?.startsWith('habits')) return;

    if (table === 'habit_lists') {
      window.Notara.HabitTracker?.renderPage?.();
      return;
    }

    const type = payload.eventType;
    if (type === 'INSERT' || type === 'UPDATE') {
      const habitId = payload.new?.habit_id;
      if (!habitId) { window.Notara.HabitTracker?.renderPage?.(); return; }
      const item = document.querySelector(`#habit-checklist .habit-item[data-id="${habitId}"]`);
      if (item) {
        const checkbox = item.querySelector('.habit-checkbox');
        if (checkbox) checkbox.classList.toggle('checked', !!payload.new.completed);
        const count = document.querySelectorAll('#habit-checklist .habit-checkbox.checked').length;
        const total = document.querySelectorAll('#habit-checklist .habit-checkbox').length;
        const pctEl = document.querySelector('.habit-progress-pct');
        const fillEl = document.querySelector('.habit-progress-fill');
        const pct = total ? Math.round((count / total) * 100) : 0;
        if (pctEl) pctEl.textContent = `${count}/${total} (${pct}%)`;
        if (fillEl) fillEl.style.width = pct + '%';
      } else {
        window.Notara.HabitTracker?.renderPage?.();
      }
    } else {
      window.Notara.HabitTracker?.renderPage?.();
    }
  }

  /* ─── FINANCE ─── */

  function _handleFinanceChange() {
    if (_route()?.startsWith('finance')) {
      window.Notara.FinanceTracker?.renderPage?.();
    }
  }

  /* ─── DISPATCHER ─── */

  function _onPayload(table) {
    return (payload) => {
      if (!_enabled) return;
      try {
        switch (table) {
          case 'notes':              _handleNoteChange(payload);          break;
          case 'note_tags':          _handleNoteTagChange(payload);       break;
          case 'note_groups':        _handleNoteGroupChange();            break;
          case 'tags':               _handleTagChange(payload);           break;
          case 'mood_entries':       _handleMoodChange();                 break;
          case 'habit_lists':
          case 'habit_logs':         _handleHabitChange(payload, table);  break;
          case 'finance_transactions':
          case 'finance_categories': _handleFinanceChange();              break;
        }
      } catch (e) { console.warn('[Realtime] Handler error:', e); }
    };
  }

  /* ─── SUBSCRIBE / UNSUBSCRIBE ─── */

  function subscribe() {
    if (_channel) return;
    if (!_enabled) return;
    const uid = _userId();
    if (!uid) return;

    _channel = db()
      .channel('notara-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes',                  filter: `user_id=eq.${uid}` }, _onPayload('notes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mood_entries',           filter: `user_id=eq.${uid}` }, _onPayload('mood_entries'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_lists',            filter: `user_id=eq.${uid}` }, _onPayload('habit_lists'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs',             filter: `user_id=eq.${uid}` }, _onPayload('habit_logs'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_transactions',   filter: `user_id=eq.${uid}` }, _onPayload('finance_transactions'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_categories',     filter: `user_id=eq.${uid}` }, _onPayload('finance_categories'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tags',                   filter: `user_id=eq.${uid}` }, _onPayload('tags'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'note_tags' },                                      _onPayload('note_tags'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'note_groups',            filter: `user_id=eq.${uid}` }, _onPayload('note_groups'))
      .subscribe();

    console.log('[Realtime] Subscribed');
  }

  function unsubscribe() {
    if (_channel) {
      db().removeChannel(_channel);
      _channel = null;
      console.log('[Realtime] Unsubscribed');
    }
  }

  function enable()  { _enabled = true; }
  function disable() { _enabled = false; unsubscribe(); }

  return { subscribe, unsubscribe, enable, disable };
})();
