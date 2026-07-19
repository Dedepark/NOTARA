/* js/notes.js — Note CRUD via Notara.Data (offline-first) */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Notes = (() => {
  const Data = () => window.Notara.Data;

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

  /* ── In-Memory Cache ───────────────────── */
  let _cache   = null;
  let _cacheTs = 0;
  const _CACHE_TTL = 60_000;

  function _invalidateCache() { _cache = null; _cacheTs = 0; }
  function _patchCache(id, updated) {
    if (!_cache) return;
    const idx = _cache.findIndex(n => n.id === id);
    if (idx !== -1) _cache[idx] = updated;
    else            _cache.unshift(updated);
  }

  /* ── getAll ────────────────────────────── */
  async function getAll() {
    if (_cache && (Date.now() - _cacheTs) < _CACHE_TTL) return _cache;
    let all = await Data().notes.getAll();
    all = all.filter(n => !n.hidden);
    all.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    all.sort((a, b) => new Date(b.updated_at || b.updatedAt) - new Date(a.updated_at || a.updatedAt));
    _cache   = all;
    _cacheTs = Date.now();
    return _cache;
  }

  /* ── getById ───────────────────────────── */
  async function getById(id) {
    if (_cache) {
      const hit = _cache.find(n => n.id === id);
      if (hit) return hit;
    }
    return Data().notes.getById(id);
  }

  /* ── create ────────────────────────────── */
  async function create(data = {}) {
    const note = await Data().notes.create({
      title:      data.title      || 'Catatan baru',
      content:    data.content    || '',
      label:      data.label      || 'medium',
      pinned:     data.pinned     || false,
      favorite:   data.favorite   || false,
      deadline:   data.deadline   || null,
      reminderAt: data.reminderAt || null,
    });
    _invalidateCache();
    _emitChange();
    return note;
  }

  /* ── update ────────────────────────────── */
  async function update(id, changes = {}) {
    if (changes.content && !changes.title) {
      const current = await getById(id);
      if (current && (!current.title || current.title === 'Catatan baru')) {
        changes.title = _smartTitle(changes.content);
      }
    }
    const updated = await Data().notes.update(id, changes);
    _patchCache(id, updated);
    _emitChange();
    return updated;
  }

  /* ── remove (soft delete) ─────────────── */
  async function remove(id) {
    await Data().notes.remove(id);
    if (_cache) _cache = _cache.filter(n => n.id !== id);
    _emitChange();
    return true;
  }

  /* ── Trash ─────────────────────────────── */
  async function getTrash()      { return Data().notes.getTrash(); }
  async function restore(id)     { _invalidateCache(); _emitChange(); return Data().notes.restore(id); }
  async function permanentDelete(id) { _invalidateCache(); _emitChange(); return Data().notes.permanentDelete(id); }

  /* ── pin / favorite / duplicate ────────── */
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
    return create({ title: note.title + ' (Salinan)', content: note.content, label: note.label });
  }

  async function setLabel(id, label)    { return update(id, { label }); }
  async function lock(id, pin)          { return update(id, { locked: true, lockPin: pin }); }
  async function unlock(id)             { return update(id, { locked: false, lockPin: '' }); }
  async function verifyPin(id, pin) {
    const note = await getById(id);
    return note && note.lockPin === pin;
  }
  async function setDeadline(id, isoString)   { return update(id, { deadline: isoString || null }); }
  async function setReminderAt(id, isoString) { return update(id, { reminderAt: isoString || null }); }

  /* ── search ────────────────────────────── */
  async function search(query, filters = {}) {
    let results = await Data().notes.search(query, filters);
    results = results.filter(n => !n.hidden);
    results.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    return results;
  }

  /* ── getPriorityNotes ──────────────────── */
  async function getPriorityNotes() {
    const all   = await getAll();
    const order = { hard: 0, medium: 1, easy: 2 };
    return all
      .filter(n => ['hard', 'medium'].includes(n.label))
      .sort((a, b) => (order[a.label] ?? 3) - (order[b.label] ?? 3))
      .slice(0, 2);
  }

  /* ── getTimeline ───────────────────────── */
  async function getTimeline() {
    const notes  = await getAll();
    const groups = {};
    notes.forEach(n => {
      const d   = new Date(n.updated_at || n.updatedAt);
      const key = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });
    return groups;
  }

  /* ── count / trashCount ────────────────── */
  async function count()        { return Data().notes.count(); }
  async function trashCount()   { return Data().notes.trashCount(); }

  /* ── Note Versioning (localStorage) ────── */
  const MAX_VERSIONS = 10;
  function _versionKey(id) { return `notara_ver_${id}`; }

  function saveVersion(id, title, content, label) {
    if (!id) return;
    try {
      const key      = _versionKey(id);
      const raw      = localStorage.getItem(key);
      const versions = raw ? JSON.parse(raw) : [];
      versions.unshift({ savedAt: new Date().toISOString(), title, content, label });
      if (versions.length > MAX_VERSIONS) versions.splice(MAX_VERSIONS);
      localStorage.setItem(key, JSON.stringify(versions));
    } catch (e) { console.warn('[Notara] saveVersion failed:', e); }
  }

  function getVersions(id) {
    if (!id) return [];
    try { const raw = localStorage.getItem(_versionKey(id)); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  }

  function _clearVersions(id) {
    try { localStorage.removeItem(_versionKey(id)); } catch {}
  }

  /* ── Export TXT ────────────────────────── */
  async function exportTxt(id) {
    const note = await getById(id);
    if (!note) return;
    let text = `${note.title}\n${'='.repeat(note.title.length)}\n\n${_stripHtml(note.content)}`;
    if (note.deadline)   text += `\n\n— Tenggat: ${new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}`;
    if (note.reminderAt) text += `\n— Pengingat: ${new Date(note.reminderAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}`;
    _download(note.title + '.txt', text, 'text/plain');
  }

  /* ── Export PDF ────────────────────────── */
  async function exportPdf(id) {
    const note = await getById(id);
    if (!note) return;
    const deadlineHtml = note.deadline
      ? `<div class="meta-extra"><i><svg width="12" height="12" viewBox="0 0 512 512" style="vertical-align:-1px"><path fill="currentColor" d="M256 0C141.1 0 48 93.1 48 208v224c0 17.7 14.3 32 32 32h32c17.7 0 32-14.3 32-32V224h128v208c0 17.7 14.3 32 32 32h32c17.7 0 32-14.3 32-32V208C464 93.1 370.9 0 256 0zM96 208V48c0-26.5 21.5-48 48-48s48 21.5 48 48v160H96z"/></svg> Tenggat: ${new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</i></div>` : '';
    const reminderHtml = note.reminderAt
      ? `<div class="meta-extra"><i><svg width="12" height="12" viewBox="0 0 512 512" style="vertical-align:-1px"><path fill="currentColor" d="M224 0c-17.7 0-32 14.3-32 32V48H64C28.7 48 0 76.7 0 112v48l44.2 22.1c15.7 7.8 24 24.4 20.2 40.6l-4.7 20c16.3 11.3 34.8 18.7 55 21.5V288h256v-45.9c20.2-2.8 38.7-10.2 55-21.5l-4.7-20c-3.8-16.2 4.5-32.8 20.2-40.6L448 160v-48c0-35.3-28.7-64-64-64H320V32c0-17.7-14.3-32-32-32H224zM448 448H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h448c17.7 0 32-14.3 32-32v-32c0-35.3-28.7-64-64-64z"/></svg> Pengingat: ${new Date(note.reminderAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</i></div>` : '';
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
      <div class="meta">Label: ${note.label} · ${new Date(note.updated_at || note.updatedAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}</div>
      ${deadlineHtml}${reminderHtml}
      ${note.content}
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  /* ── Share ─────────────────────────────── */
  async function shareNote(id) {
    const note = await getById(id);
    if (!note) return;
    const link = `${location.origin}${location.pathname}#read/${id}`;
    if (navigator.share) { navigator.share({ title: note.title, url: link }).catch(() => {}); }
    else { navigator.clipboard.writeText(link).then(() => { window.Notara.UI.toast('Link catatan disalin!', 'success'); }); }
  }

  function _download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ── Change listeners ──────────────────── */
  const _listeners = [];
  function _emitChange() { _listeners.forEach(fn => fn()); }
  function onChange(fn)  { _listeners.push(fn); }
  function resetCache()  { _invalidateCache(); }

  return {
    getAll, getById, create, update, remove,
    getTrash, restore, permanentDelete, trashCount,
    pin, favorite, duplicate, setLabel, lock, unlock, verifyPin,
    setDeadline, setReminderAt,
    search, getPriorityNotes, getTimeline,
    saveVersion, getVersions,
    exportTxt, exportPdf, shareNote,
    count, onChange, resetCache,
  };
})();
