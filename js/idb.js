/* js/idb.js — IndexedDB wrapper untuk offline-first */
'use strict';

window.Notara = window.Notara || {};

window.Notara.IDB = (() => {
  const DB_NAME = 'notara-offline-v1';
  const DB_VERSION = 1;
  let _db = null;
  let _ready = false;

  const STORES = {
    notes:        { keyPath: 'id', indexes: [{ name: 'user_id' }, { name: 'updated_at' }] },
    mood:         { keyPath: 'id', indexes: [{ name: 'user_id' }, { name: 'date' }] },
    habit_lists:  { keyPath: 'id', indexes: [{ name: 'user_id' }] },
    habit_logs:   { keyPath: 'id', indexes: [{ name: 'habit_id' }, { name: 'date' }] },
    finance_tx:   { keyPath: 'id', indexes: [{ name: 'user_id' }, { name: 'transaction_date' }] },
    finance_cat:  { keyPath: 'id', indexes: [{ name: 'user_id' }] },
    tags:         { keyPath: 'id', indexes: [{ name: 'user_id' }] },
    note_tags:    { keyPath: null, indexes: [{ name: 'note_id' }, { name: 'tag_id' }] },
    sync_queue:   { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'table' }, { name: 'synced' }] },
  };

  function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        Object.keys(STORES).forEach(name => {
          const cfg = STORES[name];
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, {
              keyPath: cfg.keyPath,
              autoIncrement: cfg.autoIncrement || false,
            });
            (cfg.indexes || []).forEach(idx => {
              store.createIndex(idx.name, idx.name, { unique: false });
            });
          }
        });
      };

      req.onsuccess = e => {
        _db = e.target.result;
        _ready = true;
        resolve();
      };

      req.onerror = e => {
        console.warn('[IDB] Open error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  function isReady() { return _ready; }

  function _tx(store, mode) {
    const tx = _db.transaction(store, mode);
    return tx.objectStore(store);
  }

  function _promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAll(store) {
    return _promisify(_tx(store, 'readonly').getAll());
  }

  function get(store, key) {
    return _promisify(_tx(store, 'readonly').get(key));
  }

  function put(store, data) {
    if (data && !data.updated_at) data.updated_at = new Date().toISOString();
    return _promisify(_tx(store, 'readwrite').put(data));
  }

  function putAll(store, items) {
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      items.forEach(item => {
        if (!item.updated_at) item.updated_at = new Date().toISOString();
        s.put(item);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function del(store, key) {
    return _promisify(_tx(store, 'readwrite').delete(key));
  }

  function clear(store) {
    return _promisify(_tx(store, 'readwrite').clear());
  }

  function getAllByIndex(store, indexName, value) {
    const s = _tx(store, 'readonly');
    const idx = s.index(indexName);
    return _promisify(idx.getAll(value));
  }

  function count(store) {
    return _promisify(_tx(store, 'readonly').count());
  }

  function addToSyncQueue(entry) {
    entry.synced = false;
    entry.timestamp = entry.timestamp || new Date().toISOString();
    return put('sync_queue', entry);
  }

  function getSyncQueue() {
    return getAll('sync_queue');
  }

  function removeFromSyncQueue(id) {
    return del('sync_queue', id);
  }

  function clearSyncQueue() {
    return clear('sync_queue');
  }

  return {
    init, isReady,
    getAll, get, put, putAll, del, clear,
    getAllByIndex, count,
    addToSyncQueue, getSyncQueue, removeFromSyncQueue, clearSyncQueue,
  };
})();
