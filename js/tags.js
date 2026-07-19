/* js/tags.js — Custom Tags untuk Notes (offline-first) */
'use strict';
window.Notara = window.Notara || {};
window.Notara.Tags = (() => {
  const Data = () => window.Notara.Data;
  const IDB  = () => window.Notara.IDB;

  const PRESET_COLORS = [
    '#7c3aed', '#0891b2', '#dc2626', '#d97706',
    '#db2777', '#65a30d', '#2563eb', '#6d28d9',
    '#ea580c', '#059669', '#e11d48', '#4f46e5',
  ];

  function getPresetColors() { return PRESET_COLORS; }

  /* ── Data operations ───────────────────── */
  async function getAll()            { return Data().tags.getAll(); }
  async function create(name, color) { return Data().tags.create(name, color || PRESET_COLORS[0]); }
  async function update(id, name, color) { return Data().tags.update(id, { name: name.trim(), color }); }
  async function remove(id)          { return Data().tags.remove(id); }

  async function getNoteTags(noteId) {
    if (!noteId) return [];
    const rels  = await Data().tags.getNoteTags(noteId);
    const all   = await getAll();
    const byId  = {};
    all.forEach(t => byId[t.id] = t);
    return rels.map(r => byId[r.tag_id]).filter(Boolean);
  }

  async function getTagsForNotes(noteIds) {
    if (!noteIds || !noteIds.length) return {};
    const all  = await getAll();
    const byId = {};
    all.forEach(t => byId[t.id] = t);

    const map = {};
    for (const nid of noteIds) {
      const rels = await Data().tags.getNoteTags(nid);
      map[nid] = rels.map(r => byId[r.tag_id]).filter(Boolean);
    }
    return map;
  }

  async function setNoteTags(noteId, tagIds = []) {
    return Data().tags.setNoteTags(noteId, tagIds);
  }

  async function getNotesByTag(tagId) {
    const allNotes   = await Data().notes.getAll();
    const allRels    = await IDB().getAll('note_tags');
    const matchingNoteIds = allRels.filter(r => r.tag_id === tagId).map(r => r.note_id);
    return allNotes.filter(n => matchingNoteIds.includes(n.id) && !n.deleted_at && !n.hidden);
  }

  return {
    getPresetColors,
    getAll, create, update, remove,
    getNoteTags, getTagsForNotes, setNoteTags,
    getNotesByTag,
  };
})();
