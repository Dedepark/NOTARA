/* js/data.js — Offline-first data layer gateway */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Data = (() => {
  const IDB   = () => window.Notara.IDB;
  const Auth  = () => window.Notara.Auth;
  const Guest = () => window.Notara.Guest;

  const SYNC_MAX_RETRY = 3;

  function isOnline()  { return navigator.onLine; }
  function isGuest()   { return Auth().isGuest(); }
  function isLoggedIn(){ return Auth().isLoggedIn(); }
  function getUserId() { return Auth().getUser()?.id || Guest()?._getGuestId() || null; }

  function _now()      { return new Date().toISOString(); }
  function _uuid()     { return crypto.randomUUID(); }

  async function _ensureUser() {
    const uid = getUserId();
    if (!uid) throw new Error('User tidak teridentifikasi');
    return uid;
  }

  /* ── Helper: sync write ──────────────────── */
  async function _localWrite(store, data, op, recordId) {
    await IDB().put(store, data);
    await IDB().addToSyncQueue({
      table: store,
      op: op,
      record_id: recordId || data.id,
      data: data,
      user_id: data.user_id || getUserId(),
    });
  }

  async function _localDelete(store, id, userId) {
    await IDB().del(store, id);
    await IDB().addToSyncQueue({
      table: store,
      op: 'delete',
      record_id: id,
      data: null,
      user_id: userId || getUserId(),
    });
  }

  /* ── Notes ───────────────────────────────── */
  const notes = {
    async getAll() {
      const uid = await _ensureUser();
      const local = await IDB().getAllByIndex('notes', 'user_id', uid);
      if (isOnline() && isLoggedIn()) {
        try {
          const { data: remote } = await db().from('notes').select('*').eq('user_id', uid).is('deleted_at', null);
          if (remote) await _mergeNotes(uid, remote);
          return (await IDB().getAllByIndex('notes', 'user_id', uid)).filter(n => !n.deleted_at);
        } catch { /* offline fallback */ }
      }
      return local.filter(n => !n.deleted_at);
    },

    async getById(id) {
      return IDB().get('notes', id);
    },

    async create(data) {
      const uid = await _ensureUser();
      const note = {
        id: _uuid(),
        user_id: uid,
        title: data.title || '',
        content: data.content || '',
        label: data.label || null,
        pinned: data.pinned || false,
        favorite: data.favorite || false,
        locked: false,
        lock_pin: null,
        hidden: false,
        deadline: data.deadline || null,
        reminder_at: data.reminder_at || null,
        group_id: data.group_id || null,
        deleted_at: null,
        created_at: _now(),
        updated_at: _now(),
      };
      await _localWrite('notes', note, 'upsert', note.id);
      if (isOnline() && isLoggedIn()) {
        try { await db().from('notes').upsert(_toDb(note)); } catch {}
      }
      return note;
    },

    async update(id, changes) {
      const existing = await IDB().get('notes', id);
      if (!existing) throw new Error('Catatan tidak ditemukan');
      const updated = { ...existing, ...changes, updated_at: _now() };
      await _localWrite('notes', updated, 'upsert', id);
      if (isOnline() && isLoggedIn()) {
        try { await db().from('notes').update(_toDb(changes)).eq('id', id); } catch {}
      }
      return updated;
    },

    async remove(id) {
      return this.update(id, { deleted_at: _now() });
    },

    async getTrash() {
      const uid = await _ensureUser();
      const all = await IDB().getAllByIndex('notes', 'user_id', uid);
      return all.filter(n => n.deleted_at);
    },

    async restore(id) {
      return this.update(id, { deleted_at: null });
    },

    async permanentDelete(id) {
      await IDB().del('notes', id);
      await IDB().addToSyncQueue({ table: 'notes', op: 'delete', record_id: id, data: null, user_id: getUserId() });
      if (isOnline() && isLoggedIn()) {
        try { await db().from('notes').delete().eq('id', id); } catch {}
      }
    },

    async search(query, filters = {}) {
      let all = await this.getAll();
      if (filters.label)    all = all.filter(n => n.label === filters.label);
      if (filters.pinned)   all = all.filter(n => n.pinned);
      if (filters.favorite) all = all.filter(n => n.favorite);
      if (query) {
        const q = query.toLowerCase();
        all = all.filter(n => (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q));
      }
      return all;
    },

    async count() {
      const uid = await _ensureUser();
      const all = await IDB().getAllByIndex('notes', 'user_id', uid);
      return all.filter(n => !n.deleted_at).length;
    },

    async trashCount() {
      const uid = await _ensureUser();
      const all = await IDB().getAllByIndex('notes', 'user_id', uid);
      return all.filter(n => n.deleted_at).length;
    },
  };

  async function _mergeNotes(uid, remoteNotes) {
    const localNotes = await IDB().getAllByIndex('notes', 'user_id', uid);
    const localMap = {};
    localNotes.forEach(n => localMap[n.id] = n);
    const toUpsert = [];
    remoteNotes.forEach(r => {
      const l = localMap[r.id];
      if (!l || new Date(r.updated_at) > new Date(l.updated_at)) {
        toUpsert.push(_fromDb(r));
      }
    });
    if (toUpsert.length) await IDB().putAll('notes', toUpsert);
  }

  function _toDb(note) {
    const row = {};
    Object.keys(note).forEach(k => {
      if (k === 'userId') row.user_id = note[k];
      else if (k === 'createdAt') row.created_at = note[k];
      else if (k === 'updatedAt') row.updated_at = note[k];
      else if (k === 'deletedAt') row.deleted_at = note[k];
      else if (k === 'lockPin') row.lock_pin = note[k];
      else if (k === 'reminderAt') row.reminder_at = note[k];
      else if (k === 'groupId') row.group_id = note[k];
      else row[k] = note[k];
    });
    return row;
  }

  function _fromDb(row) {
    if (!row) return row;
    const note = {};
    Object.keys(row).forEach(k => {
      if (k === 'user_id') note.userId = row[k];
      else if (k === 'created_at') note.createdAt = row[k];
      else if (k === 'updated_at') note.updated_at = row[k];
      else if (k === 'deleted_at') note.deleted_at = row[k];
      else if (k === 'lock_pin') note.lockPin = row[k];
      else if (k === 'reminder_at') note.reminderAt = row[k];
      else if (k === 'group_id') note.groupId = row[k];
      else note[k] = row[k];
    });
    return note;
  }

  /* ── Mood ────────────────────────────────── */
  const mood = {
    async getToday() {
      const uid = await _ensureUser();
      const today = new Date().toISOString().slice(0, 10);
      const local = await IDB().getAllByIndex('mood', 'user_id', uid);
      return local.find(m => m.date === today) || null;
    },

    async getHistory(days = 7) {
      const uid = await _ensureUser();
      const all = await IDB().getAllByIndex('mood', 'user_id', uid);
      const since = new Date();
      since.setDate(since.getDate() - days);
      return all.filter(m => new Date(m.date) >= since).sort((a, b) => a.date.localeCompare(b.date));
    },

    async save(moodValue, triggers, note) {
      const uid = await _ensureUser();
      const today = new Date().toISOString().slice(0, 10);
      const existing = await this.getToday();
      const entry = {
        id: existing?.id || _uuid(),
        user_id: uid,
        date: today,
        mood: moodValue,
        triggers: triggers || [],
        note: note || null,
        created_at: existing?.created_at || _now(),
        updated_at: _now(),
      };
      await _localWrite('mood', entry, 'upsert', entry.id);
      if (isOnline() && isLoggedIn()) {
        try { await db().from('mood_entries').upsert(entry, { onConflict: 'user_id,date' }); } catch {}
      }
      return entry;
    },

    async remove() {
      const uid = await _ensureUser();
      const today = new Date().toISOString().slice(0, 10);
      const existing = await this.getToday();
      if (existing) {
        await IDB().del('mood', existing.id);
        await IDB().addToSyncQueue({ table: 'mood', op: 'delete', record_id: existing.id, data: null, user_id: uid });
        if (isOnline() && isLoggedIn()) {
          try { await db().from('mood_entries').delete().eq('user_id', uid).eq('date', today); } catch {}
        }
      }
    },
  };

  /* ── Habits ──────────────────────────────── */
  const habits = {
    async getAll() {
      const uid = await _ensureUser();
      return (await IDB().getAllByIndex('habit_lists', 'user_id', uid)).filter(h => h.active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },

    async create(name) {
      const uid = await _ensureUser();
      const all = await this.getAll();
      const list = {
        id: _uuid(),
        user_id: uid,
        name: name,
        active: true,
        sort_order: all.length,
        created_at: _now(),
        updated_at: _now(),
      };
      await _localWrite('habit_lists', list, 'upsert', list.id);
      if (isOnline() && isLoggedIn()) {
        try { await db().from('habit_lists').upsert(list); } catch {}
      }
      return list;
    },

    async update(id, changes) {
      const existing = await IDB().get('habit_lists', id);
      if (!existing) throw new Error('Kebiasaan tidak ditemukan');
      const updated = { ...existing, ...changes, updated_at: _now() };
      await _localWrite('habit_lists', updated, 'upsert', id);
      if (isOnline() && isLoggedIn()) {
        try { await db().from('habit_lists').update(changes).eq('id', id); } catch {}
      }
      return updated;
    },

    async remove(id) {
      return this.update(id, { active: false });
    },

    async getTodayLogs() {
      const uid = await _ensureUser();
      const today = new Date().toISOString().slice(0, 10);
      const all = await IDB().getAllByIndex('habit_logs', 'user_id', uid);
      return all.filter(l => l.date === today);
    },

    async toggleLog(habitId, date) {
      const uid = await _ensureUser();
      const all = await IDB().getAllByIndex('habit_logs', 'user_id', uid);
      const existing = all.find(l => l.habitId === habitId && l.date === date);
      if (existing) {
        existing.completed = !existing.completed;
        existing.updated_at = _now();
        await _localWrite('habit_logs', existing, 'upsert', existing.id);
        if (isOnline() && isLoggedIn()) {
          try { await db().from('habit_logs').update({ completed: existing.completed }).eq('id', existing.id); } catch {}
        }
        return existing;
      } else {
        const log = { id: _uuid(), habit_id: habitId, user_id: uid, date: date, completed: true, created_at: _now(), updated_at: _now() };
        await _localWrite('habit_logs', log, 'upsert', log.id);
        if (isOnline() && isLoggedIn()) {
          try { await db().from('habit_logs').upsert(log); } catch {}
        }
        return log;
      }
    },

    async getStreak(habitId) {
      const all = await IDB().getAll('habit_logs');
      const logs = all.filter(l => l.habit_id === habitId && l.completed).sort((a, b) => b.date.localeCompare(a.date));
      let streak = 0;
      let check = new Date();
      for (const log of logs) {
        const logDate = log.date;
        const checkStr = check.toISOString().slice(0, 10);
        if (logDate === checkStr) { streak++; check.setDate(check.getDate() - 1); }
        else if (logDate < checkStr) break;
      }
      return streak;
    },

    async getCompletionRate(habitId, days = 7) {
      const all = await IDB().getAll('habit_logs');
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().slice(0, 10);
      const logs = all.filter(l => l.habit_id === habitId && l.date >= sinceStr);
      const completed = logs.filter(l => l.completed).length;
      return days > 0 ? Math.round((completed / days) * 100) : 0;
    },
  };

  /* ── Finance ─────────────────────────────── */
  const finance = {
    async getByMonth(year, month) {
      const uid = await _ensureUser();
      const all = await IDB().getAllByIndex('finance_tx', 'user_id', uid);
      return all.filter(t => {
        const d = new Date(t.transaction_date);
        return d.getFullYear() === year && d.getMonth() === month;
      }).sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
    },

    async getCategories() {
      const uid = await _ensureUser();
      return (await IDB().getAllByIndex('finance_cat', 'user_id', uid)).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },

    async addTransaction(data) {
      const uid = await _ensureUser();
      const tx = {
        id: _uuid(),
        user_id: uid,
        type: data.type,
        category: data.category,
        amount: data.amount,
        description: data.description || null,
        transaction_date: data.transaction_date || _now().slice(0, 10),
        created_at: _now(),
        updated_at: _now(),
      };
      await _localWrite('finance_tx', tx, 'upsert', tx.id);
      if (isOnline() && isLoggedIn()) {
        try { await db().from('finance_transactions').upsert(tx); } catch {}
      }
      return tx;
    },

    async removeTransaction(id) {
      await IDB().del('finance_tx', id);
      await IDB().addToSyncQueue({ table: 'finance_tx', op: 'delete', record_id: id, data: null, user_id: getUserId() });
      if (isOnline() && isLoggedIn()) {
        try { await db().from('finance_transactions').delete().eq('id', id); } catch {}
      }
    },
  };

  /* ── Tags ────────────────────────────────── */
  const tags = {
    async getAll() {
      const uid = await _ensureUser();
      return IDB().getAllByIndex('tags', 'user_id', uid);
    },

    async create(name, color) {
      const uid = await _ensureUser();
      const tag = { id: _uuid(), user_id: uid, name: name, color: color || '#8b5cf6', created_at: _now(), updated_at: _now() };
      await _localWrite('tags', tag, 'upsert', tag.id);
      if (isOnline() && isLoggedIn()) {
        try { await db().from('tags').upsert(tag); } catch {}
      }
      return tag;
    },

    async update(id, changes) {
      const existing = await IDB().get('tags', id);
      if (!existing) throw new Error('Tag tidak ditemukan');
      const updated = { ...existing, ...changes, updated_at: _now() };
      await _localWrite('tags', updated, 'upsert', id);
      if (isOnline() && isLoggedIn()) {
        try { await db().from('tags').update(changes).eq('id', id); } catch {}
      }
      return updated;
    },

    async remove(id) {
      await IDB().del('tags', id);
      await IDB().addToSyncQueue({ table: 'tags', op: 'delete', record_id: id, data: null, user_id: getUserId() });
      if (isOnline() && isLoggedIn()) {
        try { await db().from('tags').delete().eq('id', id); } catch {}
      }
    },

    async getNoteTags(noteId) {
      const all = await IDB().getAll('note_tags');
      return all.filter(nt => nt.note_id === noteId);
    },

    async setNoteTags(noteId, tagIds) {
      const existing = await IDB().getAll('note_tags');
      const toRemove = existing.filter(nt => nt.note_id === noteId);
      for (const r of toRemove) await IDB().del('note_tags', [r.note_id, r.tag_id]);
      for (const tid of tagIds) {
        const rel = { note_id: noteId, tag_id: tid, _synced: false };
        await IDB().put('note_tags', rel);
        await IDB().addToSyncQueue({ table: 'note_tags', op: 'upsert', record_id: `${noteId}:${tid}`, data: rel, user_id: getUserId() });
      }
      if (isOnline() && isLoggedIn()) {
        try {
          await db().from('note_tags').delete().eq('note_id', noteId);
          if (tagIds.length) await db().from('note_tags').insert(tagIds.map(tid => ({ note_id: noteId, tag_id: tid })));
        } catch {}
      }
    },
  };

  /* ── Sync Engine ─────────────────────────── */
  const sync = {
    async process() {
      if (!isOnline() || !isLoggedIn()) return;
      const queue = await IDB().getSyncQueue();
      const pending = queue.filter(q => !q.synced);
      for (const entry of pending) {
        try {
          if (entry.op === 'upsert' && entry.data) {
            const tableMap = {
              notes: 'notes', mood: 'mood', habit_lists: 'habit_lists',
              habit_logs: 'habit_logs', finance_tx: 'finance_transactions',
              finance_cat: 'finance_categories', tags: 'tags',
              note_tags: 'note_tags',
            };
            const remoteTable = tableMap[entry.table] || entry.table;
            await db().from(remoteTable).upsert(entry.data);
          } else if (entry.op === 'delete') {
            const tableMap = {
              notes: 'notes', mood: 'mood_entries', habit_lists: 'habit_lists',
              habit_logs: 'habit_logs', finance_tx: 'finance_transactions',
              finance_cat: 'finance_categories', tags: 'tags',
              note_tags: 'note_tags',
            };
            const remoteTable = tableMap[entry.table] || entry.table;
            await db().from(remoteTable).delete().eq('id', entry.record_id);
          }
          await IDB().removeFromSyncQueue(entry.id);
        } catch (err) {
          console.warn('[Data] Sync entry failed:', entry, err);
        }
      }
    },

    async pull() {
      if (!isOnline() || !isLoggedIn()) return;
      const uid = getUserId();
      const tables = [
        { local: 'notes', remote: 'notes', filter: { user_id: uid } },
        { local: 'mood', remote: 'mood_entries', filter: { user_id: uid } },
        { local: 'habit_lists', remote: 'habit_lists', filter: { user_id: uid } },
        { local: 'habit_logs', remote: 'habit_logs', filter: { user_id: uid } },
        { local: 'finance_tx', remote: 'finance_transactions', filter: { user_id: uid } },
        { local: 'finance_cat', remote: 'finance_categories', filter: { user_id: uid } },
        { local: 'tags', remote: 'tags', filter: { user_id: uid } },
      ];
      for (const t of tables) {
        try {
          let query = db().from(t.remote).select('*');
          Object.keys(t.filter).forEach(k => { query = query.eq(k, t.filter[k]); });
          const { data: rows } = await query;
          if (rows && rows.length) await IDB().putAll(t.local, rows);
        } catch {}
      }
    },

    async full() {
      if (!isOnline() || !isLoggedIn()) return;
      await this.pull();
      await this.process();
    },

    async mergeGuestData(newUserId) {
      const guestId = Guest()?._getGuestId();
      if (!guestId) return;
      const stores = ['notes', 'mood', 'habit_lists', 'habit_logs', 'finance_tx', 'finance_cat', 'tags'];
      for (const store of stores) {
        const items = await IDB().getAll(store);
        const guestItems = items.filter(i => i.user_id === guestId);
        for (const item of guestItems) {
          item.user_id = newUserId;
          item.updated_at = _now();
          await IDB().put(store, item);
        }
      }
      await this.full();
    },
  };

  const db = () => window.Notara.db;

  return { isOnline, isGuest, isLoggedIn, getUserId, notes, mood, habits, finance, tags, sync };
})();
