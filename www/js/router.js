/* js/router.js — Hash-based SPA router */
'use strict';

window.Notara = window.Notara || {};

window.Notara.Router = (() => {
  const routes = {};
  let _current = null;
  let _params  = {};

  function on(path, handler) { routes[path] = handler; }

  function go(path) {
    const target = '#' + path;
    if (window.location.hash === target) {
      // Same hash: force re-resolve so content always reflects the route
      _resolve();
    } else {
      window.location.hash = path;
    }
  }

  function params()  { return { ..._params }; }
  function current() { return _current; }

  function _resolve() {
    const hash = window.location.hash.slice(1) || 'home';
    let matched = null;
    let matchedParams = {};

    if (routes[hash]) {
      matched = hash;
    } else {
      for (const pattern of Object.keys(routes)) {
        const regex = new RegExp('^' + pattern.replace(/:([^/]+)/g, '([^/]+)') + '$');
        const m = hash.match(regex);
        if (m) {
          matched = pattern;
          const paramNames = [...pattern.matchAll(/:([^/]+)/g)].map(x => x[1]);
          paramNames.forEach((name, i) => { matchedParams[name] = m[i + 1]; });
          break;
        }
      }
    }

    if (!matched) { matched = 'home'; matchedParams = {}; }

    _current = matched;
    _params  = matchedParams;

    if (routes[matched]) routes[matched](matchedParams, hash);
  }

  function init() {
    window.addEventListener('hashchange', _resolve);
    _resolve();
  }

  function back() { history.back(); }

  return { on, go, params, current, init, back };
})();