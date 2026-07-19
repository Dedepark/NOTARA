/* js/notes.js — Note CRUD via Supabase */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Notes = (() => {
  const db = () => window.Notara.db;
  const Auth = () => window.Notara.Auth;

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

  function _uuid() { return crypto.randomUUID(); }
  function _now()  { return new Date().toISOString(); }
  function _userId() { return Auth()?.getUser()?.id; }

  async function getAll() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data, error } = await db().from('notes')
      .select('*')
      .eq('user_id', uid)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    let notes = data || [];
    notes.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    return notes;
  }

  async function getById(id) {
    const { data, error } = await db().from('notes').select('*').eq('id', id);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  }

  async function create(data = {}) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const note = {
      id: _uuid(),
      user_id: uid,
      title: data.title || 'Catatan baru',
      content: data.content || '',
      label: data.label || 'medium',
      pinned: data.pinned || false,
      favorite: data.favorite || false,
      locked: false,
      lock_pin: '',
      hidden: false,
    };
    if (data.deadline)   note.deadline = data.deadline;
    if (data.reminderAt) note.reminder_at = data.reminderAt;
    const { error } = await db().from('notes').insert(note);
    if (error) throw error;
    return note;
  }

  async function update(id, changes = {}) {
    const updated = { ...changes, updated_at: _now() };
    const { error } = await db().from('notes').update(updated).eq('id', id);
    if (error) throw error;
    return { ...(await getById(id)) };
  }

  async function remove(id) {
    return update(id, { deleted_at: _now() });
  }

  async function getTrash() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data, error } = await db().from('notes')
      .select('*')
      .eq('user_id', uid)
      .not('deleted_at', 'is', null)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function restore(id) {
    return update(id, { deleted_at: null });
  }

  async function permanentDelete(id) {
    const { error } = await db().from('notes').delete().eq('id', id);
    if (error) throw error;
  }

  async function search(query, filters = {}) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    let queryBuilder = db().from('notes').select('*').eq('user_id', uid).is('deleted_at', null);
    if (query) {
      queryBuilder = queryBuilder.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
    }
    if (filters.label) {
      queryBuilder = queryBuilder.eq('label', filters.label);
    }
    if (filters.pinned) {
      queryBuilder = queryBuilder.eq('pinned', true);
    }
    if (filters.favorite) {
      queryBuilder = queryBuilder.eq('favorite', true);
    }
    const { data, error } = await queryBuilder.order('updated_at', { ascending: false });
    if (error) throw error;
    let notes = data || [];
    notes = notes.filter(n => !n.hidden);
    return notes;
  }

  async function count() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { count, error } = await db().from('notes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .is('deleted_at', null);
    if (error) throw error;
    return count || 0;
  }

  async function trashCount() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { count, error } = await db().from('notes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .not('deleted_at', 'is', null);
    if (error) throw error;
    return count || 0;
  }

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
  async function lock(id, pin)          { return update(id, { locked: true, lock_pin: pin }); }
  async function unlock(id)             { return update(id, { locked: false, lock_pin: '' }); }
  async function verifyPin(id, pin) {
    const note = await getById(id);
    return note && note.lock_pin === pin;
  }
  async function setDeadline(id, isoString)   { return update(id, { deadline: isoString || null }); }
  async function setReminderAt(id, isoString) { return update(id, { reminder_at: isoString || null }); }

  async function getPriorityNotes() {
    const all   = await getAll();
    const order = { hard: 0, medium: 1, easy: 2 };
    return all
      .filter(n => ['hard', 'medium'].includes(n.label))
      .sort((a, b) => (order[a.label] ?? 3) - (order[b.label] ?? 3))
      .slice(0, 2);
  }

  async function getTimeline() {
    const notes  = await getAll();
    const groups = {};
    notes.forEach(n => {
      const d   = new Date(n.updated_at);
      const key = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });
    return groups;
  }

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

  async function exportTxt(id) {
    const note = await getById(id);
    if (!note) return;
    let text = `${note.title}\n${'='.repeat(note.title.length)}\n\n${_stripHtml(note.content)}`;
    if (note.deadline)   text += `\n\n— Tenggat: ${new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}`;
    if (note.reminder_at) text += `\n— Pengingat: ${new Date(note.reminder_at).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}`;
    _download(note.title + '.txt', text, 'text/plain');
  }

  async function exportPdf(id) {
    const note = await getById(id);
    if (!note) return;
    const deadlineHtml = note.deadline
      ? `<div class="meta-extra"><i><svg width="12" height="12" viewBox="0 0 512 512" style="vertical-align:-1px"><path fill="currentColor" d="M256 0C141.1 0 48 93.1 48 208v224c0 17.7 14.3 32 32 32h32c17.7 0 32-14.3 32-32V224h128v208c0 17.7 14.3 32 32 32h32c17.7 0 32-14.3 32-32V208C464 93.1 370.9 0 256 0zM96 208V48c0-26.5 21.5-48 48-48s48 21.5 48 48v160H96z"/></svg> Tenggat: ${new Date(note.deadline).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</i></div>` : '';
    const reminderHtml = note.reminder_at
      ? `<div class="meta-extra"><i><svg width="12" height="12" viewBox="0 0 512 512" style="vertical-align:-1px"><path fill="currentColor" d="M224 0c-17.7 0-32 14.3-32 32V48H64C28.7 48 0 76.7 0 112v48l44.2 22.1c15.7 7.8 24 24.4 20.2 40.6l-4.7 20c16.3 11.3 34.8 18.7 55 21.5V288h256v-45.9c20.2-2.8 38.7-10.2 55-21.5l-4.7-20c-3.8-16.2 4.5-32.8 20.2-40.6L448 160v-48c0-35.3-28.7-64-64-64H320V32c0-17.7-14.3-32-32-32H224zM448 448H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h448c17.7 0 32-14.3 32-32v-32c0-35.3-28.7-64-64-64z"/></svg> Pengingat: ${new Date(note.reminder_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</i></div>` : '';
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
      <div class="meta">Label: ${note.label} · ${new Date(note.updated_at).toLocaleDateString('id-ID', { dateStyle: 'long' })}</div>
      ${deadlineHtml}${reminderHtml}
      ${note.content}
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

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

  const _listeners = [];
  function _emitChange() { _listeners.forEach(fn => fn()); }
  function onChange(fn)  { _listeners.push(fn); }
  function resetCache()  { _emitChange(); }

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
