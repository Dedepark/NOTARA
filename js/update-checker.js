/* js/update-checker.js — Realtime update version alert */
'use strict';
window.Notara = window.Notara || {};
(() => {
  const db = () => window.Notara.db;
  const STORAGE_KEY = 'notara_update_dismissed';
  let _channel = null;

  function _parseVersion(v) {
    return (v || '0.0.0').split('.').map(Number);
  }

  function _isNewer(latest, current) {
    const a = _parseVersion(latest);
    const b = _parseVersion(current);
    for (let i = 0; i < 3; i++) {
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return false;
  }

  function _isDismissed(version) {
    try { return localStorage.getItem(STORAGE_KEY) === version; } catch { return false; }
  }

  function _dismiss(version) {
    try { localStorage.setItem(STORAGE_KEY, version); } catch {}
  }

  async function _fetchConfig() {
    const { data, error } = await db()
      .from('app_config')
      .select('key, value')
      .in('key', ['latest_version', 'update_title', 'update_message']);
    if (error || !data) return null;
    const cfg = {};
    data.forEach(r => { cfg[r.key] = r.value; });
    return cfg;
  }

  function _showUpdateToast(cfg) {
    const title   = cfg.update_title   || 'Update Tersedia';
    const message = cfg.update_message || 'Versi baru tersedia.';

    window.Notara.UI.toast(
      `<div style="display:flex;flex-direction:column;gap:4px">
        <span style="font-weight:900">${title}</span>
        <span style="font-weight:400;font-size:0.8rem;opacity:0.9">${message}</span>
      </div>`,
      'info',
      8000
    );
  }

  async function checkForUpdate(silent) {
    try {
      const current = window.Notara.APP_VERSION || '0.0.0';
      const cfg = await _fetchConfig();
      if (!cfg || !cfg.latest_version) return false;

      if (_isNewer(cfg.latest_version, current)) {
        if (!_isDismissed(cfg.latest_version)) {
          _showUpdateToast(cfg);
        }
        return true;
      }
      if (!silent) {
        window.Notara.UI.toast('Kamu sudah menggunakan versi terbaru!', 'success');
      }
      return false;
    } catch (err) {
      console.warn('[Notara] Update check error:', err);
      if (!silent) {
        window.Notara.UI.toast('Gagal memeriksa update', 'error');
      }
      return false;
    }
  }

  function dismissCurrentVersion() {
    db().from('app_config').select('value').eq('key', 'latest_version').single()
      .then(({ data }) => { if (data) _dismiss(data.value); });
  }

  function startRealtime() {
    if (_channel) return;
    _channel = db().channel('app-config-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'app_config',
      }, (payload) => {
        if (payload.new?.key === 'latest_version') {
          const current = window.Notara.APP_VERSION || '0.0.0';
          if (_isNewer(payload.new.value, current)) {
            _fetchConfig().then(cfg => { if (cfg) _showUpdateToast(cfg); });
          }
        }
      })
      .subscribe();
  }

  function stopRealtime() {
    if (_channel) {
      db().removeChannel(_channel);
      _channel = null;
    }
  }

  window.Notara.UpdateChecker = {
    checkForUpdate,
    dismissCurrentVersion,
    startRealtime,
    stopRealtime,
  };
})();
