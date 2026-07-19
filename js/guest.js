/* js/guest.js — Guest mode handler */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Guest = (() => {
  const STORAGE_KEY = 'notara_guest_id';
  const ONLINE_FEATURES = ['posts', 'messages', 'cs_panel', 'comments'];

  function _getGuestId() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  function isGuestMode() {
    const Auth = window.Notara.Auth;
    return !Auth?.isLoggedIn() && !!localStorage.getItem(STORAGE_KEY);
  }

  function canAccess(feature) {
    if (!isGuestMode()) return true;
    return !ONLINE_FEATURES.includes(feature);
  }

  function enterGuestMode() {
    const Auth = window.Notara.Auth;
    if (Auth) Auth._setGuestMode(true);
  }

  function clearGuestData() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return { _getGuestId, isGuestMode, canAccess, enterGuestMode, clearGuestData };
})();
