/* Junior tracker — renders the team roster from data and lets one member claim
   Junior. The selection is single-select and persisted in localStorage.
   
   If a junior-override.json exists (site-deployed), it acts as a default:
   - If user hasn't selected since override was set, override is used.
   - If user selected after override was set, their selection takes priority.
*/
(function () {
  'use strict';

  var STORAGE_KEY = 'nsh-junior-holder';
  var STORAGE_TIMESTAMP_KEY = 'nsh-junior-holder-at';
  var ROSTER_URL = '/data/13343/roster.json';
  var OVERRIDE_URL = '/data/junior-override.json';

  function readSaved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function readSavedTimestamp() {
    try { return localStorage.getItem(STORAGE_TIMESTAMP_KEY); } catch (e) { return null; }
  }

  function writeSaved(name) {
    try {
      var now = new Date().toISOString();
      if (name) {
        localStorage.setItem(STORAGE_KEY, name);
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      }
    } catch (e) {
      /* storage unavailable (e.g. private mode) — selection still works for the session */
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function resolveSelected(override) {
    var saved = readSaved();
    var savedTimestamp = readSavedTimestamp();

    // If no override, use saved selection
    if (!override || !override.name) return saved;

    // If user has a saved selection
    if (saved && savedTimestamp) {
      // If user selected after override was set, use their selection
      if (new Date(savedTimestamp) > new Date(override.setAt)) {
        return saved;
      }
    }

    // Otherwise use override
    return override.name;
  }

  function render(list, names, override) {
    var selected = resolveSelected(override);
    list.innerHTML = names.map(function (name) {
      var on = name === selected;
      var safe = escapeHtml(name);
      return '<li><button type="button" class="junior-name' +
        (on ? ' is-selected' : '') + '" data-name="' + safe +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' + safe + '</button></li>';
    }).join('');
  }

  function wire(list) {
    list.addEventListener('click', function (evt) {
      var btn = evt.target.closest('.junior-name');
      if (!btn || !list.contains(btn)) return;

      var buttons = list.querySelectorAll('.junior-name');
      var turningOn = !btn.classList.contains('is-selected');
      buttons.forEach(function (b) {
        var on = turningOn && b === btn;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      writeSaved(turningOn ? btn.dataset.name : null);
    });
  }

  function init() {
    var list = document.getElementById('junior-list');
    if (!list) return;

    Promise.all([
      fetch(ROSTER_URL, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }),
      fetch(OVERRIDE_URL, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) return null;
          return r.json();
        })
        .catch(function () { return null; })
    ])
      .then(function (results) {
        var data = results[0];
        var override = results[1];
        
        var names = (data.players || [])
          .map(function (p) { return p.name; })
          .filter(Boolean)
          .sort(function (a, b) { return a.localeCompare(b); });
        if (!names.length) {
          list.innerHTML = '<li class="junior-status">No roster available.</li>';
          return;
        }
        render(list, names, override);
        wire(list);
      })
      .catch(function (err) {
        list.innerHTML = '<li class="junior-status">Couldn\u2019t load the roster.</li>';
        if (window.console) console.warn('[junior] load failed:', err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
