/* js/tags.js — Custom Tags untuk Notes */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Tags = (() => {
  const db = () => window.Notara.db;

  const PRESET_COLORS = [
    '#7c3aed', '#0891b2', '#dc2626', '#d97706',
    '#db2777', '#65a30d', '#2563eb', '#6d28d9',
    '#ea580c', '#059669', '#e11d48', '#4f46e5',
  ];

  function getPresetColors() { return PRESET_COLORS; }

  /* ── Semua tag milik user ─────────────────── */
  async function getAll() {
    const userId = window.Notara.Auth.getUser()?.id;
    const { data, error } = await db()
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  /* ── Buat tag baru ────────────────────────── */
  async function create(name, color = PRESET_COLORS[0]) {
    const userId = window.Notara.Auth.getUser()?.id;
    if (!userId) throw new Error('Not authenticated');
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Nama tag tidak boleh kosong');
    const { data, error } = await db()
      .from('tags')
      .insert({ user_id: userId, name: trimmed, color })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* ── Update tag ───────────────────────────── */
  async function update(id, name, color) {
    const { data, error } = await db()
      .from('tags')
      .update({ name: name.trim(), color })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /* ── Hapus tag ────────────────────────────── */
  async function remove(id) {
    const { error } = await db()
      .from('tags')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  }

  /* ── Ambil tag untuk satu note ────────────── */
  async function getNoteTags(noteId) {
    if (!noteId) return [];
    const { data, error } = await db()
      .from('note_tags')
      .select('tags(id, name, color)')
      .eq('note_id', noteId);
    if (error) return [];
    return data.map(r => r.tags).filter(Boolean);
  }

  /* ── Ambil tags untuk banyak note sekaligus ─ */
  async function getTagsForNotes(noteIds) {
    if (!noteIds || !noteIds.length) return {};
    const { data, error } = await db()
      .from('note_tags')
      .select('note_id, tags(id, name, color)')
      .in('note_id', noteIds);
    if (error) return {};
    const map = {};
    (data || []).forEach(r => {
      if (!r.tags) return;
      if (!map[r.note_id]) map[r.note_id] = [];
      map[r.note_id].push(r.tags);
    });
    return map;
  }

  /* ── Set tags untuk note (ganti semua) ──────── */
  async function setNoteTags(noteId, tagIds = []) {
    await db().from('note_tags').delete().eq('note_id', noteId);
    if (!tagIds.length) return;
    const rows = tagIds.map(tid => ({ note_id: noteId, tag_id: tid }));
    const { error } = await db().from('note_tags').insert(rows);
    if (error) throw error;
  }

  /* ── Ambil note-note yang punya tag tertentu ─ */
  async function getNotesByTag(tagId) {
    const userId = window.Notara.Auth.getUser()?.id;
    const { data: refs, error: e1 } = await db()
      .from('note_tags')
      .select('note_id')
      .eq('tag_id', tagId);
    if (e1 || !refs?.length) return [];

    const noteIds = refs.map(r => r.note_id);
    const { data: notes, error: e2 } = await db()
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .in('id', noteIds)
      .is('deleted_at', null)
      .eq('hidden', false)
      .order('updated_at', { ascending: false });
    if (e2) return [];
    // Map via _fromDb pattern (inline since Notes module not accessible here)
    return (notes || []).map(row => ({
      id:        row.id,
      title:     row.title,
      content:   row.content,
      label:     row.label,
      pinned:    row.pinned,
      favorite:  row.favorite,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }));
  }

  return {
    getPresetColors,
    getAll, create, update, remove,
    getNoteTags, getTagsForNotes, setNoteTags,
    getNotesByTag,
  };
})();