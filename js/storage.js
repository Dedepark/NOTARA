/* js/storage.js — localStorage untuk pengaturan lokal saja */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Storage = (() => {
  const PREFIX = 'notara_';

  function _key(k) { return PREFIX + k; }

  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(_key(key));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  }

  function set(key, value) {
    try {
      localStorage.setItem(_key(key), JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[Notara:Storage] set failed', e);
      return false;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(_key(key)); return true; }
    catch { return false; }
  }

  function clear(prefix = '') {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }

  return { get, set, remove, clear };
})();