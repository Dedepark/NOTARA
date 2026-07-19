/* js/tags.js — Custom Tags untuk Notes */
'use strict';
window.Notara = window.Notara || {};
window.Notara.Tags = (() => {
  const db   = () => window.Notara.db;
  const Auth = () => window.Notara.Auth;

  const PRESET_COLORS = [
    '#7c3aed', '#0891b2', '#dc2626', '#d97706',
    '#db2777', '#65a30d', '#2563eb', '#6d28d9',
    '#ea580c', '#059669', '#e11d48', '#4f46e5',
  ];

  function getPresetColors() { return PRESET_COLORS; }
  function _userId() { return Auth()?.getUser()?.id; }
  function _uuid() { return crypto.randomUUID(); }
  function _now()  { return new Date().toISOString(); }

  async function getAll() {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data, error } = await db().from('tags')
      .select('*')
      .eq('user_id', uid);
    if (error) throw error;
    return data || [];
  }

  async function create(name, color) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const tag = {
      id: _uuid(),
      user_id: uid,
      name: name.trim(),
      color: color || PRESET_COLORS[0],
      created_at: _now(),
    };
    const { error } = await db().from('tags').insert(tag);
    if (error) throw error;
    return tag;
  }

  async function update(id, changes) {
    const { error } = await db().from('tags').update(changes).eq('id', id);
    if (error) throw error;
    return updated;
  }

  async function remove(id) {
    const { error } = await db().from('tags').delete().eq('id', id);
    if (error) throw error;
  }

  async function getNoteTags(noteId) {
    if (!noteId) return [];
    const { data: rels, error: relErr } = await db().from('note_tags')
      .select('*')
      .eq('note_id', noteId);
    if (relErr) throw relErr;
    if (!rels || !rels.length) return [];
    const all = await getAll();
    const byId = {};
    all.forEach(t => byId[t.id] = t);
    return rels.map(r => byId[r.tag_id]).filter(Boolean);
  }

  async function getTagsForNotes(noteIds) {
    if (!noteIds || !noteIds.length) return {};
    const all = await getAll();
    const byId = {};
    all.forEach(t => byId[t.id] = t);
    const { data: allRels, error } = await db().from('note_tags').select('*');
    if (error) throw error;
    const relsByNote = {};
    (allRels || []).forEach(r => {
      if (!relsByNote[r.note_id]) relsByNote[r.note_id] = [];
      relsByNote[r.note_id].push(r);
    });
    const map = {};
    noteIds.forEach(nid => {
      const rels = relsByNote[nid] || [];
      map[nid] = rels.map(r => byId[r.tag_id]).filter(Boolean);
    });
    return map;
  }

  async function setNoteTags(noteId, tagIds = []) {
    const { error: delErr } = await db().from('note_tags').delete().eq('note_id', noteId);
    if (delErr) throw delErr;
    if (tagIds.length) {
      const rows = tagIds.map(tid => ({ note_id: noteId, tag_id: tid }));
      const { error: insErr } = await db().from('note_tags').insert(rows);
      if (insErr) throw insErr;
    }
  }

  async function getNotesByTag(tagId) {
    const uid = _userId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    const { data: rels, error: relErr } = await db().from('note_tags')
      .select('*')
      .eq('tag_id', tagId);
    if (relErr) throw relErr;
    if (!rels || !rels.length) return [];
    const noteIds = rels.map(r => r.note_id);
    const { data: notes, error: noteErr } = await db().from('notes')
      .select('*')
      .in('id', noteIds)
      .eq('user_id', uid)
      .is('deleted_at', null);
    if (noteErr) throw noteErr;
    return (notes || []).filter(n => !n.hidden);
  }

  return {
    getPresetColors,
    getAll, create, update, remove,
    getNoteTags, getTagsForNotes, setNoteTags,
    getNotesByTag,
  };
})();
