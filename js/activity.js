/* js/activity.js — User writing activity (heatmap & stats) via Supabase */
'use strict';
window.Notara = window.Notara || {};
window.Notara.Activity = (() => {
  const db = () => window.Notara.db;

  function _userId() { return window.Notara.Auth.getUser()?.id; }

  /* ── Upsert activity (insert atau update jika sudah ada) ── */
  async function trackWords(words) {
    if (words <= 0) return;
    const uid = _userId();
    if (!uid) return;
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await db()
      .from('user_activity')
      .upsert({
        user_id: uid,
        activity_date: today,
        words: words,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,activity_date' });
    if (error) console.warn('[Notara] Activity track error:', error.message);
  }

  /* ── Ambil activity dalam rentang tanggal ── */
  async function getRange(startDate, endDate) {
    const uid = _userId();
    if (!uid) return [];
    const { data, error } = await db()
      .from('user_activity')
      .select('activity_date, words')
      .eq('user_id', uid)
      .gte('activity_date', startDate)
      .lte('activity_date', endDate)
      .order('activity_date', { ascending: true });
    if (error) return [];
    return data || [];
  }

  /* ── Ambil semua activity (untuk heatmap) ── */
  async function getAll() {
    const uid = _userId();
    if (!uid) return [];
    const { data, error } = await db()
      .from('user_activity')
      .select('activity_date, words')
      .eq('user_id', uid)
      .order('activity_date', { ascending: true });
    if (error) return [];
    return data || [];
  }

  /* ── Convert array ke map { 'YYYY-MM-DD': words } ── */
  function toMap(rows) {
    const map = {};
    rows.forEach(r => { map[r.activity_date] = r.words; });
    return map;
  }

  return { trackWords, getRange, getAll, toMap };
})();
