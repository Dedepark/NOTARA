/* js/notes.js — Note CRUD via Supabase */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Notes = (() => {
  const db = () => window.Notara.db;

  /* ── Field mapping DB → JS ─────────────── */
  function _fromDb(row) {
    if (!row) return null;
    return {
      id:         row.id,
      title:      row.title,
      content:    row.content,
      label:      row.label,
      pinned:     row.pinned,
      favorite:   row.favorite,
      locked:     row.locked,
      lockPin:    row.lock_pin,
      hidden:     row.hidden,
      reminder:   row.reminder,
      deadline:   row.deadline    || null,
      reminderAt: row.reminder_at || null,
      deletedAt:  row.deleted_at  || null,   // ← Trash support
      createdAt:  row.created_at,
      updatedAt:  row.updated_at,
    };
  }

  function _toDb(data) {
    const obj = {};
    if (data.title      !== undefined) obj.title       = data.title;
    if (data.content    !== undefined) obj.content     = data.content;
    if (data.label      !== undefined) obj.label       = data.label;
    if (data.pinned     !== undefined) obj.pinned      = data.pinned;
    if (data.favorite   !== undefined) obj.favorite    = data.favorite;
    if (data.locked     !== undefined) obj.locked      = data.locked;
    if (data.lockPin    !== undefined) obj.lock_pin    = data.lockPin;
    if (data.hidden     !== undefined) obj.hidden      = data.hidden;
    if (data.reminder   !== undefined) obj.reminder    = data.reminder;
    if (data.deadline   !== undefined) obj.deadline    = data.deadline;
    if (data.reminderAt !== undefined) obj.reminder_at = data.reminderAt;
    if (data.deletedAt  !== undefined) obj.deleted_at  = data.deletedAt;
    return obj;
  }

  function _stripHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent || d.innerText || '';
  }

  function _smartTitle(content) {
    const text  = _stripHtml(content).trim();
    const first = text.split('\n')[0].trim();
    return first.slice(0, 60) || 'Catatan baru';
  }

  /* ── In-Memory Cache ─────────────────────────
   * Prevents redundant Supabase round-trips.
   * Cache is invalidated on every write (create/update/remove).
   * TTL = 60 s as a safety net for background tab / realtime drift.
   ──────────────────────────────────────────── */
  let _cache    = null;   // Array<note> | null
  let _cacheTs  = 0;
  const _CACHE_TTL = 60_000; // 60 seconds

  function _invalidateCache() { _cache = null; _cacheTs = 0; }

  /** Patch a single note in the cache without re-fetching everything */
  function _patchCache(id, updated) {
    if (!_cache) return;
    const idx = _cache.findIndex(n => n.id === id);
    if (idx !== -1) _cache[idx] = updated;
    else            _cache.unshift(updated); // new note
  }

  /* ── getAll (excludes soft-deleted) ─────────── */
  async function getAll() {
    // Return cache if fresh
    if (_cache && (Date.now() - _cacheTs) < _CACHE_TTL) return _cache;

    const { data, error } = await db()
      .from('notes')
      .select('*')
      .eq('hidden', false)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    _cache   = data.map(_fromDb);
    _cacheTs = Date.now();
    return _cache;
  }

  /* ── getById ─────────────────────────────── */
  async function getById(id) {
    // Check cache first to avoid a round-trip
    if (_cache) {
      const hit = _cache.find(n => n.id === id);
      if (hit) return hit;
    }
    const { data, error } = await db()
      .from('notes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return _fromDb(data);
  }

  /* ── create ──────────────────────────────── */
  async function create(data = {}) {
    const userId = window.Notara.Auth.getUser()?.id;
    const row = {
      user_id:     userId,
      title:       data.title      || 'Catatan baru',
      content:     data.content    || '',
      label:       data.label      || 'medium',
      pinned:      data.pinned     || false,
      favorite:    data.favorite   || false,
      deadline:    data.deadline   || null,
      reminder_at: data.reminderAt || null,
    };
    const { data: created, error } = await db()
      .from('notes')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    _invalidateCache();   // fresh insert → reload on next getAll()
    _emitChange();
    return _fromDb(created);
  }

  /* ── update ──────────────────────────────── */
  async function update(id, changes = {}) {
    if (changes.content && !changes.title) {
      const current = await getById(id);
      if (current && (!current.title || current.title === 'Catatan baru')) {
        changes.title = _smartTitle(changes.content);
      }
    }
    const { data, error } = await db()
      .from('notes')
      .update(_toDb(changes))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = _fromDb(data);
    _patchCache(id, updated);   // update in-place — keeps cache alive
    _emitChange();
    return updated;
  }

  /* ── remove (soft delete → Trash) ───────── */
  async function remove(id) {
    const { data, error } = await db()
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) throw error;
    // Remove from cache immediately so next getAll() reflects it
    if (_cache) _cache = _cache.filter(n => n.id !== id);
    _emitChange();
    return true;
  }

  /* ── Trash: getTrash ─────────────────────── */
  async function getTrash() {
    const { data, error } = await db()
      .from('notes')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    return data.map(_fromDb);
  }

  /* ── Trash: restore ──────────────────────── */
  async function restore(id) {
    const { data, error } = await db()
      .from('notes')
      .update({ deleted_at: null })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    _emitChange();
    return _fromDb(data);
  }

  /* ── Trash: permanentDelete ──────────────── */
  async function permanentDelete(id) {
    const { data, error } = await db()
      .from('notes')
      .delete()
      .eq('id', id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Tidak ada baris yang terhapus — periksa RLS policy DELETE di Supabase.');
    }
    // Also clear any stored versions
    _clearVersions(id);
    if (_cache) _cache = _cache.filter(n => n.id !== id);
    _emitChange();
    return true;
  }

  /* ── pin / favorite / duplicate ─────────── */
  async function pin(id) {
    const note = await getById(id);
    if (!note) return;
    return update(id, { pinned: !note.pinned });
  }

  async function favorite(id) {
    const note = await getById(id);
    if (!note) return;
    return update(id, { favorite: !note.favorite });
  }

  async function duplicate(id) {
    const note = await getById(id);
    if (!note) return null;
    return create({
      title:   note.title + ' (Salinan)',
      content: note.content,
      label:   note.label,
    });
  }

  async function setLabel(id, label) { return update(id, { label }); }

  async function lock(id, pin)  { return update(id, { locked: true,  lockPin: pin }); }
  async function unlock(id)     { return update(id, { locked: false, lockPin: '' });  }
  async function verifyPin(id, pin) {
    const note = await getById(id);
    return note && note.lockPin === pin;
  }

  async function setDeadline(id, isoString)   { return update(id, { deadline:   isoString || null }); }
  async function setReminderAt(id, isoString) { return update(id, { reminderAt: isoString || null }); }

  /* ── search ──────────────────────────────── */
  async function search(query, filters = {}) {
    let q = db()
      .from('notes')
      .select('*')
      .eq('hidden', false)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    if (filters.label && filters.label !== 'all') q = q.eq('label', filters.label);
    if (filters.pinned)   q = q.eq('pinned',   true);
    if (filters.favorite) q = q.eq('favorite', true);

    const { data, error } = await q;
    if (error) throw error;

    let results = data.map(_fromDb);
    if (query && query.trim()) {
      const lower = query.toLowerCase().trim();
      results = results.filter(n => {
        const text = (n.title + ' ' + _stripHtml(n.content)).toLowerCase();
        return text.includes(lower);
      });
    }
    return results;
  }

  /* ── getPriorityNotes ────────────────────── */
  async function getPriorityNotes() {
    // Reuse getAll() so we benefit from the cache — no extra DB query
    const all   = await getAll();
    const order = { hard: 0, medium: 1, easy: 2 };
    return all
      .filter(n => ['hard', 'medium'].includes(n.label))
      .sort((a, b) => (order[a.label] ?? 3) - (order[b.label] ?? 3))
      .slice(0, 2);
  }

  /* ── getTimeline ─────────────────────────── */
  async function getTimeline() {
    const notes = await getAll();
    const groups = {};
    notes.forEach(n => {
      const d   = new Date(n.updatedAt);
      const key = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });
    return groups;
  }

  /* ── count ───────────────────────────────── */
  async function count() {
    const { count: c, error } = await db()
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);
    if (error) return 0;
    return c || 0;
  }

  /* ── trashCount ──────────────────────────── */
  async function trashCount() {
    const { count: c, error } = await db()
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .not('deleted_at', 'is', null);
    if (error) return 0;
    return c || 0;
  }

  /* ── Note Versioning (localStorage) ─────── */
  const MAX_VERSIONS = 10;

  function _versionKey(id) { return `notara_ver_${id}`; }

  function saveVersion(id, title, content, label) {
    if (!id) return;
    try {
      const key     = _versionKey(id);
      const raw     = localStorage.getItem(key);
      const versions = raw ? JSON.parse(raw) : [];
      versions.unshift({ savedAt: new Date().toISOString(), title, content, label });
      if (versions.length > MAX_VERSIONS) versions.splice(MAX_VERSIONS);
      localStorage.setItem(key, JSON.stringify(versions));
    } catch (e) {
      console.warn('[Notara] saveVersion failed:', e);
    }
  }

  function getVersions(id) {
    if (!id) return [];
    try {
      const raw = localStorage.getItem(_versionKey(id));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _clearVersions(id) {
    try { localStorage.removeItem(_versionKey(id)); } catch {}
  }

  /* ── Export TXT ──────────────────────────── */
  async function exportTxt(id) {
    const note = await getById(id);
    if (!note) return;
    let text = `${note.title}\n${'='.repeat(note.title.length)}\n\n${_stripHtml(note.content)}`;
    if (note.deadline)   text += `\n\n— Tenggat: ${new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}`;
    if (note.reminderAt) text += `\n— Pengingat: ${new Date(note.reminderAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}`;
    _download(note.title + '.txt', text, 'text/plain');
  }

  /* ── Export PDF ──────────────────────────── */
  async function exportPdf(id) {
    const note = await getById(id);
    if (!note) return;
    const deadlineHtml = note.deadline
      ? `<div class="meta-extra"><i>⏳ Tenggat: ${new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</i></div>` : '';
    const reminderHtml = note.reminderAt
      ? `<div class="meta-extra"><i>🔔 Pengingat: ${new Date(note.reminderAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</i></div>` : '';

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"><title>${note.title}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; line-height: 1.8; color: #1a1b2e; }
        h1   { font-size: 2rem; margin-bottom: 0.5em; }
        .meta{ color: #888; font-size: 0.85rem; margin-bottom: 0.5em; }
        .meta-extra { color: #c05; font-size: 0.82rem; margin-bottom: 0.4em; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>${note.title}</h1>
      <div class="meta">Label: ${note.label} · ${new Date(note.updatedAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}</div>
      ${deadlineHtml}${reminderHtml}
      ${note.content}
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  /* ── Share ───────────────────────────────── */
  async function shareNote(id) {
    const note = await getById(id);
    if (!note) return;
    // Share via Web Share API or copy link
    const link = `${location.origin}${location.pathname}#read/${id}`;
    if (navigator.share) {
      navigator.share({ title: note.title, url: link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(link).then(() => {
        window.Notara.UI.toast('Link catatan disalin!', 'success');
      });
    }
  }

  function _download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ── Change listeners ────────────────────── */
  const _listeners = [];
  function _emitChange() { _listeners.forEach(fn => fn()); }
  function onChange(fn)  { _listeners.push(fn); }

  return {
    getAll, getById, create, update, remove,
    getTrash, restore, permanentDelete, trashCount,
    pin, favorite, duplicate, setLabel, lock, unlock, verifyPin,
    setDeadline, setReminderAt,
    search, getPriorityNotes, getTimeline,
    saveVersion, getVersions,
    exportTxt, exportPdf, shareNote,
    count, onChange,
  };
})();